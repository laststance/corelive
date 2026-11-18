import { shell } from 'electron'

import { log } from '../logger'

/**
 * Opens a Dashboard path in the user's default browser. The tray menu, deep
 * links and Account settings call it when the user opens synced activity.
 * @param origin - Dashboard origin from {@link WindowManager.getDashboardOrigin} (dev: `http://localhost:4991`, prod: `https://corelive.app`).
 * @param dashboardPath - Leading-slash path to open (e.g. `/home`).
 * @returns Nothing; refuses (logs, no-op) a non-absolute path or a non-http(s) result, otherwise logs and swallows `shell` failures so a missing/blocked browser never crashes the main process.
 * @example
 * openDashboardInBrowser('https://corelive.app', '/home') // opens https://corelive.app/home
 * openDashboardInBrowser('https://corelive.app', 'home')  // refused (not leading-slash) — no browser opened
 */
export function openDashboardInBrowser(
  origin: string,
  dashboardPath: string,
): void {
  // dashboardPath MUST be an on-origin absolute path. A value not starting with "/"
  // (e.g. "@evil.com/...") would re-interpret the authority once concatenated,
  // so reject it before it can ever reach the system browser.
  if (!dashboardPath.startsWith('/')) {
    log.error(
      `Refusing to open a non-absolute Dashboard path: ${dashboardPath}`,
    )
    return
  }
  // This is the shared chokepoint for tray/menu/notification/shortcut AND the
  // deep-link flow, whose dashboardPath is built from an untrusted `corelive://` URL
  // (already percent-encoded upstream in T15). Defense-in-depth at the OS-handoff
  // sink: parse the final URL and refuse anything that isn't http(s). The opened
  // string stays exactly `${origin}${dashboardPath}`, so callers' URLs are unchanged.
  const targetUrl = `${origin}${dashboardPath}`
  let parsedUrl: URL
  try {
    parsedUrl = new URL(targetUrl)
  } catch (error) {
    log.error('Refusing to open a malformed Dashboard URL:', error)
    return
  }
  if (parsedUrl.protocol !== 'http:' && parsedUrl.protocol !== 'https:') {
    log.error(
      `Refusing to open a non-http(s) Dashboard URL: ${parsedUrl.protocol}`,
    )
    return
  }
  shell.openExternal(targetUrl).catch((error) => {
    log.error('Failed to open Dashboard in the browser:', error)
  })
}
