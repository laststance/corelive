'use client'

import { useAuth } from '@clerk/nextjs'
import { createSyncStoragePersister } from '@tanstack/query-sync-storage-persister'
import {
  QueryClientProvider as TanstackQueryClientProvider,
  defaultShouldDehydrateQuery,
  QueryClient,
} from '@tanstack/react-query'
import {
  PersistQueryClientProvider,
  type Persister,
} from '@tanstack/react-query-persist-client'
import { useEffect, useRef } from 'react'

import { serializer } from '@/lib/orpc/serializer'

/**
 * Global QueryClient instance configured for oRPC serialization and localStorage persistence.
 * - queryKeyHashFn: Uses oRPC serializer for proper key hashing
 * - staleTime: 1 minute to prevent immediate refetching on mount
 * - gcTime: 1 week to retain cache for persistence across page reloads
 * - dehydrate/hydrate: SSR support with proper serialization
 */
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      queryKeyHashFn(queryKey) {
        const [json, meta] = serializer.serialize(queryKey)
        return JSON.stringify({ json, meta })
      },
      staleTime: 60 * 1000, // Consider data fresh for 1 minute
      gcTime: 1000 * 60 * 60 * 24 * 7, // 1 week - required for persistence
    },
    dehydrate: {
      shouldDehydrateQuery: defaultShouldDehydrateQuery,
      serializeData(data) {
        const [json, meta] = serializer.serialize(data)
        return { json, meta }
      },
    },
    hydrate: {
      deserializeData(data) {
        return serializer.deserialize(data.json, data.meta)
      },
    },
  },
})

/**
 * localStorage persister for TanStack Query cache.
 * SSR-safe: only created when window is available (client-side).
 * @returns SyncStoragePersister instance or undefined during SSR
 */
const persister =
  typeof window !== 'undefined'
    ? createSyncStoragePersister({ storage: window.localStorage })
    : undefined

// Re-export orpc from client-query for convenience
export { orpc } from '@/lib/orpc/client-query'

/**
 * Watches Clerk auth state and clears the persisted cache on sign-out.
 *
 * Why: the TanStack Query cache is persisted to plain localStorage with no
 * per-user key namespacing. On a shared device, user A's cached queries
 * (todos, skill tree, etc.) would survive into user B's session until
 * background refetches replaced them — leaking A's data to B.
 *
 * The fix: detect the signed-in → signed-out transition and nuke both the
 * persister and the in-memory QueryClient. A ref tracks the prior signed-in
 * state so we only clear on the actual transition, not on first mount.
 *
 * @returns null — this is a side-effect-only component.
 */
function PersisterSignOutGuard({ persister }: { persister: Persister }) {
  const { isSignedIn, isLoaded } = useAuth()
  const wasSignedIn = useRef<boolean | null>(null)

  useEffect(() => {
    if (!isLoaded) return
    if (wasSignedIn.current === true && isSignedIn === false) {
      // Remove persisted cache from localStorage, then clear in-memory
      // state so the next signed-in user starts fresh.
      void persister.removeClient()
      queryClient.clear()
    }
    wasSignedIn.current = isSignedIn ?? false
  }, [isSignedIn, isLoaded, persister])

  return null
}

/**
 * Provider component that wraps the app with TanStack Query context and localStorage persistence.
 * Cache is persisted to localStorage and restored on page reload for instant UI rendering.
 * @param children - React child components
 */
export function QueryClientProvider({
  children,
}: {
  children: React.ReactNode
}) {
  if (!persister) {
    // SSR fallback: render without persistence
    return (
      <TanstackQueryClientProvider client={queryClient}>
        {children}
      </TanstackQueryClientProvider>
    )
  }

  return (
    <PersistQueryClientProvider
      client={queryClient}
      persistOptions={{ persister }}
    >
      <PersisterSignOutGuard persister={persister} />
      {children}
    </PersistQueryClientProvider>
  )
}
