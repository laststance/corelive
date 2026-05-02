import { setupClerkTestingToken } from '@clerk/testing/playwright'
import { test, expect, type Page, type Locator } from '@playwright/test'

import { resetDatabase } from './_helpers/db'

/**
 * Waits for the Todo List heading to appear, handling the Loading... state.
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
 * Returns a locator for the app sidebar (shadcn Sidebar).
 * @param page - Playwright page object
 * @returns Locator scoped to the sidebar element with data-slot="sidebar"
 */
function getSidebar(page: Page) {
  return page.locator('[data-slot="sidebar"]')
}

/**
 * Selects a category in the sidebar by clicking it and waiting until the
 * sidebar UI confirms it became the active category.
 *
 * The previous implementation only verified that
 * `localStorage.corelive-selected-category` held a positive integer — but
 * General's real ID (1) is already positive, so a silently-failed click on a
 * just-created optimistic category would leave General active and the helper
 * would still resolve. This hid a race condition: with the seeded fixture
 * todos in `prisma/seed.ts`, the heavier initial render delays click-handler
 * attachment on freshly-rendered category buttons, and the click landed
 * before the handler was bound.
 *
 * Asserting on `data-active="true"` of the clicked button is the
 * source-of-truth UI signal and surfaces the failure immediately instead of
 * letting downstream assertions chase a phantom selection.
 *
 * @param page - Playwright page object
 * @param sidebar - Sidebar locator
 * @param categoryName - Name of the category to click
 * @example
 * await selectCategory(page, getSidebar(page), 'General')
 */
async function selectCategory(
  page: Page,
  sidebar: Locator,
  categoryName: string,
) {
  const categoryButton = sidebar
    .locator('[data-slot="sidebar-menu-button"]')
    .filter({ hasText: categoryName })

  // First click — may land before the handler is attached on a freshly
  // rendered button (race exposed by heavier seed fixtures).
  await categoryButton.click()

  // Verify the click actually flipped the active state. If not, retry once
  // after letting React Query settle and the optimistic category swap to a
  // real server ID; this covers the post-createCategory window where the
  // button briefly carries a negative temp ID.
  try {
    await expect(categoryButton).toHaveAttribute('data-active', 'true', {
      timeout: 3000,
    })
  } catch {
    await page.waitForLoadState('networkidle')
    await page.waitForTimeout(500)
    await categoryButton.click()
    await expect(categoryButton).toHaveAttribute('data-active', 'true', {
      timeout: 5000,
    })
  }

  // Belt-and-suspenders: also confirm localStorage holds a positive (real)
  // server ID so subsequent todo-create mutations attach the right
  // categoryId. A negative value here means the optimistic-→-real swap
  // hasn't completed and a created todo would persist with the temp
  // category linkage.
  await page.waitForFunction(
    () => {
      const val = localStorage.getItem('corelive-selected-category')
      if (val === null) return false
      const num = Number(val)
      return Number.isInteger(num) && num > 0
    },
    { timeout: 10000 },
  )
}

/**
 * Creates a category via the sidebar popover and waits for server confirmation.
 * @param page - Playwright page object
 * @param sidebar - Sidebar locator
 * @param categoryName - Name of the category to create
 * @param color - Optional color to select (e.g., 'green')
 */
async function createCategory(
  page: Page,
  sidebar: Locator,
  categoryName: string,
  color?: string,
) {
  await sidebar.getByRole('button', { name: 'Add category' }).click()
  const nameInput = page.getByPlaceholder('Category name')
  await expect(nameInput).toBeVisible({ timeout: 5000 })

  if (color) {
    const colorButton = page.getByRole('button', {
      name: `Select ${color} color`,
    })
    await expect(colorButton).toBeVisible()
    await colorButton.click()
  }

  await nameInput.fill(categoryName)
  await page.getByRole('button', { name: 'Create', exact: true }).click()

  // Wait for popover to close
  await expect(nameInput).not.toBeVisible({ timeout: 5000 })

  // Wait for server response to complete (category appears in sidebar with real ID)
  await expect(sidebar.getByText(categoryName)).toBeVisible({
    timeout: 15000,
  })

  // Wait for query invalidation + refetch to complete (ensures real server IDs replace optimistic ones)
  await page.waitForLoadState('networkidle')
}

