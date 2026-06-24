import { setupClerkTestingToken } from '@clerk/testing/playwright'
import { test, expect, type Page } from '@playwright/test'

import { resetDatabase } from './_helpers/db'

/**
 * E2E coverage for the paste-import flow (Issue #53 Slice 1; Issue #110 made a
 * multi-line paste into the Add-todo input the sole Todo-zone entry point and
 * retired the Import buttons) across both destination zones. These specs
 * exercise the real paste → import → undo loop against the real Next.js server,
 * real Clerk Dev session, and real Postgres — nothing is mocked (CLAUDE.md:
 * "Never mock auth/DB in E2E tests"). They are the last untested layer for the
 * feature, which otherwise leans on parser unit tests + server integration
 * tests + Storybook.
 *
 * Key behaviours under test:
 * - Todo zone: pasted lines become pending todos; a 60s inline undo banner
 *   appears; Undo removes them again.
 * - Completed zone: pasted "wins" land on the heatmap (verified via the
 *   `?date=` day-detail dialog), NOT in the completed-todos list; Undo removes
 *   them again.
 * - Move-to-Completed: a Todo-zone import can be relocated onto the heatmap
 *   (P2 wrong-zone recovery).
 * - The live preview drops blank / prefix-only lines so the visible count
 *   equals what the confirm sends.
 *
 * Determinism note: the database is reset ONCE per file (`beforeAll`), so state
 * ACCUMULATES across tests in file order (Playwright runs serially, `workers:1`).
 * Every assertion against a persisted/shared surface (pending list, day-detail
 * dialog) therefore keys on the test's OWN distinctive titles — never on an
 * aggregate count — so a prior test's leftover batch can never cross-talk.
 * Dialog-local counts ("3 tasks", "Add 3 to your list") are pure functions of
 * the textarea and stay safe to hard-code.
 */

/**
 * Today's UTC date as YYYY-MM-DD, computed once per test run.
 *
 * Completed-zone imports stamp `completedAt = new Date()` server-side and the
 * heatmap/day-detail bucket by the UTC calendar day, so the only way to verify
 * a Completed import persisted is to open the day-detail dialog for *today*.
 * Unlike the heatmap spec's fixed historical anchor, this date must be "now" —
 * it is `today === today`, not a drifting hard-coded value.
 *
 * Caveat: if a test run straddles a UTC-midnight boundary between this
 * module-load snapshot and the server-side insert, the day could differ by one.
 * That window is seconds wide and the risk is negligible; documented here the
 * same way the heatmap spec documents its own date caveat.
 */
const TODAY_ISO = new Date().toISOString().slice(0, 10)

// Distinctive per-test title sets. Chosen as multi-word phrases that cannot
// collide with the seed's pending todos (see `prisma/seed.ts`) or with each
// other, so presence/absence assertions stay unambiguous across the shared DB.
const TODO_IMPORT_LINES = [
  'Plan the Q3 roadmap',
  'Email the design contractor',
  'Book the team offsite',
]
const TODO_UNDO_LINES = [
  'Cancel the legacy domain',
  'Archive the Q1 retro notes',
]
const COMPLETED_IMPORT_LINES = [
  'Shipped the v2 redesign',
  'Closed the launch-blocker ticket',
  'Mentored the new hire',
]
const COMPLETED_UNDO_LINES = [
  'Won the design award',
  'Hit the quarterly target',
]
const MOVE_TO_COMPLETED_LINES = [
  'Prototype the share image',
  'Write the sprint retro',
]

/**
 * Waits for the Todo List heading to appear, handling the "Loading..." gate.
 * Copied from sibling specs — the home page transitions through a loading
 * skeleton while `useClerkQueryReady` resolves and the persister rehydrates, so
 * a direct `expect(Todo List)` can race the skeleton on slow first paints.
 * @param page - Playwright page object.
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
 * Opens the Todo-zone import dialog by pasting a multi-line list into the
 * Add-todo input. Issue #110 retired the "Import" button — a paste of ≥2
 * non-blank lines into the (empty/fully-selected) input is now the ONLY way in.
 * Dispatches a real `paste` ClipboardEvent carrying a populated DataTransfer;
 * the renderer's `onPaste` reads `clipboardData.getData('text/plain')`, so the
 * dialog opens already SEEDED with `seedLines` — no separate textarea fill.
 * @param page - Playwright page object.
 * @param seedLines - The list to paste; becomes the dialog's seeded content.
 * @returns The dialog locator, ready for assertions / confirm.
 */
