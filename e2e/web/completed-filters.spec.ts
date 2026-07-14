import { setupClerkTestingToken } from '@clerk/testing/playwright'
import { type Page } from '@playwright/test'

import { prisma } from '@/lib/prisma'

import { SEED_USER_CLERK_ID } from '../../prisma/seedUser'

import { test, expect } from './_helpers/coverage'
import { resetDatabase } from './_helpers/db'

const FIXED_BROWSER_TIME = new Date('2026-07-14T12:00:00.000Z')
const COMPLETED_TASKS_READY_TIMEOUT_MS = 10_000
const CUSTOM_POPOVER_QA_VIEWPORT_WIDTH_PX = 1_382
const CUSTOM_POPOVER_QA_VIEWPORT_HEIGHT_PX = 770
const FILTER_CATEGORY_NAME = 'Filter Focus'
const EMPTY_FILTER_CATEGORY_NAME = 'Quiet Archive'
const FIXTURE_TITLES = [
  'Week General completed win',
  'Week Focus todo win',
  'Month Focus completed win',
  'Recent General todo win',
  'Year Focus completed win',
  'Last year General todo win',
] as const

/**
 * Seeds a retry-safe cross-source journal whose fixed dates make every Warm Preset count observable.
 * @returns Nothing after the six wins and secondary category are persisted for the seeded Clerk user.
 * @example
 * await seedCompletedFilterFixtures()
 */
async function seedCompletedFilterFixtures(): Promise<void> {
  const user = await prisma.user.findUniqueOrThrow({
    where: { clerkId: SEED_USER_CLERK_ID },
  })
  const generalCategory = await prisma.category.findFirstOrThrow({
    where: { userId: user.id, isDefault: true },
  })
  const focusCategory = await prisma.category.upsert({
    where: {
      name_userId: { name: FILTER_CATEGORY_NAME, userId: user.id },
    },
    update: { color: 'amber' },
    create: {
      name: FILTER_CATEGORY_NAME,
      color: 'amber',
      userId: user.id,
    },
  })
  await prisma.category.upsert({
    where: {
      name_userId: { name: EMPTY_FILTER_CATEGORY_NAME, userId: user.id },
    },
    update: { color: 'violet' },
    create: {
      name: EMPTY_FILTER_CATEGORY_NAME,
      color: 'violet',
      userId: user.id,
    },
  })

  // CI retries may rerun beforeAll without a per-spec reset, so titles are the idempotency key.
  await prisma.$transaction([
    prisma.completed.deleteMany({
      where: { userId: user.id, title: { in: [...FIXTURE_TITLES] } },
    }),
    prisma.todo.deleteMany({
      where: { userId: user.id, text: { in: [...FIXTURE_TITLES] } },
    }),
  ])

  await prisma.$transaction([
    prisma.completed.createMany({
      data: [
        {
          title: 'Week General completed win',
          completedAt: new Date('2026-07-14T09:00:00.000Z'),
          categoryId: generalCategory.id,
          userId: user.id,
        },
        {
          title: 'Month Focus completed win',
          completedAt: new Date('2026-07-05T09:00:00.000Z'),
          categoryId: focusCategory.id,
          userId: user.id,
        },
        {
          title: 'Year Focus completed win',
          completedAt: new Date('2026-02-10T09:00:00.000Z'),
          categoryId: focusCategory.id,
          userId: user.id,
        },
      ],
    }),
    prisma.todo.createMany({
      data: [
        {
          text: 'Week Focus todo win',
          completed: true,
          completedAt: new Date('2026-07-13T09:00:00.000Z'),
          categoryId: focusCategory.id,
          userId: user.id,
        },
        {
          text: 'Recent General todo win',
          completed: true,
          completedAt: new Date('2026-06-20T09:00:00.000Z'),
          categoryId: generalCategory.id,
          userId: user.id,
        },
        {
          text: 'Last year General todo win',
          completed: true,
          completedAt: new Date('2025-12-20T09:00:00.000Z'),
          categoryId: generalCategory.id,
          userId: user.id,
        },
      ],
    }),
  ])
}

/**
 * Waits until the authenticated Home surface and its Completed region finish their initial query.
 * @param page - Authenticated Playwright page under test.
 * @returns Nothing once the deterministic six-win journal is visible.
 * @example
 * await waitForCompletedTasks(page)
 */
async function waitForCompletedTasks(page: Page): Promise<void> {
  await expect(page).toHaveURL(/\/home\/?$/)
  await expect(page.getByText('Todo List')).toBeVisible({
    timeout: COMPLETED_TASKS_READY_TIMEOUT_MS,
  })
  await expect(
    page
      .getByRole('region', { name: 'Completed Tasks' })
      .getByLabel('6 completed tasks in current view'),
  ).toBeVisible({ timeout: COMPLETED_TASKS_READY_TIMEOUT_MS })
}

