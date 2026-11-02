import { hashKey, QueryClient } from '@tanstack/react-query'

import {
  QUERY_CACHE_RETENTION_MS,
  QUERY_STALE_TIME_MS,
} from '@/lib/constants/query'
import { serializer } from '@/lib/orpc/serializer'

/** Builds one server-request or browser-session QueryClient so SSR hydration, oRPC keys, and persisted dates share one serialization contract. @returns A fresh QueryClient with one-minute freshness and seven-day retention. @example `const queryClient = createQueryClient()` */
export function createQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: {
        queryKeyHashFn(queryKey) {
          const { json, meta } = serializer.serialize(queryKey)
          // Canonicalize object keys and metadata so SSR/client insertion order cannot split the cache.
          return hashKey([
            json,
            meta?.map((entry) => JSON.stringify(entry)).sort(),
          ])
        },
        staleTime: QUERY_STALE_TIME_MS,
        gcTime: QUERY_CACHE_RETENTION_MS,
      },
      dehydrate: {
        serializeData(data) {
          return serializer.serialize(data)
        },
      },
      hydrate: {
        deserializeData(data) {
          return serializer.deserialize(data)
        },
      },
    },
  })
}
