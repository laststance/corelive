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
      // Category section is visible in the app sidebar
      const sidebar = getSidebar(page)
      await expect(sidebar).toBeVisible()

      // "Categories" group label should be present
      await expect(sidebar.getByText('Categories')).toBeVisible()

      // General (default) category should be visible and active
      await expect(sidebar.getByText('General')).toBeVisible()
      const generalButton = sidebar
        .locator('[data-slot="sidebar-menu-button"]')
        .filter({ hasText: 'General' })
      await expect(generalButton).toHaveAttribute('data-active', 'true')

      // "Add category" button (+ icon) should be visible
      await expect(
        sidebar.getByRole('button', { name: 'Add category' }),
      ).toBeVisible()
    })

    test('should create a new category from sidebar', async ({ page }) => {
      const categoryName = 'CatCreate'
      const sidebar = getSidebar(page)
      await createCategory(page, sidebar, categoryName)
    })

    test('should filter todos by category selection', async ({ page }) => {
      const categoryName = 'CatFilter'
      const todoInGeneral = 'TodoGen'
      const todoInCategory = 'TodoCat'

      const sidebar = getSidebar(page)

      // Step 1: General is auto-selected on load — add a todo to General
      await selectCategory(page, sidebar, 'General')
      await page.getByPlaceholder('Enter a new todo...').fill(todoInGeneral)
      await page.getByRole('button', { name: 'Add', exact: true }).click()
      await expect(
        page.getByRole('checkbox', { name: todoInGeneral }),
      ).toBeVisible({ timeout: 5000 })

      // Step 2: Create a new category and add a todo to it
      await createCategory(page, sidebar, categoryName)
      await selectCategory(page, sidebar, categoryName)
      await page.getByPlaceholder('Enter a new todo...').fill(todoInCategory)
      await page.getByRole('button', { name: 'Add', exact: true }).click()
      await expect(
        page.getByRole('checkbox', { name: todoInCategory }),
      ).toBeVisible({ timeout: 5000 })

      // Step 3: Filter by General — only General's todo should be visible
      await selectCategory(page, sidebar, 'General')
      await page.waitForTimeout(1000)
      await expect(
        page.getByRole('checkbox', { name: todoInGeneral }),
      ).toBeVisible({ timeout: 5000 })
      await expect(
        page.getByRole('checkbox', { name: todoInCategory }),
      ).not.toBeVisible({ timeout: 5000 })

      // Step 4: Filter by the new category — only its todo should be visible
      await selectCategory(page, sidebar, categoryName)
      await page.waitForTimeout(1000)
      await expect(
        page.getByRole('checkbox', { name: todoInCategory }),
      ).toBeVisible({ timeout: 5000 })
      await expect(
        page.getByRole('checkbox', { name: todoInGeneral }),
      ).not.toBeVisible({ timeout: 5000 })
    })

    test('should show category name on todo items', async ({ page }) => {
      const categoryName = 'CatBadge'
      const todoText = 'TodoBadge'

      // Create a category
      const sidebar = getSidebar(page)
      await createCategory(page, sidebar, categoryName)

      // Select the category (wait for real server ID)
      await selectCategory(page, sidebar, categoryName)

      // Add a todo
      await page.getByPlaceholder('Enter a new todo...').fill(todoText)
      await page.getByRole('button', { name: 'Add', exact: true }).click()

      // Wait for todo to appear with server-confirmed ID
      await expect(page.getByRole('checkbox', { name: todoText })).toBeVisible({
        timeout: 5000,
      })
      await expect(
        page.getByRole('checkbox', { name: todoText }),
      ).toHaveAttribute('id', /^todo-[^-]/, { timeout: 10000 })

      // The todo item should display the category name badge
      // TodoItem renders categoryName in a <span> near the date
      const todoItem = page.locator('.rounded-lg.border').filter({
        has: page.getByRole('checkbox', { name: todoText }),
      })
      await expect(todoItem.getByText(categoryName)).toBeVisible({
        timeout: 5000,
      })
    })

    test('should select a color when creating a category', async ({ page }) => {
      const categoryName = 'CatColor'
      const sidebar = getSidebar(page)
      await createCategory(page, sidebar, categoryName, 'green')

      // The category should have a green color dot (bg-green-500)
      const categoryItem = sidebar
        .locator('[data-slot="sidebar-menu-item"]')
        .filter({ hasText: categoryName })
      const colorDot = categoryItem.locator('.rounded-full')
      await expect(colorDot).toHaveClass(/bg-green-500/)
    })

    test('should hide empty state CTA when categories exist', async ({
      page,
    }) => {
      const categoryName = 'CatCTA'
      const sidebar = getSidebar(page)

      // Create a category to ensure at least one exists
      await createCategory(page, sidebar, categoryName)

      // "Add your first category" CTA should NOT be visible when categories exist
      await expect(
        sidebar.getByText('Add your first category'),
      ).not.toBeVisible()

      // "Manage" button should be visible instead
      await expect(
        sidebar.getByRole('button', { name: 'Manage' }),
      ).toBeVisible()
    })

    test('should hide badge count when category has zero todos', async ({
      page,
    }) => {
      const categoryName = 'CatZero'
      const sidebar = getSidebar(page)
      await createCategory(page, sidebar, categoryName)

      // Category with 0 todos should NOT show a badge (Linear style)
      const categoryItem = sidebar
        .locator('[data-slot="sidebar-menu-item"]')
        .filter({ hasText: categoryName })
      await expect(categoryItem).toBeVisible()
      await expect(
        categoryItem.locator('[data-slot="sidebar-menu-badge"]'),
      ).not.toBeVisible()
    })

    test('should highlight active category selection', async ({ page }) => {
      const categoryName = 'CatActive'
      const sidebar = getSidebar(page)
      await createCategory(page, sidebar, categoryName)

      // General should be active by default
      const generalButton = sidebar
        .locator('[data-slot="sidebar-menu-button"]')
        .filter({ hasText: 'General' })
      await expect(generalButton).toHaveAttribute('data-active', 'true')

      // Click category — it becomes active, General becomes inactive
      await selectCategory(page, sidebar, categoryName)
      const categoryButton = sidebar
        .locator('[data-slot="sidebar-menu-button"]')
        .filter({ hasText: categoryName })
      await expect(categoryButton).toHaveAttribute('data-active', 'true')
      await expect(generalButton).not.toHaveAttribute('data-active', 'true')

      // Click General — it becomes active again
      await selectCategory(page, sidebar, 'General')
      await expect(generalButton).toHaveAttribute('data-active', 'true')
      await expect(categoryButton).not.toHaveAttribute('data-active', 'true')
    })

    test('should show Manage button when categories exist', async ({
      page,
    }) => {
      const categoryName = 'CatMgBtn'
      const sidebar = getSidebar(page)

      // Create a category
      await createCategory(page, sidebar, categoryName)

      // "Manage" should be visible when at least one category exists
      await expect(sidebar.getByRole('button', { name: 'Manage' })).toBeVisible(
        { timeout: 5000 },
      )
    })
  })

  test.describe('Category Management Dialog', () => {
    test('should open manage dialog from sidebar', async ({ page }) => {
      const sidebar = getSidebar(page)

      // "Manage" button only appears when categories exist, so create one first
      const categoryName = 'CatMgr'
      await createCategory(page, sidebar, categoryName)

      // Click the "Manage" button in sidebar
      await sidebar.getByRole('button', { name: 'Manage' }).click()

      // Dialog should open
      await expect(page.getByText('Manage Categories')).toBeVisible({
        timeout: 5000,
      })
      await expect(
        page.getByText('Rename, recolor, or delete categories'),
      ).toBeVisible()
    })

    test('should rename a category in manage dialog', async ({ page }) => {
      const originalName = 'CatRen'
      const newName = 'CatRen2'

      // First create a category
      const sidebar = getSidebar(page)
      await createCategory(page, sidebar, originalName)

      // Open manage dialog (waits for real server IDs)
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
      await editButton.click()

      // Should show inline edit mode with input
      const editInput = page.locator('[role="dialog"]').locator('input')
      await expect(editInput).toBeVisible({ timeout: 3000 })
      await expect(editInput).toHaveValue(originalName)

      // Replace with new name using fill
      await editInput.fill(newName)
      await expect(editInput).toHaveValue(newName)
      await editInput.press('Enter')

      // Wait for edit mode to exit (input disappears after successful mutation)
      await expect(editInput).not.toBeVisible({ timeout: 10000 })

      // Close dialog
      await page.keyboard.press('Escape')

      // Wait for query refetch to complete
      await page.waitForLoadState('networkidle')

      // New name should appear in sidebar (the source of truth after refetch)
      await expect(sidebar.getByText(newName)).toBeVisible({ timeout: 15000 })
    })

    test('should delete a category with confirmation', async ({ page }) => {
      const categoryName = 'CatDelete'

      // Create a category
      const sidebar = getSidebar(page)
      await createCategory(page, sidebar, categoryName)

      // Open manage dialog (waits for real server IDs)
      await openManageDialog(page, sidebar)

      // Find the category row (rounded-md p-2 is unique to category rows)
      const categoryRow = page
        .locator('[role="dialog"]')
        .locator('.rounded-md.p-2')
        .filter({ hasText: categoryName })
      await expect(categoryRow).toBeVisible({ timeout: 5000 })
      const deleteButton = categoryRow.locator('button').filter({
        has: page.locator('svg.lucide-trash-2'),
      })
      await deleteButton.click()

      // Confirmation dialog should appear
      await expect(page.getByText('Delete category?')).toBeVisible({
        timeout: 5000,
      })
      // Verify the confirmation dialog mentions the category name
      await expect(
        page.getByRole('alertdialog').getByText(categoryName),
      ).toBeVisible()

      // Confirm deletion
      await page.getByRole('button', { name: 'Delete', exact: true }).click()

      // Wait for deletion mutation + query invalidation to complete
      await page.waitForLoadState('networkidle')

      // Category should disappear from manage dialog
      await expect(categoryRow).not.toBeVisible({ timeout: 10000 })

      // Close dialog
      await page.keyboard.press('Escape')
      await page.waitForTimeout(500)

      // Category should no longer appear in sidebar
      await expect(sidebar.getByText(categoryName)).not.toBeVisible({
        timeout: 5000,
      })
    })
  })

  test.describe('Default General Category', () => {
    test('should always display General category in sidebar', async ({
      page,
    }) => {
      const sidebar = getSidebar(page)

      // General category should always be visible (seeded as isDefault)
      await expect(sidebar.getByText('General')).toBeVisible({ timeout: 5000 })

      // General should have a blue color dot
      const generalItem = sidebar
        .locator('[data-slot="sidebar-menu-item"]')
        .filter({ hasText: 'General' })
      const colorDot = generalItem.locator('.rounded-full')
      await expect(colorDot).toHaveClass(/bg-blue-500/)

      // Manage button should be visible (General counts as an existing category)
      await expect(
        sidebar.getByRole('button', { name: 'Manage' }),
      ).toBeVisible()
    })

    test('should not allow deleting the default General category', async ({
      page,
    }) => {
      const sidebar = getSidebar(page)

      // Open manage dialog
      await openManageDialog(page, sidebar)

      // Find the General category row
      const generalRow = page
        .locator('[role="dialog"]')
        .locator('.rounded-md.p-2')
        .filter({ hasText: 'General' })
      await expect(generalRow).toBeVisible({ timeout: 5000 })

      // Edit button should be present (renaming is allowed)
      const editButton = generalRow.locator('button').filter({
        has: page.locator('svg.lucide-pencil'),
      })
      await expect(editButton).toBeVisible()

      // Delete button should NOT be present (isDefault categories are protected)
      const deleteButton = generalRow.locator('button').filter({
        has: page.locator('svg.lucide-trash-2'),
      })
      await expect(deleteButton).not.toBeVisible()
    })

    test('should allow renaming the default General category', async ({
      page,
    }) => {
      const sidebar = getSidebar(page)
      const newName = 'GenRen'

      // Open manage dialog
      await openManageDialog(page, sidebar)

      // Find General row and click edit
      const generalRow = page
        .locator('[role="dialog"]')
        .locator('.rounded-md.p-2')
        .filter({ hasText: 'General' })
      await expect(generalRow).toBeVisible({ timeout: 5000 })
      const editButton = generalRow.locator('button').filter({
        has: page.locator('svg.lucide-pencil'),
      })
      await editButton.click()

      // Rename
      const editInput = page.locator('[role="dialog"]').locator('input')
      await expect(editInput).toBeVisible({ timeout: 3000 })
      await editInput.fill(newName)
      await editInput.press('Enter')

      // Wait for edit mode to exit
      await expect(editInput).not.toBeVisible({ timeout: 10000 })

      // Close dialog
      await page.keyboard.press('Escape')
      await page.waitForLoadState('networkidle')

      // New name should appear in sidebar
      await expect(sidebar.getByText(newName)).toBeVisible({ timeout: 15000 })

      // Rename back to "General" for test isolation
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

      // Verify restored
      await expect(sidebar.getByText('General')).toBeVisible({ timeout: 15000 })
    })

    test('should auto-assign new todo to General by default', async ({
      page,
    }) => {
      // Different label from the "filter todos" test's 'TodoGen' fixture so the
      // two coexist without colliding under shared spec-level state.
      const todoText = 'TodoGenAuto'
      const sidebar = getSidebar(page)

      // General is auto-selected on page load — add a todo directly
      await page.getByPlaceholder('Enter a new todo...').fill(todoText)
      await page.getByRole('button', { name: 'Add', exact: true }).click()

      // Wait for todo to appear with server-confirmed ID
      const todoCheckbox = page.getByRole('checkbox', { name: todoText })
      await expect(todoCheckbox).toBeVisible({ timeout: 5000 })
      await expect(todoCheckbox).toHaveAttribute('id', /^todo-[^-]/, {
        timeout: 10000,
      })

      // The todo item should display "General" as its category badge
      const todoItem = page.locator('.rounded-lg.border').filter({
        has: page.getByRole('checkbox', { name: todoText }),
      })
      await expect(todoItem.getByText('General')).toBeVisible({
        timeout: 5000,
      })

      // General category in sidebar should show a count badge
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
      const categoryName = 'CatDel'
      const todoText = 'TodoDel'
      const sidebar = getSidebar(page)

      // Create a new category and add a todo to it
      await createCategory(page, sidebar, categoryName)
      await selectCategory(page, sidebar, categoryName)
      await page.getByPlaceholder('Enter a new todo...').fill(todoText)
      await page.getByRole('button', { name: 'Add', exact: true }).click()
      await expect(page.getByRole('checkbox', { name: todoText })).toBeVisible({
        timeout: 5000,
      })

      // Switch to General before deleting the category
      await selectCategory(page, sidebar, 'General')
      await page.waitForTimeout(500)

      // Delete the category
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

      // Confirm deletion
      await expect(page.getByText('Delete category?')).toBeVisible({
        timeout: 5000,
      })
      await page.getByRole('button', { name: 'Delete', exact: true }).click()
      await expect(page.getByText('Delete category?')).not.toBeVisible({
        timeout: 5000,
      })
      await page.waitForLoadState('networkidle')

      // Close manage dialog
      await page.keyboard.press('Escape')
      await expect(page.getByText('Manage Categories')).not.toBeVisible({
        timeout: 5000,
      })

      // The todo should be reassigned to General and visible
      await selectCategory(page, sidebar, 'General')
      await page.waitForTimeout(1000)
      await expect(page.getByRole('checkbox', { name: todoText })).toBeVisible({
        timeout: 10000,
      })

      // The todo should show "General" as its category (reassigned from deleted category)
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
      const categoryName = 'CatAuto'
      const todoText = 'TodoAuto'

      // Create a category
      const sidebar = getSidebar(page)
      await createCategory(page, sidebar, categoryName)

      // Select the category (wait for real server ID)
      await selectCategory(page, sidebar, categoryName)

      // Add a todo
      await page.getByPlaceholder('Enter a new todo...').fill(todoText)
      await page.getByRole('button', { name: 'Add', exact: true }).click()

      // Wait for todo to appear
      const todoCheckbox = page.getByRole('checkbox', { name: todoText })
      await expect(todoCheckbox).toBeVisible({ timeout: 5000 })

      // The sidebar should show count increment for this category
      const categoryItem = sidebar
        .locator('[data-slot="sidebar-menu-item"]')
        .filter({ hasText: categoryName })
      // The count badge (SidebarMenuBadge) should show "1"
      await expect(
        categoryItem.locator('[data-slot="sidebar-menu-badge"]'),
      ).toHaveText('1', { timeout: 10000 })
    })

    test('should show pending count next to categories', async ({ page }) => {
      const todoText = 'TodoCnt'
      const sidebar = getSidebar(page)

      // Wait for page to fully load before interacting with todo input
      await page.waitForLoadState('networkidle')

      // General is auto-selected — create a todo to ensure at least one pending task
      const todoInput = page.getByPlaceholder('Enter a new todo...')
      await expect(todoInput).toBeVisible({ timeout: 10000 })
      await todoInput.fill(todoText)
      await todoInput.press('Enter')
      await expect(page.getByRole('checkbox', { name: todoText })).toBeVisible({
        timeout: 10000,
      })

      // General should show a count badge
      const generalItem = sidebar
        .locator('[data-slot="sidebar-menu-item"]')
        .filter({ hasText: 'General' })
        .first()

      // Should have a badge with a numeric count
      await expect(
        generalItem.locator('[data-slot="sidebar-menu-badge"]'),
      ).toBeVisible({ timeout: 10000 })
    })

    test('should keep tasks when deleting their category', async ({ page }) => {
      const categoryName = 'CatKeep'
      const todoText = 'TodoKeep'

      // Create a category and add a todo to it
      const sidebar = getSidebar(page)
      await createCategory(page, sidebar, categoryName)

      // Select category (wait for real server ID) and add todo
      await selectCategory(page, sidebar, categoryName)
      await page.getByPlaceholder('Enter a new todo...').fill(todoText)
      await page.getByRole('button', { name: 'Add', exact: true }).click()
      await expect(page.getByRole('checkbox', { name: todoText })).toBeVisible({
        timeout: 5000,
      })

      // Switch to General before deleting the category
      await selectCategory(page, sidebar, 'General')
      await page.waitForTimeout(500)

      // Delete the category (openManageDialog waits for real server IDs)
      await openManageDialog(page, sidebar)

      // Find the category row (rounded-md p-2 is unique to category rows)
      const categoryRow = page
        .locator('[role="dialog"]')
        .locator('.rounded-md.p-2')
        .filter({ hasText: categoryName })
      await expect(categoryRow).toBeVisible({ timeout: 5000 })
      const deleteButton = categoryRow.locator('button').filter({
        has: page.locator('svg.lucide-trash-2'),
      })
      // Dialog may overflow viewport with many test categories — dispatch click via JS
      await deleteButton.dispatchEvent('click')

      // Confirm deletion
      await expect(page.getByText('Delete category?')).toBeVisible({
        timeout: 5000,
      })
      await page.getByRole('button', { name: 'Delete', exact: true }).click()

      // Wait for alert dialog to close and deletion to complete
      await expect(page.getByText('Delete category?')).not.toBeVisible({
        timeout: 5000,
      })
      await page.waitForLoadState('networkidle')

      // Close manage dialog
      await page.keyboard.press('Escape')
      await expect(page.getByText('Manage Categories')).not.toBeVisible({
        timeout: 5000,
      })

      // The todo should still exist (now reassigned to General)
      await selectCategory(page, sidebar, 'General')
      await page.waitForTimeout(1000)
      await expect(page.getByRole('checkbox', { name: todoText })).toBeVisible({
        timeout: 10000,
      })
    })
  })
})
