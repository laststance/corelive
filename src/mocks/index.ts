// MSW initialization for tests and development
export async function initMocks() {
  if (typeof window === 'undefined') {
    // Node.js environment (tests, SSR)
    const { server } = await import('./node')
    server.listen({
      onUnhandledRequest: 'bypass',
    })
  } else {
    // Browser environment
    const { worker } = await import('./browser')
    await worker.start({
      onUnhandledRequest: 'bypass',
    })
  }
}