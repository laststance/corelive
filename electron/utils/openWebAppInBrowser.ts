import { shell } from 'electron'

import { log } from '../logger'

/**
 * Opens a path of the full web app in the user's external browser — the
 * post-main-retirement "go to the full app" action, since the task UI now lives
 * at corelive.app instead of an Electron window. Triggered by the tray "Open
 * full app ↗" items and notification click-through.
 * @param origin - Web app origin from `WindowManager.getWebAppOrigin()` (dev: `http://localhost:4991`, prod: `https://corelive.app`).
 * @param appPath - Leading-slash path to open (e.g. `/home`).
 * @returns Nothing; refuses (logs, no-op) a non-absolute path or a non-http(s) result, otherwise logs and swallows `shell` failures so a missing/blocked browser never crashes the main process.
 * @example
 * openWebAppInBrowser('https://corelive.app', '/home') // opens https://corelive.app/home
 * openWebAppInBrowser('https://corelive.app', 'home')  // refused (not leading-slash) — no browser opened
 */
export function openWebAppInBrowser(origin: string, appPath: string): void {
  // appPath MUST be an on-origin absolute path. A value not starting with "/"
  // (e.g. "@evil.com/...") would re-interpret the authority once concatenated,
  // so reject it before it can ever reach the system browser.
  if (!appPath.startsWith('/')) {
    log.error(`Refusing to open a non-absolute web app path: ${appPath}`)
    return
  }
  // This is the shared chokepoint for tray/menu/notification/shortcut AND the
  // deep-link flow, whose appPath is built from an untrusted `corelive://` URL
  // (already percent-encoded upstream in T15). Defense-in-depth at the OS-handoff
  // sink: parse the final URL and refuse anything that isn't http(s). The opened
  // string stays exactly `${origin}${appPath}`, so callers' URLs are unchanged.
  const targetUrl = `${origin}${appPath}`
  let parsedUrl: URL
  try {
    parsedUrl = new URL(targetUrl)
  } catch (error) {
    log.error('Refusing to open a malformed web app URL:', error)
    return
  }
  if (parsedUrl.protocol !== 'http:' && parsedUrl.protocol !== 'https:') {
    log.error(
      `Refusing to open a non-http(s) web app URL: ${parsedUrl.protocol}`,
    )
    return
  }
  shell.openExternal(targetUrl).catch((error) => {
    log.error('Failed to open the full app in the browser:', error)
  })
}
