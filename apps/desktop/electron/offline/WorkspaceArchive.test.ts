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
} from '@corelive/desktop-contract/offline-workspace-v2'
import { afterEach, describe, expect, test } from 'vitest'

import {
  AtomicWorkspaceFile,
  type WorkspaceWriteStage,
} from './AtomicWorkspaceFile'
import { buildDeviceWorkspace, categoryUuid } from './deviceWorkspaceFixture'
import {
  ARCHIVE_MIN_AGE_MS,
  COMMAND_RECEIPT_WINDOW,
  WorkspaceService,
} from './WorkspaceService'

const directories: string[] = []
const now = Date.UTC(2026, 10, 3, 12)
const DAY = 24 * 60 * 60 * 1000

afterEach(async () => {
  await Promise.all(
    directories.splice(0).map(async (path) => rm(path, { recursive: true })),
  )
})

/** Builds a completion record that is settled unless the overrides say otherwise.
 * @example completion({ completedAt: now - 10 * DAY })
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

/** Creates a device workspace plus the archive file in an isolated directory.
 * @example const fixture = await createFixture((workspace) => { ... })
 */
async function createFixture(
  seed: (workspace: OfflineWorkspace) => void,
  onStage?: (stage: WorkspaceWriteStage) => void,
) {
  const directory = await mkdtemp(join(tmpdir(), 'corelive-archive-'))
  directories.push(directory)
  const file = new AtomicWorkspaceFile({
    directory,
    ownerId: DEVICE_OWNER_ID,
    fileName: DEVICE_WORKSPACE_FILE_NAME,
    parse: OfflineWorkspaceSchema.parse,
    onStage,
  })
  const archive = new AtomicWorkspaceFile({
    directory,
    ownerId: DEVICE_OWNER_ID,
    fileName: DEVICE_ARCHIVE_FILE_NAME,
    parse: WorkspaceArchiveSchema.parse,
  })
  const workspace = buildDeviceWorkspace({ categoryCount: 2 })
  seed(workspace)
  await file.initialize(workspace)
  const service = new WorkspaceService(file, () => now, randomUUID, archive)
  return { file, archive, service, directory }
}

