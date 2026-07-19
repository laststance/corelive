'use client'

import { useAuth } from '@clerk/nextjs'
import { createSyncStoragePersister } from '@tanstack/query-sync-storage-persister'
import { QueryClientProvider as TanstackQueryClientProvider } from '@tanstack/react-query'
import { PersistQueryClientProvider } from '@tanstack/react-query-persist-client'
import * as React from 'react'
import { useRef, useState } from 'react'

import { useCycleEffect } from '@/hooks/use-cycle-effect'
import { PERSISTED_QUERY_MAX_AGE_MS } from '@/lib/constants/query'
import { createQueryClient } from '@/lib/query/createQueryClient'

/** Creates browser persistence at provider initialization while SSR falls back to memory-only Query state. @returns A localStorage persister in the browser, or undefined on the server. @example `const persister = createPersister()` */
function createPersister() {
  return typeof window !== 'undefined'
    ? createSyncStoragePersister({ storage: window.localStorage })
    : undefined
}

// Re-export orpc from client-query for convenience
export { orpc } from '@/lib/orpc/client-query'

/**
 * Watches Clerk auth state and fires `onSessionReset` on every signed-in →
 * signed-out transition. The callback is responsible for wiping both the
 * persisted and in-memory caches and for replacing the QueryClient instance
 * entirely — see `QueryClientProvider` for why that replacement matters.
 *
 * A ref tracks the prior signed-in value so we only reset on the actual
 * transition, not on first mount.
 *
 * @returns null — side-effect-only component.
 */
function PersisterSignOutGuard({
  onSessionReset,
}: {
  onSessionReset: () => void
}) {
  const { isSignedIn, isLoaded } = useAuth()
  const wasSignedIn = useRef<boolean | null>(null)

  useCycleEffect(() => {
    if (!isLoaded) return
    if (wasSignedIn.current === true && isSignedIn === false) {
      onSessionReset()
    }
    wasSignedIn.current = isSignedIn ?? false
  }, [isSignedIn, isLoaded, onSessionReset])

  return null
}

/**
 * Provider component that wraps the app with TanStack Query context and
 * localStorage persistence.
 *
 * Shared-device safety: on sign-out, we do not just clear the cache — we
 * rebuild the entire QueryClient + persister pair and remount the provider.
 * The motivation is that `queryClient.clear()` cancels in-flight query
 * fetches (via their AbortController) but does NOT cancel in-flight
 * mutations. Without a full instance swap, an in-flight mutation submitted
 * by user A that resolves after the sign-out handler runs would fire its
 * `onSuccess` / `onSettled` callbacks and write stale data back into the
 * same cache via `setQueryData` / `invalidateQueries` — leaking user A's
 * data into user B's session. By replacing the QueryClient instance,
 * those old callbacks land on an orphaned client nobody renders from, and
 * the new session starts from an empty, isolated cache.
 *
 * The `key={resetKey}` on `PersistQueryClientProvider` forces a full
 * teardown of the persistence subscription so no stale writers survive.
 *
 * @param children - React child components
 * @returns The isolated TanStack Query provider tree for the current Clerk session.
 * @example `<QueryClientProvider><App /></QueryClientProvider>`
 */
export const QueryClientProvider = function QueryClientProvider({
  children,
}: {
  children: React.ReactNode
}) {
  const [resetKey, setResetKey] = useState(0)
  const [queryClient, setQueryClient] = useState(createQueryClient)
  const [persister, setPersister] = useState(createPersister)

  /** Wipes the prior user's persisted and live Query state only when the Clerk sign-out guard fires. @returns Nothing after replacing the provider generation. @example `handleSessionReset()` */
  const handleSessionReset = () => {
    // 1. Wipe the persisted localStorage entry first so the hydrate pass
    //    on the next mount cannot momentarily flash user A's data.
    persister?.removeClient()
    // 2. Clear in-memory state of the OLD client. This aborts in-flight
    //    queries via their AbortControllers. In-flight mutations are NOT
    //    aborted and will still run their callbacks — see step 3.
    queryClient.clear()
    // 3. Replace the client, persister, and provider subtree. Old mutation
    //    callbacks captured the previous client via closure, so any writes
    //    that still fire (setQueryData / invalidateQueries) land on an
    //    orphaned instance and never reach the new session's cache.
    setQueryClient(createQueryClient())
    setPersister(createPersister())
    setResetKey((currentResetKey) => currentResetKey + 1)
  }

  if (!persister) {
    // SSR fallback: render without persistence
    return (
      <TanstackQueryClientProvider client={queryClient}>
        {children}
      </TanstackQueryClientProvider>
    )
  }

  // Match persistence lifetime to Query gcTime so restored Home data survives the documented seven-day window.
  const persistOptions = {
    persister,
    maxAge: PERSISTED_QUERY_MAX_AGE_MS,
  }

  return (
    <PersistQueryClientProvider
      key={resetKey}
      client={queryClient}
      persistOptions={persistOptions}
    >
      <PersisterSignOutGuard onSessionReset={handleSessionReset} />
      {children}
    </PersistQueryClientProvider>
  )
}
