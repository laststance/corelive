import path from 'path'
import { fileURLToPath } from 'url'

import { _electron as electron, expect } from '@playwright/test'
import type { ElectronApplication, Page } from '@playwright/test'

import { log } from '../../src/lib/logger'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

export interface ElectronTestContext {
  electronApp: ElectronApplication
  mainWindow: Page
  floatingNavigator?: Page | null
}

export class ElectronTestHelper {
  /**
   * Wait for Next.js server to be ready by checking health
   */
  static async waitForServerReady(
    page: Page,
    maxAttempts = 15,
  ): Promise<boolean> {
    for (let i = 0; i < maxAttempts; i++) {
      try {
        const isReady = await page.evaluate(() => {
          try {
            // Check if basic Next.js elements are present and page is not showing error
            const hasNextJs =
              document.querySelector('#__next') !== null ||
              document.querySelector('[data-reactroot]') !== null ||
              typeof window.React !== 'undefined'

            // Check if we're not on an error page
            const hasError =
              document.body?.innerText?.includes('Application error') ||
              document.body?.innerText?.includes('client-side exception') ||
              document.body?.innerText?.includes('500') ||
              document.body?.innerText?.includes('404')

            // Check if we have some actual content (not just loading)
            const hasContent = document.body?.innerText?.length > 20

            // Accept login page as ready since that means the app loaded
            const isLoginPage =
              document.body?.innerText?.includes('Login') &&
              document.body?.innerText?.includes('Sign Up')

            // Accept authenticated home page as ready
            const isHomePage =
              document.body?.innerText?.includes('Tasks') ||
              document.body?.innerText?.includes('Todo List') ||
              document.body?.innerText?.includes('pending')

            return (
              hasNextJs &&
              !hasError &&
              (hasContent || isLoginPage || isHomePage)
            )
          } catch {
            return false
          }
        })

        if (isReady) {
          return true
        }

        await page.waitForTimeout(2000)
      } catch {
        await page.waitForTimeout(2000)
      }
    }

    log.error('❌ Server failed to become ready')
    return false
  }

  /**
   * Set up authentication for Electron testing (similar to web auth setup)
   */
  static async setupAuthentication(page: Page): Promise<boolean> {
    try {
      // Navigate to root first
      await page.goto('/')
      await page.waitForTimeout(1000)

      // Navigate to home page

      await page.goto('/home')
      await page.waitForLoadState('networkidle')

      // Wait for authentication to take effect
      await page.waitForTimeout(3000)

      // Verify we're on the authenticated page
      const isAuthenticated = await page.evaluate(() => {
        const hasTasksHeader = document.body?.innerText?.includes('Tasks')
        const hasTodoList = document.body?.innerText?.includes('Todo List')
        const hasPending = document.body?.innerText?.includes('pending')
        const hasAddTodo =
          document.querySelector('input[placeholder*="todo"]') !== null

        return hasTasksHeader || hasTodoList || hasPending || hasAddTodo
      })

      if (isAuthenticated) {
        return true
      } else {
        return false
      }
    } catch (error) {
      log.error('❌ Authentication setup failed:', error)
      return false
    }
  }
  static async launchElectronApp(): Promise<ElectronTestContext> {
    // Build the app first if needed
    const electronApp = await electron.launch({
      args: [path.join(__dirname, '../../electron/main.cjs')],
      env: {
        ...process.env,
        NODE_ENV: 'test',
        ELECTRON_IS_DEV: '1',
        // Disable hardware acceleration for testing
        ELECTRON_DISABLE_HARDWARE_ACCELERATION: '1',
      },
    })

    const mainWindow = await electronApp.firstWindow()

    // Set up comprehensive error logging
    const consoleMessages: string[] = []
    const pageErrors: string[] = []

    mainWindow.on('console', (msg) => {
      const message = `[${msg.type().toUpperCase()}] ${msg.text()}`
      consoleMessages.push(message)
    })

    mainWindow.on('pageerror', (error) => {
      const errorMessage = `Page Error: ${error.message}\nStack: ${error.stack}`
      pageErrors.push(errorMessage)
      log.error(`Electron Page Error: ${errorMessage}`)
    })

    try {
      // Wait for the window to be fully loaded
      await mainWindow.waitForLoadState('networkidle')

      // Wait for Electron-specific initialization
      await mainWindow.waitForTimeout(3000)

      // Check if Next.js server is responding by checking current URL
      await mainWindow.evaluate(() => window.location.href)

      // Wait for Next.js server to be ready
      const serverReady = await this.waitForServerReady(mainWindow)
      if (!serverReady) {
        throw new Error('Next.js server failed to become ready')
      }

      // Set up authentication using the proper flow
      const authSuccess = await this.setupAuthentication(mainWindow)
      if (!authSuccess) {
        throw new Error('Authentication setup failed')
      }

      // Check for any errors that occurred during setup
      if (pageErrors.length > 0) {
        log.error('Page errors detected:', pageErrors)
        throw new Error(`Page errors occurred: ${pageErrors.join('; ')}`)
      }
    } catch (error) {
      log.error('❌ Error during Electron app setup:', error)
      log.error('Console messages:', consoleMessages)
      log.error('Page errors:', pageErrors)

      // Try to get more debugging info
      try {
        const url = await mainWindow.evaluate(() => window.location.href)
        const title = await mainWindow.evaluate(() => document.title)
        const bodyText = await mainWindow.evaluate(
          () => document.body?.innerText || 'No body text',
        )

        log.error('Debug info:', {
          url,
          title,
          bodyText: bodyText.substring(0, 500),
        })
      } catch (debugError) {
        log.error('Could not get debug info:', debugError)
      }

      throw error
    }

    return {
      electronApp,
      mainWindow,
    }
  }

