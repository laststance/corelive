import { setupClerkTestingToken } from '@clerk/testing/playwright'

import { test, expect } from './_helpers/coverage'
import { resetDatabase } from './_helpers/db'

const TOGGLE_TODO_PATH = '/api/orpc/todo/toggle'
const SETTINGS_STORAGE_KEY = 'corelive-redux-state'

test.describe('Completed task strikethrough setting', () => {
  test.beforeAll(resetDatabase)

  test.beforeEach(async ({ page }) => {
    await setupClerkTestingToken({ page })
  })

  test('shows completed titles without a line after the setting is turned off', async ({
    page,
  }, testInfo) => {
    // Real Clerk + create/toggle mutations + reload can approach the 30s default on this Mac.
    test.slow()

    // Arrange — opt out through the real Settings switch and confirm it persists.
    await page.goto('/settings')
    const strikethroughSwitch = page.getByRole('switch', {
      name: 'Show strikethrough on completed tasks',
    })
    await expect(strikethroughSwitch).toBeChecked()
    await strikethroughSwitch.click()
    await expect(strikethroughSwitch).not.toBeChecked()
    // Persistence is debounced; leaving Settings before this write loses the change.
    await expect
      .poll(
        async () =>
          (
            await page.evaluate(
              (storageKey) => localStorage.getItem(storageKey),
              SETTINGS_STORAGE_KEY,
            )
          )?.includes('"showCompletedTaskStrikethrough":false') ?? false,
        { timeout: 5000 },
      )
      .toBe(true)

    await page.goto('/home')
    // A retry gets a fresh browser context but keeps database rows from the first attempt.
    const todoText = `Readable completed win ${testInfo.retry}`
    await page
      .getByPlaceholder('Type a todo, or paste a list...')
      .fill(todoText)
    await page.getByRole('button', { name: 'Add', exact: true }).click()
    const todoCheckbox = page.getByRole('checkbox', { name: todoText })
    await expect(todoCheckbox).toHaveAttribute('id', /^todo-[^-]/, {
      timeout: 5000,
    })

    // Act — complete the task, then reload to prove the saved setting still wins.
    const togglePromise = page.waitForResponse(
      (response) =>
        response.url().includes(TOGGLE_TODO_PATH) &&
        response.request().method() === 'POST',
      { timeout: 10000 },
    )
    await todoCheckbox.click()
    expect((await togglePromise).status()).toBe(200)
    await page.reload()

    // Assert — the win remains in Completed with its title readable and unlined.
    const completedTitle = page.getByText(todoText, { exact: true })
    await expect(completedTitle).toBeVisible({ timeout: 10000 })
    await expect(completedTitle).not.toHaveClass(/line-through/)
    await expect(completedTitle).toHaveClass(/text-muted-foreground/)
  })
})
