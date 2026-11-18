import { shell } from 'electron'

import { log } from '../logger'

/**
 * Opens a Dashboard path in the default browser for tray, deep-link and Settings actions.
 * Checks the leading slash and the resulting HTTP(S) URL before handing it to the OS.
 * @param origin - Dashboard origin configured by {@link WindowManager.getDashboardOrigin}.
 * @param dashboardPath - Path beginning with a slash, including any query and fragment.
 * @returns True when the OS accepts the URL. Logs a failure and returns false otherwise.
 * @example
 * const opened = await openDashboardInBrowser('https://corelive.app', '/home')
 */
export async function openDashboardInBrowser(
  origin: string,
  dashboardPath: string,
): Promise<boolean> {
  // A leading slash keeps the caller's path separate from the configured authority.
  if (!dashboardPath.startsWith('/')) {
    log.error(
      `Refusing to open a non-absolute Dashboard path: ${dashboardPath}`,
    )
    return false
  }
  const targetUrl = `${origin}${dashboardPath}`
  let parsedUrl: URL
  try {
    parsedUrl = new URL(targetUrl)
  } catch (error) {
    log.error('Refusing to open a malformed Dashboard URL:', error)
    return false
  }
  if (parsedUrl.protocol !== 'http:' && parsedUrl.protocol !== 'https:') {
    log.error(
      `Refusing to open a non-http(s) Dashboard URL: ${parsedUrl.protocol}`,
    )
    return false
  }
  try {
    await shell.openExternal(targetUrl)
    return true
  } catch (error) {
    log.error('Failed to open Dashboard in the browser:', error)
    return false
  }
}
