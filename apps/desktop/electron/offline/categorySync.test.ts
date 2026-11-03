import { randomUUID } from 'node:crypto'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import type { EditorCategory } from '@corelive/desktop-contract/offline-workspace'
import {
  DEVICE_OWNER_ID,
  DEVICE_WORKSPACE_FILE_NAME,
  OfflineWorkspaceSchema,
  type OfflineWorkspace,
  type WorkspaceCommand,
} from '@corelive/desktop-contract/offline-workspace-v2'
import { afterEach, describe, expect, test } from 'vitest'

import { AtomicWorkspaceFile } from './AtomicWorkspaceFile'
import {
  dashboardPaths,
  localPaths,
  runPass,
  runUntilSettled,
  sendPending,
} from './categorySyncTestkit'
import { buildDeviceWorkspace, categoryUuid } from './deviceWorkspaceFixture'
import { createFakeDashboard } from './fakeDashboard'
import { WorkspaceCommandError } from './WorkspaceCommandError'
import { WorkspaceService } from './WorkspaceService'

const accountId = 'account-a'
const directories: string[] = []
const general = categoryUuid(1)
const work = categoryUuid(2)

afterEach(async () => {
  await Promise.all(
    directories.splice(0).map(async (path) => rm(path, { recursive: true })),
  )
})

/** Builds a server category row. */
function remoteCategory(
  id: number,
  name: string,
  extra: Partial<EditorCategory> = {},
): EditorCategory {
  return {
    id,
    name,
    color: 'blue',
    isDefault: false,
    parentId: null,
    removed: false,
    ...extra,
  }
}

/**
 * An unbound device workspace plus a fake dashboard holding the same default category.
 * @example const fx = await createFixture({ local: ['General', 'Work'] })
 */
async function createFixture(
  input: {
    local?: string[]
    remote?: EditorCategory[]
    notes?: Record<number, string>
  } = {},
) {
  const directory = await mkdtemp(join(tmpdir(), 'corelive-category-sync-'))
  directories.push(directory)
  const file = new AtomicWorkspaceFile({
    directory,
    ownerId: DEVICE_OWNER_ID,
    fileName: DEVICE_WORKSPACE_FILE_NAME,
    parse: OfflineWorkspaceSchema.parse,
  })
  await file.initialize(
    buildDeviceWorkspace({
      categoryNames: input.local ?? ['General', 'Work'],
      notes: input.notes ?? {},
    }),
  )
  let counter = 100
  const service = new WorkspaceService(
    file,
    () => 1_800_000_000_000,
    () => categoryUuid(counter++),
  )
  const dashboard = createFakeDashboard(
    input.remote ?? [
      remoteCategory(1, 'General', { isDefault: true }),
      remoteCategory(2, 'Work'),
    ],
  )
  const command = async (
    body: Omit<WorkspaceCommand, 'commandId'> & Record<string, unknown>,
  ): Promise<OfflineWorkspace> =>
    service.execute({ ...body, commandId: randomUUID() })
  const reopen = (): WorkspaceService =>
    new WorkspaceService(
      file,
      () => 1_800_000_000_000,
      () => categoryUuid(counter++),
    )
  return { file, service, dashboard, command, reopen }
}

/** The refusal reason of a command that must be refused. */
async function refusal(
  promise: Promise<unknown>,
): Promise<{ reason: string; detail?: string }> {
  try {
    await promise
  } catch (error) {
    if (error instanceof WorkspaceCommandError)
      return { reason: error.reason, detail: error.detail }
    throw error
  }
  throw new Error('Expected a refusal')
}

