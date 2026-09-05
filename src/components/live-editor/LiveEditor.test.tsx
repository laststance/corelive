import { configureStore } from '@reduxjs/toolkit'
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { ReactElement } from 'react'
import { Provider } from 'react-redux'
import { toast } from 'sonner'
import type { ToastT } from 'sonner'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import {
  LOCAL_COMPLETIONS_STORAGE_KEY,
  LOCAL_NOTE_STORAGE_KEY,
} from '@/lib/live-editor/constants'
import { parseLocalCompletions } from '@/lib/live-editor/localCompletionStore'
import userSettingsReducer, {
  initialState as userSettingsInitialState,
} from '@/lib/redux/slices/settingsSlice'
import type { UserSettingsState } from '@/lib/schemas/settings'
import type { CategoryWithCount } from '@/server/schemas/category'

import { LiveEditor } from './LiveEditor'

// Split create/delete mutations so completion specs can assert create calls
// without counting undo cleanup deletes.
const {
  completedCreateMutationOptions,
  completedDeleteMutationOptions,
  completedMutateAsync,
  deleteCompletedMutateAsync,
} = vi.hoisted(() => ({
  completedCreateMutationOptions: {},
  completedDeleteMutationOptions: {},
  completedMutateAsync: vi.fn(),
  deleteCompletedMutateAsync: vi.fn(),
}))