test.describe('Completed Tasks Warm Preset Bar', () => {
  test.beforeAll(async () => {
    await resetDatabase()
    await seedCompletedFilterFixtures()
  })

  test.afterAll(async () => {
    await prisma.$disconnect()
  })

  test.beforeEach(async ({ page }) => {
    await setupClerkTestingToken({ page })
    await page.clock.setFixedTime(FIXED_BROWSER_TIME)
    // Clerk-owned images can keep the load event open; the app is ready at DOMContentLoaded.
    await page.goto('/home', { waitUntil: 'domcontentloaded' })
    await waitForCompletedTasks(page)
  })

  test('shows only wins inside the selected calendar period', async ({
    page,
  }) => {
    // Arrange
    const completed = page.getByRole('region', { name: 'Completed Tasks' })

    // Act — choose the visible weekly preset.
    await completed.getByLabel('Show wins completed this week').click()

    // Assert — wait on the server-backed count before checking row absence.
    await expect(
      completed.getByLabel('2 completed tasks in current view'),
    ).toBeVisible()
    await expect(
      completed.getByText('Week General completed win', { exact: true }),
    ).toBeVisible()
    await expect(
      completed.getByText('Week Focus todo win', { exact: true }),
    ).toBeVisible()
    await expect(
      completed.getByText('Month Focus completed win', { exact: true }),
    ).toHaveCount(0)

    // Act — widen to this calendar month.
    await completed.getByLabel('Show wins completed this month').click()

    // Assert
    await expect(
      completed.getByLabel('3 completed tasks in current view'),
    ).toBeVisible()
    await expect(
      completed.getByText('Month Focus completed win', { exact: true }),
    ).toBeVisible()
    await expect(
      completed.getByText('Recent General todo win', { exact: true }),
    ).toHaveCount(0)
  })

  test('applies the additional periods from More', async ({ page }) => {
    // Arrange
    const completed = page.getByRole('region', { name: 'Completed Tasks' })
    const morePeriods = completed.getByRole('button', {
      name: /Choose another completion period/,
    })

    // Act — choose the rolling calendar-day preset.
    await morePeriods.click()
    await page
      .getByRole('button', { name: 'Last 30 days', exact: true })
      .click()

    // Assert
    await expect(
      completed.getByLabel('4 completed tasks in current view'),
    ).toBeVisible()
    await expect(
      completed.getByText('Recent General todo win', { exact: true }),
    ).toBeVisible()
    await expect(
      completed.getByText('Year Focus completed win', { exact: true }),
    ).toHaveCount(0)

    // Act — switch to the calendar year from the same More trigger.
    await morePeriods.click()
    await page.getByRole('button', { name: 'This year', exact: true }).click()

    // Assert
    await expect(
      completed.getByLabel('5 completed tasks in current view'),
    ).toBeVisible()
    await expect(
      completed.getByText('Year Focus completed win', { exact: true }),
    ).toBeVisible()
    await expect(
      completed.getByText('Last year General todo win', { exact: true }),
    ).toHaveCount(0)
  })

  test('keeps the Custom picker inside the viewport and applies its inclusive range only after both dates are chosen', async ({
    page,
  }) => {
    // Arrange — match the local QA viewport that exposed top-side clipping.
    await page.setViewportSize({
      width: CUSTOM_POPOVER_QA_VIEWPORT_WIDTH_PX,
      height: CUSTOM_POPOVER_QA_VIEWPORT_HEIGHT_PX,
    })
    const completed = page.getByRole('region', { name: 'Completed Tasks' })
    const morePeriods = completed.getByRole('button', {
      name: /Choose another completion period/,
    })

    // Act — open Custom without changing the active All query.
    await morePeriods.click()
    await page
      .getByRole('button', { name: 'Custom range', exact: true })
      .click()
    const applyRange = page.getByRole('button', { name: 'Apply range' })
    const customRangeDialog = page.getByRole('dialog')

    // Assert — the focused second view fits inside the viewport and cannot affect the journal yet.
    await expect(page.getByText('More periods')).toBeHidden()
    expect(
      await customRangeDialog.evaluate((dialog) => {
        const bounds = dialog.getBoundingClientRect()
        return bounds.top >= 0 && bounds.bottom <= window.innerHeight
      }),
    ).toBe(true)
    await expect(applyRange).toBeDisabled()
    await expect(
      completed.getByLabel('6 completed tasks in current view'),
    ).toBeVisible()

    // Act — DayPicker ranges include both selected calendar days.
    await page.getByRole('button', { name: 'Sunday, July 5th, 2026' }).click()
    await expect(applyRange).toBeDisabled()
    await page.getByRole('button', { name: 'Monday, July 13th, 2026' }).click()
    await expect(applyRange).toBeEnabled()
    await applyRange.click()

    // Assert — July 5 and 13 remain; July 14 proves the exclusive server upper bound.
    await expect(
      completed.getByLabel('2 completed tasks in current view'),
    ).toBeVisible()
    await expect(
      completed.getByText('Month Focus completed win', { exact: true }),
    ).toBeVisible()
    await expect(
      completed.getByText('Week Focus todo win', { exact: true }),
    ).toBeVisible()
    await expect(
      completed.getByText('Week General completed win', { exact: true }),
    ).toHaveCount(0)
    await expect(morePeriods).toHaveAccessibleName(
      'Choose another completion period, current: Jul 5 – Jul 13',
    )
  })

  test('opens More choices after Custom is applied, supports Back, and Cancel preserves the range', async ({
    page,
  }) => {
    // Arrange — apply a Custom range so reopening behavior is observable.
    const completed = page.getByRole('region', { name: 'Completed Tasks' })
    const morePeriods = completed.getByRole('button', {
      name: /Choose another completion period/,
    })
    await morePeriods.click()
    await page
      .getByRole('button', { name: 'Custom range', exact: true })
      .click()
    await page.getByRole('button', { name: 'Sunday, July 5th, 2026' }).click()
    await page.getByRole('button', { name: 'Monday, July 13th, 2026' }).click()
    await page.getByRole('button', { name: 'Apply range' }).click()
    await expect(
      completed.getByLabel('2 completed tasks in current view'),
    ).toBeVisible()

    // Act — reopen the secondary period trigger after Custom is active.
    await morePeriods.click()

    // Assert — the trigger starts at choices instead of trapping users in the editor.
    await expect(page.getByText('More periods')).toBeVisible()

    // Act — enter the prefilled editor and explicitly return to the choices.
    await page
      .getByRole('button', { name: 'Custom range', exact: true })
      .click()
    await page.getByRole('button', { name: 'Back to period choices' }).click()

    // Assert
    await expect(page.getByText('More periods')).toBeVisible()

    // Act — cancel the same prefilled editor without applying another range.
    await page
      .getByRole('button', { name: 'Custom range', exact: true })
      .click()
    await page.getByRole('button', { name: 'Cancel', exact: true }).click()

    // Assert — Cancel dismisses the popover and retains the applied range and results.
    await expect(page.getByRole('dialog')).toHaveCount(0)
    await expect(morePeriods).toHaveAccessibleName(
      'Choose another completion period, current: Jul 5 – Jul 13',
    )
    await expect(
      completed.getByLabel('2 completed tasks in current view'),
    ).toBeVisible()
  })

  test('keeps controls in the filtered-empty state and Clear restores every win', async ({
    page,
  }) => {
    // Arrange
    const completed = page.getByRole('region', { name: 'Completed Tasks' })
    await completed.getByLabel('Show wins completed this month').click()
    await expect(
      completed.getByLabel('3 completed tasks in current view'),
    ).toBeVisible()

    // Act — combine the month with an independent Completed-only category.
    const categorySelect = completed.getByRole('combobox', {
      name: 'Filter wins by category',
    })
    await categorySelect.click()
    await page.getByRole('option', { name: FILTER_CATEGORY_NAME }).click()

    // Assert
    await expect(
      completed.getByLabel('2 completed tasks in current view'),
    ).toBeVisible()
    await expect(
      completed.getByText('Week Focus todo win', { exact: true }),
    ).toBeVisible()
    await expect(
      completed.getByText('Month Focus completed win', { exact: true }),
    ).toBeVisible()
    await expect(
      completed.getByText('Week General completed win', { exact: true }),
    ).toHaveCount(0)

    // Act — choose a real category with no wins in this month.
    await categorySelect.click()
    await page.getByRole('option', { name: EMPTY_FILTER_CATEGORY_NAME }).click()

    // Assert — the reassuring empty state preserves every filter control.
    await expect(
      completed.getByLabel('0 completed tasks in current view'),
    ).toBeVisible()
    await expect(completed.getByText('No wins in this view yet')).toBeVisible()
    await expect(
      completed.getByLabel('Show wins completed this month'),
    ).toBeVisible()
    await expect(categorySelect).toHaveText(EMPTY_FILTER_CATEGORY_NAME)
    const clearFilters = completed.getByRole('button', {
      name: 'Clear filters',
      exact: true,
    })
    await expect(clearFilters).toBeVisible()

    // Act — restore both dimensions from the filtered-empty recovery action.
    await clearFilters.click()

    // Assert
    await expect(
      completed.getByLabel('6 completed tasks in current view'),
    ).toBeVisible()
    await expect(
      completed.getByLabel('Show all completed wins'),
    ).toHaveAttribute('data-state', 'on')
    await expect(categorySelect).toHaveText('All categories')
    for (const title of FIXTURE_TITLES) {
      await expect(completed.getByText(title, { exact: true })).toBeVisible()
    }
  })
})
