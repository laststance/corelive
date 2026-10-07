/** Keeps preload-equipped windows on the configured app origin and its canonical production alias.
 * The main process checks renderer-initiated navigation and redirects before another document can load.
 * @param navigationUrl - Full destination requested by the renderer or server redirect.
 * @param appOrigin - Origin configured by {@link WindowManager} for this run.
 * @returns Whether this document may retain the native preload bridge.
 * @example isTrustedAppNavigation('https://www.corelive.app/settings', 'https://corelive.app') // true
 */
export function isTrustedAppNavigation(
  navigationUrl: string,
  appOrigin: string,
): boolean {
  try {
    const destination = new URL(navigationUrl)
    const configured = new URL(appOrigin)
    if (destination.username || destination.password) return false
    if (
      destination.origin === configured.origin &&
      ['http:', 'https:'].includes(destination.protocol)
    )
      return true
    // Vercel redirects the bare production hostname to www; no other origin is trusted.
    const productionOrigins = [
      'https://corelive.app',
      'https://www.corelive.app',
    ]
    return (
      productionOrigins.includes(configured.origin) &&
      productionOrigins.includes(destination.origin)
    )
  } catch {
    // Malformed URLs must fail closed without crashing the application's navigation handler.
    return false
  }
}

/** Allows only Clerk's session-refresh endpoint with a return to this run's app origin.
 * {@link setupSecurity} permits this document redirect while {@link exposeTrustedBridge} withholds native APIs.
 * The production Frontend API host is verified from the public Clerk key on corelive.app.
 * @returns Whether this main-frame redirect is a bounded Clerk handshake.
 * @example isTrustedClerkHandshake('https://clerk.corelive.app/v1/client/handshake?redirect_url=https%3A%2F%2Fcorelive.app%2Flive-editor', 'https://corelive.app') // true
 */
export function isTrustedClerkHandshake(
  navigationUrl: string,
  appOrigin: string,
): boolean {
  try {
    const destination = new URL(navigationUrl)
    const configured = new URL(appOrigin)
    if (
      destination.protocol !== 'https:' ||
      destination.username ||
      destination.password ||
      destination.hash ||
      destination.pathname !== '/v1/client/handshake'
    )
      return false
    const isProduction = [
      'https://corelive.app',
      'https://www.corelive.app',
    ].includes(configured.origin)
    const isDevelopment =
      configured.protocol === 'http:' && configured.hostname === 'localhost'
    const trustedFrontend = isProduction
      ? destination.origin === 'https://clerk.corelive.app'
      : isDevelopment &&
        destination.port === '' &&
        destination.hostname.endsWith('.clerk.accounts.dev')
    const returnUrl = destination.searchParams.get('redirect_url')
    return Boolean(
      trustedFrontend &&
      returnUrl &&
      isTrustedAppNavigation(returnUrl, appOrigin),
    )
  } catch {
    return false
  }
}
