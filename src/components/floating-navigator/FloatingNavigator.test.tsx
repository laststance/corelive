/**
 * @fileoverview FloatingNavigator pin-button mount-init tests.
 *
 * The sentinel: the always-on-top pin button must seed from the window's REAL
 * state on mount, not from its hardcoded `useState(true)`. Because the pin
 * setting now survives relaunch, a user who turned it off must see the button
 * read "off" — otherwise the button lies (shows pinned over an unpinned window).
 * The unpinned case below fails if that mount-init read regresses.
 *
 * The fourth test guards §6d cross-window sync: when ANOTHER window (the Settings
 * "Keep on top" toggle) changes the shared keep-on-top setting, the main
 * process broadcasts it and this window's own pin button must live-update —
 * otherwise the button lies until the next relaunch.
 *
 * Triggered when: `pnpm test` (Vitest, happy-dom).
 *
 * @example
 *   pnpm test -- FloatingNavigator
 */
import { configureStore } from '@reduxjs/toolkit'
import { act, fireEvent, render, screen } from '@testing-library/react'
import type { ReactElement } from 'react'
import { Provider } from 'react-redux'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import userSettingsReducer, {
  initialState,
} from '@/lib/redux/slices/settingsSlice'

import { FloatingNavigator } from './FloatingNavigator'

/**
 * Wraps the FloatingNavigator in a real settings store — required once a
 * completed row renders, because its checkbox pulls in useCompletionFeedback →
 * useAppSelector (the empty-todos tests above never mount a row, so they don't).
 */
function renderFloatingWithStore(ui: ReactElement) {
  const store = configureStore({
    reducer: { settings: userSettingsReducer },
    preloadedState: { settings: { ...initialState } },
  })
  return render(<Provider store={store}>{ui}</Provider>)
}

// Force the floating-navigator environment so the window-controls toolbar (and
// its pin button) renders and the mount-init effect runs.
vi.mock('@/electron/utils/electron-client', () => ({
  isFloatingNavigatorEnvironment: () => true,
}))

const isAlwaysOnTopMock = vi.fn()

/**
 * Installs a `window.floatingNavigatorAPI` whose `window.isAlwaysOnTop` is the
 * given spy; the other methods are present (only invoked on user interaction).
 *
 * @param isAlwaysOnTop - The spy the mount-init effect awaits.
 */
function installFloatingNavigatorAPI(
  isAlwaysOnTop: () => Promise<boolean>,
): void {
  Object.defineProperty(window, 'floatingNavigatorAPI', {
    configurable: true,
    writable: true,
    value: {
      window: {
        isAlwaysOnTop,
        toggleAlwaysOnTop: vi.fn(),
        minimize: vi.fn(),
        close: vi.fn(),
        focusMainWindow: vi.fn(),
      },
      brainDump: { toggle: vi.fn() },
      openCompletedImport: vi.fn(),
    },
  })
}

// Minimal required task callbacks — no todos so no rows/dnd/lazy-row icons render.
const noopTaskProps = {
  todos: [],
  onTaskToggle: vi.fn(),
  onTaskCreate: vi.fn(),
  onTaskEdit: vi.fn(),
  onTaskDelete: vi.fn(),
}