describe('attaching with local categories (C19, D4)', () => {
  test('categories edited while detached reach the dashboard on attach with no spurious conflict', async () => {
    // Arrange
    const fx = await createFixture()
    const idea = randomUUID()
    await fx.command({
      type: 'categoryCreate',
      categoryId: idea,
      name: 'Ideas',
      color: 'rose',
      parentId: null,
    })
    await fx.command({
      type: 'categoryRecolor',
      categoryId: work,
      color: 'amber',
    })
    await fx.command({
      type: 'categoryRecolor',
      categoryId: general,
      color: 'green',
    })

    // Act: attach, then edit again and refresh once more.
    await runUntilSettled(fx.service, fx.dashboard, accountId)
    await fx.command({
      type: 'categoryRecolor',
      categoryId: idea,
      color: 'violet',
    })
    await runUntilSettled(fx.service, fx.dashboard, accountId)

    // Assert
    const state = await fx.file.read()
    expect(dashboardPaths(fx.dashboard)).toEqual({
      General: 'green',
      Work: 'amber',
      Ideas: 'violet',
    })
    expect(localPaths(state)).toEqual(dashboardPaths(fx.dashboard))
    expect(state.binding?.declined).toEqual({})
  })

  test('the local default pairs with the dashboard default even when its color differs', async () => {
    // Arrange
    const fx = await createFixture({
      remote: [
        remoteCategory(7, 'General', { isDefault: true, color: 'rose' }),
      ],
      local: ['General'],
    })

    // Act
    await runUntilSettled(fx.service, fx.dashboard, accountId)

    // Assert
    const state = await fx.file.read()
    expect(state.binding?.serverCategoryIds[general]).toBe(7)
    expect(dashboardPaths(fx.dashboard)).toEqual({ General: 'blue' })
  })

  test('a replayed create that adopts a same-path dashboard category recolors it without another refresh', async () => {
    // Arrange: the local Work is blue; the dashboard Work is rose.
    const fx = await createFixture({
      remote: [
        remoteCategory(1, 'General', { isDefault: true }),
        remoteCategory(2, 'Work', { color: 'rose' }),
      ],
    })

    // Act
    await runUntilSettled(fx.service, fx.dashboard, accountId)

    // Assert: matched by name path, local blue is a local edit and wins.
    expect(dashboardPaths(fx.dashboard).Work).toBe('blue')
    expect(
      (await fx.file.read()).categories.filter((c) => c.name === 'Work'),
    ).toHaveLength(1)
  })
})

