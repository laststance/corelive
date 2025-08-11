import { http, HttpResponse } from 'msw'
import { describe, it, expect } from 'vitest'

import { server } from '../../mocks/node'

// Example function that makes an API call
async function fetchUserData(userId: string) {
  const response = await fetch(`/api/users/${userId}`)
  if (!response.ok) {
    throw new Error('Failed to fetch user')
  }
  return response.json()
}

describe('API mocking with MSW example', () => {
  it('should fetch user data successfully', async () => {
    // Override the default handlers for this test
    server.use(
      http.get('/api/users/:userId', ({ params }) => {
        return HttpResponse.json({
          id: params.userId,
          name: 'John Doe',
          email: 'john@example.com',
        })
      }),
    )

    const userData = await fetchUserData('123')

    expect(userData).toEqual({
      id: '123',
      name: 'John Doe',
      email: 'john@example.com',
    })
  })

  it('should handle API errors', async () => {
    // Mock an error response
    server.use(
      http.get('/api/users/:userId', () => {
        return new HttpResponse(null, { status: 404 })
      }),
    )

    await expect(fetchUserData('999')).rejects.toThrow('Failed to fetch user')
  })

  it('should handle network errors', async () => {
    // Mock a network error
    server.use(
      http.get('/api/users/:userId', () => {
        return HttpResponse.error()
      }),
    )

    await expect(fetchUserData('123')).rejects.toThrow()
  })
})