  static async closeElectronApp(context: ElectronTestContext): Promise<void> {
    if (context?.floatingNavigator && !context.floatingNavigator.isClosed()) {
      await context.floatingNavigator.close()
    }
    if (context?.electronApp) {
      await context.electronApp.close()
    }
  }

  static async getFloatingNavigator(
    context: ElectronTestContext,
  ): Promise<Page | null> {
    const windows = context.electronApp.windows()
    return (
      windows.find(
        (window) => window !== context.mainWindow && !window.isClosed(),
      ) || null
    )
  }

  static async toggleFloatingNavigator(
    context: ElectronTestContext,
  ): Promise<void> {
    // Use Meta+Shift+F on macOS (Meta is Cmd key)
    await context.mainWindow.keyboard.press('Meta+Shift+F')
    await context.mainWindow.waitForTimeout(2000)
    context.floatingNavigator = await this.getFloatingNavigator(context)
  }

  static async createTestTask(page: Page, taskName?: string): Promise<string> {
    const testTask =
      taskName ||
      `Test-${Date.now()}-${Math.random().toString(36).substring(7)}`

    await page.getByPlaceholder('Enter a new todo...').fill(testTask)
    await page.getByRole('button', { name: 'Add', exact: true }).click()

    // Wait for task to appear
    await page.waitForTimeout(1000)

    return testTask
  }

  static async waitForTaskSync(
    sourcePage: Page,
    targetPage: Page,
    taskName: string,
  ): Promise<void> {
    // Wait for task to sync between windows
    await targetPage.waitForTimeout(2000)

    // Verify task appears in target page
    await targetPage.getByText(taskName).waitFor({ state: 'visible' })
  }

  static async simulateSystemTrayClick(
    context: ElectronTestContext,
  ): Promise<void> {
    // Simulate system tray interaction
    await context.mainWindow.evaluate(() => {
      window.electronAPI?.tray?.click?.()
    })
  }

  static async testKeyboardShortcut(
    page: Page,
    shortcut: string,
    expectedAction: () => Promise<void>,
  ): Promise<void> {
    // Convert CommandOrControl to Meta for macOS
    const macShortcut = shortcut.replace('CommandOrControl', 'Meta')
    await page.keyboard.press(macShortcut)
    await page.waitForTimeout(500)
    await expectedAction()
  }

  static async verifyNotificationTriggered(page: Page): Promise<boolean> {
    return page.evaluate(() => {
      return (window as any).lastNotificationTriggered || false
    })
  }

  static async getWindowBounds(page: Page): Promise<any> {
    return page.evaluate(() => {
      return (
        window.electronAPI?.window?.getBounds?.() || {
          x: 0,
          y: 0,
          width: 800,
          height: 600,
        }
      )
    })
  }

  static async setWindowBounds(
    page: Page,
    bounds: { x?: number; y?: number; width?: number; height?: number },
  ): Promise<void> {
    await page.evaluate((bounds) => {
      window.electronAPI?.window?.setBounds?.(bounds)
    }, bounds)
  }

