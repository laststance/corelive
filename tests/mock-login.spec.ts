import { test, expect } from '@playwright/test'

async function waitForUserInserted() {
  // Poll the API webhook endpoint indirectly by calling a helper endpoint or
  // simply wait for a short time as insertion happens on callback.
  // For now, just wait a bit to allow the webhook to complete.
  await new Promise((resolve) => setTimeout(resolve, 500))
}

test.describe('Mock Google OAuth login (MSW enabled)', () => {
  test.beforeAll(async () => {
    process.env.NEXT_PUBLIC_ENABLE_MSW_MOCK = 'true'
  })

  test('click Google and land on /home without external redirect', async ({ page }) => {
    await page.goto('/')
    await page.getByRole('link', { name: 'Login' }).click()

    // Click the Google button; our client-side interceptor will route to /api/mock-auth
    await page.getByRole('button', { name: /google/i }).click()

    // Expect redirect to /home
    await page.waitForURL('**/home')
    await expect(page).toHaveURL(/\/home$/)
    await expect(page.getByText('Home')).toBeVisible()

    // Give some time for the webhook to insert the user
    await waitForUserInserted()
  })
})


