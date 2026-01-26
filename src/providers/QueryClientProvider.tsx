'use client'

import { createSyncStoragePersister } from '@tanstack/query-sync-storage-persister'
import {
  QueryClientProvider as TanstackQueryClientProvider,
  defaultShouldDehydrateQuery,
  QueryClient,
} from '@tanstack/react-query'
import { ReactQueryDevtools } from '@tanstack/react-query-devtools'
import { PersistQueryClientProvider } from '@tanstack/react-query-persist-client'

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
      shouldDehydrateQuery: (query) =>
        defaultShouldDehydrateQuery(query) || query.state.status === 'pending',
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
        <ReactQueryDevtools initialIsOpen={false} />
      </TanstackQueryClientProvider>
    )
  }

  return (
    <PersistQueryClientProvider
      client={queryClient}
      persistOptions={{ persister }}
    >
      {children}
      <ReactQueryDevtools initialIsOpen={false} />
    </PersistQueryClientProvider>
  )
}