/**
 * Opens the Manage Categories dialog and ensures it shows real server IDs.
 * Waits for networkidle first, then also waits for any in-flight category list
 * API response to complete (handles race where the dialog triggers a refetch).
 * @param page - Playwright page object
 * @param sidebar - Sidebar locator
 */
async function openManageDialog(page: Page, sidebar: Locator) {
  // Set up the response listener BEFORE clicking to capture any refetch triggered by the dialog
  const listResponsePromise = page
    .waitForResponse(
      (resp) =>
        resp.url().includes('orpc') &&
        resp.url().includes('category') &&
        resp.url().includes('list'),
      { timeout: 5000 },
    )
    .catch(() => null) // OK if no request is made (data already cached)
  await sidebar.getByRole('button', { name: 'Manage' }).click()
  await expect(page.getByText('Manage Categories')).toBeVisible({
    timeout: 5000,
  })
  await listResponsePromise
  // Extra wait for any pending cache updates
  await page.waitForLoadState('networkidle')
}

test.describe('Category Feature E2E Tests', () => {
  test.beforeAll(resetDatabase)

  test.beforeEach(async ({ page }) => {
    await setupClerkTestingToken({ page })
    await page.goto('/home')
    await page.waitForLoadState('networkidle')
    await waitForAppReady(page)
  })

  test.describe('Category Sidebar', () => {
    test('should display category sidebar with General selected by default', async ({
      page,
    }) => {
      // Arrange — sidebar locator (page setup handled by beforeEach)
      const sidebar = getSidebar(page)

      // Assert — sidebar renders Categories group, General is active by default,
      // and the Add category trigger is visible
      await expect(sidebar).toBeVisible()
      await expect(sidebar.getByText('Categories')).toBeVisible()
      await expect(sidebar.getByText('General')).toBeVisible()
      const generalButton = sidebar
        .locator('[data-slot="sidebar-menu-button"]')
        .filter({ hasText: 'General' })
      await expect(generalButton).toHaveAttribute('data-active', 'true')
      await expect(
        sidebar.getByRole('button', { name: 'Add category' }),
      ).toBeVisible()
    })

    test('should create a new category from sidebar', async ({ page }) => {
      // Arrange
      const categoryName = 'CatCreate'
      const sidebar = getSidebar(page)

      // Act + Assert — `createCategory` opens the popover, submits, and
      // asserts the new category appears in the sidebar with a real server ID.
      await createCategory(page, sidebar, categoryName)
    })

    test('should filter todos by category selection', async ({ page }) => {
      // Arrange
      const categoryName = 'CatFilter'
      const todoInGeneral = 'TodoGen'
      const todoInCategory = 'TodoCat'
      const sidebar = getSidebar(page)

      // Act 1 — General is auto-selected on load; add a todo to General
      await selectCategory(page, sidebar, 'General')
      await page.getByPlaceholder('Enter a new todo...').fill(todoInGeneral)
      await page.getByRole('button', { name: 'Add', exact: true }).click()
      await expect(
        page.getByRole('checkbox', { name: todoInGeneral }),
      ).toBeVisible({ timeout: 5000 })

      // Act 2 — create a new category and add a todo to it
      await createCategory(page, sidebar, categoryName)
      await selectCategory(page, sidebar, categoryName)
      await page.getByPlaceholder('Enter a new todo...').fill(todoInCategory)
      await page.getByRole('button', { name: 'Add', exact: true }).click()
      await expect(
        page.getByRole('checkbox', { name: todoInCategory }),
      ).toBeVisible({ timeout: 5000 })

      // Act 3 — filter by General
      await selectCategory(page, sidebar, 'General')
      await page.waitForTimeout(1000)

      // Assert 3 — only General's todo is visible
      await expect(
        page.getByRole('checkbox', { name: todoInGeneral }),
      ).toBeVisible({ timeout: 5000 })
      await expect(
        page.getByRole('checkbox', { name: todoInCategory }),
      ).not.toBeVisible({ timeout: 5000 })

      // Act 4 — filter by the new category
      await selectCategory(page, sidebar, categoryName)
      await page.waitForTimeout(1000)

      // Assert 4 — only the new category's todo is visible
      await expect(
        page.getByRole('checkbox', { name: todoInCategory }),
      ).toBeVisible({ timeout: 5000 })
      await expect(
        page.getByRole('checkbox', { name: todoInGeneral }),
      ).not.toBeVisible({ timeout: 5000 })
    })

    test('should show category name on todo items', async ({ page }) => {
      // Arrange — create and select a category
      const categoryName = 'CatBadge'
      const todoText = 'TodoBadge'
      const sidebar = getSidebar(page)
      await createCategory(page, sidebar, categoryName)
      await selectCategory(page, sidebar, categoryName)

      // Act — add a todo under the selected category
      await page.getByPlaceholder('Enter a new todo...').fill(todoText)
      await page.getByRole('button', { name: 'Add', exact: true }).click()
      await expect(page.getByRole('checkbox', { name: todoText })).toBeVisible({
        timeout: 5000,
      })
      await expect(
        page.getByRole('checkbox', { name: todoText }),
      ).toHaveAttribute('id', /^todo-[^-]/, { timeout: 10000 })

      // Assert — TodoItem renders the category name badge near the date
      const todoItem = page.locator('.rounded-lg.border').filter({
        has: page.getByRole('checkbox', { name: todoText }),
      })
      await expect(todoItem.getByText(categoryName)).toBeVisible({
        timeout: 5000,
      })
    })

    test('should select a color when creating a category', async ({ page }) => {
      // Arrange
      const categoryName = 'CatColor'
      const sidebar = getSidebar(page)

      // Act — create the category with a green color
      await createCategory(page, sidebar, categoryName, 'green')

      // Assert — the category row shows a green color dot (bg-green-500)
      const categoryItem = sidebar
        .locator('[data-slot="sidebar-menu-item"]')
        .filter({ hasText: categoryName })
      const colorDot = categoryItem.locator('.rounded-full')
      await expect(colorDot).toHaveClass(/bg-green-500/)
    })

    test('should hide empty state CTA when categories exist', async ({
      page,
    }) => {
      // Arrange — create a category to ensure at least one exists
      const categoryName = 'CatCTA'
      const sidebar = getSidebar(page)
      await createCategory(page, sidebar, categoryName)

      // Assert — empty-state CTA is hidden, Manage button is shown instead
      await expect(
        sidebar.getByText('Add your first category'),
      ).not.toBeVisible()
      await expect(
        sidebar.getByRole('button', { name: 'Manage' }),
      ).toBeVisible()
    })

    test('should hide badge count when category has zero todos', async ({
      page,
    }) => {
      // Arrange — create a fresh category with no todos
      const categoryName = 'CatZero'
      const sidebar = getSidebar(page)
      await createCategory(page, sidebar, categoryName)

      // Assert — Linear-style: zero-todo categories show no count badge
      const categoryItem = sidebar
        .locator('[data-slot="sidebar-menu-item"]')
        .filter({ hasText: categoryName })
      await expect(categoryItem).toBeVisible()
      await expect(
        categoryItem.locator('[data-slot="sidebar-menu-badge"]'),
      ).not.toBeVisible()
    })

    test('should highlight active category selection', async ({ page }) => {
      // Arrange — create a second category alongside General
      const categoryName = 'CatActive'
      const sidebar = getSidebar(page)
      await createCategory(page, sidebar, categoryName)
      const generalButton = sidebar
        .locator('[data-slot="sidebar-menu-button"]')
        .filter({ hasText: 'General' })
      const categoryButton = sidebar
        .locator('[data-slot="sidebar-menu-button"]')
        .filter({ hasText: categoryName })

      // Assert (precondition) — General is active by default
      await expect(generalButton).toHaveAttribute('data-active', 'true')

      // Act 1 — select the new category
      await selectCategory(page, sidebar, categoryName)

      // Assert 1 — new category is active, General is not
      await expect(categoryButton).toHaveAttribute('data-active', 'true')
      await expect(generalButton).not.toHaveAttribute('data-active', 'true')

      // Act 2 — select General again
      await selectCategory(page, sidebar, 'General')

      // Assert 2 — General is active, new category is not
      await expect(generalButton).toHaveAttribute('data-active', 'true')
      await expect(categoryButton).not.toHaveAttribute('data-active', 'true')
    })

    test('should show Manage button when categories exist', async ({
      page,
    }) => {
      // Arrange — at least one category must exist for Manage to appear
      const categoryName = 'CatMgBtn'
      const sidebar = getSidebar(page)
      await createCategory(page, sidebar, categoryName)

      // Assert — Manage button is visible
      await expect(sidebar.getByRole('button', { name: 'Manage' })).toBeVisible(
        { timeout: 5000 },
      )
    })
  })

  test.describe('Category Management Dialog', () => {
    test('should open manage dialog from sidebar', async ({ page }) => {
      // Arrange — Manage button only appears when categories exist
      const sidebar = getSidebar(page)
      const categoryName = 'CatMgr'
      await createCategory(page, sidebar, categoryName)

      // Act — click Manage
      await sidebar.getByRole('button', { name: 'Manage' }).click()

      // Assert — dialog opens with title and description
      await expect(page.getByText('Manage Categories')).toBeVisible({
        timeout: 5000,
      })
      await expect(
        page.getByText('Rename, recolor, or delete categories'),
      ).toBeVisible()
    })

    test('should rename a category in manage dialog', async ({ page }) => {
      // Arrange — create a category and open the manage dialog
      const originalName = 'CatRen'
      const newName = 'CatRen2'
      const sidebar = getSidebar(page)
      await createCategory(page, sidebar, originalName)
      await openManageDialog(page, sidebar)

      // Find the category row (rounded-md p-2 is unique to category rows)
      const categoryRow = page
        .locator('[role="dialog"]')
        .locator('.rounded-md.p-2')
        .filter({ hasText: originalName })
      await expect(categoryRow).toBeVisible({ timeout: 5000 })
      const editButton = categoryRow.locator('button').filter({
        has: page.locator('svg.lucide-pencil'),
      })

      // Act — enter inline edit mode and submit a new name
      await editButton.click()
      const editInput = page.locator('[role="dialog"]').locator('input')
      await expect(editInput).toBeVisible({ timeout: 3000 })
      await expect(editInput).toHaveValue(originalName)
      await editInput.fill(newName)
      await expect(editInput).toHaveValue(newName)
      await editInput.press('Enter')

      // Assert — edit mode exits and the new name appears in the sidebar
      await expect(editInput).not.toBeVisible({ timeout: 10000 })
      await page.keyboard.press('Escape')
      await page.waitForLoadState('networkidle')
      await expect(sidebar.getByText(newName)).toBeVisible({ timeout: 15000 })
    })

    test('should delete a category with confirmation', async ({ page }) => {
      // Arrange — create a category and open the manage dialog
      const categoryName = 'CatDelete'
      const sidebar = getSidebar(page)
      await createCategory(page, sidebar, categoryName)
      await openManageDialog(page, sidebar)
      const categoryRow = page
        .locator('[role="dialog"]')
        .locator('.rounded-md.p-2')
        .filter({ hasText: categoryName })
      await expect(categoryRow).toBeVisible({ timeout: 5000 })
      const deleteButton = categoryRow.locator('button').filter({
        has: page.locator('svg.lucide-trash-2'),
      })

      // Act — click delete and confirm in the alert dialog
      await deleteButton.click()
      await expect(page.getByText('Delete category?')).toBeVisible({
        timeout: 5000,
      })
      await expect(
        page.getByRole('alertdialog').getByText(categoryName),
      ).toBeVisible()
      await page.getByRole('button', { name: 'Delete', exact: true }).click()

      // Assert — row removed from manage dialog AND from sidebar
      await page.waitForLoadState('networkidle')
      await expect(categoryRow).not.toBeVisible({ timeout: 10000 })
      await page.keyboard.press('Escape')
      await page.waitForTimeout(500)
      await expect(sidebar.getByText(categoryName)).not.toBeVisible({
        timeout: 5000,
      })
    })
  })

  test.describe('Default General Category', () => {
    test('should always display General category in sidebar', async ({
      page,
    }) => {
      // Arrange
      const sidebar = getSidebar(page)

      // Assert — General is always present (seeded as isDefault), shows blue
      // color, and Manage is visible (General counts as an existing category)
      await expect(sidebar.getByText('General')).toBeVisible({ timeout: 5000 })
      const generalItem = sidebar
        .locator('[data-slot="sidebar-menu-item"]')
        .filter({ hasText: 'General' })
      const colorDot = generalItem.locator('.rounded-full')
      await expect(colorDot).toHaveClass(/bg-blue-500/)
      await expect(
        sidebar.getByRole('button', { name: 'Manage' }),
      ).toBeVisible()
    })

    test('should not allow deleting the default General category', async ({
      page,
    }) => {
      // Arrange — open manage dialog and locate the General row
      const sidebar = getSidebar(page)
      await openManageDialog(page, sidebar)
      const generalRow = page
        .locator('[role="dialog"]')
        .locator('.rounded-md.p-2')
        .filter({ hasText: 'General' })
      await expect(generalRow).toBeVisible({ timeout: 5000 })

      // Assert — edit button is present (renaming allowed) but delete is NOT
      // (isDefault categories are protected from deletion)
      const editButton = generalRow.locator('button').filter({
        has: page.locator('svg.lucide-pencil'),
      })
      await expect(editButton).toBeVisible()
      const deleteButton = generalRow.locator('button').filter({
        has: page.locator('svg.lucide-trash-2'),
      })
      await expect(deleteButton).not.toBeVisible()
    })

    test('should allow renaming the default General category', async ({
      page,
    }) => {
      // Arrange — open manage dialog and locate the General row
      const sidebar = getSidebar(page)
      const newName = 'GenRen'
      await openManageDialog(page, sidebar)
      const generalRow = page
        .locator('[role="dialog"]')
        .locator('.rounded-md.p-2')
        .filter({ hasText: 'General' })
      await expect(generalRow).toBeVisible({ timeout: 5000 })
      const editButton = generalRow.locator('button').filter({
        has: page.locator('svg.lucide-pencil'),
      })

      // Act — rename General → newName
      await editButton.click()
      const editInput = page.locator('[role="dialog"]').locator('input')
      await expect(editInput).toBeVisible({ timeout: 3000 })
      await editInput.fill(newName)
      await editInput.press('Enter')
      await expect(editInput).not.toBeVisible({ timeout: 10000 })
      await page.keyboard.press('Escape')
      await page.waitForLoadState('networkidle')

      // Assert — new name appears in sidebar
      await expect(sidebar.getByText(newName)).toBeVisible({ timeout: 15000 })

      // Cleanup — rename back to "General" so the spec remains idempotent
      // even if test isolation is loosened in the future.
      await openManageDialog(page, sidebar)
      const renamedRow = page
        .locator('[role="dialog"]')
        .locator('.rounded-md.p-2')
        .filter({ hasText: newName })
      await expect(renamedRow).toBeVisible({ timeout: 5000 })
      const editButton2 = renamedRow.locator('button').filter({
        has: page.locator('svg.lucide-pencil'),
      })
      await editButton2.click()
      const editInput2 = page.locator('[role="dialog"]').locator('input')
      await expect(editInput2).toBeVisible({ timeout: 3000 })
      await editInput2.fill('General')
      await editInput2.press('Enter')
      await expect(editInput2).not.toBeVisible({ timeout: 10000 })
      await page.keyboard.press('Escape')
      await page.waitForLoadState('networkidle')
      await expect(sidebar.getByText('General')).toBeVisible({ timeout: 15000 })
    })

    test('should auto-assign new todo to General by default', async ({
      page,
    }) => {
      // Arrange — different label from the "filter todos" test's 'TodoGen'
      // fixture so the two coexist without colliding under shared spec state.
      const todoText = 'TodoGenAuto'
      const sidebar = getSidebar(page)

      // Act — General is auto-selected on page load; add a todo directly
      await page.getByPlaceholder('Enter a new todo...').fill(todoText)
      await page.getByRole('button', { name: 'Add', exact: true }).click()
      const todoCheckbox = page.getByRole('checkbox', { name: todoText })
      await expect(todoCheckbox).toBeVisible({ timeout: 5000 })
      await expect(todoCheckbox).toHaveAttribute('id', /^todo-[^-]/, {
        timeout: 10000,
      })

      // Assert — todo carries the General badge and the sidebar shows a count
      const todoItem = page.locator('.rounded-lg.border').filter({
        has: page.getByRole('checkbox', { name: todoText }),
      })
      await expect(todoItem.getByText('General')).toBeVisible({
        timeout: 5000,
      })
      const generalItem = sidebar
        .locator('[data-slot="sidebar-menu-item"]')
        .filter({ hasText: 'General' })
      await expect(
        generalItem.locator('[data-slot="sidebar-menu-badge"]'),
      ).toBeVisible({ timeout: 10000 })
    })

    test('should reassign todos to General when their category is deleted', async ({
      page,
    }) => {
      // Arrange — create a category, select it, and add a todo under it
      const categoryName = 'CatDel'
      const todoText = 'TodoDel'
      const sidebar = getSidebar(page)
      await createCategory(page, sidebar, categoryName)
      await selectCategory(page, sidebar, categoryName)
      await page.getByPlaceholder('Enter a new todo...').fill(todoText)
      await page.getByRole('button', { name: 'Add', exact: true }).click()
      await expect(page.getByRole('checkbox', { name: todoText })).toBeVisible({
        timeout: 5000,
      })

      // Act — switch to General, then delete the source category
      await selectCategory(page, sidebar, 'General')
      await page.waitForTimeout(500)
      await openManageDialog(page, sidebar)
      const categoryRow = page
        .locator('[role="dialog"]')
        .locator('.rounded-md.p-2')
        .filter({ hasText: categoryName })
      await expect(categoryRow).toBeVisible({ timeout: 5000 })
      const deleteButton = categoryRow.locator('button').filter({
        has: page.locator('svg.lucide-trash-2'),
      })
      await deleteButton.click()
      await expect(page.getByText('Delete category?')).toBeVisible({
        timeout: 5000,
      })
      await page.getByRole('button', { name: 'Delete', exact: true }).click()
      await expect(page.getByText('Delete category?')).not.toBeVisible({
        timeout: 5000,
      })
      await page.waitForLoadState('networkidle')
      await page.keyboard.press('Escape')
      await expect(page.getByText('Manage Categories')).not.toBeVisible({
        timeout: 5000,
      })

      // Assert — todo is reassigned to General and shows the General badge
      await selectCategory(page, sidebar, 'General')
      await page.waitForTimeout(1000)
      await expect(page.getByRole('checkbox', { name: todoText })).toBeVisible({
        timeout: 10000,
      })
      const todoItem = page.locator('.rounded-lg.border').filter({
        has: page.getByRole('checkbox', { name: todoText }),
      })
      await expect(todoItem.getByText('General')).toBeVisible({
        timeout: 5000,
      })
    })
  })

  test.describe('Category + Todo Integration', () => {
    test('should auto-assign category when adding todo with category selected', async ({
      page,
    }) => {
      // Arrange — create and select a category
      const categoryName = 'CatAuto'
      const todoText = 'TodoAuto'
      const sidebar = getSidebar(page)
      await createCategory(page, sidebar, categoryName)
      await selectCategory(page, sidebar, categoryName)

      // Act — add a todo
      await page.getByPlaceholder('Enter a new todo...').fill(todoText)
      await page.getByRole('button', { name: 'Add', exact: true }).click()
      const todoCheckbox = page.getByRole('checkbox', { name: todoText })
      await expect(todoCheckbox).toBeVisible({ timeout: 5000 })

      // Assert — sidebar count badge increments to "1" for this category
      const categoryItem = sidebar
        .locator('[data-slot="sidebar-menu-item"]')
        .filter({ hasText: categoryName })
      await expect(
        categoryItem.locator('[data-slot="sidebar-menu-badge"]'),
      ).toHaveText('1', { timeout: 10000 })
    })

    test('should show pending count next to categories', async ({ page }) => {
      // Arrange — wait for full page load before interacting with the input
      const todoText = 'TodoCnt'
      const sidebar = getSidebar(page)
      await page.waitForLoadState('networkidle')

      // Act — General is auto-selected; create a todo to ensure at least
      // one pending task exists
      const todoInput = page.getByPlaceholder('Enter a new todo...')
      await expect(todoInput).toBeVisible({ timeout: 10000 })
      await todoInput.fill(todoText)
      await todoInput.press('Enter')
      await expect(page.getByRole('checkbox', { name: todoText })).toBeVisible({
        timeout: 10000,
      })

      // Assert — General shows a numeric count badge
      const generalItem = sidebar
        .locator('[data-slot="sidebar-menu-item"]')
        .filter({ hasText: 'General' })
        .first()
      await expect(
        generalItem.locator('[data-slot="sidebar-menu-badge"]'),
      ).toBeVisible({ timeout: 10000 })
    })

    test('should keep tasks when deleting their category', async ({ page }) => {
      // Arrange — create a category and add a todo under it
      const categoryName = 'CatKeep'
      const todoText = 'TodoKeep'
      const sidebar = getSidebar(page)
      await createCategory(page, sidebar, categoryName)
      await selectCategory(page, sidebar, categoryName)
      await page.getByPlaceholder('Enter a new todo...').fill(todoText)
      await page.getByRole('button', { name: 'Add', exact: true }).click()
      await expect(page.getByRole('checkbox', { name: todoText })).toBeVisible({
        timeout: 5000,
      })

      // Act — switch to General, then delete the source category
      await selectCategory(page, sidebar, 'General')
      await page.waitForTimeout(500)
      await openManageDialog(page, sidebar)
      const categoryRow = page
        .locator('[role="dialog"]')
        .locator('.rounded-md.p-2')
        .filter({ hasText: categoryName })
      await expect(categoryRow).toBeVisible({ timeout: 5000 })
      const deleteButton = categoryRow.locator('button').filter({
        has: page.locator('svg.lucide-trash-2'),
      })
      // Dialog may overflow viewport with many test categories — dispatch
      // click via JS so layout-clipped buttons still receive the event.
      await deleteButton.dispatchEvent('click')
      await expect(page.getByText('Delete category?')).toBeVisible({
        timeout: 5000,
      })
      await page.getByRole('button', { name: 'Delete', exact: true }).click()
      await expect(page.getByText('Delete category?')).not.toBeVisible({
        timeout: 5000,
      })
      await page.waitForLoadState('networkidle')
      await page.keyboard.press('Escape')
      await expect(page.getByText('Manage Categories')).not.toBeVisible({
        timeout: 5000,
      })

      // Assert — todo still exists, now reassigned to General
      await selectCategory(page, sidebar, 'General')
      await page.waitForTimeout(1000)
      await expect(page.getByRole('checkbox', { name: todoText })).toBeVisible({
        timeout: 10000,
      })
    })
  })
})
