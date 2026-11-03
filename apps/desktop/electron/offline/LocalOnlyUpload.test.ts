import { randomUUID } from 'node:crypto'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import {
  DEVICE_ARCHIVE_FILE_NAME,
  DEVICE_OWNER_ID,
  DEVICE_WORKSPACE_FILE_NAME,
  OfflineWorkspaceSchema,
  WorkspaceArchiveSchema,
  type OfflineCompletion,
  type OfflineWorkspace,
  type OutboxEntry,
} from '@corelive/desktop-contract/offline-workspace-v2'
import { afterEach, describe, expect, test } from 'vitest'

import { AtomicWorkspaceFile } from './AtomicWorkspaceFile'
import { buildDeviceWorkspace, categoryUuid } from './deviceWorkspaceFixture'
import { WorkspaceService } from './WorkspaceService'

const directories: string[] = []
const now = Date.UTC(2026, 10, 3, 12)
const DAY = 24 * 60 * 60 * 1000
const accountId = 'account-a'

afterEach(async () => {
  await Promise.all(
    directories.splice(0).map(async (path) => rm(path, { recursive: true })),
  )
})

/**
 * Builds a settled completion record; overrides turn it into the case under test.
 * @example completion({ remote: null, completedAt: now - 10 * DAY })
 */
function completion(
  overrides: Partial<OfflineCompletion> = {},
): OfflineCompletion {
  const id = overrides.id ?? randomUUID()
  const completedAt = overrides.completedAt ?? now - 10 * DAY
  return {
    id,
    categoryId: categoryUuid(1),
    originalCategoryId: categoryUuid(1),
    title: `Kept ${id.slice(0, 4)}`,
    rawText: `Kept ${id.slice(0, 4)}`,
    lineId: randomUUID(),
    lineIndex: 0,
    completedAt,
    originalCompletedAt: completedAt,
    timezone: 'Asia/Tokyo',
    revision: 1,
    undoUntil: completedAt,
    cancelled: false,
    restored: false,
    remote: null,
    clearAfter: null,
    cleared: false,
    ...overrides,
  }
}

/** The Mac's stored copy of the dashboard record (local category id). */
function remoteOf(
  record: OfflineCompletion,
  revision = record.revision,
  categoryId = record.categoryId,
) {
  return {
    completionId: record.id,
    revision,
    cancelled: record.cancelled,
    categoryId,
    title: record.title,
    completedAt: record.completedAt,
  }
}

/** The dashboard's receipt projection (numeric category id). */
function wireOf(record: OfflineCompletion) {
  return { ...remoteOf(record), categoryId: 1 }
}

/**
 * Creates a workspace (detached unless `attached`) plus the archive file.
 * @example const fixture = await createFixture({ attached: true, seed })
 */
async function createFixture(options: {
  attached?: boolean
  seed?: (workspace: OfflineWorkspace) => void
}) {
  const directory = await mkdtemp(join(tmpdir(), 'corelive-local-only-'))
  directories.push(directory)
  const file = new AtomicWorkspaceFile({
    directory,
    ownerId: DEVICE_OWNER_ID,
    fileName: DEVICE_WORKSPACE_FILE_NAME,
    parse: OfflineWorkspaceSchema.parse,
  })
  const archive = new AtomicWorkspaceFile({
    directory,
    ownerId: DEVICE_OWNER_ID,
    fileName: DEVICE_ARCHIVE_FILE_NAME,
    parse: WorkspaceArchiveSchema.parse,
  })
  const workspace = buildDeviceWorkspace({
    categoryCount: 2,
    notes: { 1: 'One\nTwo' },
    ...(options.attached ? { boundAccountId: accountId } : {}),
  })
  options.seed?.(workspace)
  await file.initialize(workspace)
  const service = new WorkspaceService(file, () => now, randomUUID, archive)
  return { file, archive, service, directory }
}

