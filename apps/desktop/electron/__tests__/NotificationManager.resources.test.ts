import { afterEach, beforeEach, expect, test, vi } from 'vitest'

const native = vi.hoisted(() => ({
  app: { isPackaged: true, getAppPath: () => '/development/app' },
  image: { isEmpty: vi.fn(() => false) },
  fromPath: vi.fn(),
  options: null as { icon?: unknown } | null,
}))

vi.mock('electron', () => ({
  app: native.app,
  nativeImage: { createFromPath: native.fromPath },
  Notification: Object.assign(
    vi.fn(function notification(options: { icon?: unknown }) {
      native.options = options
      return { on: vi.fn(), show: vi.fn(), close: vi.fn() }
    }),
    { isSupported: () => true },
  ),
}))
vi.mock('../logger', () => ({ log: { warn: vi.fn(), error: vi.fn() } }))

import { NotificationManager } from '../NotificationManager'

let resourcesDescriptor: PropertyDescriptor | undefined
beforeEach(() => {
  resourcesDescriptor = Object.getOwnPropertyDescriptor(
    process,
    'resourcesPath',
  )
  Object.defineProperty(process, 'resourcesPath', {
    value: '/applications/CoreLive QA.app/Contents/Resources',
    configurable: true,
  })
  native.app.isPackaged = true
  native.image.isEmpty.mockReturnValue(false)
  native.fromPath.mockReset().mockReturnValue(native.image)
  native.options = null
})
afterEach(() => {
  if (resourcesDescriptor)
    Object.defineProperty(process, 'resourcesPath', resourcesDescriptor)
  else Reflect.deleteProperty(process, 'resourcesPath')
})

test('packaged notifications load the fallback icon from extraResources', () => {
  // Arrange
  const manager = new NotificationManager({ restoreFromTray: vi.fn() }, null)

  // Act
  manager.showNotification('Saved', 'Your writing is kept')

  // Assert
  expect(native.fromPath).toHaveBeenCalledWith(
    '/applications/CoreLive QA.app/Contents/Resources/public/favicon.ico',
  )
  expect(native.options?.icon).toBe(native.image)
})

test('development notifications use the desktop app public output', () => {
  // Arrange
  native.app.isPackaged = false
  const manager = new NotificationManager({ restoreFromTray: vi.fn() }, null)

  // Act
  manager.showNotification('Saved', 'Your writing is kept')

  // Assert
  expect(native.fromPath).toHaveBeenCalledWith(
    '/development/app/public/favicon.ico',
  )
})

test('a missing fallback image leaves the native notification icon unspecified', () => {
  // Arrange
  native.image.isEmpty.mockReturnValue(true)
  const manager = new NotificationManager({ restoreFromTray: vi.fn() }, null)

  // Act
  const notification = manager.showNotification('Saved', 'Your writing is kept')

  // Assert
  expect(notification).not.toBeNull()
  expect(native.options?.icon).toBeUndefined()
})

test('notifications retain the tray icon ahead of the fallback asset', () => {
  // Arrange
  const tray = {
    hasTray: () => true,
    setTrayTooltip: vi.fn(),
    getTrayIconPath: () => '/tray/icon.png',
  }
  const manager = new NotificationManager({ restoreFromTray: vi.fn() }, tray)

  // Act
  manager.showNotification('Saved', 'Your writing is kept')

  // Assert
  expect(native.fromPath).toHaveBeenCalledWith('/tray/icon.png')
  expect(native.fromPath).toHaveBeenCalledTimes(1)
})
