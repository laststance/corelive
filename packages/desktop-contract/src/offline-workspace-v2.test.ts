import { describe, expect, test } from 'vitest'

import {
  CategoryOperationSchema,
  CategorySyncApplyInputSchema,
  OFFLINE_ERROR_CODES,
  SYNC_DETAIL_ACTIONS,
  SyncOutcomeSchema,
  SyncStatusSchema,
} from './category-sync'
import {
  DeviceRegistrySchema,
  OfflineWorkspaceSchema,
} from './offline-workspace-v2'
import { UserSettingsStateSchema } from './settings'

const localA = '11111111-1111-4111-8111-111111111111'
const localB = '22222222-2222-4222-8222-222222222222'
const operationId = '33333333-3333-4333-8333-333333333333'
const deviceId = '44444444-4444-4444-8444-444444444444'

function minimalWorkspace() {
  return {
    version: 2,
    ownerId: 'device',
    deviceId,
    revision: 0,
    createdAt: 1,
    selectedCategoryId: localA,
    categories: [
      {
        id: localA,
        name: 'General',
        color: 'blue',
        isDefault: true,
        parentId: null,
      },
    ],
    preferences: {
      revision: 0,
      settings: UserSettingsStateSchema.parse({}),
      theme: 'system',
    },
    drafts: {},
    completions: {},
    outbox: {},
    commandReceipts: {},
    categoryMoves: {},
    binding: null,
    migration: {
      version: 2,
      sourceChecksum: null,
      receipts: {},
      v1Files: {},
      dashboardOnly: {},
      summary: null,
    },
    checkpoint: null,
    recoveryCopies: [],
  }
}

describe('v2 device workspace contract', () => {
  test('a local-only workspace parses and survives a JSON round trip unchanged', () => {
    // Arrange
    const parsed = OfflineWorkspaceSchema.parse(minimalWorkspace())

    // Act
    const again = OfflineWorkspaceSchema.parse(
      JSON.parse(JSON.stringify(parsed)),
    )

    // Assert
    expect(again).toEqual(parsed)
    expect(again.categories[0]?.historical).toBe(false)
    expect(again.binding).toBeNull()
  })

  test('a workspace owned by an account id is refused', () => {
    // Arrange
    const workspace = { ...minimalWorkspace(), ownerId: 'user_1' }

    // Act
    const result = OfflineWorkspaceSchema.safeParse(workspace)

    // Assert
    expect(result.success).toBe(false)
  })

  test('a bound workspace keeps declined fields, historical categories and retired text', () => {
    // Arrange
    const workspace = {
      ...minimalWorkspace(),
      categories: [
        {
          id: localA,
          name: 'General',
          color: 'blue',
          isDefault: true,
          parentId: null,
        },
        {
          id: localB,
          name: 'Old',
          color: 'rose',
          isDefault: false,
          parentId: null,
          historical: true,
        },
      ],
      retiredCompletions: {
        [operationId]: {
          completedAt: 5,
          originalCompletedAt: 5,
          originalCategoryId: localB,
          timezone: 'UTC',
          cancelled: false,
          revision: 1,
          remoteRevision: 1,
          title: 'Ship it',
          rawText: '- [x] Ship it',
        },
      },
      binding: {
        accountId: 'user_1',
        displayEmail: null,
        serverCategoryIds: { [localA]: 7 },
        base: {
          [localA]: { name: 'General', color: 'blue', parentLocalId: null },
        },
        declined: {
          [localA]: {
            name: {
              kind: 'name-taken',
              localValue: 'Main',
              serverValue: 'General',
            },
          },
        },
        deletionReceipts: { [localB]: localA },
        lastSyncedAt: null,
      },
    }

    // Act
    const parsed = OfflineWorkspaceSchema.parse(workspace)

    // Assert
    expect(parsed.retiredCompletions[operationId]?.title).toBe('Ship it')
    expect(parsed.binding?.declined[localA]?.name?.kind).toBe('name-taken')
    expect(parsed.categories[1]?.historical).toBe(true)
  })

  test('registry v2 carries the sign-out journal and the pending Connect prompt', () => {
    // Arrange
    const registry = {
      version: 2,
      deviceId,
      attachedAccountId: null,
      signOutPending: true,
      pendingConnect: { accountId: 'user_2', displayEmail: 'a@example.com' },
    }

    // Act
    const parsed = DeviceRegistrySchema.parse(registry)

    // Assert
    expect(parsed).toEqual(registry)
  })
})

