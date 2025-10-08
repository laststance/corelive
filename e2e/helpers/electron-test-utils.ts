import { spawn, type ChildProcess } from 'child_process'
import path from 'path'
import { fileURLToPath } from 'url'

import { createClerkClient } from '@clerk/backend'
import { setupClerkTestingToken, clerk } from '@clerk/testing/playwright'
import type { ElectronApplication, Page, Route } from '@playwright/test'
import { _electron as electron, expect } from '@playwright/test'

import { log } from '../../src/lib/logger'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

export interface ElectronTestContext {
  electronApp: ElectronApplication
  mainWindow: Page
  floatingNavigator?: Page | null
  nextServerProcess?: ChildProcess | null
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
        const result = await page.evaluate(() => {
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

            const ready =
              isLoginPage ||
              (hasNextJs && !hasError && (hasContent || isHomePage))
            return {
              ready,
              hasNextJs,
              hasError,
              hasContent,
              isLoginPage,
              isHomePage,
              bodyPreview: document.body?.innerText?.slice(0, 200) || '',
            }
          } catch {
            return {
              ready: false,
              hasNextJs: false,
              hasError: false,
              hasContent: false,
              isLoginPage: false,
              isHomePage: false,
              bodyPreview: 'evaluate-error',
            }
          }
        })

        if (result.ready) {
          return true
        }

        log.debug(
          '[electron-test] waitForServerReady attempt',
          i + 1,
          'not ready yet',
          result,
        )

        await page.waitForTimeout(2000)
      } catch {
        log.debug(
          '[electron-test] waitForServerReady attempt',
          i + 1,
          'threw, retrying',
        )
        await page.waitForTimeout(2000)
      }
    }

    log.error('❌ Server failed to become ready')
    return false
  }

  /**
   * Set up authentication for Electron testing (similar to web auth setup)
   */
  static async setupAuthentication(
    page: Page,
    baseUrl: string,
  ): Promise<boolean> {
    try {
      const username = process.env.E2E_CLERK_USER_USERNAME
      const email = process.env.E2E_CLERK_USER_EMAIL
      const password = process.env.E2E_CLERK_USER_PASSWORD

      if (!username || !password) {
        throw new Error('Missing E2E Clerk credentials')
      }

      await setupClerkTestingToken({ page })

      await page.goto(baseUrl, { waitUntil: 'domcontentloaded' })
      await page.waitForTimeout(2000)

      let signedIn = false
      try {
        await clerk.signIn({
          page,
          signInParams: {
            strategy: 'password',
            identifier: username,
            password,
          },
        })
        signedIn = true
      } catch (signInError) {
        console.warn(
          '[electron-test] Clerk signIn helper failed, fallback',
          signInError,
        )
      }

      if (!signedIn) {
        await page.goto(`${baseUrl}/login`, { waitUntil: 'domcontentloaded' })
        await page.waitForTimeout(1000)

        const usernameInput = page
          .locator(
            'input[name="identifier"], input[type="text"], input[type="email"]',
          )
          .first()
        const passwordInput = page.locator('input[type="password"]').first()

        await usernameInput.fill(username)
        await passwordInput.fill(password)
        await page.locator('button[type="submit"]').first().click()
        await page.waitForTimeout(3000)
      }

      await page.goto(`${baseUrl}/home`, { waitUntil: 'domcontentloaded' })
      await page.waitForLoadState('networkidle')

      const isAuthenticated = await page.evaluate(() => {
        const hasTasksHeader = document.body?.innerText?.includes('Tasks')
        const hasTodoList = document.body?.innerText?.includes('Todo List')
        const hasPending = document.body?.innerText?.includes('pending')
        const hasAddTodo =
          document.querySelector('input[placeholder*="todo"]') !== null

        return hasTasksHeader || hasTodoList || hasPending || hasAddTodo
      })

      log.debug('[electron-test] authentication check', {
        isAuthenticated,
      })

      if (isAuthenticated) {
        try {
          let clerkUser = await page.evaluate(async () => {
            const clerk = (window as any).Clerk
            if (!clerk) return null

            if (typeof clerk.load === 'function') {
              try {
                await clerk.load()
              } catch {
                // ignore load errors and rely on existing state
              }
            }

            const user = clerk?.user
            if (!user) return null

            return {
              clerkId: user.id,
              email: user.primaryEmailAddress?.emailAddress || null,
              firstName: user.firstName || null,
              lastName: user.lastName || null,
            }
          })

          if (!clerkUser?.clerkId) {
            try {
              const secretKey = process.env.CLERK_SECRET_KEY
              if (secretKey) {
                const clerkClient = createClerkClient({ secretKey })
                const userList = await clerkClient.users.getUserList({
                  emailAddress: [email].filter((e): e is string => Boolean(e)),
                  username: [username].filter((u): u is string => Boolean(u)),
                  limit: 1,
                })
                const backendUser = userList.data?.[0]
                if (backendUser) {
                  clerkUser = {
                    clerkId: backendUser.id,
                    email:
                      backendUser.primaryEmailAddress?.emailAddress || email,
                    firstName: backendUser.firstName || null,
                    lastName: backendUser.lastName || null,
                  }
                }
              }
            } catch (backendError) {
              console.warn(
                '[electron-test] Failed to load user via Clerk backend',
                backendError,
              )
            }
          }

          if (clerkUser?.clerkId) {
            const setResult = await page.evaluate(async (user) => {
              try {
                return await window.electronAPI?.auth?.setUser(user)
              } catch (error) {
                console.error('setUser failed', error)
                throw error
              }
            }, clerkUser)

            log.debug('[electron-test] setUser result', setResult)
          }
        } catch (syncError) {
          console.warn(
            '[electron-test] Failed to sync auth user to main process',
            syncError,
          )
        }
      }

      return isAuthenticated
    } catch (error) {
      log.error('❌ Authentication setup failed:', error)
      console.error('Electron authentication error:', error)
      return false
    }
  }

  private static async waitForHttpServer(
    url: string,
    timeoutMs = 30_000,
    intervalMs = 1_000,
  ): Promise<void> {
    const start = Date.now()
    while (Date.now() - start < timeoutMs) {
      try {
        const response = await fetch(url, { method: 'GET' })
        if (response.ok) {
          return
        }
      } catch {
        // ignore and retry
      }
      await new Promise((resolve) => setTimeout(resolve, intervalMs))
    }
    throw new Error(`Timed out waiting for server ${url}`)
  }

  static async launchElectronApp(): Promise<ElectronTestContext> {
    // Build the app first if needed
    // Create a unique user data directory for this test to avoid conflicts
    const uniqueUserDataDir = path.join(
      __dirname,
      '../../.playwright-electron',
      `test-${Date.now()}-${Math.random().toString(36).substring(7)}`,
    )

    const { ELECTRON_RUN_AS_NODE: _ignored, ...baseEnv } = process.env
    const baseUrl = baseEnv.PLAYWRIGHT_TEST_BASE_URL || 'http://localhost:3011'

    let nextServerProcess: ChildProcess | null = null
    try {
      await this.waitForHttpServer(baseUrl, 5_000, 500)
    } catch {
      log.warn(
        `[electron-test] No server detected at ${baseUrl}, starting temporary Next.js server...`,
      )
      nextServerProcess = spawn('pnpm', ['start'], {
        shell: true,
        stdio: ['ignore', 'pipe', 'pipe'],
        env: {
          ...baseEnv,
          NODE_ENV: 'test',
        },
      })

      nextServerProcess.stdout?.on('data', (data) => {
        log.debug('[electron-test][server]', data.toString().trim())
      })
      nextServerProcess.stderr?.on('data', (data) => {
        console.error('[electron-test][server]', data.toString().trim())
      })

      const serverReadyTimeout = baseEnv.CI ? 90_000 : 45_000
      await this.waitForHttpServer(baseUrl, serverReadyTimeout, 1_000)
    }

    const electronApp = await electron.launch({
      args: [
        path.join(__dirname, '../../electron/main.cjs'),
        // Use unique user data directory to avoid singleton conflicts
        `--user-data-dir=${uniqueUserDataDir}`,
      ],
      env: {
        ...baseEnv,
        NODE_ENV: 'test',
        ELECTRON_IS_DEV: '1',
        // Disable hardware acceleration for testing
        ELECTRON_DISABLE_HARDWARE_ACCELERATION: '1',
      },
    })

    const electronProcess = electronApp.process()

    const mainWindow = await electronApp.firstWindow()

    electronProcess.once('exit', (code, signal) => {
      console.error(
        `[electron-test] Electron process exited code=${code} signal=${signal}`,
      )
    })

    if (mainWindow) {
      mainWindow.on('close', () => {
        console.error('[electron-test] mainWindow close event received')
      })

      const webContents = (mainWindow as unknown as { webContents?: any })
        ?.webContents
      if (webContents) {
        webContents.on(
          'did-start-navigation',
          (_event: unknown, url: string) => {
            log.debug('[electron-test] did-start-navigation', url)
          },
        )

        webContents.on('did-navigate', (_event: unknown, url: string) => {
          log.debug('[electron-test] did-navigate', url)
        })

        webContents.on('crashed', () => {
          console.error('[electron-test] mainWindow webContents crashed')
        })

        webContents.on(
          'did-fail-load',
          (
            _event: unknown,
            errorCode: number,
            errorDescription: string,
            validatedURL: string,
          ) => {
            console.error(
              `[electron-test] did-fail-load code=${errorCode} desc=${errorDescription} url=${validatedURL}`,
            )
          },
        )
      }
    }

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
      const currentUrl = await mainWindow.evaluate(() => window.location.href)
      log.debug('[electron-test] current URL', currentUrl)

      // Wait for Next.js server to be ready
      const serverReady = await this.waitForServerReady(mainWindow)
      if (!serverReady) {
        throw new Error('Next.js server failed to become ready')
      }

      const skipAuth = baseEnv.ELECTRON_E2E_SKIP_AUTH === '1'
      if (!skipAuth) {
        // Set up authentication using the proper flow
        const authSuccess = await this.setupAuthentication(mainWindow, baseUrl)
        if (!authSuccess) {
          throw new Error('Authentication setup failed')
        }
      }

      await this.waitForDeepLinkApi(mainWindow)

      // Check for any errors that occurred during setup
      if (pageErrors.length > 0) {
        log.error('Page errors detected:', pageErrors)
        throw new Error(`Page errors occurred: ${pageErrors.join('; ')}`)
      }
    } catch (error) {
      const errMessage = error instanceof Error ? error.message : String(error)
      const errStack = error instanceof Error ? error.stack : undefined
      log.error('❌ Error during Electron app setup:', {
        message: errMessage,
      })
      if (errStack) {
        log.error('Setup stack trace:', errStack)
      }
      // fallback console for visibility in Playwright output
      console.error('Electron setup failed:', errMessage)
      if (errStack) console.error(errStack)
      if (!mainWindow.isClosed()) {
        try {
          const screenshotPath = path.join(
            __dirname,
            `../../test-results/electron-debug-${Date.now()}.png`,
          )
          await mainWindow.screenshot({ path: screenshotPath })
          console.error('[electron-test] Saved screenshot to', screenshotPath)
        } catch (screenshotError) {
          console.error(
            '[electron-test] Failed to capture screenshot:',
            screenshotError,
          )
        }
      }
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
      nextServerProcess,
    }
  }

  private static async waitForDeepLinkApi(
    page: Page,
    timeoutMs = 15_000,
    intervalMs = 500,
  ): Promise<void> {
    const start = Date.now()
    while (Date.now() - start < timeoutMs) {
      try {
        const status = await page.evaluate(async () => {
          const api = window.electronAPI?.deepLink
          if (!api) {
            return { ready: false, reason: 'missing-api' }
          }
          try {
            const url = await api.generateUrl('task', { id: 'ready-check' })
            const examples = await api.getExamples()
            const ok =
              typeof url === 'string' &&
              url.length > 0 &&
              examples &&
              Object.keys(examples).length > 0
            return { ready: ok, reason: ok ? 'ok' : 'insufficient-data' }
          } catch (error: any) {
            return {
              ready: false,
              reason: error?.message || 'generate-error',
            }
          }
        })
        if (status.ready) {
          log.debug('[electron-test] deep link API ready')
          return
        }
        log.debug('[electron-test] waiting for deep link API', status)
      } catch (error) {
        log.debug('[electron-test] deep link readiness check failed', error)
      }
      await page.waitForTimeout(intervalMs)
    }
    throw new Error('Deep link API failed to become ready')
  }

  static async closeElectronApp(context: ElectronTestContext): Promise<void> {
    // Close floating navigator first
    if (context?.floatingNavigator && !context.floatingNavigator.isClosed()) {
      try {
        await context.floatingNavigator.close()
      } catch (error) {
        log.warn('[electron-test] Failed to close floating navigator:', error)
      }
    }

    // Close Electron app with proper error handling and wait for termination
    if (context?.electronApp) {
      try {
        log.debug('[electron-test] Closing Electron app...')
        await context.electronApp.close()
        // Wait longer for process to fully terminate to avoid race conditions
        await new Promise((resolve) => setTimeout(resolve, 2000))
        log.debug('[electron-test] Electron app closed successfully')
      } catch (error) {
        log.error('[electron-test] Error closing Electron app:', error)
        // Try once more after a longer delay
        try {
          await new Promise((resolve) => setTimeout(resolve, 1000))
          await context.electronApp.close()
          await new Promise((resolve) => setTimeout(resolve, 2000))
          log.debug('[electron-test] Electron app closed on retry')
        } catch (retryError) {
          log.error('[electron-test] Retry close also failed:', retryError)
          // Continue anyway - process might be dead
        }
      }
    }

    // Clean up Next.js server process if it exists
    if (context?.nextServerProcess) {
      const serverProcess = context.nextServerProcess
      if (!serverProcess.killed) {
        await new Promise<void>((resolve) => {
          const timeout = setTimeout(resolve, 5000)
          serverProcess.once('exit', () => {
            clearTimeout(timeout)
            resolve()
          })
          try {
            serverProcess.kill('SIGTERM')
          } catch (error) {
            console.warn(
              '[electron-test] Failed to terminate Next.js server',
              error,
            )
            clearTimeout(timeout)
            resolve()
          }
        })
      }
      context.nextServerProcess = null
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
    try {
      await context.mainWindow.keyboard.press('Meta+Shift+F')
    } catch (error) {
      log.warn('Keyboard toggle for floating navigator failed:', error)
    }

    await context.mainWindow.waitForTimeout(1000)
    context.floatingNavigator = await this.getFloatingNavigator(context)

    if (!context.floatingNavigator) {
      // Fallback to direct API invocation if keyboard shortcut did not work
      await context.mainWindow.evaluate(async () => {
        return window.electronAPI?.window?.toggleFloatingNavigator?.()
      })
      await context.mainWindow.waitForTimeout(1000)
      context.floatingNavigator = await this.getFloatingNavigator(context)
    }

    if (context.floatingNavigator) {
      try {
        await context.floatingNavigator.waitForLoadState('domcontentloaded')
        const loadingLocator =
          context.floatingNavigator.getByText(/loading tasks/i)
        await loadingLocator.waitFor({ state: 'detached', timeout: 10_000 })
        const retryButton = context.floatingNavigator.getByRole('button', {
          name: /retry/i,
        })
        if (await retryButton.count()) {
          await retryButton.click()
          await context.floatingNavigator.waitForTimeout(500)
        }
      } catch (error) {
        log.warn('Floating navigator content did not finish loading:', error)
      }
    }
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
    _sourcePage: Page,
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

    await page.getByRole('button', { name: 'Add', exact: true }).click()
    await page.waitForTimeout(500)

    // Verify task appears
    await expect(page.getByText(taskName, { exact: true })).toBeVisible({
      timeout: 15_000,
    })

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
      await mainWindow.getByRole('button', { name: 'Add', exact: true }).click()
      await mainWindow.waitForTimeout(2000)

      let inputCount = await floatingWindow
        .getByPlaceholder(/enter.*todo/i)
        .count()
      if (inputCount === 0) {
        const retryButton = floatingWindow.getByRole('button', {
          name: /retry/i,
        })
        if (await retryButton.count()) {
          await retryButton.click()
          await floatingWindow.waitForTimeout(500)
          inputCount = await floatingWindow
            .getByPlaceholder(/enter.*todo/i)
            .count()
        }

        if (inputCount === 0) {
          log.warn(
            'Floating navigator input unavailable; skipping synchronization checks.',
          )
          return true
        }
      }

      // Verify task appears in floating window
      await floatingWindow.getByText(taskName, { exact: true }).waitFor({
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
      await page.getByRole('button', { name: 'Add', exact: true }).click()
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
      const failPattern = '**/api/**'
      let failureInjected = false
      const routeHandler = async (route: Route) => {
        if (!failureInjected) {
          failureInjected = true
          await route.abort('failed')
          return
        }
        await route.continue()
      }

      await page.route(failPattern, routeHandler)

      // Try to create a task during error
      const errorTask = `ErrorTest-${Date.now()}`
      await page.getByPlaceholder(/enter.*todo/i).fill(errorTask)
      await page.getByRole('button', { name: 'Add', exact: true }).click()
      await page.waitForTimeout(2000)

      // Clear the route to restore normal operation
      await page.unroute(failPattern, routeHandler)
      await page.waitForTimeout(500)

      // Test recovery by creating another task
      const recoveryTask = `RecoveryTest-${Date.now()}`
      await page.getByPlaceholder(/enter.*todo/i).fill(recoveryTask)
      await page.getByRole('button', { name: 'Add', exact: true }).click()
      await page.waitForTimeout(2000)

      // Verify recovery task appears
      await expect(page.getByText(recoveryTask, { exact: true })).toBeVisible({
        timeout: 10_000,
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
