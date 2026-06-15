import { configureStore } from '@reduxjs/toolkit'
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Provider } from 'react-redux'
import { toast } from 'sonner'
import type { ToastT } from 'sonner'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import preferencesReducer, {
  initialState as preferencesInitialState,
} from '@/lib/redux/slices/preferencesSlice'
import type { PreferencesState } from '@/lib/schemas/preferences'
import type { CategoryWithCount } from '@/server/schemas/category'

import { BrainDumpEditor } from './BrainDumpEditor'

// Shared across create + delete mutations so the complete-command specs can
// assert the create call. Resolves `{ id }` so promoteLineToCompleted's
// `.then(created => created.id)` chain runs instead of throwing on undefined.
const { completedMutateAsync } = vi.hoisted(() => ({
  completedMutateAsync: vi.fn(),
}))

vi.mock('@tanstack/react-query', () => ({
  useMutation: () => ({
    mutateAsync: completedMutateAsync,
  }),
  useQueryClient: () => ({
    invalidateQueries: vi.fn().mockResolvedValue(undefined),
  }),
}))

vi.mock('sonner', () => ({
  toast: {
    dismiss: vi.fn(),
    error: vi.fn(),
    success: vi.fn(),
  },
}))

vi.mock('@/hooks/use-mounted', () => ({
  useMounted: () => true,
}))

vi.mock('@/hooks/useClerkQueryReady', () => ({
  useClerkQueryReady: () => true,
}))

vi.mock('@/hooks/useSelectedCategory', () => ({
  useSelectedCategory: () => [1],
}))

vi.mock('@/lib/orpc/client-query', () => ({
  orpc: {
    completed: {
      create: {
        mutationOptions: vi.fn(() => ({})),
      },
      delete: {
        mutationOptions: vi.fn(() => ({})),
      },
      heatmap: {
        key: vi.fn(() => ['completed', 'heatmap']),
      },
    },
  },
}))

vi.mock('@/lib/todo-sync-channel', () => ({
  broadcastTodoSync: vi.fn(),
}))

vi.mock('../../../electron/utils/electron-client', () => ({
  isBrainDumpEnvironment: () => true,
}))

const categories: CategoryWithCount[] = [
  {
    id: 1,
    name: 'Today',
    color: 'amber',
    isDefault: true,
    userId: 1,
    createdAt: new Date('2026-06-12T00:00:00.000Z'),
    updatedAt: new Date('2026-06-12T00:00:00.000Z'),
    _count: { todos: 0 },
  },
]

type BrainDumpSpacesBridge = {
  getVisibleOnAllWorkspaces: ReturnType<typeof vi.fn>
  setVisibleOnAllWorkspaces: ReturnType<typeof vi.fn>
}

/**
 * Installs the BrainDump preload bridge used by the editor in renderer tests.
 * @param spaces - Fake Spaces bridge methods for this scenario.
 * @returns Nothing; mutates the happy-dom window object.
 * @example
 * installBrainDumpAPI({ getVisibleOnAllWorkspaces, setVisibleOnAllWorkspaces })
 */
function installBrainDumpAPI(spaces: BrainDumpSpacesBridge): void {
  Object.defineProperty(window, 'brainDumpAPI', {
    configurable: true,
    writable: true,
    value: {
      window: {
        close: vi.fn().mockResolvedValue(undefined),
        getBounds: vi.fn().mockResolvedValue(null),
        getOpacity: vi.fn().mockResolvedValue(1),
        setBounds: vi.fn().mockResolvedValue(undefined),
        setOpacity: vi.fn().mockResolvedValue(undefined),
        toggle: vi.fn().mockResolvedValue(undefined),
      },
      note: {
        get: vi.fn().mockResolvedValue(''),
        set: vi.fn().mockResolvedValue(undefined),
      },
      sync: {
        getEnabled: vi.fn().mockResolvedValue(true),
        setEnabled: vi.fn().mockResolvedValue(undefined),
      },
      category: {
        getLast: vi.fn().mockResolvedValue(1),
        setLast: vi.fn().mockResolvedValue(undefined),
      },
      spaces,
      on: vi.fn(() => vi.fn()),
    },
  })
}

