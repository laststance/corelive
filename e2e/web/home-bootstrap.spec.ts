import { setupClerkTestingToken } from '@clerk/testing/playwright'

import {
  HOME_SELECTED_CATEGORY_COOKIE_NAME,
  HOME_TIMEZONE_COOKIE_NAME,
} from '../../src/lib/constants/home'
import { PERSISTED_QUERY_STORAGE_KEY } from '../../src/lib/constants/query'

import { expect, test } from './_helpers/coverage'
import { resetDatabase } from './_helpers/db'

test.describe('Home bootstrap', () => {
  test.beforeAll(resetDatabase)

  test('first Home visit renders the default category without browser oRPC requests', async ({
    page,
  }) => {
    // Arrange
    await setupClerkTestingToken({ page })
    await page.context().clearCookies({
      name: HOME_SELECTED_CATEGORY_COOKIE_NAME,
    })
    await page.context().clearCookies({ name: HOME_TIMEZONE_COOKIE_NAME })
    await page.addInitScript(
      ({ offlineCacheKey, selectedCategoryKey }) => {
        localStorage.removeItem(offlineCacheKey)
        localStorage.removeItem(selectedCategoryKey)
      },
      {
        offlineCacheKey: PERSISTED_QUERY_STORAGE_KEY,
        selectedCategoryKey: HOME_SELECTED_CATEGORY_COOKIE_NAME,
      },
    )
    const browserOrpcRequests: string[] = []
    page.on('request', (request) => {
      if (request.url().includes('/api/orpc')) {
        browserOrpcRequests.push(request.url())
      }
    })

    // Act
    await page.goto('/home')

    // Assert
    await expect(page.getByText('Todo List')).toBeVisible({ timeout: 10000 })
    await expect(
      page
        .locator('[data-slot="sidebar-menu-button"]')
        .filter({ hasText: 'General' }),
    ).toHaveAttribute('data-active', 'true')
    await expect(
      page.getByRole('region', { name: 'Completed Tasks' }),
    ).toBeVisible()
    expect(browserOrpcRequests).toEqual([])
  })
})
