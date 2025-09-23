import { RPCHandler } from '@orpc/server/fetch'

import { router } from '@/server/router'

import { log } from '../../../../lib/logger'

const handler = new RPCHandler(router)

async function handleRequest(request: Request) {
  try {
    // Clone and read request body
    const clonedRequest = request.clone()
    await clonedRequest.text()

    const { response } = await handler.handle(request, {
      prefix: '/api/orpc',
      context: {
        headers: request.headers,
      },
    })

    return response ?? new Response('Not found', { status: 404 })
  } catch (error) {
    log.error('❌ oPRC Handler Error:', error)
    return new Response(
      JSON.stringify({
        error: 'Internal Server Error',
        message: error instanceof Error ? error.message : 'Unknown error',
        stack: error instanceof Error ? error.stack : undefined,
      }),
      {
        status: 500,
        headers: { 'content-type': 'application/json' },
      },
    )
  }
}

export const GET = handleRequest
export const POST = handleRequest
export const PUT = handleRequest
export const PATCH = handleRequest
export const DELETE = handleRequest
