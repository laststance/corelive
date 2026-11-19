import type {
  CompletionRange,
  HistoryFrame,
} from '@corelive/desktop-contract/completion-history'
import type {
  DashboardAppearance,
  GetDashboardAppearance,
  SetDashboardAppearance,
} from '@corelive/desktop-contract/dashboard-appearance'
import type {
  DayDetailInputSchema,
  DayDetailResponseSchema,
  HeatmapInputSchema,
  HeatmapResponseSchema,
} from '@corelive/desktop-contract/dashboard-completions'
import type {
  HomeBootstrapInput,
  HomeBootstrapResponse,
} from '@corelive/desktop-contract/dashboard-home'
import type {
  AssignTaskInputSchema,
  NodeAssignmentSchema,
  SkillTreeSchema,
  UnassignedPoolPageInputSchema,
  UnassignedPoolPageSchema,
} from '@corelive/desktop-contract/dashboard-skills'
import {
  AccountWhoamiOutputSchema,
  SyncCategoryOutputSchema,
  SyncBootstrapOutputSchema,
  SyncCheckpointOutputSchema,
  SyncReceiptsOutputSchema,
  type AccountWhoami,
  type CompletionSyncTransport,
  type SyncBootstrap,
  type SyncCategoryApplyInput,
  type SyncCategoryApplyOutput,
  type SyncCheckpointInput,
  type SyncReceiptsOutput,
} from '@corelive/desktop-contract/offline-sync'
import type {
  CompletionSyncOperation,
  CountCheckpoint,
} from '@corelive/desktop-contract/offline-workspace'
import { createORPCClient, type Client } from '@orpc/client'
import { RPCLink } from '@orpc/client/fetch'
import type { z } from 'zod'

const ACCOUNT_REQUEST_TIMEOUT_MS = 15_000

type SyncClient = {
  category: {
    syncApply: Client<
      object,
      SyncCategoryApplyInput,
      SyncCategoryApplyOutput,
      Error
    >
    syncReceipts: Client<
      object,
      { operationIds: string[] },
      SyncCategoryApplyOutput,
      Error
    >
  }
  account: {
    whoami: Client<object, undefined, AccountWhoami, Error>
  }
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

type Endpoint<I, O> = Client<object, I, O, Error>
/** Authenticated operations available to the ordinary app; helpers cannot choose arbitrary RPC paths. */
export type McpAccountClient = {
  dashboardAppearance: {
    get: Endpoint<GetDashboardAppearance, DashboardAppearance>
    set: Endpoint<SetDashboardAppearance, DashboardAppearance>
  }
  home: { bootstrap: Endpoint<HomeBootstrapInput, HomeBootstrapResponse> }
  completed: {
    historyRange: Endpoint<CompletionRange, AsyncIterable<HistoryFrame>>
    dayDetail: Endpoint<
      z.input<typeof DayDetailInputSchema>,
      z.output<typeof DayDetailResponseSchema>
    >
    heatmap: Endpoint<
      z.input<typeof HeatmapInputSchema>,
      z.output<typeof HeatmapResponseSchema>
    >
  }
  skillTree: {
    getMyTree: Endpoint<undefined, z.output<typeof SkillTreeSchema>>
    getUnassignedPoolPage: Endpoint<
      z.input<typeof UnassignedPoolPageInputSchema>,
      z.output<typeof UnassignedPoolPageSchema>
    >
    assignTask: Endpoint<
      z.input<typeof AssignTaskInputSchema>,
      z.output<typeof NodeAssignmentSchema>
    >
    unassignTask: Endpoint<
      z.input<typeof AssignTaskInputSchema>,
      z.output<typeof NodeAssignmentSchema> | null
    >
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
  const client = createORPCClient<SyncClient>(
    accountLink(origin, token, fetcher),
  )
  return {
    whoami: async (signal) =>
      AccountWhoamiOutputSchema.parse(
        await client.account.whoami(undefined, { signal }),
      ),
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
    categoryApply: async (input, signal) =>
      SyncCategoryOutputSchema.parse(
        await client.category.syncApply(input, { signal }),
      ),
    categoryReceipts: async (input, signal) =>
      SyncCategoryOutputSchema.parse(
        await client.category.syncReceipts(input, { signal }),
      ),
    checkpoint: async (input, signal) =>
      SyncCheckpointOutputSchema.parse(
        await client.completed.syncCheckpoint(input, { signal }),
      ),
  }
}

/** Gives the ordinary Mac app a typed dashboard client using the same authenticated network policy.
 * @example const client = createMcpAccountClient(origin, token)
 */
export function createMcpAccountClient(
  origin: string,
  token: string,
  fetcher: typeof fetch = fetch,
): McpAccountClient {
  return createORPCClient<McpAccountClient>(accountLink(origin, token, fetcher))
}

/**
 * Bounds the wait for history headers and gaps in the body while allowing long transfers.
 * The account link uses this for history reads so an active stream can verify its terminal frame.
 * @example const response = await fetchAccountHistory(fetcher, url, request)
 */
async function fetchAccountHistory(
  fetcher: typeof fetch,
  url: string,
  init: RequestInit,
): Promise<Response> {
  const deadline = new AbortController()
  const signal = init.signal
    ? AbortSignal.any([init.signal, deadline.signal])
    : deadline.signal
  const timer = setTimeout(() => {
    deadline.abort(
      new DOMException('Account history transfer timed out', 'TimeoutError'),
    )
  }, ACCOUNT_REQUEST_TIMEOUT_MS).unref()
  const clearDeadline = (): void => clearTimeout(timer)

  try {
    const response = await fetcher(url, { ...init, signal })
    if (!response.body) {
      clearDeadline()
      return response
    }
    timer.refresh()
    const traffic = new TransformStream<Uint8Array, Uint8Array>({
      transform(bytes, stream) {
        timer.refresh()
        stream.enqueue(bytes)
      },
    })
    void response.body
      .pipeTo(traffic.writable, { signal })
      .then(clearDeadline, clearDeadline)
    return new Response(traffic.readable, response)
  } catch (error) {
    clearDeadline()
    throw error
  }
}

/** Pins credentials to the configured dashboard origin and applies the appropriate network deadline.
 * @example const link = accountLink(origin, token, fetch)
 */
function accountLink(origin: string, token: string, fetcher: typeof fetch) {
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
  return new RPCLink({
    origin: target,
    url: '/api/orpc',
    headers: { Authorization: `Bearer ${token}` },
    fetch: async (url, init, _options, [router, procedure]) => {
      if (router === 'completed' && procedure === 'historyRange') {
        return fetchAccountHistory(fetcher, url, { ...init, redirect: 'error' })
      }
      const deadline = AbortSignal.timeout(ACCOUNT_REQUEST_TIMEOUT_MS)
      return fetcher(url, {
        ...init,
        redirect: 'error',
        signal: init.signal
          ? AbortSignal.any([init.signal, deadline])
          : deadline,
      })
    },
  })
}
