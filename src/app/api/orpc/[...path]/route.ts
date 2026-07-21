import { RPCHandler } from '@orpc/server/fetch'

import { router } from '@/server/router'
import { ServerTiming } from '@/server/timing/ServerTiming'

import { log } from '../../../../lib/logger'

const handler = new RPCHandler(router)
const SERVER_TIMING_HEADER_NAME = 'server-timing'
const SERVER_TIMING_MIRROR_HEADER_NAME = 'x-corelive-server-timing'

/** Mutates the final oRPC response with standard and diagnostic timing headers so preview QA can distinguish name filtering from response rewrapping. @param response - Mutable response produced by oRPC or the route fallback. @param serverTiming - Per-request phase collector. @param startedAt - Monotonic request start timestamp. @returns The same response with identical timing headers attached. @example `withServerTiming(new Response('ok'), timing, performance.now())` */
function withServerTiming(
  response: Response,
  serverTiming: ServerTiming,
  startedAt: number,
): Response {
  serverTiming.record('total', performance.now() - startedAt)
  const headerValue = serverTiming.toHeaderValue()
  response.headers.set(SERVER_TIMING_HEADER_NAME, headerValue)
  // The mirror distinguishes Vercel stripping the standard header name from
  // a route/proxy layer discarding every application response header.
  response.headers.set(SERVER_TIMING_MIRROR_HEADER_NAME, headerValue)

  return response
}

/** Handles every oRPC HTTP verb so production responses expose the measured Home/API latency split. @param request - Incoming browser or server request. @returns The oRPC response, 404 fallback, or instrumented 500 response. @example `await handleRequest(new Request('https://corelive.app/api/orpc/todo/list'))` */
async function handleRequest(request: Request): Promise<Response> {
  const startedAt = performance.now()
  const serverTiming = new ServerTiming()

  try {
    const { response } = await handler.handle(request, {
      prefix: '/api/orpc',
      context: {
        headers: request.headers,
        serverTiming,
      },
    })

    return withServerTiming(
      response ?? new Response('Not found', { status: 404 }),
      serverTiming,
      startedAt,
    )
  } catch (error) {
    log.error('❌ oPRC Handler Error:', error)
    // Return a fixed generic payload — exception message/stack (DB internals,
    // filesystem paths, dependency names) stay in the server log above and are
    // never leaked to the browser.
    return withServerTiming(
      new Response(JSON.stringify({ error: 'Internal Server Error' }), {
        status: 500,
        headers: { 'content-type': 'application/json' },
      }),
      serverTiming,
      startedAt,
    )
  }
}

export const GET = handleRequest
export const POST = handleRequest
export const PUT = handleRequest
export const PATCH = handleRequest
export const DELETE = handleRequest
