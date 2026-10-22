import { createHash, randomUUID } from 'node:crypto'
import { mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { UserSettingsStateSchema } from '@corelive/desktop-contract/settings'
import { expect, test } from 'vitest'

import { WorkspaceWorkerClient } from './WorkspaceWorkerClient'

test.each(['before-commit', 'after-commit'] as const)(
  'retrying after a worker exits %s restores saving without duplicating completion or reopening an explicitly closed client',
  async (crashAt) => {
    // Arrange: the real worker exits once; its next instance opens the same durable partition.
    const directory = await mkdtemp(join(tmpdir(), 'corelive-worker-exit-'))
    const script = join(directory, 'crash-once.mjs')
    const workerURL = new URL('./workspace-worker.ts', import.meta.url).href
    await writeFile(
      script,
      `import { parentPort, workerData } from 'node:worker_threads';
import { appendFileSync, existsSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
const marker = join(workerData.directory, 'crashed');
appendFileSync(join(workerData.directory, 'starts'), 'worker\\n');
let crashRequest;
const crash = () => { writeFileSync(marker, 'exited'); process.exit(1); };
parentPort.on('message', request => {
  if (request.type === 'command' && !crashRequest && !existsSync(marker)) {
    crashRequest = request.requestId;
    if (${JSON.stringify(crashAt)} === 'before-commit') crash();
  }
});
const post = parentPort.postMessage.bind(parentPort);
parentPort.postMessage = reply => {
  if (reply.requestId === crashRequest && reply.ok && !existsSync(marker)) crash();
  post(reply);
};
await import(${JSON.stringify(workerURL)});
`,
    )
    const client = new WorkspaceWorkerClient({
      directory,
      ownerId: 'account-a',
      script,
      execArgv: ['--import', 'tsx'],
    })
    try {
      const ready = await client.call('prepare', {
        ownerId: 'account-a',
        deviceId: randomUUID(),
        legacyNotes: { '1': 'Retained completion' },
        categories: [
          {
            id: 1,
            name: 'General',
            color: 'blue',
            isDefault: true,
            parentId: null,
            removed: false,
          },
        ],
        preferences: {
          revision: 0,
          theme: 'light',
          settings: UserSettingsStateSchema.parse({}),
        },
      })
      const completion = {
        type: 'complete' as const,
        commandId: randomUUID(),
        completionId: randomUUID(),
        categoryId: 1,
        baseRevision: ready.draft.revision,
        rowId: ready.draft.rows[0]!.id,
        completedAt: Date.now(),
        timezone: 'Asia/Tokyo',
      }

      // Act: all eight unknown outcomes reject, then concurrent retries share one new writer.
      const interrupted = await Promise.allSettled(
        Array.from({ length: 8 }, async () =>
          client.call('command', completion),
        ),
      )
      expect(interrupted).toHaveLength(8)
      for (const result of interrupted)
        expect(result).toMatchObject({
          status: 'rejected',
          reason: { reason: 'worker-unavailable' },
        })
      const replaying = Promise.all(
        Array.from({ length: 8 }, async () =>
          client.call('command', completion),
        ),
      )

      // Assert: both commit boundaries produce exactly one original identity and remain writable.
      await expect(replaying).resolves.toHaveLength(8)
      const retried = await replaying
      for (const result of retried) expect(result.pendingCount).toBe(1)
      expect(await client.call('pending', { limit: 16 })).toMatchObject([
        { operation: { completionId: completion.completionId } },
      ])
      const reopened = await client.call('open', null)
      expect(reopened.draft.rows.map((row) => row.text)).toEqual([
        '- [x] Retained completion',
      ])
      await client.call('command', {
        type: 'save',
        commandId: randomUUID(),
        categoryId: 1,
        baseRevision: reopened.draft.revision,
        rows: [
          ...reopened.draft.rows,
          { id: randomUUID(), text: 'Writing after recovery' },
        ],
      })
      expect(
        (await client.call('open', null)).draft.rows.map((row) => row.text),
      ).toEqual(['- [x] Retained completion', 'Writing after recovery'])
      await client.close()
      await expect(client.call('open', null)).rejects.toMatchObject({
        reason: 'worker-unavailable',
      })
      expect(await readFile(join(directory, 'starts'), 'utf8')).toBe(
        'worker\nworker\n',
      )
    } finally {
      await client.close()
      await rm(directory, { recursive: true })
    }
  },
)

test('the actual storage worker persists commands and returns a bounded projection across restart', async () => {
  // Arrange
  const directory = await mkdtemp(join(tmpdir(), 'corelive-worker-'))
  const options = {
    directory,
    ownerId: 'account-a',
    script: new URL('./workspace-worker.ts', import.meta.url),
    execArgv: ['--import', 'tsx'],
  }
  let client = new WorkspaceWorkerClient(options)
  try {
    const ready = await client.call('prepare', {
      ownerId: 'account-a',
      deviceId: randomUUID(),
      legacyNotes: { '1': 'Original' },
      categories: [
        {
          id: 1,
          name: 'General',
          color: 'blue',
          isDefault: true,
          parentId: null,
          removed: false,
        },
      ],
      preferences: {
        revision: 0,
        theme: 'warm-cathedral-light',
        settings: UserSettingsStateSchema.parse({}),
      },
    })
    const commandId = randomUUID()
    const completionId = randomUUID()

    // Act
    const saved = await client.call('command', {
      type: 'complete',
      commandId,
      completionId,
      categoryId: 1,
      baseRevision: 0,
      rowId: ready.draft.rows[0]!.id,
      completedAt: Date.now(),
      timezone: 'Asia/Tokyo',
    })
    await client.close()
    client = new WorkspaceWorkerClient(options)
    const reopened = await client.call('open', null)

    // Assert
    expect(saved.pendingCount).toBe(1)
    expect(reopened.draft.rows.map((row) => row.text)).toEqual([
      '- [x] Original',
    ])
    expect(reopened.pendingCount).toBe(1)
    expect(reopened).not.toHaveProperty('commandReceipts')
    expect(reopened).not.toHaveProperty('completions')
    expect(
      (await client.call('pending', { limit: 16 }))[0]?.operation.completionId,
    ).toBe(completionId)
    await expect(
      client.call('prepare', {
        ownerId: 'account-b',
        deviceId: randomUUID(),
        legacyNotes: {},
        categories: [],
        preferences: ready.preferences,
      }),
    ).rejects.toMatchObject({ reason: 'invalid' })
  } finally {
    await client.close()
    await rm(directory, { recursive: true })
  }
})

// Regression: ISSUE-003 — export must preserve broken source bytes instead of requiring a valid primary.
// Found by /qa on 2026-10-22; recovery scene advertises Export files even when primary parsing fails.
test('a corrupt account workspace can export its exact damaged file and validated recovery copy without rewriting either', async () => {
  // Arrange
  const directory = await mkdtemp(join(tmpdir(), 'corelive-recovery-export-'))
  const options = {
    directory,
    ownerId: 'account-a',
    script: new URL('./workspace-worker.ts', import.meta.url),
    execArgv: ['--import', 'tsx'],
  }
  let client = new WorkspaceWorkerClient(options)
  const path = join(
    directory,
    createHash('sha256').update('account-a').digest('hex') + '.json',
  )
  const recoveryPath = path.replace('.json', '.recovery.json')
  const damaged = Buffer.from([0x7b, 0x00, 0xff])
  try {
    await client.call('prepare', {
      ownerId: 'account-a',
      deviceId: randomUUID(),
      legacyNotes: { '1': 'Original writing' },
      categories: [
        {
          id: 1,
          name: 'General',
          color: 'blue',
          isDefault: true,
          parentId: null,
          removed: false,
        },
      ],
      preferences: {
        revision: 0,
        theme: 'light',
        settings: UserSettingsStateSchema.parse({}),
      },
    })
    await client.call('command', {
      type: 'save',
      commandId: randomUUID(),
      categoryId: 1,
      baseRevision: 0,
      rows: [{ id: randomUUID(), text: 'Newer writing' }],
    })
    const recoveryBefore = await readFile(recoveryPath)
    await client.close()
    await writeFile(path, damaged)
    client = new WorkspaceWorkerClient(options)

    // Act
    const exported = await client.call('export', null)

    // Assert
    expect(JSON.parse(exported) as unknown).toMatchObject({
      format: 'corelive-recovery-files',
      version: 1,
      ownerId: 'account-a',
      files: [
        { name: 'workspace.json', contentBase64: 'ewD/', integrity: 'invalid' },
        {
          name: 'recovery.json',
          integrity: 'valid',
          contentBase64: recoveryBefore.toString('base64'),
        },
      ],
    })
    expect(await readFile(path)).toEqual(damaged)
    expect(await readFile(recoveryPath)).toEqual(recoveryBefore)

    // Restoration must preserve malformed UTF-8 bytes too, not a decoded replacement character.
    await client.call('recover', null)
    const preserved = (await readdir(directory)).find((name) =>
      name.includes('.preserved-'),
    )
    if (!preserved) throw new Error('Damaged source was not preserved')
    expect(await readFile(join(directory, preserved))).toEqual(damaged)

    // A parseable foreign owner is never exported, even if it was placed in this account's path.
    const foreign = JSON.stringify({
      ownerId: 'account-b',
      payload: 'Other account writing',
    })
    await writeFile(path, foreign)
    const isolated = await client.call('export', null)
    expect(isolated).not.toContain(Buffer.from(foreign).toString('base64'))
    expect(JSON.parse(isolated) as unknown).toMatchObject({
      files: [{ name: 'recovery.json', integrity: 'valid' }],
      excluded: ['workspace.json'],
    })
  } finally {
    await client.close()
    await rm(directory, { recursive: true })
  }
})
