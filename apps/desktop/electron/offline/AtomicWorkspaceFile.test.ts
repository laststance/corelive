import { spawnSync } from 'node:child_process'
import {
  mkdtemp,
  readFile,
  readdir,
  rm,
  stat,
  writeFile,
} from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterEach, describe, expect, test } from 'vitest'
import { z } from 'zod'

import {
  AtomicWorkspaceFile,
  type WorkspaceWriteStage,
} from './AtomicWorkspaceFile'

const schema = z.object({
  revision: z.number().int().nonnegative(),
  text: z.string(),
  completions: z.array(z.string()),
  receipts: z.array(z.string()),
})
const directories: string[] = []
type Fixture = z.infer<typeof schema>

/** Creates isolated real-filesystem stores; tests never touch a user's profile.
 * @example const { file, directory } = await createFixture()
 */
async function createFixture(onStage?: (stage: WorkspaceWriteStage) => void) {
  const directory = await mkdtemp(join(tmpdir(), 'corelive-workspace-'))
  directories.push(directory)
  const options = {
    directory,
    ownerId: 'account-a',
    parse: schema.parse,
    onStage,
  }
  return { directory, file: new AtomicWorkspaceFile(options), options }
}

afterEach(async () => {
  await Promise.all(
    directories.splice(0).map(async (path) => rm(path, { recursive: true })),
  )
})

