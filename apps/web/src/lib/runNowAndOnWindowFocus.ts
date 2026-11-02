/**
 * Runs a callback immediately and again every time the window regains focus.
 *
 * The Settings controls return this from their mount effect: the Settings
 * popover hides on blur and persists, so a value saved from another surface
 * while it was hidden is picked up when the visitor returns. Used by
 * {@link usePanelSetting} and {@link LiveEditorSettings}.
 *
 * @param run - Work to repeat (typically a native preference re-read). Receives
 *   `isStale`, which turns true once the returned cleanup has run so late
 *   async results can be discarded.
 * @returns Cleanup that detaches the focus listener and marks runs stale.
 * @example
 * useCycleEffect(() => runNowAndOnWindowFocus((isStale) => void reload(isStale)), [])
 */
export function runNowAndOnWindowFocus(
  run: (isStale: () => boolean) => void,
): () => void {
  let stale = false
  const runOnce = (): void => run(() => stale)
  runOnce()
  window.addEventListener('focus', runOnce)
  return (): void => {
    stale = true
    window.removeEventListener('focus', runOnce)
  }
}
