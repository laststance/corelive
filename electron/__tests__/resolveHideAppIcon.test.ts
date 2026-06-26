/**
 * @fileoverview Boot-time dock-policy decision (#112) truth table.
 *
 * Locks the contract that the macOS dock icon is hidden at boot ONLY for a real
 * boolean `true` in `behavior.hideAppIcon`. The strict `=== true` guard is what
 * keeps a hand-edited / corrupt config.json (string `"false"`, a number) from
 * wrongly hiding the app — `ConfigManager.get` casts the raw scalar without
 * validating it, so this helper is the validation chokepoint.
 *
 * Triggered when: `pnpm test:electron` (Vitest).
 *
 * @example
 *   pnpm test:electron -- resolveHideAppIcon
 */
import { describe, expect, it } from 'vitest'

import {
  HIDE_APP_ICON_CONFIG_PATH,
  resolveHideAppIcon,
} from '../utils/resolveHideAppIcon'

/**
 * Builds a stub config reader that returns `value` for the hideAppIcon path and
 * `undefined` for anything else — proving the helper reads the right key.
 *
 * @param value - The raw scalar the stubbed config holds at the hideAppIcon path.
 */
function readerReturning(value: unknown): { get(path: string): unknown } {
  return {
    get: (path: string) =>
      path === HIDE_APP_ICON_CONFIG_PATH ? value : undefined,
  }
}

describe('resolveHideAppIcon (boot dock-policy decision)', () => {
  it('hides the icon only for a real boolean true', () => {
    // Arrange
    const reader = readerReturning(true)

    // Act + Assert
    expect(resolveHideAppIcon(reader)).toBe(true)
  })

  it.each<[label: string, value: unknown]>([
    ['boolean false', false],
    ['missing key (undefined)', undefined],
    ['the string "false"', 'false'],
    ['the string "true"', 'true'],
    ['the number 0', 0],
    ['the number 1', 1],
    ['null', null],
  ])('shows the icon for %s (not real boolean true)', (_label, value) => {
    // Arrange: a corrupt/hand-edited config scalar that is NOT boolean true.
    const reader = readerReturning(value)

    // Act + Assert: anything other than `true` must resolve to "show", so a
    // truthy `"false"`/`1` can never silently hide the app.
    expect(resolveHideAppIcon(reader)).toBe(false)
  })

  it('reads the hideAppIcon value from the behavior.hideAppIcon path', () => {
    // Arrange: a reader that only answers `true` for the canonical dot-path.
    let queriedPath = ''
    const reader = {
      get: (path: string) => {
        queriedPath = path
        return true
      },
    }

    // Act
    resolveHideAppIcon(reader)

    // Assert: pins the single-sourced path constant so a typo can't desync the
    // boot read from the IPC-handler write.
    expect(queriedPath).toBe('behavior.hideAppIcon')
  })
})
