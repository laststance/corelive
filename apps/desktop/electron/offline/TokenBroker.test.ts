import { EventEmitter } from 'node:events'

import type { OfflineAuthRequest } from '@corelive/desktop-contract/offline-auth'
import type { BrowserWindow, IpcMainInvokeEvent } from 'electron'
import { afterEach, describe, expect, test, vi } from 'vitest'

import { TokenBroker } from './TokenBroker'

vi.mock('electron', () => ({ BrowserWindow: vi.fn() }))

type Handler = (event: IpcMainInvokeEvent, value?: unknown) => unknown

/** Emulates only the broker's Electron boundary without launching an application.
 * @example const fixture = brokerFixture()
 */
function brokerFixture() {
  const handlers = new Map<string, Handler>()
  const mainFrame = {
    url: 'https://corelive.app/desktop-auth',
    origin: 'https://corelive.app',
  }
  const contents = Object.assign(new EventEmitter(), {
    mainFrame,
    ipc: {
      handle: (name: string, handler: Handler): void => {
        handlers.set(name, handler)
      },
    },
    send: vi.fn(),
    isDestroyed: () => false,
    isLoadingMainFrame: () => true,
    setWindowOpenHandler: vi.fn(),
  })
  let destroyed = false
  const window = Object.assign(new EventEmitter(), {
    webContents: contents,
    isDestroyed: () => destroyed,
    destroy: vi.fn(() => {
      destroyed = true
    }),
    loadURL: vi.fn(async () => undefined),
  })
  const createWindow = vi.fn(() => window as unknown as BrowserWindow)
  const broker = new TokenBroker({
    origin: 'https://corelive.app',
    preload: '/test/preload.cjs',
    createWindow,
    timeoutMs: 1000,
  })
  const event = {
    sender: contents,
    senderFrame: mainFrame,
  } as unknown as IpcMainInvokeEvent
  const request = (): OfflineAuthRequest =>
    handlers.get('offline-auth-ready')!(event) as OfflineAuthRequest
  const reply = (value: unknown, sender = event): unknown =>
    handlers.get('offline-auth-result')!(sender, value)
  return {
    broker,
    window,
    contents,
    mainFrame,
    event,
    handlers,
    request,
    reply,
    createWindow,
  }
}

afterEach(() => vi.useRealTimers())

