import { setupClerkTestingToken } from '@clerk/testing/playwright'
import { test, expect, type Page } from '@playwright/test'

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

test.describe('QA Fixes Verification', () => {
  test.beforeAll(resetDatabase)

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
      // Arrange — a 200-character unbreakable string (no spaces) stresses CSS wrap
      const longText = 'A'.repeat(200)

      // Act — create the todo via Enter key
      const input = page.getByPlaceholder('Enter a new todo...')
      await input.fill(longText)
      await input.press('Enter')
      const todoCheckbox = page.getByRole('checkbox', { name: longText })
      await expect(todoCheckbox).toBeVisible({ timeout: 5000 })

      // Assert — text container has break-words, item stays inside parent bounds
      const todoItem = page.locator('.rounded-lg.border').filter({
        has: page.getByRole('checkbox', { name: longText }),
      })
      const textContainer = todoItem.locator('.break-words').first()
      await expect(textContainer).toBeVisible()
      const todoItemBox = await todoItem.boundingBox()
      const parentBox = await todoItem.locator('..').boundingBox()
      if (todoItemBox && parentBox) {
        // Right edge must not exceed the parent (1px tolerance for rounding).
        expect(todoItemBox.x + todoItemBox.width).toBeLessThanOrEqual(
          parentBox.x + parentBox.width + 1,
        )
      }

      // Cleanup — delete the todo so subsequent tests start clean
      const deleteButton = todoItem.getByRole('button', { name: 'Delete' })
      await deleteButton.click()
      await expect(todoCheckbox).not.toBeVisible({ timeout: 5000 })
    })
  })

  test.describe('P1: Footer icon buttons accessibility', () => {
    test('should have aria-labels on footer icon buttons', async ({ page }) => {
      // Arrange — locate the sidebar (no Act phase: this test only inspects DOM)
      const sidebar = page.locator('[data-slot="sidebar"]')

      // Assert — footer buttons expose aria-labels and meet 36x36 minimum tap area
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
      const documentsBox = await documentsButton.boundingBox()
      if (documentsBox) {
        // size-9 = 36px in Tailwind
        expect(documentsBox.width).toBeGreaterThanOrEqual(36)
        expect(documentsBox.height).toBeGreaterThanOrEqual(36)
      }
    })
  })

  test.describe('P2: Clear All confirmation dialog', () => {
    test('should show confirmation dialog before clearing completed todos', async ({
      page,
    }) => {
      // Arrange — seed and complete a todo so "Clear all" has something to act on
      const todoText = 'Clear dialog test todo'
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

      // Act — click "Clear all"
      const clearButton = page.getByRole('button', { name: 'Clear all' })
      await expect(clearButton).toBeVisible()
      await clearButton.click()

      // Assert — confirmation dialog appears with the right copy
      const dialog = page.getByRole('alertdialog')
      await expect(dialog).toBeVisible()
      await expect(dialog.getByText('Clear all completed tasks?')).toBeVisible()
      await expect(
        dialog.getByText('This action cannot be undone'),
      ).toBeVisible()

      // Act 2 — cancel the dialog
      await dialog.getByRole('button', { name: 'Cancel' }).click()

      // Assert 2 — dialog closes and the completed todo is preserved
      await expect(dialog).not.toBeVisible()
      await expect(page.getByRole('checkbox', { name: todoText })).toBeVisible()
    })

    test('should delete completed todos when confirmed', async ({ page }) => {
      // Arrange — seed and complete a todo
      const todoText = 'Confirm clear test todo'
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

      // Act — open Clear All dialog and confirm
      await page.getByRole('button', { name: 'Clear all' }).click()
      const dialog = page.getByRole('alertdialog')
      await expect(dialog).toBeVisible()
      await dialog.getByRole('button', { name: 'Clear all' }).click()

      // Assert — dialog closes and the completed todo is gone
      await expect(dialog).not.toBeVisible()
      await expect(
        page.getByRole('checkbox', { name: todoText }),
      ).not.toBeVisible({ timeout: 5000 })
    })
  })

  test.describe('P2: Toaster is mounted', () => {
    test('should have toaster container in the DOM', async ({ page }) => {
      // Arrange — page mount handled by beforeEach (no Act phase)

      // Assert — Sonner v2 renders as an aria region with "Notifications" label
      const toaster = page.getByRole('region', { name: /Notifications/ })
      await expect(toaster).toBeAttached({ timeout: 10000 })
    })
  })
})
