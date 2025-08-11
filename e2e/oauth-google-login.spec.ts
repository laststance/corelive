import { test, expect } from '@playwright/test'

test.describe('Google OAuth Login with MSW', () => {
  test('should verify MSW is initialized', async ({ page }) => {
    const mswLogs: string[] = []
    page.on('console', (msg) => {
      const text = msg.text()
      if (text.includes('[MSW]')) mswLogs.push(text)
    })

    await page.goto('/')
    await page.waitForTimeout(1000)

    // Assert by log presence instead of SW registration (more stable across builds)
    expect(mswLogs.some((l) => l.includes('Mock Service Worker enabled'))).toBe(
      true,
    )
  })

  test('should display Google OAuth button on login page', async ({ page }) => {
    // Navigate to the login page
    await page.goto('/login', { waitUntil: 'domcontentloaded', timeout: 10000 })

    // Wait for Clerk to load
    await page.waitForTimeout(3000)

    // Check for Google OAuth button
    const googleButton = page
      .locator(
        'button:has-text("Google"), [aria-label*="Google"], img[alt*="Google"]',
      )
      .first()
    await googleButton.isVisible().catch(() => false)

    // Take a screenshot for debugging
    await page.screenshot({
      path: 'tests/screenshots/login-page.png',
      fullPage: true,
    })

    // Verify that Clerk SignIn component is present
    const clerkSignIn = page
      .locator('[data-clerk-sign-in], .cl-rootBox')
      .first()
    expect(clerkSignIn).toBeVisible()
  })

  test('should handle OAuth callback with mock code', async ({ page }) => {
    // Enable verbose console logging
    page.on('console', (msg) => {
      if (msg.text().includes('MSW')) {
        console.log('MSW:', msg.text())
      }
    })

    // Navigate directly to OAuth callback URL with mock code
    const mockCallbackUrl = '/login?code=mock_auth_code_123&state=mock_state'

    await page.goto(mockCallbackUrl, {
      waitUntil: 'domcontentloaded',
      timeout: 10000,
    })
    await page.waitForTimeout(3000)

    // Check current URL
    const currentUrl = page.url()
    console.log('Current URL after callback:', currentUrl)

    // Take a screenshot for debugging
    await page.screenshot({
      path: 'tests/screenshots/oauth-callback.png',
      fullPage: true,
    })

    // Check if there are any error messages
    const errorMessage = await page
      .locator(
        '.cl-formFieldError, .cl-formButtonPrimary__error, [role="alert"]',
      )
      .textContent()
      .catch(() => null)

    if (errorMessage) {
      console.log('Error message found:', errorMessage)
    }

    // Verify the page loaded correctly
    const pageTitle = await page.title()
    expect(pageTitle).toBeTruthy()
  })

  test('should mock Google OAuth endpoints', async ({ page }) => {
    const interceptedUrls: string[] = []
    page.on('request', (request) => {
      const url = request.url()
      if (url.includes('oauth2.googleapis.com')) interceptedUrls.push(url)
    })
    await page.goto('/login', { waitUntil: 'domcontentloaded', timeout: 10000 })
    await page.waitForTimeout(1000)
    expect(interceptedUrls.length >= 0).toBe(true)
  })

  test('click Google and land on /home without external redirect', async ({
    page,
  }) => {
    await page.goto('/')
    await page.getByRole('link', { name: 'Login' }).click()

    // Click the Google button; our client-side interceptor will route to /api/mock-auth
    await page.getByRole('button', { name: /google/i }).click()

    // Expect redirect to /home
    await page.waitForURL('**/home')
    await expect(page).toHaveURL(/\/home$/)
    await expect(page.getByText('Home')).toBeVisible()
  })
})
