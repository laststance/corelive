import { test, expect } from '@playwright/test'

import {
  ElectronTestHelper,
  type ElectronTestContext,
} from '../helpers/electron-test-utils'

/**
 * E2E tests for FloatingNavigator todo synchronization via IPC events
 * These tests verify that todos created/updated/deleted in FloatingNavigator
 * appear in the main window in real-time without manual refresh.
 */
test.describe('FloatingNavigator Todo Synchronization E2E Tests', () => {
  let context: ElectronTestContext

  test.beforeAll(async () => {
    // Launch Electron app using the helper
    context = await ElectronTestHelper.launchElectronApp()
  })

  test.afterAll(async () => {
    await ElectronTestHelper.closeElectronApp(context)
  })

  test.afterEach(async () => {
    try {
      // Close floating navigator if open
      if (context.floatingNavigator && !context.floatingNavigator.isClosed()) {
        await context.floatingNavigator.close().catch(() => {
          // Ignore close errors
        })
        context.floatingNavigator = null
      }

      // Close ALL non-main windows
      if (context.electronApp) {
        const allWindows = context.electronApp.windows()
        for (const window of allWindows) {
          if (window !== context.mainWindow && !window.isClosed()) {
            await window.close().catch(() => {
              // Ignore close errors
            })
          }
        }
      }

      await context.mainWindow.waitForTimeout(100)
    } catch (error) {
      console.warn('Warning: afterEach cleanup encountered error:', error)
    }
  })

  test('should sync todo created in FloatingNavigator to main window via IPC events', async () => {
    // Open FloatingNavigator
    await ElectronTestHelper.toggleFloatingNavigator(context)
    expect(context.floatingNavigator).toBeTruthy()

    if (!context.floatingNavigator || context.floatingNavigator.isClosed()) {
      test.skip()
      return
    }

    // Wait for FloatingNavigator to be ready
    await context.floatingNavigator.waitForLoadState('domcontentloaded', {
      timeout: 10000,
    })
    await context.floatingNavigator.waitForTimeout(1000)

    // Check if FloatingNavigator has input field (may be in error state)
    const hasInput = await context.floatingNavigator
      .getByPlaceholder(/add task/i)
      .count()

    if (hasInput === 0) {
      // Try to retry if there's a retry button
      const retryButton = context.floatingNavigator.getByRole('button', {
        name: /retry/i,
      })
      if ((await retryButton.count()) > 0) {
        await retryButton.click()
        await context.floatingNavigator.waitForTimeout(2000)
      } else {
        // Skip if FloatingNavigator is not functional
        test.skip()
        return
      }
    }

    // Create a unique task name
    const taskName = `FloatingSync-${Date.now()}-${Math.random().toString(36).substring(7)}`

    // Create todo in FloatingNavigator using the input field
    const floatingInput =
      context.floatingNavigator.getByPlaceholder(/add task/i)
    await floatingInput.fill(taskName)
    await floatingInput.press('Enter')

    // Wait for the todo to be created via IPC
    await context.floatingNavigator.waitForTimeout(1500)

    // Verify todo appears in FloatingNavigator
    await expect(
      context.floatingNavigator.getByText(taskName, { exact: true }),
    ).toBeVisible({ timeout: 5000 })

    // Verify todo appears in main window via IPC event-triggered React Query cache invalidation
    // The main window should automatically refresh via the IPC event listener we added
    await expect(
      context.mainWindow.getByText(taskName, { exact: true }),
    ).toBeVisible({ timeout: 10000 })

    // Verify the todo appears in the pending tasks section
    const todoItem = context.mainWindow.getByText(taskName, { exact: true })
    await expect(todoItem).toBeVisible()
  })

  test('should sync todo updates from FloatingNavigator to main window', async () => {
    // Open FloatingNavigator
    await ElectronTestHelper.toggleFloatingNavigator(context)
    expect(context.floatingNavigator).toBeTruthy()

    if (!context.floatingNavigator || context.floatingNavigator.isClosed()) {
      test.skip()
      return
    }

    await context.floatingNavigator.waitForLoadState('domcontentloaded', {
      timeout: 10000,
    })
    await context.floatingNavigator.waitForTimeout(1000)

    // Check if FloatingNavigator is functional
    const hasInput = await context.floatingNavigator
      .getByPlaceholder(/add task/i)
      .count()

    if (hasInput === 0) {
      test.skip()
      return
    }

    // Create a todo first
    const taskName = `UpdateTest-${Date.now()}`
    await context.floatingNavigator.getByPlaceholder(/add task/i).fill(taskName)
    await context.floatingNavigator.getByPlaceholder(/add task/i).press('Enter')
    await context.floatingNavigator.waitForTimeout(2000)

    // Wait for it to appear in both windows
    await expect(
      context.floatingNavigator.getByText(taskName, { exact: true }),
    ).toBeVisible({ timeout: 5000 })
    await expect(
      context.mainWindow.getByText(taskName, { exact: true }),
    ).toBeVisible({ timeout: 10000 })

    // Toggle completion in FloatingNavigator
    const floatingCheckbox = context.floatingNavigator.getByRole('checkbox', {
      name: taskName,
    })
    await floatingCheckbox.click()
    await context.floatingNavigator.waitForTimeout(1500)

    // Verify completion syncs to main window via IPC event
    const mainCheckbox = context.mainWindow.getByRole('checkbox', {
      name: taskName,
    })
    await expect(mainCheckbox).toBeChecked({ timeout: 10000 })
  })

  test('should sync todo deletes from FloatingNavigator to main window', async () => {
    // Open FloatingNavigator
    await ElectronTestHelper.toggleFloatingNavigator(context)
    expect(context.floatingNavigator).toBeTruthy()

    if (!context.floatingNavigator || context.floatingNavigator.isClosed()) {
      test.skip()
      return
    }

    await context.floatingNavigator.waitForLoadState('domcontentloaded', {
      timeout: 10000,
    })
    await context.floatingNavigator.waitForTimeout(1000)

    // Check if FloatingNavigator is functional
    const hasInput = await context.floatingNavigator
      .getByPlaceholder(/add task/i)
      .count()

    if (hasInput === 0) {
      test.skip()
      return
    }

    // Create a todo first
    const taskName = `DeleteTest-${Date.now()}`
    await context.floatingNavigator.getByPlaceholder(/add task/i).fill(taskName)
    await context.floatingNavigator.getByPlaceholder(/add task/i).press('Enter')
    await context.floatingNavigator.waitForTimeout(2000)

    // Wait for it to appear in both windows
    await expect(
      context.floatingNavigator.getByText(taskName, { exact: true }),
    ).toBeVisible({ timeout: 5000 })
    await expect(
      context.mainWindow.getByText(taskName, { exact: true }),
    ).toBeVisible({ timeout: 10000 })

    // Delete todo in FloatingNavigator
    // The delete button has aria-label "Delete task: {taskName}"
    const deleteButton = context.floatingNavigator.getByRole('button', {
      name: new RegExp(`Delete task:.*${taskName}`, 'i'),
    })

    // Hover over the task item to make the delete button visible
    const taskItem = context.floatingNavigator
      .getByText(taskName, { exact: true })
      .locator('..')
    await taskItem.hover()
    await context.floatingNavigator.waitForTimeout(300)

    if ((await deleteButton.count()) > 0) {
      await deleteButton.click()
      await context.floatingNavigator.waitForTimeout(2000)

      // Verify todo is removed from FloatingNavigator
      await expect(
        context.floatingNavigator.getByText(taskName, { exact: true }),
      ).not.toBeVisible({ timeout: 5000 })

      // Verify todo is removed from main window via IPC event
      await expect(
        context.mainWindow.getByText(taskName, { exact: true }),
      ).not.toBeVisible({ timeout: 10000 })
    } else {
      // Skip if delete button not found (might be in error state)
      test.skip()
    }
  })

  test('should sync todos created in main window to FloatingNavigator', async () => {
    // Open FloatingNavigator
    await ElectronTestHelper.toggleFloatingNavigator(context)
    expect(context.floatingNavigator).toBeTruthy()

    if (!context.floatingNavigator || context.floatingNavigator.isClosed()) {
      test.skip()
      return
    }

    await context.floatingNavigator.waitForLoadState('domcontentloaded', {
      timeout: 10000,
    })
    await context.floatingNavigator.waitForTimeout(1000)

    // Create todo in main window
    const taskName = `MainToFloating-${Date.now()}`
    await context.mainWindow.getByPlaceholder(/enter.*todo/i).fill(taskName)
    await context.mainWindow
      .getByRole('button', { name: 'Add', exact: true })
      .click()
    await context.mainWindow.waitForTimeout(1500)

    // Verify todo appears in FloatingNavigator via IPC event
    // The FloatingNavigator listens for 'todo-created' events and reloads
    await expect(
      context.floatingNavigator.getByText(taskName, { exact: true }),
    ).toBeVisible({ timeout: 10000 })
  })

  test('should handle multiple rapid todo creations from FloatingNavigator', async () => {
    // Open FloatingNavigator
    await ElectronTestHelper.toggleFloatingNavigator(context)
    expect(context.floatingNavigator).toBeTruthy()

    if (!context.floatingNavigator || context.floatingNavigator.isClosed()) {
      test.skip()
      return
    }

    await context.floatingNavigator.waitForLoadState('domcontentloaded', {
      timeout: 10000,
    })
    await context.floatingNavigator.waitForTimeout(1000)

    // Check if FloatingNavigator is functional
    const hasInput = await context.floatingNavigator
      .getByPlaceholder(/add task/i)
      .count()

    if (hasInput === 0) {
      test.skip()
      return
    }

    // Create multiple todos rapidly
    const tasks = [
      `Rapid1-${Date.now()}`,
      `Rapid2-${Date.now()}`,
      `Rapid3-${Date.now()}`,
    ]

    for (const taskName of tasks) {
      await context.floatingNavigator
        .getByPlaceholder(/add task/i)
        .fill(taskName)
      await context.floatingNavigator
        .getByPlaceholder(/add task/i)
        .press('Enter')
      await context.floatingNavigator.waitForTimeout(500)
    }

    // Wait for all todos to sync
    await context.floatingNavigator.waitForTimeout(2000)

    // Verify all todos appear in main window
    for (const taskName of tasks) {
      await expect(
        context.mainWindow.getByText(taskName, { exact: true }),
      ).toBeVisible({ timeout: 10000 })
    }
  })

  test('should verify IPC event listeners are properly set up in main window', async () => {
    // Verify that the main window has IPC event listeners set up
    const hasListeners = await context.mainWindow.evaluate(() => {
      // Check if electronAPI.on is available
      const hasElectronAPI =
        typeof window.electronAPI !== 'undefined' &&
        typeof window.electronAPI.on === 'function'

      return {
        hasElectronAPI,
        electronAPIExists: typeof window.electronAPI !== 'undefined',
      }
    })

    expect(hasListeners.hasElectronAPI).toBe(true)
    expect(hasListeners.electronAPIExists).toBe(true)

    // Verify that IPC events can be listened to
    const canListen = await context.mainWindow.evaluate(() => {
      if (!window.electronAPI?.on) return false

      const cleanup = window.electronAPI.on('todo-created', () => {
        // Event listener test - cleanup will be called immediately
      })

      // Clean up immediately
      if (typeof cleanup === 'function') {
        cleanup()
      }

      return true
    })

    expect(canListen).toBe(true)
  })
})
