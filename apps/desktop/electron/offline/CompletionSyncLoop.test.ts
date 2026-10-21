import { randomUUID } from 'node:crypto'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import type { CompletionSyncTransport } from '@corelive/desktop-contract/offline-sync'
import type {
  CompletionProjection,
  CompletionSyncReceipt,
} from '@corelive/desktop-contract/offline-workspace'
import { UserSettingsStateSchema } from '@corelive/desktop-contract/settings'
import { afterEach, expect, test, vi } from 'vitest'

import {
  CompletionSyncLoop,
  type SyncAccountContext,
} from './CompletionSyncLoop'
import { WorkspaceWorkerClient } from './WorkspaceWorkerClient'

const cleanups: (() => Promise<void>)[] = []

/** Combines the real durable worker with an in-memory remote receipt ledger and controlled delivery.
 * @example const fixture = await createFixture()
 */
async function createFixture() {
  const directory = await mkdtemp(join(tmpdir(), 'corelive-sync-loop-'))
  const worker = new WorkspaceWorkerClient({
    directory,
    ownerId: 'account-a',
    script: new URL('./workspace-worker.ts', import.meta.url),
    execArgv: ['--import', 'tsx'],
  })
  const category = {
    id: 1,
    name: 'General',
    color: 'blue',
    isDefault: true,
    parentId: null,
    removed: false,
  } as const
  const initial = await worker.call('prepare', {
    ownerId: 'account-a',
    deviceId: randomUUID(),
    categories: [category],
    preferences: {
      revision: 0,
      settings: UserSettingsStateSchema.parse({}),
      theme: 'light',
    },
    legacyNotes: { '1': 'One completion' },
  })
  const completionId = randomUUID()
  await worker.call('command', {
    type: 'complete',
    commandId: randomUUID(),
    categoryId: 1,
    baseRevision: 0,
    rowId: initial.draft.rows[0]!.id,
    completionId,
    completedAt: Date.now(),
    timezone: 'UTC',
  })
  const receipts = new Map<string, CompletionSyncReceipt>()
  const projections = new Map<string, CompletionProjection>()
  const commit: CompletionSyncTransport['apply'] = async ({ operations }) => ({
    receipts: operations.map((operation) => {
      const projection = {
        completionId: operation.completionId,
        revision: operation.revision,
        cancelled: operation.kind === 'cancel',
        categoryId: operation.categoryId,
        title: operation.title,
        completedAt: operation.completedAt,
      }
      const receipt: CompletionSyncReceipt = {
        operationId: operation.operationId,
        completionId: operation.completionId,
        revision: operation.revision,
        status: 'applied',
        projection,
      }
      receipts.set(operation.operationId, receipt)
      projections.set(operation.completionId, projection)
      return receipt
    }),
  })
  const transport = {
    bootstrap: vi.fn<CompletionSyncTransport['bootstrap']>(async () => ({
      accountId: 'account-a',
      categories: [category],
      deletions: [],
    })),
    apply: vi.fn(commit),
    receipts: vi.fn<CompletionSyncTransport['receipts']>(
      async ({ operationIds }) => ({
        receipts: operationIds.flatMap((id) =>
          receipts.has(id) ? [receipts.get(id)!] : [],
        ),
      }),
    ),
    checkpoint: vi.fn<CompletionSyncTransport['checkpoint']>(
      async ({ day, timezone, completionIds }) => ({
        day,
        timezone,
        total: [...projections.values()].filter(
          (projection) => !projection.cancelled,
        ).length,
        fetchedAt: Date.now(),
        identities: Object.fromEntries(
          completionIds.map((id) => [id, projections.get(id) ?? null]),
        ),
      }),
    ),
  }
  let context: SyncAccountContext | null = {
    ownerId: 'account-a',
    generation: 1,
    worker,
  }
  const onStatus = vi.fn()
  const onView = vi.fn()
  const loop = new CompletionSyncLoop({
    context: () => context,
    broker: {
      acquire: async (expectedAccountId, generation) => ({
        status: 'ready',
        credential: {
          status: 'ready',
          requestId: randomUUID(),
          expectedAccountId,
          generation,
          accountId: 'account-a',
          token: 'synthetic-token',
        },
      }),
    },
    transport: () => transport,
    onView,
    onStatus,
    random: () => 0,
  })
  cleanups.push(async () => {
    loop.stop()
    await worker.close()
    await rm(directory, { recursive: true })
  })
  return {
    loop,
    worker,
    transport,
    commit,
    completionId,
    onStatus,
    onView,
    leaveAccount: (): void => {
      context = null
      loop.stop()
    },
  }
}