async function openTodoImportDialog(page: Page, seedLines: string[]) {
  await pasteIntoTodoInput(page, seedLines.join('\n'))
  const dialog = page.getByRole('dialog')
  await expect(dialog.getByText('Add to your list')).toBeVisible()
  return dialog
}

/**
 * Fires a real `paste` ClipboardEvent (populated DataTransfer) on the Add-todo
 * input — the deterministic way to exercise the renderer's `onPaste` handler
 * without OS clipboard permissions. The handler only intercepts when the input
 * is empty/fully-selected, which a freshly-clicked empty input satisfies.
 * @param page - Playwright page object.
 * @param text - Raw clipboard text (use `\n` between lines for a list).
 */
async function pasteIntoTodoInput(page: Page, text: string) {
  const input = page.getByPlaceholder('Type a todo, or paste a list...')
  await input.click()
  await input.evaluate((element, clipboardText) => {
    const dataTransfer = new DataTransfer()
    dataTransfer.setData('text/plain', clipboardText)
    element.dispatchEvent(
      new ClipboardEvent('paste', {
        clipboardData: dataTransfer,
        bubbles: true,
        cancelable: true,
      }),
    )
  }, text)
}

/**
 * Opens the Completed-zone import dialog and waits for it to be ready for input.
 * The Completed import affordance is always labelled "Import past wins" —
 * CompletedImportEntry renders that single label in BOTH the card's empty and
 * populated states, so it stays reachable no matter how many wins earlier tests
 * imported into the journal, and it never collides with the Todo toolbar's exact
 * "Import".
 * @param page - Playwright page object.
 * @returns The dialog locator, ready for `.getByRole('textbox')`.
 */
async function openCompletedImportDialog(page: Page) {
  await page.getByRole('button', { name: 'Import past wins' }).click()
  const dialog = page.getByRole('dialog')
  await expect(dialog.getByText('Add to Completed')).toBeVisible()
  return dialog
}

/**
 * Navigates to `/home?date=<iso>` and waits for the DayDetailDialog to open.
 * The deep-link is the only way to inspect what actually persisted onto the
 * heatmap for a given day without depending on which heatmap cells the library
 * renders at the current viewport. Mirrors the helper in the heatmap spec; no
 * `waitForLoadState('networkidle')` because Clerk + TanStack background
 * refetches keep the page from ever reaching network-idle (made earlier drafts
 * flaky).
 * @param page - Playwright page object.
 * @param date - YYYY-MM-DD ISO date pushed into the URL search param.
 * @returns The opened day-detail dialog locator.
 */
async function openDayDetailViaDeepLink(page: Page, date: string) {
  await page.goto(`/home?date=${date}`)
  await waitForAppReady(page)
  const dialog = page.getByRole('dialog')
  await expect(dialog).toBeVisible({ timeout: 10000 })
  return dialog
}

