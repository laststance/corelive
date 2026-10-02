import { act, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, expect, test, vi } from 'vitest'

import OAuthCallbackPage from './page'

vi.mock('next/navigation', () => ({
  useSearchParams: () => new URLSearchParams({ state: 'qa-flow' }),
}))

const fetchMock = vi.fn()
let elapsedMs = 0

beforeEach(() => {
  elapsedMs = 0
  vi.spyOn(performance, 'now').mockImplementation(() => elapsedMs)
  fetchMock.mockReset()
  fetchMock.mockResolvedValue({
    ok: true,
    json: async () => ({
      token: 'synthetic-initial-ticket',
      expiresAt: Date.now() + 60_000,
      expiresInSeconds: 60,
    }),
  })
  vi.stubGlobal('fetch', fetchMock)
})

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
  vi.useRealTimers()
})

test('opens the native app synchronously from a completed sign-in button click', async () => {
  // Arrange
  vi.useFakeTimers()
  const assign = vi
    .spyOn(window.location, 'assign')
    .mockImplementation(() => undefined)
  render(<OAuthCallbackPage />)
  await act(async () => {
    await vi.advanceTimersByTimeAsync(2100)
  })
  const currentTime = Date.now()
  vi.useRealTimers()
  vi.spyOn(Date, 'now').mockReturnValue(currentTime)
  assign.mockClear()

  // Act
  fireEvent.click(await screen.findByRole('button', { name: 'Open CoreLive' }))

  // Assert
  expect(assign).toHaveBeenLastCalledWith(
    // eslint-disable-next-line browser-security/no-credentials-in-query-params -- Synthetic fixture pins the state-bound native ticket protocol.
    'corelive://oauth/callback?state=qa-flow&token=synthetic-initial-ticket',
  )
  expect(fetchMock).toHaveBeenCalledTimes(1)
  expect(screen.getByRole('button', { name: 'Open CoreLive' })).toBeVisible()
  expect(screen.queryByRole('link', { name: 'Open CoreLive' })).toBeNull()
})

test('shows a recoverable error when the browser cannot issue a fresh native ticket', async () => {
  // Arrange
  vi.useFakeTimers()
  const assign = vi
    .spyOn(window.location, 'assign')
    .mockImplementation(() => undefined)
  render(<OAuthCallbackPage />)
  await act(async () => {
    await vi.advanceTimersByTimeAsync(2100)
  })
  await act(async () => {
    await vi.advanceTimersByTimeAsync(60_000)
  })
  elapsedMs = 62_100
  const currentTime = Date.now()
  vi.useRealTimers()
  vi.spyOn(Date, 'now').mockReturnValue(currentTime)
  assign.mockClear()
  fetchMock.mockResolvedValueOnce({
    ok: false,
    json: async () => ({ error: 'Please restart sign-in from CoreLive.' }),
  })

  // Act
  fireEvent.click(await screen.findByRole('button', { name: 'Open CoreLive' }))

  // Assert
  expect(
    await screen.findByText(
      'Could not prepare your return to CoreLive. Please try again.',
    ),
  ).toBeVisible()
  expect(
    screen.getByRole('heading', { name: 'Could not return to CoreLive' }),
  ).toBeVisible()
  expect(
    screen.getByRole('button', { name: 'Close this window' }),
  ).toBeVisible()
  expect(assign).not.toHaveBeenCalled()

  // Act: recover the return ticket without repeating browser authentication.
  fireEvent.click(screen.getByRole('button', { name: 'Try again' }))
  await screen.findByText(
    'A fresh secure return is ready. Select Open CoreLive.',
  )
  expect(assign).not.toHaveBeenCalled()
  fireEvent.click(screen.getByRole('button', { name: 'Open CoreLive' }))

  // Assert
  expect(assign).toHaveBeenCalledTimes(1)
  expect(fetchMock).toHaveBeenCalledTimes(3)
  expect(screen.getByRole('button', { name: 'Open CoreLive' })).toHaveFocus()
})