describe('FloatingNavigator pin button', () => {
  beforeEach(() => {
    isAlwaysOnTopMock.mockReset()
  })

  it('shows the pin button OFF when the window launched unpinned', async () => {
    // Arrange: the window's real state is NOT pinned — the user turned pinning
    // off in a prior session and the setting survived relaunch.
    isAlwaysOnTopMock.mockResolvedValue(false)
    installFloatingNavigatorAPI(isAlwaysOnTopMock)

    // Act
    render(<FloatingNavigator {...noopTaskProps} />)

    // Assert: the button reflects the REAL unpinned state (aria-pressed=false),
    // not the `useState(true)` default. Drop the mount-init read and this button
    // would lie — labelled "Disable always on top" over an unpinned window.
    const pinButton = await screen.findByRole('button', {
      name: 'Enable always on top',
    })
    expect(pinButton).toHaveAttribute('aria-pressed', 'false')
    expect(isAlwaysOnTopMock).toHaveBeenCalledTimes(1)
  })

  it('shows the pin button ON when the window launched pinned', async () => {
    // Arrange: the window is pinned (the default-on behavior preserved).
    isAlwaysOnTopMock.mockResolvedValue(true)
    installFloatingNavigatorAPI(isAlwaysOnTopMock)

    // Act
    render(<FloatingNavigator {...noopTaskProps} />)

    // Assert: the mount-init still runs (it read the state) and the button reads
    // pressed, offering to disable.
    const pinButton = await screen.findByRole('button', {
      name: 'Disable always on top',
    })
    expect(pinButton).toHaveAttribute('aria-pressed', 'true')
    expect(isAlwaysOnTopMock).toHaveBeenCalledTimes(1)
  })

  it('does not crash when the preload predates the pin-state method', async () => {
    // Arrange: preload skew — the floatingNavigatorAPI namespace is present (an
    // installed app) but its `window` bridge predates `isAlwaysOnTop` (this
    // setting added it). isFloatingNavigatorEnvironment() only checks the
    // namespace, so the mount-init effect must method-guard before calling it.
    Object.defineProperty(window, 'floatingNavigatorAPI', {
      configurable: true,
      writable: true,
      value: {
        window: {
          // isAlwaysOnTop intentionally absent — the older preload lacks it.
          toggleAlwaysOnTop: vi.fn(),
          minimize: vi.fn(),
          close: vi.fn(),
          focusMainWindow: vi.fn(),
        },
        brainDump: { toggle: vi.fn() },
      },
    })

    // Act: mounting must NOT throw a TypeError from invoking undefined() in the
    // mount-init effect (which would bubble to the error boundary and blank the
    // floating window).
    render(<FloatingNavigator {...noopTaskProps} />)

    // Assert: the pin button still renders, falling back to the default pinned
    // state instead of crashing.
    const pinButton = await screen.findByRole('button', {
      name: 'Disable always on top',
    })
    expect(pinButton).toHaveAttribute('aria-pressed', 'true')
  })

  it('updates the pin button when another window changes the keep-on-top setting', async () => {
    // Arrange: the window mounts pinned (its real state reads on), so the button
    // starts offering to disable.
    isAlwaysOnTopMock.mockResolvedValue(true)
    installFloatingNavigatorAPI(isAlwaysOnTopMock)
    render(<FloatingNavigator {...noopTaskProps} />)
    await screen.findByRole('button', { name: 'Disable always on top' })

    // Act: the Settings "Keep on top" toggle (a DIFFERENT window) turns pinning
    // OFF. The main process broadcasts the new state to this window, which the
    // preload forwards as this DOM CustomEvent (mirroring menu actions).
    act(() => {
      window.dispatchEvent(
        new CustomEvent('floating-window-always-on-top-changed', {
          detail: { alwaysOnTop: false },
        }),
      )
    })

    // Assert: the pin button reflects the cross-window change live. Without the
    // §6d subscription it would stay "Disable always on top" — pinned over an
    // unpinned window — until the next relaunch.
    const pinButton = await screen.findByRole('button', {
      name: 'Enable always on top',
    })
    expect(pinButton).toHaveAttribute('aria-pressed', 'false')
  })
})

describe('FloatingNavigator bulk paste (Issue #110 AC#2)', () => {
  /**
   * Fires a paste carrying `text` into the floating task input. Mirrors the web
   * E2E's synthetic ClipboardEvent but stubs `clipboardData.getData` directly, so
   * the assertion never rides on happy-dom's DataTransfer fidelity.
   *
   * @param input - The task input node (paste event target).
   * @param text - The clipboard payload the handler reads as `text/plain`.
   */
  function pasteTextInto(input: HTMLElement, text: string): void {
    fireEvent.paste(input, { clipboardData: { getData: () => text } })
  }

  it('opens the bulk import dialog when a multi-line list is pasted into the empty task input', () => {
    // Arrange: a floating window with the bulk-paste callback wired. This is the
    // genuinely new AC#2 path — a web E2E can't reach it because the floating route
    // renders a desktop-only fallback in a plain browser (no window.floatingNavigatorAPI).
    const onBulkPaste = vi.fn()
    installFloatingNavigatorAPI(vi.fn().mockResolvedValue(true))
    render(<FloatingNavigator {...noopTaskProps} onBulkPaste={onBulkPaste} />)
    const input = screen.getByRole('textbox', { name: 'New task title' })
    input.focus()

    // Act: paste three lines into the empty (therefore fully-selected) input.
    pasteTextInto(input, 'Buy milk\nWalk the dog\nWrite the report')

    // Assert: the paste is routed to the import dialog verbatim, not typed inline.
    expect(onBulkPaste).toHaveBeenCalledTimes(1)
    expect(onBulkPaste).toHaveBeenCalledWith(
      'Buy milk\nWalk the dog\nWrite the report',
    )
  })

  it('adds inline without the import dialog when a single line is pasted', () => {
    // Arrange
    const onBulkPaste = vi.fn()
    installFloatingNavigatorAPI(vi.fn().mockResolvedValue(true))
    render(<FloatingNavigator {...noopTaskProps} onBulkPaste={onBulkPaste} />)
    const input = screen.getByRole('textbox', { name: 'New task title' })
    input.focus()

    // Act: a single line is ordinary input, not a list to import.
    pasteTextInto(input, 'Just one task')

    // Assert: the bulk path stays out of the way — native paste handles it.
    expect(onBulkPaste).not.toHaveBeenCalled()
  })

  it('does not hijack a multi-line paste made mid-edit (caret not over a full selection)', () => {
    // Arrange: the user already typed a draft, so a paste lands inside existing
    // text — intercepting here would destroy what they were writing.
    const onBulkPaste = vi.fn()
    installFloatingNavigatorAPI(vi.fn().mockResolvedValue(true))
    render(<FloatingNavigator {...noopTaskProps} onBulkPaste={onBulkPaste} />)
    const input = screen.getByRole('textbox', { name: 'New task title' })
    fireEvent.change(input, { target: { value: 'draft note' } })

    // Act: paste a multi-line list while the field holds a partial value.
    pasteTextInto(input, 'first\nsecond')

    // Assert: native paste wins; the bulk dialog is NOT opened over a partial edit.
    expect(onBulkPaste).not.toHaveBeenCalled()
  })
})