test.describe('Paste Import E2E', () => {
  // Reset ONCE for the file — state accumulates across tests (see file header).
  test.beforeAll(resetDatabase)

  test.beforeEach(async ({ page }) => {
    // Clerk testing token must be installed BEFORE navigation so the oRPC
    // mutations/queries are authorized; without it `useClerkQueryReady` never
    // flips true and the dialog can't import.
    await setupClerkTestingToken({ page })
    await page.goto('/home')
    await waitForAppReady(page)
  })

  test.describe('Todo zone', () => {
    test('imports pasted lines as pending todos and offers a 60s undo', async ({
      page,
    }) => {
      // Arrange — paste three tasks into the Add-todo input; the dialog opens
      // seeded with them (Issue #110: paste is the entry point, no Import button).
      const dialog = await openTodoImportDialog(page, TODO_IMPORT_LINES)

      // Act — the seeded paste drives the live count; confirm imports them. The
      // checkboxes appearing below is also the direct-invalidate proof: oRPC
      // mutationOptions don't auto-invalidate, so the list only refetches because
      // the importing window invalidates its own queries in `onImported`.
      await expect(dialog.getByText('3 tasks')).toBeVisible()
      await dialog.getByRole('button', { name: 'Add 3 to your list' }).click()

      // Assert — success toast, the three todos render as pending checkboxes,
      // and the inline undo banner is offered for the 60s window.
      const toaster = page.getByRole('region', { name: /Notifications/ })
      await expect(toaster.getByText('3 added to your list')).toBeVisible({
        timeout: 5000,
      })
      await expect(
        page.getByRole('checkbox', { name: 'Plan the Q3 roadmap' }),
      ).toBeVisible()
      await expect(
        page.getByRole('checkbox', { name: 'Email the design contractor' }),
      ).toBeVisible()
      await expect(
        page.getByRole('checkbox', { name: 'Book the team offsite' }),
      ).toBeVisible()
      await expect(page.getByText('Imported 3 just now')).toBeVisible()
    })

    test('Undo import removes the just-imported todos', async ({ page }) => {
      // Arrange — import two distinctly-titled todos so this test self-seeds.
      const dialog = await openTodoImportDialog(page, TODO_UNDO_LINES)
      await dialog.getByRole('button', { name: 'Add 2 to your list' }).click()
      await expect(
        page.getByRole('checkbox', { name: 'Cancel the legacy domain' }),
      ).toBeVisible()
      await expect(page.getByText('Imported 2 just now')).toBeVisible()

      // Act — click the inline banner's Undo (NOT the toast's "Undo" action).
      await page.getByRole('button', { name: 'Undo import' }).click()

      // Assert — both todos and the banner are gone.
      await expect(
        page.getByRole('checkbox', { name: 'Cancel the legacy domain' }),
      ).toHaveCount(0)
      await expect(
        page.getByRole('checkbox', { name: 'Archive the Q1 retro notes' }),
      ).toHaveCount(0)
      await expect(page.getByText('Imported 2 just now')).not.toBeVisible()
    })

    test('drops blank and prefix-only lines from the live preview', async ({
      page,
    }) => {
      // Arrange — paste five raw lines: two real tasks plus a blank, a
      // whitespace-only line, and a bullet-prefix-only line. The paste opens the
      // dialog (2 real lines clear the multi-line threshold) seeded with all five.
      const dialog = await openTodoImportDialog(page, [
        'First pasted task',
        '',
        '   ',
        '- ',
        'Second pasted task',
      ])

      // Assert — only the two real lines count; the other three are skipped,
      // and the confirm label reflects the importable count (preview-only, no
      // confirm, so no rows persist). The visible count span renders
      // "2 tasks · 3 skipped"; the regex spans both halves so it matches ONLY
      // that span and not the sr-only "2 parsed, 3 skipped" aria-live region
      // (a bare /3 skipped/ would match both and trip Playwright strict mode).
      await expect(dialog.getByText(/2 tasks.*3 skipped/)).toBeVisible()
      await expect(
        dialog.getByRole('button', { name: 'Add 2 to your list' }),
      ).toBeVisible()

      // Act — cancel without importing to keep the shared DB clean.
      await dialog.getByRole('button', { name: 'Cancel' }).click()
      await expect(page.getByRole('dialog')).not.toBeVisible()
    })

    test('confirm is disabled and the empty hint shows when the dialog is cleared', async ({
      page,
    }) => {
      // Arrange — a paste is the only entry point now (an empty paste opens
      // nothing), so open via a throwaway list, then clear the textarea to reach
      // the dialog's empty state.
      const dialog = await openTodoImportDialog(page, [
        'Throwaway line one',
        'Throwaway line two',
      ])
      await dialog.getByRole('textbox').fill('')

      // Assert — the empty hint shows and the confirm label has no count to add
      // (its disabled state guards a no-op import).
      await expect(
        dialog.getByText('nothing to import yet — paste a few lines above'),
      ).toBeVisible()
      await expect(
        dialog.getByRole('button', { name: 'Add 0 to your list' }),
      ).toBeDisabled()
    })

    test('a single-line paste adds inline without opening the dialog, and the Import button is gone', async ({
      page,
    }) => {
      // AC#3 + AC#6: a single line falls through to native paste (no dialog), and
      // the retired toolbar "Import" button no longer exists anywhere on /home.
      await expect(
        page.getByRole('button', { name: 'Import', exact: true }),
      ).toHaveCount(0)

      // Act — paste a single line into the Add-todo input.
      await pasteIntoTodoInput(page, 'just a single grocery item')

      // Assert — no bulk-import dialog opens (the 300ms settle lets any errant
      // open render before we assert its absence).
      await page.waitForTimeout(300)
      await expect(page.getByRole('dialog')).toHaveCount(0)
      await expect(page.getByText('Add to your list')).toHaveCount(0)
    })
  })

  test.describe('Completed zone', () => {
    test('imports pasted wins onto the heatmap, not the completed list', async ({
      page,
    }) => {
      // Arrange — capture today's date BEFORE the import so the deep-link day
      // matches the server's insert-time UTC bucket as closely as possible.
      const todayIso = TODAY_ISO

      // Act — open the Completed import dialog and add three wins.
      const dialog = await openCompletedImportDialog(page)
      await dialog.getByRole('textbox').fill(COMPLETED_IMPORT_LINES.join('\n'))
      await expect(dialog.getByText('3 tasks')).toBeVisible()
      await dialog.getByRole('button', { name: 'Add 3 to Completed' }).click()

      // Assert — Completed-zone success toast + the 60s undo banner appear.
      const toaster = page.getByRole('region', { name: /Notifications/ })
      await expect(toaster.getByText(/3 added .* today's lit/)).toBeVisible({
        timeout: 5000,
      })
      await expect(page.getByText('Imported 3 just now')).toBeVisible()

      // Assert — imported wins do NOT appear as todo checkboxes (Completed-table
      // rows surface on the heatmap, never in the completed-todos list).
      await expect(
        page.getByRole('checkbox', { name: 'Shipped the v2 redesign' }),
      ).toHaveCount(0)

      // Assert — they DID persist: the day-detail dialog for today lists them.
      const dayDetail = await openDayDetailViaDeepLink(page, todayIso)
      await expect(dayDetail.getByText('Shipped the v2 redesign')).toBeVisible()
      await expect(
        dayDetail.getByText('Closed the launch-blocker ticket'),
      ).toBeVisible()
      await expect(dayDetail.getByText('Mentored the new hire')).toBeVisible()
    })

    test('Undo import removes the imported wins from the heatmap', async ({
      page,
    }) => {
      // Arrange — import two distinctly-titled wins so this test self-seeds.
      const todayIso = TODAY_ISO
      const dialog = await openCompletedImportDialog(page)
      await dialog.getByRole('textbox').fill(COMPLETED_UNDO_LINES.join('\n'))
      await dialog.getByRole('button', { name: 'Add 2 to Completed' }).click()
      await expect(page.getByText('Imported 2 just now')).toBeVisible()

      // Act — undo via the inline banner.
      await page.getByRole('button', { name: 'Undo import' }).click()

      // Assert — the banner clears, and the day-detail dialog for today no
      // longer lists these two wins (other tests' batches are unaffected, hence
      // the title-scoped absence check).
      await expect(page.getByText('Imported 2 just now')).not.toBeVisible()
      const dayDetail = await openDayDetailViaDeepLink(page, todayIso)
      await expect(dayDetail.getByText('Won the design award')).toHaveCount(0)
      await expect(dayDetail.getByText('Hit the quarterly target')).toHaveCount(
        0,
      )
    })
  })

  test.describe('Move to Completed (wrong-zone recovery)', () => {
    test('relocates a Todo import onto the heatmap', async ({ page }) => {
      // Arrange — import two todos via the Todo zone, then confirm they landed
      // as pending checkboxes with the banner's Move affordance available.
      const todayIso = TODAY_ISO
      const dialog = await openTodoImportDialog(page, MOVE_TO_COMPLETED_LINES)
      await dialog.getByRole('button', { name: 'Add 2 to your list' }).click()
      await expect(
        page.getByRole('checkbox', { name: 'Prototype the share image' }),
      ).toBeVisible()
      await expect(page.getByText('Imported 2 just now')).toBeVisible()

      // Act — move the batch from the Todo list to Completed (P2 recovery).
      await page.getByRole('button', { name: 'Move to Completed' }).click()

      // Assert — move toast fires and the todos leave the pending list.
      const toaster = page.getByRole('region', { name: /Notifications/ })
      // 10s (not 5s): the move toast fires only after TWO serial oRPC
      // round-trips against the real server — completed.createMany THEN
      // todo.deleteMany — so it needs more headroom than the single-mutation
      // import toasts above.
      await expect(toaster.getByText(/2 moved .* today's lit/)).toBeVisible({
        timeout: 10000,
      })
      await expect(
        page.getByRole('checkbox', { name: 'Prototype the share image' }),
      ).toHaveCount(0)
      await expect(
        page.getByRole('checkbox', { name: 'Write the sprint retro' }),
      ).toHaveCount(0)

      // Assert — the moved tasks now persist on today's heatmap day-detail.
      const dayDetail = await openDayDetailViaDeepLink(page, todayIso)
      await expect(
        dayDetail.getByText('Prototype the share image'),
      ).toBeVisible()
      await expect(dayDetail.getByText('Write the sprint retro')).toBeVisible()
    })
  })
})
