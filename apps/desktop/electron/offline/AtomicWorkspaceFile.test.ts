import { spawnSync } from 'node:child_process'
import { mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises'
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
