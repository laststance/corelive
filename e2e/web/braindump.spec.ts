import { setupClerkTestingToken } from '@clerk/testing/playwright'
import { type Locator, type Page } from '@playwright/test'

import { test, expect } from './_helpers/coverage'
import { resetDatabase } from './_helpers/db'

/**
 * Installs the BrainDump preload seam so `/braindump` runs in browser E2E.
 * @param page - Playwright page that will navigate to the BrainDump route.
 * @returns Nothing; future navigations receive `window.brainDumpAPI`.
 * @example await installBrainDumpPreloadMock(page)
 */
async function installBrainDumpPreloadMock(page: Page): Promise<void> {
  await page.addInitScript(() => {
    let opacity = 0.85
    let syncEnabled = true
    let lastCategoryId: number | null = 1
    let visibleOnAllWorkspaces = false
    const notesByCategory = new Map<number, string>()

    // BrainDump follows FloatingNav by default; seed the shared category store.
    window.localStorage.setItem('corelive-selected-category', '1')

    window.brainDumpAPI = {
      window: {
        close: async () => undefined,
        toggle: async () => undefined,
        setOpacity: async (value: number) => {
          opacity = value
        },
        getOpacity: async () => opacity,
        getBounds: async () => null,
        setBounds: async (_bounds) => undefined,
      },
      note: {
        get: async (categoryId: number) =>
          notesByCategory.get(categoryId) ?? '',
        set: async (categoryId: number, text: string) => {
          notesByCategory.set(categoryId, text)
        },
      },
      sync: {
        getEnabled: async () => syncEnabled,
        setEnabled: async (enabled: boolean) => {
          syncEnabled = enabled
        },
      },
      category: {
        getLast: async () => lastCategoryId,
        setLast: async (categoryId: number) => {
          lastCategoryId = categoryId
        },
      },
      spaces: {
        getVisibleOnAllWorkspaces: async () => visibleOnAllWorkspaces,
        setVisibleOnAllWorkspaces: async (enabled: boolean) => {
          visibleOnAllWorkspaces = enabled
          return visibleOnAllWorkspaces
        },
      },
      on: (
        _channel: string,
        _callback: (...args: unknown[]) => void,
      ): (() => void) => {
        return () => undefined
      },
    }

    window.brainDumpEnv = {
      isElectron: true,
      isBrainDump: true,
      platform: 'darwin',
    }
  })
}

/**
 * Opens `/braindump` and waits until the note textarea accepts input.
 * @param page - Playwright page with Clerk token and BrainDump preload ready.
 * @returns The enabled BrainDump textarea locator.
 * @example const noteField = await openBrainDump(page)
 */
async function openBrainDump(page: Page) {
  await page.goto('/braindump')
  const noteField = page.getByRole('textbox')
  await expect(noteField).toBeEnabled({ timeout: 10000 })
  return noteField
}

/**
 * Moves the textarea caret to the final character for caret-line completion.
 * @param noteField - The BrainDump textarea locator.
 * @returns Nothing; the selection is updated in the browser context.
 * @example await moveCaretToEnd(noteField)
 */
async function moveCaretToEnd(noteField: Locator): Promise<void> {
  await noteField.evaluate((element) => {
    if (!(element instanceof HTMLTextAreaElement)) {
      throw new Error('BrainDump editor is not a textarea')
    }
    element.setSelectionRange(element.value.length, element.value.length)
  })
}

test.describe('BrainDump E2E', () => {
  test.beforeAll(resetDatabase)

  test.beforeEach(async ({ page }) => {
    // Arrange common auth + Electron preload boundary before the route loads.
    await setupClerkTestingToken({ page })
    await installBrainDumpPreloadMock(page)
  })

  test('completes the nested checkbox at the caret with ControlOrMeta+Enter', async ({
    page,
  }) => {
    // Arrange
    const noteField = await openBrainDump(page)
    await noteField.fill(
      ['- [ ] parent task', '  - [ ] nested task'].join('\n'),
    )
    await moveCaretToEnd(noteField)

    // Act
    const createCompletedResponse = page.waitForResponse(
      (response) =>
        response.url().includes('/api/orpc/completed/create') &&
        response.request().method() === 'POST',
    )
    await noteField.press('ControlOrMeta+Enter')

    // Assert
    await expect(noteField).toHaveValue(
      ['- [ ] parent task', '  - [x] nested task'].join('\n'),
    )
    await expect(page.getByText('Completed: nested task')).toBeVisible()
    expect((await createCompletedResponse).status()).toBe(200)
  })
})
