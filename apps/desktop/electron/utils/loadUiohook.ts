/**
 * @fileoverview Runtime loader for the `uiohook-napi` native singleton, kept in
 * its own file so `createUiohookShortcutEngine` stays pure + unit-testable while
 * the real `require` lives here. The built main process is CommonJS (electron-vite
 * `format: 'cjs'`), so a bare `require` resolves the externalized native module —
 * the same pattern as the `.cjs` manager requires in `main.ts`. Any load failure
 * (missing prebuild / wrong arch) throws and is downgraded to `null` by the
 * engine's `safeLoad`, degrading lone-modifier shortcuts to chords.
 *
 * @module electron/utils/loadUiohook
 */

import type { UiohookModule } from '../uiohookEngine'

/**
 * Resolve the `uIOhook` global tap singleton from `uiohook-napi`.
 * @returns The `uIOhook` singleton typed as the minimal {@link UiohookModule}.
 * @throws When the native module cannot be required — the caller (`safeLoad`) maps
 *   that to `null` so the app degrades instead of crashing.
 * @example
 * createUiohookShortcutEngine(loadUiohook)
 */
export function loadUiohook(): UiohookModule {
  // Runtime require (not a static import) so the native module is resolved lazily
  // from node_modules in the CJS-built main process — the same pattern as the
  // `.cjs` manager requires in main.ts.
  const nativeModule: { uIOhook: UiohookModule } = require('uiohook-napi')
  return nativeModule.uIOhook
}
