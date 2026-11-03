import { randomUUID } from 'node:crypto'
import { mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { expect, test } from 'vitest'

import {
  categoryUuid,
  initializeDeviceWorkspace,
} from './deviceWorkspaceFixture'
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
    await initializeDeviceWorkspace(directory, {
      notes: { 1: 'Retained completion' },
    })
    const client = new WorkspaceWorkerClient({
      directory,
      ownerId: 'device',
      script,
      execArgv: ['--import', 'tsx'],
    })
    try {
      const ready = await client.call('open', null)
      const completion = {
        type: 'complete' as const,
        commandId: randomUUID(),
        completionId: randomUUID(),
        categoryId: categoryUuid(1),
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
      // An unattached device queues the completion locally; `pending` only lists sendable work.
      expect(
        (await client.call('details', { offset: 0, limit: 16 })).records,
      ).toMatchObject([
        { entry: { operation: { completionId: completion.completionId } } },
      ])
      const reopened = await client.call('open', null)
      expect(reopened.draft.rows.map((row) => row.text)).toEqual([
        '- [x] Retained completion',
      ])
      await client.call('command', {
        type: 'save',
        commandId: randomUUID(),
        categoryId: categoryUuid(1),
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
  await initializeDeviceWorkspace(directory, { notes: { 1: 'Original' } })
  const options = {
    directory,
    ownerId: 'device' as const,
    script: new URL('./workspace-worker.ts', import.meta.url),
    execArgv: ['--import', 'tsx'],
  }
  let client = new WorkspaceWorkerClient(options)
  try {
    const ready = await client.call('open', null)
    const commandId = randomUUID()
    const completionId = randomUUID()

    // Act
    const saved = await client.call('command', {
      type: 'complete',
      commandId,
      completionId,
      categoryId: categoryUuid(1),
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
      (await client.call('details', { offset: 0, limit: 16 })).records[0]?.entry
        .operation.completionId,
    ).toBe(completionId)
  } finally {
    await client.close()
    await rm(directory, { recursive: true })
  }
})

// Regression: ISSUE-003 — export must preserve broken source bytes instead of requiring a valid primary.
// Found by /qa on 2026-10-22; recovery scene advertises Export files even when primary parsing fails.
test('a corrupt device workspace can export its exact damaged file and validated recovery copy without rewriting either', async () => {
  // Arrange
  const directory = await mkdtemp(join(tmpdir(), 'corelive-recovery-export-'))
  await initializeDeviceWorkspace(directory, {
    notes: { 1: 'Original writing' },
  })
  const options = {
    directory,
    ownerId: 'device' as const,
    script: new URL('./workspace-worker.ts', import.meta.url),
    execArgv: ['--import', 'tsx'],
  }
  let client = new WorkspaceWorkerClient(options)
  const path = join(directory, 'device.json')
  const recoveryPath = join(directory, 'device.recovery.json')
  const damaged = Buffer.from([0x7b, 0x00, 0xff])
  try {
    await client.call('command', {
      type: 'save',
      commandId: randomUUID(),
      categoryId: categoryUuid(1),
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
      ownerId: 'device',
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