test('prepares an expired native ticket before the next synchronous return click', async () => {
  // Arrange
  vi.useFakeTimers()
  const assign = vi
    .spyOn(window.location, 'assign')
    .mockImplementation(() => undefined)
  render(<OAuthCallbackPage />)
  await act(async () => {
    await vi.advanceTimersByTimeAsync(62_100)
  })
  elapsedMs = 62_100
  const currentTime = Date.now()
  vi.useRealTimers()
  vi.spyOn(Date, 'now').mockReturnValue(currentTime)
  assign.mockClear()
  fetchMock.mockResolvedValueOnce({
    ok: true,
    json: async () => ({
      token: 'synthetic-refreshed-ticket',
      expiresAt: Date.now() + 60_000,
      expiresInSeconds: 60,
    }),
  })

  // Act
  fireEvent.click(screen.getByRole('button', { name: 'Open CoreLive' }))
  await screen.findByText(
    'A fresh secure return is ready. Select Open CoreLive.',
  )
  expect(assign).not.toHaveBeenCalled()
  fireEvent.click(screen.getByRole('button', { name: 'Open CoreLive' }))

  // Assert
  expect(assign).toHaveBeenCalledWith(
    // eslint-disable-next-line browser-security/no-credentials-in-query-params -- Synthetic fixture pins a private native return ticket.
    'corelive://oauth/callback?state=qa-flow&token=synthetic-refreshed-ticket',
  )
  expect(fetchMock).toHaveBeenCalledTimes(2)
})

test('accepts a fresh return ticket when the browser clock is two minutes ahead', async () => {
  // Arrange
  vi.useFakeTimers()
  vi.spyOn(Date, 'now').mockReturnValue(1_700_000_120_000)
  fetchMock.mockResolvedValueOnce({
    ok: true,
    json: async () => ({
      token: 'synthetic-clock-ticket',
      expiresAt: 1_700_000_060_000,
      expiresInSeconds: 60,
    }),
  })
  const assign = vi
    .spyOn(window.location, 'assign')
    .mockImplementation(() => undefined)

  // Act
  render(<OAuthCallbackPage />)
  await act(async () => {
    await vi.advanceTimersByTimeAsync(2100)
  })
  vi.useRealTimers()
  vi.spyOn(Date, 'now').mockReturnValue(1_700_000_122_100)
  assign.mockClear()
  fireEvent.click(screen.getByRole('button', { name: 'Open CoreLive' }))

  // Assert
  expect(assign).toHaveBeenCalledTimes(1)
  expect(fetchMock).toHaveBeenCalledTimes(1)
  expect(
    screen.getByRole('heading', { name: 'Authentication Complete' }),
  ).toBeVisible()
})

test('offers a retry instead of opening a ticket consumed by slow network time', async () => {
  // Arrange
  fetchMock.mockResolvedValueOnce({
    ok: true,
    json: async () => {
      elapsedMs = 59_000
      return { token: 'synthetic-delayed-ticket', expiresInSeconds: 60 }
    },
  })
  const assign = vi
    .spyOn(window.location, 'assign')
    .mockImplementation(() => undefined)

  // Act
  render(<OAuthCallbackPage />)

  // Assert
  expect(await screen.findByRole('alert')).toHaveTextContent(
    'The return ticket expired. Please try again.',
  )
  expect(screen.getByRole('button', { name: 'Try again' })).toBeVisible()
  expect(assign).not.toHaveBeenCalled()
})

test('asks for a new desktop sign-in when the browser session has expired', async () => {
  // Arrange
  fetchMock.mockResolvedValueOnce({ ok: false, status: 401 })
  vi.spyOn(window.location, 'assign').mockImplementation(() => undefined)

  // Act
  render(<OAuthCallbackPage />)

  // Assert
  expect(await screen.findByRole('alert')).toHaveTextContent(
    'Your browser sign-in expired. Start sign-in again from CoreLive.',
  )
  expect(screen.queryByRole('button', { name: 'Try again' })).toBeNull()
})

test('refreshes the return ticket after sleep even when the monotonic clock pauses', async () => {
  // Arrange
  vi.useFakeTimers()
  vi.spyOn(Date, 'now').mockReturnValue(1_700_000_000_000)
  const assign = vi
    .spyOn(window.location, 'assign')
    .mockImplementation(() => undefined)
  render(<OAuthCallbackPage />)
  await act(async () => {
    await vi.advanceTimersByTimeAsync(2100)
  })
  vi.useRealTimers()
  assign.mockClear()
  vi.spyOn(Date, 'now').mockReturnValue(1_700_000_120_000)

  // Act: model macOS sleep without changing the mocked monotonic clock.
  fireEvent.click(screen.getByRole('button', { name: 'Open CoreLive' }))

  // Assert
  await screen.findByText(
    'A fresh secure return is ready. Select Open CoreLive.',
  )
  expect(fetchMock).toHaveBeenCalledTimes(2)
  expect(assign).not.toHaveBeenCalled()
})
