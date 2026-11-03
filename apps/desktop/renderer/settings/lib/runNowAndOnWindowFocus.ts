/**
 * Runs a callback immediately and again every time the window regains focus.
 *
 * The Settings controls return this from their mount effect: the Settings
 * popover hides on blur and persists, so a value saved from another surface
 * while it was hidden is picked up when the visitor returns. Used by
 * {@link usePanelSetting} and {@link LiveEditorSettings}.
 *
 * @param run - Work to repeat (typically a native preference re-read). Receives
 *   `isStale`, which turns true once a newer run has started or the returned
 *   cleanup has run, so a slower earlier read can never overwrite a newer one.
 * @returns Cleanup that detaches the focus listener and marks every run stale.
 * @example
 * useCycleEffect(() => runNowAndOnWindowFocus((isStale) => void reload(isStale)), [])
 */
export function runNowAndOnWindowFocus(
  run: (isStale: () => boolean) => void,
): () => void {
  let isCleanedUp = false
  let latestRunId = 0
  const runOnce = (): void => {
    latestRunId += 1
    const runId = latestRunId
    // Only the most recent run may apply its result.
    run(() => isCleanedUp || runId !== latestRunId)
  }
  runOnce()
  window.addEventListener('focus', runOnce)
  return (): void => {
    isCleanedUp = true
    window.removeEventListener('focus', runOnce)
  }
}
