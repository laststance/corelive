import { defaultShouldDehydrateQuery, QueryClient } from '@tanstack/react-query'

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
          const [json, meta] = serializer.serialize(queryKey)
          return JSON.stringify({ json, meta })
        },
        staleTime: QUERY_STALE_TIME_MS,
        gcTime: QUERY_CACHE_RETENTION_MS,
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
}
