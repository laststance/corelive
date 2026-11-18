import { HydrationBoundary } from '@tanstack/react-query'

import { prefetchHomeBootstrap } from '@/server/prefetchHomeBootstrap'

import { DashboardContent } from './_components/DashboardContent'

import './page.css'

/**
 * The Dashboard route at /home. Prefetches its critical data through one
 * `home.bootstrap` call and hydrates it into the client query cache, so first
 * paint after hydration needs zero `/api/orpc` requests (Issue #153).
 */
const DashboardPage = async function DashboardPage() {
  const dehydratedHomeState = await prefetchHomeBootstrap()

  return (
    <HydrationBoundary state={dehydratedHomeState}>
      <DashboardContent />
    </HydrationBoundary>
  )
}

export default DashboardPage
