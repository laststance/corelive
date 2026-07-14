import { setupClerkTestingToken } from '@clerk/testing/playwright'
import { type Page } from '@playwright/test'

import { test, expect } from './_helpers/coverage'
import { resetDatabase } from './_helpers/db'

/**
 * Fixed historical date used as the dialog "anchor" for every test that
 * needs a starting day. The URL param and the label are both hard-coded
 * (no `new Date()` in any assertion), so the spec is replay-deterministic
 * per plan §3.5 *regardless of how far past* today's date drifts from
 * when these tests were authored — `getDayDetail` accepts any valid
 * calendar date, it does not gate on the heatmap's visible range.
 *
 * Caveat: cells for `DEEP_LINK_DATE` may fall outside the heatmap when
 * replayed >365 days later, but that only affects cell *clicking* tests,
 * and these tests open the dialog via `?date=` rather than via the cell,
 * so they remain valid. If a future test exercises cell clicks, install
 * `page.clock` to pin the test-environment date instead of relying on
 * the trailing year being wide enough.
 */
const DEEP_LINK_DATE = '2026-04-01'
const DEEP_LINK_DATE_LABEL = 'April 1, 2026'
const NEXT_DAY_LABEL = 'April 2, 2026'
const PREV_DAY_LABEL = 'March 31, 2026'

/**
 * Waits for the Todo List heading to appear, handling the Loading... state.
 * Copied from sibling specs (todo-app.spec.ts, category.spec.ts) — the home
 * page transitions through a "Loading..." gate while `useClerkQueryReady`
 * resolves and the persister rehydrates, so a direct `expect(Todo List)` can
 * race with the loading skeleton on slow first-paints.
 * @param page - Playwright page object
 */
async function waitForAppReady(page: Page) {
  await expect(
    page.getByText('Todo List').or(page.getByText('Loading...')),
  ).toBeVisible({ timeout: 10000 })

  const isLoading = await page.getByText('Loading...').isVisible()
  if (isLoading) {
    await expect(page.getByText('Todo List')).toBeVisible({ timeout: 10000 })
  }
}

/**
 * Navigates to `/home?date=<iso>` and waits for the DayDetailDialog to open.
 * Bundles the three steps every nav-flow test needs (goto + app ready +
 * dialog visible) so the test bodies stay focused on the *behaviour* under
 * test instead of the boilerplate.
 *
 * The deep-link path is the only way to put the dialog in a known starting
 * state without seeding a completed Todo — the home page seed only creates
 * pending Todos (see `prisma/seed.ts`), so the heatmap cells are all empty
 * and clicking one would still surface a "rest day" dialog. Using `?date=`
 * gets us the same dialog without depending on which cells the heatmap
 * library renders at the current viewport size.
 *
 * @param page - Playwright page object
 * @param date - YYYY-MM-DD ISO date pushed into the URL search param
 * @example
 * await openDialogViaDeepLink(page, '2026-04-01')
 */
async function openDialogViaDeepLink(page: Page, date: string) {
  await page.goto(`/home?date=${date}`)
  // No `waitForLoadState('networkidle')` — Clerk + TanStack Query background
  // refetches keep the page from ever reaching network-idle on Vercel-like
  // environments, which made earlier drafts of this spec flaky. The app
  // readiness gate + dialog role locator are sufficient to know the deep
  // link has resolved (Codex review MEDIUM).
  await waitForAppReady(page)
  await expect(page.getByRole('dialog')).toBeVisible({ timeout: 10000 })
}

