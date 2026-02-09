import { setupClerkTestingToken } from '@clerk/testing/playwright'
import { test, expect, type Page } from '@playwright/test'

/**
 * Generates a unique name for test data isolation.
 * @param prefix - Test identifier prefix (keep short)
 * @returns Unique string like "QAFix-1706000000000-a1b2c"
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

test.describe('QA Fixes Verification', () => {
  test.beforeEach(async ({ page }) => {
    await setupClerkTestingToken({ page })
    await page.goto('/home')
    await page.waitForLoadState('networkidle')
    await waitForAppReady(page)
  })

  test.describe('P1: Long text overflow', () => {
    test('should wrap long unbreakable text without overflow', async ({
      page,
    }) => {
      // Create a todo with a very long unbreakable string (no spaces)
      const longText = 'A'.repeat(200)
      const input = page.getByPlaceholder('Enter a new todo...')
      await input.fill(longText)
      await input.press('Enter')

      // Wait for the todo to appear
      const todoCheckbox = page.getByRole('checkbox', { name: longText })
      await expect(todoCheckbox).toBeVisible({ timeout: 5000 })

      // Find the todo text container and verify it has break-words class
      const todoItem = page.locator('.rounded-lg.border').filter({
        has: page.getByRole('checkbox', { name: longText }),
      })
      const textContainer = todoItem.locator('.break-words').first()
      await expect(textContainer).toBeVisible()

      // Verify the todo item doesn't overflow its parent
      const todoItemBox = await todoItem.boundingBox()
      const parentBox = await todoItem.locator('..').boundingBox()

      if (todoItemBox && parentBox) {
        // The todo item's right edge should not exceed the parent container
        expect(todoItemBox.x + todoItemBox.width).toBeLessThanOrEqual(
          parentBox.x + parentBox.width + 1, // 1px tolerance for rounding
        )
      }

      // Cleanup: delete the todo
      const deleteButton = todoItem.getByRole('button', { name: 'Delete' })
      await deleteButton.click()
      await expect(todoCheckbox).not.toBeVisible({ timeout: 5000 })
    })
  })

  test.describe('P1: Footer icon buttons accessibility', () => {
    test('should have aria-labels on footer icon buttons', async ({ page }) => {
      // Open sidebar if needed (on mobile viewports)
      const sidebar = page.locator('[data-slot="sidebar"]')

      // Verify footer buttons have aria-labels
      const documentsButton = sidebar.getByRole('button', {
        name: 'Documents',
      })
      const editButton = sidebar.getByRole('button', { name: 'Edit' })
      const moreButton = sidebar.getByRole('button', {
        name: 'More options',
      })

      await expect(documentsButton).toBeVisible()
      await expect(editButton).toBeVisible()
      await expect(moreButton).toBeVisible()

      // Verify buttons have minimum size (size-9 = 36px)
      const documentsBox = await documentsButton.boundingBox()
      if (documentsBox) {
        expect(documentsBox.width).toBeGreaterThanOrEqual(36)
        expect(documentsBox.height).toBeGreaterThanOrEqual(36)
      }
    })
  })

  test.describe('P2: Clear All confirmation dialog', () => {
    test('should show confirmation dialog before clearing completed todos', async ({
      page,
    }) => {
      const todoText = uniqueName('Clear')

      // Create and complete a todo
      const input = page.getByPlaceholder('Enter a new todo...')
      await input.fill(todoText)
      await input.press('Enter')

      const todoCheckbox = page.getByRole('checkbox', { name: todoText })
      await expect(todoCheckbox).toBeVisible()

      // Wait for server confirmation (positive ID)
      await expect(todoCheckbox).toHaveAttribute('id', /^todo-[^-]/, {
        timeout: 5000,
      })

      // Toggle to completed
      await todoCheckbox.click()
      await expect(page.getByRole('checkbox', { name: todoText })).toBeChecked({
        timeout: 5000,
      })

      // Click "Clear all" button
      const clearButton = page.getByRole('button', { name: 'Clear all' })
      await expect(clearButton).toBeVisible()
      await clearButton.click()

      // Verify confirmation dialog appears
      const dialog = page.getByRole('alertdialog')
      await expect(dialog).toBeVisible()
      await expect(dialog.getByText('Clear all completed tasks?')).toBeVisible()
      await expect(
        dialog.getByText('This action cannot be undone'),
      ).toBeVisible()

      // Cancel and verify todos are still there
      await dialog.getByRole('button', { name: 'Cancel' }).click()
      await expect(dialog).not.toBeVisible()
      await expect(page.getByRole('checkbox', { name: todoText })).toBeVisible()
    })

    test('should delete completed todos when confirmed', async ({ page }) => {
      const todoText = uniqueName('Confirm')

      // Create and complete a todo
      const input = page.getByPlaceholder('Enter a new todo...')
      await input.fill(todoText)
      await input.press('Enter')

      const todoCheckbox = page.getByRole('checkbox', { name: todoText })
      await expect(todoCheckbox).toBeVisible()
      await expect(todoCheckbox).toHaveAttribute('id', /^todo-[^-]/, {
        timeout: 5000,
      })

      await todoCheckbox.click()
      await expect(page.getByRole('checkbox', { name: todoText })).toBeChecked({
        timeout: 5000,
      })

      // Click "Clear all" and confirm
      const clearButton = page.getByRole('button', { name: 'Clear all' })
      await clearButton.click()

      const dialog = page.getByRole('alertdialog')
      await expect(dialog).toBeVisible()

      // Click "Clear all" in the dialog to confirm
      await dialog.getByRole('button', { name: 'Clear all' }).click()
      await expect(dialog).not.toBeVisible()

      // Verify the completed todo is removed
      await expect(
        page.getByRole('checkbox', { name: todoText }),
      ).not.toBeVisible({ timeout: 5000 })
    })
  })

  test.describe('P2: Toaster is mounted', () => {
    test('should have toaster container in the DOM', async ({ page }) => {
      // Sonner v2 renders as an aria region with "Notifications" label
      const toaster = page.getByRole('region', { name: /Notifications/ })
      await expect(toaster).toBeAttached({ timeout: 10000 })
    })
  })
})
