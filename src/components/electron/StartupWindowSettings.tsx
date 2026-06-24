'use client'

/**
 * @fileoverview Startup-window settings for the Electron Settings page.
 *
 * Lets the user choose which window(s) CoreLive opens on launch — Brain Dump
 * and/or the Floating Navigator. The persisted choice lives in the main-process
 * config.json (read synchronously at boot, before auth/DB), so this component
 * reads and writes it through the typed `settings` preload API rather than
 * Redux. At least one window must always open, so the sole remaining enabled
 * toggle is disabled to keep the boot from landing on a blank desktop.
 *
 * @module components/electron/StartupWindowSettings
 */
import { Sunrise } from 'lucide-react'
import { useId, useState, type ReactElement } from 'react'

import { SettingsStateCard } from '@/components/electron/SettingsStateCard'
import { SETTINGS_SUBGROUP_LABEL_CLASS } from '@/components/settings/SettingsSection'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import {
  DEFAULT_STARTUP_WINDOW_CONFIG,
  type StartupWindowConfig,
} from '@/electron/types/ipc'
import { useCycleEffect } from '@/hooks/use-cycle-effect'
import { useMounted } from '@/hooks/use-mounted'
import { log } from '@/lib/logger'
import { cn } from '@/lib/utils'

interface StartupWindowSettingsProps {
  className?: string
}

/**
 * The startup-window choices, in the order they appear in the card. Kept
 * module-level (not rebuilt per render) since the labels/descriptions are
 * static; the live checked/disabled state is derived per row at render time.
 */
const STARTUP_WINDOW_OPTIONS: ReadonlyArray<{
  key: keyof StartupWindowConfig
  label: string
  description: string
}> = [
  {
    key: 'showBraindump',
    label: 'Brain Dump',
    description: 'A quiet space to empty your head.',
  },
  {
    key: 'showFloating',
    label: 'Floating Navigator',
    description: 'A compact panel that floats above your other apps.',
  },
]

/**
 * Settings card for choosing which window(s) open when CoreLive launches.
 *
 * Loads the persisted startup config from the main process on mount, then
 * persists each toggle optimistically (rolling back on failure). The last
 * enabled toggle is locked so a launch always surfaces at least one window.
 *
 * @param props - Component props
 * @param props.className - Optional className forwarded to the Card
 * @returns Settings card, a loading card, or a desktop-app-only fallback
 * @example
 * <StartupWindowSettings />
 */
