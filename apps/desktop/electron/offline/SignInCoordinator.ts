import type {
  SignInProgress,
  SignInStartResult,
} from '@corelive/desktop-contract/offline-account'

import type { WindowManager } from '../WindowManager'

/** How long the login window may take to finish its first load before it counts as unreachable (DX7). */
export const SIGNIN_LOAD_TIMEOUT_MS = 20_000

/** What {@link SignInCoordinator} listens for on the login window (implemented by WindowManager). */
export interface LoginWindowObserver {
  /** The login page finished a genuine (non-error) load. */
  loaded: () => void
  /** The first load failed (network error or HTTP error page); true when the observer handled it. */
  loadFailed: () => boolean
  /** The login window closed, for any reason. */
  closed: () => void
}

/** The slice of WindowManager the coordinator drives. */
export type SignInWindows = Pick<
  WindowManager,
  | 'hasLoginWindow'
  | 'showLoginWindow'
  | 'closeLoginWindow'
  | 'setLoginWindowObserver'
>

/** Constructor dependencies of {@link SignInCoordinator}. */
export interface SignInCoordinatorOptions {
  windows: SignInWindows
  /** `net.isOnline()`; reports a network interface, not reachability (DX7). */
  isOnline: () => boolean
  /** Called after every state change so Settings re-reads its account status. */
  onChange: () => void
  /** Redacted log line: stable code only. */
  log?: (line: string) => void
  loadTimeoutMs?: number
}

/**
 * Owns the Settings-initiated sign-in attempt (DA6, DX7): the offline pre-check, the login
 * window's open/abandoned/cancelled life cycle and the `SIGNIN_PAGE_UNREACHABLE` outcome.
 *
 * Why it exists: the login window is a remote page, so the bundled Settings window can only
 * learn about it through main. Created once by {@link OfflineEditorIPC}; the Settings sign-in,
 * cancel and account-status handlers call it. It never touches credentials; the actual sign-in
 * still ends with `auth-set-user` from the login window.
 *
 * @example
 * const coordinator = new SignInCoordinator({ windows, isOnline: () => net.isOnline(), onChange })
 * const started = coordinator.start() // { status: 'opened' } or { status: 'offline' }
 */
export class SignInCoordinator {
  private progress: SignInProgress = 'idle'
  private timer: ReturnType<typeof setTimeout> | null = null

  constructor(private readonly options: SignInCoordinatorOptions) {
    options.windows.setLoginWindowObserver({
      loaded: () => this.clearTimer(),
      loadFailed: () => this.handleLoadFailed(),
      closed: () => this.handleClosed(),
    })
  }

  /** Current progress for the Account section. */
  get state(): SignInProgress {
    return this.progress
  }

  /**
   * Starts a sign-in: offline answers without opening the window; online opens it and arms the
   * 20 s load timer when the window is new.
   * @returns `offline` (no window opened) or `opened`.
   * @example const result = coordinator.start()
   */
  start(): SignInStartResult {
    if (!this.options.isOnline()) return { status: 'offline' }
    const { windows } = this.options
    const fresh = !windows.hasLoginWindow()
    this.clearTimer()
    this.progress = 'in-progress'
    windows.showLoginWindow()
    if (fresh) {
      this.timer = setTimeout(
        () => this.fail(),
        this.options.loadTimeoutMs ?? SIGNIN_LOAD_TIMEOUT_MS,
      )
      this.timer.unref?.()
    }
    this.options.onChange()
    return { status: 'opened' }
  }

  /**
   * Cancels an open sign-in by closing the login window; the close handler returns to idle.
   * @example coordinator.cancel()
   */
  cancel(): void {
    if (this.progress !== 'in-progress') return
    this.clearTimer()
    this.options.windows.closeLoginWindow()
  }

  /** Handles a failed first load of the login page. */
  private handleLoadFailed(): boolean {
    if (this.progress !== 'in-progress') return false
    this.fail()
    return true
  }

  /** Closes the window and records SIGNIN_PAGE_UNREACHABLE. */
  private fail(): void {
    if (this.progress !== 'in-progress') return
    this.clearTimer()
    this.progress = 'unreachable'
    this.options.log?.('SIGNIN_PAGE_UNREACHABLE')
    this.options.windows.closeLoginWindow()
    this.options.onChange()
  }

  /** An abandoned or finished login window returns Account to its previous state (DA6). */
  private handleClosed(): void {
    this.clearTimer()
    if (this.progress === 'in-progress') {
      this.progress = 'idle'
      this.options.onChange()
    }
  }

  private clearTimer(): void {
    if (this.timer) clearTimeout(this.timer)
    this.timer = null
  }
}
