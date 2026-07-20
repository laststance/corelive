import { auth } from '@clerk/nextjs/server'
import { call } from '@orpc/server'
import { dehydrate, type DehydratedState } from '@tanstack/react-query'
import { cookies, headers } from 'next/headers'

import { COMPLETED_JOURNAL_INITIAL_OFFSET } from '@/lib/constants/completed'
import {
  HOME_RETAIN_COMPLETED_COOKIE_NAME,
  HOME_SELECTED_CATEGORY_COOKIE_NAME,
  HOME_TIMEZONE_COOKIE_NAME,
} from '@/lib/constants/home'
import { log } from '@/lib/logger'
import { createQueryClient } from '@/lib/query/createQueryClient'
import {
  buildHomeBootstrapInput,
  getHomeCategoryListQueryKey,
  getHomeHeatmapQueryKey,
  getHomeJournalQueryKey,
  getHomeTodoListQueryKey,
} from '@/lib/query/homeBootstrapQueries'
import { bootstrapHome } from '@/server/procedures/home'
import { ServerTiming } from '@/server/timing/ServerTiming'

/** Vercel edge network geo header; absent on localhost and self-hosted runs. */
const VERCEL_IP_TIMEZONE_HEADER = 'x-vercel-ip-timezone'

/** Rejects garbage zone values (stale cookies, spoofed geo headers) before they reach the heatmap SQL bucketing. @param timeZone - Candidate IANA zone name. @returns Whether `Intl` accepts the zone. @example `isUsableTimeZone('Asia/Tokyo') // => true` */
function isUsableTimeZone(timeZone: string): boolean {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone })
    return true
  } catch {
    return false
  }
}

/**
 * Resolves the zone the browser will put in its heatmap query key, best guess first:
 * the cookie `HomeContent` persists (exact after one visit) → Vercel geo header →
 * the server's own zone (equals the browser's on localhost dev).
 * A wrong guess only makes the heatmap slice miss hydration and fetch client-side.
 * @returns An `Intl`-valid IANA zone name.
 * @example `await resolveViewerTimeZone() // => 'Asia/Tokyo'`
 */
async function resolveViewerTimeZone(): Promise<string> {
  const cookieTimeZone = (await cookies()).get(HOME_TIMEZONE_COOKIE_NAME)?.value
  if (cookieTimeZone && isUsableTimeZone(cookieTimeZone)) {
    return cookieTimeZone
  }

  const geoTimeZone = (await headers()).get(VERCEL_IP_TIMEZONE_HEADER)
  if (geoTimeZone && isUsableTimeZone(geoTimeZone)) {
    return geoTimeZone
  }

  return Intl.DateTimeFormat().resolvedOptions().timeZone
}

/**
 * Resolves the sidebar category selection this browser will query first, from
 * the cookie `useSelectedCategory` mirrors alongside its localStorage write.
 * Absent/garbage cookie means the All view (matching the hook's own fallback).
 * A deleted-category id only makes the todo slice miss hydration client-side.
 * @returns A positive category ID, or undefined for the All view.
 * @example `await resolveViewerSelectedCategoryId() // => 3`
 */
async function resolveViewerSelectedCategoryId(): Promise<number | undefined> {
  const cookieValue = (await cookies()).get(
    HOME_SELECTED_CATEGORY_COOKIE_NAME,
  )?.value
  if (!cookieValue) {
    return undefined
  }

  const selectedCategoryId = Number(cookieValue)
  return Number.isInteger(selectedCategoryId) && selectedCategoryId > 0
    ? selectedCategoryId
    : undefined
}

/**
 * Resolves whether this browser has 居残りモード ON, from the cookie `HomeContent`
 * mirrors alongside the Redux setting. Retain ON drops the todo `completed`
 * filter, so the SSR key must match or retain-mode users miss todo hydration.
 * Absent cookie means OFF (matching the default). A stale value only costs one
 * client fetch — never wrong data, since the bootstrap forwards the same input
 * to the same `listTodos` the client would call.
 * @returns `true` when 居残りモード is ON, else `false`.
 * @example `await resolveViewerRetainCompleted() // => true`
 */
async function resolveViewerRetainCompleted(): Promise<boolean> {
  const cookieValue = (await cookies()).get(
    HOME_RETAIN_COMPLETED_COOKIE_NAME,
  )?.value
  return cookieValue === 'true'
}

/**
 * Runs the one `home.bootstrap` call during the Home Server Component render and
 * dehydrates the four slices onto the exact client cache keys, so the browser
 * paints from hydrated data with zero initial `/api/orpc` requests.
 * Fails open: any data-phase error returns `undefined` and Home falls back to
 * today's client-side fetching.
 * @returns
 * - Dehydrated state holding category/todo/heatmap/journal for `<HydrationBoundary>`
 * - `undefined` when signed out or when the bootstrap call fails
 * @example `const dehydratedHomeState = await prefetchHomeBootstrap()`
 */
export async function prefetchHomeBootstrap(): Promise<
  DehydratedState | undefined
> {
  // Clerk/Next dynamic-rendering control flow must propagate, so auth and
  // request-header reads stay OUTSIDE the fail-open guard below.
  const { userId } = await auth()
  if (!userId) {
    return undefined
  }

  const viewerTimeZone = await resolveViewerTimeZone()
  const viewerSelectedCategoryId = await resolveViewerSelectedCategoryId()
  const viewerRetainCompleted = await resolveViewerRetainCompleted()
  const serverTiming = new ServerTiming()

  try {
    const bootstrap = await call(
      bootstrapHome,
      buildHomeBootstrapInput(
        viewerTimeZone,
        viewerSelectedCategoryId,
        viewerRetainCompleted,
      ),
      {
        context: {
          // Same Bearer contract the browser RPCLink sends; authMiddleware
          // resolves the user once and every child procedure reuses it.
          headers: new Headers({ authorization: `Bearer ${userId}` }),
          serverTiming,
        },
      },
    )

    const queryClient = createQueryClient()
    queryClient.setQueryData(getHomeCategoryListQueryKey(), bootstrap.category)
    queryClient.setQueryData(
      getHomeTodoListQueryKey(viewerSelectedCategoryId, viewerRetainCompleted),
      bootstrap.todo,
    )
    queryClient.setQueryData(
      getHomeHeatmapQueryKey(viewerTimeZone),
      bootstrap.heatmap,
    )
    // Seed page one of the infinite journal; fetchNextPage continues from
    // `nextOffset` exactly as if the client had fetched the page itself.
    queryClient.setQueryData(getHomeJournalQueryKey(), {
      pageParams: [COMPLETED_JOURNAL_INITIAL_OFFSET],
      pages: [bootstrap.journal],
    })

    // The SSR path never crosses the API route, so surface the phase split in
    // server logs instead of a Server-Timing header.
    log.info(`⏱️ home.bootstrap SSR prefetch: ${serverTiming.toHeaderValue()}`)

    return dehydrate(queryClient)
  } catch (error) {
    log.error(
      '❌ home.bootstrap SSR prefetch failed, falling back to client fetch:',
      error,
    )
    return undefined
  }
}
