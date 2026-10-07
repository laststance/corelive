import { RPCJsonSerializer } from '@orpc/client'

// Share oRPC's built-in types between query hashing, SSR hydration, and persisted cache.
export const serializer = new RPCJsonSerializer()
