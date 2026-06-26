/**
 * Dot-path of the persisted macOS "hide Dock icon" preference in config.json.
 * Single-sourced so the boot-time read (resolveHideAppIcon) and the IPC handler
 * write (settings:setHideAppIcon) can never drift apart.
 */
export const HIDE_APP_ICON_CONFIG_PATH = 'behavior.hideAppIcon'

/** Minimal slice of ConfigManager the boot dock-policy decision reads from. */
export interface HideAppIconConfigReader {
  get(path: string): unknown
}

/**
 * Resolves whether the macOS Dock icon + Cmd+Tab entry should be hidden at boot,
 * read from the main-process persisted config. Called by `createWindow`'s
 * `criticalInit` to apply `app.setActivationPolicy('accessory')` BEFORE any window
 * shows, so the choice survives a cold Start-at-Login restart without depending on
 * the renderer round-trip (ElectronStartupSync), which may never load (#112).
 *
 * Strict `=== true` on purpose: `ConfigManager.get` casts the raw JSON scalar
 * without validating it, so a hand-edited/corrupt config could carry the string
 * `"false"` or a number — only a real boolean `true` hides the app; every other
 * value (missing, `"false"`, `0`, `1`) resolves to "show".
 *
 * @param configReader - Persisted-config reader; a `ConfigManager` instance satisfies it.
 * @returns true only when `behavior.hideAppIcon` is the boolean `true`.
 * @example
 * resolveHideAppIcon({ get: () => true })      // => true
 * resolveHideAppIcon({ get: () => 'false' })   // => false (corrupt scalar, not real true)
 * resolveHideAppIcon({ get: () => undefined }) // => false (missing key)
 */
export function resolveHideAppIcon(
  configReader: HideAppIconConfigReader,
): boolean {
  return configReader.get(HIDE_APP_ICON_CONFIG_PATH) === true
}