/**
 * Renders the editor under a real preferences store (so its inline text styling
 * reads the actual slice) with the given preference overrides spread over the
 * slice defaults. Required now that BrainDumpEditor reads the preferences slice.
 * @param preferenceOverrides - Fields to override on top of the slice defaults.
 * @returns The Testing Library render result.
 * @example
 * renderEditor({ braindumpFontSize: 20 })
 */
function renderEditor(preferenceOverrides: Partial<PreferencesState> = {}) {
  const store = configureStore({
    reducer: { preferences: preferencesReducer },
    preloadedState: {
      preferences: { ...preferencesInitialState, ...preferenceOverrides },
    },
  })
  return render(
    <Provider store={store}>
      <BrainDumpEditor categories={categories} />
    </Provider>,
  )
}

describe('BrainDumpEditor Spaces tracking switch', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('reflects the saved Mac desktop tracking preference in the header switch', async () => {
    // Arrange
    const getVisibleOnAllWorkspaces = vi.fn().mockResolvedValue(true)
    const setVisibleOnAllWorkspaces = vi.fn().mockResolvedValue(true)
    installBrainDumpAPI({
      getVisibleOnAllWorkspaces,
      setVisibleOnAllWorkspaces,
    })

    // Act
    renderEditor()
    const spacesSwitch = screen.getByRole('switch', {
      name: 'Show BrainDump on all Mac desktops',
    })

    // Assert
    expect(screen.getByText('Follow Spaces')).toBeInTheDocument()
    await waitFor(() => {
      expect(spacesSwitch).toBeChecked()
    })
  })

  it('persists the header switch change through the BrainDump preload bridge', async () => {
    // Arrange
    const getVisibleOnAllWorkspaces = vi.fn().mockResolvedValue(true)
    const setVisibleOnAllWorkspaces = vi.fn().mockResolvedValue(false)
    installBrainDumpAPI({
      getVisibleOnAllWorkspaces,
      setVisibleOnAllWorkspaces,
    })
    const user = userEvent.setup()
    renderEditor()
    const spacesSwitch = screen.getByRole('switch', {
      name: 'Show BrainDump on all Mac desktops',
    })
    await waitFor(() => {
      expect(spacesSwitch).toBeChecked()
    })

    // Act
    await user.click(spacesSwitch)

    // Assert
    expect(setVisibleOnAllWorkspaces).toHaveBeenCalledWith(false)
    await waitFor(() => {
      expect(spacesSwitch).not.toBeChecked()
    })
  })

  it('rolls the header switch back when the main process rejects the change', async () => {
    // Arrange
    const getVisibleOnAllWorkspaces = vi.fn().mockResolvedValue(false)
    const setVisibleOnAllWorkspaces = vi
      .fn()
      .mockRejectedValue(new Error('main process unavailable'))
    installBrainDumpAPI({
      getVisibleOnAllWorkspaces,
      setVisibleOnAllWorkspaces,
    })
    const user = userEvent.setup()
    renderEditor()
    const spacesSwitch = screen.getByRole('switch', {
      name: 'Show BrainDump on all Mac desktops',
    })
    await waitFor(() => {
      expect(spacesSwitch).not.toBeChecked()
    })

    // Act
    await user.click(spacesSwitch)

    // Assert
    await waitFor(() => {
      expect(spacesSwitch).not.toBeChecked()
    })
    expect(toast.error).toHaveBeenCalledWith(
      'Failed to update desktop tracking',
    )
  })

  it('blocks rapid repeats while the Mac desktop tracking save is pending', async () => {
    // Arrange
    let resolveSpacesUpdate: (value: boolean) => void = () => undefined
    const pendingSpacesUpdate = new Promise<boolean>((resolve) => {
      resolveSpacesUpdate = resolve
    })
    const getVisibleOnAllWorkspaces = vi.fn().mockResolvedValue(false)
    const setVisibleOnAllWorkspaces = vi.fn(async () => pendingSpacesUpdate)
    installBrainDumpAPI({
      getVisibleOnAllWorkspaces,
      setVisibleOnAllWorkspaces,
    })
    renderEditor()
    const spacesSwitch = screen.getByRole('switch', {
      name: 'Show BrainDump on all Mac desktops',
    })
    await waitFor(() => {
      expect(spacesSwitch).not.toBeChecked()
    })

    // Act
    fireEvent.click(spacesSwitch)
    fireEvent.click(spacesSwitch)

    // Assert
    expect(setVisibleOnAllWorkspaces).toHaveBeenCalledTimes(1)
    expect(spacesSwitch).toBeDisabled()

    resolveSpacesUpdate(true)
    await waitFor(() => {
      expect(spacesSwitch).toBeChecked()
    })
    expect(spacesSwitch).not.toBeDisabled()
  })
})