describe('FloatingNavigator — Tuck into Completed parity (#113)', () => {
  const FINISHED_FLOATING_TODO = {
    id: '7',
    text: 'Buy milk',
    completed: true,
    createdAt: new Date('2026-01-01T00:00:00Z'),
  }

  it('labels the finished-row action as tucking into Completed, not a destructive delete', async () => {
    // Arrange: a finished task is shown in the Floating Completed section.
    installFloatingNavigatorAPI(vi.fn().mockResolvedValue(true))
    renderFloatingWithStore(
      <FloatingNavigator {...noopTaskProps} todos={[FINISHED_FLOATING_TODO]} />,
    )

    // Act: locate the per-row action by its quiet-companion accessible name.
    const moveButton = await screen.findByRole('button', {
      name: 'Tuck "Buy milk" into Completed',
    })

    // Assert: the win-filing button reads as filing, not deleting — the old
    // "Delete completed task" label (and the trash skin) is gone.
    expect(moveButton).toBeInTheDocument()
    expect(
      screen.queryByRole('button', { name: /delete completed task/i }),
    ).not.toBeInTheDocument()
  })

  it('files just that finished task into Completed when its button is tapped', async () => {
    // Arrange
    installFloatingNavigatorAPI(vi.fn().mockResolvedValue(true))
    const onTaskDelete = vi.fn()
    renderFloatingWithStore(
      <FloatingNavigator
        {...noopTaskProps}
        todos={[FINISHED_FLOATING_TODO]}
        onTaskDelete={onTaskDelete}
      />,
    )
    const moveButton = await screen.findByRole('button', {
      name: 'Tuck "Buy milk" into Completed',
    })

    // Act
    fireEvent.click(moveButton)

    // Assert: only that one task is filed (delete-of-completed archives it).
    expect(onTaskDelete).toHaveBeenCalledTimes(1)
    expect(onTaskDelete).toHaveBeenCalledWith('7')
  })

  it('keeps the finished-row tuck button inert while its completion is still saving (no hard-delete)', async () => {
    // Arrange: a finished row is shown, but its completion toggle has NOT yet
    // committed to the server (slow network). Tucking reuses delete→archive,
    // and the server only archives a row that is ALREADY completed in the DB —
    // fire it before the toggle lands and that row is HARD-DELETED instead (the
    // win is destroyed, no heatmap credit). So the button must stay disabled
    // until the completion is durable.
    installFloatingNavigatorAPI(vi.fn().mockResolvedValue(true))
    const onTaskDelete = vi.fn()
    renderFloatingWithStore(
      <FloatingNavigator
        {...noopTaskProps}
        todos={[FINISHED_FLOATING_TODO]}
        onTaskDelete={onTaskDelete}
        isTogglePending
      />,
    )
    const moveButton = await screen.findByRole('button', {
      name: 'Tuck "Buy milk" into Completed',
    })

    // Act: try to file the win while the completion is still in flight.
    fireEvent.click(moveButton)

    // Assert: the button is inert and no archive/delete is attempted — the gate
    // holds the win until the toggle commits.
    expect(moveButton).toBeDisabled()
    expect(onTaskDelete).not.toHaveBeenCalled()
  })
})
