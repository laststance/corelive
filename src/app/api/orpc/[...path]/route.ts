import { RPCHandler } from '@orpc/server/fetch'

import { router } from '@/server/router'
import { ServerTiming } from '@/server/timing/ServerTiming'

import { log } from '../../../../lib/logger'

const handler = new RPCHandler(router)

/** Adds the completed request phases whenever the oRPC adapter returns or the fallback handles an error. @param response - Response produced by oRPC or the route fallback. @param serverTiming - Per-request phase collector. @param startedAt - Monotonic request start timestamp. @returns A response with the `Server-Timing` header attached. @example `withServerTiming(new Response('ok'), timing, performance.now())` */
function withServerTiming(
  response: Response,
  serverTiming: ServerTiming,
  startedAt: number,
): Response {
  serverTiming.record('total', performance.now() - startedAt)
  const headers = new Headers(response.headers)
  headers.set('server-timing', serverTiming.toHeaderValue())

  return new Response(response.body, {
    headers,
    status: response.status,
    statusText: response.statusText,
  })
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
