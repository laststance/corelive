'use client'

/**
 * @fileoverview One self-contained floating-panel toggle row + the descriptor
 * registry the rows are driven by.
 *
 * After the Settings regroup the three `floatingPanels.*` booleans no longer
 * share a single card — the Spaces toggle lives under Application, and each
 * keep-on-top pin sits in its own window's section. Each row owns its own
 * `useFloatingPanelSetting` (per-method skew guard, Arch-2), so an outdated
 * preload missing one setter hides only that row instead of the whole section.
 *
 * @module components/electron/FloatingPanelToggle
 */
import { useId, type ReactElement, type ReactNode } from 'react'

import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import {
  useFloatingPanelSetting,
  type FloatingPanelSettingConfig,
} from '@/hooks/useFloatingPanelSetting'

/**
 * Floating Navigator keep-on-top pin (default ON — the navigator is a glanceable
 * companion meant to ride above other windows).
 */
export const FLOATING_NAVIGATOR_PIN_SETTING: FloatingPanelSettingConfig = {
  defaultValue: true,
  get: async (api) => api.getFloatingNavigatorAlwaysOnTop(),
  set: async (api, next) => api.setFloatingNavigatorAlwaysOnTop(next),
  available: (api) =>
    typeof api.getFloatingNavigatorAlwaysOnTop === 'function' &&
    typeof api.setFloatingNavigatorAlwaysOnTop === 'function',
}

/**
 * Brain Dump keep-on-top pin (default OFF — a dump surface you summon, not one
 * that hovers permanently). NB: these methods live on `floatingPanels`, NOT the
 * `brainDump` bridge, so this row degrades on a different preload axis than the
 * Brain Dump note card it sits beside.
 */
export const BRAIN_DUMP_PIN_SETTING: FloatingPanelSettingConfig = {
  defaultValue: false,
  get: async (api) => api.getBrainDumpAlwaysOnTop(),
  set: async (api, next) => api.setBrainDumpAlwaysOnTop(next),
  available: (api) =>
    typeof api.getBrainDumpAlwaysOnTop === 'function' &&
    typeof api.setBrainDumpAlwaysOnTop === 'function',
}

/**
 * Show-on-all-Spaces visibility (default OFF — one OS-level flag shared by both
 * panels), surfaced under the Application section since it is app-wide chrome.
 */
export const VISIBLE_ON_ALL_WORKSPACES_SETTING: FloatingPanelSettingConfig = {
  defaultValue: false,
  get: async (api) => api.getVisibleOnAllWorkspaces(),
  set: async (api, next) => api.setVisibleOnAllWorkspaces(next),
  available: (api) =>
    typeof api.getVisibleOnAllWorkspaces === 'function' &&
    typeof api.setVisibleOnAllWorkspaces === 'function',
}

interface FloatingPanelToggleProps {
  /** Which `floatingPanels` boolean this row reads + writes. */
  setting: FloatingPanelSettingConfig
  /** Visible row label, also the accessible name unless `ariaLabel` overrides it. */
  label: string
  /** Optional helper copy under the label. */
  description?: string
  /**
   * Optional self-describing accessible name when the visible `label` alone is
   * ambiguous out of section context. Keep `label` a substring of it to satisfy
   * WCAG 2.5.3 Label-in-Name.
   */
  ariaLabel?: string
  /** Extra disabled condition merged with the in-flight save (e.g. non-macOS). */
  disabled?: boolean
  /** Optional note rendered under the row (e.g. a platform caveat). */
  note?: ReactNode
}

/**
 * A single labeled keep-on-top / visibility toggle backed by one floating-panel
 * setting. Renders nothing when the setting's preload methods are absent
 * (web or an outdated desktop preload), so a skewed install simply omits the row
 * rather than showing a dead control or crashing the section.
 *
 * @param props - The setting descriptor plus its visible copy and disabled/note state.
 * @returns The toggle row, or null when the setting is unavailable on this preload.
 * @example
 * <FloatingPanelToggle setting={FLOATING_NAVIGATOR_PIN_SETTING} label="Keep Floating Navigator on top" />
 */
export const FloatingPanelToggle = function FloatingPanelToggle({
  setting,
  label,
  description,
  ariaLabel,
  disabled,
  note,
}: FloatingPanelToggleProps): ReactElement | null {
  const switchId = useId()
  const { value, isReady, isSaving, error, available, apply } =
    useFloatingPanelSetting(setting)

  // Hide the row entirely on web / an outdated preload (advisor: degrade a single
  // unavailable toggle by hiding it, never a per-toggle update card).
  if (!available) return null

  // Bridge Radix's (checked) callback to the async setter; `void` keeps this a
  // plain void event handler.
  const handleCheckedChange = (next: boolean): void => {
    void apply(next)
  }

  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between gap-4">
        <div className="space-y-0.5">
          <Label htmlFor={switchId} className="text-sm font-medium">
            {label}
          </Label>
          {description && (
            <p className="text-xs text-muted-foreground">{description}</p>
          )}
        </div>
        <Switch
          id={switchId}
          aria-label={ariaLabel}
          checked={value}
          // Disabled until the saved value loads (so a tap can't act on the
          // default) and while a save is in flight, plus any caller condition.
          disabled={disabled || isSaving || !isReady}
          onCheckedChange={handleCheckedChange}
        />
      </div>
      {note}
      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  )
}

export default FloatingPanelToggle
