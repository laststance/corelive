import { globalShortcut } from 'electron'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { ConfigManager } from '../ConfigManager'
import ShortcutManager from '../ShortcutManager'
import type { WindowManager } from '../WindowManager'

/**
 * LiveEditor can be bound to TWO keys at once (`toggleLiveEditor` +
 * `toggleLiveEditorSecondary`, one shared handler). These specs fail if the
 * registration loop ever drops a slot — which would look like "my second key
 * stopped opening LiveEditor" with nothing in the logs.
 */

/**
 * Accelerators currently held at the "OS" level. The mock is STATEFUL on
 * purpose: a stateless `register: () => true` would report success for a batch
 * that re-binds an accelerator the batch itself still holds, hiding exactly the
 * self-collision these specs exist to catch.
 */
const heldAccelerators = vi.hoisted(() => new Set<string>())

vi.mock('electron', () => ({
  BrowserWindow: vi.fn(),
  globalShortcut: {
    isRegistered: vi.fn((accelerator: string) =>
      heldAccelerators.has(accelerator),
    ),
    register: vi.fn((accelerator: string) => {
      if (heldAccelerators.has(accelerator)) return false
      heldAccelerators.add(accelerator)
      return true
    }),
    unregister: vi.fn((accelerator: string) => {
      heldAccelerators.delete(accelerator)
    }),
    unregisterAll: vi.fn(() => {
      heldAccelerators.clear()
    }),
  },
}))

const globalRegisterMock = vi.mocked(globalShortcut.register)

/**
 * Builds a WindowManager stand-in whose LiveEditor toggle is a spy, so a test can
 * prove a registered accelerator actually reaches the LiveEditor window.
 * @returns The stub plus its `toggleLiveEditor` spy.
 * @example
 * const { windowManager, toggleLiveEditor } = createWindowManagerHarness()
 */
function createWindowManagerHarness() {
  const toggleLiveEditor = vi.fn(() => true)
  const windowManager = {
    toggleLiveEditor,
  } as unknown as WindowManager
  return { windowManager, toggleLiveEditor }
}

/**
 * Builds a ConfigManager stand-in that serves one persisted `shortcuts` section.
 * @param shortcuts - The persisted `shortcuts.*` values the manager should load.
 * @returns A ConfigManager-compatible stub.
 * @example
 * createConfigManagerStub({ toggleLiveEditor: 'Alt+Space' })
 */
function createConfigManagerStub(
  shortcuts: Record<string, string | boolean>,
): ConfigManager {
  return {
    getSection: vi.fn(() => ({ enabled: true, ...shortcuts })),
    get: vi.fn(() => undefined),
    set: vi.fn(),
  } as unknown as ConfigManager
}

