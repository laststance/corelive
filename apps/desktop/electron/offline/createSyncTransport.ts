import {
  SyncBootstrapOutputSchema,
  SyncCheckpointOutputSchema,
  SyncReceiptsOutputSchema,
  type CompletionSyncTransport,
  type SyncBootstrap,
  type SyncCheckpointInput,
  type SyncReceiptsOutput,
} from '@corelive/desktop-contract/offline-sync'
import type {
  CompletionSyncOperation,
  CountCheckpoint,
} from '@corelive/desktop-contract/offline-workspace'
import { createORPCClient, type Client } from '@orpc/client'
import { RPCLink } from '@orpc/client/fetch'

type SyncClient = {
  completed: {
    syncBootstrap: Client<object, undefined, SyncBootstrap, Error>
    syncApply: Client<
      object,
      { operations: CompletionSyncOperation[] },
      SyncReceiptsOutput,
      Error
    >
    syncReceipts: Client<
      object,
      { operationIds: string[] },
      SyncReceiptsOutput,
      Error
    >
    syncCheckpoint: Client<object, SyncCheckpointInput, CountCheckpoint, Error>
  }
}

/** Recognizes auth rejection from both oRPC v2 codes and a plain HTTP 401 response.
 * The sync loop/preparation use this to offer sign-in without blocking local editing.
 * @example isSyncAuthenticationError(error)
 */
export function isSyncAuthenticationError(error: unknown): boolean {
  if (typeof error !== 'object' || error === null) return false
  if ('code' in error && error.code === 'UNAUTHORIZED') return true
  if ('status' in error && error.status === 401) return true
  return (
    'code' in error &&
    error.code === 'MALFORMED_ORPC_RESPONSE' &&
    'data' in error &&
    typeof error.data === 'object' &&
    error.data !== null &&
    'status' in error.data &&
    error.data.status === 401
  )
}

/**
 * Creates a narrowly scoped API client bound to an in-memory Clerk credential.
 * Main supplies the configured app origin, never a renderer-provided URL. Redirects
 * are refused so a bearer credential cannot be forwarded to an unexpected host.
 * @example const transport = createSyncTransport(origin, token)
 */
export function createSyncTransport(
  origin: string,
  token: string,
  fetcher: typeof fetch = fetch,
): CompletionSyncTransport {
  const configured = new URL(origin)
  const isLocal =
    configured.protocol === 'http:' &&
    ['localhost', '127.0.0.1'].includes(configured.hostname)
  if (configured.protocol !== 'https:' && !isLocal)
    throw new Error('Unsupported sync origin')
  // Production's canonical alias avoids the ordinary bare-domain redirect before attaching a token.
  const target =
    configured.origin === 'https://corelive.app'
      ? 'https://www.corelive.app'
      : configured.origin
  const client = createORPCClient<SyncClient>(
    new RPCLink({
      origin: target,
      url: '/api/orpc',
      headers: { Authorization: `Bearer ${token}` },
      fetch: async (url, init) =>
        fetcher(url, {
          ...init,
          redirect: 'error',
          signal: init?.signal
            ? AbortSignal.any([init.signal, AbortSignal.timeout(15000)])
            : AbortSignal.timeout(15000),
        }),
    }),
  )
  return {
    bootstrap: async (signal) =>
      SyncBootstrapOutputSchema.parse(
        await client.completed.syncBootstrap(undefined, { signal }),
      ),
    apply: async (input, signal) =>
      SyncReceiptsOutputSchema.parse(
        await client.completed.syncApply(input, { signal }),
      ),
    receipts: async (input, signal) =>
      SyncReceiptsOutputSchema.parse(
        await client.completed.syncReceipts(input, { signal }),
      ),
    checkpoint: async (input, signal) =>
      SyncCheckpointOutputSchema.parse(
        await client.completed.syncCheckpoint(input, { signal }),
      ),
  }
}
