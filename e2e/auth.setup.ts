import { test as setup, expect } from '@playwright/test'

const authFile = './e2e/.auth/user.json'

setup('authenticate', async ({ page }) => {
  // Navigate to the root page first
  await page.goto('/')

  // Navigate to the home page to verify authentication works
  await page.goto('/home')

  // Verify we've successfully reached the authenticated TODO app
  await expect(page).toHaveURL('/home')
  await expect(page).toHaveTitle('Corelive')

  // Verify main TODO app components are loaded and visible
  await expect(page.getByText('Todo List')).toBeVisible()
  await expect(page.getByText(/\d+ pending/)).toBeVisible()

  // Verify authentication-specific elements are present
  await expect(page.getByPlaceholder('Enter a new todo...')).toBeVisible()

  // Save the authenticated state for reuse in other tests
  await page.context().storageState({ path: authFile })
})
