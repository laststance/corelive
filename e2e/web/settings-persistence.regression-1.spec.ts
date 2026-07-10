import { setupClerkTestingToken } from '@clerk/testing/playwright'

import { STORAGE_SCHEMA_VERSION } from '@/lib/redux/migratePersistedState'

import { test, expect } from './_helpers/coverage'

const STORAGE_KEY = 'corelive-redux-state'

/** Builds a persisted state whose non-default task setting must win after SSR hydration.
 * @returns The versioned localStorage payload consumed by the production store.
 * @example
 * seedRetainedTasksSetting() // => settings.retainCompletedInList is true
 */
function seedRetainedTasksSetting(): string {
  return JSON.stringify({
    version: STORAGE_SCHEMA_VERSION,
    state: { settings: { retainCompletedInList: true } },
  })
}

test('restores a saved task setting after the Settings page reloads', async ({
  page,
}) => {
  // Regression: ISSUE-001 — SSR defaults hid the localStorage state after hydration.
  // Found by /qa on 2026-07-10
  // Report: .gstack/qa-reports/qa-report-localhost-2026-07-10.md

  // Arrange — install auth and a non-default setting before any app script runs.
  await setupClerkTestingToken({ page })
  await page.addInitScript(
    ({ storageKey, payload }) => localStorage.setItem(storageKey, payload),
    { storageKey: STORAGE_KEY, payload: seedRetainedTasksSetting() },
  )

  // Act — open the server-rendered Settings page, then perform a real reload.
  await page.goto('/settings')
  await page.reload()

  // Assert — React Redux publishes the restored client state, not the SSR default.
  await expect(
    page.getByRole('switch', { name: 'Keep finished tasks in the list' }),
  ).toBeChecked()
})