describe('category sync contract', () => {
  test.each([
    {
      type: 'create',
      name: 'Work',
      color: 'blue',
      parentLocalId: null,
      isDefault: false,
    },
    { type: 'rename', name: 'B', expected: { name: 'A' } },
    { type: 'recolor', color: 'rose', expected: { color: 'blue' } },
    {
      type: 'reparent',
      parentLocalId: localB,
      expected: { parentLocalId: null },
    },
    { type: 'delete', destinationLocalId: localB },
  ])('a $type operation round-trips', (shape) => {
    // Arrange
    const operation = { operationId, localId: localA, ...shape }

    // Act
    const parsed = CategoryOperationSchema.parse(
      JSON.parse(JSON.stringify(operation)),
    )

    // Assert
    expect(parsed).toEqual(operation)
  })

  test('a rename set carries every item with its expected name', () => {
    // Arrange
    const operation = {
      operationId,
      type: 'renameSet',
      items: [
        { localId: localA, name: 'B', expected: { name: 'A' } },
        { localId: localB, name: 'A', expected: { name: 'B' } },
      ],
    }

    // Act
    const parsed = CategoryOperationSchema.parse(operation)

    // Assert
    expect(parsed).toEqual(operation)
  })

  test('a batch of 17 wire operations is refused', () => {
    // Arrange
    const operations = Array.from({ length: 17 }, () => ({
      operationId,
      type: 'delete',
      serverId: 1,
      destinationId: 2,
    }))

    // Act
    const result = CategorySyncApplyInputSchema.safeParse({ operations })

    // Assert
    expect(result.success).toBe(false)
  })

  test('a stored completion receipt without kind parses as a completion forever (EA6)', () => {
    // Arrange
    const oldRow = {
      operationId,
      completionId: localA,
      revision: 1,
      status: 'rejected',
      projection: null,
      reason: 'conflict',
    }

    // Act
    const parsed = SyncOutcomeSchema.parse(oldRow)

    // Assert
    expect(parsed).toMatchObject({ kind: 'completion', status: 'rejected' })
  })

  test.each([
    { result: 'applied', serverId: 3 },
    {
      result: 'adopted',
      serverId: 3,
      current: { name: 'Work', color: 'blue', parentId: null },
    },
    { result: 'name-taken' },
    { result: 'invalid-parent' },
    { result: 'forbidden' },
    { result: 'digest-mismatch' },
    { result: 'conflict', current: { name: 'Server' } },
    {
      result: 'delete-blocked',
      reason: 'child-name-taken',
      childName: 'Email',
    },
  ])('a category $result outcome round-trips', (shape) => {
    // Arrange
    const outcome = { kind: 'category', operationId, ...shape }

    // Act
    const parsed = SyncOutcomeSchema.parse(JSON.parse(JSON.stringify(outcome)))

    // Assert
    expect(parsed).toEqual(outcome)
  })

  test('a conflict without the contested field is refused', () => {
    // Arrange
    const outcome = { kind: 'category', operationId, result: 'conflict' }

    // Act
    const result = SyncOutcomeSchema.safeParse(outcome)

    // Assert
    expect(result.success).toBe(false)
  })

  test('the action vocabulary, error codes and status object are frozen', () => {
    // Arrange / Act
    const status = SyncStatusSchema.parse({
      state: 'waiting',
      waitingCount: 2,
      lastSyncedAt: null,
      boundEmail: null,
    })

    // Assert
    expect(SYNC_DETAIL_ACTIONS).toEqual([
      'use-mac-value',
      'keep-dashboard-value',
      'choose-another-name',
      'try-again',
    ])
    expect(OFFLINE_ERROR_CODES).toContain('WORKSPACE_MIGRATION_FAILED')
    expect(status.state).toBe('waiting')
  })
})
