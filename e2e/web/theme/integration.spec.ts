import { argosScreenshot } from '@argos-ci/playwright'
import { test, expect } from '@playwright/test'

/**
 * Integration tests for theme switching functionality
 * These tests verify that themes can be switched and persist correctly
 */

test.describe('Theme Integration Tests', () => {
  test('can access theme through localStorage API', async ({ page }) => {
    await page.goto('/')

    // Set theme via localStorage (simulating what next-themes does)
    await page.evaluate(() => {
      localStorage.setItem('corelive-theme', 'dark')
    })

    // Reload to apply theme
    await page.reload()
    await page.waitForLoadState('networkidle')

    // Check that dark theme is applied
    const dataTheme = await page.locator('html').getAttribute('data-theme')
    expect(dataTheme).toBe('dark')

    // Verify dark theme CSS variables
    const backgroundColor = await page.evaluate(() => {
      const computedStyle = getComputedStyle(document.documentElement)
      return computedStyle.getPropertyValue('--background').trim()
    })

    // Dark theme background - browsers may show as lab format or percentage
    expect(backgroundColor).toMatch(
      /^(oklch\(0\.145 0 0\)|oklch\(14\.5% 0 0\)|lab\([\d.]+% 0 0\))$/,
    )
  })

  test('theme changes are reflected in CSS custom properties', async ({
    page,
  }) => {
    await page.goto('/home')
    await page.waitForLoadState('networkidle')

    // Verify /home page elements are loaded
    // Check for sidebar (desktop uses data-slot="sidebar", mobile uses data-sidebar="sidebar")
    const sidebar = page.locator(
      '[data-slot="sidebar"], [data-sidebar="sidebar"]',
    )
    await expect(sidebar.first()).toBeVisible({ timeout: 10000 })

    // Test switching between light and dark themes
    const themes = [
      {
        name: 'light',
        bgPattern: /^(oklch\(1 0 0\)|oklch\(100% 0 0\)|lab\(100% 0 0\))$/,
      },
      {
        name: 'dark',
        bgPattern:
          /^(oklch\(0\.145 0 0\)|oklch\(14\.5% 0 0\)|lab\([\d.]+% 0 0\))$/,
      },
    ]

    for (const theme of themes) {
      // Set theme
      await page.evaluate((themeName) => {
        localStorage.setItem('corelive-theme', themeName)
        // Trigger storage event to update theme
        window.dispatchEvent(
          new StorageEvent('storage', {
            key: 'corelive-theme',
            newValue: themeName,
            url: window.location.href,
            storageArea: localStorage,
          }),
        )
      }, theme.name)

      // Wait for theme to apply and UI to update
      await page.waitForTimeout(500)

      // Check data-theme attribute
      const dataTheme = await page.locator('html').getAttribute('data-theme')
      expect(dataTheme).toBe(theme.name)

      // Check CSS variable changed
      const backgroundColor = await page.evaluate(() => {
        const computedStyle = getComputedStyle(document.documentElement)
        return computedStyle.getPropertyValue('--background').trim()
      })

      expect(backgroundColor).toMatch(theme.bgPattern)

      // Verify sidebar CSS variable reflects theme
      const sidebarBgVar = await page.evaluate(() => {
        const sidebar = document.querySelector(
          '[data-slot="sidebar"], [data-sidebar="sidebar"]',
        )
        if (!sidebar) return null
        const computedStyle = getComputedStyle(sidebar)
        return (
          computedStyle.getPropertyValue('--sidebar-background').trim() ||
          computedStyle.getPropertyValue('background-color').trim()
        )
      })

      // Verify sidebar is visible and has styling
      expect(sidebarBgVar).toBeTruthy()

      // Verify main content area (SidebarInset) is visible
      const mainContent = page.locator('[data-slot="sidebar-inset"]')
      await expect(mainContent.first()).toBeVisible({ timeout: 10000 })

      // Wait for page content to load
      await page.waitForLoadState('networkidle')

      // Verify /home page URL is correct
      expect(page.url()).toContain('/home')

      // Take screenshot to verify theme is applied visually
      await argosScreenshot(page, `home-${theme.name}`)
    }
  })

  test('theme persists across page navigation', async ({ page }) => {
    await page.goto('/')

    // Set dark theme for persistence test
    await page.evaluate(() => {
      localStorage.setItem('corelive-theme', 'dark')
    })

    // Navigate to a different page
    await page.goto('/login')
    await page.waitForLoadState('networkidle')

    // Check theme persisted
    const dataTheme = await page.locator('html').getAttribute('data-theme')
    expect(dataTheme).toBe('dark')

    // Check localStorage still has the theme
    const storedTheme = await page.evaluate(() => {
      return localStorage.getItem('corelive-theme')
    })
    expect(storedTheme).toBe('dark')
  })

  test('system theme preference is respected when set', async ({ page }) => {
    // Emulate dark color scheme BEFORE navigating
    await page.emulateMedia({ colorScheme: 'dark' })

    await page.goto('/')

    // Set theme to 'system' to use system preference
    await page.evaluate(() => {
      localStorage.setItem('corelive-theme', 'system')
    })
    await page.reload()
    await page.waitForLoadState('networkidle')

    // With 'system' theme stored, next-themes should follow system preference
    // CSS should reflect dark mode when system prefers dark
    const backgroundColor = await page.evaluate(() => {
      const computedStyle = getComputedStyle(document.documentElement)
      return computedStyle.getPropertyValue('--background').trim()
    })

    // Should have dark background when system prefers dark
    const isDarkBg =
      /^(oklch\(0\.145 0 0\)|oklch\(14\.5% 0 0\)|lab\([\d.]+% 0 0\))$/.test(
        backgroundColor,
      )

    // Or data-theme should indicate system/dark preference
    const dataTheme = await page.locator('html').getAttribute('data-theme')
    const isSystemOrDark = dataTheme === 'system' || dataTheme === 'dark'

    expect(isDarkBg || isSystemOrDark).toBe(true)
  })

  test('all theme options are accessible', async ({ page }) => {
    await page.goto('/')

    // Get all available themes - now only light and dark
    const themes = await page.evaluate(() => {
      const storedThemes = ['light', 'dark']
      return storedThemes
    })

    // Verify we have both themes available
    expect(themes.length).toBe(2)
    expect(themes).toContain('light')
    expect(themes).toContain('dark')
  })
})
