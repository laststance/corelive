import { setupClerkTestingToken } from '@clerk/testing/playwright'
import { expect, test, type Locator, type Page } from '@playwright/test'

import { xpToLevel } from '../../src/app/(main)/skill-tree/lib/xp'

import { resetDatabase } from './_helpers/db'

/**
 * oRPC procedure URL paths. Keeping these in one place so a procedure rename
 * breaks loudly at one site, not four, and the full `/api/orpc/...` shape is
 * consistent across every `waitForResponse` filter. Must match the tree in
 * `src/server/router.ts`.
 */
const ORPC_PATHS = {
  assignTask: '/api/orpc/skillTree/assignTask',
  unassignTask: '/api/orpc/skillTree/unassignTask',
  getMyTree: '/api/orpc/skillTree/getMyTree',
  toggleTodo: '/api/orpc/todo/toggle',
} as const

/**
 * Aria-label fragment for a node that has exactly 1 assigned task. Derived
 * from the same `xpToLevel` helper the component uses, so if the XP formula
 * changes (e.g. dormant ceiling 5 → 10) the selector tracks automatically.
 */
const ONE_XP = xpToLevel(1)
const ONE_XP_LABEL_RE = new RegExp(
  `${ONE_XP.progress} of ${ONE_XP.next} XP`,
  'i',
)

/**
 * Skill Tree V1 E2E tests.
 *
 * Tests within this describe run sequentially (playwright.config has
 * `fullyParallel: false`) and share a single test user, so test 2 (unassign)
 * can safely depend on the assignment state left by test 1 (happy path), and
 * test 3 (keyboard flow) can reuse the unassigned task that test 2 returns
 * to the pool.
 *
 * ## Node selectors
 *
 * Chromium's SVG accessibility tree exposes `<g role="button">` accessible
 * names via the `<title>` child (added in SkillNodeCircle.tsx). We query by
 * `getByRole('button', { name: ONE_XP_LABEL_RE })` — the aria-label uses
 * the template `${name}, ${LEVEL_LABEL[level]}, ${progress} of ${next} XP`.
 *
 * Note: the parent SVG still gets an implicit `img` role from Chromium
 * (SVG-AAM: any named SVG is exposed as img), but because we dropped the
 * explicit `role="img"` attribute, Chromium now exposes the inner
 * `<g role="button">` elements as accessible descendants — visible in
 * Playwright snapshots as buttons nested inside the img. If the SVG carried
 * an explicit `role="img"`, Chromium would atomize it into a single leaf.
 *
 * ## Drag mechanism
 *
 * We use real mouse events (`mouse.move` / `mouse.down` / `mouse.up`) with
 * interpolation steps to drag tasks onto nodes. Two alternatives were
 * rejected:
 *
 * 1. Keyboard drag (Space + arrow keys + Space): dnd-kit's `KeyboardSensor`
 *    clamps the virtual pointer to the nearest scrollable ancestor of the
 *    active draggable. Our pool card lives inside a Radix Dialog whose
 *    overflow context clamps drag coordinates to the dialog bounds — the
 *    virtual pointer can never reach the canvas.
 *
 * 2. `locator.dragTo()`: only emits two `pointermove` events (start → end),
 *    which dnd-kit's `PointerSensor` can miss due to the 6px activation
 *    constraint. Manual `mouse.move(..., { steps: N })` interpolation is more
 *    reliable.
 */
