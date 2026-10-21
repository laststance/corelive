import { randomUUID } from 'node:crypto'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import {
  OfflineWorkspaceSchema,
  type OfflineWorkspace,
  type WorkspaceCommand,
} from '@corelive/desktop-contract/offline-workspace'
import { UserSettingsStateSchema } from '@corelive/desktop-contract/settings'
import { afterEach, describe, expect, test } from 'vitest'

import { AtomicWorkspaceFile } from './AtomicWorkspaceFile'
import { checkpointIdentities, workspaceToday } from './workspaceCounts'
import { WorkspaceService } from './WorkspaceService'

const directories: string[] = []
const completionA = '00000000-0000-4000-8000-000000000001'
const completionB = '00000000-0000-4000-8000-000000000002'
const instant = Date.UTC(2026, 9, 21, 12)

/** Creates a verified synthetic account with three categories in an isolated directory.
 * @example const fixture = await createWorkspace()
 */
async function createWorkspace(text = 'Original\nLater', clear = false) {
  const directory = await mkdtemp(join(tmpdir(), 'corelive-commands-'))
  directories.push(directory)
  const options = {
    directory,
    ownerId: 'account-a',
    parse: OfflineWorkspaceSchema.parse,
  }
  let now = instant
  const file = new AtomicWorkspaceFile(options)
  const service = new WorkspaceService(file, () => now)
  await service.prepare({
    ownerId: 'account-a',
    deviceId: '00000000-0000-4000-8000-000000000003',
    categories: [1, 2, 3].map((id) => ({
      id,
      name: `Category ${id}`,
      color: 'blue',
      parentId: null,
      isDefault: id === 1,
      removed: false,
    })),
    preferences: {
      revision: 0,
      theme: 'warm-cathedral-light',
      settings: {
        ...UserSettingsStateSchema.parse({}),
        liveEditorToastDurationMs: 5000,
        liveEditorClearOnComplete: clear,
        liveEditorClearDelayMs: 0,
      },
    },
    legacyNotes: {
      '1': text,
      '2': 'Target writing',
      '999': 'Unmapped writing',
    },
  })
  return {
    file,
    service,
    options,
    setNow: (value: number): void => {
      now = value
    },
  }
}

/** Captures the current occurrence and document revision as the editor does after flushing.
 * @example const command = completionCommand(await file.read())
 */
function completionCommand(
  state: OfflineWorkspace,
  id = completionA,
  index = 0,
): WorkspaceCommand {
  return {
    type: 'complete',
    commandId: randomUUID(),
    categoryId: 1,
    baseRevision: state.drafts['1']!.revision,
    rowId: state.drafts['1']!.rows[index]!.id,
    completionId: id,
    completedAt: instant,
    timezone: 'Asia/Tokyo',
  }
}

afterEach(async () => {
  await Promise.all(
    directories.splice(0).map(async (path) => rm(path, { recursive: true })),
  )
})

