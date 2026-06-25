import { setupClerkTestingToken } from '@clerk/testing/playwright'
import { test, expect, type Locator, type Page } from '@playwright/test'

import { STORAGE_SCHEMA_VERSION } from '@/lib/redux/migratePersistedState'

import { resetDatabase } from './_helpers/db'

/**
 * #113 — moving a single finished task to Completed in 居残りモード, by the per-row
 * button AND by dragging the row onto the Completed drop zone. The drag tests
 * also pin down the load-bearing guard: dragging a PENDING row onto the zone must
 * be a NO-OP, because the reused delete→archive path hard-deletes a non-completed
 * row (data loss) — and in retain mode pending + completed rows share one
 * sortable list.
 *
 * Runs under the `web` Playwright project (real Clerk storageState → mutations
 * persist to Postgres). Web E2E can't boot on the author's Mac; CI is the gate.
 *
 * @example
 *   pnpm e2e:web -- todo-retain-archive
 */

/** localStorage key the Redux store persists preferences under (store.ts). */
const STORAGE_KEY = 'corelive-redux-state'

const ORPC_PATHS = {
  toggleTodo: '/api/orpc/todo/toggle',
  deleteTodo: '/api/orpc/todo/delete',
} as const

/**
 * Persisted Redux blob that boots the app with 居残りモード ON, so a checked task
 * stays in the list (strikethrough) and the per-row "Tuck into Completed" button
 * + drop zone appear. Seeded at the CURRENT schema version (deep-merged into the
 * defaults on hydration) — exactly what a user who flipped the switch has on disk.
 * @returns The JSON string to write into localStorage before the app boots.
 * @example
 * seedRetainModeOn() // => '{"version":1,"state":{"preferences":{"retainCompletedInList":true}}}'
 */
function seedRetainModeOn(): string {
  return JSON.stringify({
    version: STORAGE_SCHEMA_VERSION,
    state: { preferences: { retainCompletedInList: true } },
  })
}

/**
 * Locates the active-list row for a given task text by anchoring on its checkbox
 * (aria-label is the task text) and climbing to the TodoItem root.
 * @param page - Playwright page.
 * @param text - The task text.
 * @returns A locator for the row container.
 */
function activeRow(page: Page, text: string): Locator {
  return page
    .getByRole('checkbox', { name: text })
    .locator('xpath=ancestor::div[contains(@class,"transition-shadow")]')
}

/**
 * Adds a pending task via the Add form and waits for the server row to settle
 * (positive id — optimistic placeholders are `todo--<ts>`, double-dash).
 * @param page - Playwright page.
 * @param text - The task text to add.
 */
async function addPendingTodo(page: Page, text: string): Promise<void> {
  await page.getByPlaceholder('Type a todo, or paste a list...').fill(text)
  await page.getByRole('button', { name: 'Add', exact: true }).click()
  const checkbox = page
    .getByRole('checkbox', { name: text })
    .and(page.locator('[id^="todo-"]:not([id^="todo--"])'))
  await expect(checkbox).toBeVisible()
  await expect(checkbox).toHaveAttribute('id', /^todo-[^-]/, { timeout: 5000 })
}

/**
 * Checks a task off in 居残りモード: the toggle POST persists completed:true and
 * the row STAYS in the list with a strikethrough (the retain behavior).
 * @param page - Playwright page.
 * @param text - The task text to complete.
 */
async function completeRetainedTodo(page: Page, text: string): Promise<void> {
  const togglePromise = page.waitForResponse(
    (resp) =>
      resp.url().includes(ORPC_PATHS.toggleTodo) &&
      resp.request().method() === 'POST',
    { timeout: 10000 },
  )
  await page.getByRole('checkbox', { name: text }).first().click()
  expect((await togglePromise).status()).toBe(200)
  // It stays in the active list — now a completed-retained row with the button.
  await expect(
    page.getByRole('button', { name: `Tuck "${text}" into Completed` }),
  ).toBeVisible({ timeout: 10000 })
}

/**
 * Real-mouse drag from `source` to `target` with enough interpolation to satisfy
 * dnd-kit's PointerSensor activation. Mirrors the proven skill-tree helper.
 * @param page - Playwright page.
 * @param source - The drag handle to pick up.
 * @param target - The drop target.
 */
async function mouseDrag(
  page: Page,
  source: Locator,
  target: Locator,
): Promise<void> {
  await source.hover()
  await target.scrollIntoViewIfNeeded()
  const [sourceBox, targetBox] = await Promise.all([
    source.boundingBox(),
    target.boundingBox(),
  ])
  if (!sourceBox || !targetBox) {
    throw new Error('mouseDrag: source or target has no bounding box')
  }
  const startX = sourceBox.x + sourceBox.width / 2
  const startY = sourceBox.y + sourceBox.height / 2
  const endX = targetBox.x + targetBox.width / 2
  const endY = targetBox.y + targetBox.height / 2
  await page.mouse.move(startX, startY)
  await page.mouse.down()
  await page.mouse.move(startX + 10, startY + 10, { steps: 3 })
  await page.mouse.move(endX, endY, { steps: 20 })
  await page.mouse.up()
}