describe('three-way merge of one field (D4 table, C8, C18)', () => {
  test('a dashboard rename applies locally when this Mac did not change the name', async () => {
    // Arrange
    const fx = await createFixture()
    await runUntilSettled(fx.service, fx.dashboard, accountId)
    fx.dashboard.webRename(2, 'Clients')

    // Act
    await runUntilSettled(fx.service, fx.dashboard, accountId)

    // Assert
    expect(localPaths(await fx.file.read())).toEqual({
      General: 'blue',
      Clients: 'blue',
    })
  })

  test('both sides renaming shows the dashboard name and keeps this Mac name as a row that Use applies with the new expected value', async () => {
    // Arrange
    const fx = await createFixture()
    await runUntilSettled(fx.service, fx.dashboard, accountId)
    await fx.command({ type: 'categoryRename', categoryId: work, name: 'Mine' })
    fx.dashboard.webRename(2, 'Theirs')

    // Act
    await runUntilSettled(fx.service, fx.dashboard, accountId)
    const rows = (await fx.service.syncDetails()).rows

    // Assert: dashboard wins visibly, Mac value kept as a row.
    expect(localPaths(await fx.file.read())).toEqual({
      General: 'blue',
      Theirs: 'blue',
    })
    expect(rows).toEqual([
      expect.objectContaining({
        type: 'conflict',
        field: 'name',
        macValue: 'Mine',
        dashboardValue: 'Theirs',
        actions: ['use-mac-value', 'keep-dashboard-value'],
      }),
    ])

    // Act: Use "Mine" queues a rename whose expected is the dashboard value just received (C24).
    await fx.command({
      type: 'syncDetailAction',
      rowId: rows[0]!.id,
      action: 'use-mac-value',
    })
    await runUntilSettled(fx.service, fx.dashboard, accountId)
    expect(dashboardPaths(fx.dashboard)).toEqual({
      General: 'blue',
      Mine: 'blue',
    })
    const renames = fx.dashboard.applied().filter((op) => op.type === 'rename')
    expect(renames.at(-1)).toMatchObject({
      name: 'Mine',
      expected: { name: 'Theirs' },
    })
    expect((await fx.service.syncDetails()).rows).toEqual([])
    expect((await fx.service.syncDetails()).history[0]).toMatchObject({
      kind: 'resolved',
      field: 'name',
    })
  })

  test('Keep dashboard value queues nothing and moves the conflict row to History', async () => {
    // Arrange
    const fx = await createFixture()
    await runUntilSettled(fx.service, fx.dashboard, accountId)
    await fx.command({
      type: 'categoryRecolor',
      categoryId: work,
      color: 'green',
    })
    fx.dashboard.webRecolor(2, 'rose')
    await runUntilSettled(fx.service, fx.dashboard, accountId)
    const [row] = (await fx.service.syncDetails()).rows
    const sentBefore = fx.dashboard.applied().length

    // Act
    await fx.command({
      type: 'syncDetailAction',
      rowId: row!.id,
      action: 'keep-dashboard-value',
    })
    await runUntilSettled(fx.service, fx.dashboard, accountId)

    // Assert
    expect(fx.dashboard.applied()).toHaveLength(sentBefore)
    expect((await fx.service.syncDetails()).rows).toEqual([])
    expect(localPaths(await fx.file.read()).Work).toBe('rose')
  })

  test('a rename the dashboard rejects as name-taken stays declined across two refreshes and never re-queues', async () => {
    // Arrange: refresh once, rename locally, then the dashboard gains the same name before sending.
    const fx = await createFixture()
    await runUntilSettled(fx.service, fx.dashboard, accountId)
    await fx.command({
      type: 'categoryRename',
      categoryId: work,
      name: 'Ideas',
    })
    await fx.service.reconcileCategories({
      ...fx.dashboard.bootstrap(accountId),
      displayEmail: null,
    })
    fx.dashboard.webCreate('Ideas')
    await sendPending(fx.service, fx.dashboard, accountId)

    // Act
    await runPass(fx.service, fx.dashboard, accountId)
    await runPass(fx.service, fx.dashboard, accountId)

    // Assert
    const renames = fx.dashboard.applied().filter((op) => op.type === 'rename')
    expect(renames).toHaveLength(0)
    const state = await fx.file.read()
    expect(Object.values(state.categoryOutbox)).toEqual([])
    const [row] = (await fx.service.syncDetails()).rows
    expect(row).toMatchObject({
      type: 'name-taken',
      categoryPath: 'Work',
      macValue: 'Ideas',
      dashboardValue: 'Work',
      actions: ['choose-another-name', 'keep-dashboard-value'],
    })
    // The local set stays valid (EA5): the colliding desired name is not applied locally.
    expect(localPaths(state)).toEqual({
      General: 'blue',
      Work: 'blue',
      Ideas: 'blue',
    })

    // Act: Choose another name queues a fresh rename with expected = the dashboard name.
    await fx.command({
      type: 'syncDetailAction',
      rowId: row!.id,
      action: 'choose-another-name',
      name: 'Notes',
    })
    await runUntilSettled(fx.service, fx.dashboard, accountId)
    expect(dashboardPaths(fx.dashboard)).toEqual({
      General: 'blue',
      Notes: 'blue',
      Ideas: 'blue',
    })
  })

  test('a later recolor of the same category still sends after its rename was declined', async () => {
    // Arrange
    const fx = await createFixture()
    await runUntilSettled(fx.service, fx.dashboard, accountId)
    await fx.command({
      type: 'categoryRename',
      categoryId: work,
      name: 'Ideas',
    })
    await fx.service.reconcileCategories({
      ...fx.dashboard.bootstrap(accountId),
      displayEmail: null,
    })
    fx.dashboard.webCreate('Ideas')
    await sendPending(fx.service, fx.dashboard, accountId)

    // Act
    await fx.command({
      type: 'categoryRecolor',
      categoryId: work,
      color: 'violet',
    })
    await runUntilSettled(fx.service, fx.dashboard, accountId)

    // Assert
    expect(dashboardPaths(fx.dashboard).Work).toBe('violet')
  })

  test('a re-edit during send keeps the newer value when a conflict receipt arrives (EA5)', async () => {
    // Arrange
    const fx = await createFixture()
    await runUntilSettled(fx.service, fx.dashboard, accountId)
    fx.dashboard.webRename(2, 'Server')
    await fx.command({
      type: 'categoryRename',
      categoryId: work,
      name: 'First',
    })
    // Derive against a stale view (the dashboard has not been re-read), then freeze.
    await fx.service.reconcileCategories({
      accountId,
      displayEmail: null,
      categories: [
        remoteCategory(1, 'General', { isDefault: true }),
        remoteCategory(2, 'Work'),
      ],
      deletions: [],
    })
    const [entry] = (await fx.service.categoryPending(16)).sendable
    const [sent] = await fx.service.markCategorySent(accountId, [
      entry!.operation.operationId,
    ])

    // Act: the user edits again while the request is in flight, then the conflict arrives.
    await fx.command({
      type: 'categoryRename',
      categoryId: work,
      name: 'Second',
    })
    await fx.service.acceptCategoryReceipts(
      accountId,
      fx.dashboard.apply([sent!.wire!]).receipts,
    )

    // Assert
    const state = await fx.file.read()
    expect(state.categories.find((c) => c.id === work)?.name).toBe('Second')
    expect(state.binding?.base[work]?.name).toBe('Server')
    await runUntilSettled(fx.service, fx.dashboard, accountId)
    expect(dashboardPaths(fx.dashboard)).toEqual({
      General: 'blue',
      Second: 'blue',
    })
  })

  test('local A to C plus dashboard B to C leaves one root named C and a Choose another name row (EA5)', async () => {
    // Arrange
    const fx = await createFixture({
      local: ['General', 'A', 'B'],
      remote: [
        remoteCategory(1, 'General', { isDefault: true }),
        remoteCategory(2, 'A'),
        remoteCategory(3, 'B'),
      ],
    })
    await runUntilSettled(fx.service, fx.dashboard, accountId)
    await fx.command({ type: 'categoryRename', categoryId: work, name: 'C' })
    fx.dashboard.webRename(3, 'C')

    // Act
    await runUntilSettled(fx.service, fx.dashboard, accountId)

    // Assert
    const state = await fx.file.read()
    expect(Object.keys(localPaths(state)).sort()).toEqual(['A', 'C', 'General'])
    const rows = (await fx.service.syncDetails()).rows
    expect(rows).toEqual([
      expect.objectContaining({
        type: 'name-taken',
        macValue: 'C',
        actions: ['choose-another-name', 'keep-dashboard-value'],
      }),
    ])
  })

  test('an offline name swap converges through one renameSet (EA7)', async () => {
    // Arrange
    const fx = await createFixture({
      local: ['General', 'A', 'B'],
      remote: [
        remoteCategory(1, 'General', { isDefault: true }),
        remoteCategory(2, 'A'),
        remoteCategory(3, 'B'),
      ],
    })
    await runUntilSettled(fx.service, fx.dashboard, accountId)
    const a = work
    const b = categoryUuid(3)
    await fx.command({ type: 'categoryRename', categoryId: a, name: 'tmp' })
    await fx.command({ type: 'categoryRename', categoryId: b, name: 'A' })
    await fx.command({ type: 'categoryRename', categoryId: a, name: 'B' })

    // Act
    await runUntilSettled(fx.service, fx.dashboard, accountId)

    // Assert
    const dashboardNames = fx.dashboard.categories().map((c) => [c.id, c.name])
    expect(dashboardNames).toEqual([
      [1, 'General'],
      [2, 'B'],
      [3, 'A'],
    ])
    expect(
      fx.dashboard.applied().filter((op) => op.type === 'renameSet'),
    ).toHaveLength(1)
  })
})

