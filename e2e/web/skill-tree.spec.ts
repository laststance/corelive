import { setupClerkTestingToken } from '@clerk/testing/playwright'
import { expect, test, type Locator, type Page } from '@playwright/test'

/**
 * Skill Tree V1 E2E tests.
 *
 * Tests within this describe run sequentially (playwright.config has
 * `fullyParallel: false`) and share a single test user, so test 2 (unassign)
 * can safely depend on the assignment state left by test 1 (happy path).
 *
 * ## Node selectors
 *
 * Chromium's SVG accessibility tree exposes `<g role="button">` accessible
 * names via the `<title>` child (added in SkillNodeCircle.tsx). We query by
 * `getByRole('button', { name: /<xp fragment>/i })` — the aria-label uses
 * the template `${name}, ${LEVEL_LABEL[level]}, ${progress} of ${next} XP`,
 * so a node with 1 XP matches `/1 of 5 xp/i`.
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
  test.beforeEach(async ({ page }) => {
    await setupClerkTestingToken({ page })
  })

  test('happy path: drag a task to a node and verify persistence', async ({
    page,
  }) => {
    const todoText = `E2E-ST-Happy-${Date.now()}-${Math.random().toString(36).substring(7)}`

    // 1. Seed a completed todo via the home page.
    await seedCompletedTodo(page, todoText)

    // 2. Navigate to the skill tree via the sidebar.
    await page.getByRole('link', { name: /skill tree/i }).click()
    await expect(page).toHaveURL(/\/skill-tree/)
    await page.waitForLoadState('networkidle')

    // 3. Open the task pool drawer.
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
    //    `networkidle` is unreliable here — it can return "quiet" before the
    //    deferred POST has even begun.
    const assignResponsePromise = page.waitForResponse(
      (resp) =>
        resp.url().includes('assignTask') && resp.request().method() === 'POST',
      { timeout: 10000 },
    )

    const firstDormantNode = page
      .locator('[data-testid="skill-node"][data-level="0"]')
      .first()
    await expect(firstDormantNode).toBeVisible()
    await mouseDrag(page, poolCard, firstDormantNode)

    // 6. Verify the drop succeeded. A single task = 1 XP (XP is the count of
    //    assignments), so the node stays at level 0 BUT its aria-label now
    //    reports "1 of 5 XP" instead of "0 of 5 XP". One such node existing
    //    proves a drop landed somewhere.
    //
    //    We use a CSS attribute selector here instead of `getByRole`: while
    //    the drawer is still open, Radix Dialog applies `aria-hidden="true"`
    //    to sibling subtrees, so canvas nodes fall out of the a11y tree.
    //    CSS selectors bypass that.
    await expect(
      page.locator('[data-testid="skill-node"][aria-label*="1 of 5"]').first(),
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
    //    so it won't re-fetch from the server. The persist writes are also
    //    debounced, so localStorage often still holds the PRE-drop snapshot
    //    even though the in-memory state is up to date.
    //
    //    For this test we want to verify DB persistence, not cache
    //    persistence, so we wipe localStorage before reloading. That forces
    //    a fresh getMyTree fetch on mount.
    await page.evaluate(() => window.localStorage.clear())
    await page.reload()
    // Wait for the fresh fetch that now has to happen because the cache is
    // gone. Once this response arrives, the component will render the
    // authoritative DB state.
    await page.waitForResponse(
      (resp) =>
        resp.url().includes('skillTree/getMyTree') &&
        resp.request().method() === 'POST' &&
        resp.status() === 200,
      { timeout: 10000 },
    )
    // After reload, the drawer is closed, so the canvas isn't aria-hidden
    // and we can use getByRole against the real a11y tree (which is what
    // users' screen readers see).
    await expect(
      page.getByRole('button', { name: /1 of 5 XP/i }).first(),
    ).toBeVisible({ timeout: 10000 })
  })

  test('unassign: click a node with assignments and unassign a task', async ({
    page,
  }) => {
    // Preconditions: the previous test left a task assigned to a node.
    await page.goto('/skill-tree')
    await page.waitForLoadState('networkidle')

    // Click the node that got the assignment (its aria-label now reads
    // "1 of 5 XP" instead of "0 of 5 XP").
    const assignedNode = page
      .getByRole('button', { name: /1 of 5 XP/i })
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
        resp.url().includes('/api/orpc/skillTree/unassignTask') &&
        resp.request().method() === 'POST',
      { timeout: 10000 },
    )

    await unassignBtn.click()

    // After unassignment:
    // - the node reverts to "0 of 5 XP" (dormant)
    // - the pool drawer pill reappears (1 unassigned task)
    await expect(
      page.getByRole('button', { name: /unassigned task/i }),
    ).toBeVisible({ timeout: 5000 })
    await expect(page.getByRole('button', { name: /1 of 5 XP/i })).toHaveCount(
      0,
      { timeout: 5000 },
    )

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
    const todoText = `E2E-ST-KB-${Date.now()}-${Math.random().toString(36).substring(7)}`

    await seedCompletedTodo(page, todoText)

    await page.goto('/skill-tree')
    await page.waitForLoadState('networkidle')

    // Open drawer via keyboard (Enter on focused pill).
    const pill = page.getByRole('button', { name: /unassigned task/i })
    await expect(pill).toBeVisible({ timeout: 10000 })
    await pill.focus()
    await page.keyboard.press('Enter')

    // Drawer opened → pool card with our todo text is visible.
    const poolCard = page.getByRole('button', {
      name: new RegExp(todoText, 'i'),
    })
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
 * @param todoText - The text to enter into the new-todo input.
 * @example
 * await seedCompletedTodo(page, `E2E-${Date.now()}`)
 */
async function seedCompletedTodo(page: Page, todoText: string): Promise<void> {
  await page.goto('/home')
  await page.waitForLoadState('networkidle')

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
      resp.url().includes('/api/orpc/todo/toggle') &&
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
 * - Resolves once `mouse.up()` has fired and React has had a chance to flush
 *   the drop handler.
 * @example
 * await mouseDrag(page, poolCard, firstDormantNode)
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

  const sourceBox = await source.boundingBox()
  const targetBox = await target.boundingBox()
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
  // Give React a tick to flush the drop handler.
  await page.waitForTimeout(100)
}
