import { BrowserWindow, globalShortcut } from 'electron'
import { beforeEach, expect, test, vi } from 'vitest'

import ShortcutManager from '../ShortcutManager'
import type { WindowManager } from '../WindowManager'

vi.mock('electron', () => ({
  app: { on: vi.fn(), removeListener: vi.fn() },
  BrowserWindow: { getFocusedWindow: vi.fn(() => null) },
  globalShortcut: {
    isRegistered: vi.fn(() => false),
    register: vi.fn(() => true),
    unregister: vi.fn(),
  },
}))

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(BrowserWindow.getFocusedWindow).mockReturnValue(null)
})

/** Creates the shortcut manager used by settings-save regressions without opening native windows.
 * @returns A manager whose accelerator registrations are observable through Electron mocks.
 * @example const manager = createManager()
 */
function createManager(): ShortcutManager {
  return new ShortcutManager({} as WindowManager, null)
}

test('saving a changed focused-window shortcut applies it immediately while keeping the unchanged binding', () => {
  // Arrange
  const manager = createManager()
  vi.mocked(BrowserWindow.getFocusedWindow).mockReturnValue({} as BrowserWindow)
  manager.initialize()
  vi.mocked(globalShortcut.register).mockClear()

  // Act
  const saved = manager.updateShortcuts({ newTask: 'CommandOrControl+Shift+N' })

  // Assert
  expect(saved).toBe(true)
  expect(manager.getRegisteredShortcuts()).toMatchObject({
    newTask: 'CommandOrControl+Shift+N',
    minimize: 'CommandOrControl+M',
  })
  expect(globalShortcut.unregister).toHaveBeenCalledWith('CommandOrControl+N')
  expect(globalShortcut.register).not.toHaveBeenCalledWith(
    'CommandOrControl+M',
    expect.any(Function),
  )
})

test('saving the master shortcut switch off releases both global and focused-window shortcuts immediately', () => {
  // Arrange
  const manager = createManager()
  vi.mocked(BrowserWindow.getFocusedWindow).mockReturnValue({} as BrowserWindow)
  manager.initialize()

  // Act
  const saved = manager.updateShortcuts({ enabled: false })

  // Assert
  expect(saved).toBe(true)
  expect(manager.getRegisteredShortcuts()).toEqual({})
  expect(globalShortcut.unregister).toHaveBeenCalledWith('CommandOrControl+N')
  expect(globalShortcut.unregister).toHaveBeenCalledWith('CommandOrControl+M')
  expect(globalShortcut.unregister).toHaveBeenCalledWith('Alt+Space')
})

test('saving the master shortcut switch on restores focused-window shortcuts without a focus change', () => {
  // Arrange
  const manager = createManager()
  vi.mocked(BrowserWindow.getFocusedWindow).mockReturnValue({} as BrowserWindow)
  manager.initialize()
  manager.updateShortcuts({ enabled: false })

  // Act
  const saved = manager.updateShortcuts({ enabled: true })

  // Assert
  expect(saved).toBe(true)
  expect(manager.getRegisteredShortcuts()).toMatchObject({
    newTask: 'CommandOrControl+N',
    minimize: 'CommandOrControl+M',
  })
})

test('saving shortcuts while another app is focused never captures its new-window or minimize keys', () => {
  // Arrange
  const manager = createManager()
  manager.initialize()

  // Act
  manager.updateShortcuts({ newTask: 'CommandOrControl+Shift+N' })

  // Assert
  expect(manager.getRegisteredShortcuts()).not.toHaveProperty('newTask')
  expect(manager.getRegisteredShortcuts()).not.toHaveProperty('minimize')
})

test('disabling one focused-window shortcut preserves the other without substituting a fallback key', () => {
  // Arrange
  const manager = createManager()
  vi.mocked(BrowserWindow.getFocusedWindow).mockReturnValue({} as BrowserWindow)
  manager.initialize()
  vi.mocked(globalShortcut.register).mockClear()

  // Act
  manager.updateShortcuts({ newTask: '' })

  // Assert
  expect(manager.getRegisteredShortcuts()).not.toHaveProperty('newTask')
  expect(manager.getRegisteredShortcuts()).toHaveProperty(
    'minimize',
    'CommandOrControl+M',
  )
  expect(globalShortcut.register).not.toHaveBeenCalled()
})