describe('BrainDumpEditor text styling preferences', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('renders the note in the saved font family, size, and color', async () => {
    // Arrange
    const getVisibleOnAllWorkspaces = vi.fn().mockResolvedValue(false)
    const setVisibleOnAllWorkspaces = vi.fn().mockResolvedValue(true)
    installBrainDumpAPI({
      getVisibleOnAllWorkspaces,
      setVisibleOnAllWorkspaces,
    })

    // Act — open the editor with serif / 20px / amber text saved in preferences.
    // findByRole settles the editor's async mount effects under act() before asserting.
    renderEditor({
      braindumpFontFamily: 'serif',
      braindumpFontSize: 20,
      braindumpTextColor: 'var(--primary)',
    })
    const noteField = await screen.findByRole('textbox')

    // Assert — the saved presentation is applied inline to the writing surface.
    expect(noteField.style.fontFamily).toBe('var(--font-serif)')
    expect(noteField.style.fontSize).toBe('20px')
    expect(noteField.style.color).toBe('var(--primary)')
  })

  it('falls back to the default look (mono / 14px) when no preference is saved', async () => {
    // Arrange
    const getVisibleOnAllWorkspaces = vi.fn().mockResolvedValue(false)
    const setVisibleOnAllWorkspaces = vi.fn().mockResolvedValue(true)
    installBrainDumpAPI({
      getVisibleOnAllWorkspaces,
      setVisibleOnAllWorkspaces,
    })

    // Act — a fresh install (slice defaults) preserves the prior textarea look.
    renderEditor()
    const noteField = await screen.findByRole('textbox')

    // Assert — monospace at 14px, matching the removed `font-mono text-sm`.
    expect(noteField.style.fontFamily).toBe('var(--font-mono)')
    expect(noteField.style.fontSize).toBe('14px')
  })
})

describe('BrainDumpEditor focus on window show', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('focuses the note editor when the BrainDump window first opens, so a quick capture can start typing right away', async () => {
    // Arrange — open the editor with an active category, so the note field is enabled.
    const getVisibleOnAllWorkspaces = vi.fn().mockResolvedValue(false)
    const setVisibleOnAllWorkspaces = vi.fn().mockResolvedValue(true)
    installBrainDumpAPI({
      getVisibleOnAllWorkspaces,
      setVisibleOnAllWorkspaces,
    })

    // Act — findByRole settles the mount effects (including the focus effect) under act().
    renderEditor()
    const noteField = await screen.findByRole<HTMLTextAreaElement>('textbox')

    // Assert — keyboard focus lands in the editor, not on a header control.
    expect(noteField).toHaveFocus()
  })

  it('returns focus to the note editor when the window is shown again, instead of leaving it on the Follow Spaces switch', async () => {
    // Arrange — editor open with an active category; reproduce the reported bug's
    // starting point by parking focus on the first focusable header control.
    const getVisibleOnAllWorkspaces = vi.fn().mockResolvedValue(false)
    const setVisibleOnAllWorkspaces = vi.fn().mockResolvedValue(true)
    installBrainDumpAPI({
      getVisibleOnAllWorkspaces,
      setVisibleOnAllWorkspaces,
    })
    renderEditor()
    const noteField = await screen.findByRole<HTMLTextAreaElement>('textbox')
    const spacesSwitch = screen.getByRole('switch', {
      name: 'Show BrainDump on all Mac desktops',
    })
    act(() => {
      spacesSwitch.focus()
    })
    expect(spacesSwitch).toHaveFocus()

    // Act — the window is shown again: BrowserWindow.show() drives a Page
    // Visibility transition to 'visible' in the renderer.
    Object.defineProperty(document, 'visibilityState', {
      configurable: true,
      get: () => 'visible',
    })
    act(() => {
      document.dispatchEvent(new Event('visibilitychange'))
    })

    // Assert — focus is back in the note editor, ready for the next capture.
    expect(noteField).toHaveFocus()
  })
})