describe('local category commands (C5, C16, C17, DA8, EA8)', () => {
  test.each([
    [
      'default rename',
      { type: 'categoryRename', categoryId: general, name: 'Home' },
      'default-locked',
    ],
    [
      'default reparent',
      { type: 'categoryReparent', categoryId: general, parentId: work },
      'default-locked',
    ],
    [
      'default delete',
      { type: 'categoryDelete', categoryId: general, destinationId: work },
      'default-locked',
    ],
    [
      'duplicate root name',
      {
        type: 'categoryCreate',
        categoryId: randomUUID(),
        name: 'Work',
        color: 'blue',
        parentId: null,
      },
      'name-taken-local',
    ],
    [
      'empty name',
      { type: 'categoryRename', categoryId: work, name: '   ' },
      'invalid-name',
    ],
    [
      '31 characters',
      { type: 'categoryRename', categoryId: work, name: 'x'.repeat(31) },
      'invalid-name',
    ],
    [
      'self parent',
      { type: 'categoryReparent', categoryId: work, parentId: work },
      'invalid-parent',
    ],
  ] as const)(
    'refuses %s with %s and queues nothing',
    async (_label, body, reason) => {
      // Arrange
      const fx = await createFixture()

      // Act
      const result = await refusal(fx.command(body))

      // Assert
      expect(result.reason).toBe(reason)
      expect(Object.keys((await fx.file.read()).categoryOutbox)).toEqual([])
    },
  )

  test('a third level is refused with invalid-parent', async () => {
    // Arrange
    const fx = await createFixture()
    const child = randomUUID()
    await fx.command({
      type: 'categoryCreate',
      categoryId: child,
      name: 'Kid',
      color: 'blue',
      parentId: work,
    })

    // Act
    const result = await refusal(
      fx.command({
        type: 'categoryCreate',
        categoryId: randomUUID(),
        name: 'Grandkid',
        color: 'blue',
        parentId: child,
      }),
    )

    // Assert
    expect(result.reason).toBe('invalid-parent')
  })

  test('a delete whose child would collide with a root name is refused with the child name (EA8)', async () => {
    // Arrange
    const fx = await createFixture()
    await fx.command({
      type: 'categoryCreate',
      categoryId: randomUUID(),
      name: 'Kid',
      color: 'blue',
      parentId: work,
    })
    await fx.command({
      type: 'categoryCreate',
      categoryId: randomUUID(),
      name: 'Kid',
      color: 'blue',
      parentId: null,
    })

    // Act
    const result = await refusal(
      fx.command({
        type: 'categoryDelete',
        categoryId: work,
        destinationId: general,
      }),
    )

    // Assert
    expect(result).toEqual({ reason: 'name-taken-local', detail: 'Kid' })
  })

  test('creating a category selects it and deleting one moves its writing to the destination', async () => {
    // Arrange
    const fx = await createFixture({ notes: { 2: 'Work notes' } })
    const created = randomUUID()

    // Act
    const afterCreate = await fx.command({
      type: 'categoryCreate',
      categoryId: created,
      name: 'Ideas',
      color: 'rose',
      parentId: null,
    })
    const afterDelete = await fx.command({
      type: 'categoryDelete',
      categoryId: work,
      destinationId: general,
    })

    // Assert
    expect(afterCreate.selectedCategoryId).toBe(created)
    expect(afterDelete.drafts[general]!.rows.map((r) => r.text)).toContain(
      'Work notes',
    )
    expect(afterDelete.categoryMoves[work]).toBe(general)
  })
})

