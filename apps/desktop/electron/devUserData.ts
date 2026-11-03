import { join } from 'node:path'

import type { App } from 'electron'

/** Folder name under Application Support used by every non-packaged run (EA10). */
const DEV_USER_DATA_FOLDER = 'CoreLive Dev'

/**
 * Points an unpackaged (dev or QA) run at its own `userData` so it never migrates or writes the
 * owner's installed workspace (EA10). Must run before `app.whenReady()` resolves, because the
 * offline directory, config and window state are all derived from `userData`.
 *
 * An explicit `--user-data-dir` (an isolated QA instance) is already separate from the owner's
 * workspace, so it is kept instead of being folded into the shared dev folder.
 *
 * @param electronApp - The Electron `app` (a fake in tests).
 * @returns
 * - The dev path that was set for a plain unpackaged run
 * - null for a packaged build or a run launched with `--user-data-dir`, which keep their own path
 * @example
 * ```ts
 * applyDevUserData(app) // => '/Users/me/Library/Application Support/CoreLive Dev'
 * ```
 */
export function applyDevUserData(
  electronApp: Pick<App, 'isPackaged' | 'getPath' | 'setPath'> & {
    commandLine?: Pick<App['commandLine'], 'hasSwitch'>
  },
): string | null {
  if (electronApp.isPackaged) return null
  // A caller-chosen isolated folder already keeps the owner's data untouched.
  if (electronApp.commandLine?.hasSwitch('user-data-dir')) return null
  const devPath = join(electronApp.getPath('appData'), DEV_USER_DATA_FOLDER)
  electronApp.setPath('userData', devPath)
  return devPath
}