/**
 * Types `value` into the note field, parks the caret at the end of the first
 * line, and fires the Cmd+Enter complete command. Shared mechanical setup so
 * each spec keeps its expected create args / textarea value hard-coded inline.
 * @param noteField - The BrainDump textarea.
 * @param value - Full note contents to type before completing.
 * @returns Nothing; drives the editor via fireEvent.
 * @example
 * fireCompleteCommandOnFirstLine(noteField, 'buy milk')
 */
function fireCompleteCommandOnFirstLine(
  noteField: HTMLTextAreaElement,
  value: string,
) {
  fireEvent.change(noteField, { target: { value } })
  const caret = value.split('\n')[0]?.length ?? 0
  noteField.selectionStart = caret
  noteField.selectionEnd = caret
  fireEvent.keyDown(noteField, { key: 'Enter', metaKey: true })
}

describe('BrainDumpEditor complete command', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    completedMutateAsync.mockResolvedValue({ id: 1 })
  })

  it('completes a plain prose line into a Completed row on Cmd+Enter', async () => {
    // Arrange — an editor with a category, holding one ordinary (non-checkbox) line.
    const getVisibleOnAllWorkspaces = vi.fn().mockResolvedValue(false)
    const setVisibleOnAllWorkspaces = vi.fn().mockResolvedValue(true)
    installBrainDumpAPI({
      getVisibleOnAllWorkspaces,
      setVisibleOnAllWorkspaces,
    })
    renderEditor()
    const noteField = await screen.findByRole<HTMLTextAreaElement>('textbox')

    // Act — fire the complete command on the plain line.
    fireCompleteCommandOnFirstLine(noteField, 'buy milk')

    // Assert — a Completed row is created and the line is marked done.
    expect(completedMutateAsync).toHaveBeenCalledWith({
      categoryId: 1,
      title: 'buy milk',
    })
    await waitFor(() => {
      expect(noteField).toHaveValue('- [x] buy milk')
    })
  })

  it('still toggles an existing checkbox line into a Completed row on Cmd+Enter', async () => {
    // Arrange — an editor holding a pre-formatted unchecked checkbox line.
    const getVisibleOnAllWorkspaces = vi.fn().mockResolvedValue(false)
    const setVisibleOnAllWorkspaces = vi.fn().mockResolvedValue(true)
    installBrainDumpAPI({
      getVisibleOnAllWorkspaces,
      setVisibleOnAllWorkspaces,
    })
    renderEditor()
    const noteField = await screen.findByRole<HTMLTextAreaElement>('textbox')

    // Act
    fireCompleteCommandOnFirstLine(noteField, '- [ ] write tests')

    // Assert — the existing checkbox path is unchanged.
    expect(completedMutateAsync).toHaveBeenCalledWith({
      categoryId: 1,
      title: 'write tests',
    })
    await waitFor(() => {
      expect(noteField).toHaveValue('- [x] write tests')
    })
  })

  it('restores the original plain prose when the completion create fails', async () => {
    // Arrange — the create mutation rejects for this completion.
    completedMutateAsync.mockRejectedValueOnce(new Error('network down'))
    const getVisibleOnAllWorkspaces = vi.fn().mockResolvedValue(false)
    const setVisibleOnAllWorkspaces = vi.fn().mockResolvedValue(true)
    installBrainDumpAPI({
      getVisibleOnAllWorkspaces,
      setVisibleOnAllWorkspaces,
    })
    renderEditor()
    const noteField = await screen.findByRole<HTMLTextAreaElement>('textbox')

    // Act — complete a plain prose line whose create then fails.
    fireCompleteCommandOnFirstLine(noteField, 'buy milk')

    // Assert — the line is restored to plain prose, not a `- [ ] buy milk` skeleton.
    await waitFor(() => {
      expect(noteField).toHaveValue('buy milk')
    })
  })

  it('leaves an unrelated line untouched when a failed completion can no longer find its line', async () => {
    // Arrange — hold the create in flight so we can edit the note before it
    // rejects (the create only settles when we call rejectCreate).
    let rejectCreate: (reason: Error) => void = () => undefined
    const pendingCreate = new Promise<{ id: number }>((_resolve, reject) => {
      rejectCreate = reject
    })
    completedMutateAsync.mockReturnValueOnce(pendingCreate)
    const getVisibleOnAllWorkspaces = vi.fn().mockResolvedValue(false)
    const setVisibleOnAllWorkspaces = vi.fn().mockResolvedValue(true)
    installBrainDumpAPI({
      getVisibleOnAllWorkspaces,
      setVisibleOnAllWorkspaces,
    })
    renderEditor()
    const noteField = await screen.findByRole<HTMLTextAreaElement>('textbox')

    // Act — complete 'buy milk', then (while the create is still pending) prepend
    // an unrelated line and rename the completed one so the title search misses.
    fireCompleteCommandOnFirstLine(noteField, 'buy milk')
    fireEvent.change(noteField, {
      target: { value: 'urgent\n- [x] buy milk and eggs' },
    })
    await act(async () => {
      rejectCreate(new Error('network down'))
    })

    // Assert — the rollback must not blind-overwrite line 0; 'urgent' survives
    // instead of being clobbered with the stale 'buy milk' rollback text.
    expect(noteField).toHaveValue('urgent\n- [x] buy milk and eggs')
  })

  it('does nothing when the caret line is blank', async () => {
    // Arrange — an editor whose caret line is whitespace only.
    const getVisibleOnAllWorkspaces = vi.fn().mockResolvedValue(false)
    const setVisibleOnAllWorkspaces = vi.fn().mockResolvedValue(true)
    installBrainDumpAPI({
      getVisibleOnAllWorkspaces,
      setVisibleOnAllWorkspaces,
    })
    renderEditor()
    const noteField = await screen.findByRole<HTMLTextAreaElement>('textbox')

    // Act
    fireCompleteCommandOnFirstLine(noteField, '   ')

    // Assert — no Completed row is created for an empty line.
    expect(completedMutateAsync).not.toHaveBeenCalled()
  })
})