describe('local delete and its dashboard outcomes (D4, EA8)', () => {
  /** Syncs a parent with a child, then deletes the parent locally and derives the delete. */
  async function deleteParentFixture() {
    const fx = await createFixture({
      local: ['General', 'Parent'],
      remote: [
        remoteCategory(1, 'General', { isDefault: true }),
        remoteCategory(2, 'Parent'),
        remoteCategory(3, 'Kid', { parentId: 2 }),
      ],
    })
    await runUntilSettled(fx.service, fx.dashboard, accountId)
    return fx
  }

  test('deleting a parent offline deletes it on the dashboard and promotes its child without a reparent', async () => {
    // Arrange
    const fx = await deleteParentFixture()
    await fx.command({
      type: 'categoryDelete',
      categoryId: work,
      destinationId: general,
    })

    // Act
    await runUntilSettled(fx.service, fx.dashboard, accountId)

    // Assert
    expect(dashboardPaths(fx.dashboard)).toEqual({
      General: 'blue',
      Kid: 'blue',
    })
    expect(fx.dashboard.applied().map((op) => op.type)).toEqual(['delete'])
    expect(localPaths(await fx.file.read())).toEqual({
      General: 'blue',
      Kid: 'blue',
    })
  })

  test('a dashboard delete-blocked keeps the local delete, lists Rename child, and is not regenerated after refreshes and a relaunch', async () => {
    // Arrange
    const fx = await deleteParentFixture()
    await fx.command({
      type: 'categoryDelete',
      categoryId: work,
      destinationId: general,
    })
    await fx.service.reconcileCategories({
      ...fx.dashboard.bootstrap(accountId),
      displayEmail: null,
    })
    fx.dashboard.webCreate('Kid') // a root named Kid appears before the delete is sent
    await sendPending(fx.service, fx.dashboard, accountId)

    // Act
    await runPass(fx.service, fx.dashboard, accountId)
    await runPass(fx.service, fx.dashboard, accountId)
    const relaunched = fx.reopen()
    await runPass(relaunched, fx.dashboard, accountId)

    // Assert
    expect(
      fx.dashboard.applied().filter((op) => op.type === 'delete'),
    ).toHaveLength(0)
    const [row] = (await relaunched.syncDetails()).rows
    expect(row).toMatchObject({
      type: 'delete-blocked',
      categoryPath: 'Parent',
      childName: 'Kid',
      actions: ['choose-another-name', 'keep-dashboard-value'],
    })
    expect((await fx.file.read()).categories.some((c) => c.id === work)).toBe(
      false,
    )

    // Act: Rename "Kid" retries the delete.
    await relaunched.execute({
      type: 'syncDetailAction',
      commandId: randomUUID(),
      rowId: row!.id,
      action: 'choose-another-name',
      name: 'Kid2',
    })
    await runUntilSettled(relaunched, fx.dashboard, accountId)

    // Assert
    expect(dashboardPaths(fx.dashboard)).toEqual({
      General: 'blue',
      Kid: 'blue',
      Kid2: 'blue',
    })
  })

  test('Keep it on the dashboard re-adds the blocked category empty under a new local id', async () => {
    // Arrange
    const fx = await deleteParentFixture()
    await fx.command({
      type: 'categoryDelete',
      categoryId: work,
      destinationId: general,
    })
    await fx.service.reconcileCategories({
      ...fx.dashboard.bootstrap(accountId),
      displayEmail: null,
    })
    fx.dashboard.webCreate('Kid')
    await sendPending(fx.service, fx.dashboard, accountId)
    const [row] = (await fx.service.syncDetails()).rows

    // Act
    await fx.command({
      type: 'syncDetailAction',
      rowId: row!.id,
      action: 'keep-dashboard-value',
    })
    await runUntilSettled(fx.service, fx.dashboard, accountId)

    // Assert
    const state = await fx.file.read()
    const readded = state.categories.find((c) => c.name === 'Parent')
    expect(readded?.id).not.toBe(work)
    expect(state.binding?.serverCategoryIds[readded!.id]).toBe(2)
    expect(state.drafts[readded!.id]!.rows.map((r) => r.text)).toEqual([''])
    expect(localPaths(state)).toEqual(dashboardPaths(fx.dashboard))
  })
})

