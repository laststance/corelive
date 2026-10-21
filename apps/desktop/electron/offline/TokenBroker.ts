import { randomUUID } from 'node:crypto'

import type {
  OfflineAuthRequest,
  OfflineAuthResult,
} from '@corelive/desktop-contract/offline-auth'
import { BrowserWindow, type IpcMainInvokeEvent } from 'electron'
import { z } from 'zod'

import { typedSend } from '../ipc/typedSend'
import {
  isTrustedAppNavigation,
  isTrustedClerkHandshake,
} from '../utils/isTrustedAppNavigation'
import {
  isTrustedTokenBrokerDocument,
  TOKEN_BROKER_PATH,
} from '../utils/isTrustedTokenBrokerDocument'
const READY_CHANNEL = 'offline-auth-ready'
const RESULT_CHANNEL = 'offline-auth-result'
const REQUEST_CHANNEL = 'offline-auth-request'

const requestSchema = z.object({
  requestId: z.uuid(),
  generation: z.number().int().nonnegative(),
  expectedAccountId: z.string().min(1).nullable(),
})
const resultSchema = z.discriminatedUnion('status', [
  requestSchema.extend({
    status: z.literal('ready'),
    accountId: z.string().min(1),
    token: z.string().min(1).max(65536),
  }),
  requestSchema.extend({ status: z.enum(['signed-out', 'unavailable']) }),
])

type Credential = Extract<OfflineAuthResult, { status: 'ready' }>
type BrokerOutcome =
  | { status: 'ready'; credential: Credential }
  | { status: 'signed-out' | 'unavailable' }
type Pending = {
  request: OfflineAuthRequest
  resolve: (outcome: BrokerOutcome) => void
  promise: Promise<BrokerOutcome>
  timeout: ReturnType<typeof setTimeout>
}
type BrokerOptions = {
  origin: string
  preload: string
  timeoutMs?: number
  createWindow?: (
    options: Electron.BrowserWindowConstructorOptions,
  ) => BrowserWindow
}

/**
 * Obtains short-lived credentials from the existing remote Clerk session.
 * The offline sync controller calls {@link acquire}; prepared editing never waits
 * for this hidden document. One exact WebContents/main frame can reply to a current
 * challenge. Account changes destroy the broker and invalidate all old callbacks.
 * Credentials are returned in memory only and never logged or persisted here.
 *
 * @example
 * const broker = new TokenBroker({ origin, preload })
 * const outcome = await broker.acquire(accountId, accountGeneration)
 */
export class TokenBroker {
  private window: BrowserWindow | null = null
  private pending: Pending | null = null

  constructor(private readonly options: BrokerOptions) {}

  /**
   * Starts/coalesces a current account challenge with a bounded response deadline.
   * Null account is allowed only for discovery; the API must verify canonical ownership
   * before the controller prepares/unlocks any workspace.
   * @example await broker.acquire('user_123', 4)
   */
  async acquire(
    expectedAccountId: string | null,
    generation: number,
  ): Promise<BrokerOutcome> {
    if (
      this.pending?.request.expectedAccountId === expectedAccountId &&
      this.pending.request.generation === generation
    ) {
      return this.pending.promise
    }
    this.finish({ status: 'unavailable' })
    const request: OfflineAuthRequest = {
      requestId: randomUUID(),
      generation,
      expectedAccountId,
    }
    let settle: Pending['resolve'] = () => undefined
    const promise = new Promise<BrokerOutcome>((resolve) => {
      settle = resolve
    })
    const timeout = setTimeout(
      () => this.reset(),
      this.options.timeoutMs ?? 15000,
    )
    timeout.unref?.()
    this.pending = { request, promise, resolve: settle, timeout }
    try {
      const window = this.ensureWindow()
      if (!window.webContents.isLoadingMainFrame()) {
        typedSend(window.webContents, REQUEST_CHANNEL, request)
      }
    } catch {
      this.reset()
    }
    return promise
  }

