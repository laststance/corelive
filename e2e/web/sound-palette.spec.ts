import { setupClerkTestingToken } from '@clerk/testing/playwright'
import { type Page } from '@playwright/test'

import { STORAGE_SCHEMA_VERSION } from '@/lib/redux/migratePersistedState'

import { test, expect } from './_helpers/coverage'
import { resetDatabase } from './_helpers/db'

/**
 * Globals the browser-side instrumentation installs. `__soundCueFired` counts how
 * many times the Web Audio engine actually scheduled a cue (`.start()`), so a
 * headless CI run can prove the cue fired without listening to audio.
 */
declare global {
  interface Window {
    __soundCueFired?: number
    __soundCueInstrumented?: boolean
  }
}

/** localStorage key the Redux store persists settings under (store.ts). */
const STORAGE_KEY = 'corelive-redux-state'

/**
 * Builds the persisted Redux blob the app rehydrates on load, with the complete
 * moment ON or OFF. Stored at the CURRENT schema version so the hydration
 * migration is a no-op and the settings land verbatim — exactly what a user
 * who toggled the setting would have on disk.
 * @param completeMomentEnabled - Whether the 'complete' cue should play.
 * @returns The JSON string to write into localStorage before the app boots.
 * @example
 * seedSettings(true)  // complete cue plays on completion
 * seedSettings(false) // app stays silent
 */
function seedSettings(completeMomentEnabled: boolean): string {
  return JSON.stringify({
    // Seed at the CURRENT schema version (imported, not hardcoded) so the
    // hydration migration is a no-op and soundMoments lands as written — and so
    // a future STORAGE_SCHEMA_VERSION bump can't silently desync this fixture.
    version: STORAGE_SCHEMA_VERSION,
    state: {
      settings: {
        completionSound: false,
        retainCompletedInList: false,
        soundMoments: {
          'task-create': false,
          complete: completeMomentEnabled,
          clear: false,
        },
        soundTimbre: 'felt',
        soundVolume: 1,
      },
    },
  })
}

/**
 * Patches the Web Audio start seam BEFORE any app script runs, so every cue the
 * engine schedules increments `window.__soundCueFired`. Chromium defines `start()`
 * on the CONCRETE scheduled-source interfaces (`AudioBufferSourceNode` for the
 * decoded-asset path, `OscillatorNode` for the synth fallback), NOT reliably on
 * the `AudioScheduledSourceNode` base prototype — so we wrap both concretes. They
 * are distinct prototype objects, so a buffer-source play and an oscillator play
 * each increment exactly once (no double-count). Decode-only prewarm never calls
 * `.start()`, so it can't false-positive. This is a SPY (it calls the original),
 * not a mock — the real engine still runs end to end.
 * @param page - Playwright page to install the init script on.
 * @returns A promise that resolves once the init script is registered.
 */
async function instrumentSoundEngine(page: Page): Promise<void> {
  await page.addInitScript(() => {
    try {
      // Install once per document; preserves the counter across re-entrant runs.
      if (window.__soundCueInstrumented) return
      window.__soundCueInstrumented = true
      window.__soundCueFired = 0

      // Shadow `.start` on a concrete scheduled-source prototype with a counter.
      const countStartCalls = (prototype: AudioScheduledSourceNode): void => {
        const originalStart = prototype.start
        prototype.start = function (
          this: AudioScheduledSourceNode,
          ...startArgs: Parameters<AudioScheduledSourceNode['start']>
        ) {
          window.__soundCueFired = (window.__soundCueFired ?? 0) + 1
          return originalStart.apply(this, startArgs)
        }
      }

      if (
        typeof window.AudioBufferSourceNode?.prototype?.start === 'function'
      ) {
        countStartCalls(window.AudioBufferSourceNode.prototype)
      }
      if (typeof window.OscillatorNode?.prototype?.start === 'function') {
        countStartCalls(window.OscillatorNode.prototype)
      }
    } catch {
      // Cross-origin / sandboxed frame (e.g. Clerk iframe) — no audio there.
    }
  })
}

