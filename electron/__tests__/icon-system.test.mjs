import fs from 'fs'
import os from 'os'
import path from 'path'

import sharp from 'sharp'
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'

import { generateMacTemplateTrayIcons } from '../../scripts/generate-icons.js'

/**
 * Temporarily overrides process.platform so macOS-only tray behavior can run on CI.
 * @param platform - The platform value exposed during the callback.
 * @param callback - The assertions or setup that need the temporary platform.
 * @returns The callback's return value.
 * @example
 * withPlatform('darwin', () => process.platform) // => 'darwin'
 */
function withPlatform(platform, callback) {
  const originalPlatform = Object.getOwnPropertyDescriptor(process, 'platform')
  Object.defineProperty(process, 'platform', { value: platform })
  try {
    return callback()
  } finally {
    Object.defineProperty(process, 'platform', originalPlatform)
  }
}

describe('Icon System', () => {
  const iconDir = path.join(process.cwd(), 'build', 'icons')
  const trayDir = path.join(iconDir, 'tray')

  describe('Icon Generation', () => {
    it('should have generated all required PNG icons', () => {
      const requiredSizes = [16, 24, 32, 48, 64, 128, 256, 512, 1024]

      for (const size of requiredSizes) {
        const iconPath = path.join(iconDir, `icon-${size}x${size}.png`)
        expect(fs.existsSync(iconPath)).toBe(true)
      }
    })

    it('should have generated tray icons for all states', () => {
      const trayStates = ['default', 'active', 'notification', 'disabled']
      const traySizes = [16, 20, 24, 32]

      for (const state of trayStates) {
        for (const size of traySizes) {
          const suffix = state === 'default' ? '' : `-${state}`
          const iconPath = path.join(
            trayDir,
            `tray-${size}x${size}${suffix}.png`,
          )
          expect(fs.existsSync(iconPath)).toBe(true)
        }
      }
    })

    it('generates macOS Template tray icons in a clean output directory', async () => {
      // Arrange
      const outputDir = fs.mkdtempSync(
        path.join(os.tmpdir(), 'corelive-tray-icons-'),
      )
      const expectedTemplateIcons = [
        { filename: 'trayTemplate.png', size: 16 },
        { filename: 'trayTemplate@2x.png', size: 32 },
        { filename: 'checkTemplate.png', size: 16 },
        { filename: 'checkTemplate@2x.png', size: 32 },
      ]

      try {
        // Act
        await generateMacTemplateTrayIcons(outputDir)

        // Assert
        for (const templateIcon of expectedTemplateIcons) {
          const templateIconPath = path.join(outputDir, templateIcon.filename)
          const metadata = await sharp(templateIconPath).metadata()
          const stats = await sharp(templateIconPath).stats()

          expect(metadata.width).toBe(templateIcon.size)
          expect(metadata.height).toBe(templateIcon.size)
          expect(stats.channels[0].max).toBe(0)
          expect(stats.channels[1].max).toBe(0)
          expect(stats.channels[2].max).toBe(0)
          expect(stats.channels[3].max).toBeGreaterThan(0)
        }
      } finally {
        fs.rmSync(outputDir, { recursive: true, force: true })
      }
    })

    it('should have generated app store icons', () => {
      const appIconSizes = [512, 1024]
      for (const size of appIconSizes) {
        const iconPath = path.join(iconDir, `app-icon-${size}x${size}.png`)
        expect(fs.existsSync(iconPath)).toBe(true)
      }
    })

    it('should have generated icon manifest', () => {
      const manifestPath = path.join(iconDir, 'icon-manifest.json')
      expect(fs.existsSync(manifestPath)).toBe(true)

      const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'))
      expect(manifest).toHaveProperty('generated')
      expect(manifest).toHaveProperty('icons')
      expect(manifest.icons).toHaveProperty('png')
      expect(manifest.icons).toHaveProperty('tray')
      expect(manifest.icons).toHaveProperty('appIcons')
    })

    it('should have generated web favicons', () => {
      const publicDir = path.join(process.cwd(), 'public')
      const faviconSizes = [16, 32, 48, 64, 128, 192, 512]

      for (const size of faviconSizes) {
        const faviconPath = path.join(publicDir, `favicon-${size}x${size}.png`)
        expect(fs.existsSync(faviconPath)).toBe(true)
      }

      // Check for favicon.ico
      const faviconIcoPath = path.join(publicDir, 'favicon.ico')
      expect(fs.existsSync(faviconIcoPath)).toBe(true)
    })
  })

  describe('SystemTrayManager Icon Handling', () => {
    let SystemTrayManager
    let trayManager
    let mockWindowManager
    let mockNativeImageInstance

    beforeEach(async () => {
      mockNativeImageInstance = {
        isEmpty: vi.fn(() => false),
        setTemplateImage: vi.fn(),
        resize: vi.fn(() => mockNativeImageInstance),
      }

      // Mock Electron modules
      vi.doMock('electron', () => ({
        app: {
          isPackaged: false, // Development mode for tests
        },
        Tray: vi.fn().mockImplementation(() => ({
          setImage: vi.fn(),
          setToolTip: vi.fn(),
          setContextMenu: vi.fn(),
          on: vi.fn(),
          destroy: vi.fn(),
          isDestroyed: vi.fn(() => false),
        })),
        Menu: {
          buildFromTemplate: vi.fn(() => ({})),
        },
        nativeImage: {
          createFromPath: vi.fn(() => mockNativeImageInstance),
        },
        Notification: vi.fn(),
      }))

      // Mock the global nativeImage for the SystemTrayManager
      global.nativeImage = {
        createFromPath: vi.fn(() => ({
          isEmpty: vi.fn(() => false),
          resize: vi.fn(() => ({})),
        })),
      }

      // Import after mocking
      const SystemTrayManagerModule = await import('../SystemTrayManager.ts')
      SystemTrayManager = SystemTrayManagerModule.default

      mockWindowManager = {
        getMainWindow: vi.fn(() => ({ show: vi.fn() })),
        restoreFromTray: vi.fn(),
        minimizeToTray: vi.fn(),
      }

      trayManager = new SystemTrayManager(mockWindowManager)
    })

    afterEach(() => {
      if (trayManager) {
        trayManager.destroy()
      }
    })

    describe('getTrayIconPath', () => {
      // Note: getTrayIconPath tests require a real Electron environment
      // because it uses require('electron').app.isPackaged internally.
      // The actual icon paths are verified through integration tests and
      // the Icon Generation tests above which check that files exist.

      it('should be a function that accepts a state parameter', () => {
        expect(typeof trayManager.getTrayIconPath).toBe('function')
        expect(trayManager.getTrayIconPath.length).toBe(0) // Has default parameter
      })
    })

    describe('createTrayIcon', () => {
      it('marks Template icons without resizing away the macOS template image', () => {
        withPlatform('darwin', () => {
          // Arrange
          trayManager.getTrayIconPath = vi.fn(
            () => '/mock/path/trayTemplate.png',
          )

          // Act
          const icon = trayManager.createTrayIcon()

          // Assert
          expect(icon).toBe(mockNativeImageInstance)
          expect(mockNativeImageInstance.setTemplateImage).toHaveBeenCalledWith(
            true,
          )
          expect(mockNativeImageInstance.resize).not.toHaveBeenCalled()
        })
      })
    })

    describe('getTrayIconSize', () => {
      it('should return 16 for macOS menu bar', () => {
        // This app only supports macOS, so getTrayIconSize always returns 16
        const size = trayManager.getTrayIconSize()
        expect(size).toBe(16)
      })
    })

    describe('fileExists', () => {
      it('should return true for existing files', () => {
        const exists = trayManager.fileExists(__filename)
        expect(exists).toBe(true)
      })

      it('should return false for non-existing files', () => {
        const exists = trayManager.fileExists('/non/existing/file.png')
        expect(exists).toBe(false)
      })

      it('should handle errors gracefully', () => {
        // Mock fs.existsSync to throw an error
        const originalExistsSync = require('fs').existsSync
        require('fs').existsSync = vi.fn(() => {
          throw new Error('Test error')
        })

        const exists = trayManager.fileExists('/some/path')
        expect(exists).toBe(false)

        // Restore original function
        require('fs').existsSync = originalExistsSync
      })
    })

    describe('setTrayIconState', () => {
      beforeEach(() => {
        // Create a mock tray
        trayManager.tray = {
          setImage: vi.fn(),
          isDestroyed: vi.fn(() => false),
          destroy: vi.fn(),
        }
        // Mock getTrayIconPath to return a valid path for testing
        trayManager.getTrayIconPath = vi.fn(
          (state) =>
            `/mock/path/tray-16x16${state === 'default' ? '' : `-${state}`}.png`,
        )
      })

      it('should set tray icon to active state', () => {
        const result = trayManager.setTrayIconState('active')
        expect(result).toBe(true)
        expect(trayManager.tray.setImage).toHaveBeenCalled()
      })

      it('should set tray icon to notification state', () => {
        const result = trayManager.setTrayIconState('notification')
        expect(result).toBe(true)
        expect(trayManager.tray.setImage).toHaveBeenCalled()
      })

      it('should set tray icon to disabled state', () => {
        const result = trayManager.setTrayIconState('disabled')
        expect(result).toBe(true)
        expect(trayManager.tray.setImage).toHaveBeenCalled()
      })

      it('should reset tray icon to default state', () => {
        const result = trayManager.setTrayIconState('default')
        expect(result).toBe(true)
        expect(trayManager.tray.setImage).toHaveBeenCalled()
      })

      it('should return false when tray is not available', () => {
        trayManager.tray = null
        const result = trayManager.setTrayIconState('active')
        expect(result).toBe(false)
      })

      it('should return false when tray is destroyed', () => {
        trayManager.tray.isDestroyed = vi.fn(() => true)
        const result = trayManager.setTrayIconState('active')
        expect(result).toBe(false)
      })

      it('should handle errors gracefully', () => {
        trayManager.tray.setImage = vi.fn(() => {
          throw new Error('Test error')
        })
        const result = trayManager.setTrayIconState('active')
        expect(result).toBe(false)
      })
    })

    describe('convenience methods', () => {
      beforeEach(() => {
        trayManager.setTrayIconState = vi.fn(() => true)
      })

      it('should call setTrayIconState with active state', () => {
        trayManager.setActiveState()
        expect(trayManager.setTrayIconState).toHaveBeenCalledWith('active')
      })

      it('should call setTrayIconState with notification state', () => {
        trayManager.setNotificationState()
        expect(trayManager.setTrayIconState).toHaveBeenCalledWith(
          'notification',
        )
      })

      it('should call setTrayIconState with disabled state', () => {
        trayManager.setDisabledState()
        expect(trayManager.setTrayIconState).toHaveBeenCalledWith('disabled')
      })

      it('should call setTrayIconState with default state', () => {
        trayManager.resetToDefaultState()
        expect(trayManager.setTrayIconState).toHaveBeenCalledWith('default')
      })
    })
  })

  describe('Icon Manifest Validation', () => {
    let manifest

    beforeEach(() => {
      const manifestPath = path.join(iconDir, 'icon-manifest.json')
      manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'))
    })

    it('should have valid structure', () => {
      expect(manifest).toHaveProperty('generated')
      expect(manifest).toHaveProperty('sources')
      expect(manifest).toHaveProperty('icons')
      expect(typeof manifest.generated).toBe('string')
      expect(manifest.sources).toHaveProperty('appRaw')
      expect(manifest.sources).toHaveProperty('appNormalized')
      expect(manifest.sources).toHaveProperty('tray')
    })

    it('should list all PNG icons', () => {
      const expectedSizes = [16, 24, 32, 48, 64, 128, 256, 512, 1024]
      for (const size of expectedSizes) {
        expect(manifest.icons.png).toHaveProperty(size.toString())
        expect(manifest.icons.png[size]).toBe(`icon-${size}x${size}.png`)
      }
    })

    it('should list all tray icon states', () => {
      const expectedStates = ['default', 'active', 'notification', 'disabled']
      for (const state of expectedStates) {
        expect(manifest.icons.tray).toHaveProperty(state)
      }
    })

    it('should list all tray icon sizes for each state', () => {
      const expectedSizes = [16, 20, 24, 32]
      const expectedStates = ['default', 'active', 'notification', 'disabled']

      for (const state of expectedStates) {
        for (const size of expectedSizes) {
          expect(manifest.icons.tray[state]).toHaveProperty(size.toString())
        }
      }
    })

    it('should list app icons', () => {
      expect(manifest.icons.appIcons).toHaveProperty('512')
      expect(manifest.icons.appIcons).toHaveProperty('1024')
      expect(manifest.icons.appIcons['512']).toBe('app-icon-512x512.png')
      expect(manifest.icons.appIcons['1024']).toBe('app-icon-1024x1024.png')
    })
  })
})