vi.mock('@tanstack/react-query', () => ({
  useMutation: (options: unknown) => ({
    mutateAsync:
      options === completedDeleteMutationOptions
        ? deleteCompletedMutateAsync
        : completedMutateAsync,
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

// Clerk session, controllable per spec. Signed-in by default so every Electron
// spec stays on the account path; the web-host suite flips it to signed out.
type ClerkUserState = {
  isLoaded: boolean
  isSignedIn: boolean
  user: { id: string } | null
}

const { clerkUserRef } = vi.hoisted(() => ({
  clerkUserRef: {
    current: {
      isLoaded: true,
      isSignedIn: true,
      user: { id: 'user_1' },
    } as ClerkUserState,
  },
}))

vi.mock('@clerk/nextjs', () => ({
  useUser: () => clerkUserRef.current,
}))

// Controllable active floating category so a spec can flip the active category
// mid-test (it drives activeCategoryId while sync is on). Defaults to 1 so every
// existing spec keeps the single "General" category active.
const { selectedCategoryRef, setSelectedCategory } = vi.hoisted(() => ({
  selectedCategoryRef: { current: 1 as number },
  setSelectedCategory: vi.fn(),
}))

vi.mock('@/hooks/useSelectedCategory', () => ({
  useSelectedCategory: () => [selectedCategoryRef.current, setSelectedCategory],
  // The web-only default pick has its own spec; here the selection is explicit.
  useAutoSelectDefaultCategory: vi.fn(),
}))

vi.mock('@/lib/orpc/client-query', () => ({
  orpc: {
    completed: {
      create: {
        mutationOptions: vi.fn(() => completedCreateMutationOptions),
      },
      delete: {
        mutationOptions: vi.fn(() => completedDeleteMutationOptions),
      },
      heatmap: {
        key: vi.fn(() => ['completed', 'heatmap']),
        queryOptions: vi.fn(() => ({
          queryKey: ['completed', 'heatmap', { input: { days: 1 } }],
        })),
      },
    },
  },
}))

vi.mock('@/lib/todo-sync-channel', () => ({
  broadcastTodoSync: vi.fn(),
}))

// The storage probe is answered once per module; expose it as a per-spec switch
// so the footer's "session only" wording can be exercised without a private
// window. The stores themselves keep using the real slot.
const { storageAvailabilityRef } = vi.hoisted(() => ({
  storageAvailabilityRef: { current: 'ok' as 'ok' | 'unavailable' },
}))

vi.mock('@/lib/live-editor/localStorageSlot', async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>()
  return {
    ...actual,
    getLocalStorageAvailability: () => storageAvailabilityRef.current,
  }
})

const { liveEditorEnvironmentRef } = vi.hoisted(() => ({
  liveEditorEnvironmentRef: { current: true },
}))

vi.mock('../../../electron/utils/electron-client', () => ({
  getLiveEditorAPI: () => window.liveEditorAPI ?? window.brainDumpAPI,
  getLiveEditorCategoryChangedChannel: () => 'live-editor-category-changed',
  isLiveEditorEnvironment: () => liveEditorEnvironmentRef.current,
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

const categoriesWithCorelive: CategoryWithCount[] = [
  ...categories,
  {
    id: 12,
    name: 'Corelive',
    color: 'blue',
    isDefault: false,
    userId: 1,
    createdAt: new Date('2026-06-12T00:00:00.000Z'),
    updatedAt: new Date('2026-06-12T00:00:00.000Z'),
    _count: { todos: 0 },
  },
]

type LiveEditorSpacesBridge = {
  getVisibleOnAllWorkspaces: ReturnType<typeof vi.fn>
  setVisibleOnAllWorkspaces: ReturnType<typeof vi.fn>
}

/**
 * Installs the LiveEditor preload bridge used by the editor in renderer tests.
 * @param spaces - Fake Spaces bridge methods for this scenario.
 * @returns Nothing; mutates the happy-dom window object.
 * @example
 * installLiveEditorAPI({ getVisibleOnAllWorkspaces, setVisibleOnAllWorkspaces })
 */
function installLiveEditorAPI(spaces: LiveEditorSpacesBridge): void {
  Object.defineProperty(window, 'liveEditorAPI', {
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
 * Renders the editor under a real settings store (so its inline text styling
 * reads the actual slice) with the given setting overrides spread over the
 * slice defaults. Required now that LiveEditor reads the settings slice.
 * @param settingOverrides - Fields to override on top of the slice defaults.
 * @returns The Testing Library render result.
 * @example
 * renderEditor({ liveEditorFontSize: 20 })
 */
function renderEditor(settingOverrides: Partial<UserSettingsState> = {}) {
  return renderEditorWithCategories(categories, settingOverrides)
}

/**
 * Renders the editor with custom categories for category-switching persistence specs.
 * @param editorCategories - Categories available in the LiveEditor picker.
 * @param settingOverrides - Fields to override on top of the slice defaults.
 * @returns The Testing Library render result.
 * @example
 * renderEditorWithCategories(categoriesWithCorelive)
 */
function renderEditorWithCategories(
  editorCategories: CategoryWithCount[],
  settingOverrides: Partial<UserSettingsState> = {},
  isCategoryListPending = false,
) {
  const store = configureStore({
    reducer: { settings: userSettingsReducer },
    preloadedState: {
      settings: { ...userSettingsInitialState, ...settingOverrides },
    },
  })
  return render(
    <Provider store={store}>
      <LiveEditor
        categories={editorCategories}
        isCategoryListPending={isCategoryListPending}
      />
    </Provider>,
  )
}

beforeEach(() => {
  liveEditorEnvironmentRef.current = true
})

/**
 * Makes happy-dom report a touch-first device for the "Keep line" button specs.
 * @returns The spy; the describe's afterEach restores the real matchMedia.
 * @example
 * mockCoarsePointer()
 */
function mockCoarsePointer() {
  return vi.spyOn(window, 'matchMedia').mockImplementation((query: string) => ({
    matches: query === '(pointer: coarse)',
    media: query,
    onchange: null,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: () => true,
  }))
}

describe('LiveEditor web host (/write)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    localStorage.clear()
    // A browser tab: no preload bridge at all, a signed-out stranger.
    liveEditorEnvironmentRef.current = false
    delete window.liveEditorAPI
    delete window.brainDumpAPI
    clerkUserRef.current = { isLoaded: true, isSignedIn: false, user: null }
    storageAvailabilityRef.current = 'ok'
    selectedCategoryRef.current = 1
  })

  afterEach(() => {
    clerkUserRef.current = {
      isLoaded: true,
      isSignedIn: true,
      user: { id: 'user_1' },
    }
    // Restored here rather than by a trailing statement inside the spec that
    // set it, so one failing assertion cannot leak a coarse pointer into every
    // spec after it.
    vi.restoreAllMocks()
  })

  it('lets a signed-out stranger write right away — focus in the field, no notice, no spinner', async () => {
    // Arrange / Act
    renderEditor()
    const noteField = await screen.findByRole<HTMLTextAreaElement>('textbox', {
      name: 'Write one thing',
    })
    await waitForLiveEditorReady(noteField)

    // Assert — happy-dom reports a Linux UA, so the hint reads Ctrl, not ⌘.
    expect(
      screen.queryByText(
        'LiveEditor is available in the CoreLive desktop app.',
      ),
    ).not.toBeInTheDocument()
    expect(screen.queryByText('Loading LiveEditor…')).not.toBeInTheDocument()
    expect(noteField).toHaveAttribute(
      'placeholder',
      'Write one thing. Ctrl Enter keeps it.',
    )
    await waitFor(() => {
      expect(noteField).toHaveFocus()
    })
  })

  it('paints the real editor as its own loading state before Clerk answers — no spinner, no empty-state copy (DR5)', async () => {
    // Arrange — first paint: Clerk has not resolved the session yet.
    clerkUserRef.current = { isLoaded: false, isSignedIn: false, user: null }

    // Act
    renderEditor()
    const noteField = await screen.findByRole<HTMLTextAreaElement>('textbox')

    // Assert — the stand-in IS the editor: same placeholder, disabled, silent.
    expect(noteField).toBeDisabled()
    expect(noteField).toHaveAttribute(
      'placeholder',
      'Write one thing. Ctrl Enter keeps it.',
    )
    expect(screen.queryByText('Loading LiveEditor…')).not.toBeInTheDocument()
    expect(
      screen.queryByText('Pick a category to start writing'),
    ).not.toBeInTheDocument()
  })

  it('says the categories are loading instead of inviting a keep into a dead field', async () => {
    // Arrange — /write passes `data?.categories ?? []`, so the list reads empty
    // for the whole `category.list` round trip after Clerk resolves the session.
    clerkUserRef.current = {
      isLoaded: true,
      isSignedIn: true,
      user: { id: 'user_A' },
    }
    selectedCategoryRef.current = 7

    // Act
    renderEditorWithCategories([], {}, true)
    const noteField = await screen.findByRole<HTMLTextAreaElement>('textbox')

    // Assert — neither "pick from this empty list" nor "⌘ Enter keeps it" over a
    // textarea that will not accept a keystroke.
    await waitFor(() => {
      expect(noteField).toHaveAttribute(
        'placeholder',
        'Loading your categories…',
      )
    })
    expect(noteField).toBeDisabled()
  })

  it('does not tell a signed-in visitor with no categories at all to pick one', async () => {
    // Arrange — the fetch landed and the account genuinely has nothing; the
    // Select says "No categories" on its own.
    clerkUserRef.current = {
      isLoaded: true,
      isSignedIn: true,
      user: { id: 'user_A' },
    }
    selectedCategoryRef.current = 7

    // Act
    renderEditorWithCategories([], {}, false)
    const noteField = await screen.findByRole<HTMLTextAreaElement>('textbox')

    // Assert
    await waitFor(() => {
      expect(noteField).toHaveAttribute(
        'placeholder',
        'Write one thing. Ctrl Enter keeps it.',
      )
    })
  })

  it('shows the web frame — wordmark, shortcut hint, footer — and none of the panel chrome', async () => {
    // Arrange / Act
    renderEditor()
    await waitForLiveEditorReady(
      await screen.findByRole<HTMLTextAreaElement>('textbox'),
    )

    // Assert
    expect(screen.getByText('CoreLive')).toBeInTheDocument()
    expect(screen.getByText('Ctrl Enter')).toBeInTheDocument()
    expect(screen.getByText('Kept on this device.')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Sign in' })).toHaveAttribute(
      'href',
      '/login?redirect_url=/write',
    )
    expect(screen.queryByText('Follow Spaces')).not.toBeInTheDocument()
    expect(screen.queryByText('Follow FloatingNav')).not.toBeInTheDocument()
    expect(screen.queryByText('Opacity')).not.toBeInTheDocument()
    expect(
      screen.queryByRole('button', { name: 'Close LiveEditor' }),
    ).not.toBeInTheDocument()
    // One implicit category while signed out — no picker to get lost in.
    expect(screen.queryByRole('combobox')).not.toBeInTheDocument()
  })

  it('Cmd+Enter keeps the line on this device — no server call — and clears it even with the setting off', async () => {
    // Arrange — clear-on-complete OFF in settings; signed out forces it on.
    renderEditor({
      liveEditorClearOnComplete: false,
      liveEditorClearDelayMs: 0,
    })
    const noteField = await screen.findByRole<HTMLTextAreaElement>('textbox')
    await waitForLiveEditorReady(noteField)

    // Act
    fireCompleteCommandOnFirstLine(noteField, 'ship the thing\nnext')

    // Assert
    await waitFor(() => {
      expect(noteField).toHaveValue('next')
    })
    expect(completedMutateAsync).not.toHaveBeenCalled()
    expect(
      parseLocalCompletions(
        localStorage.getItem(LOCAL_COMPLETIONS_STORAGE_KEY),
      ).map((item) => item.title),
    ).toEqual(['ship the thing'])
    expect(toast.success).toHaveBeenCalledWith(
      'Completed: ship the thing',
      expect.anything(),
    )
  })

  it('Undo brings the line back and forgets the device-local keep', async () => {
    // Arrange — one kept line, already cleared.
    renderEditor({ liveEditorClearDelayMs: 0 })
    const noteField = await screen.findByRole<HTMLTextAreaElement>('textbox')
    await waitForLiveEditorReady(noteField)
    fireCompleteCommandOnFirstLine(noteField, 'ship the thing\nnext')
    await waitFor(() => {
      expect(noteField).toHaveValue('next')
    })

    // Act — Undo on the toast (see the instant-clear suite for the narrowing).
    const undoAction = vi.mocked(toast.success).mock.calls.at(-1)?.[1]
      ?.action as { onClick: () => void } | undefined
    await act(async () => {
      undoAction?.onClick()
    })

    // Assert
    await waitFor(() => {
      expect(noteField).toHaveValue('ship the thing\nnext')
    })
    await waitFor(() => {
      expect(
        parseLocalCompletions(
          localStorage.getItem(LOCAL_COMPLETIONS_STORAGE_KEY),
        ),
      ).toEqual([])
    })
    expect(deleteCompletedMutateAsync).not.toHaveBeenCalled()
  })

  it('remembers the half-written note on this device', async () => {
    // Arrange
    const user = userEvent.setup()
    renderEditor()
    const noteField = await screen.findByRole<HTMLTextAreaElement>('textbox')
    await waitForLiveEditorReady(noteField)

    // Act
    await user.type(noteField, 'half a thought')

    // Assert — the debounced write lands under the signed-out "0" key.
    await waitFor(() => {
      expect(
        JSON.parse(localStorage.getItem(LOCAL_NOTE_STORAGE_KEY) ?? '{}'),
      ).toEqual({ '0': 'half a thought' })
    })
  })

  it('says so when the browser refuses storage: keeps stay for this session only', async () => {
    // Arrange
    storageAvailabilityRef.current = 'unavailable'

    // Act
    renderEditor()
    await waitForLiveEditorReady(
      await screen.findByRole<HTMLTextAreaElement>('textbox'),
    )

    // Assert — still a Sign in link, never framed as the reason to sign in.
    expect(screen.getByText('Kept for this session only.')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Sign in' })).toBeInTheDocument()
  })

  it('signed in on the web, keeps go to the account, the picker is the only category control, and the footer points home', async () => {
    // Arrange
    clerkUserRef.current = {
      isLoaded: true,
      isSignedIn: true,
      user: { id: 'user_1' },
    }
    completedMutateAsync.mockResolvedValue({ id: 1 })
    renderEditor({ liveEditorClearOnComplete: false })
    const noteField = await screen.findByRole<HTMLTextAreaElement>('textbox')
    await waitForLiveEditorReady(noteField)

    // Act
    fireCompleteCommandOnFirstLine(noteField, 'ship it')

    // Assert
    await waitFor(() => {
      expect(completedMutateAsync).toHaveBeenCalledWith({
        categoryId: 1,
        title: 'ship it',
      })
    })
    expect(localStorage.getItem(LOCAL_COMPLETIONS_STORAGE_KEY)).toBeNull()
    // The signed-in setting (keep the [x]) is respected on the web.
    expect(noteField).toHaveValue('- [x] ship it')
    expect(
      screen.getByRole('combobox', { name: 'Active category' }),
    ).toBeEnabled()
    expect(screen.queryByText('Follow FloatingNav')).not.toBeInTheDocument()
    expect(screen.getByText('Keeps go to your account.')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Your year →' })).toHaveAttribute(
      'href',
      '/home',
    )
    expect(screen.getByRole('link', { name: 'CoreLive' })).toHaveAttribute(
      'href',
      '/home',
    )
  })

  it("never opens the previous account's note when a shared device still remembers their category", async () => {
    // Arrange — user A signed out leaving their category id and note on disk;
    // user B signs in and their account owns category 1, not 5.
    localStorage.setItem(
      LOCAL_NOTE_STORAGE_KEY,
      JSON.stringify({ '5': "user A's private note" }),
    )
    selectedCategoryRef.current = 5
    clerkUserRef.current = {
      isLoaded: true,
      isSignedIn: true,
      user: { id: 'user_B' },
    }

    // Act
    renderEditor()
    const noteField = await screen.findByRole<HTMLTextAreaElement>('textbox')

    // Assert — B is asked to pick, and A's text never reaches the field.
    await waitFor(() => {
      expect(noteField).toHaveAttribute(
        'placeholder',
        'Pick a category to start writing',
      )
    })
    expect(noteField).toBeDisabled()
    expect(noteField).toHaveValue('')

    // Assert — and B's typing cannot flush into A's slot.
    fireEvent.change(noteField, { target: { value: "user B's note" } })
    await act(async () => {
      await Promise.resolve()
    })
    expect(
      JSON.parse(localStorage.getItem(LOCAL_NOTE_STORAGE_KEY) ?? '{}'),
    ).toEqual({ '5': "user A's private note" })
  })

  it('on touch, a Keep line button under the editor keeps the caret line through the same path', async () => {
    // Arrange
    mockCoarsePointer()
    renderEditor({ liveEditorClearDelayMs: 0 })
    const noteField = await screen.findByRole<HTMLTextAreaElement>('textbox')
    await waitForLiveEditorReady(noteField)
    expect(noteField).toHaveAttribute(
      'placeholder',
      "Write one thing. Tap Keep when it's done.",
    )
    fireEvent.change(noteField, { target: { value: 'ship it\nnext' } })
    noteField.selectionStart = 3
    noteField.selectionEnd = 3

    // Act
    fireEvent.click(screen.getByRole('button', { name: 'Keep line' }))

    // Assert
    await waitFor(() => {
      expect(noteField).toHaveValue('next')
    })
    expect(
      parseLocalCompletions(
        localStorage.getItem(LOCAL_COMPLETIONS_STORAGE_KEY),
      ).map((item) => item.title),
    ).toEqual(['ship it'])
  })

  it('hides the Keep line button for mouse and trackpad users', async () => {
    // Arrange / Act
    renderEditor()
    await waitForLiveEditorReady(
      await screen.findByRole<HTMLTextAreaElement>('textbox'),
    )

    // Assert
    expect(
      screen.queryByRole('button', { name: 'Keep line' }),
    ).not.toBeInTheDocument()
  })

  it('keeps the panel chrome and skips the web frame inside the Electron panel', async () => {
    // Arrange
    liveEditorEnvironmentRef.current = true
    clerkUserRef.current = {
      isLoaded: true,
      isSignedIn: true,
      user: { id: 'user_1' },
    }
    installLiveEditorAPI({
      getVisibleOnAllWorkspaces: vi.fn().mockResolvedValue(false),
      setVisibleOnAllWorkspaces: vi.fn().mockResolvedValue(true),
    })

    // Act
    renderEditor()
    await waitForLiveEditorReady(
      await screen.findByRole<HTMLTextAreaElement>('textbox'),
    )

    // Assert
    expect(screen.getByText('Follow Spaces')).toBeInTheDocument()
    expect(screen.getByText('Follow FloatingNav')).toBeInTheDocument()
    expect(screen.queryByText('CoreLive')).not.toBeInTheDocument()
    expect(
      screen.queryByText('Keeps go to your account.'),
    ).not.toBeInTheDocument()
    expect(
      screen.queryByRole('link', { name: 'Sign in' }),
    ).not.toBeInTheDocument()
  })
})

describe('LiveEditor Spaces tracking switch', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('reflects the saved Mac desktop tracking setting in the header switch', async () => {
    // Arrange
    const getVisibleOnAllWorkspaces = vi.fn().mockResolvedValue(true)
    const setVisibleOnAllWorkspaces = vi.fn().mockResolvedValue(true)
    installLiveEditorAPI({
      getVisibleOnAllWorkspaces,
      setVisibleOnAllWorkspaces,
    })

    // Act
    renderEditor()
    const spacesSwitch = screen.getByRole('switch', {
      name: 'Show LiveEditor on all Mac desktops',
    })

    // Assert
    expect(screen.getByText('Follow Spaces')).toBeInTheDocument()
    await waitFor(() => {
      expect(spacesSwitch).toBeChecked()
    })
  })

  it('persists the header switch change through the LiveEditor preload bridge', async () => {
    // Arrange
    const getVisibleOnAllWorkspaces = vi.fn().mockResolvedValue(true)
    const setVisibleOnAllWorkspaces = vi.fn().mockResolvedValue(false)
    installLiveEditorAPI({
      getVisibleOnAllWorkspaces,
      setVisibleOnAllWorkspaces,
    })
    const user = userEvent.setup()
    renderEditor()
    const spacesSwitch = screen.getByRole('switch', {
      name: 'Show LiveEditor on all Mac desktops',
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
    installLiveEditorAPI({
      getVisibleOnAllWorkspaces,
      setVisibleOnAllWorkspaces,
    })
    const user = userEvent.setup()
    renderEditor()
    const spacesSwitch = screen.getByRole('switch', {
      name: 'Show LiveEditor on all Mac desktops',
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
    installLiveEditorAPI({
      getVisibleOnAllWorkspaces,
      setVisibleOnAllWorkspaces,
    })
    renderEditor()
    const spacesSwitch = screen.getByRole('switch', {
      name: 'Show LiveEditor on all Mac desktops',
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

describe('LiveEditor text styling settings', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('renders the note in the saved font family, size, and color', async () => {
    // Arrange
    const getVisibleOnAllWorkspaces = vi.fn().mockResolvedValue(false)
    const setVisibleOnAllWorkspaces = vi.fn().mockResolvedValue(true)
    installLiveEditorAPI({
      getVisibleOnAllWorkspaces,
      setVisibleOnAllWorkspaces,
    })

    // Act — open the editor with serif / 20px / amber text saved in settings.
    // findByRole settles the editor's async mount effects under act() before asserting.
    renderEditor({
      liveEditorFontFamily: 'serif',
      liveEditorFontSize: 20,
      liveEditorTextColor: 'var(--primary)',
    })
    const noteField = await screen.findByRole('textbox')

    // Assert — the saved face is a stock Tailwind utility on the writing
    // surface; size and color are applied inline.
    expect(noteField).toHaveClass('font-serif')
    expect(noteField.style.fontSize).toBe('20px')
    expect(noteField.style.color).toBe('var(--primary)')
  })

  it('falls back to the default look (sans / 16px) when no setting is saved', async () => {
    // Arrange
    const getVisibleOnAllWorkspaces = vi.fn().mockResolvedValue(false)
    const setVisibleOnAllWorkspaces = vi.fn().mockResolvedValue(true)
    installLiveEditorAPI({
      getVisibleOnAllWorkspaces,
      setVisibleOnAllWorkspaces,
    })

    // Act — a fresh install reads the slice defaults.
    renderEditor()
    const noteField = await screen.findByRole('textbox')

    // Assert — the default sans at 16px: the DESIGN.md Body tier, and the size
    // iOS Safari needs to leave a focused input alone instead of zooming into it.
    expect(noteField).toHaveClass('font-sans')
    expect(noteField.style.fontSize).toBe('16px')
  })
})

describe('LiveEditor writing surface', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('keeps the surface calm by disabling the native red spellcheck underlines', async () => {
    // Arrange
    const getVisibleOnAllWorkspaces = vi.fn().mockResolvedValue(false)
    const setVisibleOnAllWorkspaces = vi.fn().mockResolvedValue(true)
    installLiveEditorAPI({
      getVisibleOnAllWorkspaces,
      setVisibleOnAllWorkspaces,
    })

    // Act — open the LiveEditor writing surface.
    renderEditor()
    const noteField = await screen.findByRole('textbox')

    // Assert — the textarea opts out of the browser spellchecker, so misspelled,
    // unfinished, or mixed-language fragments never get red correction underlines.
    // Regression guard for #128: a refactor that drops this re-enables the noise.
    expect(noteField.getAttribute('spellcheck')).toBe('false')
  })
})

describe('LiveEditor note persistence during reload', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    selectedCategoryRef.current = 1
  })

  it('does not read or write the temporary floating category before LiveEditor config finishes loading', async () => {
    // Arrange
    installLiveEditorAPI({
      getVisibleOnAllWorkspaces: vi.fn().mockResolvedValue(false),
      setVisibleOnAllWorkspaces: vi.fn().mockResolvedValue(true),
    })
    const api = window.liveEditorAPI
    if (!api) throw new Error('liveEditorAPI was not installed')
    api.sync.getEnabled = vi.fn(
      async () => new Promise<boolean>(() => undefined),
    )
    api.category.getLast = vi.fn().mockResolvedValue(12)
    api.note.get = vi.fn().mockResolvedValue('should not load yet')
    const noteSet = vi.mocked(api.note.set)

    // Act
    renderEditor()
    await act(async () => {
      await Promise.resolve()
    })

    // Assert
    expect(screen.getByRole('textbox')).toBeDisabled()
    expect(api.note.get).not.toHaveBeenCalled()
    expect(noteSet).not.toHaveBeenCalled()
  })

  it('loads only the saved local LiveEditor category after config disables FloatingNav sync', async () => {
    // Arrange
    installLiveEditorAPI({
      getVisibleOnAllWorkspaces: vi.fn().mockResolvedValue(false),
      setVisibleOnAllWorkspaces: vi.fn().mockResolvedValue(true),
    })
    const api = window.liveEditorAPI
    if (!api) throw new Error('liveEditorAPI was not installed')
    api.sync.getEnabled = vi.fn().mockResolvedValue(false)
    api.category.getLast = vi.fn().mockResolvedValue(12)
    api.note.get = vi.fn(async (categoryId: number) =>
      categoryId === 12 ? 'local Corelive note' : 'temporary floating note',
    )
    const noteSet = vi.mocked(api.note.set)

    // Act
    renderEditorWithCategories(categoriesWithCorelive)
    const noteField = await screen.findByRole<HTMLTextAreaElement>('textbox')

    // Assert
    await waitFor(() => {
      expect(noteField).toHaveValue('local Corelive note')
    })
    expect(api.note.get).toHaveBeenCalledWith(12)
    expect(api.note.get).not.toHaveBeenCalledWith(1)
    expect(noteSet).not.toHaveBeenCalled()
  })

  it('does not flush a clean loaded note when the active category changes', async () => {
    // Arrange
    installLiveEditorAPI({
      getVisibleOnAllWorkspaces: vi.fn().mockResolvedValue(false),
      setVisibleOnAllWorkspaces: vi.fn().mockResolvedValue(true),
    })
    const api = window.liveEditorAPI
    if (!api) throw new Error('liveEditorAPI was not installed')
    api.note.get = vi.fn(async (categoryId: number) =>
      categoryId === 1 ? 'keep category one' : 'work category twelve',
    )
    const noteSet = vi.mocked(api.note.set)
    const store = configureStore({
      reducer: { settings: userSettingsReducer },
      preloadedState: {
        settings: { ...userSettingsInitialState },
      },
    })

    // Act
    const { rerender } = render(
      <Provider store={store}>
        <LiveEditor categories={categoriesWithCorelive} />
      </Provider>,
    )
    const noteField = await screen.findByRole<HTMLTextAreaElement>('textbox')
    await waitFor(() => {
      expect(noteField).toHaveValue('keep category one')
    })
    noteSet.mockClear()
    selectedCategoryRef.current = 12
    rerender(
      <Provider store={store}>
        <LiveEditor categories={categoriesWithCorelive} />
      </Provider>,
    )

    // Assert
    await waitFor(() => {
      expect(noteField).toHaveValue('work category twelve')
    })
    expect(noteSet).not.toHaveBeenCalledWith(1, '')
    expect(noteSet).not.toHaveBeenCalled()
  })

  it('persists an intentional full clear after the loaded category note is editable', async () => {
    // Arrange
    installLiveEditorAPI({
      getVisibleOnAllWorkspaces: vi.fn().mockResolvedValue(false),
      setVisibleOnAllWorkspaces: vi.fn().mockResolvedValue(true),
    })
    const api = window.liveEditorAPI
    if (!api) throw new Error('liveEditorAPI was not installed')
    api.note.get = vi.fn().mockResolvedValue('keep me until the user clears it')
    const noteSet = vi.mocked(api.note.set)
    const user = userEvent.setup()

    // Act
    renderEditor()
    const noteField = await screen.findByRole<HTMLTextAreaElement>('textbox')
    await waitFor(() => {
      expect(noteField).toHaveValue('keep me until the user clears it')
      expect(noteField).toBeEnabled()
    })
    await user.clear(noteField)

    // Assert
    await waitFor(
      () => {
        expect(noteSet).toHaveBeenCalledWith(1, '')
      },
      { timeout: 1200 },
    )
  })

  it('keeps the existing category note on disk when LiveEditor reloads before the note finishes loading', async () => {
    // Arrange
    installLiveEditorAPI({
      getVisibleOnAllWorkspaces: vi.fn().mockResolvedValue(false),
      setVisibleOnAllWorkspaces: vi.fn().mockResolvedValue(true),
    })
    const api = window.liveEditorAPI
    if (!api) throw new Error('liveEditorAPI was not installed')
    api.note.get = vi.fn(async () => new Promise<string>(() => undefined))
    const noteSet = vi.mocked(api.note.set)

    // Act
    const { unmount } = renderEditor()
    await waitFor(() => {
      expect(api.note.get).toHaveBeenCalledWith(1)
    })
    unmount()

    // Assert
    expect(noteSet).not.toHaveBeenCalledWith(1, '')
    expect(noteSet).not.toHaveBeenCalled()
  })

  it('blocks editing while the existing category note is still loading', async () => {
    // Arrange
    installLiveEditorAPI({
      getVisibleOnAllWorkspaces: vi.fn().mockResolvedValue(false),
      setVisibleOnAllWorkspaces: vi.fn().mockResolvedValue(true),
    })
    const api = window.liveEditorAPI
    if (!api) throw new Error('liveEditorAPI was not installed')
    api.note.get = vi.fn(async () => new Promise<string>(() => undefined))
    const noteSet = vi.mocked(api.note.set)
    const user = userEvent.setup()

    // Act
    renderEditor()
    const noteField = await screen.findByRole<HTMLTextAreaElement>('textbox')
    await waitFor(() => {
      expect(api.note.get).toHaveBeenCalledWith(1)
    })
    await user.type(noteField, 'do not save during load')
    await new Promise((resolve) => setTimeout(resolve, 500))

    // Assert
    expect(noteField).toBeDisabled()
    expect(noteField).toHaveValue('')
    expect(noteSet).not.toHaveBeenCalled()
  })

  it('keeps the existing category note on disk when loading that note fails', async () => {
    // Arrange
    installLiveEditorAPI({
      getVisibleOnAllWorkspaces: vi.fn().mockResolvedValue(false),
      setVisibleOnAllWorkspaces: vi.fn().mockResolvedValue(true),
    })
    const api = window.liveEditorAPI
    if (!api) throw new Error('liveEditorAPI was not installed')
    api.note.get = vi
      .fn()
      .mockRejectedValue(new Error('temporary disk read error'))
    const noteSet = vi.mocked(api.note.set)

    // Act
    renderEditor()
    await waitFor(() => {
      expect(toast.error).toHaveBeenCalledWith(
        'Failed to load note for this category',
      )
    })
    await new Promise((resolve) => setTimeout(resolve, 500))

    // Assert
    expect(noteSet).not.toHaveBeenCalledWith(1, '')
    expect(noteSet).not.toHaveBeenCalled()
  })

  it('persists a new user edit after the existing category note fails to load', async () => {
    // Arrange
    installLiveEditorAPI({
      getVisibleOnAllWorkspaces: vi.fn().mockResolvedValue(false),
      setVisibleOnAllWorkspaces: vi.fn().mockResolvedValue(true),
    })
    const api = window.liveEditorAPI
    if (!api) throw new Error('liveEditorAPI was not installed')
    api.note.get = vi
      .fn()
      .mockRejectedValue(new Error('temporary disk read error'))
    const noteSet = vi.mocked(api.note.set)
    const user = userEvent.setup()

    // Act
    renderEditor()
    const noteField = await screen.findByRole<HTMLTextAreaElement>('textbox')
    await waitFor(() => {
      expect(toast.error).toHaveBeenCalledWith(
        'Failed to load note for this category',
      )
    })
    expect(noteField).toBeEnabled()
    await user.type(noteField, 'fresh rescue note')

    // Assert
    await waitFor(() => {
      expect(noteSet).toHaveBeenCalledWith(1, 'fresh rescue note')
    })
  })
})

describe('LiveEditor focus on window show', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('focuses the note editor when the LiveEditor window first opens, so a quick capture can start typing right away', async () => {
    // Arrange — open the editor with an active category, so the note field is enabled.
    const getVisibleOnAllWorkspaces = vi.fn().mockResolvedValue(false)
    const setVisibleOnAllWorkspaces = vi.fn().mockResolvedValue(true)
    installLiveEditorAPI({
      getVisibleOnAllWorkspaces,
      setVisibleOnAllWorkspaces,
    })

    // Act — findByRole settles the mount effects (including the focus effect) under act().
    renderEditor()
    const noteField = await screen.findByRole<HTMLTextAreaElement>('textbox')

    // Assert — keyboard focus lands in the editor, not on a header control.
    await waitFor(() => {
      expect(noteField).toBeEnabled()
      expect(noteField).toHaveFocus()
    })
  })

  it('returns focus to the note editor when the window is shown again, instead of leaving it on the Follow Spaces switch', async () => {
    // Arrange — editor open with an active category; reproduce the reported bug's
    // starting point by parking focus on the first focusable header control.
    const getVisibleOnAllWorkspaces = vi.fn().mockResolvedValue(false)
    const setVisibleOnAllWorkspaces = vi.fn().mockResolvedValue(true)
    installLiveEditorAPI({
      getVisibleOnAllWorkspaces,
      setVisibleOnAllWorkspaces,
    })
    renderEditor()
    const noteField = await screen.findByRole<HTMLTextAreaElement>('textbox')
    await waitFor(() => {
      expect(noteField).toBeEnabled()
    })
    const spacesSwitch = screen.getByRole('switch', {
      name: 'Show LiveEditor on all Mac desktops',
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
    await waitFor(() => {
      expect(noteField).toHaveFocus()
    })
  })
})

/**
 * Types `value` into the note field, parks the caret at the end of the first
 * line, and fires the Cmd+Enter complete command. Shared mechanical setup so
 * each spec keeps its expected create args / textarea value hard-coded inline.
 * @param noteField - The LiveEditor textarea.
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

/**
 * Replaces one textarea range as a single paste-like edit so row tracking sees the exact splice.
 * @param noteField - The LiveEditor textarea.
 * @param start - Inclusive selection start before the edit.
 * @param end - Exclusive selection end before the edit.
 * @param value - Full textarea value after the edit.
 * @returns Nothing; emits the keyboard prelude and controlled change used by the renderer.
 * @example
 * replaceTextareaRange(noteField, 0, 0, 'new\nold')
 */
function replaceTextareaRange(
  noteField: HTMLTextAreaElement,
  start: number,
  end: number,
  value: string,
): void {
  const previousValue = noteField.value
  const insertedLength = value.length - (previousValue.length - (end - start))
  const insertedText =
    insertedLength >= 0 ? value.slice(start, start + insertedLength) : null
  noteField.selectionStart = start
  noteField.selectionEnd = end
  fireEvent.keyDown(noteField, { key: 'v', metaKey: true })
  fireEvent(
    noteField,
    new InputEvent('beforeinput', {
      bubbles: true,
      cancelable: true,
      data: insertedText,
      inputType: 'insertFromPaste',
    }),
  )
  fireEvent.change(noteField, { target: { value } })
}

/**
 * Waits for the config/note boot load to finish before tests type into LiveEditor.
 * @param noteField - The LiveEditor textarea rendered by the test.
 * @returns A promise that resolves once user input is accepted.
 * @example
 * await waitForLiveEditorReady(noteField)
 */
async function waitForLiveEditorReady(noteField: HTMLTextAreaElement) {
  await waitFor(() => {
    expect(noteField).toBeEnabled()
  })
}

describe('LiveEditor complete command', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    completedMutateAsync.mockResolvedValue({ id: 1 })
    selectedCategoryRef.current = 1
  })

  it('completes a plain prose line into a Completed row on Cmd+Enter', async () => {
    // Arrange — an editor with a category, holding one ordinary (non-checkbox) line.
    const getVisibleOnAllWorkspaces = vi.fn().mockResolvedValue(false)
    const setVisibleOnAllWorkspaces = vi.fn().mockResolvedValue(true)
    installLiveEditorAPI({
      getVisibleOnAllWorkspaces,
      setVisibleOnAllWorkspaces,
    })
    renderEditor()
    const noteField = await screen.findByRole<HTMLTextAreaElement>('textbox')
    await waitForLiveEditorReady(noteField)

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
    installLiveEditorAPI({
      getVisibleOnAllWorkspaces,
      setVisibleOnAllWorkspaces,
    })
    renderEditor()
    const noteField = await screen.findByRole<HTMLTextAreaElement>('textbox')
    await waitForLiveEditorReady(noteField)

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

  it('completes an already checked checkbox line instead of unchecking it on Cmd+Enter', async () => {
    // Arrange — a user manually checked the task before invoking the complete command.
    const getVisibleOnAllWorkspaces = vi.fn().mockResolvedValue(false)
    const setVisibleOnAllWorkspaces = vi.fn().mockResolvedValue(true)
    installLiveEditorAPI({
      getVisibleOnAllWorkspaces,
      setVisibleOnAllWorkspaces,
    })
    renderEditor()
    const noteField = await screen.findByRole<HTMLTextAreaElement>('textbox')
    await waitForLiveEditorReady(noteField)

    // Act — complete the line while its markdown checkbox is already checked.
    fireCompleteCommandOnFirstLine(noteField, '- [x] FooTask')

    // Assert — the win is recorded and the user's checked marker stays intact.
    expect(completedMutateAsync).toHaveBeenCalledWith({
      categoryId: 1,
      title: 'FooTask',
    })
    await waitFor(() => {
      expect(noteField).toHaveValue('- [x] FooTask')
    })
  })

  it('records an already checked checkbox line only once across repeated Cmd+Enter commands', async () => {
    // Arrange — keep the first Completed request pending so a rapid repeat exercises the in-flight guard.
    let resolveCreate!: (value: { id: number }) => void
    const pendingCreate = new Promise<{ id: number }>((resolve) => {
      resolveCreate = resolve
    })
    completedMutateAsync.mockReturnValueOnce(pendingCreate)
    const getVisibleOnAllWorkspaces = vi.fn().mockResolvedValue(false)
    const setVisibleOnAllWorkspaces = vi.fn().mockResolvedValue(true)
    installLiveEditorAPI({
      getVisibleOnAllWorkspaces,
      setVisibleOnAllWorkspaces,
    })
    renderEditor()
    const noteField = await screen.findByRole<HTMLTextAreaElement>('textbox')
    await waitForLiveEditorReady(noteField)

    // Act — invoke completion twice while the first request is still pending.
    fireCompleteCommandOnFirstLine(noteField, '- [x] FooTask')
    fireCompleteCommandOnFirstLine(noteField, '- [x] FooTask')

    // Assert — rapid repetition creates one Completed row.
    expect(completedMutateAsync).toHaveBeenCalledTimes(1)

    await act(async () => {
      resolveCreate({ id: 1 })
      await pendingCreate
    })

    // Act — invoke completion again after the first request succeeds.
    fireCompleteCommandOnFirstLine(noteField, '- [x] FooTask')

    // Assert — a recorded line remains idempotent until its text changes or it is undone.
    expect(completedMutateAsync).toHaveBeenCalledTimes(1)
  })

  it('records a checked task only once after earlier lines shift it during creation', async () => {
    // Arrange — keep the create pending while an edit above moves the tracked task.
    let resolveCreate!: (value: { id: number }) => void
    const pendingCreate = new Promise<{ id: number }>((resolve) => {
      resolveCreate = resolve
    })
    completedMutateAsync.mockReturnValueOnce(pendingCreate)
    installLiveEditorAPI({
      getVisibleOnAllWorkspaces: vi.fn().mockResolvedValue(false),
      setVisibleOnAllWorkspaces: vi.fn().mockResolvedValue(true),
    })
    renderEditor()
    const noteField = await screen.findByRole<HTMLTextAreaElement>('textbox')
    await waitForLiveEditorReady(noteField)
    const originalText = 'header\n- [x] FooTask'
    fireEvent.change(noteField, { target: { value: originalText } })
    noteField.selectionStart = originalText.length
    noteField.selectionEnd = originalText.length
    fireEvent.keyDown(noteField, { key: 'Enter', metaKey: true })

    // Act — insert two earlier lines, then repeat completion on the shifted task.
    const shiftedText = 'urgent\nheader\n- [x] FooTask'
    fireEvent.change(noteField, { target: { value: shiftedText } })
    noteField.selectionStart = shiftedText.length
    noteField.selectionEnd = shiftedText.length
    fireEvent.keyDown(noteField, { key: 'Enter', metaKey: true })

    // Assert — the in-flight task identity follows its row instead of creating again.
    expect(completedMutateAsync).toHaveBeenCalledTimes(1)
    await act(async () => {
      resolveCreate({ id: 1 })
      await pendingCreate
    })
  })

  it('undoes the original checked task after an identical row is inserted immediately before it', async () => {
    // Arrange — record the second row and retain its optimistic Undo action.
    installLiveEditorAPI({
      getVisibleOnAllWorkspaces: vi.fn().mockResolvedValue(false),
      setVisibleOnAllWorkspaces: vi.fn().mockResolvedValue(true),
    })
    renderEditor()
    const noteField = await screen.findByRole<HTMLTextAreaElement>('textbox')
    await waitForLiveEditorReady(noteField)
    const originalText = 'header\n- [x] FooTask'
    fireEvent.change(noteField, { target: { value: originalText } })
    noteField.selectionStart = originalText.length
    noteField.selectionEnd = originalText.length
    fireEvent.keyDown(noteField, { key: 'Enter', metaKey: true })
    await waitFor(() => {
      expect(toast.success).toHaveBeenCalledTimes(1)
    })
    const undoAction = vi.mocked(toast.success).mock.calls.at(-1)?.[1]
      ?.action as { onClick: () => void } | undefined

    // Act — paste an identical row at the tracked row's start, then Undo.
    replaceTextareaRange(
      noteField,
      'header\n'.length,
      'header\n'.length,
      'header\n- [x] FooTask\n- [x] FooTask',
    )
    await act(async () => {
      undoAction?.onClick()
    })

    // Assert — the inserted duplicate stays checked; only the original row is undone.
    await waitFor(() => {
      expect(noteField).toHaveValue('header\n- [x] FooTask\n- [ ] FooTask')
    })
  })

  it('does not undo or delete a completion after removing the separator before its tracked row', async () => {
    // Arrange — keep creation pending while the tracked checkbox still has its own line.
    let resolveCreate!: (value: { id: number }) => void
    const pendingCreate = new Promise<{ id: number }>((resolve) => {
      resolveCreate = resolve
    })
    completedMutateAsync.mockReturnValueOnce(pendingCreate)
    installLiveEditorAPI({
      getVisibleOnAllWorkspaces: vi.fn().mockResolvedValue(false),
      setVisibleOnAllWorkspaces: vi.fn().mockResolvedValue(true),
    })
    renderEditor()
    const noteField = await screen.findByRole<HTMLTextAreaElement>('textbox')
    await waitForLiveEditorReady(noteField)
    const originalText = 'header\n- [x] FooTask'
    fireEvent.change(noteField, { target: { value: originalText } })
    noteField.selectionStart = originalText.length
    noteField.selectionEnd = originalText.length
    fireEvent.keyDown(noteField, { key: 'Enter', metaKey: true })

    // Act — remove the row separator, finish creation, then invoke its stale Undo.
    replaceTextareaRange(
      noteField,
      'header'.length,
      'header\n'.length,
      'header- [x] FooTask',
    )
    await act(async () => {
      resolveCreate({ id: 1 })
      await pendingCreate
    })
    await waitFor(() => {
      expect(toast.success).toHaveBeenCalledTimes(1)
    })
    const undoAction = vi.mocked(toast.success).mock.calls.at(-1)?.[1]
      ?.action as { onClick: () => void } | undefined
    expect(undoAction).toBeDefined()
    if (!undoAction) throw new Error('Undo action was not registered')
    await act(async () => {
      undoAction.onClick()
    })

    // Assert — a merged, non-checkbox row is not a safe Undo target, so nothing is deleted.
    expect(noteField).toHaveValue('header- [x] FooTask')
    expect(deleteCompletedMutateAsync).not.toHaveBeenCalled()
  })

  it('does not use another checked row with the same title after tracked identity is lost', async () => {
    // Arrange — record one checked task and retain its Undo action.
    installLiveEditorAPI({
      getVisibleOnAllWorkspaces: vi.fn().mockResolvedValue(false),
      setVisibleOnAllWorkspaces: vi.fn().mockResolvedValue(true),
    })
    renderEditor()
    const noteField = await screen.findByRole<HTMLTextAreaElement>('textbox')
    await waitForLiveEditorReady(noteField)
    const originalText = 'header\n- [x] FooTask'
    fireEvent.change(noteField, { target: { value: originalText } })
    noteField.selectionStart = originalText.length
    noteField.selectionEnd = originalText.length
    fireEvent.keyDown(noteField, { key: 'Enter', metaKey: true })
    await waitFor(() => {
      expect(toast.success).toHaveBeenCalledTimes(1)
    })
    const undoAction = vi.mocked(toast.success).mock.calls.at(-1)?.[1]
      ?.action as { onClick: () => void } | undefined

    // Act — replace the tracked row and introduce a same-title checkbox elsewhere.
    const ambiguousText = '- [x] FooTask\nheader\n- [x] Renamed'
    replaceTextareaRange(noteField, 0, originalText.length, ambiguousText)
    await act(async () => {
      undoAction?.onClick()
    })

    // Assert — unsafe title lookup cannot uncheck the other row or delete the original record.
    expect(noteField).toHaveValue(ambiguousText)
    expect(deleteCompletedMutateAsync).not.toHaveBeenCalled()
  })

  it('keeps an already checked checkbox line checked when completion recording fails', async () => {
    // Arrange — a manually checked task whose Completed create will fail.
    completedMutateAsync.mockRejectedValueOnce(new Error('network down'))
    const getVisibleOnAllWorkspaces = vi.fn().mockResolvedValue(false)
    const setVisibleOnAllWorkspaces = vi.fn().mockResolvedValue(true)
    installLiveEditorAPI({
      getVisibleOnAllWorkspaces,
      setVisibleOnAllWorkspaces,
    })
    renderEditor()
    const noteField = await screen.findByRole<HTMLTextAreaElement>('textbox')
    await waitForLiveEditorReady(noteField)

    // Act — try to record the already checked task as Completed.
    fireCompleteCommandOnFirstLine(noteField, '- [x] FooTask')

    // Assert — failure does not erase the check the user added manually.
    await waitFor(() => {
      expect(noteField).toHaveValue('- [x] FooTask')
    })
    expect(completedMutateAsync).toHaveBeenCalledWith({
      categoryId: 1,
      title: 'FooTask',
    })
  })

  it('toggles the nested checkbox line at the caret into a Completed row on Cmd+Enter', async () => {
    // Arrange — a parent task with one indented child checkbox under it.
    const getVisibleOnAllWorkspaces = vi.fn().mockResolvedValue(false)
    const setVisibleOnAllWorkspaces = vi.fn().mockResolvedValue(true)
    installLiveEditorAPI({
      getVisibleOnAllWorkspaces,
      setVisibleOnAllWorkspaces,
    })
    renderEditor()
    const noteField = await screen.findByRole<HTMLTextAreaElement>('textbox')
    await waitForLiveEditorReady(noteField)
    const value = ['- [ ] parent task', '  - [ ] nested task'].join('\n')
    fireEvent.change(noteField, { target: { value } })
    noteField.selectionStart = value.length
    noteField.selectionEnd = value.length

    // Act — complete only the nested caret line.
    fireEvent.keyDown(noteField, { key: 'Enter', metaKey: true })

    // Assert — the parent stays untouched, and only the child is recorded.
    expect(completedMutateAsync).toHaveBeenCalledWith({
      categoryId: 1,
      title: 'nested task',
    })
    await waitFor(() => {
      expect(noteField).toHaveValue(
        ['- [ ] parent task', '  - [x] nested task'].join('\n'),
      )
    })
  })

  it('restores the original plain prose when the completion create fails', async () => {
    // Arrange — the create mutation rejects for this completion.
    completedMutateAsync.mockRejectedValueOnce(new Error('network down'))
    const getVisibleOnAllWorkspaces = vi.fn().mockResolvedValue(false)
    const setVisibleOnAllWorkspaces = vi.fn().mockResolvedValue(true)
    installLiveEditorAPI({
      getVisibleOnAllWorkspaces,
      setVisibleOnAllWorkspaces,
    })
    renderEditor()
    const noteField = await screen.findByRole<HTMLTextAreaElement>('textbox')
    await waitForLiveEditorReady(noteField)

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
    installLiveEditorAPI({
      getVisibleOnAllWorkspaces,
      setVisibleOnAllWorkspaces,
    })
    renderEditor()
    const noteField = await screen.findByRole<HTMLTextAreaElement>('textbox')
    await waitForLiveEditorReady(noteField)

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

  it('restores the exact failed row when an earlier checked row has the same title', async () => {
    // Arrange — hold a plain second row's create while an identical checked title sits above it.
    let rejectCreate!: (reason: Error) => void
    const pendingCreate = new Promise<{ id: number }>((_resolve, reject) => {
      rejectCreate = reject
    })
    completedMutateAsync.mockReturnValueOnce(pendingCreate)
    installLiveEditorAPI({
      getVisibleOnAllWorkspaces: vi.fn().mockResolvedValue(false),
      setVisibleOnAllWorkspaces: vi.fn().mockResolvedValue(true),
    })
    renderEditor()
    const noteField = await screen.findByRole<HTMLTextAreaElement>('textbox')
    await waitForLiveEditorReady(noteField)
    const originalText = '- [x] FooTask\nFooTask'
    fireEvent.change(noteField, { target: { value: originalText } })
    noteField.selectionStart = originalText.length
    noteField.selectionEnd = originalText.length

    // Act — promote the second row, then reject its background create.
    fireEvent.keyDown(noteField, { key: 'Enter', metaKey: true })
    await act(async () => {
      rejectCreate(new Error('network down'))
    })

    // Assert — the first checked sibling is untouched and only the second row rolls back.
    expect(noteField).toHaveValue('- [x] FooTask\nFooTask')
  })

  it('keeps a failed keep-visible rollback retryable after switching categories', async () => {
    // Arrange — hold create pending while category 1's checked row switches off-screen.
    let rejectCreate: (reason: Error) => void = () => undefined
    const pendingCreate = new Promise<{ id: number }>((_resolve, reject) => {
      rejectCreate = reject
    })
    completedMutateAsync.mockReturnValueOnce(pendingCreate)
    installLiveEditorAPI({
      getVisibleOnAllWorkspaces: vi.fn().mockResolvedValue(false),
      setVisibleOnAllWorkspaces: vi.fn().mockResolvedValue(true),
    })
    const api = window.liveEditorAPI
    if (!api) throw new Error('liveEditorAPI was not installed')
    api.note.get = vi.fn(async (id: number) =>
      id === 1 ? '- [x] buy milk\nkeep me' : '',
    )
    const noteSet = vi.mocked(api.note.set)
    const store = configureStore({
      reducer: { settings: userSettingsReducer },
      preloadedState: { settings: userSettingsInitialState },
    })
    const [generalCategory] = categories
    if (!generalCategory)
      throw new Error('expected the seeded General category')
    const twoCategories: CategoryWithCount[] = [
      generalCategory,
      { ...generalCategory, id: 2, name: 'Work', isDefault: false },
    ]
    const tree = (): ReactElement => (
      <Provider store={store}>
        <LiveEditor categories={twoCategories} />
      </Provider>
    )
    const { rerender } = render(tree())
    const noteField = await screen.findByRole<HTMLTextAreaElement>('textbox')
    await waitForLiveEditorReady(noteField)
    fireCompleteCommandOnFirstLine(noteField, '- [ ] buy milk\nkeep me')
    selectedCategoryRef.current = 2
    rerender(tree())
    await waitFor(() => {
      expect(noteField).toHaveValue('')
    })
    noteSet.mockClear()
    noteSet.mockRejectedValueOnce(new Error('disk full'))

    // Act — create and the first origin-note rollback both fail.
    await act(async () => {
      rejectCreate(new Error('network down'))
      await pendingCreate.catch(() => undefined)
    })

    // Assert — rollback targets category 1 and exposes an explicit Retry action.
    await waitFor(() => {
      expect(noteSet).toHaveBeenNthCalledWith(1, 1, '- [ ] buy milk\nkeep me')
    })
    const retryAction = vi.mocked(toast.error).mock.calls.at(-1)?.[1]
      ?.action as { onClick: () => void } | undefined
    expect(retryAction).toBeDefined()
    if (!retryAction) throw new Error('Retry action was not registered')

    // Act — storage recovers and the retained failure state retries the rollback.
    noteSet.mockResolvedValue(undefined)
    act(() => {
      retryAction.onClick()
    })

    // Assert — both writes stay in category 1 and no duplicate create is started.
    await waitFor(() => {
      expect(noteSet).toHaveBeenCalledTimes(2)
    })
    expect(noteSet).toHaveBeenNthCalledWith(2, 1, '- [ ] buy milk\nkeep me')
    expect(completedMutateAsync).toHaveBeenCalledTimes(1)
    expect(noteField).toHaveValue('')
  })

  it('keeps an undone line visible while a failed Completed delete retries', async () => {
    // Arrange — complete one checkbox and make the first server delete fail.
    installLiveEditorAPI({
      getVisibleOnAllWorkspaces: vi.fn().mockResolvedValue(false),
      setVisibleOnAllWorkspaces: vi.fn().mockResolvedValue(true),
    })
    renderEditor()
    const noteField = await screen.findByRole<HTMLTextAreaElement>('textbox')
    await waitForLiveEditorReady(noteField)
    fireCompleteCommandOnFirstLine(noteField, '- [ ] buy milk')
    await waitFor(() => {
      expect(toast.success).toHaveBeenCalledTimes(1)
    })
    deleteCompletedMutateAsync.mockRejectedValueOnce(new Error('delete down'))
    const undoAction = vi.mocked(toast.success).mock.calls.at(-1)?.[1]
      ?.action as { onClick: () => void } | undefined
    expect(undoAction).toBeDefined()
    if (!undoAction) throw new Error('Undo action was not registered')

    // Act — Undo restores the note, but its first delete fails.
    act(() => {
      undoAction.onClick()
    })

    // Assert — the note stays undone and the error offers a dedicated Retry.
    await waitFor(() => {
      expect(noteField).toHaveValue('- [ ] buy milk')
      expect(deleteCompletedMutateAsync).toHaveBeenCalledTimes(1)
    })
    const retryAction = vi.mocked(toast.error).mock.calls.at(-1)?.[1]
      ?.action as { onClick: () => void } | undefined
    expect(retryAction).toBeDefined()
    if (!retryAction) throw new Error('Retry action was not registered')

    // Act — retry after the server recovers.
    deleteCompletedMutateAsync.mockResolvedValue(undefined)
    act(() => {
      retryAction.onClick()
    })

    // Assert — deletion succeeds on retry without re-checking the note.
    await waitFor(() => {
      expect(deleteCompletedMutateAsync).toHaveBeenCalledTimes(2)
    })
    expect(noteField).toHaveValue('- [ ] buy milk')
  })

  it('records a pre-checked row only once after switching categories and back', async () => {
    // Arrange — category 1 always reloads the same checked row; category 2 is empty.
    installLiveEditorAPI({
      getVisibleOnAllWorkspaces: vi.fn().mockResolvedValue(false),
      setVisibleOnAllWorkspaces: vi.fn().mockResolvedValue(true),
    })
    const api = window.liveEditorAPI
    if (!api) throw new Error('liveEditorAPI was not installed')
    api.note.get = vi.fn(async (id: number) =>
      id === 1 ? '- [x] buy milk' : '',
    )
    const store = configureStore({
      reducer: { settings: userSettingsReducer },
      preloadedState: { settings: userSettingsInitialState },
    })
    const [generalCategory] = categories
    if (!generalCategory)
      throw new Error('expected the seeded General category')
    const twoCategories: CategoryWithCount[] = [
      generalCategory,
      { ...generalCategory, id: 2, name: 'Work', isDefault: false },
    ]
    const tree = (): ReactElement => (
      <Provider store={store}>
        <LiveEditor categories={twoCategories} />
      </Provider>
    )
    const { rerender } = render(tree())
    const noteField = await screen.findByRole<HTMLTextAreaElement>('textbox')
    await waitForLiveEditorReady(noteField)
    fireCompleteCommandOnFirstLine(noteField, '- [x] buy milk')
    await waitFor(() => {
      expect(completedMutateAsync).toHaveBeenCalledTimes(1)
    })

    // Act — leave category 1, return to its unchanged checked row, and repeat the command.
    selectedCategoryRef.current = 2
    rerender(tree())
    await waitFor(() => {
      expect(noteField).toHaveValue('')
    })
    selectedCategoryRef.current = 1
    rerender(tree())
    await waitFor(() => {
      expect(noteField).toHaveValue('- [x] buy milk')
    })
    fireCompleteCommandOnFirstLine(noteField, '- [x] buy milk')

    // Assert — category reload preserved the original completion identity.
    expect(completedMutateAsync).toHaveBeenCalledTimes(1)
  })

  it('does nothing when the caret line is blank', async () => {
    // Arrange — an editor whose caret line is whitespace only.
    const getVisibleOnAllWorkspaces = vi.fn().mockResolvedValue(false)
    const setVisibleOnAllWorkspaces = vi.fn().mockResolvedValue(true)
    installLiveEditorAPI({
      getVisibleOnAllWorkspaces,
      setVisibleOnAllWorkspaces,
    })
    renderEditor()
    const noteField = await screen.findByRole<HTMLTextAreaElement>('textbox')
    await waitForLiveEditorReady(noteField)

    // Act
    fireCompleteCommandOnFirstLine(noteField, '   ')

    // Assert — no Completed row is created for an empty line.
    expect(completedMutateAsync).not.toHaveBeenCalled()
  })
})

describe('LiveEditor clear-on-complete (instant / zero delay)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    completedMutateAsync.mockResolvedValue({ id: 1 })
    // Reset the active floating category — the cross-category spec mutates it.
    selectedCategoryRef.current = 1
  })

  it('removes a finished line the instant it completes when the clear delay is zero', async () => {
    // Arrange — the editor with clear-on-complete opted in.
    const getVisibleOnAllWorkspaces = vi.fn().mockResolvedValue(false)
    const setVisibleOnAllWorkspaces = vi.fn().mockResolvedValue(true)
    installLiveEditorAPI({
      getVisibleOnAllWorkspaces,
      setVisibleOnAllWorkspaces,
    })
    renderEditor({ liveEditorClearOnComplete: true, liveEditorClearDelayMs: 0 })
    const noteField = await screen.findByRole<HTMLTextAreaElement>('textbox')
    await waitForLiveEditorReady(noteField)

    // Act — complete the only line.
    fireCompleteCommandOnFirstLine(noteField, 'buy milk')

    // Assert — the line is gone instantly (no server round-trip, no 5 s wait),
    // and the Completed create still fired in the background.
    await waitFor(() => {
      expect(noteField).toHaveValue('')
    })
    expect(completedMutateAsync).toHaveBeenCalledWith({
      categoryId: 1,
      title: 'buy milk',
    })
  })

  it('shows the checked state once before an instant clear removes the line', async () => {
    // Arrange: instant clear should still acknowledge the completion visually
    // before the line leaves the scratchpad.
    const getVisibleOnAllWorkspaces = vi.fn().mockResolvedValue(false)
    const setVisibleOnAllWorkspaces = vi.fn().mockResolvedValue(true)
    installLiveEditorAPI({
      getVisibleOnAllWorkspaces,
      setVisibleOnAllWorkspaces,
    })
    renderEditor({ liveEditorClearOnComplete: true, liveEditorClearDelayMs: 0 })
    const noteField = await screen.findByRole<HTMLTextAreaElement>('textbox')
    await waitForLiveEditorReady(noteField)

    // Act: complete an unchecked checkbox line.
    fireCompleteCommandOnFirstLine(noteField, '- [ ] buy milk')

    // Assert: the user sees the box tick before the async clear tucks it away.
    expect(noteField).toHaveValue('- [x] buy milk')
    await waitFor(() => {
      expect(noteField).toHaveValue('')
    })
  })

  it('records and clears an already checked checkbox line when instant clear is enabled', async () => {
    // Arrange — clear-on-complete is enabled after the user checked the task manually.
    const getVisibleOnAllWorkspaces = vi.fn().mockResolvedValue(false)
    const setVisibleOnAllWorkspaces = vi.fn().mockResolvedValue(true)
    installLiveEditorAPI({
      getVisibleOnAllWorkspaces,
      setVisibleOnAllWorkspaces,
    })
    renderEditor({ liveEditorClearOnComplete: true, liveEditorClearDelayMs: 0 })
    const noteField = await screen.findByRole<HTMLTextAreaElement>('textbox')
    await waitForLiveEditorReady(noteField)

    // Act — complete the line without first removing its existing check.
    fireCompleteCommandOnFirstLine(noteField, '- [x] FooTask')

    // Assert — the win is recorded and the configured clear removes the source line.
    expect(completedMutateAsync).toHaveBeenCalledWith({
      categoryId: 1,
      title: 'FooTask',
    })
    await waitFor(() => {
      expect(noteField).toHaveValue('')
    })
  })

  it('records a shifted lingering row only once across repeated Cmd+Enter commands', async () => {
    // Arrange — keep the create pending while clear-on-complete leaves the checked row visible.
    let resolveCreate!: (value: { id: number }) => void
    const pendingCreate = new Promise<{ id: number }>((resolve) => {
      resolveCreate = resolve
    })
    completedMutateAsync.mockReturnValueOnce(pendingCreate)
    installLiveEditorAPI({
      getVisibleOnAllWorkspaces: vi.fn().mockResolvedValue(false),
      setVisibleOnAllWorkspaces: vi.fn().mockResolvedValue(true),
    })
    renderEditor({
      liveEditorClearOnComplete: true,
      liveEditorClearDelayMs: 500,
    })
    const noteField = await screen.findByRole<HTMLTextAreaElement>('textbox')
    await waitForLiveEditorReady(noteField)
    const originalText = 'header\n- [x] FooTask'
    fireEvent.change(noteField, { target: { value: originalText } })
    noteField.selectionStart = originalText.length
    noteField.selectionEnd = originalText.length
    fireEvent.keyDown(noteField, { key: 'Enter', metaKey: true })

    // Act — insert a line above, then repeat completion before the linger removes the task.
    const shiftedText = 'urgent\nheader\n- [x] FooTask'
    fireEvent.change(noteField, { target: { value: shiftedText } })
    noteField.selectionStart = shiftedText.length
    noteField.selectionEnd = shiftedText.length
    fireEvent.keyDown(noteField, { key: 'Enter', metaKey: true })

    // Assert — both clear modes share one per-row completion guard.
    expect(completedMutateAsync).toHaveBeenCalledTimes(1)
    await act(async () => {
      resolveCreate({ id: 1 })
      await pendingCreate
    })
    await waitFor(() => {
      expect(noteField).toHaveValue('urgent\nheader')
    })
  })

  it('undo re-inserts the cleared line at its original position', async () => {
    // Arrange — clear-on-complete on, two lines so the re-insert index matters.
    const getVisibleOnAllWorkspaces = vi.fn().mockResolvedValue(false)
    const setVisibleOnAllWorkspaces = vi.fn().mockResolvedValue(true)
    installLiveEditorAPI({
      getVisibleOnAllWorkspaces,
      setVisibleOnAllWorkspaces,
    })
    renderEditor({ liveEditorClearOnComplete: true, liveEditorClearDelayMs: 0 })
    const noteField = await screen.findByRole<HTMLTextAreaElement>('textbox')
    await waitForLiveEditorReady(noteField)
    const value = 'keep me\n- [ ] buy milk'
    fireEvent.change(noteField, { target: { value } })
    const caret = value.length // caret at end of the second line
    noteField.selectionStart = caret
    noteField.selectionEnd = caret
    fireEvent.keyDown(noteField, { key: 'Enter', metaKey: true })
    await waitFor(() => {
      expect(noteField).toHaveValue('keep me')
    })

    // Act — click Undo on the optimistic toast (onClick ignores its event arg).
    // sonner types `action` as `Action | ReactNode`; in this editor it's always
    // the Action object, so narrow to its no-arg onClick (our handler ignores
    // the event) before invoking.
    const undoAction = vi.mocked(toast.success).mock.calls.at(-1)?.[1]
      ?.action as { onClick: () => void } | undefined
    await act(async () => {
      undoAction?.onClick()
    })

    // Assert — the verbatim line returns at index 1, not appended at the end.
    await waitFor(() => {
      expect(noteField).toHaveValue('keep me\n- [ ] buy milk')
    })
  })

  it('undo restores a cleared task after an identical anchor row is inserted above its saved position', async () => {
    // Arrange — complete the first row and wait for its instant clear to leave one anchor row.
    installLiveEditorAPI({
      getVisibleOnAllWorkspaces: vi.fn().mockResolvedValue(false),
      setVisibleOnAllWorkspaces: vi.fn().mockResolvedValue(true),
    })
    renderEditor({ liveEditorClearOnComplete: true, liveEditorClearDelayMs: 0 })
    const noteField = await screen.findByRole<HTMLTextAreaElement>('textbox')
    await waitForLiveEditorReady(noteField)
    fireCompleteCommandOnFirstLine(noteField, '- [ ] FooTask\nkeep')
    await waitFor(() => {
      expect(noteField).toHaveValue('keep')
    })
    const undoAction = vi.mocked(toast.success).mock.calls.at(-1)?.[1]
      ?.action as { onClick: () => void } | undefined

    // Act — insert an identical anchor before the old gap while Undo remains available.
    replaceTextareaRange(noteField, 0, 0, 'keep\nkeep')
    await act(async () => {
      undoAction?.onClick()
    })

    // Assert — the cleared task returns after the new row, at its shifted saved position.
    await waitFor(() => {
      expect(noteField).toHaveValue('keep\n- [ ] FooTask\nkeep')
    })
  })

  it('undo re-inserts a cleared nested checkbox with its original indentation', async () => {
    // Arrange — clear-on-complete on, with the caret parked on an indented child.
    const getVisibleOnAllWorkspaces = vi.fn().mockResolvedValue(false)
    const setVisibleOnAllWorkspaces = vi.fn().mockResolvedValue(true)
    installLiveEditorAPI({
      getVisibleOnAllWorkspaces,
      setVisibleOnAllWorkspaces,
    })
    renderEditor({ liveEditorClearOnComplete: true, liveEditorClearDelayMs: 0 })
    const noteField = await screen.findByRole<HTMLTextAreaElement>('textbox')
    await waitForLiveEditorReady(noteField)
    const value = ['- [ ] parent task', '  - [ ] nested task'].join('\n')
    fireEvent.change(noteField, { target: { value } })
    noteField.selectionStart = value.length
    noteField.selectionEnd = value.length
    fireEvent.keyDown(noteField, { key: 'Enter', metaKey: true })
    await waitFor(() => {
      expect(noteField).toHaveValue('- [ ] parent task')
    })

    // Act — Undo should return the exact nested source row, not a top-level box.
    const undoAction = vi.mocked(toast.success).mock.calls.at(-1)?.[1]
      ?.action as { onClick: () => void } | undefined
    await act(async () => {
      undoAction?.onClick()
    })

    // Assert — the child checkbox returns with its two leading spaces intact.
    await waitFor(() => {
      expect(noteField).toHaveValue(value)
    })
    expect(completedMutateAsync).toHaveBeenCalledWith({
      categoryId: 1,
      title: 'nested task',
    })
    expect(completedMutateAsync).toHaveBeenCalledTimes(1)
  })

  it('restores the cleared line when the completion create fails', async () => {
    // Arrange — the create rejects for this completion.
    completedMutateAsync.mockRejectedValueOnce(new Error('network down'))
    const getVisibleOnAllWorkspaces = vi.fn().mockResolvedValue(false)
    const setVisibleOnAllWorkspaces = vi.fn().mockResolvedValue(true)
    installLiveEditorAPI({
      getVisibleOnAllWorkspaces,
      setVisibleOnAllWorkspaces,
    })
    renderEditor({ liveEditorClearOnComplete: true, liveEditorClearDelayMs: 0 })
    const noteField = await screen.findByRole<HTMLTextAreaElement>('textbox')
    await waitForLiveEditorReady(noteField)

    // Act — complete a line whose background create then rejects.
    fireCompleteCommandOnFirstLine(noteField, 'buy milk')

    // Assert — the verbatim line comes back when the create fails.
    await waitFor(() => {
      expect(toast.error).toHaveBeenCalled()
      expect(noteField).toHaveValue('buy milk')
    })
  })

  it('still restores the cleared line when the create rejects AFTER the undo window closed', async () => {
    // Arrange — hold the create in flight so the undo window can close (its
    // onAutoClose fires) BEFORE the create rejects. Without the late-failure
    // restore, the line AND the win vanish silently — the bug this guards.
    let rejectCreate: (reason: Error) => void = () => undefined
    const pendingCreate = new Promise<{ id: number }>((_resolve, reject) => {
      rejectCreate = reject
    })
    completedMutateAsync.mockReturnValueOnce(pendingCreate)
    const getVisibleOnAllWorkspaces = vi.fn().mockResolvedValue(false)
    const setVisibleOnAllWorkspaces = vi.fn().mockResolvedValue(true)
    installLiveEditorAPI({
      getVisibleOnAllWorkspaces,
      setVisibleOnAllWorkspaces,
    })
    renderEditor({ liveEditorClearOnComplete: true, liveEditorClearDelayMs: 0 })
    const noteField = await screen.findByRole<HTMLTextAreaElement>('textbox')
    await waitForLiveEditorReady(noteField)

    // Act — complete (line clears), let the undo window elapse with no Undo
    // (Sonner fires onAutoClose on the timeout), THEN the create rejects.
    fireCompleteCommandOnFirstLine(noteField, 'buy milk')
    await waitFor(() => {
      expect(noteField).toHaveValue('')
    })
    const autoClose = vi
      .mocked(toast.success)
      .mock.calls.at(-1)?.[1]?.onAutoClose
    // This spec only proves the LATE-failure path (undo window closed → outcome
    // 'confirmed') if onAutoClose actually exists and runs. Without this guard an
    // undefined onAutoClose would no-op and the test would silently fall back to
    // exercising the 'pending' path — passing for the wrong reason.
    expect(autoClose).toBeDefined()
    act(() => {
      autoClose?.({} as ToastT)
    })
    await act(async () => {
      rejectCreate(new Error('network down'))
    })

    // Assert — the line is restored even though its undo window already closed.
    await waitFor(() => {
      expect(noteField).toHaveValue('buy milk')
    })
  })

  it('does not duplicate the line when Undo is tapped after a late failure already restored it', async () => {
    // Arrange — the create rejects, so the failure handler restores the line.
    // Sonner's dismiss runs an exit animation, leaving the Undo button clickable
    // for a few hundred ms, so a tap AFTER the restore must NOT re-insert a
    // SECOND copy of the line (silent note corruption — the exact failure mode
    // this feature exists to prevent).
    completedMutateAsync.mockRejectedValueOnce(new Error('network down'))
    const getVisibleOnAllWorkspaces = vi.fn().mockResolvedValue(false)
    const setVisibleOnAllWorkspaces = vi.fn().mockResolvedValue(true)
    installLiveEditorAPI({
      getVisibleOnAllWorkspaces,
      setVisibleOnAllWorkspaces,
    })
    renderEditor({ liveEditorClearOnComplete: true, liveEditorClearDelayMs: 0 })
    const noteField = await screen.findByRole<HTMLTextAreaElement>('textbox')
    await waitForLiveEditorReady(noteField)
    const value = 'keep me\n- [ ] buy milk'
    fireEvent.change(noteField, { target: { value } })
    const caret = value.length // caret at end of the second line
    noteField.selectionStart = caret
    noteField.selectionEnd = caret

    // Act 1 — complete the second line; its background create rejects and the
    // failure handler puts the verbatim line back at index 1. The error toast
    // is the signal the failure handler has finished.
    fireEvent.keyDown(noteField, { key: 'Enter', metaKey: true })
    await waitFor(() => {
      expect(toast.error).toHaveBeenCalled()
      expect(noteField).toHaveValue('keep me\n- [ ] buy milk')
    })

    // Act 2 — tap Undo AFTER the failure already restored the line.
    const undoAction = vi.mocked(toast.success).mock.calls.at(-1)?.[1]
      ?.action as { onClick: () => void } | undefined
    await act(async () => {
      undoAction?.onClick()
    })

    // Assert — the line is present exactly ONCE, never doubled.
    await waitFor(() => {
      expect(noteField).toHaveValue('keep me\n- [ ] buy milk')
    })
  })

  it('stays silent when the create fails after the user already undid', async () => {
    // Arrange — hold the create in flight so the user can Undo FIRST, then make
    // it reject. The user abandoned the completion, so a late create failure is
    // irrelevant to them: no error toast, and no second re-insert of the line.
    let rejectCreate: (reason: Error) => void = () => undefined
    const pendingCreate = new Promise<{ id: number }>((_resolve, reject) => {
      rejectCreate = reject
    })
    completedMutateAsync.mockReturnValueOnce(pendingCreate)
    const getVisibleOnAllWorkspaces = vi.fn().mockResolvedValue(false)
    const setVisibleOnAllWorkspaces = vi.fn().mockResolvedValue(true)
    installLiveEditorAPI({
      getVisibleOnAllWorkspaces,
      setVisibleOnAllWorkspaces,
    })
    renderEditor({ liveEditorClearOnComplete: true, liveEditorClearDelayMs: 0 })
    const noteField = await screen.findByRole<HTMLTextAreaElement>('textbox')
    await waitForLiveEditorReady(noteField)

    // Act — complete (line clears), Undo (line restored, create still pending),
    // THEN the held create rejects.
    fireCompleteCommandOnFirstLine(noteField, 'buy milk')
    await waitFor(() => {
      expect(noteField).toHaveValue('')
    })
    const undoAction = vi.mocked(toast.success).mock.calls.at(-1)?.[1]
      ?.action as { onClick: () => void } | undefined
    await act(async () => {
      undoAction?.onClick()
    })
    await waitFor(() => {
      expect(noteField).toHaveValue('buy milk') // restored by Undo
    })
    await act(async () => {
      rejectCreate(new Error('network down'))
    })

    // Assert — the abandoned completion's failure surfaces NO error toast, and
    // the line stays put (the failure handler must not re-insert a second copy).
    expect(toast.error).not.toHaveBeenCalled()
    await waitFor(() => {
      expect(noteField).toHaveValue('buy milk')
    })
  })

  it('restores the line with its exact leading whitespace on undo (verbatim, not trimmed)', async () => {
    // Arrange — a plain line the user indented with leading spaces.
    const getVisibleOnAllWorkspaces = vi.fn().mockResolvedValue(false)
    const setVisibleOnAllWorkspaces = vi.fn().mockResolvedValue(true)
    installLiveEditorAPI({
      getVisibleOnAllWorkspaces,
      setVisibleOnAllWorkspaces,
    })
    renderEditor({ liveEditorClearOnComplete: true, liveEditorClearDelayMs: 0 })
    const noteField = await screen.findByRole<HTMLTextAreaElement>('textbox')
    await waitForLiveEditorReady(noteField)

    // Act — complete the indented line, then undo it.
    fireCompleteCommandOnFirstLine(noteField, '   buy milk')
    await waitFor(() => {
      expect(noteField).toHaveValue('')
    })
    // sonner types `action` as `Action | ReactNode`; in this editor it's always
    // the Action object, so narrow to its no-arg onClick (our handler ignores
    // the event) before invoking.
    const undoAction = vi.mocked(toast.success).mock.calls.at(-1)?.[1]
      ?.action as { onClick: () => void } | undefined
    await act(async () => {
      undoAction?.onClick()
    })

    // Assert — the three leading spaces survive; the DB got the trimmed title
    // ('buy milk') but the note restores the line exactly as typed.
    await waitFor(() => {
      expect(noteField).toHaveValue('   buy milk')
    })
    expect(completedMutateAsync).toHaveBeenCalledWith({
      categoryId: 1,
      title: 'buy milk',
    })
  })

  it('keeps the caret out of the following line after the optimistic clear', async () => {
    // Arrange — three lines; completing the middle one shifts 'c' up into its slot.
    const getVisibleOnAllWorkspaces = vi.fn().mockResolvedValue(false)
    const setVisibleOnAllWorkspaces = vi.fn().mockResolvedValue(true)
    installLiveEditorAPI({
      getVisibleOnAllWorkspaces,
      setVisibleOnAllWorkspaces,
    })
    renderEditor({ liveEditorClearOnComplete: true, liveEditorClearDelayMs: 0 })
    const noteField = await screen.findByRole<HTMLTextAreaElement>('textbox')
    await waitForLiveEditorReady(noteField)
    const value = 'a\n- [ ] buy milk\nc'
    fireEvent.change(noteField, { target: { value } })
    // Park the caret at the end of the middle line (offset 16) before completing.
    const caret = 'a\n- [ ] buy milk'.length
    noteField.selectionStart = caret
    noteField.selectionEnd = caret

    // Act — complete the middle line.
    fireEvent.keyDown(noteField, { key: 'Enter', metaKey: true })

    // Assert — the line is gone and the caret sits at the START of the line that
    // shifted up (offset 2 = after 'a\n'), not stranded mid-'c' where the next
    // keystroke would corrupt an unrelated line.
    await waitFor(() => {
      expect(noteField).toHaveValue('a\nc')
    })
    expect(noteField.selectionStart).toBe(2)
  })

  it('keeps every finished line in place by default (no auto-close hook wired)', async () => {
    // Arrange — a fresh install (clear-on-complete OFF) keeps the prior behavior.
    const getVisibleOnAllWorkspaces = vi.fn().mockResolvedValue(false)
    const setVisibleOnAllWorkspaces = vi.fn().mockResolvedValue(true)
    installLiveEditorAPI({
      getVisibleOnAllWorkspaces,
      setVisibleOnAllWorkspaces,
    })
    renderEditor()
    const noteField = await screen.findByRole<HTMLTextAreaElement>('textbox')
    await waitForLiveEditorReady(noteField)

    // Act — complete a plain line under the default setting.
    fireCompleteCommandOnFirstLine(noteField, 'buy milk')
    await waitFor(() => {
      expect(noteField).toHaveValue('- [x] buy milk')
    })

    // Assert — OFF path unchanged: the success toast carries NO onAutoClose
    // hook, so the finished `[x]` line stays put (the clear is strictly opt-in).
    const autoClose = vi
      .mocked(toast.success)
      .mock.calls.at(-1)?.[1]?.onAutoClose
    expect(autoClose).toBeUndefined()
    expect(noteField).toHaveValue('- [x] buy milk')
  })

  it("restores the cleared line into its origin category's stored note when Undo fires after switching categories", async () => {
    // Arrange — clear-on-complete on, with TWO categories. note.get is made
    // category-aware so the assertion proves the line returns to category 1's
    // REAL content, not an empty stand-in. This is the cross-category data-loss
    // guard: completing in category 1, switching to 2, then Undo must put the
    // line back into category 1's STORED note — never category 2's visible one.
    installLiveEditorAPI({
      getVisibleOnAllWorkspaces: vi.fn().mockResolvedValue(false),
      setVisibleOnAllWorkspaces: vi.fn().mockResolvedValue(true),
    })
    const api = window.liveEditorAPI
    if (!api) throw new Error('liveEditorAPI was not installed')
    // Category 1 has rows around the restore slot; every other category is empty.
    api.note.get = vi.fn(async (id: number) => (id === 1 ? 'top\nbottom' : ''))
    const noteSet = vi.mocked(api.note.set)

    const store = configureStore({
      reducer: { settings: userSettingsReducer },
      preloadedState: {
        settings: {
          ...userSettingsInitialState,
          liveEditorClearOnComplete: true,
          liveEditorClearDelayMs: 0,
        },
      },
    })
    const [generalCategory] = categories
    if (!generalCategory)
      throw new Error('expected the seeded General category')
    const twoCategories: CategoryWithCount[] = [
      generalCategory,
      { ...generalCategory, id: 2, name: 'Work', isDefault: false },
    ]
    // Fresh element each render — passing the SAME element reference to rerender
    // makes React bail out (reference-equal subtree) and never re-read the
    // controllable useSelectedCategory mock, so the category switch wouldn't take.
    const tree = (): ReactElement => (
      <Provider store={store}>
        <LiveEditor categories={twoCategories} />
      </Provider>
    )
    const { rerender } = render(tree())
    const noteField = await screen.findByRole<HTMLTextAreaElement>('textbox')
    await waitForLiveEditorReady(noteField)
    // The middle checkbox makes a wrong cross-category re-index observable.
    const value = 'top\n- [ ] buy milk\nbottom'
    fireEvent.change(noteField, { target: { value } })
    const caret = 'top\n- [ ] buy milk'.length
    noteField.selectionStart = caret
    noteField.selectionEnd = caret

    // Act — complete the middle row, edit category 2, then Undo from there.
    fireEvent.keyDown(noteField, { key: 'Enter', metaKey: true })
    await waitFor(() => {
      expect(noteField).toHaveValue('top\nbottom')
    })

    selectedCategoryRef.current = 2
    rerender(tree())
    await waitFor(() => {
      expect(noteField).toHaveValue('') // category 2's empty note has loaded
    })
    // The line-count change must never re-index category 1's restore slot.
    fireEvent.change(noteField, { target: { value: 'other\nrows' } })
    noteSet.mockClear() // drop the category-swap flush write; assert only the restore
    const undoAction = vi.mocked(toast.success).mock.calls.at(-1)?.[1]
      ?.action as { onClick: () => void } | undefined
    await act(async () => {
      undoAction?.onClick()
    })

    // Assert — the verbatim line is written back into category 1's STORED note
    // at its original index via IPC, so neither the line nor the win is lost…
    await waitFor(() => {
      expect(noteSet).toHaveBeenCalledWith(1, 'top\n- [ ] buy milk\nbottom')
    })
    // …and the restored line was NEVER persisted into the switched-to category 2:
    // a regression that wrote to both categories would corrupt category 2's stored
    // note via IPC while still satisfying the visible-textarea check below.
    expect(noteSet).not.toHaveBeenCalledWith(
      2,
      expect.stringContaining('- [ ] buy milk'),
    )
    // …and category 2's visible note was never touched.
    expect(noteField).toHaveValue('other\nrows')
  })

  it('offers Retry when Undo cannot restore a cleared origin row', async () => {
    // Arrange — complete in category 1, clear the row, then switch to category 2.
    installLiveEditorAPI({
      getVisibleOnAllWorkspaces: vi.fn().mockResolvedValue(false),
      setVisibleOnAllWorkspaces: vi.fn().mockResolvedValue(true),
    })
    const api = window.liveEditorAPI
    if (!api) throw new Error('liveEditorAPI was not installed')
    api.note.get = vi.fn(async (id: number) => (id === 1 ? 'keep me' : ''))
    const noteSet = vi.mocked(api.note.set)
    const store = configureStore({
      reducer: { settings: userSettingsReducer },
      preloadedState: {
        settings: {
          ...userSettingsInitialState,
          liveEditorClearOnComplete: true,
          liveEditorClearDelayMs: 0,
        },
      },
    })
    const [generalCategory] = categories
    if (!generalCategory)
      throw new Error('expected the seeded General category')
    const twoCategories: CategoryWithCount[] = [
      generalCategory,
      { ...generalCategory, id: 2, name: 'Work', isDefault: false },
    ]
    const tree = (): ReactElement => (
      <Provider store={store}>
        <LiveEditor categories={twoCategories} />
      </Provider>
    )
    const { rerender } = render(tree())
    const noteField = await screen.findByRole<HTMLTextAreaElement>('textbox')
    await waitForLiveEditorReady(noteField)
    fireCompleteCommandOnFirstLine(noteField, '- [ ] buy milk\nkeep me')
    await waitFor(() => {
      expect(noteField).toHaveValue('keep me')
    })
    const undoAction = vi.mocked(toast.success).mock.calls.at(-1)?.[1]
      ?.action as { onClick: () => void } | undefined
    expect(undoAction).toBeDefined()
    if (!undoAction) throw new Error('Undo action was not registered')
    selectedCategoryRef.current = 2
    rerender(tree())
    await waitFor(() => {
      expect(noteField).toHaveValue('')
    })
    noteSet.mockClear()
    noteSet.mockRejectedValueOnce(new Error('disk full'))

    // Act — Undo closes its success toast, but the first origin write fails.
    act(() => {
      undoAction.onClick()
    })

    // Assert — a separate error toast retains the retry path and completion id.
    await waitFor(() => {
      expect(noteSet).toHaveBeenNthCalledWith(1, 1, '- [ ] buy milk\nkeep me')
    })
    const retryAction = vi.mocked(toast.error).mock.calls.at(-1)?.[1]
      ?.action as { onClick: () => void } | undefined
    expect(retryAction).toBeDefined()
    if (!retryAction) throw new Error('Retry action was not registered')
    expect(deleteCompletedMutateAsync).not.toHaveBeenCalled()

    // Act — storage recovers and Retry completes both note restore and row delete.
    noteSet.mockResolvedValue(undefined)
    act(() => {
      retryAction.onClick()
    })

    // Assert — the origin note restores once and the switched note stays untouched.
    await waitFor(() => {
      expect(noteSet).toHaveBeenCalledTimes(2)
      expect(deleteCompletedMutateAsync).toHaveBeenCalledWith({ id: 1 })
    })
    expect(noteSet).toHaveBeenNthCalledWith(2, 1, '- [ ] buy milk\nkeep me')
    expect(noteField).toHaveValue('')
  })

  it('offers Retry when failed creation cannot restore a cleared origin row', async () => {
    // Arrange — keep create pending, clear category 1, then switch to category 2.
    let rejectCreate: (reason: Error) => void = () => undefined
    const pendingCreate = new Promise<{ id: number }>((_resolve, reject) => {
      rejectCreate = reject
    })
    completedMutateAsync.mockReturnValueOnce(pendingCreate)
    installLiveEditorAPI({
      getVisibleOnAllWorkspaces: vi.fn().mockResolvedValue(false),
      setVisibleOnAllWorkspaces: vi.fn().mockResolvedValue(true),
    })
    const api = window.liveEditorAPI
    if (!api) throw new Error('liveEditorAPI was not installed')
    api.note.get = vi.fn(async (id: number) => (id === 1 ? 'keep me' : ''))
    const noteSet = vi.mocked(api.note.set)
    const store = configureStore({
      reducer: { settings: userSettingsReducer },
      preloadedState: {
        settings: {
          ...userSettingsInitialState,
          liveEditorClearOnComplete: true,
          liveEditorClearDelayMs: 0,
        },
      },
    })
    const [generalCategory] = categories
    if (!generalCategory)
      throw new Error('expected the seeded General category')
    const twoCategories: CategoryWithCount[] = [
      generalCategory,
      { ...generalCategory, id: 2, name: 'Work', isDefault: false },
    ]
    const tree = (): ReactElement => (
      <Provider store={store}>
        <LiveEditor categories={twoCategories} />
      </Provider>
    )
    const { rerender } = render(tree())
    const noteField = await screen.findByRole<HTMLTextAreaElement>('textbox')
    await waitForLiveEditorReady(noteField)
    fireCompleteCommandOnFirstLine(noteField, '- [ ] buy milk\nkeep me')
    await waitFor(() => {
      expect(noteField).toHaveValue('keep me')
    })
    selectedCategoryRef.current = 2
    rerender(tree())
    await waitFor(() => {
      expect(noteField).toHaveValue('')
    })
    noteSet.mockClear()
    noteSet.mockRejectedValueOnce(new Error('disk full'))

    // Act — create failure tries to restore category 1, but its first write fails.
    await act(async () => {
      rejectCreate(new Error('network down'))
      await pendingCreate.catch(() => undefined)
    })

    // Assert — the failure toast carries Retry even if the success toast expired.
    await waitFor(() => {
      expect(noteSet).toHaveBeenCalledTimes(1)
      expect(noteSet).toHaveBeenNthCalledWith(1, 1, '- [ ] buy milk\nkeep me')
      expect(toast.error).toHaveBeenCalledWith(
        'network down',
        expect.objectContaining({ action: expect.any(Object) }),
      )
    })
    expect(toast.dismiss).not.toHaveBeenCalled()
    const retryAction = vi.mocked(toast.error).mock.calls.at(-1)?.[1]
      ?.action as { onClick: () => void } | undefined
    expect(retryAction).toBeDefined()
    if (!retryAction) throw new Error('Retry action was not registered')

    // Act — the explicit Retry restores after storage recovers.
    noteSet.mockResolvedValue(undefined)
    act(() => {
      retryAction.onClick()
    })

    // Assert — the original category is restored on retry; category 2 stays untouched.
    await waitFor(() => {
      expect(noteSet).toHaveBeenCalledTimes(2)
    })
    expect(noteSet).toHaveBeenNthCalledWith(2, 1, '- [ ] buy milk\nkeep me')
    expect(noteField).toHaveValue('')
    expect(deleteCompletedMutateAsync).not.toHaveBeenCalled()
  })

  it('does not duplicate a cleared row when stale create-failure Retry follows Undo', async () => {
    // Arrange — fail creation and its automatic restore after the row leaves category 1.
    let rejectCreate: (reason: Error) => void = () => undefined
    const pendingCreate = new Promise<{ id: number }>((_resolve, reject) => {
      rejectCreate = reject
    })
    completedMutateAsync.mockReturnValueOnce(pendingCreate)
    installLiveEditorAPI({
      getVisibleOnAllWorkspaces: vi.fn().mockResolvedValue(false),
      setVisibleOnAllWorkspaces: vi.fn().mockResolvedValue(true),
    })
    const api = window.liveEditorAPI
    if (!api) throw new Error('liveEditorAPI was not installed')
    api.note.get = vi.fn(async (id: number) => (id === 1 ? 'keep me' : ''))
    const noteSet = vi.mocked(api.note.set)
    const store = configureStore({
      reducer: { settings: userSettingsReducer },
      preloadedState: {
        settings: {
          ...userSettingsInitialState,
          liveEditorClearOnComplete: true,
          liveEditorClearDelayMs: 0,
        },
      },
    })
    const [generalCategory] = categories
    if (!generalCategory)
      throw new Error('expected the seeded General category')
    const twoCategories: CategoryWithCount[] = [
      generalCategory,
      { ...generalCategory, id: 2, name: 'Work', isDefault: false },
    ]
    const tree = (): ReactElement => (
      <Provider store={store}>
        <LiveEditor categories={twoCategories} />
      </Provider>
    )
    const { rerender } = render(tree())
    const noteField = await screen.findByRole<HTMLTextAreaElement>('textbox')
    await waitForLiveEditorReady(noteField)
    fireCompleteCommandOnFirstLine(noteField, '- [ ] buy milk\nkeep me')
    await waitFor(() => {
      expect(noteField).toHaveValue('keep me')
    })
    const undoAction = vi.mocked(toast.success).mock.calls.at(-1)?.[1]
      ?.action as { onClick: () => void } | undefined
    expect(undoAction).toBeDefined()
    if (!undoAction) throw new Error('Undo action was not registered')
    selectedCategoryRef.current = 2
    rerender(tree())
    await waitFor(() => {
      expect(noteField).toHaveValue('')
    })
    noteSet.mockClear()
    noteSet.mockRejectedValueOnce(new Error('disk full'))
    await act(async () => {
      rejectCreate(new Error('network down'))
      await pendingCreate.catch(() => undefined)
    })
    await waitFor(() => {
      expect(noteSet).toHaveBeenCalledTimes(1)
    })
    const retryAction = vi.mocked(toast.error).mock.calls.at(-1)?.[1]
      ?.action as { onClick: () => void } | undefined
    expect(retryAction).toBeDefined()
    if (!retryAction) throw new Error('Retry action was not registered')
    noteSet.mockResolvedValue(undefined)

    // Act — Undo restores first, then the older failure toast's Retry fires.
    act(() => {
      undoAction.onClick()
    })
    await waitFor(() => {
      expect(noteSet).toHaveBeenCalledTimes(2)
    })
    await act(async () => {
      retryAction.onClick()
      await Promise.resolve()
    })

    // Assert — stale Retry performs no third write, so the origin gets one row only.
    expect(noteSet).toHaveBeenCalledTimes(2)
    expect(noteSet).toHaveBeenNthCalledWith(2, 1, '- [ ] buy milk\nkeep me')
    expect(noteField).toHaveValue('')
    expect(deleteCompletedMutateAsync).not.toHaveBeenCalled()
  })

  it('serializes create-failure and Undo restoration of the same cleared row', async () => {
    // Arrange — pause the cross-category note read so failure and Undo overlap.
    let rejectCreate: (reason: Error) => void = () => undefined
    const pendingCreate = new Promise<{ id: number }>((_resolve, reject) => {
      rejectCreate = reject
    })
    let resolveRestoreRead: (text: string) => void = () => undefined
    const restoreRead = new Promise<string>((resolve) => {
      resolveRestoreRead = resolve
    })
    completedMutateAsync.mockReturnValueOnce(pendingCreate)
    installLiveEditorAPI({
      getVisibleOnAllWorkspaces: vi.fn().mockResolvedValue(false),
      setVisibleOnAllWorkspaces: vi.fn().mockResolvedValue(true),
    })
    const api = window.liveEditorAPI
    if (!api) throw new Error('liveEditorAPI was not installed')
    api.note.get = vi.fn(async (id: number) => {
      // Only the origin read after switching categories is intentionally blocked.
      if (id === 1 && selectedCategoryRef.current === 2) return restoreRead
      return Promise.resolve('')
    })
    const noteSet = vi.mocked(api.note.set)
    const store = configureStore({
      reducer: { settings: userSettingsReducer },
      preloadedState: {
        settings: {
          ...userSettingsInitialState,
          liveEditorClearOnComplete: true,
          liveEditorClearDelayMs: 0,
        },
      },
    })
    const [generalCategory] = categories
    if (!generalCategory)
      throw new Error('expected the seeded General category')
    const twoCategories: CategoryWithCount[] = [
      generalCategory,
      { ...generalCategory, id: 2, name: 'Work', isDefault: false },
    ]
    const tree = (): ReactElement => (
      <Provider store={store}>
        <LiveEditor categories={twoCategories} />
      </Provider>
    )
    const { rerender } = render(tree())
    const noteField = await screen.findByRole<HTMLTextAreaElement>('textbox')
    await waitForLiveEditorReady(noteField)
    fireCompleteCommandOnFirstLine(noteField, '- [ ] buy milk')
    await waitFor(() => {
      expect(noteField).toHaveValue('')
    })
    const undoAction = vi.mocked(toast.success).mock.calls.at(-1)?.[1]
      ?.action as { onClick: () => void } | undefined
    expect(undoAction).toBeDefined()
    if (!undoAction) throw new Error('Undo action was not registered')
    selectedCategoryRef.current = 2
    rerender(tree())
    await waitFor(() => {
      expect(noteField).toHaveValue('')
    })
    noteSet.mockClear()

    // Act — failure starts restore, then Undo joins before the origin read resolves.
    act(() => {
      rejectCreate(new Error('network down'))
    })
    await waitFor(() => {
      // The failure handler is now blocked on the origin category's restore read.
      expect(api.note.get).toHaveBeenLastCalledWith(1)
    })
    act(() => {
      undoAction.onClick()
    })
    await act(async () => {
      resolveRestoreRead('')
      await restoreRead
    })

    // Assert — both callers share one write, so the original row appears once.
    await waitFor(() => {
      expect(noteSet).toHaveBeenCalledTimes(1)
    })
    expect(noteSet).toHaveBeenCalledWith(1, '- [ ] buy milk')
    expect(noteField).toHaveValue('')
  })
})

describe('LiveEditor clear-on-complete (deferred linger)', () => {
  // A short, REAL linger keeps these specs deterministic: a setTimeout always
  // fires AFTER the synchronous fireEvent and the create promise's microtask, so
  // "still on screen" / "timer cancelled" assertions are race-free. Fake timers
  // fight RTL's async findBy/waitFor and the microtask-resolving create mock.
  const LINGER_MS = 100

  beforeEach(() => {
    vi.clearAllMocks()
    completedMutateAsync.mockResolvedValue({ id: 1 })
    // Reset the active floating category — the category-swap spec mutates it.
    selectedCategoryRef.current = 1
  })

  it('keeps the finished line on screen for the linger, then tucks it away once the delay elapses', async () => {
    // Arrange — clear-on-complete on with a 100 ms linger (not instant).
    installLiveEditorAPI({
      getVisibleOnAllWorkspaces: vi.fn().mockResolvedValue(false),
      setVisibleOnAllWorkspaces: vi.fn().mockResolvedValue(true),
    })
    renderEditor({
      liveEditorClearOnComplete: true,
      liveEditorClearDelayMs: LINGER_MS,
    })
    const noteField = await screen.findByRole<HTMLTextAreaElement>('textbox')
    await waitForLiveEditorReady(noteField)

    // Act — complete the first of two lines.
    fireCompleteCommandOnFirstLine(noteField, 'buy milk\nkeep me')

    // Assert — the checked line LINGERS (the completion is visible before it
    // leaves, while the Completed create has already fired in the background)…
    expect(noteField).toHaveValue('- [x] buy milk\nkeep me')
    expect(completedMutateAsync).toHaveBeenCalledWith({
      categoryId: 1,
      title: 'buy milk',
    })
    // …and is removed only once the linger elapses.
    await waitFor(() => {
      expect(noteField).toHaveValue('keep me')
    })
  })

  it('clears every line completed within one linger, not just the first', async () => {
    // Arrange — three lines; completing two top-to-bottom within ONE linger leaves
    // two removal timers pending at once. When the first timer removes line 0 it
    // shifts every later line up, so a still-pending sibling's tracked index must
    // be decremented — otherwise its content guard misses and that line is silently
    // never cleared. This is the regression that guard (finding G) exists for.
    installLiveEditorAPI({
      getVisibleOnAllWorkspaces: vi.fn().mockResolvedValue(false),
      setVisibleOnAllWorkspaces: vi.fn().mockResolvedValue(true),
    })
    // A roomy 500 ms linger so the second completion lands well before the first
    // timer fires (both pending together); the ~100 ms human-paced gap between the
    // two completions lets the editor re-sync its text ref between the two firings.
    renderEditor({
      liveEditorClearOnComplete: true,
      liveEditorClearDelayMs: 500,
    })
    const noteField = await screen.findByRole<HTMLTextAreaElement>('textbox')
    await waitForLiveEditorReady(noteField)

    // Act — complete line 0 ('buy milk'), then ~100 ms later complete line 1
    // ('dishes'); the checked lines stay present meanwhile, and both completions
    // are tracked at their original indices (0 and 1).
    fireCompleteCommandOnFirstLine(noteField, 'buy milk\ndishes\nlaundry')
    // The deferred path advances the caret to the START OF THE NEXT line itself,
    // so the second Cmd/Ctrl+Enter naturally targets 'dishes' — assert that here
    // and DON'T reposition the caret by hand (a manual set masked the
    // caret-never-advances bug this regression now guards).
    expect(noteField.selectionStart).toBe(15) // start of 'dishes' (line 1)
    // ~100 ms human-paced gap so the second completion lands while line 0's
    // removal timer is still pending — both timers pend together (finding G).
    await new Promise((resolve) => setTimeout(resolve, 100))
    fireEvent.keyDown(noteField, { key: 'Enter', metaKey: true })

    // Assert — BOTH finished lines clear; only the untouched 'laundry' survives.
    await waitFor(
      () => {
        expect(noteField).toHaveValue('laundry')
      },
      { timeout: 2000 },
    )
  })

  it('cancels the pending removal when Undo is tapped during the linger, so the line never leaves', async () => {
    // Arrange
    installLiveEditorAPI({
      getVisibleOnAllWorkspaces: vi.fn().mockResolvedValue(false),
      setVisibleOnAllWorkspaces: vi.fn().mockResolvedValue(true),
    })
    renderEditor({
      liveEditorClearOnComplete: true,
      liveEditorClearDelayMs: LINGER_MS,
    })
    const noteField = await screen.findByRole<HTMLTextAreaElement>('textbox')
    await waitForLiveEditorReady(noteField)

    // Act — complete (the line is now lingering), then tap Undo before the linger
    // elapses. The optimistic toast is shown synchronously, so its Undo action is
    // available the moment after completing.
    fireCompleteCommandOnFirstLine(noteField, 'buy milk\nkeep me')
    const undoAction = vi.mocked(toast.success).mock.calls.at(-1)?.[1]
      ?.action as { onClick: () => void } | undefined
    await act(async () => {
      undoAction?.onClick()
    })

    // Assert — Undo cancelled the pending removal, so the line never left — and it
    // stays put even past the point the linger would have elapsed (timer cancelled,
    // not merely deferred).
    await waitFor(() => {
      expect(noteField).toHaveValue('buy milk\nkeep me')
    })
    await new Promise((resolve) => setTimeout(resolve, LINGER_MS + 50))
    expect(noteField).toHaveValue('buy milk\nkeep me')
  })

  it('leaves the line in place when the background create fails during the linger', async () => {
    // Arrange — the create rejects. Its rejection runs as a microtask, BEFORE the
    // 100 ms removal timer could fire, so it cancels the pending timer: the line was
    // never cleared, so there is nothing to restore — it simply stays.
    completedMutateAsync.mockRejectedValueOnce(new Error('network down'))
    installLiveEditorAPI({
      getVisibleOnAllWorkspaces: vi.fn().mockResolvedValue(false),
      setVisibleOnAllWorkspaces: vi.fn().mockResolvedValue(true),
    })
    renderEditor({
      liveEditorClearOnComplete: true,
      liveEditorClearDelayMs: LINGER_MS,
    })
    const noteField = await screen.findByRole<HTMLTextAreaElement>('textbox')
    await waitForLiveEditorReady(noteField)

    // Act — complete a line whose background create then rejects during the linger.
    fireCompleteCommandOnFirstLine(noteField, 'buy milk\nkeep me')

    // Assert — the failure surfaces an error toast, the line stays on screen
    // verbatim, and it remains put once the linger window has elapsed (no late
    // blind removal, no duplicate re-insert).
    await waitFor(() => {
      expect(toast.error).toHaveBeenCalled()
      expect(noteField).toHaveValue('buy milk\nkeep me')
    })
    await new Promise((resolve) => setTimeout(resolve, LINGER_MS + 50))
    expect(noteField).toHaveValue('buy milk\nkeep me')
  })

  it('restores the origin category when a failed linger completion still reads the pre-flush row after switching away', async () => {
    // Arrange — hold the create in flight so category 1 can switch away before the
    // failure handler runs. Its stored note still reads the original row, matching
    // the real pre-flush race CodeRabbit caught.
    let rejectCreate: (reason: Error) => void = () => undefined
    const pendingCreate = new Promise<{ id: number }>((_resolve, reject) => {
      rejectCreate = reject
    })
    completedMutateAsync.mockReturnValueOnce(pendingCreate)
    installLiveEditorAPI({
      getVisibleOnAllWorkspaces: vi.fn().mockResolvedValue(false),
      setVisibleOnAllWorkspaces: vi.fn().mockResolvedValue(true),
    })
    const api = window.liveEditorAPI
    if (!api) throw new Error('liveEditorAPI was not installed')
    api.note.get = vi.fn(async (id: number) =>
      id === 1 ? 'buy milk\nkeep me' : '',
    )
    const noteSet = vi.mocked(api.note.set)

    const store = configureStore({
      reducer: { settings: userSettingsReducer },
      preloadedState: {
        settings: {
          ...userSettingsInitialState,
          liveEditorClearOnComplete: true,
          liveEditorClearDelayMs: LINGER_MS,
        },
      },
    })
    const [generalCategory] = categories
    if (!generalCategory)
      throw new Error('expected the seeded General category')
    const twoCategories: CategoryWithCount[] = [
      generalCategory,
      { ...generalCategory, id: 2, name: 'Work', isDefault: false },
    ]
    const tree = (): ReactElement => (
      <Provider store={store}>
        <LiveEditor categories={twoCategories} />
      </Provider>
    )
    const { rerender } = render(tree())
    const noteField = await screen.findByRole<HTMLTextAreaElement>('textbox')
    await waitForLiveEditorReady(noteField)
    const value = 'buy milk\nkeep me'
    fireEvent.change(noteField, { target: { value } })
    noteField.selectionStart = 'buy milk'.length
    noteField.selectionEnd = 'buy milk'.length
    fireEvent.keyDown(noteField, { key: 'Enter', metaKey: true })
    expect(noteField).toHaveValue('- [x] buy milk\nkeep me')

    selectedCategoryRef.current = 2
    rerender(tree())
    await waitFor(() => {
      expect(noteField).toHaveValue('')
    })
    noteSet.mockClear()

    // Act — category 1 still reads the original row, so the restore must be
    // idempotent and explicitly write that original row back instead of skipping.
    await act(async () => {
      rejectCreate(new Error('network down'))
    })

    // Assert — the origin note is restored even though it never observed `[x]`.
    await waitFor(() => {
      expect(noteSet).toHaveBeenCalledWith(1, 'buy milk\nkeep me')
    })
    expect(noteSet).not.toHaveBeenCalledWith(
      2,
      expect.stringContaining('buy milk'),
    )
  })

  it('does not remove the tracked line if the user edited it during the linger', async () => {
    // Arrange
    installLiveEditorAPI({
      getVisibleOnAllWorkspaces: vi.fn().mockResolvedValue(false),
      setVisibleOnAllWorkspaces: vi.fn().mockResolvedValue(true),
    })
    renderEditor({
      liveEditorClearOnComplete: true,
      liveEditorClearDelayMs: LINGER_MS,
    })
    const noteField = await screen.findByRole<HTMLTextAreaElement>('textbox')
    await waitForLiveEditorReady(noteField)

    // Act — complete the first line, then (still within the linger, before the
    // timer fires) edit that very line so it no longer matches what was completed.
    fireCompleteCommandOnFirstLine(noteField, 'buy milk\nkeep me')
    fireEvent.change(noteField, { target: { value: 'buy oat milk\nkeep me' } })

    // Assert — the content guard sees the tracked line changed and no-ops, so the
    // edited line is preserved (the timer never blind-removes the wrong line).
    await new Promise((resolve) => setTimeout(resolve, LINGER_MS + 50))
    expect(noteField).toHaveValue('buy oat milk\nkeep me')
  })

  it('keeps a cancelled delayed-clear completion deduplicated after returning to its category', async () => {
    // Arrange — keep create pending while category 1's checked row moves off-screen.
    let resolveCreate: (value: { id: number }) => void = () => undefined
    const pendingCreate = new Promise<{ id: number }>((resolve) => {
      resolveCreate = resolve
    })
    completedMutateAsync.mockReturnValueOnce(pendingCreate)
    installLiveEditorAPI({
      getVisibleOnAllWorkspaces: vi.fn().mockResolvedValue(false),
      setVisibleOnAllWorkspaces: vi.fn().mockResolvedValue(true),
    })
    const api = window.liveEditorAPI
    if (!api) throw new Error('liveEditorAPI was not installed')
    api.note.get = vi.fn(async (id: number) =>
      id === 1 ? '- [x] buy milk' : '',
    )
    const store = configureStore({
      reducer: { settings: userSettingsReducer },
      preloadedState: {
        settings: {
          ...userSettingsInitialState,
          liveEditorClearOnComplete: true,
          liveEditorClearDelayMs: LINGER_MS,
        },
      },
    })
    const [generalCategory] = categories
    if (!generalCategory)
      throw new Error('expected the seeded General category')
    const twoCategories: CategoryWithCount[] = [
      generalCategory,
      { ...generalCategory, id: 2, name: 'Work', isDefault: false },
    ]
    const tree = (): ReactElement => (
      <Provider store={store}>
        <LiveEditor categories={twoCategories} />
      </Provider>
    )
    const { rerender } = render(tree())
    const noteField = await screen.findByRole<HTMLTextAreaElement>('textbox')
    await waitForLiveEditorReady(noteField)
    fireCompleteCommandOnFirstLine(noteField, '- [x] buy milk')
    selectedCategoryRef.current = 2
    rerender(tree())
    await waitFor(() => {
      expect(noteField).toHaveValue('')
    })
    selectedCategoryRef.current = 1
    rerender(tree())
    await waitFor(() => {
      expect(noteField).toHaveValue('- [x] buy milk')
    })

    // Act — retry before and after the original create resolves.
    fireCompleteCommandOnFirstLine(noteField, '- [x] buy milk')
    await act(async () => {
      resolveCreate({ id: 1 })
      await pendingCreate
    })
    fireCompleteCommandOnFirstLine(noteField, '- [x] buy milk')

    // Assert — both pending and persisted category-scoped memory block duplicates.
    expect(completedMutateAsync).toHaveBeenCalledTimes(1)
    expect(noteField).toHaveValue('- [x] buy milk')
  })

  it('cancels a pending removal on a category switch, never touching the switched-to category', async () => {
    // Arrange — clear-on-complete on with a linger, TWO categories. Completing in
    // category 1 then switching to 2 before the linger elapses must cancel the
    // pending removal, so the timer can never fire against category 2's freshly
    // loaded note (which would corrupt it — the cross-category data-loss guard).
    installLiveEditorAPI({
      getVisibleOnAllWorkspaces: vi.fn().mockResolvedValue(false),
      setVisibleOnAllWorkspaces: vi.fn().mockResolvedValue(true),
    })
    const api = window.liveEditorAPI
    if (!api) throw new Error('liveEditorAPI was not installed')
    // Category 1 holds the seeded note; every other category is empty.
    api.note.get = vi.fn(async (id: number) =>
      id === 1 ? 'buy milk\nkeep me' : '',
    )
    const noteSet = vi.mocked(api.note.set)

    const store = configureStore({
      reducer: { settings: userSettingsReducer },
      preloadedState: {
        settings: {
          ...userSettingsInitialState,
          liveEditorClearOnComplete: true,
          liveEditorClearDelayMs: LINGER_MS,
        },
      },
    })
    const [generalCategory] = categories
    if (!generalCategory)
      throw new Error('expected the seeded General category')
    const twoCategories: CategoryWithCount[] = [
      generalCategory,
      { ...generalCategory, id: 2, name: 'Work', isDefault: false },
    ]
    const tree = (): ReactElement => (
      <Provider store={store}>
        <LiveEditor categories={twoCategories} />
      </Provider>
    )
    const { rerender } = render(tree())
    const noteField = await screen.findByRole<HTMLTextAreaElement>('textbox')
    await waitForLiveEditorReady(noteField)
    const value = 'buy milk\nkeep me'
    fireEvent.change(noteField, { target: { value } })
    noteField.selectionStart = 'buy milk'.length
    noteField.selectionEnd = 'buy milk'.length

    // Complete line 0 in category 1 → the checked line lingers, not yet removed.
    fireEvent.keyDown(noteField, { key: 'Enter', metaKey: true })
    expect(noteField).toHaveValue('- [x] buy milk\nkeep me')

    // Act — switch to category 2 before the linger elapses; its empty note loads.
    selectedCategoryRef.current = 2
    rerender(tree())
    await waitFor(() => {
      expect(noteField).toHaveValue('') // category 2's empty note has loaded
    })
    noteSet.mockClear() // drop the category-swap flush write; assert only the rest

    // Assert — wait past the linger; the cancelled timer never fires, so category
    // 2's visible note stays empty and is never written with the category-1 line.
    await new Promise((resolve) => setTimeout(resolve, LINGER_MS + 50))
    expect(noteField).toHaveValue('')
    expect(noteSet).not.toHaveBeenCalledWith(
      2,
      expect.stringContaining('buy milk'),
    )
  })
})

describe('LiveEditor completion toast — close button + display duration (#109)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    completedMutateAsync.mockResolvedValue({ id: 1 })
    // Reset the active floating category — the clamp spec leaves it on 1, but be
    // explicit so a future cross-category spec here can't bleed state.
    selectedCategoryRef.current = 1
  })

  it('shows the completion toast with a close button and the configured display duration', async () => {
    // Arrange — clear-on-complete OFF (the always-shown toast path), with an
    // 8 s display duration saved.
    installLiveEditorAPI({
      getVisibleOnAllWorkspaces: vi.fn().mockResolvedValue(false),
      setVisibleOnAllWorkspaces: vi.fn().mockResolvedValue(true),
    })
    renderEditor({ liveEditorToastDurationMs: 8000 })
    const noteField = await screen.findByRole<HTMLTextAreaElement>('textbox')
    await waitForLiveEditorReady(noteField)

    // Act — complete a plain line.
    fireCompleteCommandOnFirstLine(noteField, 'buy milk')

    // Assert — the success toast carries the ✕ (closeButton) and stays for the
    // saved 8000 ms, not the old fixed 5 s.
    await waitFor(() => {
      expect(toast.success).toHaveBeenCalled()
    })
    const toastOptions = vi.mocked(toast.success).mock.calls.at(-1)?.[1]
    expect(toastOptions?.closeButton).toBe(true)
    expect(toastOptions?.duration).toBe(8000)
  })

  it('phrases the Undo-window copy for the configured display duration', async () => {
    // Arrange — an 8 s duration must read "8 s", not a hardcoded "5 s".
    installLiveEditorAPI({
      getVisibleOnAllWorkspaces: vi.fn().mockResolvedValue(false),
      setVisibleOnAllWorkspaces: vi.fn().mockResolvedValue(true),
    })
    renderEditor({ liveEditorToastDurationMs: 8000 })
    const noteField = await screen.findByRole<HTMLTextAreaElement>('textbox')
    await waitForLiveEditorReady(noteField)

    // Act
    fireCompleteCommandOnFirstLine(noteField, 'buy milk')

    // Assert — the description names the actual undo window in seconds.
    await waitFor(() => {
      expect(toast.success).toHaveBeenCalled()
    })
    const toastOptions = vi.mocked(toast.success).mock.calls.at(-1)?.[1]
    expect(toastOptions?.description).toBe(
      'Undo stays here for 8 s if you need it.',
    )
  })

  it('floors the Undo-window copy at a half-step duration so it never over-promises the Undo time', async () => {
    // Arrange — a half-step 2500 ms duration (reachable via the slider's 500 ms
    // step) must read "2 s" (floor), never "3 s" (round): the copy must never
    // claim more Undo time than actually remains (FINDING-001 regret-safe floor).
    installLiveEditorAPI({
      getVisibleOnAllWorkspaces: vi.fn().mockResolvedValue(false),
      setVisibleOnAllWorkspaces: vi.fn().mockResolvedValue(true),
    })
    renderEditor({ liveEditorToastDurationMs: 2500 })
    const noteField = await screen.findByRole<HTMLTextAreaElement>('textbox')
    await waitForLiveEditorReady(noteField)

    // Act
    fireCompleteCommandOnFirstLine(noteField, 'buy milk')

    // Assert — 2500 ms floors to "2 s", never the rounded-up "3 s".
    await waitFor(() => {
      expect(toast.success).toHaveBeenCalled()
    })
    const toastOptions = vi.mocked(toast.success).mock.calls.at(-1)?.[1]
    expect(toastOptions?.description).toBe(
      'Undo stays here for 2 s if you need it.',
    )
  })

  it('keeps the close button and configured duration on the clear-on-complete toast', async () => {
    // Arrange — clear-on-complete ON with instant clear and a 6 s duration: the
    // SAME helper must wire the ✕ + duration on this second completion path too.
    installLiveEditorAPI({
      getVisibleOnAllWorkspaces: vi.fn().mockResolvedValue(false),
      setVisibleOnAllWorkspaces: vi.fn().mockResolvedValue(true),
    })
    renderEditor({
      liveEditorClearOnComplete: true,
      liveEditorClearDelayMs: 0,
      liveEditorToastDurationMs: 6000,
    })
    const noteField = await screen.findByRole<HTMLTextAreaElement>('textbox')
    await waitForLiveEditorReady(noteField)

    // Act — complete the only line (it clears instantly).
    fireCompleteCommandOnFirstLine(noteField, 'buy milk')
    await waitFor(() => {
      expect(noteField).toHaveValue('')
    })

    // Assert — the clear toast also has the ✕ and the saved 6000 ms duration.
    const toastOptions = vi.mocked(toast.success).mock.calls.at(-1)?.[1]
    expect(toastOptions?.closeButton).toBe(true)
    expect(toastOptions?.duration).toBe(6000)
  })

  it('still restores the cleared line on Undo even though the toast now fires onDismiss on close', async () => {
    // Arrange — clear-on-complete ON; the ✕ adds an onDismiss that BOTH a ✕ and an
    // Undo trigger. Undo must still revert, and the trailing onDismiss must NOT
    // confirm the win away (the call-site wasUndoCalled guard — CEO-D4).
    installLiveEditorAPI({
      getVisibleOnAllWorkspaces: vi.fn().mockResolvedValue(false),
      setVisibleOnAllWorkspaces: vi.fn().mockResolvedValue(true),
    })
    renderEditor({
      liveEditorClearOnComplete: true,
      liveEditorClearDelayMs: 0,
      liveEditorToastDurationMs: 6000,
    })
    const noteField = await screen.findByRole<HTMLTextAreaElement>('textbox')
    await waitForLiveEditorReady(noteField)
    const value = 'keep me\n- [ ] buy milk'
    fireEvent.change(noteField, { target: { value } })
    const caret = value.length // caret at end of the second line
    noteField.selectionStart = caret
    noteField.selectionEnd = caret
    fireEvent.keyDown(noteField, { key: 'Enter', metaKey: true })
    await waitFor(() => {
      expect(noteField).toHaveValue('keep me')
    })

    // Act — tap Undo, THEN let sonner fire onDismiss (it dismisses after the
    // action runs); the guard must keep the restored line in place.
    const toastOptions = vi.mocked(toast.success).mock.calls.at(-1)?.[1]
    const undoAction = toastOptions?.action as
      { onClick: () => void } | undefined
    await act(async () => {
      undoAction?.onClick()
    })
    act(() => {
      toastOptions?.onDismiss?.({} as ToastT)
    })

    // Assert — the verbatim line returns at index 1 and stays there.
    await waitFor(() => {
      expect(noteField).toHaveValue('keep me\n- [ ] buy milk')
    })
  })

  it('clamps the clear linger down to the shorter toast duration so a line never outlasts its Undo', async () => {
    // Arrange — a clear delay (300 ms) LONGER than the toast duration (100 ms).
    // The runtime min() must remove the line when the toast (and its Undo) closes
    // at 100 ms, never letting it linger the full 300 ms (#109 replaces #108's
    // fixed ceiling). In production this is the clearDelay-5000 vs toast-2000 case.
    installLiveEditorAPI({
      getVisibleOnAllWorkspaces: vi.fn().mockResolvedValue(false),
      setVisibleOnAllWorkspaces: vi.fn().mockResolvedValue(true),
    })
    renderEditor({
      liveEditorClearOnComplete: true,
      liveEditorClearDelayMs: 300,
      liveEditorToastDurationMs: 100,
    })
    const noteField = await screen.findByRole<HTMLTextAreaElement>('textbox')
    await waitForLiveEditorReady(noteField)

    vi.useFakeTimers()
    try {
      // Act — complete line 0; the deferred path leaves it checked on screen for now.
      fireCompleteCommandOnFirstLine(noteField, 'buy milk\nkeep me')
      expect(noteField).toHaveValue('- [x] buy milk\nkeep me')

      // Assert — after 150 ms (past the 100 ms toast, before the 300 ms delay) the
      // line is already gone: the clamp picked the shorter toast duration.
      await act(async () => {
        vi.advanceTimersByTime(150)
      })
      expect(noteField).toHaveValue('keep me')
    } finally {
      vi.useRealTimers()
    }
  })
})
