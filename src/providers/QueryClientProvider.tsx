'use client'

import {
  QueryClientProvider as TanstackQueryClientProvider,
  defaultShouldDehydrateQuery,
  QueryClient,
} from '@tanstack/react-query'
import { ReactQueryDevtools } from '@tanstack/react-query-devtools'

import { serializer } from '@/lib/orpc/serializer'

/**
 * Global QueryClient instance configured for oRPC serialization.
 * - queryKeyHashFn: Uses oRPC serializer for proper key hashing
 * - staleTime: 1 minute to prevent immediate refetching on mount
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

// Re-export orpc from client-query for convenience
export { orpc } from '@/lib/orpc/client-query'

/**
 * Provider component that wraps the app with TanStack Query context.
 * Must be used at the root of the application for React Query to work.
 */
export function QueryClientProvider({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <TanstackQueryClientProvider client={queryClient}>
      {children}
      <ReactQueryDevtools initialIsOpen={false} />
    </TanstackQueryClientProvider>
  )
}
