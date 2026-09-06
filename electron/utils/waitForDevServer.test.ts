import { afterEach, expect, test, vi } from 'vitest'

import { waitForDevServer } from './waitForDevServer'

afterEach(() => {
  vi.useRealTimers()
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

test('opens Electron only after a successful page response and releases the response body', async () => {
  // Arrange
  vi.useFakeTimers()
  const compilingBody = new Response('Compiling', { status: 503 })
  const readyBody = new Response('Ready')
  const fetchPage = vi
    .fn()
    .mockResolvedValueOnce(compilingBody)
    .mockResolvedValueOnce(readyBody)
  vi.stubGlobal('fetch', fetchPage)
  const openElectron = vi.fn()

  // Act
  const startup = waitForDevServer('http://localhost:4991').then(openElectron)
  await vi.advanceTimersByTimeAsync(999)

  // Assert
  expect(openElectron).not.toHaveBeenCalled()
  expect(fetchPage).toHaveBeenCalledTimes(1)
  await vi.advanceTimersByTimeAsync(1)
  await startup
  expect(openElectron).toHaveBeenCalledTimes(1)
  expect(compilingBody.bodyUsed).toBe(true)
  expect(readyBody.bodyUsed).toBe(true)
})

test('aborts a stalled readiness request so Electron can start after a later response', async () => {
  // Arrange
  vi.useFakeTimers()
  vi.spyOn(AbortSignal, 'timeout').mockImplementation((milliseconds) => {
    const controller = new AbortController()
    setTimeout(() => controller.abort(), milliseconds)
    return controller.signal
  })
  const fetchPage = vi
    .fn()
    .mockImplementationOnce(
      async (_url: string, options: RequestInit) =>
        new Promise((_resolve, reject) => {
          options.signal?.addEventListener(
            'abort',
            () => reject(new Error('Request timed out')),
            { once: true },
          )
        }),
    )
    .mockResolvedValueOnce(new Response('Ready'))
  vi.stubGlobal('fetch', fetchPage)
  const openElectron = vi.fn()

  // Act
  const startup = waitForDevServer('http://localhost:4991').then(openElectron)
  await vi.advanceTimersByTimeAsync(2999)

  // Assert
  expect(openElectron).not.toHaveBeenCalled()
  expect(fetchPage).toHaveBeenCalledTimes(1)
  await vi.advanceTimersByTimeAsync(1)
  await startup
  expect(openElectron).toHaveBeenCalledTimes(1)
  expect(fetchPage).toHaveBeenCalledTimes(2)
})

test('fails development startup after 30 unavailable responses without opening Electron', async () => {
  // Arrange
  vi.useFakeTimers()
  const fetchPage = vi.fn().mockRejectedValue(new Error('Connection refused'))
  vi.stubGlobal('fetch', fetchPage)
  const openElectron = vi.fn()

  // Act
  const startup = waitForDevServer('http://localhost:4991').then(openElectron)
  const failure = expect(startup).rejects.toThrow(
    'Next.js dev server failed to start after maximum retries',
  )
  await vi.advanceTimersByTimeAsync(29000)
  await failure

  // Assert
  expect(fetchPage).toHaveBeenCalledTimes(30)
  expect(openElectron).not.toHaveBeenCalled()
  expect(vi.getTimerCount()).toBe(0)
})
