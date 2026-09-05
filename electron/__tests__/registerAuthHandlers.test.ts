import { ipcMain, type IpcMainInvokeEvent } from 'electron'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { registerAuthHandlers } from '../ipc/registerAuthHandlers'
import type { AuthUserPayload } from '../types/ipc'
import type { WindowManager } from '../WindowManager'

/**
 * The auth IPC handlers are the ONLY bridge between the login window's Clerk
 * session and the native login → LiveEditor handoff. These tests capture the
 * handlers `registerAuthHandlers` registers on the mocked `ipcMain` and call
 * them directly, so the handoff wiring is unit-tested without booting main.ts.
 */

vi.mock('electron', () => ({
  ipcMain: { handle: vi.fn() },
}))

vi.mock('../logger', () => ({
  log: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}))

type IpcHandler = (event: IpcMainInvokeEvent, ...args: unknown[]) => unknown

/** A valid Clerk user payload as the login window's auth provider sends it. */
const USER: AuthUserPayload = {
  clerkId: 'user_123',
  emailAddresses: ['qa@example.com'],
  firstName: 'QA',
}

/** The invoking webContents, as `ipcMain.handle` hands it to the handler. */
const SENDER = { id: 42 }
const EVENT = { sender: SENDER } as unknown as IpcMainInvokeEvent

/**
 * Returns the handler registered for an IPC channel.
 * @param channel - IPC channel name.
 * @returns The registered handler.
 * @example
 * await getHandler('auth-set-user')(EVENT, USER)
 */
function getHandler(channel: string): IpcHandler {
  const registration = vi
    .mocked(ipcMain.handle)
    .mock.calls.find(([registeredChannel]) => registeredChannel === channel)
  if (!registration) {
    throw new Error(`Expected an IPC handler for ${channel}`)
  }
  return registration[1] as IpcHandler
}

/**
 * Builds the dependency seam with a controllable WindowManager stub.
 * @param windowManager - The stub `getWindowManager()` returns (null = not built yet).
 * @returns The deps plus the spies to assert on.
 */
function createDeps(windowManager: WindowManager | null) {
  const setActiveUser = vi.fn(async (user: AuthUserPayload) => user)
  const clearActiveUser = vi.fn()
  return {
    setActiveUser,
    clearActiveUser,
    deps: {
      getActiveUser: vi.fn(() => null),
      setActiveUser,
      clearActiveUser,
      getWindowManager: vi.fn(() => windowManager),
    },
  }
}

/** A WindowManager stub exposing only the handoff surface the handlers touch. */
function createWindowManagerStub() {
  return {
    completeLogin: vi.fn(),
    clearLoginHandoff: vi.fn(),
  }
}

describe('registerAuthHandlers', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('hands the login window off to LiveEditor after auth-set-user stores the user', async () => {
    // Arrange
    const windowManager = createWindowManagerStub()
    const { deps, setActiveUser } = createDeps(
      windowManager as unknown as WindowManager,
    )
    registerAuthHandlers(deps)

    // Act
    const result = await getHandler('auth-set-user')(EVENT, USER)

    // Assert: stored first, then the sender's window is handed off.
    expect(result).toEqual({
      clerkId: 'user_123',
      emailAddresses: ['qa@example.com'],
      firstName: 'QA',
    })
    expect(setActiveUser).toHaveBeenCalledWith(USER)
    expect(windowManager.completeLogin).toHaveBeenCalledWith(SENDER)
  })

  it('keeps the login window open until the user is actually stored', async () => {
    // Arrange: the store stays pending until this spec releases it.
    const windowManager = createWindowManagerStub()
    const { deps, setActiveUser } = createDeps(
      windowManager as unknown as WindowManager,
    )
    let releaseStore!: () => void
    setActiveUser.mockImplementationOnce(
      async () =>
        new Promise<AuthUserPayload>((resolve) => {
          releaseStore = () => resolve(USER)
        }),
    )
    registerAuthHandlers(deps)

    // Act: fire the handler and look at the window before the store settles.
    const pendingHandoff = getHandler('auth-set-user')(EVENT, USER)
    await Promise.resolve()

    // Assert: no handoff yet — closing the login window before the user is
    // stored would bounce LiveEditor straight back to /login.
    expect(windowManager.completeLogin).not.toHaveBeenCalled()
    releaseStore()
    await expect(pendingHandoff).resolves.toEqual({
      clerkId: 'user_123',
      emailAddresses: ['qa@example.com'],
      firstName: 'QA',
    })
    expect(windowManager.completeLogin).toHaveBeenCalledWith(SENDER)
  })

  it('does not hand off and propagates the error when the user payload is rejected', async () => {
    // Arrange
    const windowManager = createWindowManagerStub()
    const { deps, setActiveUser } = createDeps(
      windowManager as unknown as WindowManager,
    )
    setActiveUser.mockRejectedValueOnce(
      new Error('Invalid user payload: clerkId is required'),
    )
    registerAuthHandlers(deps)

    // Act / Assert
    await expect(getHandler('auth-set-user')(EVENT, USER)).rejects.toThrow(
      'Invalid user payload: clerkId is required',
    )
    expect(windowManager.completeLogin).not.toHaveBeenCalled()
  })

  it('clears the stored user and the pending handoff on auth-logout', async () => {
    // Arrange
    const windowManager = createWindowManagerStub()
    const { deps, clearActiveUser } = createDeps(
      windowManager as unknown as WindowManager,
    )
    registerAuthHandlers(deps)

    // Act
    const result = await getHandler('auth-logout')(EVENT)

    // Assert
    expect(result).toBe(true)
    expect(clearActiveUser).toHaveBeenCalledTimes(1)
    expect(windowManager.clearLoginHandoff).toHaveBeenCalledTimes(1)
  })

  it('still stores the user when no WindowManager exists yet', async () => {
    // Arrange: auth can arrive before deferredInit built the WindowManager.
    const { deps, setActiveUser } = createDeps(null)
    registerAuthHandlers(deps)

    // Act / Assert: no throw, user stored, logout also safe.
    await expect(getHandler('auth-set-user')(EVENT, USER)).resolves.toEqual(
      USER,
    )
    expect(setActiveUser).toHaveBeenCalledWith(USER)
    await expect(getHandler('auth-logout')(EVENT)).resolves.toBe(true)
  })
})
