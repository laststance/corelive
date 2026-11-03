import type { OfflineWorkspace } from '@corelive/desktop-contract/offline-workspace-v2'

import { WorkspaceCommandError } from './WorkspaceCommandError'

/** Resolves chained category moves without restoring into a retired source.
 * @example effectiveCategory(workspace, 3)
 */
export function effectiveCategory(
  state: OfflineWorkspace,
  categoryId: string,
): string {
  const visited = new Set<string>()
  let current = categoryId
  while (state.categoryMoves[current]) {
    if (visited.has(current))
      throw new WorkspaceCommandError('category-unavailable')
    visited.add(current)
    current = state.categoryMoves[current]!
  }
  return current
}