export const StartupWindowSettings = function StartupWindowSettings({
  className,
}: StartupWindowSettingsProps): ReactElement {
  const baseId = useId()
  const hasMounted = useMounted()
  const [isReady, setIsReady] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const [startup, setStartup] = useState<StartupWindowConfig>({
    ...DEFAULT_STARTUP_WINDOW_CONFIG,
  })
  const [error, setError] = useState<string | null>(null)

  // Fetch the saved config once after mount; the fallback branch below handles
  // non-Electron renderers, so this effect simply no-ops when the API is absent.
  useCycleEffect(() => {
    const api =
      typeof window === 'undefined' ? undefined : window.electronAPI?.settings
    // Guard on the METHOD, not just the namespace: an outdated desktop preload
    // can expose `settings` (shipped earlier for hide-app-icon) without the
    // newer getStartupConfig. Calling a missing method here throws synchronously
    // inside the effect, and that throw bubbles past the .catch() below to
    // Next.js global-error. The missing-method render branch handles this case.
    if (typeof api?.getStartupConfig !== 'function') return

    let cancelled = false

    void api
      .getStartupConfig()
      .then((saved) => {
        if (cancelled) return
        setStartup(saved)
      })
      .catch((loadError: unknown) => {
        log.error('Failed to load startup window settings:', loadError)
        if (!cancelled) {
          setError('Failed to load startup window settings')
        }
      })
      .finally(() => {
        if (!cancelled) setIsReady(true)
      })

    return () => {
      cancelled = true
    }
  }, [])

  /**
   * Persists a single startup-window toggle, applying it optimistically and
   * rolling back if the main process fails to save.
   *
   * @param key - Which window's flag is changing (showBraindump / showFloating)
   * @param next - true to open that window at launch, false to skip it
   * @returns Promise that resolves once the save settles (success or rollback)
   */
  const handleToggle = async (
    key: keyof StartupWindowConfig,
    next: boolean,
  ): Promise<void> => {
    const previous = startup
    const optimistic: StartupWindowConfig = { ...startup, [key]: next }
    setStartup(optimistic)
    setIsSaving(true)
    setError(null)

    try {
      const api = window.electronAPI?.settings
      // If the preload bridge disappears, rollback instead of showing a saved
      // value the main process never persisted.
      if (!api) {
        throw new Error('Electron settings API is not available')
      }

      const didSave = await api.setStartupConfig(optimistic)
      if (!didSave) {
        throw new Error('Main process did not persist the startup config')
      }
    } catch (saveError: unknown) {
      log.error('Failed to update startup window settings:', saveError)
      setStartup(previous)
      setError('Failed to update startup window settings')
    } finally {
      setIsSaving(false)
    }
  }

  if (hasMounted && !window.electronAPI?.settings) {
    return (
      <SettingsStateCard
        icon={Sunrise}
        title="On launch"
        description="Startup window settings are only available in the desktop application."
        className={className}
      />
    )
  }

  // Outdated desktop app: the settings bridge exists but predates
  // getStartupConfig, so reading the saved config is impossible. Invite an
  // update in the quiet-companion voice instead of crashing the whole page.
  if (
    hasMounted &&
    typeof window.electronAPI?.settings?.getStartupConfig !== 'function'
  ) {
    return (
      <SettingsStateCard
        icon={Sunrise}
        title="On launch"
        description="Update CoreLive to the latest version to choose which windows greet you at launch."
        className={className}
      />
    )
  }

  if (!isReady) {
    return (
      <SettingsStateCard
        icon={Sunrise}
        title="On launch"
        description="Loading startup window settings…"
        className={className}
      />
    )
  }

  // The >=1-true invariant is enforced in the main process, but we mirror it
  // here so the last enabled toggle is visibly locked rather than silently
  // re-checked after a save (which would read as a glitch).
  const enabledCount = [startup.showBraindump, startup.showFloating].filter(
    Boolean,
  ).length

  return (
    // "On launch" demoted from a card title to a sub-group caption inside the
    // Application section (design-review D1 flatten) — it brackets the two launch
    // toggles below it, the lone sub-caption left after the regroup.
    <div className={cn('space-y-3', className)}>
      <div className="space-y-0.5">
        <p className={SETTINGS_SUBGROUP_LABEL_CLASS}>On launch</p>
        <p className="text-xs text-muted-foreground">
          Pick what greets you when CoreLive opens.
        </p>
      </div>

      {error && (
        <div className="bg-destructive/10 rounded-md p-3 text-sm text-destructive">
          {error}
        </div>
      )}

      {STARTUP_WINDOW_OPTIONS.map((option) => {
        const isEnabled = startup[option.key]
        // Lock the sole remaining enabled toggle so a launch never lands on a
        // blank desktop with nothing open.
        const isLastEnabled = isEnabled && enabledCount === 1

        return (
          <StartupWindowToggleRow
            key={option.key}
            switchId={`${baseId}-${option.key}`}
            optionKey={option.key}
            label={option.label}
            description={option.description}
            checked={isEnabled}
            disabled={isSaving || isLastEnabled}
            onToggleAction={handleToggle}
          />
        )
      })}

      <p className="text-xs text-muted-foreground">
        At least one window opens at launch.
      </p>
    </div>
  )
}

interface StartupWindowToggleRowProps {
  /** DOM id shared by the Label and Switch for accessible association. */
  switchId: string
  /** Which startup flag this row controls. */
  optionKey: keyof StartupWindowConfig
  /** Human-readable window name. */
  label: string
  /** One-line description shown under the label. */
  description: string
  /** Whether this window currently opens at launch. */
  checked: boolean
  /** Locked when saving, or when this is the sole enabled window. */
  disabled: boolean
  /** Persist a flip of this row's flag (handled by the parent). */
  onToggleAction: (
    optionKey: keyof StartupWindowConfig,
    next: boolean,
  ) => Promise<void>
}

/**
 * One labeled toggle row in the startup-window card. Extracted from the parent's
 * `.map` so its `onCheckedChange` can be a stable `useCallback` — an inline arrow
 * inside the map would allocate a fresh handler every render.
 *
 * @param props - Row props (id, copy, current state, and the keyed parent handler)
 * @returns A label/description paired with its toggle switch
 */
const StartupWindowToggleRow = function StartupWindowToggleRow({
  switchId,
  optionKey,
  label,
  description,
  checked,
  disabled,
  onToggleAction,
}: StartupWindowToggleRowProps): ReactElement {
  // Bridge Radix's (checked) callback to the keyed parent handler; `void`
  // discards the returned promise so this stays a plain void event handler.
  const handleCheckedChange = (next: boolean): void => {
    void onToggleAction(optionKey, next)
  }

  return (
    <div className="flex items-center justify-between gap-4">
      <div className="space-y-0.5">
        <Label htmlFor={switchId} className="text-sm font-medium">
          {label}
        </Label>
        <p className="text-xs text-muted-foreground">{description}</p>
      </div>
      <Switch
        id={switchId}
        checked={checked}
        disabled={disabled}
        onCheckedChange={handleCheckedChange}
      />
    </div>
  )
}

export default StartupWindowSettings
