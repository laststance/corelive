import { setupClerkTestingToken } from '@clerk/testing/playwright'

import { test, expect } from './_helpers/coverage'

/**
 * Sidebar client-navigation regression coverage.
 *
 * Guards the bug where leaving /home was impossible: an unstable `useMemo`-less
 * `pendingTodosFromQuery` in TodoList fed a sync effect whose dependency changed
 * on every render, so `setLocalPendingTodos` re-rendered forever. That continuous
 * high-priority render loop starved App Router's low-priority navigation
 * transition — clicking the sidebar Preferences (router.push) or Skill Tree
 * (<Link>) entry fetched the destination RSC but never committed, so the URL
 * stayed on /home (the user saw the Settings entry "do nothing").
 *
 * These tests CLICK the real sidebar entries — NOT `page.goto` — because only a
 * click exercises the transition path that was starved. (A sibling commit had
 * previously swapped the skill-tree happy-path from a click to `page.goto` to
 * dodge this very flakiness, masking the bug at the test layer.) Before the fix
 * they fail with the URL still on /home; after it they pass.
 *
 * Root cause + fix: TodoList.tsx — `categoryMap` / `pendingTodosFromQuery` are
 * memoized and `mapTodos` is hoisted to module scope so the effect deps are
 * referentially stable. Investigated 2026-06-24.
 */
test.describe('Sidebar navigation from /home', () => {
  test.beforeEach(async ({ page }) => {
    // storageState (e2e/.auth/user.json) carries the authenticated session; the
    // testing token additionally bypasses Clerk bot detection for headless runs.
    await setupClerkTestingToken({ page })
  })

  test('Preferences button leaves /home and opens Settings', async ({
    page,
  }) => {
    // Arrange — land on /home and wait until TodoList (the loop source) has
    // mounted, so the navigation transition is exercised under real conditions.
    await page.goto('/home')
    await expect(
      page.getByPlaceholder('Type a todo, or paste a list...'),
    ).toBeVisible({
      timeout: 15000,
    })
    await expect(page).toHaveURL(/\/home/)

    // Act — click the sidebar Preferences entry, which calls router.push('/settings').
    await page.getByRole('button', { name: /preferences/i }).click()

    // Assert — the client navigation actually commits; the URL changes off /home.
    await expect(page).toHaveURL(/\/settings/, { timeout: 10000 })
  })

  test('Skill Tree link leaves /home and opens the skill tree', async ({
    page,
  }) => {
    // Arrange — land on /home and wait for the loop-source component to mount.
    await page.goto('/home')
    await expect(
      page.getByPlaceholder('Type a todo, or paste a list...'),
    ).toBeVisible({
      timeout: 15000,
    })
    await expect(page).toHaveURL(/\/home/)

    // Act — click the sidebar Skill Tree entry (<Link href="/skill-tree">).
    await page.getByRole('link', { name: /skill tree/i }).click()

    // Assert — the client navigation actually commits; the URL changes off /home.
    await expect(page).toHaveURL(/\/skill-tree/, { timeout: 10000 })
  })
})
