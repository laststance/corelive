import { setupClerkTestingToken } from '@clerk/testing/playwright'
import { test, expect, type Page } from '@playwright/test'

/**
 * Generates a unique name for test data isolation.
 * @param prefix - Test identifier prefix
 * @returns Unique string like "CatCreate-1706000000000-a1b2c3"
 */
const uniqueName = (prefix: string) =>
  `${prefix}-${Date.now()}-${Math.random().toString(36).substring(7)}`

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
      // Category sidebar is visible on desktop (lg:block)
      const sidebar = page.locator('.rounded-lg.border.bg-card').first()
      await expect(sidebar).toBeVisible()

      // "All" item should always be present
      await expect(sidebar.getByText('All')).toBeVisible()

      // "Add Category" button should be visible
      await expect(sidebar.getByText('Add Category')).toBeVisible()

      // Manage button (gear icon) should be visible
      await expect(
        sidebar.getByRole('button', { name: 'Manage categories' }),
      ).toBeVisible()
    })

    test('should create a new category from sidebar', async ({ page }) => {
      const categoryName = uniqueName('CatCreate')

      // Click "Add Category" to open popover
      const sidebar = page.locator('.rounded-lg.border.bg-card').first()
      await sidebar.getByText('Add Category').click()

      // Wait for popover to appear
      const nameInput = page.getByPlaceholder('Category name')
      await expect(nameInput).toBeVisible({ timeout: 5000 })

      // Type category name
      await nameInput.fill(categoryName)

      // Click Create button
      await page.getByRole('button', { name: 'Create' }).click()

      // Wait for popover to close and category to appear in sidebar
      await expect(nameInput).not.toBeVisible({ timeout: 5000 })

      // Category should now appear in the sidebar
      await expect(sidebar.getByText(categoryName)).toBeVisible({
        timeout: 5000,
      })
    })

    test('should filter todos by category selection', async ({ page }) => {
      const categoryName = uniqueName('CatFilter')
      const todoWithCategory = uniqueName('TodoCat')
      const todoWithoutCategory = uniqueName('TodoNoCat')

      // Step 1: Create a category
      const sidebar = page.locator('.rounded-lg.border.bg-card').first()
      await sidebar.getByText('Add Category').click()
      const nameInput = page.getByPlaceholder('Category name')
      await expect(nameInput).toBeVisible({ timeout: 5000 })
      await nameInput.fill(categoryName)
      await page.getByRole('button', { name: 'Create' }).click()
      await expect(nameInput).not.toBeVisible({ timeout: 5000 })
      await expect(sidebar.getByText(categoryName)).toBeVisible({
        timeout: 5000,
      })

      // Step 2: Select the new category in sidebar
      await sidebar.getByText(categoryName).click()

      // Wait for filter to apply
      await page.waitForTimeout(500)

      // Step 3: Add a todo (should be auto-assigned to the selected category)
      await page.getByPlaceholder('Enter a new todo...').fill(todoWithCategory)
      await page.getByRole('button', { name: 'Add', exact: true }).click()

      // Wait for todo to appear
      const catTodoCheckbox = page.getByRole('checkbox', {
        name: todoWithCategory,
      })
      await expect(catTodoCheckbox).toBeVisible({ timeout: 5000 })

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
      const sidebar = page.locator('.rounded-lg.border.bg-card').first()
      await sidebar.getByText('Add Category').click()
      const nameInput = page.getByPlaceholder('Category name')
      await expect(nameInput).toBeVisible({ timeout: 5000 })
      await nameInput.fill(categoryName)
      await page.getByRole('button', { name: 'Create' }).click()
      await expect(nameInput).not.toBeVisible({ timeout: 5000 })

      // Select the category
      await sidebar.getByText(categoryName).click()
      await page.waitForTimeout(500)

      // Add a todo
      await page.getByPlaceholder('Enter a new todo...').fill(todoText)
      await page.getByRole('button', { name: 'Add', exact: true }).click()

      // Wait for todo to appear
      await expect(page.getByRole('checkbox', { name: todoText })).toBeVisible({
        timeout: 5000,
      })

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

      // Open Add Category popover
      const sidebar = page.locator('.rounded-lg.border.bg-card').first()
      await sidebar.getByText('Add Category').click()

      const nameInput = page.getByPlaceholder('Category name')
      await expect(nameInput).toBeVisible({ timeout: 5000 })

      // Select a different color (e.g., green)
      const greenButton = page.getByRole('button', {
        name: 'Select green color',
      })
      await expect(greenButton).toBeVisible()
      await greenButton.click()

      // Fill name and create
      await nameInput.fill(categoryName)
      await page.getByRole('button', { name: 'Create' }).click()

      // Category should appear in sidebar
      await expect(sidebar.getByText(categoryName)).toBeVisible({
        timeout: 5000,
      })

      // The category should have a green color dot (bg-green-500)
      const categoryButton = sidebar
        .locator('button')
        .filter({ hasText: categoryName })
      const colorDot = categoryButton.locator('.rounded-full')
      await expect(colorDot).toHaveClass(/bg-green-500/)
    })
  })

  test.describe('Category Management Dialog', () => {
    test('should open manage dialog from sidebar', async ({ page }) => {
      // Click the manage (gear) button
      const sidebar = page.locator('.rounded-lg.border.bg-card').first()
      await sidebar.getByRole('button', { name: 'Manage categories' }).click()

      // Dialog should open
      await expect(page.getByText('Manage Categories')).toBeVisible({
        timeout: 5000,
      })
      await expect(
        page.getByText('Rename, recolor, or delete categories'),
      ).toBeVisible()
    })

    test('should rename a category in manage dialog', async ({ page }) => {
      const originalName = uniqueName('CatRename')
      const newName = uniqueName('CatRenamed')

      // First create a category
      const sidebar = page.locator('.rounded-lg.border.bg-card').first()
      await sidebar.getByText('Add Category').click()
      const nameInput = page.getByPlaceholder('Category name')
      await expect(nameInput).toBeVisible({ timeout: 5000 })
      await nameInput.fill(originalName)
      await page.getByRole('button', { name: 'Create' }).click()
      await expect(nameInput).not.toBeVisible({ timeout: 5000 })
      await expect(sidebar.getByText(originalName)).toBeVisible({
        timeout: 5000,
      })

      // Open manage dialog
      await sidebar.getByRole('button', { name: 'Manage categories' }).click()
      await expect(page.getByText('Manage Categories')).toBeVisible({
        timeout: 5000,
      })

      // Find the category row and click edit (pencil) button
      const categoryRow = page
        .locator('[role="dialog"]')
        .locator('div')
        .filter({ hasText: originalName })
        .first()
      const editButton = categoryRow.locator('button').filter({
        has: page.locator('svg.lucide-pencil'),
      })
      await editButton.click()

      // Should show inline edit mode with input
      const editInput = page.locator('[role="dialog"]').locator('input')
      await expect(editInput).toBeVisible({ timeout: 3000 })
      await expect(editInput).toHaveValue(originalName)

      // Clear and type new name
      await editInput.clear()
      await editInput.fill(newName)

      // Click the check (save) button
      const saveButton = page
        .locator('[role="dialog"]')
        .locator('button')
        .filter({
          has: page.locator('svg.lucide-check'),
        })
      await saveButton.click()

      // Wait for the rename to take effect
      await page.waitForTimeout(1000)

      // New name should appear in dialog
      await expect(
        page.locator('[role="dialog"]').getByText(newName),
      ).toBeVisible({ timeout: 5000 })

      // Close dialog
      await page.keyboard.press('Escape')
      await page.waitForTimeout(500)

      // New name should appear in sidebar
      await expect(sidebar.getByText(newName)).toBeVisible({ timeout: 5000 })
    })

    test('should delete a category with confirmation', async ({ page }) => {
      const categoryName = uniqueName('CatDelete')

      // Create a category
      const sidebar = page.locator('.rounded-lg.border.bg-card').first()
      await sidebar.getByText('Add Category').click()
      const nameInput = page.getByPlaceholder('Category name')
      await expect(nameInput).toBeVisible({ timeout: 5000 })
      await nameInput.fill(categoryName)
      await page.getByRole('button', { name: 'Create' }).click()
      await expect(nameInput).not.toBeVisible({ timeout: 5000 })
      await expect(sidebar.getByText(categoryName)).toBeVisible({
        timeout: 5000,
      })

      // Open manage dialog
      await sidebar.getByRole('button', { name: 'Manage categories' }).click()
      await expect(page.getByText('Manage Categories')).toBeVisible({
        timeout: 5000,
      })

      // Find category row and click delete (trash) button
      const categoryRow = page
        .locator('[role="dialog"]')
        .locator('div')
        .filter({ hasText: categoryName })
        .first()
      const deleteButton = categoryRow.locator('button').filter({
        has: page.locator('svg.lucide-trash-2'),
      })
      await deleteButton.click()

      // Confirmation dialog should appear
      await expect(page.getByText('Delete category?')).toBeVisible({
        timeout: 5000,
      })
      await expect(page.getByText(categoryName, { exact: false })).toBeVisible()

      // Confirm deletion
      await page.getByRole('button', { name: 'Delete', exact: true }).click()

      // Wait for deletion to complete
      await page.waitForTimeout(1000)

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
      const categoryName = uniqueName('CatAutoAssign')
      const todoText = uniqueName('TodoAutoAssign')

      // Create a category
      const sidebar = page.locator('.rounded-lg.border.bg-card').first()
      await sidebar.getByText('Add Category').click()
      const nameInput = page.getByPlaceholder('Category name')
      await expect(nameInput).toBeVisible({ timeout: 5000 })
      await nameInput.fill(categoryName)
      await page.getByRole('button', { name: 'Create' }).click()
      await expect(nameInput).not.toBeVisible({ timeout: 5000 })

      // Select the category
      await sidebar.getByText(categoryName).click()
      await page.waitForTimeout(500)

      // Add a todo
      await page.getByPlaceholder('Enter a new todo...').fill(todoText)
      await page.getByRole('button', { name: 'Add', exact: true }).click()

      // Wait for todo to appear
      const todoCheckbox = page.getByRole('checkbox', { name: todoText })
      await expect(todoCheckbox).toBeVisible({ timeout: 5000 })

      // The sidebar should show count increment for this category
      const categoryButton = sidebar
        .locator('button')
        .filter({ hasText: categoryName })
      // The count should show at least "1"
      await expect(categoryButton.getByText('1')).toBeVisible({
        timeout: 5000,
      })
    })

    test('should show pending count next to categories', async ({ page }) => {
      // The "All" item should show a count
      const sidebar = page.locator('.rounded-lg.border.bg-card').first()
      const allButton = sidebar
        .locator('button')
        .filter({ hasText: 'All' })
        .first()

      // Should have a numeric count
      await expect(allButton.locator('.tabular-nums')).toBeVisible()
    })

    test('should keep tasks when deleting their category', async ({ page }) => {
      const categoryName = uniqueName('CatKeepTasks')
      const todoText = uniqueName('TodoKeepTask')

      // Create a category and add a todo to it
      const sidebar = page.locator('.rounded-lg.border.bg-card').first()
      await sidebar.getByText('Add Category').click()
      const nameInput = page.getByPlaceholder('Category name')
      await expect(nameInput).toBeVisible({ timeout: 5000 })
      await nameInput.fill(categoryName)
      await page.getByRole('button', { name: 'Create' }).click()
      await expect(nameInput).not.toBeVisible({ timeout: 5000 })

      // Select category and add todo
      await sidebar.getByText(categoryName).click()
      await page.waitForTimeout(500)
      await page.getByPlaceholder('Enter a new todo...').fill(todoText)
      await page.getByRole('button', { name: 'Add', exact: true }).click()
      await expect(page.getByRole('checkbox', { name: todoText })).toBeVisible({
        timeout: 5000,
      })

      // Switch to "All" view first
      await sidebar.getByText('All').click()
      await page.waitForTimeout(500)

      // Delete the category
      await sidebar.getByRole('button', { name: 'Manage categories' }).click()
      await expect(page.getByText('Manage Categories')).toBeVisible({
        timeout: 5000,
      })

      const categoryRow = page
        .locator('[role="dialog"]')
        .locator('div')
        .filter({ hasText: categoryName })
        .first()
      const deleteButton = categoryRow.locator('button').filter({
        has: page.locator('svg.lucide-trash-2'),
      })
      await deleteButton.click()

      // Confirm deletion
      await expect(page.getByText('Delete category?')).toBeVisible({
        timeout: 5000,
      })
      await page.getByRole('button', { name: 'Delete', exact: true }).click()

      await page.waitForTimeout(1000)

      // Close manage dialog
      await page.keyboard.press('Escape')
      await page.waitForTimeout(500)

      // The todo should still exist (now uncategorized) in "All" view
      await expect(page.getByRole('checkbox', { name: todoText })).toBeVisible({
        timeout: 5000,
      })
    })
  })
})
