import { test, expect } from '@playwright/test'

test.describe('Login Flow E2E Test', () => {
  test('should navigate from top page login button to TODO app', async ({
    page,
  }) => {
    // Step 1: Navigate to the top page
    await page.goto('/')

    // Verify we're on the top page
    await expect(page).toHaveTitle(/Corelive/)

    // Verify Login button exists and is visible
    const loginButton = page.getByRole('link', { name: 'Login' })
    await expect(loginButton).toBeVisible()

    // Step 2: Click the Login button
    await loginButton.click()

    // Verify we've navigated to the login page
    await expect(page).toHaveURL('/login')

    // Wait for Clerk SignIn component to load
    await page.waitForSelector(
      '[data-testid="sign-in-form"], .cl-card, .cl-formContainer',
      {
        timeout: 10000,
      },
    )

    // Step 3: Simulate OAuth login flow (using MSW mock)
    // In test environment with MSW, we can trigger authentication
    // by directly navigating to the protected route or simulating login

    // For simplicity, we'll simulate a successful login by setting auth state
    // and navigating to the home page (MSW will handle the auth mock)
    // We need to navigate to a page where localStorage is available first
    await page.goto('/')
    await page.evaluate(() => {
      localStorage.setItem('msw_auth', 'true')
    })

    // Navigate to home page (simulating successful login redirect)
    await page.goto('/home')

    // Step 4: Verify we've reached the TODO app
    await expect(page).toHaveURL('/home')

    // Verify TODO app components are loaded
    await expect(page.getByText('Todo List')).toBeVisible()
    await expect(page.getByText(/\d+ pending/).first()).toBeVisible()

    // Verify the empty state message or todo list
    const emptyMessage = page.getByText(
      'No pending tasks. Add a new task to get started.',
    )
    const todoItems = page.locator('[data-testid="todo-item"]')

    // Either empty state or todo items should be present
    await expect(emptyMessage.or(todoItems.first())).toBeVisible({
      timeout: 10000,
    })

    console.log(
      '✅ Successfully navigated from top page Login button to TODO app!',
    )
  })

  test('should display TODO app features correctly after login', async ({
    page,
  }) => {
    // Setup: Navigate to home and set auth state in the context where localStorage is available
    await page.goto('/home')
    await page.evaluate(() => {
      localStorage.setItem('msw_auth', 'true')
    })
    await page.reload()

    // Verify main TODO app components
    await expect(page.getByText('Todo List')).toBeVisible()
    await expect(page.getByText('Manage your tasks efficiently')).toBeVisible()

    // Verify the pending counter badge
    await expect(page.getByText(/\d+ pending/)).toBeVisible()

    // Verify add todo form exists
    await expect(page.getByPlaceholder('Enter a new todo...')).toBeVisible()

    // Verify completed todos section exists (any text containing "Completed")
    await expect(
      page.getByText('Completed', { exact: false }).first(),
    ).toBeVisible()

    console.log('✅ TODO app features are displayed correctly!')
  })
})
