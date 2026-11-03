export const LOCAL_EDITOR_SCHEME = 'corelive-editor'
export const LOCAL_EDITOR_ORIGIN = `${LOCAL_EDITOR_SCHEME}://app`
export const LOCAL_EDITOR_URL = `${LOCAL_EDITOR_ORIGIN}/index.html`
export const LOCAL_SETTINGS_URL = `${LOCAL_EDITOR_ORIGIN}/settings.html`

/** The only two documents the bundled scheme serves (D5, EA16); assets are served separately. */
export const LOCAL_DOCUMENT_PATHS = ['/index.html', '/settings.html'] as const

/** Checks the registered scheme and host; custom URLs have an opaque origin in Node.
 * @example isLocalEditorURL('corelive-editor://app/assets/editor.js')
 */
export function isLocalEditorURL(url: string): boolean {
  try {
    const parsed = new URL(url)
    return (
      parsed.protocol === `${LOCAL_EDITOR_SCHEME}:` &&
      parsed.host === 'app' &&
      !parsed.username &&
      !parsed.password
    )
  } catch {
    return false
  }
}

/** Checks an exact bundled document path with no query or fragment.
 * @example hasDocumentPath('corelive-editor://app/settings.html', ['/settings.html'])
 */
function hasDocumentPath(url: string, paths: readonly string[]): boolean {
  if (!isLocalEditorURL(url)) return false
  const parsed = new URL(url)
  return paths.includes(parsed.pathname) && !parsed.search && !parsed.hash
}

/** Gives preload/navigation authority only to the bundled editor document.
 * @example isLocalEditorDocument(LOCAL_EDITOR_URL)
 */
export function isLocalEditorDocument(url: string): boolean {
  return hasDocumentPath(url, ['/', '/index.html'])
}

/** Gives preload/navigation authority only to the bundled Settings document.
 * @example isLocalSettingsDocument(LOCAL_SETTINGS_URL)
 */
export function isLocalSettingsDocument(url: string): boolean {
  return hasDocumentPath(url, ['/settings.html'])
}

/** Explicit two-document allowlist (D5): exactly the editor and the Settings document.
 * Window-specific callers use the narrower predicates; this one guards shared protocol logic.
 * @example isLocalBundledDocument('corelive-editor://app/other.html') // => false
 */
export function isLocalBundledDocument(url: string): boolean {
  return isLocalEditorDocument(url) || isLocalSettingsDocument(url)
}