describe('durable account workspace', () => {
  test('replaying a renamed command flushes its directory before acknowledging and still rejects a failed barrier', async () => {
    // Arrange
    let failure: WorkspaceWriteStage | undefined
    const stages: WorkspaceWriteStage[] = []
    const { file, options } = await createFixture((stage) => {
      stages.push(stage)
      if (stage === failure) throw new Error('Unacknowledged directory barrier')
    })
    await file.initialize({
      revision: 0,
      text: 'Before',
      completions: [],
      receipts: [],
    })
    const complete = (state: Fixture): Fixture =>
      state.receipts.includes('command-1')
        ? state
        : {
            revision: 1,
            text: 'After',
            completions: ['completion-1'],
            receipts: ['command-1'],
          }
    failure = 'replaced'
    await expect(file.update(complete)).rejects.toThrow(
      'Unacknowledged directory barrier',
    )
    const restarted = new AtomicWorkspaceFile(options)
    stages.length = 0

    // Act / Assert: readback alone must not turn an uncertain rename into success.
    failure = 'directory-flushed'
    await expect(restarted.update(complete)).rejects.toThrow(
      'Unacknowledged directory barrier',
    )
    expect(stages).toEqual(['directory-flushed'])
    failure = undefined
    stages.length = 0
    const retried = await restarted.update(complete)
    expect(stages).toEqual(['directory-flushed'])
    expect(retried).toEqual({
      revision: 1,
      text: 'After',
      completions: ['completion-1'],
      receipts: ['command-1'],
    })
  })

  test.each(['file-flushed', 'acknowledged'] as const)(
    'an actual process death at %s reopens the committed generation',
    async (stage) => {
      // Arrange
      const { file, options, directory } = await createFixture()
      await file.initialize({
        revision: 0,
        text: 'Before',
        completions: [],
        receipts: [],
      })
      const moduleUrl = new URL('./AtomicWorkspaceFile.ts', import.meta.url)
        .href
      const script = `
      import { AtomicWorkspaceFile } from ${JSON.stringify(moduleUrl)};
      const file = new AtomicWorkspaceFile({
        directory: ${JSON.stringify(directory)}, ownerId: 'account-a', parse: value => value,
        onStage: stage => { if (${JSON.stringify(stage)} === 'file-flushed' && stage === 'file-flushed') process.kill(process.pid, 'SIGKILL'); }
      });
      await file.update(state => ({ ...state, revision: 1, text: 'After', completions: ['completion-1'], receipts: ['command-1'] }));
      process.stdout.write('ACK', () => process.kill(process.pid, 'SIGKILL'));
    `

      // Act
      const child = spawnSync(
        process.execPath,
        ['--import', 'tsx', '--input-type=module', '-e', script],
        { encoding: 'utf8', timeout: 10000 },
      )
      const recovered = await new AtomicWorkspaceFile(options).read()

      // Assert
      expect(child.signal).toBe('SIGKILL')
      expect(child.stderr).toBe('')
      expect(child.stdout).toBe(stage === 'acknowledged' ? 'ACK' : '')
      expect(recovered.text).toBe(stage === 'acknowledged' ? 'After' : 'Before')
      expect(recovered.completions).toEqual(
        stage === 'acknowledged' ? ['completion-1'] : [],
      )
    },
  )

  test('acknowledged writing and completion reopen together after restart', async () => {
    // Arrange
    const { file, options } = await createFixture()
    await file.initialize({
      revision: 0,
      text: 'Ship\nLater',
      completions: [],
      receipts: [],
    })

    // Act
    await file.update((state) => ({
      ...state,
      revision: 1,
      text: 'Later',
      completions: ['completion-1'],
      receipts: ['command-1'],
    }))
    const reopened = await new AtomicWorkspaceFile(options).read()

    // Assert
    expect(reopened).toEqual({
      revision: 1,
      text: 'Later',
      completions: ['completion-1'],
      receipts: ['command-1'],
    })
    expect((await file.previewRecoveryInfo()).workspace).toEqual({
      revision: 0,
      text: 'Ship\nLater',
      completions: [],
      receipts: [],
    })
  })

  test('overlapping commands cannot overwrite a later draft with an old snapshot', async () => {
    // Arrange
    const { file } = await createFixture()
    await file.initialize({
      revision: 0,
      text: '',
      completions: [],
      receipts: [],
    })

    // Act
    await Promise.all(
      Array.from({ length: 20 }, async (_, index) =>
        file.update((state) => ({
          ...state,
          revision: state.revision + 1,
          text: `${state.text}${index},`,
        })),
      ),
    )

    // Assert
    expect((await file.read()).text).toBe(
      '0,1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16,17,18,19,',
    )
    expect((await file.read()).revision).toBe(20)
  })

  test.each(['before-write', 'file-flushed'] as const)(
    'failure at %s preserves the acknowledged generation',
    async (stage) => {
      // Arrange
      let fail = false
      const { file, options, directory } = await createFixture((at) => {
        if (fail && at === stage) throw new Error('injected disk failure')
      })
      await file.initialize({
        revision: 0,
        text: 'Keep me',
        completions: [],
        receipts: [],
      })
      fail = true

      // Act
      const result = file.update((state) => ({
        ...state,
        revision: 1,
        text: 'New',
      }))

      // Assert
      await expect(result).rejects.toThrow('injected disk failure')
      expect((await new AtomicWorkspaceFile(options).read()).text).toBe(
        'Keep me',
      )
      expect(
        (await readdir(directory)).some((name) => name.endsWith('.tmp')),
      ).toBe(false)
    },
  )

  test.each(['replaced', 'directory-flushed'] as const)(
    'lost acknowledgement at %s replays the durable identity without duplication',
    async (stage) => {
      // Arrange
      let fail = false
      const { file, options } = await createFixture((at) => {
        if (fail && at === stage) throw new Error('lost acknowledgement')
      })
      await file.initialize({
        revision: 0,
        text: 'Ship',
        completions: [],
        receipts: [],
      })
      const complete = (state: Fixture): Fixture =>
        state.receipts.includes('command-1')
          ? state
          : {
              revision: 1,
              text: '',
              completions: ['completion-1'],
              receipts: ['command-1'],
            }
      fail = true

      // Act
      await expect(file.update(complete)).rejects.toThrow(
        'lost acknowledgement',
      )
      fail = false
      const retried = await new AtomicWorkspaceFile(options).update(complete)

      // Assert
      expect(retried).toEqual({
        revision: 1,
        text: '',
        completions: ['completion-1'],
        receipts: ['command-1'],
      })
    },
  )

  test('corrupt primary never becomes an empty workspace and recovery preserves the evidence', async () => {
    // Arrange
    const { file, directory } = await createFixture()
    await file.initialize({
      revision: 0,
      text: 'Recovered writing',
      completions: [],
      receipts: [],
    })
    await file.update((state) => ({
      ...state,
      revision: 1,
      text: 'Newer writing',
    }))
    await writeFile(file.path, 'corrupt but potentially recoverable')

    // Act
    await expect(file.read()).rejects.toMatchObject({ reason: 'invalid' })
    await expect(
      file.initialize({ revision: 0, text: '', completions: [], receipts: [] }),
    ).rejects.toMatchObject({ reason: 'exists' })
    const recovered = await file.restoreRecovery((state) => ({
      ...state,
      revision: 2,
    }))

    // Assert
    expect(recovered.text).toBe('Recovered writing')
    const preserved = (await readdir(directory)).find((name) =>
      name.includes('.preserved-'),
    )
    expect(preserved).toBeDefined()
    expect(await readFile(join(directory, preserved!), 'utf8')).toBe(
      'corrupt but potentially recoverable',
    )
  })

  test('another account cannot read a copied workspace or escape its partition path', async () => {
    // Arrange
    const { file, directory } = await createFixture()
    await file.initialize({
      revision: 0,
      text: 'Private A',
      completions: [],
      receipts: [],
    })
    const other = new AtomicWorkspaceFile({
      directory,
      ownerId: '../../account-b',
      parse: schema.parse,
    })
    await writeFile(other.path, await readFile(file.path))

    // Act / Assert
    expect(other.path.startsWith(`${directory}/`)).toBe(true)
    await expect(other.read()).rejects.toMatchObject({ reason: 'invalid' })
  })

  test('payload tampering and unsupported envelopes are rejected before domain use', async () => {
    // Arrange
    const { file } = await createFixture()
    await file.initialize({
      revision: 0,
      text: 'Original',
      completions: [],
      receipts: [],
    })
    const original = await readFile(file.path, 'utf8')

    // Act / Assert
    await writeFile(file.path, original.replace('Original', 'Tampered'))
    await expect(file.read()).rejects.toMatchObject({ reason: 'invalid' })
    await writeFile(file.path, original.replace('"format":1', '"format":2'))
    await expect(file.read()).rejects.toMatchObject({ reason: 'invalid' })
  })
})

