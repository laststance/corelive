import { contextBridge } from 'electron'

import { isTrustedDashboardNavigation } from '../utils/isTrustedDashboardNavigation'
/** Publishes a preload namespace only to the configured Dashboard document, never to Clerk's handshake page.
 * Every app preload calls this; {@link WindowManager} supplies the origin through a main-process argument.
 * @param apiKey - Existing renderer namespace; legacy aliases use the same origin boundary.
 * @param api - Native bridge whose capabilities must stay out of third-party documents.
 * @example exposeTrustedBridge('electronAPI', {auth: createAuthBridge()})
 */
export function exposeTrustedBridge(apiKey: string, api: unknown): void {
  // Keep the main-to-preload argument name used by the CoreLive launch contract.
  const prefix = '--corelive-app-origin='
  const argument = process.argv.find((value) => value.startsWith(prefix))
  const dashboardOrigin =
    argument?.slice(prefix.length) ?? 'https://corelive.app'
  // Redirects create a fresh preload world; provider documents receive no native namespace.
  if (
    typeof window !== 'undefined' &&
    isTrustedDashboardNavigation(window.location.href, dashboardOrigin)
  )
    contextBridge.exposeInMainWorld(apiKey, api)
}
