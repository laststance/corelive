import { afterEach, beforeEach, expect, test, vi } from 'vitest'

import {
  SIGNIN_LOAD_TIMEOUT_MS,
  SignInCoordinator,
  type LoginWindowObserver,
} from './SignInCoordinator'

/** Builds a coordinator over fake windows that expose the registered observer. */
function createFixture(
  options: { online?: boolean; windowOpen?: boolean } = {},
) {
  let observer: LoginWindowObserver | null = null
  let open = options.windowOpen ?? false
  const windows = {
    hasLoginWindow: () => open,
    showLoginWindow: vi.fn(() => {
      open = true
    }),
    closeLoginWindow: vi.fn(() => {
      if (!open) return
      open = false
      observer?.closed()
    }),
    setLoginWindowObserver: vi.fn((next: LoginWindowObserver | null) => {
      observer = next
    }),
  }
  const onChange = vi.fn()
  const log = vi.fn()
  const coordinator = new SignInCoordinator({
    windows,
    isOnline: () => options.online ?? true,
    onChange,
    log,
  })
  return {
    coordinator,
    windows,
    onChange,
    log,
    observer: (): LoginWindowObserver => observer!,
  }
}

beforeEach(() => {
  vi.useFakeTimers()
})
afterEach(() => {
  vi.useRealTimers()
})

test('does not open the login window while the Mac is offline', () => {
  // Arrange
  const fixture = createFixture({ online: false })

  // Act
  const result = fixture.coordinator.start()

  // Assert
  expect(result).toEqual({ status: 'offline' })
  expect(fixture.windows.showLoginWindow).not.toHaveBeenCalled()
  expect(fixture.coordinator.state).toBe('idle')
})

test('reports in-progress while the login window is open and idle again when Cancel closes it', () => {
  // Arrange
  const fixture = createFixture()
  fixture.coordinator.start()

  // Act
  fixture.coordinator.cancel()

  // Assert
  expect(fixture.windows.closeLoginWindow).toHaveBeenCalledOnce()
  expect(fixture.coordinator.state).toBe('idle')
})

test('returns to idle when the user closes the login window without signing in', () => {
  // Arrange
  const fixture = createFixture()
  fixture.coordinator.start()
  expect(fixture.coordinator.state).toBe('in-progress')

  // Act
  fixture.observer().closed()

  // Assert
  expect(fixture.coordinator.state).toBe('idle')
})

test('closes the window and reports unreachable when the login page fails to load', () => {
  // Arrange
  const fixture = createFixture()
  fixture.coordinator.start()

  // Act
  const handled = fixture.observer().loadFailed()

  // Assert
  expect(handled).toBe(true)
  expect(fixture.coordinator.state).toBe('unreachable')
  expect(fixture.windows.closeLoginWindow).toHaveBeenCalledOnce()
  expect(fixture.log).toHaveBeenCalledWith('SIGNIN_PAGE_UNREACHABLE')
})

test('reports unreachable when the login page has not finished loading after 20 seconds', () => {
  // Arrange
  const fixture = createFixture()
  fixture.coordinator.start()

  // Act
  vi.advanceTimersByTime(SIGNIN_LOAD_TIMEOUT_MS)

  // Assert
  expect(fixture.coordinator.state).toBe('unreachable')
  expect(fixture.windows.closeLoginWindow).toHaveBeenCalledOnce()
})

test('does not time out once the login page finished loading', () => {
  // Arrange
  const fixture = createFixture()
  fixture.coordinator.start()

  // Act
  fixture.observer().loaded()
  vi.advanceTimersByTime(SIGNIN_LOAD_TIMEOUT_MS * 2)

  // Assert
  expect(fixture.coordinator.state).toBe('in-progress')
})

test('Try again after unreachable opens the login window anew', () => {
  // Arrange
  const fixture = createFixture()
  fixture.coordinator.start()
  fixture.observer().loadFailed()

  // Act
  const result = fixture.coordinator.start()

  // Assert
  expect(result).toEqual({ status: 'opened' })
  expect(fixture.coordinator.state).toBe('in-progress')
  expect(fixture.windows.showLoginWindow).toHaveBeenCalledTimes(2)
})

test('ignores a load failure of a login window the user opened elsewhere', () => {
  // Arrange
  const fixture = createFixture()

  // Act
  const handled = fixture.observer().loadFailed()

  // Assert
  expect(handled).toBe(false)
  expect(fixture.coordinator.state).toBe('idle')
})
