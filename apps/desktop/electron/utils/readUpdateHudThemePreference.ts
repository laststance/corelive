import type {
  OfflineEditorSnapshot,
  OfflinePreferences,
} from '@corelive/desktop-contract/offline-workspace'

/**
 * Reads the desktop theme the update-download window (HUD) should paint, from
 * the offline editor's cached snapshot. Exists so the main-process policy
 * "only a prepared, ready workspace has a theme" is one tested function instead
 * of an untested closure: a reader that silently returned nothing would leave
 * every HUD on the Default fallback, which a System-appearance capture cannot
 * tell apart from success (#214). `main.ts` passes
 * `() => readUpdateHudThemePreference(offlineEditor?.controller.getSnapshot())`
 * to `AutoUpdater`, which calls it once when a HUD is created.
 *
 * @param snapshot - The controller's current snapshot, or `undefined` before the
 *   offline editor exists.
 * @returns
 * - the stored `workspace.preferences.theme` when the snapshot is `ready`
 * - `undefined` for any other phase (opening, preparing, needs-preparation,
 *   locked, recovery) or a missing snapshot, so the HUD falls back to the
 *   Default theme following the OS
 * @example
 * readUpdateHudThemePreference(readySnapshotWithTheme('harbor-dark')) // => 'harbor-dark'
 * readUpdateHudThemePreference({ phase: 'locked', generation: 3 })    // => undefined
 * readUpdateHudThemePreference(undefined)                             // => undefined
 */
export function readUpdateHudThemePreference(
  snapshot: OfflineEditorSnapshot | undefined,
): OfflinePreferences['theme'] | undefined {
  // Only a ready workspace carries account preferences; every other phase has none yet.
  if (snapshot?.phase !== 'ready') return undefined
  return snapshot.workspace.preferences.theme
}