  /**
   * Cancels pending delivery on logout/account change, timeout or application cleanup.
   * The next request constructs a new restricted document with fresh IPC handlers.
   * @example broker.reset()
   */
  reset(): void {
    this.finish({ status: 'unavailable' })
    const previous = this.window
    this.window = null
    if (previous && !previous.isDestroyed()) previous.destroy()
  }

  /** Registers capabilities on this WebContents only; other windows cannot call them.
   * @example const window = this.ensureWindow()
   */
  private ensureWindow(): BrowserWindow {
    if (this.window && !this.window.isDestroyed()) return this.window
    const createWindow =
      this.options.createWindow ?? ((options) => new BrowserWindow(options))
    const window = createWindow({
      show: false,
      webPreferences: {
        preload: this.options.preload,
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: true,
        webSecurity: true,
        backgroundThrottling: false,
        additionalArguments: [`--corelive-app-origin=${this.options.origin}`],
      },
    })
    this.window = window
    window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }))
    const preventNavigation = (event: Electron.Event, url: string): void => {
      // Clerk's bounded handshake can refresh the session; it receives no bridge.
      if (
        !this.isBrokerDocument(url) &&
        !isTrustedClerkHandshake(url, this.options.origin)
      ) {
        event.preventDefault()
        this.finish({ status: 'unavailable' })
      }
    }
    window.webContents.on('will-navigate', preventNavigation)
    window.webContents.on('will-redirect', preventNavigation)
    window.webContents.ipc.handle(READY_CHANNEL, (event) =>
      this.validSender(event, window) ? (this.pending?.request ?? null) : null,
    )
    window.webContents.ipc.handle(RESULT_CHANNEL, (event, raw: unknown) => {
      if (!this.validSender(event, window)) return false
      const parsed = resultSchema.safeParse(raw)
      if (!parsed.success || !this.pending) return false
      const result = parsed.data
      const expected = this.pending.request
      if (
        result.requestId !== expected.requestId ||
        result.generation !== expected.generation ||
        result.expectedAccountId !== expected.expectedAccountId
      )
        return false
      if (result.status === 'ready') {
        // A page racing with account switch must not supply another account's token.
        if (
          expected.expectedAccountId !== null &&
          result.accountId !== expected.expectedAccountId
        ) {
          this.finish({ status: 'signed-out' })
          return false
        }
        this.finish({ status: 'ready', credential: result })
      } else {
        this.finish({ status: result.status })
      }
      return true
    })
    window.webContents.on('render-process-gone', () => this.reset())
    window.on('closed', () => {
      if (this.window !== window) return
      this.window = null
      this.finish({ status: 'unavailable' })
    })
    void window
      .loadURL(new URL(TOKEN_BROKER_PATH, this.options.origin).href)
      .catch(() => {
        if (this.window === window) this.reset()
      })
    return window
  }

  /** Checks document URL and origin; path alone cannot establish IPC authority.
   * @example this.isBrokerDocument('https://corelive.app/desktop-auth')
   */
  private isBrokerDocument(url: string): boolean {
    return isTrustedTokenBrokerDocument(url, this.options.origin)
  }

  /** Requires both the registered window and its main frame, rejecting stale/child frames.
   * @example if (!this.validSender(event, window)) return false
   */
  private validSender(
    event: IpcMainInvokeEvent,
    window: BrowserWindow,
  ): boolean {
    const frame = event.senderFrame
    return (
      this.window === window &&
      !window.isDestroyed() &&
      event.sender === window.webContents &&
      frame !== null &&
      frame === window.webContents.mainFrame &&
      isTrustedAppNavigation(frame.origin, this.options.origin) &&
      this.isBrokerDocument(frame.url)
    )
  }

  /** Releases exactly one challenge; no credential survives in the broker instance.
   * @example this.finish({ status: 'unavailable' })
   */
  private finish(outcome: BrokerOutcome): void {
    const current = this.pending
    this.pending = null
    if (!current) return
    clearTimeout(current.timeout)
    current.resolve(outcome)
  }
}
