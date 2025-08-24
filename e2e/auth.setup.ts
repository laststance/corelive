import { test as setup, expect } from '@playwright/test'

const authFile = 'playwright/.auth/user.json'

setup('authenticate', async ({ page }) => {
  // Navigate to the root page first to initialize MSW
  await page.goto('/')

  // Wait a moment for MSW to initialize
  await page.waitForTimeout(1000)

  // Set MSW authentication state to simulate successful login
  await page.evaluate(() => {
    localStorage.setItem('msw_auth', 'true')
  })

  // Navigate to the home page to verify authentication works
  await page.goto('/home')

  // Verify we've successfully reached the authenticated TODO app
  await expect(page).toHaveURL('/home')
  await expect(page).toHaveTitle('Home | Corelive')

  // Verify main TODO app components are loaded and visible
  await expect(page.getByText('Todo List')).toBeVisible()
  await expect(page.getByText(/\d+ pending/)).toBeVisible()

  // Verify authentication-specific elements are present
  await expect(page.getByPlaceholder('Enter a new todo...')).toBeVisible()

  // Save the authenticated state for reuse in other tests
  await page.context().storageState({ path: authFile })
})
