import { setupClerkTestingToken } from '@clerk/testing/playwright'
import { test as setup } from '@playwright/test'

import { log } from '../src/lib/logger'

setup.describe.configure({ mode: 'serial' })
const authFile = './e2e/.auth/user.json'

setup('authenticate', async ({ page, context }) => {
  if (!process.env.E2E_CLERK_USER_EMAIL)
    throw new Error(
      'Required environment variables E2E_CLERK_USER_EMAIL not found!',
    )
  if (!process.env.E2E_CLERK_USER_USERNAME)
    throw new Error(
      'Required environment variables E2E_CLERK_USER_USERNAME not found!',
    )
  if (!process.env.E2E_CLERK_USER_PASSWORD)
    throw new Error(
      'Required environment variables E2E_CLERK_USER_PASSWORD not found!',
    )
  if (!process.env.CLERK_SECRET_KEY)
    throw new Error(
      'Required environment variables CLERK_SECRET_KEY not found!',
    )

  const email = process.env.E2E_CLERK_USER_EMAIL
  const password = process.env.E2E_CLERK_USER_PASSWORD

  try {
    await setupClerkTestingToken({ page })

    await page.goto('/login', { waitUntil: 'domcontentloaded' })
    await page.waitForLoadState('networkidle')

    const identifierInput = page
      .locator(
        'input[name="identifier"], input[type="email"], input[type="text"]',
      )
      .first()
    await identifierInput.waitFor({ state: 'visible', timeout: 10_000 })
    await identifierInput.fill(email)

    await identifierInput.press('Enter')

    const passwordInput = page.locator('input[type="password"]').first()
    await passwordInput.waitFor({ state: 'visible', timeout: 10_000 })
    await passwordInput.fill(password)

    await passwordInput.press('Enter')

    await page.waitForURL('**/home', {
      waitUntil: 'domcontentloaded',
      timeout: 30_000,
    })

    await page.waitForLoadState('networkidle')
    await page.waitForFunction(
      () =>
        document.body?.innerText?.includes('Tasks') ||
        document.body?.innerText?.includes('Todo List'),
      { timeout: 10_000 },
    )

    await context.storageState({ path: authFile })
    await page.screenshot({ path: './e2e/screenshots/auth-success.png' })
  } catch (error: any) {
    log.error('❌ Authentication failed:', error.message)
    throw error
  }
})
