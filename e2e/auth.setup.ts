import { setupClerkTestingToken, clerk } from '@clerk/testing/playwright'
import { test as setup } from '@playwright/test'

import { log } from '../src/lib/logger'

setup.describe.configure({ mode: 'serial' })
const authFile = './e2e/.auth/user.json'

setup('authenticate', async ({ page, context }) => {
  // Check environment variables
  const username = process.env.E2E_CLERK_USER_USERNAME
  const password = process.env.E2E_CLERK_USER_PASSWORD
  const secretKey = process.env.CLERK_SECRET_KEY

  if (!username || !password || !secretKey) {
    throw new Error('Required environment variables not found!')
  }

  try {
    // Set up testing token explicitly

    await setupClerkTestingToken({ page })

    // Navigate to root page

    await page.goto('/', { waitUntil: 'domcontentloaded' })

    // Small wait for page initialization
    await page.waitForTimeout(2000)

    // Check if Clerk is available without waiting for loaded state
    await page.evaluate(() => {
      return {
        clerkExists: typeof window.Clerk !== 'undefined',
        clerkKeys:
          typeof window.Clerk !== 'undefined' ? Object.keys(window.Clerk) : [],
      }
    })

    // Try sign-in with clerk helper

    try {
      await clerk.signIn({
        page,
        signInParams: {
          strategy: 'password',
          identifier: username,
          password: password,
        },
      })
    } catch {
      // Fallback: Manual sign-in
      await page.goto('/login', { waitUntil: 'domcontentloaded' })
      await page.waitForTimeout(2000)

      // Look for form inputs
      const usernameInput = page
        .locator(
          'input[name="identifier"], input[type="text"], input[type="email"]',
        )
        .first()
      const passwordInput = page.locator('input[type="password"]').first()

      if (
        (await usernameInput.isVisible()) &&
        (await passwordInput.isVisible())
      ) {
        await usernameInput.fill(username)
        await passwordInput.fill(password)

        const submitButton = page.locator('button[type="submit"]').first()
        await submitButton.click()

        await page.waitForTimeout(3000)
      }
    }

    // Wait for authentication to complete and redirects
    await page.waitForTimeout(3000)

    // Check where we are now
    page.url()

    // Navigate to protected route to verify authentication

    await page.goto('/home', { waitUntil: 'networkidle' })

    // Final verification
    const finalUrl = page.url()

    if (finalUrl.includes('/home')) {
      // Save the authenticated state
      await context.storageState({ path: authFile })

      // Take success screenshot
      await page.screenshot({ path: './e2e/screenshots/auth-success.png' })
    } else if (finalUrl.includes('/login') || finalUrl.includes('/sign-in')) {
      throw new Error('Authentication failed - redirected to login page')
    } else {
      // Still save state as authentication might have worked
      await context.storageState({ path: authFile })
    }
  } catch (error: any) {
    log.error('❌ Authentication failed:', error.message)

    // Take debug screenshot
    await page
      .screenshot({
        path: './e2e/screenshots/auth-debug.png',
        fullPage: true,
      })
      .catch(() => {})

    // Log additional error details
    if (error.message.includes('page.waitForFunction')) {
    }

    // Additional debugging info

    throw error
  }
})
