import { argosScreenshot } from '@argos-ci/playwright'
import { setupClerkTestingToken } from '@clerk/testing/playwright'
import { expect, test } from '@playwright/test'

test.describe('Theme Visual Test', () => {
  test.beforeEach(async ({ page }) => {
    // Setup Clerk testing token for each test
    // This is required for Clerk to work properly in test mode
    await setupClerkTestingToken({ page })

    // Navigate to the TODO app home page
    // Authentication state is automatically loaded from playwright/.auth/user.json
    await page.goto('/home')
    // Wait for page to be fully loaded
    await page.waitForLoadState('networkidle')
  })

  test('should capture screenshots for light and dark themes', async ({
    page,
  }) => {
    // Wait for page to be fully loaded
    await page.waitForLoadState('networkidle')

    // Verify we're on the authenticated TODO app page
    await expect(page).toHaveURL(/\/home\/?$/)

    // Wait for Todo List to appear
    await expect(
      page.getByText('Todo List').or(page.getByText('Loading...')),
    ).toBeVisible({ timeout: 10000 })

    // If loading, wait for it to finish
    const isLoading = await page.getByText('Loading...').isVisible()
    if (isLoading) {
      await expect(page.getByText('Todo List')).toBeVisible({ timeout: 10000 })
    }

    // Add a new TODO item
    const todoText = `ThemeTest-${Date.now()}-${Math.random().toString(36).substring(7)}`
    await page.getByPlaceholder('Enter a new todo...').fill(todoText)
    await page.getByRole('button', { name: 'Add', exact: true }).click()

    // Wait for the TODO to appear
    const todoCheckbox = page.getByRole('checkbox', { name: todoText })
    await expect(todoCheckbox).toBeVisible({ timeout: 5000 })

    // Wait for UI to stabilize before taking screenshot
    await page.waitForTimeout(1000)

    // Capture screenshot of light theme (default)
    await argosScreenshot(page, 'home-light-theme')

    // Open user menu dropdown (click on avatar button in sidebar header)
    // The avatar button is in the sidebar header, which contains the user's avatar and name
    // Use data-sidebar="header" attribute to find the sidebar header
    const sidebarHeader = page.locator('[data-sidebar="header"]').first()
    await expect(sidebarHeader).toBeVisible({ timeout: 5000 })

    // Find the button in the sidebar header that contains user info
    // This button triggers the dropdown menu with user options
    const avatarButton = sidebarHeader.locator('button').first()
    await expect(avatarButton).toBeVisible({ timeout: 5000 })
    await avatarButton.click()

    // Wait for dropdown menu to appear
    await page.waitForTimeout(500)

    // Open "Change Theme" submenu
    const changeThemeTrigger = page.getByText('Change Theme', { exact: false })
    await expect(changeThemeTrigger).toBeVisible()
    await changeThemeTrigger.click()

    // Wait for theme submenu to appear
    await page.waitForTimeout(500)

    // Click on "Dark" theme option
    // The dark theme option should have text "Dark" (from THEME_METADATA)
    const darkThemeOption = page
      .locator('[role="menuitem"]')
      .filter({ hasText: 'Dark' })
      .first()
    await expect(darkThemeOption).toBeVisible()
    await darkThemeOption.click()

    // Wait for theme to change and UI to stabilize
    // Theme changes might trigger re-renders, so wait a bit longer
    await page.waitForTimeout(1500)

    // Verify theme has changed by checking data-theme attribute
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark', {
      timeout: 5000,
    })

    // Capture screenshot of dark theme
    await argosScreenshot(page, 'home-dark-theme')
  })
})
