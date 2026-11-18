import { HydrationBoundary } from '@tanstack/react-query'

import { prefetchHomeBootstrap } from '@/server/prefetchHomeBootstrap'

import { DashboardContent } from './_components/DashboardContent'

import './page.css'

/**
 * The Dashboard route at /home. Prefetches its critical data through one
 * `home.bootstrap` call. A successful prefetch serves matching client query
 * keys from the hydrated cache. A failed prefetch falls back to client requests.
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
