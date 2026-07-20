import { HydrationBoundary } from '@tanstack/react-query'

import { prefetchHomeBootstrap } from '@/server/prefetchHomeBootstrap'

import { HomeContent } from './_components/HomeContent'

import './page.css'

/**
 * Home page Server Component. Prefetches every critical Home slice through one
 * `home.bootstrap` call and hydrates it into the client query cache, so first
 * paint after hydration needs zero `/api/orpc` requests (Issue #153).
 */
const Home = async function Home() {
  const dehydratedHomeState = await prefetchHomeBootstrap()

  return (
    <HydrationBoundary state={dehydratedHomeState}>
      <HomeContent />
    </HydrationBoundary>
  )
}

export default Home