describe('mirroring dashboard deletions (D4, EA11c)', () => {
  test('a dashboard delete with no draft removes the category, records the destination and promotes children', async () => {
    // Arrange
    const fx = await createFixture({
      local: ['General', 'Parent'],
      remote: [
        remoteCategory(1, 'General', { isDefault: true }),
        remoteCategory(2, 'Parent'),
        remoteCategory(3, 'Kid', { parentId: 2 }),
      ],
    })
    await runUntilSettled(fx.service, fx.dashboard, accountId)
    fx.dashboard.webDelete(2, 1)

    // Act
    await runUntilSettled(fx.service, fx.dashboard, accountId)

    // Assert
    const state = await fx.file.read()
    expect(state.categoryMoves[work]).toBe(general)
    expect(localPaths(state)).toEqual({ General: 'blue', Kid: 'blue' })
  })

  test('a dashboard delete of a category with draft text keeps a removed recovery entry with the suggested destination', async () => {
    // Arrange
    const fx = await createFixture({ notes: { 2: 'Do not lose me' } })
    await runUntilSettled(fx.service, fx.dashboard, accountId)
    fx.dashboard.webDelete(2, 1)

    // Act
    await runUntilSettled(fx.service, fx.dashboard, accountId)

    // Assert
    const state = await fx.file.read()
    expect(state.categories.find((c) => c.id === work)).toMatchObject({
      removed: true,
    })
    expect(state.drafts[work]!.rows.map((r) => r.text)).toEqual([
      'Do not lose me',
    ])
    expect(state.binding?.deletionReceipts[work]).toBe(general)
  })

  test('a chain that ends at a category the account no longer has falls back to the default with a History entry', async () => {
    // Arrange
    const fx = await createFixture({
      local: ['General', 'Work', 'Old'],
      remote: [
        remoteCategory(1, 'General', { isDefault: true }),
        remoteCategory(2, 'Work'),
        remoteCategory(3, 'Old'),
      ],
    })
    await runUntilSettled(fx.service, fx.dashboard, accountId)
    fx.dashboard.webDelete(3, 2)
    fx.dashboard.webDelete(2, 99) // chain: Old -> Work -> 99 (unknown)

    // Act
    await runUntilSettled(fx.service, fx.dashboard, accountId)

    // Assert
    const state = await fx.file.read()
    expect(state.categoryMoves[categoryUuid(3)]).toBe(general)
    expect(
      (await fx.service.syncDetails()).history.map((item) => item.kind),
    ).toContain('server-delete-unknown-destination')
  })

  test('a cyclic deletion chain terminates and falls back to the default category', async () => {
    // Arrange
    const fx = await createFixture({
      local: ['General', 'Work'],
      remote: [
        remoteCategory(1, 'General', { isDefault: true }),
        remoteCategory(2, 'Work'),
      ],
    })
    await runUntilSettled(fx.service, fx.dashboard, accountId)
    fx.dashboard.webDelete(2, 5)
    fx.dashboard.webDelete(5, 2)

    // Act
    await runUntilSettled(fx.service, fx.dashboard, accountId)

    // Assert
    expect((await fx.file.read()).categoryMoves[work]).toBe(general)
    expect(
      (await fx.service.syncDetails()).history.map((item) => item.kind),
    ).toContain('server-delete-cycle')
  })
})

