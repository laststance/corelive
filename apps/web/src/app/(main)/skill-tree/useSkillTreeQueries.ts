import { useQuery } from '@tanstack/react-query'

import { useClerkQueryReady } from '@/hooks/useClerkQueryReady'
import { orpc } from '@/lib/orpc/client-query'

/** Loads both data sources for {@link SkillTreeView} and keeps their shared readiness contract in one place.
 * @returns Tree, unassigned pool, and combined loading/error status.
 * @example useSkillTreeQueries()
 */
export function useSkillTreeQueries() {
  const isClerkQueryReady = useClerkQueryReady()
  const {
    data: tree,
    isLoading: treeLoading,
    isError: treeError,
  } = useQuery({
    ...orpc.skillTree.getMyTree.queryOptions(),
    enabled: isClerkQueryReady,
  })
  const {
    data: pool,
    isLoading: poolLoading,
    isError: poolError,
  } = useQuery({
    ...orpc.skillTree.getUnassignedPool.queryOptions(),
    enabled: isClerkQueryReady,
  })

  return {
    tree,
    pool,
    isError: treeError || poolError,
    isLoading: treeLoading || poolLoading || !tree || !pool,
  }
}
