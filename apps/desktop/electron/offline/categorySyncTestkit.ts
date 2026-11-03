/**
 * Test support: runs sync passes straight against {@link WorkspaceService} and a fake dashboard
 * (no broker, no worker thread), and compares the two sides for convergence (#216 EA13b).
 *
 * @module categorySyncTestkit
 */
import type { OfflineWorkspace } from '@corelive/desktop-contract/offline-workspace-v2'

import type { FakeDashboard } from './fakeDashboard'
import type { WorkspaceService } from './WorkspaceService'

/**
 * Runs one sync pass: recover uncertain receipts, merge against the dashboard, then send category
 * batches until nothing is sendable. A thrown apply (lost response) ends the pass; the operations
 * stay uncertain for the next pass, exactly like the SyncLoop.
 *
 * @param service - The device workspace service.
 * @param dashboard - The fake account.
 * @param accountId - The attached account id.
 * @returns Nothing.
 * @example await runPass(service, dashboard, 'account-a')
 */
export async function runPass(
  service: WorkspaceService,
  dashboard: FakeDashboard,
  accountId: string,
): Promise<void> {
  const work = await service.categoryPending(16)
  if (work.uncertain.length) {
    const ids = work.uncertain.map((entry) => entry.operation.operationId)
    const found = dashboard.receiptsFor(ids)
    if (found.receipts.length)
      await service.acceptCategoryReceipts(accountId, found.receipts)
    const answered = new Set(found.receipts.map((r) => r.operationId))
    const missing = ids.filter((id) => !answered.has(id))
    if (missing.length) await service.noteCategoryQuery(accountId, missing)
  }
  await service.reconcileCategories({
    ...dashboard.bootstrap(accountId),
    displayEmail: null,
  })
  await sendPending(service, dashboard, accountId)
}

/**
 * Sends category batches (replaying uncertain frozen payloads first) until nothing is sendable
 * or a request throws.
 *
 * @example await sendPending(service, dashboard, 'account-a')
 */
export async function sendPending(
  service: WorkspaceService,
  dashboard: FakeDashboard,
  accountId: string,
): Promise<void> {
  for (let batch = 0; batch < 12; batch++) {
    const work = await service.categoryPending(16)
    const replay = work.uncertain.flatMap((entry) =>
      entry.wire ? [entry.wire] : [],
    )
    const frozen = await service.markCategorySent(
      accountId,
      work.sendable.map((entry) => entry.operation.operationId),
    )
    const operations = [
      ...replay,
      ...frozen.flatMap((entry) => (entry.wire ? [entry.wire] : [])),
    ]
    if (!operations.length) return
    let response: ReturnType<FakeDashboard['apply']>
    try {
      response = dashboard.apply(operations)
    } catch {
      return
    }
    await service.acceptCategoryReceipts(accountId, response.receipts)
  }
}

/**
 * Runs passes until the outbox is empty or the cap is reached.
 *
 * @example await runUntilSettled(service, dashboard, 'account-a')
 */
export async function runUntilSettled(
  service: WorkspaceService,
  dashboard: FakeDashboard,
  accountId: string,
  maxPasses = 12,
): Promise<void> {
  const fingerprint = async (): Promise<string> => {
    const state = await service.file.read()
    return JSON.stringify([
      dashboard.applied().length,
      state.categoryOutbox,
      state.binding?.serverCategoryIds,
      state.binding?.base,
      state.categories,
    ])
  }
  for (let pass = 0; pass < maxPasses; pass++) {
    const before = await fingerprint()
    await runPass(service, dashboard, accountId)
    // Quiet = a whole pass changed nothing: no send, no derive, no merge write.
    if ((await fingerprint()) === before) return
  }
}

/** `path -> color` of the live local categories. */
export function localPaths(state: OfflineWorkspace): Record<string, string> {
  const live = state.categories.filter((c) => !c.removed && !c.historical)
  return Object.fromEntries(
    live.map((category) => {
      const parent = live.find((entry) => entry.id === category.parentId)
      return [
        parent ? `${parent.name}/${category.name}` : category.name,
        category.color,
      ]
    }),
  )
}

/** `path -> color` of the dashboard's categories. */
export function dashboardPaths(
  dashboard: FakeDashboard,
): Record<string, string> {
  const rows = dashboard.categories()
  return Object.fromEntries(
    rows.map((category) => {
      const parent = rows.find((entry) => entry.id === category.parentId)
      return [
        parent ? `${parent.name}/${category.name}` : category.name,
        category.color,
      ]
    }),
  )
}