describe('LiveEditor two-slot toggle shortcuts', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    heldAccelerators.clear()
  })

  it('opens LiveEditor from either of the two configured toggle keys', () => {
    // Arrange
    const { windowManager, toggleLiveEditor } = createWindowManagerHarness()
    const shortcutManager = new ShortcutManager(
      windowManager,
      null,
      createConfigManagerStub({
        toggleLiveEditor: 'Alt+Space',
        toggleLiveEditorSecondary: 'Control+Shift+B',
      }),
    )

    // Act
    shortcutManager.registerGlobalShortcuts()

    // Assert — both accelerators are live…
    expect(globalRegisterMock).toHaveBeenCalledWith(
      'Alt+Space',
      expect.any(Function),
    )
    expect(globalRegisterMock).toHaveBeenCalledWith(
      'Control+Shift+B',
      expect.any(Function),
    )

    // …and both fire the same LiveEditor toggle.
    for (const accelerator of ['Alt+Space', 'Control+Shift+B']) {
      const call = globalRegisterMock.mock.calls.find(
        ([registered]) => registered === accelerator,
      )
      call?.[1]()
    }
    expect(toggleLiveEditor).toHaveBeenCalledTimes(2)
  })

  it('refuses a settings save that would point both toggle keys at one key', () => {
    // Arrange: the generic Shortcut Settings screen submits every registered id,
    // including the second slot (which has no row there), so a user rebinding the
    // visible "Toggle LiveEditor" row onto the second slot's key arrives as a
    // duplicate batch. Accepting it would orphan one of the two bindings.
    const { windowManager } = createWindowManagerHarness()
    const shortcutManager = new ShortcutManager(
      windowManager,
      null,
      createConfigManagerStub({
        toggleLiveEditor: 'Alt+Space',
        toggleLiveEditorSecondary: 'Control+Shift+B',
      }),
    )
    shortcutManager.registerGlobalShortcuts()
    globalRegisterMock.mockClear()

    // Act
    const didUpdate = shortcutManager.updateShortcuts({
      toggleLiveEditor: 'Control+Shift+B',
      toggleLiveEditorSecondary: 'Control+Shift+B',
    })

    // Assert: rejected outright, and nothing was re-registered along the way.
    expect(didUpdate).toBe(false)
    expect(globalRegisterMock).not.toHaveBeenCalled()
    expect(shortcutManager.getRegisteredShortcuts().toggleLiveEditor).toBe(
      'Alt+Space',
    )
  })

  it('still lets the two toggle keys swap accelerators in one save', () => {
    // Arrange: a swap ends with two DIFFERENT keys, so it must survive both the
    // duplicate guard AND the batch's own live registrations — the key each slot
    // moves onto is still held by the other slot when the batch starts.
    const { windowManager } = createWindowManagerHarness()
    const shortcutManager = new ShortcutManager(
      windowManager,
      null,
      createConfigManagerStub({
        toggleLiveEditor: 'Alt+Space',
        toggleLiveEditorSecondary: 'Control+Shift+B',
      }),
    )
    shortcutManager.registerGlobalShortcuts()

    // Act
    const didUpdate = shortcutManager.updateShortcuts({
      toggleLiveEditor: 'Control+Shift+B',
      toggleLiveEditorSecondary: 'Alt+Space',
    })

    // Assert
    expect(didUpdate).toBe(true)
    expect(shortcutManager.getRegisteredShortcuts().toggleLiveEditor).toBe(
      'Control+Shift+B',
    )
    expect(
      shortcutManager.getRegisteredShortcuts().toggleLiveEditorSecondary,
    ).toBe('Alt+Space')
  })

  it('keeps an already-registered contextual shortcut alive when only a global key changes', () => {
    // Arrange: a settings save carries EVERY id, so the untouched contextual
    // `newTask` rides along. Pass 2 never re-registers contextual shortcuts, so
    // unregistering it here would leave Cmd+N dead until the next blur→focus.
    const { windowManager } = createWindowManagerHarness()
    const shortcutManager = new ShortcutManager(
      windowManager,
      null,
      createConfigManagerStub({
        newTask: 'CommandOrControl+N',
        toggleLiveEditor: 'Alt+Space',
      }),
    )
    shortcutManager.registerContextualShortcuts()
    expect(shortcutManager.getRegisteredShortcuts().newTask).toBe(
      'CommandOrControl+N',
    )

    // Act: rebind only the LiveEditor key; newTask is resubmitted unchanged.
    shortcutManager.updateShortcuts({
      newTask: 'CommandOrControl+N',
      toggleLiveEditor: 'Control+Shift+B',
    })

    // Assert
    expect(shortcutManager.getRegisteredShortcuts().newTask).toBe(
      'CommandOrControl+N',
    )
    expect(shortcutManager.getRegisteredShortcuts().toggleLiveEditor).toBe(
      'Control+Shift+B',
    )
  })

  it('keeps a conflict-substituted contextual shortcut alive across a global save', () => {
    // Arrange: another app already owns Cmd+N, so newTask lands on a fallback
    // accelerator. A caller that submits the CONFIGURED value (what the user
    // asked for) must still read as "unchanged" — otherwise every unrelated save
    // silently unregisters the fallback that is actually doing the work.
    heldAccelerators.add('CommandOrControl+N')
    const { windowManager } = createWindowManagerHarness()
    const shortcutManager = new ShortcutManager(
      windowManager,
      null,
      createConfigManagerStub({
        newTask: 'CommandOrControl+N',
        toggleLiveEditor: 'Alt+Space',
      }),
    )
    shortcutManager.registerContextualShortcuts()
    // Hard-coded so a change in the alternative-generation order is caught here
    // rather than silently shifting which key the user ends up with.
    expect(shortcutManager.getRegisteredShortcuts().newTask).toBe(
      'CommandOrControl+Alt+N',
    )

    // Act: save an unrelated global key, resubmitting newTask's configured value.
    shortcutManager.updateShortcuts({
      newTask: 'CommandOrControl+N',
      toggleLiveEditor: 'Control+Shift+B',
    })

    // Assert: the fallback survives untouched.
    expect(shortcutManager.getRegisteredShortcuts().newTask).toBe(
      'CommandOrControl+Alt+N',
    )
  })

  it('refuses a duplicate toggle key typed in a different case', () => {
    // Arrange: Electron accelerators are case-insensitive, so `alt+space` and
    // `Alt+Space` are the same key — a config edited by hand must not sneak both
    // slots onto it past the duplicate guard.
    const { windowManager } = createWindowManagerHarness()
    const shortcutManager = new ShortcutManager(
      windowManager,
      null,
      createConfigManagerStub({ toggleLiveEditor: 'Alt+Space' }),
    )
    shortcutManager.registerGlobalShortcuts()

    // Act
    const didUpdate = shortcutManager.updateShortcuts({
      toggleLiveEditorSecondary: ' alt+space ',
    })

    // Assert
    expect(didUpdate).toBe(false)
    expect(
      shortcutManager.getRegisteredShortcuts().toggleLiveEditorSecondary,
    ).toBeUndefined()
  })

  it('leaves the second toggle key unbound until the user sets one', () => {
    // Arrange
    const { windowManager } = createWindowManagerHarness()
    const shortcutManager = new ShortcutManager(
      windowManager,
      null,
      createConfigManagerStub({ toggleLiveEditor: 'Alt+Space' }),
    )

    // Act
    shortcutManager.registerGlobalShortcuts()

    // Assert — the empty second slot must never reach globalShortcut as ''
    expect(
      shortcutManager.getDefaultShortcuts().toggleLiveEditorSecondary,
    ).toBe('')
    expect(globalRegisterMock).not.toHaveBeenCalledWith('', expect.anything())
    expect(shortcutManager.getRegisteredShortcuts()).not.toHaveProperty(
      'toggleLiveEditorSecondary',
    )
  })
})
