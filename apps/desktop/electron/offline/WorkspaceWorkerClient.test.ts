import { randomUUID } from 'node:crypto'
import {
  mkdtemp,
  readFile,
  readdir,
  rename,
  rm,
  writeFile,
} from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import {
  DEVICE_ARCHIVE_FILE_NAME,
  DEVICE_OWNER_ID,
  DEVICE_WORKSPACE_FILE_NAME,
  OfflineWorkspaceSchema,
} from '@corelive/desktop-contract/offline-workspace-v2'
import { expect, onTestFinished, test } from 'vitest'

import { AtomicWorkspaceFile } from './AtomicWorkspaceFile'
import {
  buildDeviceWorkspace,
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

test('draft pages bound worker replies and retain every row identity across a long line and empty lines', async () => {
  // Arrange
  const directory = await mkdtemp(join(tmpdir(), 'corelive-draft-page-'))
  const categoryId = categoryUuid(1)
  const workspace = await initializeDeviceWorkspace(directory, {
    notes: { 1: '😀' + '日'.repeat(200_000) + '\n'.repeat(2048) },
  })
  const storedRows = workspace.drafts[categoryId]!.rows
  const client = new WorkspaceWorkerClient({
    directory,
    ownerId: DEVICE_OWNER_ID,
    script: new URL('./workspace-worker.ts', import.meta.url),
    execArgv: ['--import', 'tsx'],
  })
  onTestFinished(async () => {
    await client.close()
    await rm(directory, { recursive: true })
  })
  const read = async (offset: number, limit: number) => {
    const result = await client.call('draftPage', {
      categoryId,
      page: { offset, limit, expectedRevision: 0 },
    })
    if (result.status !== 'page') throw new Error(result.status)
    return result.page
  }

  // Act
  const first = await read(0, 1)
  const emptyLines = await read(200_002, 65_536)
  const last = await read(201_026, 65_536)

  // Assert
  expect(first).toMatchObject({
    text: '😀',
    offset: 0,
    nextOffset: 2,
    revision: 0,
    totalLength: 202_050,
    rowSpans: [{ id: storedRows[0]!.id, startOffset: 0, endOffset: 200_002 }],
  })
  expect(emptyLines).toMatchObject({
    text: '\n'.repeat(1024),
    offset: 200_002,
    nextOffset: 201_026,
  })
  expect(last).toMatchObject({
    text: '\n'.repeat(1024),
    offset: 201_026,
    nextOffset: null,
  })
  const spans = [...emptyLines.rowSpans, ...last.rowSpans]
  expect(spans.map(({ id }) => id)).toEqual(storedRows.map(({ id }) => id))
  expect(spans.at(-1)).toMatchObject({
    startOffset: 202_050,
    endOffset: 202_050,
  })
})

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
  const path = join(directory, `${DEVICE_WORKSPACE_FILE_NAME}.json`)
  const recoveryPath = join(
    directory,
    `${DEVICE_WORKSPACE_FILE_NAME}.recovery.json`,
  )
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

/**
 * Moves an old completion out of the workspace using the real worker, then opens a fresh worker for export tests.
 * @example const { client } = await createArchivedWorkspace()
 */
async function createArchivedWorkspace() {
  const directory = await mkdtemp(join(tmpdir(), 'corelive-worker-archive-'))
  const options = {
    directory,
    ownerId: DEVICE_OWNER_ID,
    script: new URL('./workspace-worker.ts', import.meta.url),
    execArgv: ['--import', 'tsx'],
  }
  const first = new WorkspaceWorkerClient(options)
  onTestFinished(async () => {
    await first.close()
    await rm(directory, { recursive: true })
  })
  const id = randomUUID()
  const old = Date.now() - 5 * 365 * 24 * 60 * 60 * 1000
  const workspace = buildDeviceWorkspace({ categoryCount: 1 })
  workspace.completions[id] = {
    id,
    categoryId: categoryUuid(1),
    originalCategoryId: categoryUuid(1),
    title: 'Five years ago',
    rawText: 'Five years ago',
    lineId: randomUUID(),
    lineIndex: 0,
    completedAt: old,
    originalCompletedAt: old,
    timezone: 'Asia/Tokyo',
    revision: 1,
    undoUntil: old,
    cancelled: false,
    restored: false,
    remote: null,
    clearAfter: null,
    cleared: false,
  }
  await new AtomicWorkspaceFile({
    directory,
    ownerId: DEVICE_OWNER_ID,
    fileName: DEVICE_WORKSPACE_FILE_NAME,
    parse: OfflineWorkspaceSchema.parse,
  }).initialize(workspace)
  const { archived } = await first.call('archive', null)
  expect(archived).toBe(1)
  await first.close()
  const client = new WorkspaceWorkerClient(options)
  onTestFinished(async () => client.close())
  return { client, directory, id }
}

test('an archived completion survives a restart and travels with the export', async () => {
  // Arrange
  const { client, id } = await createArchivedWorkspace()

  // Act
  const exported = JSON.parse(await client.call('export', null)) as unknown

  // Assert
  expect(exported).not.toHaveProperty(['completions', id])
  expect(exported).toHaveProperty(
    ['archive', 'completions', id, 'title'],
    'Five years ago',
  )
})

test('an export of a damaged workspace includes the surviving archive and recovery files together', async () => {
  // Arrange
  const { client, directory, id } = await createArchivedWorkspace()
  const path = join(directory, 'device.json')
  const recoveryPath = join(directory, 'device.recovery.json')
  const recovery = await readFile(recoveryPath)
  await writeFile(path, Buffer.from([0x7b, 0x00, 0xff]))

  // Act
  const exported = JSON.parse(await client.call('export', null)) as unknown

  // Assert
  expect(exported).toMatchObject({
    format: 'corelive-recovery-files',
    version: 1,
    ownerId: 'device',
    files: [
      { name: 'workspace.json', contentBase64: 'ewD/', integrity: 'invalid' },
      {
        name: 'recovery.json',
        contentBase64: recovery.toString('base64'),
        integrity: 'valid',
      },
    ],
    archive: { completions: { [id]: { title: 'Five years ago' } } },
  })
})

test.each([
  { primary: 'missing', damagedBytes: null, rawFiles: [] },
  {
    primary: 'corrupt',
    damagedBytes: Buffer.from([0x7b, 0x00, 0xff]),
    rawFiles: [
      { name: 'workspace.json', contentBase64: 'ewD/', integrity: 'invalid' },
    ],
  },
])(
  'export includes exact archive recovery bytes when the primary archive is $primary',
  async ({ damagedBytes, rawFiles }) => {
    // Arrange
    const { client, directory } = await createArchivedWorkspace()
    const path = join(directory, `${DEVICE_ARCHIVE_FILE_NAME}.json`)
    const recoveryPath = join(
      directory,
      `${DEVICE_ARCHIVE_FILE_NAME}.recovery.json`,
    )
    await rename(path, recoveryPath)
    const recovery = await readFile(recoveryPath)
    if (damagedBytes) await writeFile(path, damagedBytes)

    // Act
    const exported = JSON.parse(await client.call('export', null)) as unknown

    // Assert
    expect(exported).toMatchObject({
      version: 2,
      archiveRecoveryFiles: {
        format: 'corelive-recovery-files',
        version: 1,
        ownerId: 'device',
        files: [
          ...rawFiles,
          {
            name: 'recovery.json',
            contentBase64: recovery.toString('base64'),
            integrity: 'valid',
          },
        ],
      },
    })
    expect(exported).not.toHaveProperty('archive')
    expect(await readFile(recoveryPath)).toEqual(recovery)
  },
)