describe('offline writing and completion transactions', () => {
  test('a later upgrade preserves changed legacy writing as a separate owned recovery copy without overwriting current writing', async () => {
    // Arrange
    const { file, service } = await createWorkspace()
    let state = await file.read()
    await service.execute({
      type: 'save',
      commandId: randomUUID(),
      categoryId: 1,
      baseRevision: 0,
      rows: [
        {
          id: state.drafts['1']!.rows[0]!.id,
          text: 'New writing in upgraded app',
        },
      ],
    })
    const legacy = {
      '1': 'Writing from an older app',
      '999': 'Another account must never see this',
    }

    // Act
    state = await service.refreshCategories(state.categories, [], legacy)
    state = await service.refreshCategories(state.categories, [], legacy)

    // Assert
    expect(state.drafts['1']!.rows.map((row) => row.text)).toEqual([
      'New writing in upgraded app',
    ])
    expect(state.recoveryCopies).toHaveLength(1)
    expect(state.recoveryCopies[0]).toMatchObject({
      categoryId: 1,
      text: 'Writing from an older app',
      reason: 'legacy-changed',
    })
    expect(JSON.stringify(state)).not.toContain(
      'Another account must never see this',
    )
    const copyId = state.recoveryCopies[0]!.id
    state = await service.execute({
      type: 'restoreRecovery',
      commandId: randomUUID(),
      copyId,
      destinationId: 1,
    })
    state = await service.execute({
      type: 'restoreRecovery',
      commandId: randomUUID(),
      copyId,
      destinationId: 1,
    })
    expect(state.drafts['1']!.rows.map((row) => row.text)).toEqual([
      'New writing in upgraded app',
      '',
      'Writing from an older app',
    ])
    expect(state.recoveryCopies[0]!.restoredTo).toBe(1)
  })
  test('a lost delivery reply cannot double count an identity already included in the server checkpoint', async () => {
    // Arrange
    const { file, service } = await createWorkspace()
    let state = await service.execute(completionCommand(await file.read()))
    const operation = Object.values(state.outbox)[0]!.operation
    await service.markSent(operation.operationId)
    state = await file.read()

    // Act
    state = await service.checkpoint(state.revision, {
      day: '2026-10-21',
      timezone: 'Asia/Tokyo',
      total: 10,
      fetchedAt: instant,
      identities: {
        [completionA]: {
          completionId: completionA,
          revision: 1,
          cancelled: false,
          categoryId: 1,
          title: 'Original',
          completedAt: instant,
        },
      },
    })
    const counted = workspaceToday(state, instant, 'Asia/Tokyo')
    state = await service.execute({
      type: 'undo',
      commandId: randomUUID(),
      completionId: completionA,
    })

    // Assert
    expect(counted).toMatchObject({
      total: 10,
      deviceTotal: 1,
      scope: 'account',
      stale: false,
    })
    expect(workspaceToday(state, instant, 'Asia/Tokyo')).toMatchObject({
      total: 9,
      deviceTotal: 0,
      scope: 'account',
    })
    expect(state.completions[completionA]).toBeDefined()
  })

  test('uncertain identities outside the checkpoint use device feedback and retain the last account total as stale', async () => {
    // Arrange
    const { file, service } = await createWorkspace()
    let state = await service.execute(completionCommand(await file.read()))
    const operation = Object.values(state.outbox)[0]!.operation
    state = await service.checkpoint(state.revision, {
      day: '2026-10-21',
      timezone: 'Asia/Tokyo',
      total: 10,
      fetchedAt: instant,
      identities: {},
    })
    expect(workspaceToday(state, instant, 'Asia/Tokyo')).toMatchObject({
      total: 11,
      scope: 'account',
    })

    // Act
    state = await service.markSent(operation.operationId)

    // Assert
    expect(workspaceToday(state, instant, 'Asia/Tokyo')).toMatchObject({
      total: 1,
      scope: 'device',
      stale: true,
      lastAccountTotal: 10,
    })
    expect(
      workspaceToday(state, instant + 86400000, 'Asia/Tokyo'),
    ).toMatchObject({ total: 0, scope: 'device', lastAccountTotal: null })
  })

  test('compaction waits for receipt, count reconciliation and Undo expiry, then preserves writing and identity evidence', async () => {
    // Arrange
    const { file, service, setNow } = await createWorkspace()
    let state = await service.execute(completionCommand(await file.read()))
    const operation = Object.values(state.outbox)[0]!.operation
    const projection = {
      completionId: completionA,
      revision: 1,
      cancelled: false,
      categoryId: 1,
      title: 'Original',
      completedAt: instant,
    }
    const checkpoint = {
      day: '2026-10-21',
      timezone: 'Asia/Tokyo',
      total: 1,
      fetchedAt: instant + 6000,
      identities: { [completionA]: projection },
    }
    state = await service.acceptReceipt('account-a', {
      operationId: operation.operationId,
      completionId: completionA,
      revision: 1,
      status: 'applied',
      projection,
    })
    state = await service.checkpoint(state.revision, checkpoint)
    expect(state.completions[completionA]).toBeDefined()

    // Act
    setNow(instant + 6000)
    state = await service.checkpoint(state.revision, checkpoint)

    // Assert
    expect(state.completions[completionA]).toBeUndefined()
    expect(state.retiredCompletions[completionA]).toEqual({
      completedAt: instant,
      originalCompletedAt: instant,
      originalCategoryId: 1,
      timezone: 'Asia/Tokyo',
      cancelled: false,
      revision: 1,
      remoteRevision: 1,
    })
    expect(state.drafts['1']!.rows.map((row) => row.text)).toEqual([
      '- [x] Original',
      'Later',
    ])
    expect(state.drafts['1']!.rows[0]).not.toHaveProperty('completionId')
    expect(workspaceToday(state, instant + 6000, 'Asia/Tokyo')).toMatchObject({
      total: 1,
      deviceTotal: 1,
      scope: 'account',
    })
    await expect(
      service.execute(completionCommand(state, completionA, 1)),
    ).rejects.toMatchObject({ reason: 'invalid-row' })
  })

  test('more than 2000 old acknowledged records can reconcile in bounded batches without blocking forever', async () => {
    // Arrange
    const { file, service } = await createWorkspace()
    const state = await service.execute(completionCommand(await file.read()))
    const original = state.completions[completionA]!
    state.outbox = {}
    state.completions = {}
    for (let index = 0; index < 2001; index++) {
      const id = randomUUID()
      state.completions[id] = {
        ...original,
        id,
        undoUntil: instant - 1,
        remote: {
          completionId: id,
          revision: 1,
          cancelled: false,
          categoryId: 1,
          title: 'Original',
          completedAt: instant,
        },
      }
    }

    // Act
    const tracked = checkpointIdentities(state, instant)

    // Assert
    expect(tracked).toMatchObject({ complete: true, total: 2001 })
    expect(tracked.completionIds).toHaveLength(2000)
    expect(new Set(tracked.completionIds).size).toBe(2000)
  })

  test('due completion clearing after restart keeps writing that replaced the completed occurrence', async () => {
    // Arrange
    const { file, service, setNow } = await createWorkspace()
    await service.execute({
      type: 'preferences',
      commandId: randomUUID(),
      expectedRevision: 0,
      patch: { liveEditorClearOnComplete: true, liveEditorClearDelayMs: 1000 },
    })
    let state = await service.execute(completionCommand(await file.read()))
    const rows = state.drafts['1']!.rows.map((row, index) =>
      index === 0 ? { ...row, text: 'Newer writing' } : row,
    )
    await service.execute({
      type: 'save',
      commandId: randomUUID(),
      categoryId: 1,
      baseRevision: state.drafts['1']!.revision,
      rows,
    })

    // Act
    setNow(instant + 2000)
    state = await service.clearDue()

    // Assert
    expect(state.drafts['1']!.rows.map((row) => row.text)).toEqual([
      'Newer writing',
      'Later',
    ])
    expect(state.completions[completionA]!.cleared).toBe(true)
  })
  test('preparation imports only verified categories and retains every unmapped legacy note', async () => {
    // Arrange / Act
    const { file } = await createWorkspace()
    const state = await file.read()

    // Assert
    expect(state.drafts['1']!.rows.map((row) => row.text)).toEqual([
      'Original',
      'Later',
    ])
    expect(state.migration.unmappedCategoryIds).toEqual(['999'])
    expect(JSON.stringify(state)).not.toContain('Unmapped writing')
    expect(state.drafts['999']).toBeUndefined()
    expect(state.selectedCategoryId).toBe(1)
  })

  test('completion acknowledgement atomically persists writing, outgoing identity and restart Undo', async () => {
    // Arrange
    const { file, service, options } = await createWorkspace(
      '  Original  \nLater',
      true,
    )
    const command = completionCommand(await file.read())

    // Act
    await service.execute(command)
    const restarted = new WorkspaceService(
      new AtomicWorkspaceFile(options),
      () => instant + 1000,
    )
    const state = await restarted.execute({
      type: 'undo',
      commandId: randomUUID(),
      completionId: completionA,
    })

    // Assert
    expect(state.drafts['1']!.rows.map((row) => row.text)).toEqual([
      '  Original  ',
      'Later',
    ])
    expect(state.completions[completionA]).toMatchObject({
      title: 'Original',
      rawText: '  Original  ',
      cancelled: true,
      restored: true,
      completedAt: instant,
      originalCompletedAt: instant,
      undoUntil: instant + 5000,
    })
    expect(
      Object.values(state.outbox).map((entry) => entry.operation.kind),
    ).toEqual(['cancel'])
  })

  test('identical titles remain separate completions and replaying one command creates no third record', async () => {
    // Arrange
    const { file, service } = await createWorkspace('Same\nSame')
    const first = completionCommand(await file.read())

    // Act
    await service.execute(first)
    await service.execute(first)
    const state = await service.execute(
      completionCommand(await file.read(), completionB, 1),
    )

    // Assert
    expect(Object.keys(state.completions)).toEqual([completionA, completionB])
    expect(Object.values(state.completions).map((item) => item.title)).toEqual([
      'Same',
      'Same',
    ])
    expect(Object.values(state.outbox)).toHaveLength(2)
  })

  test('reusing a command identity with different text fails without overwriting writing', async () => {
    // Arrange
    const { file, service } = await createWorkspace()
    const state = await file.read()
    const command = {
      type: 'save' as const,
      commandId: randomUUID(),
      categoryId: 1,
      baseRevision: 0,
      rows: state.drafts['1']!.rows,
    }
    await service.execute(command)

    // Act / Assert
    await expect(
      service.execute({
        ...command,
        rows: [{ ...command.rows[0], text: 'Different' }],
      }),
    ).rejects.toMatchObject({ reason: 'command-conflict' })
    expect((await file.read()).drafts['1']!.rows[0]!.text).toBe('Original')
  })

  test('a stale autosave cannot resurrect text cleared by completion', async () => {
    // Arrange
    const { file, service } = await createWorkspace('Original\nLater', true)
    const before = await file.read()
    await service.execute(completionCommand(before))

    // Act / Assert
    await expect(
      service.execute({
        type: 'save',
        commandId: randomUUID(),
        categoryId: 1,
        baseRevision: 0,
        rows: before.drafts['1']!.rows,
      }),
    ).rejects.toMatchObject({ reason: 'revision-conflict' })
    expect(
      (await file.read()).drafts['1']!.rows.map((row) => row.text),
    ).toEqual(['Later'])
  })

  test('Undo restores captured writing beside a later edit instead of replacing it', async () => {
    // Arrange
    const { file, service } = await createWorkspace()
    const completed = await service.execute(
      completionCommand(await file.read()),
    )
    const rows = completed.drafts['1']!.rows.map((row, index) =>
      index === 0 ? { ...row, text: 'Newer writing' } : row,
    )
    await service.execute({
      type: 'save',
      commandId: randomUUID(),
      categoryId: 1,
      baseRevision: 1,
      rows,
    })

    // Act
    const restored = await service.execute({
      type: 'undo',
      commandId: randomUUID(),
      completionId: completionA,
    })
    const repeated = await service.execute({
      type: 'undo',
      commandId: randomUUID(),
      completionId: completionA,
    })

    // Assert
    expect(restored.drafts['1']!.rows.map((row) => row.text)).toEqual([
      'Original',
      'Newer writing',
      'Later',
    ])
    expect(repeated.drafts['1']!.rows.map((row) => row.text)).toEqual([
      'Original',
      'Newer writing',
      'Later',
    ])
  })

  test('restart never extends the original Undo deadline', async () => {
    // Arrange
    const { file, service, options } = await createWorkspace()
    await service.execute(completionCommand(await file.read()))
    const restarted = new WorkspaceService(
      new AtomicWorkspaceFile(options),
      () => instant + 5001,
    )

    // Act / Assert
    await expect(
      restarted.execute({
        type: 'undo',
        commandId: randomUUID(),
        completionId: completionA,
      }),
    ).rejects.toMatchObject({ reason: 'undo-expired' })
    expect((await file.read()).completions[completionA]!.cancelled).toBe(false)
  })

  test('removed categories remain accessible and chained moves preserve both destination writing and Undo', async () => {
    // Arrange
    const { file, service } = await createWorkspace()
    let state = await service.execute(completionCommand(await file.read()))
    state = await service.refreshCategories(
      state.categories.filter((category) => category.id !== 1),
    )
    expect(
      state.categories.find((category) => category.id === 1)?.removed,
    ).toBe(true)
    await service.execute({
      type: 'moveCategory',
      commandId: randomUUID(),
      sourceId: 1,
      destinationId: 2,
    })
    await service.execute({
      type: 'moveCategory',
      commandId: randomUUID(),
      sourceId: 2,
      destinationId: 3,
    })

    // Act
    state = await service.execute({
      type: 'undo',
      commandId: randomUUID(),
      completionId: completionA,
    })

    // Assert
    expect(state.drafts['3']!.rows.map((row) => row.text)).toEqual([
      'Target writing',
      '',
      'Original',
      'Later',
    ])
    expect(state.drafts['1']).toBeUndefined()
    expect(state.drafts['2']).toBeUndefined()
    expect(state.completions[completionA]!.categoryId).toBe(3)
    expect(state.selectedCategoryId).toBe(3)
    expect(
      Object.values(state.outbox).map((entry) => [
        entry.operation.kind,
        entry.operation.categoryId,
      ]),
    ).toEqual([['cancel', 3]])
  })

  test('a confirmed move waits for an uncertain create receipt without rewriting its bytes', async () => {
    // Arrange
    const { file, service } = await createWorkspace()
    const completed = await service.execute(
      completionCommand(await file.read()),
    )
    const original = Object.values(completed.outbox)[0]!.operation
    await service.markSent(original.operationId)

    // Act
    const moved = await service.execute({
      type: 'moveCategory',
      commandId: randomUUID(),
      sourceId: 1,
      destinationId: 2,
    })
    const acknowledged = await service.acceptReceipt('account-a', {
      operationId: original.operationId,
      completionId: completionA,
      revision: 1,
      status: 'applied',
      projection: {
        completionId: completionA,
        revision: 1,
        cancelled: false,
        title: 'Original',
        categoryId: 1,
        completedAt: instant,
      },
    })

    // Assert
    expect(moved.outbox[original.operationId]!.operation).toEqual(original)
    expect(
      Object.values(acknowledged.outbox).map((entry) => [
        entry.operation.kind,
        entry.operation.revision,
        entry.operation.categoryId,
        entry.operation.expectedRemoteRevision,
      ]),
    ).toEqual([['relocate', 2, 2, 1]])
  })

  test('Undo during delivery survives a late create acknowledgement without resurrection', async () => {
    // Arrange
    const { file, service } = await createWorkspace()
    const completed = await service.execute(
      completionCommand(await file.read()),
    )
    const original = Object.values(completed.outbox)[0]!.operation
    await service.markSent(original.operationId)
    await service.execute({
      type: 'undo',
      commandId: randomUUID(),
      completionId: completionA,
    })

    // Act
    const state = await service.acceptReceipt('account-a', {
      operationId: original.operationId,
      completionId: completionA,
      revision: 1,
      status: 'applied',
      projection: {
        completionId: completionA,
        revision: 1,
        cancelled: false,
        title: 'Original',
        categoryId: 1,
        completedAt: instant,
      },
    })

    // Assert
    expect(state.completions[completionA]!.cancelled).toBe(true)
    expect(state.drafts['1']!.rows.map((row) => row.text)).toEqual([
      'Original',
      'Later',
    ])
    expect(
      Object.values(state.outbox).map((entry) => entry.operation.kind),
    ).toEqual(['cancel'])
  })

  test('time correction preserves the original time and completion identity', async () => {
    // Arrange
    const { file, service } = await createWorkspace()
    await service.execute(completionCommand(await file.read()))

    // Act
    const state = await service.execute({
      type: 'correctTime',
      commandId: randomUUID(),
      completionId: completionA,
      completedAt: instant - 60000,
    })

    // Assert
    expect(Object.keys(state.completions)).toEqual([completionA])
    expect(state.completions[completionA]).toMatchObject({
      completedAt: instant - 60000,
      originalCompletedAt: instant,
      revision: 2,
    })
    expect(
      Object.values(state.outbox).map((entry) => [
        entry.operation.kind,
        entry.operation.completedAt,
      ]),
    ).toEqual([['create', instant - 60000]])
  })

  test('preference patches do not fill defaults over unrelated saved settings', async () => {
    // Arrange
    const { service } = await createWorkspace()
    await service.execute({
      type: 'preferences',
      commandId: randomUUID(),
      expectedRevision: 0,
      patch: { liveEditorFontFamily: 'serif', liveEditorFontSize: 24 },
    })

    // Act
    const state = await service.execute({
      type: 'preferences',
      commandId: randomUUID(),
      expectedRevision: 1,
      patch: { showTodayEmber: true },
    })

    // Assert
    expect(state.preferences.settings).toMatchObject({
      showTodayEmber: true,
      liveEditorFontFamily: 'serif',
      liveEditorFontSize: 24,
    })
  })

  test('an old account receipt cannot mutate the current workspace', async () => {
    // Arrange
    const { file, service } = await createWorkspace()
    const state = await service.execute(completionCommand(await file.read()))
    const operation = Object.values(state.outbox)[0]!.operation

    // Act / Assert
    await expect(
      service.acceptReceipt('account-b', {
        operationId: operation.operationId,
        completionId: completionA,
        revision: 1,
        status: 'applied',
        projection: {
          completionId: completionA,
          revision: 1,
          cancelled: false,
          categoryId: 1,
          title: 'Original',
          completedAt: instant,
        },
      }),
    ).rejects.toMatchObject({ reason: 'command-conflict' })
    expect(Object.values((await file.read()).outbox)).toHaveLength(1)
  })

  test('a terminal remote cancellation restores writing only after a choice and never replays a new keep', async () => {
    // Arrange
    const { file, service } = await createWorkspace()
    const initial = await service.execute(completionCommand(await file.read()))
    const operation = Object.values(initial.outbox)[0]!.operation

    // Act
    const conflicted = await service.acceptReceipt('account-a', {
      operationId: operation.operationId,
      completionId: completionA,
      revision: 1,
      status: 'applied',
      projection: {
        completionId: completionA,
        revision: 2,
        cancelled: true,
        categoryId: 1,
        title: 'Original',
        completedAt: instant,
      },
    })
    const restored = await service.execute({
      type: 'resolveConflict',
      commandId: randomUUID(),
      completionId: completionA,
      choice: 'local',
      expectedRemoteRevision: 2,
      expectedLocalRevision: 1,
    })

    // Assert
    expect(Object.values(conflicted.outbox)[0]?.failure).toBe('conflict')
    expect(restored.drafts['1']!.rows.map((row) => row.text)).toEqual([
      'Original',
      'Later',
    ])
    expect(restored.completions[completionA]).toMatchObject({
      cancelled: true,
      restored: true,
    })
    expect(Object.values(restored.outbox)).toEqual([])
  })

  test('an acknowledgement missing its identity projection cannot retire queued work', async () => {
    // Arrange
    const { file, service } = await createWorkspace()
    const state = await service.execute(completionCommand(await file.read()))
    const operation = Object.values(state.outbox)[0]!.operation

    // Act / Assert
    await expect(
      service.acceptReceipt('account-a', {
        operationId: operation.operationId,
        completionId: completionA,
        revision: 1,
        status: 'applied',
        projection: null,
      }),
    ).rejects.toThrow()
    expect(Object.values((await file.read()).outbox)).toHaveLength(1)
  })
})

