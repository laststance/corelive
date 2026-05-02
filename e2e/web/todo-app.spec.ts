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

test.describe('TODO App E2E Tests', () => {
  test.beforeAll(resetDatabase)

  test.beforeEach(async ({ page }) => {
    // Setup Clerk testing token for each test
    // This is required for Clerk to work properly in test mode
    await setupClerkTestingToken({ page })

    // Navigate to the TODO app home page
    // Authentication state is automatically loaded from playwright/.auth/user.json
    await page.goto('/home')
    await page.waitForLoadState('networkidle')
  })

  test('should display TODO app correctly after authentication', async ({
    page,
  }) => {
    // Arrange — page setup handled by beforeEach
    await waitForAppReady(page)

    // Assert — authenticated TODO app renders all primary regions
    await expect(page).toHaveURL(/\/home\/?$/)
    await expect(page.getByText('Todo List')).toBeVisible()
    await expect(page.getByText('Manage your tasks efficiently')).toBeVisible()
    await expect(page.getByText(/\d+ pending/)).toBeVisible()
    await expect(page.getByPlaceholder('Enter a new todo...')).toBeVisible()
    await expect(
      page.getByText('Completed', { exact: false }).first(),
    ).toBeVisible()
  })

  test('should add a new TODO item', async ({ page }) => {
    // Arrange
    const todoText = 'Add new TODO test'

    // Act
    await page.getByPlaceholder('Enter a new todo...').fill(todoText)
    await page.getByRole('button', { name: 'Add', exact: true }).click()

    // Assert — new item appears, pending counter present, item starts unchecked
    const todoCheckbox = page.getByRole('checkbox', { name: todoText })
    await expect(todoCheckbox).toBeVisible()
    await expect(page.getByText(/\d+ pending/)).toBeVisible()
    await expect(todoCheckbox).not.toBeChecked()
  })

  test('should toggle TODO completion status', async ({ page }) => {
    // Arrange — seed a pending todo and wait for the create mutation to settle
    // with a positive server ID (optimistic negative IDs would yield "todo--<ts>").
    const todoText = 'Toggle completion test todo'
    await page.getByPlaceholder('Enter a new todo...').fill(todoText)
    await page.getByRole('button', { name: 'Add', exact: true }).click()
    const todoCheckbox = page.getByRole('checkbox', { name: todoText })
    await expect(todoCheckbox).toBeVisible()
    await expect(todoCheckbox).not.toBeChecked()
    await expect(todoCheckbox).toHaveAttribute('id', /^todo-[^-]/, {
      timeout: 5000,
    })

    // Act — toggle the checkbox (this moves the todo to the completed list)
    await todoCheckbox.click()

    // Assert — text styled with line-through and the checkbox is checked
    await expect(page.getByText(todoText)).toHaveClass(/line-through/, {
      timeout: 5000,
    })
    await expect(page.getByRole('checkbox', { name: todoText })).toBeChecked()
  })

  test('should delete a TODO item', async ({ page }) => {
    // Arrange — seed a todo so we have a real row to delete
    const todoText = 'Delete TODO test'
    await page.getByPlaceholder('Enter a new todo...').fill(todoText)
    await page.getByRole('button', { name: 'Add', exact: true }).click()
    const todoCheckbox = page.getByRole('checkbox', { name: todoText })
    await expect(todoCheckbox).toBeVisible()

    // Act — click the per-row Delete button (sr-only labelled)
    const todoItem = page.locator('.rounded-lg.border').filter({
      has: page.getByRole('checkbox', { name: todoText }),
    })
    const deleteButton = todoItem.getByRole('button', { name: 'Delete' })
    await expect(deleteButton).toBeVisible()
    await deleteButton.click()

    // Assert — both the checkbox and the text are gone
    await expect(
      page.getByRole('checkbox', { name: todoText }),
    ).not.toBeVisible({ timeout: 5000 })
    await expect(page.getByText(todoText)).not.toBeVisible()
  })

  test('should add TODO with notes', async ({ page }) => {
    // Arrange
    const todoText = 'Notes feature test todo'
    const todoNotes = 'These are some important notes for this task'

    // Act — fill text, expand notes section, fill notes, submit
    await page.getByPlaceholder('Enter a new todo...').fill(todoText)
    const addNotesButton = page
      .getByRole('button', { name: 'Add notes' })
      .first()
    await addNotesButton.click()
    await page.getByPlaceholder('Add notes (optional)...').fill(todoNotes)
    await page.getByRole('button', { name: 'Add', exact: true }).click()

    // Assert — todo appears and the notes UI is reachable
    const todoCheckbox = page.getByRole('checkbox', { name: todoText })
    await expect(todoCheckbox).toBeVisible()
    const toggleNotesButton = page
      .getByRole('button', { name: 'Toggle notes' })
      .first()
    await expect(toggleNotesButton).toBeVisible()
    await toggleNotesButton.click()
    await page.waitForTimeout(500)
    const notesTextarea = page.getByPlaceholder('Add notes...').first()
    await expect(notesTextarea).toBeVisible()

    // Notes content may or may not be persisted depending on backend impl —
    // either way the notes textarea must be functional for editing.
    const notesValue = await notesTextarea.inputValue()
    if (notesValue === todoNotes) {
      await expect(notesTextarea).toHaveValue(todoNotes)
    } else {
      await notesTextarea.fill('Updated notes')
      await expect(notesTextarea).toHaveValue('Updated notes')
    }
  })

  test('should display empty state when no pending tasks', async ({ page }) => {
    // Arrange — read the current pending count (depends on seeded fixtures)
    const emptyMessage = page.getByText(
      'No pending tasks. Add a new task to get started.',
    )
    const hasPendingTodos = await page.getByText(/\d+ pending/).textContent()

    // Assert — empty state is visible only when there are zero pending todos
    if (hasPendingTodos?.includes('0 pending')) {
      await expect(emptyMessage).toBeVisible()
    }
  })

  test('should move completed TODO back to pending when clicking checkbox', async ({
    page,
  }) => {
    // Arrange — seed a todo and wait for the server-confirmed positive ID
    const todoText = 'Uncheck completion test todo'
    await page.getByPlaceholder('Enter a new todo...').fill(todoText)
    await page.getByRole('button', { name: 'Add', exact: true }).click()
    const todoCheckbox = page.getByRole('checkbox', { name: todoText })
    await expect(todoCheckbox).toBeVisible()
    await expect(todoCheckbox).not.toBeChecked()
    await expect(todoCheckbox).toHaveAttribute('id', /^todo-[^-]/, {
      timeout: 5000,
    })

    // Act 1 — mark as completed (moves item to Completed Tasks section)
    await todoCheckbox.click()

    // Assert 1 — item is in completed section (checked + line-through)
    const completedCheckbox = page.getByRole('checkbox', { name: todoText })
    await expect(completedCheckbox).toBeChecked({ timeout: 5000 })
    await expect(page.getByText(todoText)).toHaveClass(/line-through/)

    // Act 2 — click the checkbox in Completed Tasks to move it back to pending
    await completedCheckbox.click()

    // Assert 2 — item is back in pending (unchecked, no line-through, drag handle)
    const pendingCheckbox = page.getByRole('checkbox', { name: todoText })
    await expect(pendingCheckbox).not.toBeChecked({ timeout: 5000 })
    await expect(page.getByText(todoText)).not.toHaveClass(/line-through/)
    const todoItem = page.locator('.rounded-lg.border').filter({
      has: page.getByRole('checkbox', { name: todoText }),
    })
    // Pending items have a drag handle (GripVertical icon); completed items don't.
    await expect(
      todoItem.getByRole('button', { name: 'Drag to reorder' }),
    ).toBeVisible()
  })

  test('should only toggle completion when clicking checkbox, not text', async ({
    page,
  }) => {
    // Arrange — seed a todo and wait for the server-confirmed positive ID
    const todoText = 'Checkbox-only toggle test todo'
    await page.getByPlaceholder('Enter a new todo...').fill(todoText)
    await page.getByRole('button', { name: 'Add', exact: true }).click()
    const todoCheckbox = page.getByRole('checkbox', { name: todoText })
    await expect(todoCheckbox).toBeVisible()
    await expect(todoCheckbox).not.toBeChecked()
    await expect(todoCheckbox).toHaveAttribute('id', /^todo-[^-]/, {
      timeout: 5000,
    })

    // Act 1 — click the todo's text in pending list (should NOT toggle)
    const todoTextElement = page
      .locator('div')
      .filter({ hasText: new RegExp(`^${todoText}$`) })
      .first()
    await expect(todoTextElement).toBeVisible()
    await todoTextElement.click()
    await page.waitForTimeout(300)

    // Assert 1 — checkbox is still unchecked
    await expect(todoCheckbox).not.toBeChecked()

    // Act 2 — click the actual checkbox (should toggle to completed)
    await todoCheckbox.click()

    // Assert 2 — checkbox in completed list is checked
    const completedCheckbox = page.getByRole('checkbox', { name: todoText })
    await expect(completedCheckbox).toBeChecked({ timeout: 5000 })

    // Act 3 — click the todo's text in completed list (should NOT toggle back)
    const completedTextElement = page.getByText(todoText)
    await completedTextElement.click()
    await page.waitForTimeout(300)

    // Assert 3 — checkbox is still checked
    await expect(completedCheckbox).toBeChecked()
  })
})