describe('delivery safety (EA3, EA4, EA16)', () => {
  test('a lost response is recovered from the stored receipt without a second server write', async () => {
    // Arrange
    const fx = await createFixture()
    await runUntilSettled(fx.service, fx.dashboard, accountId)
    await fx.command({
      type: 'categoryRecolor',
      categoryId: work,
      color: 'violet',
    })
    await fx.service.reconcileCategories({
      ...fx.dashboard.bootstrap(accountId),
      displayEmail: null,
    })
    const [queued] = (await fx.service.categoryPending(16)).sendable
    fx.dashboard.loseResponseFor.add(queued!.operation.operationId)

    // Act
    await runPass(fx.service, fx.dashboard, accountId)
    expect((await fx.service.categoryPending(16)).uncertain).toHaveLength(1)
    await runPass(fx.service, fx.dashboard, accountId)

    // Assert
    expect(
      fx.dashboard.applied().filter((op) => op.type === 'recolor'),
    ).toHaveLength(1)
    expect((await fx.service.categoryPending(16)).uncertain).toHaveLength(0)
    expect(dashboardPaths(fx.dashboard).Work).toBe('violet')
  })

  test('three unanswered receipt lookups show Waiting for the dashboard to confirm a change and block only dependents', async () => {
    // Arrange
    const fx = await createFixture()
    await runUntilSettled(fx.service, fx.dashboard, accountId)
    await fx.command({
      type: 'categoryRecolor',
      categoryId: work,
      color: 'violet',
    })
    await fx.command({
      type: 'categoryRecolor',
      categoryId: general,
      color: 'rose',
    })
    await runPass(fx.service, fx.dashboard, accountId) // both applied, quiet
    await fx.command({
      type: 'categoryRename',
      categoryId: work,
      name: 'Projects',
    })
    await fx.service.reconcileCategories({
      ...fx.dashboard.bootstrap(accountId),
      displayEmail: null,
    })
    fx.dashboard.setOffline(true)
    const [entry] = (await fx.service.categoryPending(16)).sendable
    await fx.service.markCategorySent(accountId, [entry!.operation.operationId])

    // Act
    for (let i = 0; i < 3; i++)
      await runPass(fx.service, fx.dashboard, accountId)

    // Assert
    expect((await fx.service.syncDetails()).rows).toEqual([
      expect.objectContaining({
        type: 'waiting-confirm',
        categoryPath: 'Projects',
        actions: [],
      }),
    ])
    // An unrelated category's edit still sends once the network is back.
    fx.dashboard.setOffline(false)
    await runUntilSettled(fx.service, fx.dashboard, accountId)
    expect(dashboardPaths(fx.dashboard)).toEqual({
      General: 'rose',
      Projects: 'violet',
    })
  })

  test('a frozen payload is resent byte-identically even after its binding entry was removed', async () => {
    // Arrange
    const fx = await createFixture()
    await runUntilSettled(fx.service, fx.dashboard, accountId)
    await fx.command({
      type: 'categoryRename',
      categoryId: work,
      name: 'Projects',
    })
    await fx.service.reconcileCategories({
      ...fx.dashboard.bootstrap(accountId),
      displayEmail: null,
    })
    const [queued] = (await fx.service.categoryPending(16)).sendable
    const [sent] = await fx.service.markCategorySent(accountId, [
      queued!.operation.operationId,
    ])
    const firstBytes = JSON.stringify(sent!.wire)

    // Act: the binding forgets the category, then the entry is read again for a retry.
    await fx.file.update((current) => {
      const next = structuredClone(current)
      delete next.binding!.serverCategoryIds[work]
      next.revision++
      return next
    })
    const [again] = (await fx.service.categoryPending(16)).uncertain

    // Assert
    expect(JSON.stringify(again!.wire)).toBe(firstBytes)
  })

  test('a receipt for an unknown operation id is ignored while the matching receipt applies', async () => {
    // Arrange
    const fx = await createFixture()
    await runUntilSettled(fx.service, fx.dashboard, accountId)
    await fx.command({
      type: 'categoryRename',
      categoryId: work,
      name: 'Projects',
    })
    await fx.service.reconcileCategories({
      ...fx.dashboard.bootstrap(accountId),
      displayEmail: null,
    })
    const [queued] = (await fx.service.categoryPending(16)).sendable
    const [sent] = await fx.service.markCategorySent(accountId, [
      queued!.operation.operationId,
    ])
    const receipts = fx.dashboard.apply([sent!.wire!]).receipts

    // Act
    await fx.service.acceptCategoryReceipts(accountId, [
      ...receipts,
      {
        kind: 'category',
        operationId: randomUUID(),
        result: 'applied',
        serverId: 2,
      },
    ])

    // Assert
    const state = await fx.file.read()
    expect(state.binding?.base[work]?.name).toBe('Projects')
    expect(Object.keys(state.categoryOutbox)).toEqual([])
  })
})
