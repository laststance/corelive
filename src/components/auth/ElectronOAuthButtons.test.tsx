/**
 * @fileoverview ElectronOAuthButtons — the Floating front door's native sign-in CTA.
 *
 * The sentinel: this single amber button is the ONLY way a signed-out user
 * starts the system-browser OAuth flow from the Floating window (the Electron
 * main window is being retired). If the click ever stops calling
 * `window.electronAPI.oauth.start('google')`, or stops surfacing a start
 * failure, the desktop front door silently goes dead — a signed-out user is
 * stranded with a button that does nothing. These pin the click → start →
 * loading/error contract.
 *
 * Triggered when: `pnpm test` (Vitest, happy-dom).
 *
 * @example
 *   pnpm test -- ElectronOAuthButtons
 */
import { act, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { ElectronOAuthButtons } from './ElectronOAuthButtons'

// useUser gates the "reset on signed-in" derivation; a signed-out user is the
// state under test (the card only renders this while signed out).
vi.mock('@clerk/nextjs', () => ({
  useUser: () => ({ user: null }),
}))

// Force the Electron branch so the success/error listeners register exactly as
// they do in the packaged app (the effect early-returns outside Electron).
vi.mock('../../../electron/utils/electron-client', () => ({
  isElectronEnvironment: () => true,
}))

type OAuthStartResult = { success: boolean; error?: string }

/**
 * Plants a Floating-preload-shaped `window.electronAPI.oauth` whose `start`
 * resolves to the given result, returning the spy so the test can assert the
 * provider it was called with.
 */
function plantOAuthBridge(result: OAuthStartResult) {
  const start = vi.fn(async () => result)
  Object.defineProperty(window, 'electronAPI', {
    configurable: true,
    writable: true,
    value: {
      oauth: {
        start,
        onSuccess: vi.fn(() => () => {}),
        onError: vi.fn(() => () => {}),
      },
    } as unknown as Window['electronAPI'],
  })
  return start
}

describe('ElectronOAuthButtons', () => {
  afterEach(() => {
    Reflect.deleteProperty(window, 'electronAPI')
    vi.clearAllMocks()
  })

  it('launches the Google system-browser sign-in when the front-door button is pressed', async () => {
    // Arrange: the Floating preload exposes a working oauth bridge.
    const start = plantOAuthBridge({ success: true })
    render(<ElectronOAuthButtons />)

    // Act: the signed-out user presses the only sign-in affordance.
    fireEvent.click(
      screen.getByRole('button', { name: /sign in with google/i }),
    )

    // Assert: it starts the native Google flow and reflects the in-flight state
    // (so the user sees the browser is opening).
    expect(start).toHaveBeenCalledWith('google')
    const openingButton = await screen.findByRole('button', {
      name: /opening browser/i,
    })
    expect(openingButton).toBeDisabled()

    // And it can't be double-fired: a second press on the now-disabled button
    // starts no second flow (one browser tab, not two).
    fireEvent.click(openingButton)
    expect(start).toHaveBeenCalledTimes(1)
  })

  it('surfaces a calm error when the native flow fails to start', async () => {
    // Arrange: the main process reports it could not start the flow, with a
    // specific reason. Using a distinct message (not the generic fallback) pins
    // that we surface the SERVER's reason verbatim — proving this is the
    // `result.success === false` branch, not the catch-path's hardcoded string.
    plantOAuthBridge({
      success: false,
      error: 'No supported browser found',
    })
    render(<ElectronOAuthButtons />)

    // Act
    fireEvent.click(
      screen.getByRole('button', { name: /sign in with google/i }),
    )

    // Assert: the failure is announced (role=alert) rather than swallowed, and
    // the button returns to its idle, re-pressable state.
    const errorMessage = await screen.findByText(/no supported browser found/i)
    expect(errorMessage).toHaveAttribute('role', 'alert')
    expect(
      screen.getByRole('button', { name: /sign in with google/i }),
    ).toBeEnabled()
  })

  it('re-arms the sign-in button after an abandoned browser flow times out', async () => {
    // Arrange: fake timers so we can fast-forward the abandonment backstop. The
    // flow STARTS successfully (the system browser opens), but the user then
    // ABANDONS it — closes the tab / picks no account — so neither onSuccess nor
    // onError ever fires (the bridge's listeners are registered but never
    // invoked). Without the backstop the CTA would sit dead at "Opening browser…"
    // until the window is reopened, which post-main-window-retirement (T18) is
    // the only other escape.
    vi.useFakeTimers()
    try {
      const start = plantOAuthBridge({ success: true })
      render(<ElectronOAuthButtons />)

      // Act: press the only sign-in affordance; it enters the in-flight state.
      fireEvent.click(
        screen.getByRole('button', { name: /sign in with google/i }),
      )
      // Let the awaited start() promise settle (its success path dispatches
      // nothing further, leaving the button in its loading state).
      await act(async () => {
        await Promise.resolve()
      })
      expect(
        screen.getByRole('button', { name: /opening browser/i }),
      ).toBeDisabled()

      // Act: the user walks away and the 25s backstop window elapses with no
      // event from the main process.
      act(() => {
        vi.advanceTimersByTime(25_000)
      })

      // Assert: the CTA recovers to its idle, re-pressable state on its own —
      // no window reopen required.
      expect(
        screen.getByRole('button', { name: /sign in with google/i }),
      ).toBeEnabled()
      // And the recovery is local UI only — it did not silently launch a second
      // browser flow.
      expect(start).toHaveBeenCalledTimes(1)
    } finally {
      vi.useRealTimers()
    }
  })
})