test.describe('Skill Tree E2E', () => {
  // Tests in this describe MUST run in order: test 2 (unassign) depends on
  // the DB state left by test 1 (happy path). `fullyParallel: false` in
  // playwright.config enforces within-file serialization today, but this
  // configure() call documents the dependency at the describe level so it
  // survives any future config flip or targeted `--grep unassign` runs.
  test.describe.configure({ mode: 'serial' })

  // Reset the database once before this spec runs so the three serial tests
  // start from a deterministic baseline: the seeded fixture TODOs from
  // `prisma/seed.ts` exist in the pending list, but the skill tree's
  // "unassigned pool" (which shows only `completed: true` todos) is empty.
  // Without this reset, leftover completed todos from earlier specs would
  // appear in the pool and confuse the drag-target selectors below.
  test.beforeAll(resetDatabase)

  test.beforeEach(async ({ page }) => {
    await setupClerkTestingToken({ page })
  })

  test('happy path: drag a task to a node and verify persistence', async ({
    page,
  }) => {
    // Fixed string — `test.beforeAll(resetDatabase)` guarantees a fresh DB
    // each spec run, so we no longer need Date.now/Math.random for isolation.
    // Stable text also keeps Argos screenshots deterministic (see Issue #31).
    const todoText = 'Skill tree happy path todo'

    // 1. Seed a completed todo via the home page.
    await seedCompletedTodo(page, todoText)

    // 2. Navigate to the skill tree via the sidebar.
    await page.getByRole('link', { name: /skill tree/i }).click()
    await expect(page).toHaveURL(/\/skill-tree/)

    // 3. Open the task pool drawer. `pill.toBeVisible` polls the DOM and is
    //    a stronger gate than `networkidle`, which can return "quiet" while
    //    React Query's persister is still settling.
    const pill = page.getByRole('button', { name: /unassigned task/i })
    await expect(pill).toBeVisible({ timeout: 10000 })
    await pill.click()

    // 4. Verify our task is in the pool. TaskPoolCard's aria-label contains
    //    the todo text, so a regex match against the text is sufficient.
    const poolCard = page.getByRole('button', {
      name: new RegExp(todoText, 'i'),
    })
    await expect(poolCard).toBeVisible()

    // 5. Drag it to the first dormant skill node. We arm a waitForResponse
    //    BEFORE the drag so we capture the assign mutation's round-trip even
    //    if it fires late (the mutation is dispatched from inside
    //    startTransition(async), which React can defer to a later microtask).
    const assignResponsePromise = page.waitForResponse(
      (resp) =>
        resp.url().includes(ORPC_PATHS.assignTask) &&
        resp.request().method() === 'POST',
      { timeout: 10000 },
    )

    // CSS attribute selector (not getByRole) because while the drawer is
    // open, Radix Dialog wraps sibling subtrees in `aria-hidden="true"`,
    // which hides canvas nodes from the a11y tree.
    const firstDormantNode = page
      .locator('[data-testid="skill-node"][data-level="0"]')
      .first()
    await expect(firstDormantNode).toBeVisible()
    await mouseDrag(page, poolCard, firstDormantNode)

    // 6. Verify the drop succeeded. A single task = 1 XP (XP is the count of
    //    assignments), so the node stays at level 0 BUT its aria-label now
    //    reports the 1-XP progress fragment. Same aria-hidden concern as
    //    the selector above — use data-testid + aria-label CSS filter.
    await expect(
      page
        .locator(
          `[data-testid="skill-node"][aria-label*="${ONE_XP.progress} of ${ONE_XP.next}"]`,
        )
        .first(),
    ).toBeVisible({ timeout: 5000 })

    // And the pool should now be empty (pill trigger hidden because
    // TaskPoolDrawer only renders the pill when `count > 0`).
    await expect(
      page.getByRole('button', { name: /unassigned task/i }),
    ).toBeHidden({ timeout: 5000 })

    // 7. Block until the actual assign mutation HTTP round-trip completes and
    //    returns 200. Without this wait, `page.reload()` can fire while the
    //    POST is still queued — the mutation then races the reload's data
    //    fetch, and the reloaded tree renders BEFORE the assignment lands.
    const assignResponse = await assignResponsePromise
    expect(assignResponse.status()).toBe(200)

    // 8. Reload and verify the assignment persisted to the DATABASE.
    //
    //    Subtlety: the app uses `PersistQueryClientProvider` with
    //    `createSyncStoragePersister` + `staleTime: 60s` (see
    //    `src/providers/QueryClientProvider.tsx`). On reload, React Query
    //    rehydrates from localStorage and considers the cached tree fresh,
    //    so it won't re-fetch from the server. Drop only the persister's
    //    own key — not all of localStorage — so Clerk session + misc app
    //    state survive the reset.
    await page.evaluate(() =>
      window.localStorage.removeItem('REACT_QUERY_OFFLINE_CACHE'),
    )
    // Arm the response listener BEFORE triggering the reload. If we await
    // `page.reload()` first and then set up `waitForResponse`, the fresh
    // getMyTree POST can land between those two statements and we miss it,
    // causing the later `toBeVisible` assertion to race the refetch and
    // flake. Playwright's guidance for reload+response is to create the
    // waiter first, then run the trigger, then await both.
    const reloadTreeFetchPromise = page.waitForResponse(
      (resp) =>
        resp.url().includes(ORPC_PATHS.getMyTree) &&
        resp.request().method() === 'POST' &&
        resp.status() === 200,
      { timeout: 10000 },
    )
    await page.reload()
    await reloadTreeFetchPromise
    // After reload, the drawer is closed, so the canvas isn't aria-hidden
    // and we can use getByRole against the real a11y tree (which is what
    // users' screen readers see).
    await expect(
      page.getByRole('button', { name: ONE_XP_LABEL_RE }).first(),
    ).toBeVisible({ timeout: 10000 })
  })

  test('unassign: click a node with assignments and unassign a task', async ({
    page,
  }) => {
    // Preconditions: the previous test left a task assigned to a node.
    await page.goto('/skill-tree')

    // Click the node that got the assignment (its aria-label now reports
    // the 1-XP progress fragment).
    const assignedNode = page
      .getByRole('button', { name: ONE_XP_LABEL_RE })
      .first()
    await expect(assignedNode).toBeVisible({ timeout: 10000 })
    await assignedNode.click()

    // Popover unassign button: NodePopover uses aria-label=`Unassign <text>`
    // for the unassign trigger. A generic /unassign/i match finds it.
    const unassignBtn = page.getByRole('button', { name: /unassign/i }).first()
    await expect(unassignBtn).toBeVisible()

    // Arm the unassignTask POST waiter BEFORE clicking. SkillTreeView wraps
    // the mutation in `startTransition(async)`, which means the POST fires
    // asynchronously and the test could finish while the POST is still in
    // flight. If the next test's `page.goto` runs first, the document
    // unloads and the POST is aborted — the assignment survives in the DB
    // and the keyboard flow test lands in an inconsistent state.
    const unassignResponsePromise = page.waitForResponse(
      (resp) =>
        resp.url().includes(ORPC_PATHS.unassignTask) &&
        resp.request().method() === 'POST',
      { timeout: 10000 },
    )

    await unassignBtn.click()

    // After unassignment:
    // - the node reverts to Dormant (0 XP)
    // - the pool drawer pill reappears (1 unassigned task)
    await expect(
      page.getByRole('button', { name: /unassigned task/i }),
    ).toBeVisible({ timeout: 5000 })
    await expect(
      page.getByRole('button', { name: ONE_XP_LABEL_RE }),
    ).toHaveCount(0, { timeout: 5000 })

    // Block until the unassign POST round-trips. This guarantees the DB is
    // in the expected state (assignment removed) before the test ends, so
    // the subsequent keyboard flow test sees a deterministic starting point.
    const unassignResponse = await unassignResponsePromise
    expect(unassignResponse.status()).toBe(200)
  })

  test('keyboard flow: open drawer and verify keyboard entry point', async ({
    page,
  }) => {
    // This test verifies that the drawer pill is reachable and activatable via
    // keyboard (focus + Enter). Full keyboard DnD from drawer to canvas isn't
    // tested here because dnd-kit's KeyboardSensor clamps the virtual pointer
    // to the draggable's nearest scrollable ancestor — our pool card lives
    // inside a Radix Dialog whose overflow context prevents the drag from
    // reaching the canvas. End-to-end keyboard DnD is covered by manual a11y
    // QA in Task 24.
    //
    // Reuses the task that test 2 returned to the pool (serial describe
    // mode guarantees ordering). No seeding needed — saves one full /home
    // navigation + create + toggle round-trip.
    await page.goto('/skill-tree')

    // Open drawer via keyboard (Enter on focused pill).
    const pill = page.getByRole('button', { name: /unassigned task/i })
    await expect(pill).toBeVisible({ timeout: 10000 })
    await pill.focus()
    await page.keyboard.press('Enter')

    // Drawer opened → any pool card (TaskPoolCard's aria-label always starts
    // with "Completed task:", so this matches without coupling to a specific
    // todo text from the previous test).
    const poolCard = page
      .getByRole('button', { name: /^completed task:/i })
      .first()
    await expect(poolCard).toBeVisible()

    // Pool card is focusable and has the dnd-kit screen reader instruction.
    await poolCard.focus()
    await expect(poolCard).toBeFocused()

    // Close the drawer so subsequent tests start from a clean state.
    await page.keyboard.press('Escape')
  })
})

