import { setupClerkTestingToken } from '@clerk/testing/playwright'
import { type Page } from '@playwright/test'

import { THEME_CROSSFADE_DURATION_MS } from '@/lib/constants/theme'

import { test, expect } from './_helpers/coverage'
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
    await page
      .getByPlaceholder('Type a todo, or paste a list...')
      .fill(todoText)
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

    // Act — switch to dark theme the way a user does (sidebar menu → Change
    // Theme → Dark), via the shared helper so all theme switches share one path.
    await switchToTheme(page, 'Dark')

    // Assert — `data-theme` flipped to dark, and the body background-color
    // (driven by the `--background` CSS variable in src/globals.css) actually
    // changed. Comparing the computed colors catches a regression where the
    // attribute swaps but the variables don't repaint.
    await expect(html).toHaveAttribute('data-theme', 'dark', { timeout: 5000 })
    await expect
      .poll(async () => readBackgroundColor(page), { timeout: 5000 })
      .not.toBe(lightBackground)
  })

  // Regression guard for the PR #71 theme crossfade (DESIGN.md Motion → "Theme
  // toggle: crossfade, no flash"). How it LOOKS was verified once by recorded
  // video frames at build time; these tests are the durable contract guard — the
  // <ThemeTransition> machinery must arm the transient `theme-transition` class
  // ONLY for the switch window and never leak it onto hover/focus. Assertions are
  // pure DOM-class state (+ the frozen clock from beforeEach), so they stay
  // deterministic on CI rather than sampling opacity mid-animation.
  test('arms the crossfade class only during a theme switch, then drops it', async ({
    page,
  }) => {
    // Arrange — the crossfade is keyed off a transient <html> class that must be
    // absent at rest, so hover/focus repaints stay instant.
    const html = page.locator('html')
    await expect(html).toHaveAttribute('data-theme', 'light', { timeout: 5000 })
    await expect(html).not.toHaveClass(/theme-transition/)

    // Act — switch theme the way a user does (sidebar menu → Change Theme → Dark).
    await switchToTheme(page, 'Dark')

    // Assert — the switch arms the crossfade: <html> gains `theme-transition` so
    // globals.css animates colors across the whole UI for this one window.
    await expect(html).toHaveAttribute('data-theme', 'dark', { timeout: 5000 })
    await expect(html).toHaveClass(/theme-transition/)

    // Act — advance the frozen clock past the crossfade window.
    await page.clock.fastForward(THEME_CROSSFADE_DURATION_MS + 50)

    // Assert — the class is dropped once the fade completes, so later hover/focus
    // repaint instantly with no lingering global transition.
    await expect(html).not.toHaveClass(/theme-transition/)
  })

  test('does not arm the crossfade when hovering cards or the sidebar', async ({
    page,
  }) => {
    // Arrange — at rest the crossfade class is absent and <html> carries no
    // crossfade transition, so per-element hover color changes are instant. This
    // guards the regression where the global color transition leaked onto every
    // hover (making the whole UI feel laggy).
    const html = page.locator('html')
    await expect(html).not.toHaveClass(/theme-transition/)
    expect(await readTransitionDuration(page)).toBe('0s')

    // Act — hover real token-bearing surfaces (a card, then the sidebar).
    const card = page.locator('[data-slot="card"]').first()
    await expect(card).toBeVisible({ timeout: 10000 })
    await card.hover()
    const sidebar = page.locator('[data-sidebar="sidebar"]').first()
    if (await sidebar.isVisible()) {
      await sidebar.hover()
    }

    // Assert — hovering never arms the crossfade (it is gated to data-theme
    // changes), so <html> stays class-free and transition-free.
    await expect(html).not.toHaveClass(/theme-transition/)
    expect(await readTransitionDuration(page)).toBe('0s')
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

/**
 * Returns the computed `transition-duration` of the `<html>` element. The
 * crossfade rule in globals.css targets `html.theme-transition`, so `<html>`
 * (which carries no Tailwind transition utility of its own) reads `"0s"` at rest
 * and the crossfade duration only while the transient class is present — letting
 * the no-hover-leak test prove the transition is scoped, not global.
 *
 * @param page - The Playwright Page instance.
 * @returns The `<html>` computed `transition-duration` (e.g. `"0s"`).
 * @example
 * expect(await readTransitionDuration(page)).toBe('0s') // at rest
 */
async function readTransitionDuration(page: Page): Promise<string> {
  return page.evaluate(
    () => window.getComputedStyle(document.documentElement).transitionDuration,
  )
}

/**
 * Switches the active theme the way a user does — opening the sidebar avatar
 * menu, the "Change Theme" submenu, then picking an option. Used by the crossfade
 * regression tests so they drive the real next-themes + ThemeTransition path
 * instead of poking `data-theme` directly (which would bypass the machinery
 * under test).
 *
 * @param page - The Playwright Page instance.
 * @param optionLabel - The visible theme name to select (e.g. `"Dark"`).
 * @returns Resolves once the theme option has been clicked.
 * @example
 * await switchToTheme(page, 'Dark')
 */
async function switchToTheme(page: Page, optionLabel: string): Promise<void> {
  const sidebarHeader = page.locator('[data-sidebar="header"]').first()
  await expect(sidebarHeader).toBeVisible({ timeout: 5000 })
  const avatarButton = sidebarHeader.locator('button').first()
  await expect(avatarButton).toBeVisible({ timeout: 5000 })
  await avatarButton.click()
  const changeThemeTrigger = page.getByText('Change Theme', { exact: false })
  await expect(changeThemeTrigger).toBeVisible()
  await changeThemeTrigger.click()
  const themeOption = page
    .locator('[role="menuitem"]')
    .filter({ hasText: optionLabel })
    .first()
  await expect(themeOption).toBeVisible()
  await themeOption.click()
}