/**
 * Adds a pending todo and waits for the create mutation to settle with a positive
 * server id, returning its checkbox. Optimistic create assigns a temporary
 * negative id ("todo--<ts>"); clicking before the real id arrives targets a
 * phantom row. Mirrors the positive-id guard in todo-app.spec.ts.
 * @param page - Playwright page.
 * @param todoText - The todo label (also the checkbox accessible name).
 * @returns The pending todo's checkbox locator, server-confirmed.
 */
async function addPendingTodo(page: Page, todoText: string) {
  await page.getByPlaceholder('Type a todo, or paste a list...').fill(todoText)
  await page.getByRole('button', { name: 'Add', exact: true }).click()
  const todoCheckbox = page.getByRole('checkbox', { name: todoText })
  await expect(todoCheckbox).toBeVisible()
  await expect(todoCheckbox).not.toBeChecked()
  await expect(todoCheckbox).toHaveAttribute('id', /^todo-[^-]/, {
    timeout: 5000,
  })
  return todoCheckbox
}

test.describe('Sound palette — fire on gesture', () => {
  test.beforeAll(resetDatabase)

  test.beforeEach(async ({ page }) => {
    // Clerk testing token + auth state from e2e/.auth/user.json (same as todo-app).
    await setupClerkTestingToken({ page })
    // Instrument the audio engine before any navigation so the spy is in place
    // before the app constructs a single AudioContext node.
    await instrumentSoundEngine(page)
  })

  test('plays the completion cue when the complete moment is enabled', async ({
    page,
  }, testInfo) => {
    // Arrange — seed settings with the complete cue ON, then boot the app.
    await page.addInitScript(
      ({ storageKey, blob }) => {
        try {
          localStorage.setItem(storageKey, blob)
        } catch {
          // Sandboxed frame without storage access — ignore; main frame seeds.
        }
      },
      { storageKey: STORAGE_KEY, blob: seedSettings(true) },
    )
    await page.goto('/home')
    await page.waitForLoadState('networkidle')
    // Confirm the seed actually landed, so a red run can't be blamed on the seed.
    expect(
      await page.evaluate((key) => localStorage.getItem(key), STORAGE_KEY),
    ).toContain('"complete":true')
    // Unique per retry: resetDatabase is beforeAll, so a retry's leftover todo
    // would otherwise collide on the accessible name (strict-mode violation).
    const todoCheckbox = await addPendingTodo(
      page,
      `Sound on completion test ${testInfo.retry}`,
    )

    // Act — complete the todo (the user gesture that should fire the cue).
    await todoCheckbox.click()

    // Assert — the engine scheduled at least one cue.
    await expect
      .poll(async () => page.evaluate(() => window.__soundCueFired ?? 0), {
        timeout: 5000,
      })
      .toBeGreaterThanOrEqual(1)
  })

  test('stays silent when the complete moment is off', async ({
    page,
  }, testInfo) => {
    // Arrange — seed settings with every cue OFF (explicit, not relying on the
    // default), then boot the app.
    await page.addInitScript(
      ({ storageKey, blob }) => {
        try {
          localStorage.setItem(storageKey, blob)
        } catch {
          // Sandboxed frame without storage access — ignore; main frame seeds.
        }
      },
      { storageKey: STORAGE_KEY, blob: seedSettings(false) },
    )
    await page.goto('/home')
    await page.waitForLoadState('networkidle')
    // Unique per retry (resetDatabase is beforeAll) — see the positive test.
    const todoText = `Sound off completion test ${testInfo.retry}`
    const todoCheckbox = await addPendingTodo(page, todoText)

    // Act — complete the todo. With the moment OFF, fire() is a no-op.
    await todoCheckbox.click()

    // Assert — completion is observable (proving the gesture ran)...
    await expect(page.getByRole('checkbox', { name: todoText })).toBeChecked({
      timeout: 5000,
    })
    // ...and no cue was ever scheduled.
    expect(await page.evaluate(() => window.__soundCueFired ?? 0)).toBe(0)
  })
})