/**
 * Seeds a completed todo via the home page UI. Navigates to /home, types the
 * todo text into the input, clicks Add, waits for the optimistic ID to settle
 * to a positive server ID (so subsequent dnd-kit drag IDs like `todo-<id>`
 * resolve to a real row), then marks the todo complete.
 *
 * @param page - The Playwright Page instance.
 * @param todoText - The text to enter into the new-todo input. Pass a fixed
 *   string (not a Date.now/Math.random suffix) — `test.beforeAll(resetDatabase)`
 *   guarantees per-spec DB isolation, and stable text keeps Argos screenshots
 *   deterministic (see Issue #31).
 * @example
 * await seedCompletedTodo(page, 'Skill tree happy path todo')
 */
async function seedCompletedTodo(page: Page, todoText: string): Promise<void> {
  await page.goto('/home')

  // No `waitForLoadState('networkidle')` here — `fill()` runs Playwright's
  // actionability checks on the input, which is a stronger gate than waiting
  // for network quiet (the React Query persister keeps the network chatty).
  await page.getByPlaceholder('Enter a new todo...').fill(todoText)
  await page.getByRole('button', { name: 'Add', exact: true }).click()

  const todoCheckbox = page.getByRole('checkbox', { name: todoText })
  await expect(todoCheckbox).toBeVisible()
  // Wait for the create mutation to settle with a positive server ID
  // (optimistic negative IDs would yield "todo--<ts>" — double dash).
  await expect(todoCheckbox).toHaveAttribute('id', /^todo-[^-]/, {
    timeout: 5000,
  })

  // Arm the toggle POST waiter BEFORE clicking so we reliably catch the
  // request/response pair. The `line-through` assertion below only verifies
  // the OPTIMISTIC UI state, not that the HTTP POST actually landed in the
  // database. Without an explicit HTTP wait, the caller's next navigation
  // (e.g. `page.goto('/skill-tree')`) can unload the document and abort
  // the in-flight toggle POST — the todo then stays pending in the DB and
  // never reaches the skill tree's unassigned pool.
  const togglePromise = page.waitForResponse(
    (resp) =>
      resp.url().includes(ORPC_PATHS.toggleTodo) &&
      resp.request().method() === 'POST',
    { timeout: 10000 },
  )

  await todoCheckbox.click()
  await expect(page.getByText(todoText)).toHaveClass(/line-through/, {
    timeout: 5000,
  })

  // Block until the toggle POST completes with 200. Now the DB state is
  // guaranteed: this todo is `completed: true` and will appear in
  // getUnassignedPool on the next skill-tree fetch.
  const toggleResponse = await togglePromise
  expect(toggleResponse.status()).toBe(200)
}