test.describe('Move finished tasks to Completed individually (#113)', () => {
  test.describe.configure({ mode: 'serial' })
  // Reset per-test (not once for the serial suite) so a mid-suite failure can't
  // leak persisted rows into the next case. No-op on CI (E2E_SKIP_PER_SPEC_RESET
  // + global-setup own the reset there); it earns its keep on local sequential runs.
  test.beforeEach(resetDatabase)

  test.beforeEach(async ({ page }) => {
    await setupClerkTestingToken({ page })
    await page.addInitScript(
      ({ storageKey, blob }) => {
        localStorage.setItem(storageKey, blob)
      },
      { storageKey: STORAGE_KEY, blob: seedRetainModeOn() },
    )
  })

  test('the per-row button files just that finished task into Completed', async ({
    page,
  }) => {
    // Arrange — a finished, retained row.
    const todoText = 'Retain button fixture'
    await page.goto('/home')
    await addPendingTodo(page, todoText)
    await completeRetainedTodo(page, todoText)

    // Act — tap its "Tuck into Completed" button (reuses delete→archive).
    const deletePromise = page.waitForResponse(
      (resp) =>
        resp.url().includes(ORPC_PATHS.deleteTodo) &&
        resp.request().method() === 'POST',
      { timeout: 10000 },
    )
    await page
      .getByRole('button', { name: `Tuck "${todoText}" into Completed` })
      .click()

    // Assert — it persisted (archive) and left the active list (just that one).
    expect((await deletePromise).status()).toBe(200)
    await expect(
      page.getByRole('button', { name: `Tuck "${todoText}" into Completed` }),
    ).toHaveCount(0, { timeout: 10000 })
  })

  test('dragging a finished row onto the Completed zone files just that task', async ({
    page,
  }) => {
    // Arrange — a finished, retained row + the now-visible drop zone.
    const todoText = 'Retain drag fixture'
    await page.goto('/home')
    await addPendingTodo(page, todoText)
    // #113 gate: with no finished task yet, the Completed drop zone is absent
    // (isRetaining && completedInListCount > 0) — it appears only once one is checked.
    await expect(page.getByTestId('completed-dropzone')).toHaveCount(0)
    await completeRetainedTodo(page, todoText)
    const dropZone = page.getByTestId('completed-dropzone')
    await expect(dropZone).toBeVisible()

    // Act — drag the row's handle onto the Completed drop zone.
    const deletePromise = page.waitForResponse(
      (resp) =>
        resp.url().includes(ORPC_PATHS.deleteTodo) &&
        resp.request().method() === 'POST',
      { timeout: 10000 },
    )
    await mouseDrag(
      page,
      activeRow(page, todoText).getByRole('button', {
        name: 'Drag to reorder',
      }),
      dropZone,
    )

    // Assert — the drop archived it (sortable source → external droppable
    // resolves) and removed just that one row.
    expect((await deletePromise).status()).toBe(200)
    await expect(
      page.getByRole('button', { name: `Tuck "${todoText}" into Completed` }),
    ).toHaveCount(0, { timeout: 10000 })
  })

  test('dragging a PENDING row onto the Completed zone is a no-op (no data loss)', async ({
    page,
  }) => {
    // Arrange — a completed row (so the drop zone exists) AND a pending row that
    // must NOT be archived/hard-deleted if dragged there.
    const completedText = 'Retain guard completed'
    const pendingText = 'Retain guard pending'
    await page.goto('/home')
    await addPendingTodo(page, completedText)
    await completeRetainedTodo(page, completedText)
    await addPendingTodo(page, pendingText)
    const dropZone = page.getByTestId('completed-dropzone')
    await expect(dropZone).toBeVisible()

    // Act — drag the PENDING row's handle onto the Completed drop zone. The
    // sibling "dragging a finished row" test proves this same mouseDrag lands on
    // the zone (it fires a 200 delete), so the survival asserted below is the
    // guard no-oping a *pending* drop — not the drag silently missing its target.
    await mouseDrag(
      page,
      activeRow(page, pendingText).getByRole('button', {
        name: 'Drag to reorder',
      }),
      dropZone,
    )

    // Assert — the guard no-oped: the pending task is still in the list, both in
    // the live UI and after a reload (it was never deleted from the database).
    await expect(
      page.getByRole('checkbox', { name: pendingText }),
    ).toBeVisible()
    await page.reload()
    await expect(page.getByRole('checkbox', { name: pendingText })).toBeVisible(
      { timeout: 10000 },
    )
  })

  test('tucking one finished task leaves my other finished tasks in the list', async ({
    page,
  }) => {
    // Arrange — two finished, retained rows. AC5: moving one files ONLY that one;
    // the rest of my checked tasks stay in the list until I move each of them.
    const tuckedText = 'Retain AC5 tucked'
    const stayingText = 'Retain AC5 staying'
    await page.goto('/home')
    await addPendingTodo(page, tuckedText)
    await addPendingTodo(page, stayingText)
    await completeRetainedTodo(page, tuckedText)
    await completeRetainedTodo(page, stayingText)

    // Act — tuck only the first finished task into Completed.
    const deletePromise = page.waitForResponse(
      (resp) =>
        resp.url().includes(ORPC_PATHS.deleteTodo) &&
        resp.request().method() === 'POST',
      { timeout: 10000 },
    )
    await page
      .getByRole('button', { name: `Tuck "${tuckedText}" into Completed` })
      .click()
    expect((await deletePromise).status()).toBe(200)

    // Assert — only that one left; the other finished task is untouched, still a
    // completed-retained row with its own Tuck button and checkbox in the list.
    await expect(
      page.getByRole('button', { name: `Tuck "${tuckedText}" into Completed` }),
    ).toHaveCount(0, { timeout: 10000 })
    await expect(
      page.getByRole('button', {
        name: `Tuck "${stayingText}" into Completed`,
      }),
    ).toBeVisible()
    await expect(
      page.getByRole('checkbox', { name: stayingText }),
    ).toBeVisible()
  })

  test('checking then tucking before the save commits keeps the win (no hard-delete)', async ({
    page,
  }) => {
    // Arrange — a pending row, plus a HELD toggle response so the completion
    // stays "in flight". This is the slow-network window where the #113 data-loss
    // race lives: the row is optimistically completed in the UI, but the DB still
    // sees it pending, so the reused delete→archive path would HARD-DELETE it.
    const todoText = 'Retain race fixture'
    await page.goto('/home')
    await addPendingTodo(page, todoText)

    let releaseToggle = (): void => {}
    const toggleHeld = new Promise<void>((resolve) => {
      releaseToggle = resolve
    })
    // Hold the toggle POST open until we release it (continue, NOT abort —
    // aborting rolls the optimistic completion back and the button disappears).
    await page.route(/\/api\/orpc\/todo\/toggle/, async (route) => {
      await toggleHeld
      await route.continue()
    })
    // Tripwire: nothing may archive/delete this row while the toggle is unsettled.
    let deleteFiredWhileInFlight = false
    page.on('request', (request) => {
      if (
        request.url().includes(ORPC_PATHS.deleteTodo) &&
        request.method() === 'POST'
      ) {
        deleteFiredWhileInFlight = true
      }
    })

    // Act 1 — check the task. The optimistic update strikes it through and shows
    // the "Tuck into Completed" button immediately, before the toggle commits.
    await page.getByRole('checkbox', { name: todoText }).first().click()
    const tuckButton = page.getByRole('button', {
      name: `Tuck "${todoText}" into Completed`,
    })

    // Assert 1 — the button is present but INERT until the win is durable. On the
    // unfixed code it is enabled here, so a tap hard-deletes the completion.
    await expect(tuckButton).toBeVisible()
    await expect(tuckButton).toBeDisabled()
    // The pointer path mirrors the same guard: the Completed drop zone renders
    // (a finished row now exists) but is marked inert, so a drag-drop can't
    // silently no-op during the in-flight window.
    await expect(page.getByTestId('completed-dropzone')).toHaveAttribute(
      'aria-disabled',
      'true',
    )
    expect(deleteFiredWhileInFlight).toBe(false)

    // Act 2 — let the toggle commit; the button re-arms once the win is saved.
    const togglePromise = page.waitForResponse(
      (resp) =>
        resp.url().includes(ORPC_PATHS.toggleTodo) &&
        resp.request().method() === 'POST',
      { timeout: 10000 },
    )
    releaseToggle()
    expect((await togglePromise).status()).toBe(200)
    await expect(tuckButton).toBeEnabled()
    // ...and the drop zone re-arms (sheds its inert marker) once the win is durable.
    await expect(page.getByTestId('completed-dropzone')).not.toHaveAttribute(
      'aria-disabled',
      'true',
    )

    // Act 3 — now tucking archives it (heatmap-safe) instead of hard-deleting.
    const deletePromise = page.waitForResponse(
      (resp) =>
        resp.url().includes(ORPC_PATHS.deleteTodo) &&
        resp.request().method() === 'POST',
      { timeout: 10000 },
    )
    await tuckButton.click()
    expect((await deletePromise).status()).toBe(200)

    // Assert 2 — it left the active list as an archive (not destroyed): the row
    // is gone and, after a reload, does not come back as a pending task.
    await expect(tuckButton).toHaveCount(0, { timeout: 10000 })
    await page.reload()
    await expect(page.getByRole('checkbox', { name: todoText })).toHaveCount(
      0,
      {
        timeout: 10000,
      },
    )
  })
})