describe('v2 fixed file names', () => {
  test('a v2 file lands at the fixed name while the v1 owner-hash path stays unchanged', async () => {
    // Arrange
    const { directory, options } = await createFixture()
    const initial = { revision: 0, text: 'a', completions: [], receipts: [] }
    const v2File = new AtomicWorkspaceFile({
      ...options,
      ownerId: 'device',
      fileName: 'device',
    })
    const v1File = new AtomicWorkspaceFile(options)

    // Act
    await v2File.initialize(initial)
    await v1File.initialize(initial)
    const names = (await readdir(directory)).sort()

    // Assert
    expect(v2File.path).toBe(join(directory, 'device.json'))
    expect(v2File.recoveryPath).toBe(join(directory, 'device.recovery.json'))
    expect(names).toContain('device.json')
    expect(v1File.path).toMatch(/\/[a-f0-9]{64}\.json$/)
    expect(names).toHaveLength(2)
  })

  test('a file name that could escape the directory is refused', () => {
    // Arrange
    const options = {
      directory: '/tmp/x',
      ownerId: 'device',
      parse: schema.parse,
      fileName: '../evil',
    }

    // Act
    const create = () => new AtomicWorkspaceFile(options)

    // Assert
    expect(create).toThrow('invalid')
  })
})

describe('commit cost on a large file (#216 perf gate)', () => {
  const initial: Fixture = {
    revision: 0,
    text: 'a',
    completions: [],
    receipts: [],
  }
  const bump = (state: Fixture): Fixture => ({
    ...state,
    revision: state.revision + 1,
  })

  test('the recovery copy is exactly the previous generation, not the current one', async () => {
    // Arrange
    const { file } = await createFixture()
    await file.initialize(initial)
    await file.update(bump)
    const generationOne = await readFile(file.path, 'utf8')

    // Act
    await file.update(bump)

    // Assert
    expect(await readFile(file.recoveryPath, 'utf8')).toBe(generationOne)
    expect(await readFile(file.path, 'utf8')).not.toBe(generationOne)
  })

  test('replacing the primary leaves the recovery inode untouched', async () => {
    // Arrange
    const { file } = await createFixture()
    await file.initialize(initial)
    await file.update(bump)
    await file.update(bump)
    const recoveryInode = (await stat(file.recoveryPath)).ino
    const recoveryBytes = await readFile(file.recoveryPath, 'utf8')

    // Act: the primary is replaced by a new inode; the demoted one becomes the recovery copy.
    await file.update(bump)

    // Assert
    expect((await stat(file.path)).ino).not.toBe(recoveryInode)
    expect((await stat(file.recoveryPath)).ino).not.toBe(recoveryInode)
    expect(await readFile(file.recoveryPath, 'utf8')).not.toBe(recoveryBytes)
    expect(JSON.parse(recoveryBytes).payload).toContain('"revision":1')
  })

  test('a crash after the new bytes are flushed but before the rename leaves the previous generation as primary and recovery', async () => {
    // Arrange
    const fault: { at?: WorkspaceWriteStage } = {}
    const { file, options } = await createFixture((stage) => {
      if (stage === fault.at) throw new Error('Simulated power loss')
    })
    await file.initialize(initial)
    await file.update(bump)
    const primaryBefore = await readFile(file.path, 'utf8')
    fault.at = 'file-flushed'

    // Act
    await expect(file.update(bump)).rejects.toThrow('Simulated power loss')

    // Assert
    expect(await readFile(file.path, 'utf8')).toBe(primaryBefore)
    expect(await readFile(file.recoveryPath, 'utf8')).toBe(primaryBefore)
    expect((await new AtomicWorkspaceFile(options).read()).revision).toBe(1)
    expect(
      (await readdir(options.directory)).filter((n) => n.endsWith('.tmp')),
    ).toEqual([])
  })

  test('an unchanged file is not parsed again, but a changed one is', async () => {
    // Arrange
    let parses = 0
    const { directory, options } = await createFixture()
    const file = new AtomicWorkspaceFile({
      ...options,
      parse: (value) => {
        parses++
        return schema.parse(value)
      },
    })
    await file.initialize(initial)
    await file.update(bump)
    parses = 0

    // Act
    await file.read()
    await file.update(bump)

    // Assert: one parse for the candidate only, none for the two reads of our own bytes.
    expect(parses).toBe(1)
    expect(directory).toBeTruthy()
  })

  test('a primary damaged behind the cache is detected, never served from memory', async () => {
    // Arrange
    const { file } = await createFixture()
    await file.initialize(initial)
    await file.update(bump)
    await writeFile(file.path, '{"damaged":')

    // Act
    const update = file.update(bump)

    // Assert
    await expect(update).rejects.toMatchObject({ reason: 'invalid' })
    expect((await file.previewRecoveryInfo()).workspace.revision).toBe(0)
  })

  test('a shared update returns the committed state without cloning it', async () => {
    // Arrange
    const { file } = await createFixture()
    await file.initialize(initial)

    // Act
    const shared = await file.update(bump, { shared: true })
    const cloned = await file.update((state) => state, { shared: false })

    // Assert
    expect(shared.revision).toBe(1)
    expect(cloned).toEqual(shared)
    expect(cloned).not.toBe(shared)
  })

  test('updateOrInitialize creates a missing file but refuses to start over a lone recovery copy', async () => {
    // Arrange
    const { file, options } = await createFixture()
    const lonely = new AtomicWorkspaceFile({
      ...options,
      directory: join(options.directory, 'nested'),
    })

    // Act
    const created = await file.updateOrInitialize(initial, bump)
    await lonely.updateOrInitialize(initial, bump)
    await lonely.update(bump)
    await rm(lonely.path)
    const refuse = lonely.updateOrInitialize(initial, bump)

    // Assert
    expect(created.revision).toBe(1)
    await expect(refuse).rejects.toMatchObject({ reason: 'exists' })
  })
})