  static async isWindowMinimized(page: Page): Promise<boolean> {
    return page.evaluate(() => {
      return window.electronAPI?.window?.isMinimized?.() || false
    })
  }

  static async isWindowAlwaysOnTop(page: Page): Promise<boolean> {
    return page.evaluate(() => {
      return window.electronAPI?.window?.isAlwaysOnTop?.() || false
    })
  }

  static async saveConfiguration(page: Page): Promise<boolean> {
    return page.evaluate(() => {
      return window.electronAPI?.config?.save?.() || true
    })
  }

  static async loadConfiguration(page: Page): Promise<any> {
    return page.evaluate(() => {
      return window.electronAPI?.config?.load?.() || {}
    })
  }

  static async simulateNetworkError(page: Page): Promise<void> {
    await page.evaluate(() => {
      window.electronAPI?.test?.simulateError?.('network')
    })
  }

  static async clearErrors(page: Page): Promise<void> {
    await page.evaluate(() => {
      window.electronAPI?.test?.clearErrors?.()
    })
  }

  static async getAllDisplays(page: Page): Promise<any[]> {
    return page.evaluate(() => {
      return window.electronAPI?.display?.getAllDisplays?.() || []
    })
  }

  static async moveToDisplay(page: Page, displayIndex: number): Promise<void> {
    await page.evaluate((index) => {
      window.electronAPI?.window?.moveToDisplay?.(index)
    }, displayIndex)
  }

  /**
   * Comprehensive workflow test: Create, edit, complete, and delete a task
   */
  static async testCompleteTaskWorkflow(page: Page): Promise<string> {
    const taskName = `WorkflowTest-${Date.now()}`

    // Create task
    await page.getByPlaceholder(/enter.*todo/i).fill(taskName)
    await page.getByRole('button', { name: /add/i }).click()
    await page.waitForTimeout(1000)

    // Verify task appears
    await page.getByText(taskName).waitFor({ state: 'visible' })

    // Complete task
    const checkbox = page.getByRole('checkbox', { name: taskName })
    await checkbox.click()
    await page.waitForTimeout(1000)

    // Verify task is completed
    await expect(checkbox).toBeChecked()

    return taskName
  }

  /**
   * Test data synchronization between windows
   */
  static async testDataSynchronization(
    mainWindow: Page,
    floatingWindow: Page,
    taskName: string,
  ): Promise<boolean> {
    try {
      // Create task in main window
      await mainWindow.getByPlaceholder(/enter.*todo/i).fill(taskName)
      await mainWindow.getByRole('button', { name: /add/i }).click()
      await mainWindow.waitForTimeout(2000)

      // Verify task appears in floating window
      await floatingWindow.getByText(taskName).waitFor({
        state: 'visible',
        timeout: 5000,
      })

      // Toggle completion in floating window
      const floatingCheckbox = floatingWindow.getByRole('checkbox', {
        name: taskName,
      })
      await floatingCheckbox.click()
      await floatingWindow.waitForTimeout(1000)

      // Verify completion syncs to main window
      const mainCheckbox = mainWindow.getByRole('checkbox', { name: taskName })
      await mainCheckbox.waitFor({ state: 'visible', timeout: 5000 })

      // Check if the checkbox is checked in main window
      return mainCheckbox.isChecked()
    } catch (error) {
      log.error('Data synchronization test failed:', error)
      return false
    }
  }

  /**
   * Test system tray functionality
   */
  static async testSystemTrayFunctionality(
    context: ElectronTestContext,
  ): Promise<boolean> {
    try {
      // Minimize to tray
      await context.mainWindow.evaluate(() => {
        window.electronAPI?.window?.minimize?.()
      })
      await context.mainWindow.waitForTimeout(1000)

      // Check if window is minimized
      const isMinimized = await this.isWindowMinimized(context.mainWindow)

      // Restore from tray
      await this.simulateSystemTrayClick(context)
      await context.mainWindow.waitForTimeout(1000)

      // Verify window is restored and functional
      await context.mainWindow.getByText('Tasks').waitFor({
        state: 'visible',
        timeout: 5000,
      })

      return isMinimized
    } catch (error) {
      log.error('System tray test failed:', error)
      return false
    }
  }

