'use client'

/**
 * @fileoverview Floating Navigator-specific settings for the Electron Settings
 * page: the keep-on-top pin and the inline global-toggle shortcut.
 *
 * After the Settings regroup this is Floating-Navigator-ONLY — the shared Spaces
 * visibility moved to the Application section and the Brain Dump pin to the Brain
 * Dump section, so the old "shared behavior for Floating Navigator and BrainDump"
 * framing no longer applies. Rendered bare under the Floating Navigator section
 * header (its old "Floating windows" card title collapsed into that `<h2>`).
 *
 * The shortcut box mirrors the BrainDump rebind UI (same `KeybindingCaptureInput`
 * + `useShortcutCapture` optimistic/rollback), but persists over the
 * `floatingPanels.setFloatingNavigatorShortcut` bridge, which writes the canonical
 * `shortcuts.toggleFloatingNavigator` store (no separate mirror) so the box never
 * drifts from a rebind made via the generic keybind settings.
 *
 * @module components/electron/FloatingNavigatorSettings
 */
import { Keyboard } from 'lucide-react'
import { useId, useState, type ReactElement } from 'react'

import {
  FLOATING_NAVIGATOR_PIN_PREFERENCE,
  FloatingPanelToggle,
} from '@/components/electron/FloatingPanelToggle'
import { KeybindingCaptureInput } from '@/components/electron/KeybindingCaptureInput'
import { Label } from '@/components/ui/label'
import { useCycleEffect } from '@/hooks/use-cycle-effect'
import { useMounted } from '@/hooks/use-mounted'
import { type FloatingPanelsBridge } from '@/hooks/useFloatingPanelPreference'
import { useShortcutCapture } from '@/hooks/useShortcutCapture'
import { log } from '@/lib/logger'

/**
 * True when the running preload exposes BOTH floating-shortcut methods. Guards on
 * the METHODS, not just the `floatingPanels` namespace: an outdated desktop
 * preload can expose the older pin/Spaces methods without the newer shortcut
 * getters, and we hide the shortcut box rather than crash on a missing method.
 * @param api - The `window.electronAPI.floatingPanels` bridge, or undefined off-Electron.
 * @returns True only when both `get`/`setFloatingNavigatorShortcut` are callable.
 * @example hasFloatingShortcutMethods(window.electronAPI?.floatingPanels) // => true in a current desktop build
 */
function hasFloatingShortcutMethods(
  api: FloatingPanelsBridge | undefined,
): boolean {
  return (
    typeof api?.getFloatingNavigatorShortcut === 'function' &&
    typeof api?.setFloatingNavigatorShortcut === 'function'
  )
}

/**
 * Floating Navigator settings group: the keep-on-top pin plus the inline
 * toggle-shortcut capture. Each control self-gates on its own preload methods, so
 * this renders nothing meaningful off-Electron and degrades a skewed install to
 * just the controls its preload still supports.
 *
 * @returns The Floating Navigator settings group.
 * @example
 * <FloatingNavigatorSettings />
 */
export const FloatingNavigatorSettings =
  function FloatingNavigatorSettings(): ReactElement {
    const shortcutId = useId()
    const hasMounted = useMounted()
    // Disabled until the saved accelerator loads, so a tap can't capture-and-
    // persist against the empty default before the real binding arrives.
    const [isShortcutReady, setIsShortcutReady] = useState(false)
    const [shortcutError, setShortcutError] = useState<string | null>(null)

    const { shortcut, setLoadedShortcut, capture } = useShortcutCapture({
      persist: async (accelerator) =>
        window.electronAPI?.floatingPanels?.setFloatingNavigatorShortcut(
          accelerator,
        ) ?? Promise.resolve(undefined),
      onError: setShortcutError,
    })

    // Load the persisted accelerator once on mount. Bail (leaving the box hidden
    // via the skew guard below) when the preload predates the shortcut methods.
    useCycleEffect(() => {
      const api =
        typeof window === 'undefined'
          ? undefined
          : window.electronAPI?.floatingPanels
      if (typeof api?.getFloatingNavigatorShortcut !== 'function') return

      let cancelled = false
      void api
        .getFloatingNavigatorShortcut()
        .then((loaded) => {
          if (!cancelled) setLoadedShortcut(loaded)
        })
        .catch((loadError: unknown) => {
          log.error('Failed to load Floating Navigator shortcut:', loadError)
          if (!cancelled) setShortcutError('Failed to load shortcut')
        })
        .finally(() => {
          if (!cancelled) setIsShortcutReady(true)
        })

      return () => {
        cancelled = true
      }
    }, [])

    // Defer the shortcut box until after hydration (so SSR and first client paint
    // match) and only when the preload exposes both shortcut methods.
    const isShortcutAvailable =
      hasMounted &&
      typeof window !== 'undefined' &&
      hasFloatingShortcutMethods(window.electronAPI?.floatingPanels)

    return (
      <div className="space-y-4">
        <FloatingPanelToggle
          preference={FLOATING_NAVIGATOR_PIN_PREFERENCE}
          label="Keep on top"
          description="Pin the Floating Navigator above your other windows so it stays visible."
        />

        {isShortcutAvailable && (
          <div className="space-y-2">
            <Label
              htmlFor={shortcutId}
              className="flex items-center gap-2 text-sm font-medium"
            >
              <Keyboard className="h-4 w-4" />
              Toggle shortcut
            </Label>
            <KeybindingCaptureInput
              id={shortcutId}
              value={shortcut}
              // Same accessible name as the BrainDump box ("Toggle shortcut" =
              // the visible Label, WCAG 2.5.3); the section <h2> disambiguates
              // the two, mirroring the keep-on-top pins' label=name approach.
              ariaLabel="Toggle shortcut"
              onChange={capture}
              disabled={!isShortcutReady}
            />

            <p className="text-xs text-muted-foreground">
              Click, then press the keys you want. Esc cancels; Backspace clears
              it to disable the global shortcut.
            </p>
            {shortcutError && (
              <p className="text-xs text-destructive">{shortcutError}</p>
            )}
          </div>
        )}
      </div>
    )
  }

export default FloatingNavigatorSettings
