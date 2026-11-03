import { randomUUID } from 'node:crypto'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import type { CompletionSyncTransport } from '@corelive/desktop-contract/offline-sync'
import { afterEach, expect, test, vi } from 'vitest'

import { initializeDeviceWorkspace } from './deviceWorkspaceFixture'
import { createFakeDashboard } from './fakeDashboard'
import { SyncLoop, type SyncAccountContext } from './SyncLoop'
import { WorkspaceWorkerClient } from './WorkspaceWorkerClient'

const cleanups: (() => Promise<void>)[] = []

/** The real durable worker, the SyncLoop and a fake dashboard whose category endpoint can reject by name. */
async function createFixture() {
  const directory = await mkdtemp(join(tmpdir(), 'corelive-loop-categories-'))
  await initializeDeviceWorkspace(directory, { boundAccountId: 'account-a' })
  const worker = new WorkspaceWorkerClient({
    directory,
    ownerId: 'device',
    script: new URL('./workspace-worker.ts', import.meta.url),
    execArgv: ['--import', 'tsx'],
  })
  const dashboard = createFakeDashboard([
    {
      id: 1,
      name: 'General',
      color: 'blue',
      isDefault: true,
      parentId: null,
      removed: false,
    },
  ])
  const calls: string[] = []
  const rejectedNames = new Set<string>()
  const completionProjection = new Map<string, unknown>()
  const transport = {
    whoami: vi.fn(async () => ({ clerkId: 'account-a', email: null })),
    bootstrap: vi.fn(async () => dashboard.bootstrap('account-a')),
    categoryApply: vi.fn<CompletionSyncTransport['categoryApply']>(
      async ({ operations }) => {
        calls.push('category')
        if (
          operations.some(
            (operation) =>
              'name' in operation && rejectedNames.has(operation.name),
          )
        )
          throw Object.assign(new Error('Bad request'), { status: 400 })
        return dashboard.apply(operations)
      },
    ),
    categoryReceipts: vi.fn<CompletionSyncTransport['categoryReceipts']>(
      async ({ operationIds }) => dashboard.receiptsFor(operationIds),
    ),
    apply: vi.fn<CompletionSyncTransport['apply']>(async ({ operations }) => {
      calls.push('completion')
      return {
        receipts: operations.map((operation) => {
          const projection = {
            completionId: operation.completionId,
            revision: operation.revision,
            cancelled: false,
            categoryId: operation.categoryId,
            title: operation.title,
            completedAt: operation.completedAt,
          }
          completionProjection.set(operation.completionId, projection)
          return {
            operationId: operation.operationId,
            completionId: operation.completionId,
            revision: operation.revision,
            status: 'applied' as const,
            projection,
          }
        }),
      }
    }),
    receipts: vi.fn(async () => ({ receipts: [] })),
    checkpoint: vi.fn<CompletionSyncTransport['checkpoint']>(
      async ({ day, timezone, completionIds }) => ({
        day,
        timezone,
        total: completionIds.length,
        fetchedAt: Date.now(),
        identities: Object.fromEntries(completionIds.map((id) => [id, null])),
      }),
    ),
  } satisfies CompletionSyncTransport
  const context: SyncAccountContext = {
    ownerId: 'account-a',
    generation: 1,
    worker,
  }
  const log = vi.fn()
  let idle: (() => void) | null = null
  const loop = new SyncLoop({
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
          token: 'test-token',
        },
      }),
    },
    transport: () => transport,
    onView: vi.fn(),
    onStatus: (status) => {
      if (status === 'idle') idle?.()
    },
    log,
    random: () => 0,
  })
  cleanups.push(async () => {
    await loop.stop()
    await worker.close()
    await rm(directory, { recursive: true })
  })
  const settle = async (): Promise<void> => {
    const done = new Promise<void>((resolve) => {
      idle = resolve
    })
    loop.wake()
    await done
  }
  const command = async (body: Record<string, unknown>) =>
    worker.call('command', { ...body, commandId: randomUUID() } as never)
  return {
    worker,
    dashboard,
    transport,
    calls,
    rejectedNames,
    log,
    settle,
    command,
  }
}

afterEach(async () => {
  for (const cleanup of cleanups.splice(0)) await cleanup()
})

test('a rejected category batch is resent as single operations and only the operation rejected alone is parked', async () => {
  // Arrange
  const fixture = await createFixture()
  fixture.rejectedNames.add('Bad')
  for (const name of ['Good1', 'Bad', 'Good2'])
    await fixture.command({
      type: 'categoryCreate',
      categoryId: randomUUID(),
      name,
      color: 'blue',
      parentId: null,
    })

  // Act
  await fixture.settle()

  // Assert
  expect(
    fixture.dashboard
      .categories()
      .map((c) => c.name)
      .sort(),
  ).toEqual(['Good1', 'Good2', 'General'].sort())
  const details = await fixture.worker.call('syncDetails', null)
  expect(details.rows).toEqual([
    expect.objectContaining({
      type: 'parked',
      categoryPath: 'Bad',
      actions: ['try-again'],
    }),
  ])
  expect(fixture.log).toHaveBeenCalledWith(
    expect.stringContaining('CATEGORY_SYNC_REJECTED'),
  )
  // The log carries counts and ids, never names.
  expect(fixture.log.mock.calls.flat().join(' ')).not.toContain('Bad')
})

test('Try again re-sends a parked operation once and it parks again when still rejected', async () => {
  // Arrange
  const fixture = await createFixture()
  fixture.rejectedNames.add('Bad')
  await fixture.command({
    type: 'categoryCreate',
    categoryId: randomUUID(),
    name: 'Bad',
    color: 'blue',
    parentId: null,
  })
  await fixture.settle()
  const [row] = (await fixture.worker.call('syncDetails', null)).rows
  const before = fixture.transport.categoryApply.mock.calls.length

  // Act
  await fixture.command({
    type: 'syncDetailAction',
    rowId: row!.id,
    action: 'try-again',
  })
  await fixture.settle()

  // Assert
  expect(fixture.transport.categoryApply.mock.calls.length - before).toBe(1)
  expect((await fixture.worker.call('syncDetails', null)).rows).toEqual([
    expect.objectContaining({ type: 'parked' }),
  ])
})

test('category batches go before completion batches and a completion carries its new category server id', async () => {
  // Arrange
  const fixture = await createFixture()
  const ideas = randomUUID()
  await fixture.command({
    type: 'categoryCreate',
    categoryId: ideas,
    name: 'Ideas',
    color: 'rose',
    parentId: null,
  })
  const draft = await fixture.worker.call('draft', { categoryId: ideas })
  await fixture.command({
    type: 'save',
    categoryId: ideas,
    baseRevision: draft.draft.revision,
    rows: [{ id: draft.draft.rows[0]!.id, text: 'Write the release notes' }],
  })
  await fixture.command({
    type: 'complete',
    categoryId: ideas,
    baseRevision: draft.draft.revision + 1,
    rowId: draft.draft.rows[0]!.id,
    completionId: randomUUID(),
    completedAt: Date.now(),
    timezone: 'UTC',
  })

  // Act
  await fixture.settle()

  // Assert
  expect(fixture.calls).toEqual(['category', 'completion'])
  const ideasServerId = fixture.dashboard
    .categories()
    .find((c) => c.name === 'Ideas')!.id
  expect(
    fixture.transport.apply.mock.calls[0]![0].operations[0]!.categoryId,
  ).toBe(ideasServerId)
})
