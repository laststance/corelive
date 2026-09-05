'use client'

/**
 * @fileoverview One self-contained panel toggle row + the descriptor registry
 * the rows are driven by.
 *
 * The two panel booleans live apart in Settings — the Spaces toggle under
 * Application, the LiveEditor keep-on-top pin in the LiveEditor section. Each
 * row owns its own `usePanelSetting` (per-method skew guard, Arch-2), so an
 * outdated preload missing one setter hides only that row instead of the whole
 * section.
 *
 * @module components/electron/PanelToggle
 */
import { useId, type ReactElement, type ReactNode } from 'react'

import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import {
  usePanelSetting,
  type PanelSettingConfig,
} from '@/hooks/usePanelSetting'

/**
 * LiveEditor keep-on-top pin (default OFF — a dump surface you summon, not one
 * that hovers permanently). NB: these methods live on the panels bridge, NOT the
 * `liveEditor` bridge, so this row degrades on a different preload axis than the
 * LiveEditor note card it sits beside.
 */
export const LIVE_EDITOR_PIN_SETTING: PanelSettingConfig = {
  defaultValue: false,
  get: async (api) => {
    if (typeof api.getLiveEditorAlwaysOnTop === 'function') {
      return api.getLiveEditorAlwaysOnTop()
    }
    if (typeof api.getBrainDumpAlwaysOnTop === 'function') {
      return api.getBrainDumpAlwaysOnTop()
    }
    return false
  },
  set: async (api, next) => {
    if (typeof api.setLiveEditorAlwaysOnTop === 'function') {
      return api.setLiveEditorAlwaysOnTop(next)
    }
    if (typeof api.setBrainDumpAlwaysOnTop === 'function') {
      return api.setBrainDumpAlwaysOnTop(next)
    }
    return next
  },
  available: (api) =>
    (typeof api.getLiveEditorAlwaysOnTop === 'function' &&
      typeof api.setLiveEditorAlwaysOnTop === 'function') ||
    (typeof api.getBrainDumpAlwaysOnTop === 'function' &&
      typeof api.setBrainDumpAlwaysOnTop === 'function'),
}

/**
 * Show-on-all-Spaces visibility for LiveEditor (default OFF), surfaced under the
 * Application section since it is app-wide chrome.
 */
export const VISIBLE_ON_ALL_WORKSPACES_SETTING: PanelSettingConfig = {
  defaultValue: false,
  get: async (api) => api.getVisibleOnAllWorkspaces(),
  set: async (api, next) => api.setVisibleOnAllWorkspaces(next),
  available: (api) =>
    typeof api.getVisibleOnAllWorkspaces === 'function' &&
    typeof api.setVisibleOnAllWorkspaces === 'function',
}

interface PanelToggleProps {
  /** Which panel boolean this row reads + writes. */
  setting: PanelSettingConfig
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
 * A single labeled keep-on-top / visibility toggle backed by one panel setting.
 * Renders nothing when the setting's preload methods are absent (web or an
 * outdated desktop preload), so a skewed install simply omits the row rather
 * than showing a dead control or crashing the section.
 *
 * @param props - The setting descriptor plus its visible copy and disabled/note state.
 * @returns The toggle row, or null when the setting is unavailable on this preload.
 * @example
 * <PanelToggle setting={LIVE_EDITOR_PIN_SETTING} label="Keep on top" />
 */
export const PanelToggle = function PanelToggle({
  setting,
  label,
  description,
  ariaLabel,
  disabled,
  note,
}: PanelToggleProps): ReactElement | null {
  const switchId = useId()
  const { value, isReady, isSaving, error, available, apply } =
    usePanelSetting(setting)

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
