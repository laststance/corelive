import { RPCHandler } from '@orpc/server/fetch'

import { router } from '@/server/router'

const handler = new RPCHandler(router)

async function handleRequest(request: Request) {
  try {
    // TODO: Use Certain Logger Library
    console.log('🔍 oPRC Request Debug:', {
      method: request.method,
      url: request.url,
      headers: Object.fromEntries(request.headers.entries()),
      contentType: request.headers.get('content-type'),
    })

    // Clone and read request body
    const clonedRequest = request.clone()
    const body = await clonedRequest.text()
    console.log('📦 Request Body:', body)

    const { response } = await handler.handle(request, {
      prefix: '/api/rpc',
      context: {
        headers: request.headers,
      },
    })

    return response ?? new Response('Not found', { status: 404 })
  } catch (error) {
    // TODO: Use Certain Logger Library
    console.error('❌ oPRC Handler Error:', error)
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