describe('settled history leaves the keep-path snapshot', () => {
  test('a completion older than two days moves to the archive with its text intact', async () => {
    // Arrange
    const old = completion({
      title: 'Wrote the quarterly plan',
      rawText: '- [x] Wrote the quarterly plan',
    })
    const { file, archive, service } = await createFixture((workspace) => {
      workspace.completions[old.id] = old
    })

    // Act
    const moved = await service.archiveSettled()

    // Assert
    expect(moved).toBe(1)
    expect((await file.read()).completions[old.id]).toBeUndefined()
    expect((await archive.read()).completions[old.id]).toMatchObject({
      title: 'Wrote the quarterly plan',
      rawText: '- [x] Wrote the quarterly plan',
    })
  })

  test('a recent completion, one with a pending send and one awaiting its clear stay in the workspace', async () => {
    // Arrange
    const recent = completion({ completedAt: now - 3600_000 })
    const waiting = completion()
    const clearing = completion({ clearAfter: now + 1000 })
    const { file, service } = await createFixture((workspace) => {
      for (const item of [recent, waiting, clearing])
        workspace.completions[item.id] = item
      const operationId = randomUUID()
      workspace.outbox[operationId] = {
        state: 'queued',
        operation: {
          operationId,
          completionId: waiting.id,
          deviceId: workspace.deviceId,
          revision: 1,
          expectedRemoteRevision: 0,
          kind: 'create',
          categoryId: waiting.categoryId,
          title: waiting.title,
          completedAt: waiting.completedAt,
          originalCompletedAt: waiting.originalCompletedAt,
          timezone: 'Asia/Tokyo',
        },
      }
    })

    // Act
    const moved = await service.archiveSettled()

    // Assert
    expect(moved).toBe(0)
    expect(Object.keys((await file.read()).completions).sort()).toEqual(
      [recent.id, waiting.id, clearing.id].sort(),
    )
  })

  test('retired records older than two days move too, and a second pass finds nothing left', async () => {
    // Arrange
    const retiredId = randomUUID()
    const { file, archive, service } = await createFixture((workspace) => {
      workspace.retiredCompletions[retiredId] = {
        completedAt: now - 30 * DAY,
        originalCompletedAt: now - 30 * DAY,
        originalCategoryId: categoryUuid(1),
        timezone: 'Asia/Tokyo',
        cancelled: false,
        revision: 1,
        remoteRevision: 1,
        title: 'Shipped the release',
        rawText: 'Shipped the release',
      }
    })

    // Act
    const first = await service.archiveSettled()
    const second = await service.archiveSettled()

    // Assert
    expect([first, second]).toEqual([1, 0])
    expect((await file.read()).retiredCompletions).toEqual({})
    expect((await archive.read()).retiredCompletions[retiredId]?.title).toBe(
      'Shipped the release',
    )
  })

  test('a crash after the archive is durable but before the workspace drops the record loses nothing and the next pass finishes', async () => {
    // Arrange
    let crash = false
    const old = completion({ title: 'Survives the crash' })
    const { file, archive, service } = await createFixture(
      (workspace) => {
        workspace.completions[old.id] = old
      },
      (stage) => {
        if (crash && stage === 'before-write')
          throw new Error('Simulated power loss')
      },
    )
    crash = true

    // Act
    await expect(service.archiveSettled()).rejects.toThrow(
      'Simulated power loss',
    )
    crash = false

    // Assert: the record is in both files, then only in the archive.
    expect((await file.read()).completions[old.id]?.title).toBe(
      'Survives the crash',
    )
    expect((await archive.read()).completions[old.id]?.title).toBe(
      'Survives the crash',
    )
    expect(await service.archiveSettled()).toBe(1)
    expect((await file.read()).completions[old.id]).toBeUndefined()
    expect((await archive.read()).completions[old.id]?.title).toBe(
      'Survives the crash',
    )
  })

  test('the archive keeps its own recovery copy of the previous generation', async () => {
    // Arrange
    const first = completion({ title: 'First batch' })
    const second = completion({ title: 'Second batch' })
    const { file, archive, service } = await createFixture((workspace) => {
      workspace.completions[first.id] = first
    })
    await service.archiveSettled()
    await file.update((state) => ({
      ...state,
      revision: state.revision + 1,
      completions: { ...state.completions, [second.id]: second },
    }))

    // Act
    await service.archiveSettled()

    // Assert
    const recovery = new AtomicWorkspaceFile({
      directory: join(archive.path, '..'),
      ownerId: DEVICE_OWNER_ID,
      fileName: DEVICE_ARCHIVE_FILE_NAME,
      parse: WorkspaceArchiveSchema.parse,
    })
    expect(
      Object.keys((await recovery.previewRecoveryInfo()).workspace.completions),
    ).toEqual([first.id])
    expect(Object.keys((await archive.read()).completions).sort()).toEqual(
      [first.id, second.id].sort(),
    )
  })
})

describe('command receipts stay bounded', () => {
  test('receipts older than the window are dropped while the newest command still replays', async () => {
    // Arrange
    const { file, service } = await createFixture((workspace) => {
      workspace.revision = COMMAND_RECEIPT_WINDOW + 50
      for (let index = 1; index <= COMMAND_RECEIPT_WINDOW + 50; index++)
        workspace.commandReceipts[randomUUID()] = {
          digest: 'f'.repeat(64),
          revision: index,
        }
    })
    const command = {
      type: 'select' as const,
      commandId: randomUUID(),
      categoryId: categoryUuid(2),
    }

    // Act
    await service.execute(command)
    const revisionAfter = (await file.read()).revision
    const replay = await service.execute(command)

    // Assert
    const receipts = Object.values((await file.read()).commandReceipts)
    expect(receipts.length).toBeLessThanOrEqual(COMMAND_RECEIPT_WINDOW)
    expect(replay.revision).toBe(revisionAfter)
    expect(ARCHIVE_MIN_AGE_MS).toBe(2 * DAY)
  })
})