/**
 * Performs a mouse drag from `source` to `target` with enough interpolation
 * steps to satisfy dnd-kit's `PointerSensor` activation constraint
 * (`distance: 6`). Uses a three-phase motion: settle at source → small nudge
 * to activate → smooth travel to target → release.
 *
 * Critical: calls `source.hover()` FIRST so Playwright's actionability check
 * waits for slide-in animations to finish. Without this, `boundingBox()` can
 * return stale mid-animation coordinates that land outside the viewport.
 *
 * @param page - The Playwright Page instance.
 * @param source - Draggable locator to pick up.
 * @param target - Droppable locator to drop onto.
 * @returns
 * - Resolves once `mouse.up()` has fired. The caller is responsible for
 *   asserting the post-drop state via `expect(...).toBeVisible(...)` or a
 *   `waitForResponse` — this helper does not block on React's drop handler.
 * @example
 * await mouseDrag(page, poolCard, firstDormantNode)
 * await expect(firstDormantNode).toHaveAttribute('aria-label', /1 of 5/)
 */
async function mouseDrag(
  page: Page,
  source: Locator,
  target: Locator,
): Promise<void> {
  // Hover source first — runs Playwright's actionability checks (visible +
  // stable + receives events), blocking until any slide-in/slide-out
  // animations settle.
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
  // Nudge >6px to trigger dnd-kit's PointerSensor activationConstraint.
  await page.mouse.move(startX + 10, startY + 10, { steps: 3 })
  // Smooth travel to the drop target — many steps ensure dnd-kit's
  // collision detection sees the pointer cross the droppable's rect.
  await page.mouse.move(endX, endY, { steps: 20 })
  await page.mouse.up()
  // No arbitrary sleep here — callers are expected to follow up with an
  // explicit `expect(...).toBeVisible({ timeout })` assertion that polls
  // for the optimistic drop state, which gives React all the time it needs
  // to flush the drop handler without baking a flaky wall-clock wait into
  // the helper.
}
