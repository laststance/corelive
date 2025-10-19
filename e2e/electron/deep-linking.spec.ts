import { test, expect } from '@playwright/test'
import type { Page } from '@playwright/test'

import {
  ElectronTestHelper,
  type ElectronTestContext,
} from '../helpers/electron-test-utils'

test.describe('Electron Deep Linking', () => {
  let context: ElectronTestContext
  let page: Page

  test.beforeAll(async () => {
    // Launch Electron app using the helper
    context = await ElectronTestHelper.launchElectronApp()
    page = context.mainWindow
  })

  test.afterAll(async () => {
    await ElectronTestHelper.closeElectronApp(context)
  })

  test('should register custom URL protocol', async () => {
    // Test that the deep link API is available in the renderer
    const hasDeepLinkAPI = await page.evaluate(() => {
      return typeof window.electronAPI?.deepLink !== 'undefined'
    })

    // The app should expose deep link API through electronAPI
    expect(hasDeepLinkAPI).toBe(true)
  })

  test('should generate deep link URLs', async () => {
    // Test deep link URL generation through the renderer process
    const deepLinkUrl = await page.evaluate(async () => {
      if (window.electronAPI?.deepLink) {
        return window.electronAPI.deepLink.generateUrl('task', {
          id: '123',
        })
      }
      return null
    })

    expect(deepLinkUrl).toBe('corelive://task?id=123')
  })

  test('should get example deep link URLs', async () => {
    // Test getting example URLs
    const examples = await page.evaluate(async () => {
      if (window.electronAPI?.deepLink) {
        return window.electronAPI.deepLink.getExamples()
      }
      return {}
    })

    expect(examples).toHaveProperty('openTask')
    expect(examples).toHaveProperty('createTask')
    expect(examples).toHaveProperty('searchTasks')
    expect(examples).toHaveProperty('openView')

    expect(examples.openTask).toMatch(/^corelive:\/\/task\//)
    expect(examples.createTask).toMatch(/^corelive:\/\/create\?/)
    expect(examples.searchTasks).toMatch(/^corelive:\/\/search\?/)
    expect(examples.openView).toMatch(/^corelive:\/\/view\//)
  })

  test('should handle deep link URL manually', async () => {
    // Test manual deep link handling
    const testUrl = 'corelive://task/test-123'

    const result = await page.evaluate(async (url) => {
      if (window.electronAPI?.deepLink) {
        return window.electronAPI.deepLink.handleUrl(url)
      }
      return false
    }, testUrl)

    expect(result).toBe(true)
  })

  test('should expose deep link event listeners', async () => {
    // Test that deep link event listeners are available
    const hasEventListeners = await page.evaluate(() => {
      return typeof window.electronAPI?.on === 'function'
    })

    expect(hasEventListeners).toBe(true)

    // Test setting up event listeners for deep link events
    const canListenToEvents = await page.evaluate(() => {
      if (!window.electronAPI?.on) return false

      try {
        // Try to set up listeners for deep link events
        const cleanup1 = window.electronAPI.on('deep-link-focus-task', () => {})
        const cleanup2 = window.electronAPI.on(
          'deep-link-create-task',
          () => {},
        )
        const cleanup3 = window.electronAPI.on('deep-link-navigate', () => {})
        const cleanup4 = window.electronAPI.on('deep-link-search', () => {})

        // Clean up listeners
        if (typeof cleanup1 === 'function') cleanup1()
        if (typeof cleanup2 === 'function') cleanup2()
        if (typeof cleanup3 === 'function') cleanup3()
        if (typeof cleanup4 === 'function') cleanup4()

        return true
      } catch {
        return false
      }
    })

    expect(canListenToEvents).toBe(true)
  })

  test('should validate deep link URL formats', async () => {
    // Test various URL formats
    const testUrls = [
      { url: 'corelive://task/123', valid: true },
      { url: 'corelive://create?title=Test', valid: true },
      { url: 'corelive://search?query=test', valid: true },
      { url: 'corelive://view/completed', valid: true },
      { url: 'https://example.com', valid: false },
      { url: 'invalid-protocol://test', valid: false },
    ]

    for (const testCase of testUrls) {
      const result = await page.evaluate(async (url) => {
        if (window.electronAPI?.deepLink) {
          try {
            return window.electronAPI.deepLink.handleUrl(url)
          } catch {
            return false
          }
        }
        return false
      }, testCase.url)

      if (testCase.valid) {
        expect(result).toBe(true)
      } else {
        expect(result).toBe(false)
      }
    }
  })

  test('should handle URL encoding in deep links', async () => {
    // Test URL encoding/decoding
    const encodedUrl = await page.evaluate(async () => {
      if (window.electronAPI?.deepLink) {
        return window.electronAPI.deepLink.generateUrl('create', {
          title: 'Task with spaces',
          description: 'Description & symbols',
        })
      }
      return null
    })

    expect(encodedUrl).toContain('title=Task+with+spaces')
    expect(encodedUrl).toContain('description=Description+%26+symbols')
  })
})
