import { setupClerkTestingToken } from '@clerk/testing/playwright'
import { test, expect } from '@playwright/test'

test.describe('Login', () => {
  test('should login with Google', async ({ page }) => {
    await setupClerkTestingToken({ page })
    await page.goto('/home')

    // Clerk's Google Login Component
    const GoogleButton = page.getByRole('button', { name: /Google/ })
    await GoogleButton.click()
    await expect(page.getByText('Sign in with Google')).toBeVisible()
    // Input login user info
    const EmailTextbox = page.getByRole('textbox', { name: 'email or phone' })
    await expect(EmailTextbox).toBeVisible()
    await EmailTextbox.fill(process.env.E2E_CLERK_USER_EMAIL as string)
    await page.getByRole('button', { name: 'Next' }).click()

    await page.waitForLoadState('networkidle')

    // Expect redirect to /home
    await page.waitForURL('**/home')
    await expect(page).toHaveURL(/\/home$/)
    await expect(page.getByText('Home')).toBeVisible()
  })
})
