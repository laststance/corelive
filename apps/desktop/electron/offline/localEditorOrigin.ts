export const LOCAL_EDITOR_SCHEME = 'corelive-editor'
export const LOCAL_EDITOR_ORIGIN = `${LOCAL_EDITOR_SCHEME}://app`
export const LOCAL_EDITOR_URL = `${LOCAL_EDITOR_ORIGIN}/index.html`

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

/** Gives preload/navigation authority only to the single bundled editor document.
 * @example isLocalEditorDocument(LOCAL_EDITOR_URL)
 */
export function isLocalEditorDocument(url: string): boolean {
  if (!isLocalEditorURL(url)) return false
  const parsed = new URL(url)
  return (
    (parsed.pathname === '/' || parsed.pathname === '/index.html') &&
    !parsed.search &&
    !parsed.hash
  )
}