test.describe('Heatmap Day Detail E2E', () => {
  test.beforeAll(resetDatabase)

  test.beforeEach(async ({ page }) => {
    // Setup Clerk testing token for each test — required for Clerk to gate
    // the oRPC dayDetail query open. Without this, `useClerkQueryReady`
    // returns false and the dialog never fetches.
    await setupClerkTestingToken({ page })
  })

  test('shows all seven weekday rows inside the Activity heatmap', async ({
    page,
  }) => {
    // Arrange — a desktop-width card enlarges cells beyond the SVG browser default height.
    await page.setViewportSize({ width: 1600, height: 900 })
    await page.goto('/home')
    await waitForAppReady(page)
    const heatmap = page.locator('svg.w-heatmap')
    const finalWeekdayRow = heatmap.locator('rect[data-row="6"]').first()
    await expect(heatmap).toBeVisible()
    await expect(finalWeekdayRow).toBeAttached()

    // Act — measure actual rendered geometry because visibility ignores SVG clipping.
    const heatmapBounds = await heatmap.boundingBox()
    const finalWeekdayRowBounds = await finalWeekdayRow.boundingBox()

    // Assert — missing geometry is itself a broken heatmap, so fail with a clear reason.
    if (!heatmapBounds || !finalWeekdayRowBounds) {
      throw new Error('Activity heatmap geometry was unavailable')
    }
    expect(
      finalWeekdayRowBounds.y + finalWeekdayRowBounds.height,
    ).toBeLessThanOrEqual(heatmapBounds.y + heatmapBounds.height)
  })

  test.describe('Deep-link via ?date=', () => {
    test('opens dialog when date param is a valid calendar date', async ({
      page,
    }) => {
      // Arrange — navigate with a valid ?date= param.
      await openDialogViaDeepLink(page, DEEP_LINK_DATE)

      // Assert — dialog opens with the date subtitle reflecting the URL date.
      const dialog = page.getByRole('dialog')
      await expect(dialog.getByText(DEEP_LINK_DATE_LABEL)).toBeVisible()
    })

    test('shows toast + keeps dialog closed when date param is non-ISO', async ({
      page,
    }) => {
      // Arrange — non-ISO date triggers the Zod regex-fail branch.
      await page.goto('/home?date=not-a-date')
      await waitForAppReady(page)

      // Assert — toast surfaces the invalid-URL message AND the dialog stays
      // closed. Toaster region role taken from `sonner` defaults — same
      // selector pattern used in qa-fixes.spec.ts.
      const toaster = page.getByRole('region', { name: /Notifications/ })
      await expect(toaster.getByText(/invalid date in url/i)).toBeVisible({
        timeout: 5000,
      })
      await expect(page.getByRole('dialog')).not.toBeVisible()
    })

    test('shows toast + keeps dialog closed when date param is a non-existent calendar date', async ({
      page,
    }) => {
      // Arrange — 2026-02-31 passes the YYYY-MM-DD regex but fails the
      // calendar round-trip refine in DayDetailInputSchema. Locks the second
      // arm of the validator so a regression that drops the refine surfaces
      // here, not in production.
      await page.goto('/home?date=2026-02-31')
      await waitForAppReady(page)

      // Assert — same toast + closed-dialog outcome as the regex-fail branch.
      const toaster = page.getByRole('region', { name: /Notifications/ })
      await expect(toaster.getByText(/invalid date in url/i)).toBeVisible({
        timeout: 5000,
      })
      await expect(page.getByRole('dialog')).not.toBeVisible()
    })
  })

  test.describe('Day navigation', () => {
    test('chevron > advances the dialog by one day', async ({ page }) => {
      // Arrange
      await openDialogViaDeepLink(page, DEEP_LINK_DATE)
      const dialog = page.getByRole('dialog')
      await expect(dialog.getByText(DEEP_LINK_DATE_LABEL)).toBeVisible()

      // Act — chevron uses aria-label="Next day" (see DayDetailDialog.tsx).
      await dialog.getByRole('button', { name: 'Next day' }).click()

      // Assert — date subtitle re-renders with April 2 2026; April 1 is gone.
      await expect(dialog.getByText(NEXT_DAY_LABEL)).toBeVisible({
        timeout: 5000,
      })
      await expect(dialog.getByText(DEEP_LINK_DATE_LABEL)).not.toBeVisible()
    })

    test('chevron < reverses the dialog by one day', async ({ page }) => {
      // Arrange
      await openDialogViaDeepLink(page, DEEP_LINK_DATE)
      const dialog = page.getByRole('dialog')
      await expect(dialog.getByText(DEEP_LINK_DATE_LABEL)).toBeVisible()

      // Act
      await dialog.getByRole('button', { name: 'Previous day' }).click()

      // Assert — date subtitle shows March 31 2026 (cross-month boundary
      // covered by shiftIsoDate's UTC arithmetic).
      await expect(dialog.getByText(PREV_DAY_LABEL)).toBeVisible({
        timeout: 5000,
      })
      await expect(dialog.getByText(DEEP_LINK_DATE_LABEL)).not.toBeVisible()
    })

    test('j key advances the dialog by one day (PR2)', async ({ page }) => {
      // Arrange
      await openDialogViaDeepLink(page, DEEP_LINK_DATE)
      const dialog = page.getByRole('dialog')
      await expect(dialog.getByText(DEEP_LINK_DATE_LABEL)).toBeVisible()

      // Act — j is the "next" half of vim-style j/k nav; useKeyboardNav
      // attaches a window listener whenever the dialog is open, so the
      // currently-focused close X or chevron doesn't matter (the input guard
      // only blocks INPUT/TEXTAREA/contentEditable targets).
      await page.keyboard.press('j')

      // Assert — same as chevron > result.
      await expect(dialog.getByText(NEXT_DAY_LABEL)).toBeVisible({
        timeout: 5000,
      })
      await expect(dialog.getByText(DEEP_LINK_DATE_LABEL)).not.toBeVisible()
    })

    test('k key reverses the dialog by one day (PR2)', async ({ page }) => {
      // Arrange
      await openDialogViaDeepLink(page, DEEP_LINK_DATE)
      const dialog = page.getByRole('dialog')
      await expect(dialog.getByText(DEEP_LINK_DATE_LABEL)).toBeVisible()

      // Act
      await page.keyboard.press('k')

      // Assert — same as chevron < result.
      await expect(dialog.getByText(PREV_DAY_LABEL)).toBeVisible({
        timeout: 5000,
      })
      await expect(dialog.getByText(DEEP_LINK_DATE_LABEL)).not.toBeVisible()
    })

    test('Esc closes the dialog', async ({ page }) => {
      // Arrange
      await openDialogViaDeepLink(page, DEEP_LINK_DATE)

      // Act — Esc handling is delegated to Radix Dialog (useKeyboardNav
      // intentionally does NOT bind Esc to avoid double-handling, per the
      // hook's JSDoc). Pressing Escape should still fully close the dialog.
      await page.keyboard.press('Escape')

      // Assert — dialog unmounts; the dialog role is no longer in the DOM.
      await expect(page.getByRole('dialog')).not.toBeVisible({ timeout: 5000 })
    })
  })

  test.describe('URL sync (outbound)', () => {
    test('mirrors day navigation into the ?date= URL so the open day stays shareable', async ({
      page,
    }) => {
      // Arrange — deep-link open; the URL already carries the anchor date.
      await openDialogViaDeepLink(page, DEEP_LINK_DATE)
      await expect(page).toHaveURL(new RegExp(`date=${DEEP_LINK_DATE}`))
      const dialog = page.getByRole('dialog')

      // Act — advance one day via the chevron.
      await dialog.getByRole('button', { name: 'Next day' }).click()

      // Assert — the dialog AND the address bar both move to April 2 2026, so a
      // copied URL reopens the day the user is actually looking at.
      await expect(dialog.getByText(NEXT_DAY_LABEL)).toBeVisible({
        timeout: 5000,
      })
      await expect(page).toHaveURL(/date=2026-04-02/)
    })

    test('clears ?date= from the URL when the dialog closes', async ({
      page,
    }) => {
      // Arrange — deep-link open; URL carries the date.
      await openDialogViaDeepLink(page, DEEP_LINK_DATE)
      await expect(page).toHaveURL(new RegExp(`date=${DEEP_LINK_DATE}`))

      // Act — close via Esc.
      await page.keyboard.press('Escape')

      // Assert — dialog gone and the now-stale ?date= is dropped, so a copied
      // URL after closing doesn't reopen a dialog the user already dismissed.
      await expect(page.getByRole('dialog')).not.toBeVisible({ timeout: 5000 })
      await expect(page).not.toHaveURL(/date=/)
    })
  })
})