describe('BrainDumpEditor clear-on-complete', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    completedMutateAsync.mockResolvedValue({ id: 1 })
  })

  it('clears a finished line once its undo window closes when clear-on-complete is on', async () => {
    // Arrange — the editor with clear-on-complete opted in.
    const getVisibleOnAllWorkspaces = vi.fn().mockResolvedValue(false)
    const setVisibleOnAllWorkspaces = vi.fn().mockResolvedValue(true)
    installBrainDumpAPI({
      getVisibleOnAllWorkspaces,
      setVisibleOnAllWorkspaces,
    })
    renderEditor({ braindumpClearOnComplete: true })
    const noteField = await screen.findByRole<HTMLTextAreaElement>('textbox')

    // Act — complete the line, then simulate the undo window elapsing with no
    // Undo (Sonner fires the success toast's onAutoClose on the timeout).
    fireCompleteCommandOnFirstLine(noteField, 'buy milk')
    await waitFor(() => {
      expect(noteField).toHaveValue('- [x] buy milk')
    })
    const autoClose = vi
      .mocked(toast.success)
      .mock.calls.at(-1)?.[1]?.onAutoClose
    // onAutoClose ignores its ToastT arg (it re-resolves the line from the ref),
    // so an empty stub stands in for the unused parameter.
    act(() => {
      autoClose?.({} as ToastT)
    })

    // Assert — the finished line is dropped, leaving the scratchpad clean.
    expect(noteField).toHaveValue('')
  })

  it('keeps a finished line that was undone before its window closed (clear self-suppresses)', async () => {
    // Arrange — clear-on-complete on; complete a line, then manually uncheck it
    // (Cmd+Enter on the `- [x]` line) before the undo window elapses.
    const getVisibleOnAllWorkspaces = vi.fn().mockResolvedValue(false)
    const setVisibleOnAllWorkspaces = vi.fn().mockResolvedValue(true)
    installBrainDumpAPI({
      getVisibleOnAllWorkspaces,
      setVisibleOnAllWorkspaces,
    })
    renderEditor({ braindumpClearOnComplete: true })
    const noteField = await screen.findByRole<HTMLTextAreaElement>('textbox')
    fireCompleteCommandOnFirstLine(noteField, 'buy milk')
    await waitFor(() => {
      expect(noteField).toHaveValue('- [x] buy milk')
    })

    // Act — manually uncheck (re-fire Cmd+Enter on the checked line), then fire
    // the original toast's onAutoClose as the window would.
    noteField.selectionStart = 1
    noteField.selectionEnd = 1
    fireEvent.keyDown(noteField, { key: 'Enter', metaKey: true })
    await waitFor(() => {
      expect(noteField).toHaveValue('- [ ] buy milk')
    })
    const autoClose = vi
      .mocked(toast.success)
      .mock.calls.at(-1)?.[1]?.onAutoClose
    act(() => {
      autoClose?.({} as ToastT)
    })

    // Assert — the now-unchecked line is NOT a checked match, so it survives
    // instead of being cleared out from under the user.
    expect(noteField).toHaveValue('- [ ] buy milk')
  })

  it('keeps every finished line in place by default (no auto-close hook wired)', async () => {
    // Arrange — a fresh install (clear-on-complete OFF) keeps the prior behavior.
    const getVisibleOnAllWorkspaces = vi.fn().mockResolvedValue(false)
    const setVisibleOnAllWorkspaces = vi.fn().mockResolvedValue(true)
    installBrainDumpAPI({
      getVisibleOnAllWorkspaces,
      setVisibleOnAllWorkspaces,
    })
    renderEditor()
    const noteField = await screen.findByRole<HTMLTextAreaElement>('textbox')

    // Act — complete a plain line under the default preference.
    fireCompleteCommandOnFirstLine(noteField, 'buy milk')
    await waitFor(() => {
      expect(noteField).toHaveValue('- [x] buy milk')
    })

    // Assert — the success toast carries NO onAutoClose hook, so the finished
    // line stays put (the clear is strictly opt-in).
    const autoClose = vi
      .mocked(toast.success)
      .mock.calls.at(-1)?.[1]?.onAutoClose
    expect(autoClose).toBeUndefined()
    expect(noteField).toHaveValue('- [x] buy milk')
  })

  it('still deletes the right Completed row after an earlier line was auto-cleared', async () => {
    // Arrange — clear-on-complete on, with two finished lines whose Completed
    // rows have distinct ids (titles repeat by design — repetition is a feature).
    completedMutateAsync.mockReset()
    completedMutateAsync
      .mockResolvedValueOnce({ id: 1 }) // create: buy milk
      .mockResolvedValueOnce({ id: 2 }) // create: wash car
      .mockResolvedValue({ id: 99 }) // any later delete (return ignored)
    const getVisibleOnAllWorkspaces = vi.fn().mockResolvedValue(false)
    const setVisibleOnAllWorkspaces = vi.fn().mockResolvedValue(true)
    installBrainDumpAPI({
      getVisibleOnAllWorkspaces,
      setVisibleOnAllWorkspaces,
    })
    renderEditor({ braindumpClearOnComplete: true })
    const noteField = await screen.findByRole<HTMLTextAreaElement>('textbox')

    // Complete the first line ('buy milk', id 1).
    fireCompleteCommandOnFirstLine(noteField, 'buy milk\nwash car')
    await waitFor(() => {
      expect(noteField).toHaveValue('- [x] buy milk\nwash car')
    })
    // Complete the second line ('wash car', id 2) — caret at end of line 2.
    noteField.selectionStart = noteField.value.length
    noteField.selectionEnd = noteField.value.length
    fireEvent.keyDown(noteField, { key: 'Enter', metaKey: true })
    await waitFor(() => {
      expect(noteField).toHaveValue('- [x] buy milk\n- [x] wash car')
    })

    // Act — the FIRST line's undo window elapses, auto-clearing 'buy milk' so
    // 'wash car' shifts up to line 0 (its ref entry key now drifted). Then
    // uncheck 'wash car'.
    const autoCloseBuyMilk = vi
      .mocked(toast.success)
      .mock.calls.find(
        (call) => call[0] === 'Completed: buy milk',
      )?.[1]?.onAutoClose
    act(() => {
      autoCloseBuyMilk?.({} as ToastT)
    })
    await waitFor(() => {
      expect(noteField).toHaveValue('- [x] wash car')
    })
    noteField.selectionStart = 1
    noteField.selectionEnd = 1
    fireEvent.keyDown(noteField, { key: 'Enter', metaKey: true })

    // Assert — the uncheck deletes 'wash car' (id 2), NOT the auto-cleared
    // 'buy milk' (id 1) whose stale ref entry would otherwise be mis-targeted.
    await waitFor(() => {
      expect(completedMutateAsync).toHaveBeenCalledWith({ id: 2 })
    })
    expect(completedMutateAsync).not.toHaveBeenCalledWith({ id: 1 })
  })
})