describe('Clerk session token broker boundary', () => {
  test('uses the existing session in a hidden sandboxed window with a credential-only preload', async () => {
    // Arrange
    const fixture = brokerFixture()

    // Act
    const pending = fixture.broker.acquire('account-a', 1)
    const challenge = fixture.request()
    const accepted = fixture.reply({
      ...challenge,
      status: 'ready',
      accountId: 'account-a',
      token: 'opaque-test-token',
    })

    // Assert
    expect(accepted).toBe(true)
    expect(await pending).toEqual({
      status: 'ready',
      credential: {
        ...challenge,
        status: 'ready',
        accountId: 'account-a',
        token: 'opaque-test-token',
      },
    })
    expect(fixture.createWindow).toHaveBeenCalledWith({
      show: false,
      webPreferences: {
        preload: '/test/preload.cjs',
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: true,
        webSecurity: true,
        backgroundThrottling: false,
        additionalArguments: ['--corelive-app-origin=https://corelive.app'],
      },
    })
    expect(fixture.window.loadURL).toHaveBeenCalledWith(
      'https://corelive.app/desktop-auth',
    )
    expect(fixture.request()).toBeNull()
    fixture.broker.reset()
  })

  test.each([
    'other-window',
    'child-frame',
    'foreign-origin',
    'other-path',
    'opaque-origin',
  ] as const)('rejects credentials from %s', async (kind) => {
    // Arrange
    const fixture = brokerFixture()
    const pending = fixture.broker.acquire('account-a', 1)
    const challenge = fixture.request()
    let event = fixture.event
    if (kind === 'other-window')
      event = { ...fixture.event, sender: {} } as IpcMainInvokeEvent
    if (kind === 'child-frame')
      event = {
        ...fixture.event,
        senderFrame: { ...fixture.mainFrame },
      } as IpcMainInvokeEvent
    if (kind === 'foreign-origin')
      fixture.mainFrame.origin = 'https://evil.example'
    if (kind === 'opaque-origin') fixture.mainFrame.origin = 'null'
    if (kind === 'other-path')
      fixture.mainFrame.url = 'https://corelive.app/settings'

    // Act
    const accepted = fixture.reply(
      {
        ...challenge,
        status: 'ready',
        accountId: 'account-a',
        token: 'opaque-test-token',
      },
      event,
    )
    fixture.broker.reset()

    // Assert
    expect(accepted).toBe(false)
    expect(await pending).toEqual({ status: 'unavailable' })
  })

  test('account change invalidates an in-flight reply before any token is delivered', async () => {
    // Arrange
    const fixture = brokerFixture()
    const previous = fixture.broker.acquire('account-a', 1)
    const oldChallenge = fixture.request()
    const current = fixture.broker.acquire('account-b', 2)
    const newChallenge = fixture.request()

    // Act
    const stale = fixture.reply({
      ...oldChallenge,
      status: 'ready',
      accountId: 'account-a',
      token: 'old-test-token',
    })
    fixture.reply({
      ...newChallenge,
      status: 'ready',
      accountId: 'account-b',
      token: 'new-test-token',
    })

    // Assert
    expect(stale).toBe(false)
    expect(await previous).toEqual({ status: 'unavailable' })
    expect(await current).toMatchObject({
      status: 'ready',
      credential: { accountId: 'account-b', token: 'new-test-token' },
    })
    fixture.broker.reset()
  })

  test('wrong account requires sign-in and an unreachable identity service only pauses synchronization', async () => {
    // Arrange
    const fixture = brokerFixture()
    const first = fixture.broker.acquire('account-a', 1)

    // Act
    fixture.reply({
      ...fixture.request(),
      status: 'ready',
      accountId: 'account-b',
      token: 'wrong-account-token',
    })
    const second = fixture.broker.acquire('account-a', 1)
    fixture.reply({ ...fixture.request(), status: 'unavailable' })

    // Assert
    expect(await first).toEqual({ status: 'signed-out' })
    expect(await second).toEqual({ status: 'unavailable' })
    fixture.broker.reset()
  })

  test('a hung broker times out and destroys only its own hidden window', async () => {
    // Arrange
    vi.useFakeTimers()
    const fixture = brokerFixture()
    const pending = fixture.broker.acquire('account-a', 1)

    // Act
    await vi.advanceTimersByTimeAsync(1000)

    // Assert
    expect(await pending).toEqual({ status: 'unavailable' })
    expect(fixture.window.destroy).toHaveBeenCalledTimes(1)
  })

  test('navigation can refresh through Clerk but cannot send the bridge to arbitrary pages', async () => {
    // Arrange
    const fixture = brokerFixture()
    const pending = fixture.broker.acquire('account-a', 1)
    const handshake = { preventDefault: vi.fn() }
    const other = { preventDefault: vi.fn() }

    // Act
    fixture.contents.emit(
      'will-redirect',
      handshake,
      'https://clerk.corelive.app/v1/client/handshake?redirect_url=https%3A%2F%2Fcorelive.app%2Fdesktop-auth',
    )
    fixture.contents.emit(
      'will-navigate',
      other,
      'https://corelive.app/settings',
    )

    // Assert
    expect(handshake.preventDefault).not.toHaveBeenCalled()
    expect(other.preventDefault).toHaveBeenCalledTimes(1)
    expect(await pending).toEqual({ status: 'unavailable' })
    fixture.broker.reset()
  })

  test('a malformed or oversized token cannot satisfy a challenge', async () => {
    // Arrange
    const fixture = brokerFixture()
    const pending = fixture.broker.acquire(null, 0)

    // Act
    const accepted = fixture.reply({
      ...fixture.request(),
      status: 'ready',
      accountId: 'account-a',
      token: 'x'.repeat(65537),
    })
    fixture.broker.reset()

    // Assert
    expect(accepted).toBe(false)
    expect(await pending).toEqual({ status: 'unavailable' })
  })
})
