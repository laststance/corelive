import { http, HttpResponse } from 'msw'

export const handlers = [
  // Example handler for API endpoints
  http.get('/api/user', () => {
    return HttpResponse.json({
      id: '1',
      name: 'Test User',
      email: 'test@example.com',
    })
  }),

  // Add more handlers as needed
]
