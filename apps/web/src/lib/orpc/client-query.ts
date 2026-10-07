import { createTanstackQueryUtils } from '@orpc/tanstack-query'

import { createClient } from './create-client'

/**
 * oRPC client instance with Clerk authentication integration.
 * Used for all API calls via React Query.
 */
const client = createClient()

/**
 * React Query utilities for oRPC.
 * Provides queryOptions, mutationOptions, etc. for type-safe API calls.
 *
 * @example
 * ```tsx
 * const { data } = useQuery(orpc.completed.heatmap.queryOptions({ input: { days: 365 } }))
 * const mutation = useMutation(orpc.completed.create.mutationOptions())
 * ```
 */
export const orpc = createTanstackQueryUtils(client)
