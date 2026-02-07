import { setupClerkTestingToken } from '@clerk/testing/playwright'
import { test, expect, type Page, type Locator } from '@playwright/test'

/**
 * Generates a unique name for test data isolation.
 * Category names have maxLength=30 in the UI input, so keep prefixes short (<=7 chars).
 * @param prefix - Test identifier prefix (keep short for category names)
 * @returns Unique string like "CatNew-1706000000000-a1b2c"
 * @example
 * uniqueName('CatNew')  // => "CatNew-1706000000000-a1b2c" (26 chars)
 * uniqueName('TodoLong') // => "TodoLong-1706000000000-a1b2c" (28 chars)
 */
const uniqueName = (prefix: string) =>
  `${prefix}-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`

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
 * Selects a category in the sidebar, ensuring the real server ID is used.
 * After optimistic category creation, the ID may still be negative (-Date.now()).
 * This helper clicks the category, checks if the stored ID is negative (optimistic),
 * and if so, waits for the category list to refresh and clicks again.
 * @param page - Playwright page object
 * @param sidebar - Sidebar locator
 * @param categoryName - Name of the category to click
 */
async function selectCategory(
  page: Page,
  sidebar: Locator,
  categoryName: string,
) {
  // Click the category
  await sidebar.getByText(categoryName).click()

  // After optimistic category creation, the first click may store a negative (temp) ID.
  // Wait for the category list refetch to bring real IDs, then re-click if needed.
  const storedId = await page.evaluate(() =>
    localStorage.getItem('corelive-selected-category'),
  )
  if (storedId && Number(storedId) < 0) {
    await page.waitForLoadState('networkidle')
    await page.waitForTimeout(1000)
    await sidebar.getByText(categoryName).click()
  }

  // Verify we now have a positive (real) server ID
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
  test.beforeEach(async ({ page }) => {
    await setupClerkTestingToken({ page })
    await page.goto('/home')
    await page.waitForLoadState('networkidle')
    await waitForAppReady(page)
  })

  test.describe('Category Sidebar', () => {
    test('should display category sidebar with "All" item', async ({
      page,
    }) => {
      // Category section is visible in the app sidebar
      const sidebar = getSidebar(page)
      await expect(sidebar).toBeVisible()

      // "Categories" group label should be present
      await expect(sidebar.getByText('Categories')).toBeVisible()

      // "All" item should always be present
      await expect(sidebar.getByText('All')).toBeVisible()

      // "Add category" button (+ icon) should be visible
      await expect(
        sidebar.getByRole('button', { name: 'Add category' }),
      ).toBeVisible()
    })

    test('should create a new category from sidebar', async ({ page }) => {
      const categoryName = uniqueName('CatCreate')
      const sidebar = getSidebar(page)
      await createCategory(page, sidebar, categoryName)
    })

    test('should filter todos by category selection', async ({ page }) => {
      const categoryName = uniqueName('CatFilter')
      const todoWithCategory = uniqueName('TodoCat')
      const todoWithoutCategory = uniqueName('TodoNoCat')

      // Step 1: Create a category
      const sidebar = getSidebar(page)
      await createCategory(page, sidebar, categoryName)

      // Step 2: Select the new category in sidebar
      // Wait for real server ID (optimistic IDs are negative) before clicking
      await selectCategory(page, sidebar, categoryName)

      // Step 3: Add a todo (should be auto-assigned to the selected category)
      await page.getByPlaceholder('Enter a new todo...').fill(todoWithCategory)
      await page.getByRole('button', { name: 'Add', exact: true }).click()

      // Wait for todo to appear with server-confirmed ID
      const catTodoCheckbox = page.getByRole('checkbox', {
        name: todoWithCategory,
      })
      await expect(catTodoCheckbox).toBeVisible({ timeout: 5000 })
      await expect(catTodoCheckbox).toHaveAttribute('id', /^todo-[^-]/, {
        timeout: 10000,
      })

      // Step 4: Switch to "All" view
      await sidebar.getByText('All').click()
      await page.waitForTimeout(500)

      // Step 5: Add a todo without category (while "All" is selected)
      await page
        .getByPlaceholder('Enter a new todo...')
        .fill(todoWithoutCategory)
      await page.getByRole('button', { name: 'Add', exact: true }).click()

      // Wait for the uncategorized todo to appear
      const noCatTodoCheckbox = page.getByRole('checkbox', {
        name: todoWithoutCategory,
      })
      await expect(noCatTodoCheckbox).toBeVisible({ timeout: 5000 })

      // Step 6: Both todos should be visible in "All" view
      await expect(catTodoCheckbox).toBeVisible()
      await expect(noCatTodoCheckbox).toBeVisible()

      // Step 7: Filter by the category
      await sidebar.getByText(categoryName).click()
      await page.waitForTimeout(1000)

      // The categorized todo should still be visible
      await expect(
        page.getByRole('checkbox', { name: todoWithCategory }),
      ).toBeVisible({ timeout: 5000 })

      // The uncategorized todo should NOT be visible
      await expect(
        page.getByRole('checkbox', { name: todoWithoutCategory }),
      ).not.toBeVisible({ timeout: 5000 })
    })

    test('should show category name on todo items', async ({ page }) => {
      const categoryName = uniqueName('CatBadge')
      const todoText = uniqueName('TodoBadge')

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

      // Switch to "All" view to see the category badge
      await sidebar.getByText('All').click()
      await page.waitForTimeout(1000)

      // The todo item should display the category name
      // TodoItem renders categoryName in a <span> near the date
      const todoItem = page.locator('.rounded-lg.border').filter({
        has: page.getByRole('checkbox', { name: todoText }),
      })
      await expect(todoItem.getByText(categoryName)).toBeVisible({
        timeout: 5000,
      })
    })

    test('should select a color when creating a category', async ({ page }) => {
      const categoryName = uniqueName('CatColor')
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
      const categoryName = uniqueName('CatCTA')
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
      const categoryName = uniqueName('CatZero')
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
      const categoryName = uniqueName('CatActive')
      const sidebar = getSidebar(page)
      await createCategory(page, sidebar, categoryName)

      // "All" should be active by default
      const allButton = sidebar
        .locator('[data-slot="sidebar-menu-button"]')
        .filter({ hasText: 'All' })
      await expect(allButton).toHaveAttribute('data-active', 'true')

      // Click category — it becomes active, "All" becomes inactive
      await selectCategory(page, sidebar, categoryName)
      const categoryButton = sidebar
        .locator('[data-slot="sidebar-menu-button"]')
        .filter({ hasText: categoryName })
      await expect(categoryButton).toHaveAttribute('data-active', 'true')
      await expect(allButton).not.toHaveAttribute('data-active', 'true')

      // Click "All" — it becomes active again
      await sidebar.getByText('All').click()
      await expect(allButton).toHaveAttribute('data-active', 'true')
      await expect(categoryButton).not.toHaveAttribute('data-active', 'true')
    })

    test('should show Manage button when categories exist', async ({
      page,
    }) => {
      const categoryName = uniqueName('CatMgBtn')
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
      const categoryName = uniqueName('CatMgr')
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
      const originalName = uniqueName('CatRen')
      const newName = uniqueName('CatRen2')

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
      const categoryName = uniqueName('CatDelete')

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

  test.describe('Category + Todo Integration', () => {
    test('should auto-assign category when adding todo with category selected', async ({
      page,
    }) => {
      const categoryName = uniqueName('CatAuto')
      const todoText = uniqueName('TodoAuto')

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
      const todoText = uniqueName('TodoCnt')
      const sidebar = getSidebar(page)

      // Wait for page to fully load before interacting with todo input
      await page.waitForLoadState('networkidle')

      // Create a todo to ensure at least one pending task exists
      const todoInput = page.getByPlaceholder('Enter a new todo...')
      await expect(todoInput).toBeVisible({ timeout: 10000 })
      await todoInput.fill(todoText)
      await todoInput.press('Enter')
      await expect(page.getByRole('checkbox', { name: todoText })).toBeVisible({
        timeout: 10000,
      })

      // The "All" item should show a count badge
      const allItem = sidebar
        .locator('[data-slot="sidebar-menu-item"]')
        .filter({ hasText: 'All' })
        .first()

      // Should have a badge with a numeric count
      await expect(
        allItem.locator('[data-slot="sidebar-menu-badge"]'),
      ).toBeVisible({ timeout: 10000 })
    })

    test('should keep tasks when deleting their category', async ({ page }) => {
      const categoryName = uniqueName('CatKeep')
      const todoText = uniqueName('TodoKeep')

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

      // Switch to "All" view first
      await sidebar.getByText('All').click()
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
      await deleteButton.click()

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

      // The todo should still exist (now uncategorized) in "All" view
      await expect(page.getByRole('checkbox', { name: todoText })).toBeVisible({
        timeout: 10000,
      })
    })
  })
})