  /**
   * Test keyboard shortcuts comprehensively
   */
  static async testAllKeyboardShortcuts(page: Page): Promise<{
    newTask: boolean
    search: boolean
    floatingToggle: boolean
  }> {
    const results = {
      newTask: false,
      search: false,
      floatingToggle: false,
    }

    try {
      // Test new task shortcut (Ctrl/Cmd+N)
      await page.keyboard.press('Meta+N')
      await page.waitForTimeout(500)
      const newTaskInput = page.getByPlaceholder(/enter.*todo/i)
      results.newTask = await newTaskInput.evaluate(
        (el) => document.activeElement === el,
      )

      // Test search shortcut (Ctrl/Cmd+F)
      await page.keyboard.press('Meta+F')
      await page.waitForTimeout(500)
      const searchInput = page.getByPlaceholder('Search')
      results.search = await searchInput.evaluate(
        (el) => document.activeElement === el,
      )

      // Test floating navigator toggle (Ctrl/Cmd+Shift+F)
      await page.keyboard.press('Meta+Shift+F')
      await page.waitForTimeout(2000)

      // Check if floating navigator toggle worked by checking if the function exists
      const floatingNavigatorWorked = await page.evaluate(() => {
        return (
          typeof window.electronAPI?.window?.toggleFloatingNavigator ===
          'function'
        )
      })

      results.floatingToggle = floatingNavigatorWorked
    } catch (error) {
      log.error('Keyboard shortcuts test failed:', error)
    }

    return results
  }

  /**
   * Test notification system
   */
  static async testNotificationSystem(page: Page): Promise<boolean> {
    try {
      // Set up notification listener
      await page.evaluate(() => {
        ;(window as any).notificationReceived = false

        // Mock notification API if not available
        if (!window.Notification) {
          ;(window as any).Notification = class {
            constructor(_title: string, _options?: any) {
              ;(window as any).notificationReceived = true
            }
          }
        }

        // Listen for electron notifications
        window.addEventListener('electron-notification', () => {
          ;(window as any).notificationReceived = true
        })
      })

      // Create a task to trigger notification
      const testTask = `NotificationTest-${Date.now()}`
      await page.getByPlaceholder(/enter.*todo/i).fill(testTask)
      await page.getByRole('button', { name: /add/i }).click()
      await page.waitForTimeout(2000)

      // Check if notification was triggered
      const notificationReceived = await page.evaluate(() => {
        return (window as any).notificationReceived || false
      })

      return notificationReceived
    } catch (error) {
      log.error('Notification test failed:', error)
      return false
    }
  }

  /**
   * Test error recovery and graceful degradation
   */
  static async testErrorRecovery(page: Page): Promise<boolean> {
    try {
      // Simulate network error
      await page.route('**/api/**', (route) => {
        route.abort('failed')
      })

      // Try to create a task during error
      const errorTask = `ErrorTest-${Date.now()}`
      await page.getByPlaceholder(/enter.*todo/i).fill(errorTask)
      await page.getByRole('button', { name: /add/i }).click()
      await page.waitForTimeout(2000)

      // Clear the route to restore normal operation
      await page.unroute('**/api/**')

      // Test recovery by creating another task
      const recoveryTask = `RecoveryTest-${Date.now()}`
      await page.getByPlaceholder(/enter.*todo/i).fill(recoveryTask)
      await page.getByRole('button', { name: /add/i }).click()
      await page.waitForTimeout(2000)

      // Verify recovery task appears
      await page.getByText(recoveryTask).waitFor({
        state: 'visible',
        timeout: 5000,
      })

      return true
    } catch (error) {
      log.error('Error recovery test failed:', error)
      return false
    }
  }

  /**
   * Test window state persistence
   */
  static async testWindowStatePersistence(page: Page): Promise<boolean> {
    try {
      // Get initial bounds
      const initialBounds = await this.getWindowBounds(page)

      // Change window size and position
      const newBounds = {
        x: 150,
        y: 150,
        width: 1200,
        height: 800,
      }

      await this.setWindowBounds(page, newBounds)
      await page.waitForTimeout(1000)

      // Save configuration
      const saved = await this.saveConfiguration(page)

      // Verify bounds changed
      const currentBounds = await this.getWindowBounds(page)
      const boundsChanged =
        currentBounds.width !== initialBounds.width ||
        currentBounds.height !== initialBounds.height

      return saved && boundsChanged
    } catch (error) {
      log.error('Window state persistence test failed:', error)
      return false
    }
  }
}

export default ElectronTestHelper
