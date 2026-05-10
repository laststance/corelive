import { setupClerkTestingToken } from '@clerk/testing/playwright'
import { expect, test, type Page } from '@playwright/test'

import { resetDatabase } from './_helpers/db'

test.describe('Theme Visual Test', () => {
  // Reset the database once before this spec runs so the captured CSS state
  // reflects exactly the seeded fixture TODOs (see `prisma/seed.ts`) plus the
  // one todo this test adds. Without this, leftover rows from prior spec
  // files could shift which DOM nodes are mounted and confuse the
  // theme-driven style assertions below.
  test.beforeAll(resetDatabase)

  test.beforeEach(async ({ page }) => {
    await setupClerkTestingToken({ page })

    // Freeze the browser clock so client-side `new Date()` calls render
    // deterministically across runs. The fixed reference is in the past
    // relative to any realistic CI run so Clerk session token validation
    // (which compares `iat`/`exp` against the browser clock) still treats
    // real tokens as freshly issued.
    await page.clock.install({ time: new Date('2026-01-15T12:00:00Z') })

    await page.goto('/home')
    await page.waitForLoadState('networkidle')
  })

  test('switches from light to dark theme and applies CSS variables', async ({
    page,
  }) => {
    // Arrange — wait for the authenticated TODO app to render fully
    await expect(page).toHaveURL(/\/home\/?$/)
    await expect(
      page.getByText('Todo List').or(page.getByText('Loading...')),
    ).toBeVisible({ timeout: 10000 })
    const isLoading = await page.getByText('Loading...').isVisible()
    if (isLoading) {
      await expect(page.getByText('Todo List')).toBeVisible({ timeout: 10000 })
    }

    // Arrange — seed a todo so the list area has at least one row, matching
    // the realistic state we want the theme to be applied to.
    const todoText = 'Theme test todo'
    await page.getByPlaceholder('Enter a new todo...').fill(todoText)
    await page.getByRole('button', { name: 'Add', exact: true }).click()
    await expect(page.getByRole('checkbox', { name: todoText })).toBeVisible({
      timeout: 5000,
    })

    // Assert — light theme is the default. `next-themes` sets `data-theme`
    // on the `<html>` element from `ThemeProvider` (see
    // src/providers/ThemeProvider.tsx).
    const html = page.locator('html')
    await expect(html).toHaveAttribute('data-theme', 'light', {
      timeout: 5000,
    })
    const lightBackground = await readBackgroundColor(page)

    // Act — open the user menu and switch to dark theme
    const sidebarHeader = page.locator('[data-sidebar="header"]').first()
    await expect(sidebarHeader).toBeVisible({ timeout: 5000 })
    const avatarButton = sidebarHeader.locator('button').first()
    await expect(avatarButton).toBeVisible({ timeout: 5000 })
    await avatarButton.click()
    const changeThemeTrigger = page.getByText('Change Theme', { exact: false })
    await expect(changeThemeTrigger).toBeVisible()
    await changeThemeTrigger.click()
    const darkThemeOption = page
      .locator('[role="menuitem"]')
      .filter({ hasText: 'Dark' })
      .first()
    await expect(darkThemeOption).toBeVisible()
    await darkThemeOption.click()

    // Assert — `data-theme` flipped to dark, and the body background-color
    // (driven by the `--background` CSS variable in src/globals.css) actually
    // changed. Comparing the computed colors catches a regression where the
    // attribute swaps but the variables don't repaint.
    await expect(html).toHaveAttribute('data-theme', 'dark', { timeout: 5000 })
    await expect
      .poll(async () => readBackgroundColor(page), { timeout: 5000 })
      .not.toBe(lightBackground)
  })
})

/**
 * Returns the computed `background-color` of the document body as a string.
 * Used to assert the theme actually swaps CSS variables (not just the
 * `data-theme` attribute on `<html>`).
 *
 * @param page - The Playwright Page instance.
 * @returns The body's computed `background-color` (e.g. `"rgb(255, 255, 255)"`).
 * @example
 * const before = await readBackgroundColor(page)
 * await switchToDark(page)
 * expect(await readBackgroundColor(page)).not.toBe(before)
 */
async function readBackgroundColor(page: Page): Promise<string> {
  return page.evaluate(
    () => window.getComputedStyle(document.body).backgroundColor,
  )
}
