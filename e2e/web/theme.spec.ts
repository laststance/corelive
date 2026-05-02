import { argosScreenshot } from '@argos-ci/playwright'
import { setupClerkTestingToken } from '@clerk/testing/playwright'
import { expect, test } from '@playwright/test'

import { resetDatabase } from './_helpers/db'

test.describe('Theme Visual Test', () => {
  // Reset the database once before this spec runs so the screenshots capture
  // exactly the seeded fixture TODOs (see `prisma/seed.ts`) plus the one
  // todo this test adds. Without this, leftover rows from prior spec files
  // (random IDs from todo-app/category/qa-fixes/skill-tree) bleed into the
  // Argos snapshot and produce false-positive visual diffs.
  test.beforeAll(resetDatabase)

  test.beforeEach(async ({ page }) => {
    // Setup Clerk testing token for each test
    // This is required for Clerk to work properly in test mode
    await setupClerkTestingToken({ page })

    // Freeze the browser clock so client-side `new Date()` calls render
    // deterministically across runs. Without this, `ContributionGraph`'s
    // `endDate` (computed via `useMemo(() => normalizeDate(new Date()))`)
    // shifts day-by-day and produces false-positive Argos diffs.
    // The fixed reference is in the past relative to any realistic CI run
    // so Clerk session token validation (which compares `iat`/`exp` against
    // the browser clock) still treats real tokens as freshly issued.
    await page.clock.install({ time: new Date('2026-01-15T12:00:00Z') })

    // Navigate to the TODO app home page
    // Authentication state is automatically loaded from playwright/.auth/user.json
    await page.goto('/home')
    await page.waitForLoadState('networkidle')
  })

  test('should capture screenshots for light and dark themes', async ({
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

    // Arrange — seed a todo whose label is a fixed constant. Embedding
    // `Date.now()` / `Math.random()` here would render a different label every
    // run and surface as an Argos visual diff even when the UI itself has not
    // changed. `globalSetup` resets the database before each `pnpm e2e:web`
    // invocation, so a stable string never collides with prior fixtures.
    const todoText = 'Theme test todo'
    await page.getByPlaceholder('Enter a new todo...').fill(todoText)
    await page.getByRole('button', { name: 'Add', exact: true }).click()
    const todoCheckbox = page.getByRole('checkbox', { name: todoText })
    await expect(todoCheckbox).toBeVisible({ timeout: 5000 })
    await page.waitForTimeout(1000) // let UI settle before screenshotting

    // Arrange — `createdAt` is stamped server-side at insert time, so its
    // value is the test execution date and cannot be fixed via `page.clock`.
    // Mask the visible field for both light and dark snapshots.
    const createdAtMask = [page.locator('[data-testid="todo-created-at"]')]

    // Act 1 — capture the light theme (default) screenshot
    await argosScreenshot(page, 'home-light-theme', { mask: createdAtMask })

    // Act 2 — open the user menu and switch to dark theme
    const sidebarHeader = page.locator('[data-sidebar="header"]').first()
    await expect(sidebarHeader).toBeVisible({ timeout: 5000 })
    const avatarButton = sidebarHeader.locator('button').first()
    await expect(avatarButton).toBeVisible({ timeout: 5000 })
    await avatarButton.click()
    await page.waitForTimeout(500) // dropdown animation
    const changeThemeTrigger = page.getByText('Change Theme', { exact: false })
    await expect(changeThemeTrigger).toBeVisible()
    await changeThemeTrigger.click()
    await page.waitForTimeout(500) // submenu animation
    const darkThemeOption = page
      .locator('[role="menuitem"]')
      .filter({ hasText: 'Dark' })
      .first()
    await expect(darkThemeOption).toBeVisible()
    await darkThemeOption.click()
    await page.waitForTimeout(1500) // theme change triggers re-renders

    // Assert — html element reflects the new theme
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark', {
      timeout: 5000,
    })

    // Act 3 — capture the dark theme screenshot (same mask as light)
    await argosScreenshot(page, 'home-dark-theme', { mask: createdAtMask })
  })
})