describe('a Mac that is not attached keeps without an outbox', () => {
  test('keeping, editing and undoing a completion while detached leave the outbox empty', async () => {
    // Arrange
    const { file, service } = await createFixture({})
    const draft = (await file.read()).drafts[categoryUuid(1)]!
    const keepId = randomUUID()

    // Act
    await service.execute({
      type: 'complete',
      commandId: randomUUID(),
      categoryId: categoryUuid(1),
      baseRevision: draft.revision,
      rowId: draft.rows[0]!.id,
      completionId: keepId,
      completedAt: now,
      timezone: 'Asia/Tokyo',
    })
    await service.execute({
      type: 'correctTime',
      commandId: randomUUID(),
      completionId: keepId,
      completedAt: now - 60_000,
    })
    const state = await service.execute({
      type: 'undo',
      commandId: randomUUID(),
      completionId: keepId,
    })

    // Assert
    expect(state.outbox).toEqual({})
    expect(state.completions[keepId]).toMatchObject({
      cancelled: true,
      revision: 3,
    })
  })

  test('a never-sent completion older than two days archives and the keep-path snapshot holds no entry for it', async () => {
    // Arrange
    const old = completion()
    const { file, archive, service } = await createFixture({
      seed: (workspace) => {
        workspace.completions[old.id] = old
      },
    })

    // Act
    const moved = await service.archiveSettled()

    // Assert
    expect(moved).toBe(1)
    expect((await file.read()).completions[old.id]).toBeUndefined()
    expect((await file.read()).outbox).toEqual({})
    expect((await archive.read()).completions[old.id]).toMatchObject({
      id: old.id,
      remote: null,
    })
  })
})

describe('upload work is derived at attach', () => {
  test('attach derives exactly the unsent completions, hot and archived, with their kinds', async () => {
    // Arrange
    const created = completion({ id: randomUUID() })
    const archivedCreate = completion({ id: randomUUID() })
    const relocated = completion({
      id: randomUUID(),
      categoryId: categoryUuid(2),
      revision: 2,
    })
    relocated.remote = remoteOf(relocated, 1, categoryUuid(1))
    const corrected = completion({ id: randomUUID(), revision: 2 })
    corrected.remote = remoteOf(corrected, 1)
    const cancelledAfterUpload = completion({
      id: randomUUID(),
      revision: 2,
      cancelled: true,
    })
    // The dashboard holds the revision uploaded before the Undo, still uncancelled.
    cancelledAfterUpload.remote = {
      ...remoteOf(cancelledAfterUpload, 1),
      cancelled: false,
    }
    const cancelledBeforeUpload = completion({
      id: randomUUID(),
      revision: 2,
      cancelled: true,
    })
    const synced = completion({ id: randomUUID() })
    synced.remote = remoteOf(synced)
    const { archive, service } = await createFixture({
      attached: true,
      seed: (workspace) => {
        for (const record of [
          created,
          relocated,
          corrected,
          cancelledAfterUpload,
          cancelledBeforeUpload,
          synced,
        ])
          workspace.completions[record.id] = record
      },
    })
    await archive.updateOrInitialize(
      {
        version: 1,
        ownerId: 'device',
        completions: {},
        retiredCompletions: {},
      },
      (current) => ({
        ...current,
        completions: { [archivedCreate.id]: archivedCreate },
      }),
    )

    // Act
    const total = await service.pendingTotal()
    const batch = await service.markSentBatch(accountId, 100)

    // Assert
    expect(total).toBe(5)
    expect(
      Object.fromEntries(
        batch.map((entry) => [
          entry.operation.completionId,
          entry.operation.kind,
        ]),
      ),
    ).toEqual({
      [cancelledAfterUpload.id]: 'cancel',
      [created.id]: 'create',
      [archivedCreate.id]: 'create',
      [relocated.id]: 'relocate',
      [corrected.id]: 'correctTime',
    })
    // Cancellations go first.
    expect(batch[0]!.operation.kind).toBe('cancel')
  })

  test('an archived local-only completion uploads after attach and rejoins the workspace until its receipt', async () => {
    // Arrange
    const archived = completion({ id: randomUUID() })
    const { file, archive, service } = await createFixture({ attached: true })
    await archive.updateOrInitialize(
      {
        version: 1,
        ownerId: 'device',
        completions: {},
        retiredCompletions: {},
      },
      (current) => ({
        ...current,
        completions: { [archived.id]: archived },
      }),
    )

    // Act
    const [sent] = await service.markSentBatch(accountId, 16)
    const afterSend = await file.read()
    const settled = await service.acceptReceipts(accountId, [
      {
        operationId: sent!.operation.operationId,
        completionId: archived.id,
        revision: 1,
        status: 'applied',
        projection: wireOf(archived),
      },
    ])

    // Assert
    expect(sent).toMatchObject({
      state: 'sent',
      operation: { kind: 'create', completionId: archived.id },
      wire: { categoryId: 1 },
    })
    expect(afterSend.completions[archived.id]).toBeDefined()
    expect(settled.outbox).toEqual({})
    expect(settled.completions[archived.id]!.remote).toMatchObject({
      revision: 1,
    })
    expect(await service.pendingTotal()).toBe(0)
  })

  test('a retry replays the frozen bytes of an in-flight operation even after the completion changed', async () => {
    // Arrange
    const record = completion({ id: randomUUID(), completedAt: now })
    const { service } = await createFixture({
      attached: true,
      seed: (workspace) => {
        workspace.completions[record.id] = record
      },
    })
    const [first] = await service.markSentBatch(accountId, 16)
    await service.execute({
      type: 'correctTime',
      commandId: randomUUID(),
      completionId: record.id,
      completedAt: now - 1000,
    })

    // Act
    const retry = await service.markSentBatch(accountId, 16)

    // Assert
    const replayed = retry.find(
      (entry) => entry.operation.operationId === first!.operation.operationId,
    )
    expect(JSON.stringify(replayed!.wire)).toBe(JSON.stringify(first!.wire))
    // The edit waits behind the uncertain create: it is not frozen on top of it.
    expect(retry).toHaveLength(1)
  })

  test('operations in flight stay with the bound account across a reopen and settle by receipt', async () => {
    // Arrange
    const record = completion({ id: randomUUID(), completedAt: now })
    const { file, archive, service } = await createFixture({
      attached: true,
      seed: (workspace) => {
        workspace.completions[record.id] = record
      },
    })
    const [sent] = await service.markSentBatch(accountId, 16)

    // Act: the app restarts after sign-out; the opening pass drops only re-derivable entries.
    const reopened = new WorkspaceService(file, () => now, randomUUID, archive)
    const dropped = await reopened.dropDerivableEntries()
    const state = await reopened.acceptReceipts(accountId, [
      {
        operationId: sent!.operation.operationId,
        completionId: record.id,
        revision: 1,
        status: 'applied',
        projection: wireOf(record),
      },
    ])

    // Assert
    expect(dropped).toBe(0)
    expect(state.binding?.accountId).toBe(accountId)
    expect(state.outbox).toEqual({})
  })
})

