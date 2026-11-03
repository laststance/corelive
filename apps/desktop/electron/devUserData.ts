import { join } from 'node:path'

import type { App } from 'electron'

/** Folder name under Application Support used by every non-packaged run (EA10). */
const DEV_USER_DATA_FOLDER = 'CoreLive Dev'

/**
 * Points an unpackaged (dev or QA) run at its own `userData` so it never migrates or writes the
 * owner's installed workspace (EA10). Must run before `app.whenReady()` resolves, because the
 * offline directory, config and window state are all derived from `userData`.
 *
 * @param electronApp - The Electron `app` (a fake in tests).
 * @returns The dev path that was set, or null for a packaged build, which keeps its own path.
 * @example
 * ```ts
 * applyDevUserData(app) // => '/Users/me/Library/Application Support/CoreLive Dev'
 * ```
 */
export function applyDevUserData(
  electronApp: Pick<App, 'isPackaged' | 'getPath' | 'setPath'>,
): string | null {
  if (electronApp.isPackaged) return null
  const devPath = join(electronApp.getPath('appData'), DEV_USER_DATA_FOLDER)
  electronApp.setPath('userData', devPath)
  return devPath
}
