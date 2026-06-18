import { shell } from 'electron'

import { log } from '../logger'

/**
 * Opens a path of the full web app in the user's external browser — the
 * post-main-retirement "go to the full app" action, since the task UI now lives
 * at corelive.app instead of an Electron window. Triggered by the tray "Open
 * full app ↗" items and notification click-through.
 * @param origin - Web app origin from `WindowManager.getWebAppOrigin()` (dev: `http://localhost:4991`, prod: `https://corelive.app`).
 * @param appPath - Leading-slash path to open (e.g. `/home`).
 * @returns Nothing; logs and swallows `shell` failures so a missing/blocked browser never crashes the main process.
 * @example
 * openWebAppInBrowser('https://corelive.app', '/home') // opens https://corelive.app/home
 */
export function openWebAppInBrowser(origin: string, appPath: string): void {
  shell.openExternal(`${origin}${appPath}`).catch((error) => {
    log.error('Failed to open the full app in the browser:', error)
  })
}
