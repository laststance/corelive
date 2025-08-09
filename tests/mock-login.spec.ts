import { test, expect } from '@playwright/test'

async function waitForUserInserted() {
  await new Promise((resolve) => setTimeout(resolve, 800))
}

test.describe('Mock Google OAuth login (MSW enabled)', () => {
  test('click Google and land on /home without external redirect', async ({ page }) => {
    await page.goto('/')
    await page.getByRole('link', { name: 'Login' }).click()

    // Click the Google button; our client-side interceptor will route to /api/mock-auth
    await page.getByRole('button', { name: /google/i }).click()

    // Expect redirect to /home
    await page.waitForURL('**/home')
    await expect(page).toHaveURL(/\/home$/)
    await expect(page.getByText('Home')).toBeVisible()

    // Give some time for MSW to post the webhook and the server to insert the user
    await waitForUserInserted()
  })
})


