import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { ServerTiming } from '@/server/timing/ServerTiming'

interface MockHandlerOptions {
  context: { serverTiming: ServerTiming }
}

type MockHandle = (
  request: Request,
  options: MockHandlerOptions,
) => Promise<{ response: Response }>

const mockHandle = vi.hoisted(() => vi.fn<MockHandle>())

vi.mock('@orpc/server/fetch', () => ({
  RPCHandler: class MockRPCHandler {
    /** Mirrors oRPC's public fetch adapter while the route response wiring remains the unit under test. @param request - Incoming API request. @param options - Route context containing the timing recorder. @returns The controlled oRPC response. @example `handler.handle(request, options)` */
    async handle(request: Request, options: MockHandlerOptions) {
      return mockHandle(request, options)
    }
  },
}))

vi.mock('@/server/router', () => ({ router: {} }))

import { POST } from './route'

beforeEach(() => {
  mockHandle.mockReset()
})

describe('oRPC route Server-Timing response', () => {
  it('exposes auth, DB connection, user resolution, and SQL phases on a production response', async () => {
    // Arrange
    mockHandle.mockImplementation(async (_request, options) => {
      options.context.serverTiming.record('auth', 1)
      options.context.serverTiming.record('db', 2)
      options.context.serverTiming.record('user', 3)
      options.context.serverTiming.record('sql', 4)
      return { response: new Response('ok') }
    })
    const request = new Request(
      'https://corelive.app/api/orpc/home/bootstrap',
      {
        method: 'POST',
        body: '{}',
      },
    )

    // Act
    const response = await POST(request)

    // Assert
    expect(response.status).toBe(200)
    expect(response.headers.get('server-timing')).toMatch(
      /^auth;dur=1\.00, db;dur=2\.00, user;dur=3\.00, sql;dur=4\.00, total;dur=\d+\.\d{2}$/,
    )
  })

  it('keeps exception details out of the 500 body when the oRPC handler throws', async () => {
    // Arrange — the handler throws an error carrying internal details
    mockHandle.mockImplementation(async () => {
      throw new Error('connect ECONNREFUSED 127.0.0.1:5491 (postgres)')
    })
    const request = new Request(
      'https://corelive.app/api/orpc/home/bootstrap',
      {
        method: 'POST',
        body: '{}',
      },
    )

    // Act
    const response = await POST(request)
    const body = await response.json()

    // Assert — client sees only a generic error, never the message or stack
    expect(response.status).toBe(500)
    expect(body).toEqual({ error: 'Internal Server Error' })
    expect(JSON.stringify(body)).not.toMatch(/ECONNREFUSED|postgres|stack/i)
  })
})
