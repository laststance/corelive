import { test } from '@playwright/test'

test.describe('Debug Authentication', () => {
  test('check login page and credentials', async ({ page }) => {
    // Navigate to the login page directly
    await page.goto('/login')

    // Wait for the page to load (less strict)
    await page.waitForLoadState('domcontentloaded')
    await page.waitForTimeout(1000)

    console.log('Login page URL:', page.url())
    console.log('Page title:', await page.title())

    // Take a screenshot to see what the login page looks like
    await page.screenshot({
      path: 'e2e/screenshots/debug-login-page.png',
      fullPage: true,
    })

    // Check if this is actually a Clerk hosted page
    const isClerkHosted =
      page.url().includes('clerk') || page.url().includes('accounts')
    console.log('Is Clerk hosted page:', isClerkHosted)

    if (isClerkHosted) {
      console.log(
        'This is a Clerk hosted login page - different structure expected',
      )

      // For Clerk hosted pages, look for different selectors
      const emailInput = page
        .locator('input[type="email"], input[name="email"]')
        .first()
      const passwordInput = page.locator('input[type="password"]').first()
      const signInButton = page
        .locator(
          'button:has-text("Sign in"), button:has-text("Continue"), button[type="submit"]',
        )
        .first()

      console.log('Found email input:', (await emailInput.count()) > 0)
      console.log('Found password input:', (await passwordInput.count()) > 0)
      console.log('Found sign in button:', (await signInButton.count()) > 0)

      if ((await emailInput.count()) > 0) {
        console.log('Filling Clerk hosted credentials...')
        await emailInput.fill(process.env.E2E_CLERK_USER_USERNAME!)
        await passwordInput.fill(process.env.E2E_CLERK_USER_PASSWORD!)
        await signInButton.click()

        // Wait to see what happens
        await page.waitForTimeout(3000)
        console.log('After login attempt - URL:', page.url())

        // Take another screenshot
        await page.screenshot({
          path: 'e2e/screenshots/debug-after-login.png',
          fullPage: true,
        })

        // Check for error messages
        const errorMessages = page
          .locator('[role="alert"], .error, .cl-error, [data-error]')
          .allTextContents()
        console.log('Error messages:', await errorMessages)
      }
    } else {
      // Try to find login form elements for custom login page
      const identifierInput = page
        .locator(
          'input[name="identifier"], input[type="email"], input[type="text"]',
        )
        .first()
      const passwordInput = page.locator('input[type="password"]').first()
      const submitButton = page
        .locator(
          'button[type="submit"], button:has-text("Sign in"), button:has-text("Continue")',
        )
        .first()

      console.log(
        'Found identifier input:',
        (await identifierInput.count()) > 0,
      )
      console.log('Found password input:', (await passwordInput.count()) > 0)
      console.log('Found submit button:', (await submitButton.count()) > 0)

      if ((await identifierInput.count()) > 0) {
        console.log('Filling custom login credentials...')
        await identifierInput.fill(process.env.E2E_CLERK_USER_USERNAME!)
        await passwordInput.fill(process.env.E2E_CLERK_USER_PASSWORD!)
        await submitButton.click()

        // Wait to see what happens
        await page.waitForTimeout(3000)
        console.log('After login attempt - URL:', page.url())

        // Take another screenshot
        await page.screenshot({
          path: 'e2e/screenshots/debug-after-login.png',
          fullPage: true,
        })

        // Check for error messages
        const errorMessages = page
          .locator('[role="alert"], .error, .cl-error, [data-error]')
          .allTextContents()
        console.log('Error messages:', await errorMessages)
      } else {
        console.log('Login form not found - taking screenshot of current state')
        await page.screenshot({
          path: 'e2e/screenshots/debug-no-form.png',
          fullPage: true,
        })
      }
    }
  })

  test('check home page protection', async ({ page }) => {
    // Navigate directly to home
    await page.goto('/home')

    // Wait and see what happens
    await page.waitForTimeout(2000)
    console.log('Home page navigation result - URL:', page.url())

    await page.screenshot({
      path: 'e2e/screenshots/debug-home-redirect.png',
      fullPage: true,
    })
  })
})