afterEach(async () => {
  for (const cleanup of cleanups.splice(0)) await cleanup()
})

test('a response lost after server commit is resolved by receipt lookup without creating a second completion', async () => {
  // Arrange
  const fixture = await createFixture()
  fixture.transport.apply.mockImplementationOnce(async (input) => {
    await fixture.commit(input)
    throw new Error('Reply lost')
  })

  // Act
  fixture.loop.wake()
  await vi.waitFor(() =>
    expect(fixture.onStatus).toHaveBeenLastCalledWith('offline', 1),
  )
  expect((await fixture.worker.call('pending', { limit: 16 }))[0]?.state).toBe(
    'sent',
  )
  fixture.loop.wake()
  await vi.waitFor(() =>
    expect(fixture.onStatus).toHaveBeenLastCalledWith('idle', 1),
  )

  // Assert
  expect(fixture.transport.apply).toHaveBeenCalledOnce()
  expect(fixture.transport.receipts).toHaveBeenCalledOnce()
  const view = await fixture.worker.call('open', null)
  expect(view.pendingCount).toBe(0)
  expect(view.today).toMatchObject({ total: 1, scope: 'account' })
})

test('Undo while a create is in flight preserves the original request and follows it with the cancellation', async () => {
  // Arrange
  const fixture = await createFixture()
  let deliver!: () => void
  fixture.transport.apply.mockImplementationOnce(
    async (input) =>
      new Promise((resolve) => {
        deliver = (): void => {
          void fixture.commit(input).then(resolve)
        }
      }),
  )

  // Act
  fixture.loop.wake()
  await vi.waitFor(() => expect(fixture.transport.apply).toHaveBeenCalledOnce())
  await fixture.worker.call('command', {
    type: 'undo',
    commandId: randomUUID(),
    completionId: fixture.completionId,
  })
  deliver()
  await vi.waitFor(() =>
    expect(fixture.onStatus).toHaveBeenLastCalledWith('idle', 1),
  )

  // Assert
  expect(
    fixture.transport.apply.mock.calls.map(([input]) =>
      input.operations.map((operation) => [operation.kind, operation.revision]),
    ),
  ).toEqual([[['create', 1]], [['cancel', 2]]])
  const view = await fixture.worker.call('open', null)
  expect(view.draft.rows.map((row) => row.text)).toEqual(['One completion'])
  expect(view.pendingCount).toBe(0)
  expect(view.today.total).toBe(0)
})

test('authentication rejection pauses synchronization while the durable local writing remains openable', async () => {
  // Arrange
  const fixture = await createFixture()
  fixture.transport.bootstrap.mockRejectedValue(
    Object.assign(new Error('Unauthorized'), { status: 401 }),
  )

  // Act
  fixture.loop.wake()
  await vi.waitFor(() =>
    expect(fixture.onStatus).toHaveBeenLastCalledWith('sign-in-required', 1),
  )

  // Assert
  expect(fixture.transport.apply).not.toHaveBeenCalled()
  const view = await fixture.worker.call('open', null)
  expect(view.draft.rows.map((row) => row.text)).toEqual([
    '- [x] One completion',
  ])
  expect(view.pendingCount).toBe(1)
})

test('an old account response cannot publish or retire its uncertain operation after a switch', async () => {
  // Arrange
  const fixture = await createFixture()
  let deliver!: () => Promise<void>
  fixture.transport.apply.mockImplementationOnce(
    async (input) =>
      new Promise((resolve) => {
        deliver = async (): Promise<void> => {
          resolve(await fixture.commit(input))
        }
      }),
  )
  fixture.loop.wake()
  await vi.waitFor(() => expect(fixture.transport.apply).toHaveBeenCalledOnce())
  fixture.onView.mockClear()

  // Act
  fixture.leaveAccount()
  await deliver()
  await Promise.resolve()

  // Assert
  expect(fixture.onView).not.toHaveBeenCalled()
  expect((await fixture.worker.call('pending', { limit: 16 }))[0]?.state).toBe(
    'sent',
  )
})