describe('opening a workspace written before uploads were derived', () => {
  test('only never-sent queued entries are dropped; uncertain and blocked ones stay', async () => {
    // Arrange
    const record = (id: string) => completion({ id, completedAt: now })
    const [queuedRecord, sentRecord, blockedRecord] = [
      record(randomUUID()),
      record(randomUUID()),
      record(randomUUID()),
    ]
    const entry = (
      target: OfflineCompletion,
      state: OutboxEntry['state'],
    ): [string, OutboxEntry] => {
      const operationId = randomUUID()
      return [
        operationId,
        {
          state,
          operation: {
            operationId,
            completionId: target.id,
            deviceId: randomUUID(),
            revision: 1,
            expectedRemoteRevision: 0,
            kind: 'create',
            categoryId: target.categoryId,
            title: target.title,
            completedAt: target.completedAt,
            originalCompletedAt: target.originalCompletedAt,
            timezone: target.timezone,
          },
        },
      ]
    }
    const queued = entry(queuedRecord, 'queued')
    const sent = entry(sentRecord, 'sent')
    const blocked = entry(blockedRecord, 'blocked')
    const { file, service } = await createFixture({
      attached: true,
      seed: (workspace) => {
        for (const target of [queuedRecord, sentRecord, blockedRecord])
          workspace.completions[target.id] = target
        workspace.outbox = {
          [queued[0]]: queued[1],
          [sent[0]]: sent[1],
          [blocked[0]]: blocked[1],
        }
      },
    })

    // Act
    const dropped = await service.dropDerivableEntries()

    // Assert
    expect(dropped).toBe(1)
    expect(Object.keys((await file.read()).outbox).sort()).toEqual(
      [sent[0], blocked[0]].sort(),
    )
    // The dropped entry's completion is still owed an upload, now derived.
    expect(
      (await service.markSentBatch(accountId, 16)).map(
        (item) => item.operation.completionId,
      ),
    ).toContain(queuedRecord.id)
  })
})