test('stale conflict confirmation cannot replace a newer server version the user never reviewed', async () => {
  // Arrange
  const { file, service } = await createWorkspace()
  const initial = await service.execute(completionCommand(await file.read()))
  const operation = Object.values(initial.outbox)[0]!.operation
  await service.acceptReceipt('account-a', {
    operationId: operation.operationId,
    completionId: completionA,
    revision: 1,
    status: 'rejected',
    reason: 'conflict',
    projection: {
      completionId: completionA,
      revision: 3,
      cancelled: false,
      categoryId: 1,
      title: 'Newer server writing',
      completedAt: instant,
    },
  })

  // Act / Assert
  await expect(
    service.execute({
      type: 'resolveConflict',
      commandId: randomUUID(),
      completionId: completionA,
      choice: 'local',
      expectedRemoteRevision: 2,
      expectedLocalRevision: 1,
    }),
  ).rejects.toMatchObject({ reason: 'revision-conflict' })
  const state = await file.read()
  expect(state.completions[completionA]!.remote!.title).toBe(
    'Newer server writing',
  )
  expect(Object.values(state.outbox)[0]!.state).toBe('blocked')
  expect(state.recoveryCopies).toHaveLength(0)
})

test('retrying a rejected dependency queues one new operation while keeping the completion identity and original time', async () => {
  // Arrange
  const { file, service } = await createWorkspace()
  const initial = await service.execute(completionCommand(await file.read()))
  const operation = Object.values(initial.outbox)[0]!.operation
  await service.acceptReceipt('account-a', {
    operationId: operation.operationId,
    completionId: completionA,
    revision: 1,
    status: 'rejected',
    reason: 'dependency',
    projection: null,
  })

  // Act
  const command = {
    type: 'retrySync' as const,
    commandId: randomUUID(),
    completionId: completionA,
  }
  await service.execute(command)
  const retried = await service.execute(command)

  // Assert
  expect(Object.values(retried.outbox)).toHaveLength(1)
  expect(Object.values(retried.outbox)[0]).toMatchObject({
    state: 'queued',
    operation: {
      completionId: completionA,
      kind: 'create',
      revision: 2,
      originalCompletedAt: instant,
    },
  })
  expect(Object.values(retried.outbox)[0]!.operation.operationId).not.toBe(
    operation.operationId,
  )
})
