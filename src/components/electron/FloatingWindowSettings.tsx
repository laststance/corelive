'use client'

/**
 * @fileoverview Floating utility window settings for the Electron Settings page.
 *
 * Surfaces cross-window behavior shared by Floating Navigator and BrainDump:
 * whether they follow macOS Spaces, and whether each one stays pinned above
 * other windows. The main process owns the actual BrowserWindow calls so this
 * component only reads and writes the typed preload API.
 *
 * @module components/electron/FloatingWindowSettings
 */
import { Monitor } from 'lucide-react'
import { memo, useCallback, type ReactElement } from 'react'
import { useId, useState } from 'react'

import { SettingsStateCard } from '@/components/electron/SettingsStateCard'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { useCycleEffect } from '@/hooks/use-cycle-effect'
import { useMounted } from '@/hooks/use-mounted'
import { log } from '@/lib/logger'

interface FloatingWindowSettingsProps {
  className?: string
}

/** The preload bridge this card drives (reused from the electron-api source of truth). */
type FloatingPanelsBridge = NonNullable<
  NonNullable<Window['electronAPI']>['floatingPanels']
>

/** The three independent preferences this card persists. */
type PreferenceKey =
  | 'visibleOnAllWorkspaces'
  | 'floatingAlwaysOnTop'
  | 'brainDumpAlwaysOnTop'

/** Persists + applies each preference through the matching preload method. */
const PREFERENCE_SETTERS: Record<
  PreferenceKey,
  (api: FloatingPanelsBridge, next: boolean) => Promise<boolean>
> = {
  visibleOnAllWorkspaces: async (api, next) =>
    api.setVisibleOnAllWorkspaces(next),
  floatingAlwaysOnTop: async (api, next) =>
    api.setFloatingNavigatorAlwaysOnTop(next),
  brainDumpAlwaysOnTop: async (api, next) => api.setBrainDumpAlwaysOnTop(next),
}

/**
 * True only when the preload exposes the COMPLETE floating-panels surface this
 * card needs (the desktop-Spaces pair AND both always-on-top pairs). An outdated
 * desktop preload that has `floatingPanels` but predates always-on-top degrades
 * to the update-prompt card instead of throwing inside the load.
 * @param api - The floatingPanels bridge, or undefined on web / an old preload.
 * @returns true when every method this card calls is present.
 */
function hasCompleteFloatingPanelsApi(
  api: FloatingPanelsBridge | undefined,
): api is FloatingPanelsBridge {
  return (
    typeof api?.getVisibleOnAllWorkspaces === 'function' &&
    typeof api?.setVisibleOnAllWorkspaces === 'function' &&
    typeof api?.getFloatingNavigatorAlwaysOnTop === 'function' &&
    typeof api?.setFloatingNavigatorAlwaysOnTop === 'function' &&
    typeof api?.getBrainDumpAlwaysOnTop === 'function' &&
    typeof api?.setBrainDumpAlwaysOnTop === 'function'
  )
}

/**
 * Settings card for Floating Navigator + BrainDump desktop behavior.
 *
 * Loads the persisted Spaces + always-on-top preferences from Electron on mount.
 * Toggling any switch optimistically updates, persists the value, and rolls back
 * if the main process rejects the change.
 *
 * @param props - Component props
 * @param props.className - Optional className forwarded to the Card
 * @returns Settings card or a compact desktop-app-only fallback
 * @example
 * <FloatingWindowSettings />
 */
export const FloatingWindowSettings = memo(function FloatingWindowSettings({
  className,
}: FloatingWindowSettingsProps): ReactElement {
  const desktopTrackingId = useId()
  const floatingPinId = useId()
  const brainDumpPinId = useId()
  const hasMounted = useMounted()
  const [isReady, setIsReady] = useState(false)
  // Which preferences have an in-flight save — drives per-row disabled state so
  // one toggle never freezes the others.
  const [savingKeys, setSavingKeys] = useState<ReadonlySet<PreferenceKey>>(
    () => new Set(),
  )
  // Defaults mirror the config defaults (floating pinned, BrainDump not) but are
  // only shown after the mount load resolves real values.
  const [values, setValues] = useState<Record<PreferenceKey, boolean>>({
    visibleOnAllWorkspaces: false,
    floatingAlwaysOnTop: true,
    brainDumpAlwaysOnTop: false,
  })
  const [error, setError] = useState<string | null>(null)

  // Fetch all three preferences once after mount; the fallback branches below
  // handle non-Electron and outdated-preload renderers without a second path.
  useCycleEffect(() => {
    const api =
      typeof window === 'undefined'
        ? undefined
        : window.electronAPI?.floatingPanels
    // Guard on the full method set, not just the namespace, so an outdated
    // desktop preload degrades to the fallback card instead of throwing.
    if (!hasCompleteFloatingPanelsApi(api)) return

    let cancelled = false

    void Promise.all([
      api.getVisibleOnAllWorkspaces(),
      api.getFloatingNavigatorAlwaysOnTop(),
      api.getBrainDumpAlwaysOnTop(),
    ])
      .then(
        ([
          visibleOnAllWorkspaces,
          floatingAlwaysOnTop,
          brainDumpAlwaysOnTop,
        ]) => {
          if (cancelled) return
          setValues({
            visibleOnAllWorkspaces,
            floatingAlwaysOnTop,
            brainDumpAlwaysOnTop,
          })
        },
      )
      .catch((loadError: unknown) => {
        log.error('Failed to load floating window settings:', loadError)
        if (!cancelled) {
          setError('Failed to load floating window settings')
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
   * Optimistically toggles one preference, persists it, and rolls back on error.
   *
   * @param key - Which preference the switch controls
   * @param next - The requested value
   * @returns Promise that resolves once the main process confirms or rejects
   */
  const applyPreference = useCallback(
    async (key: PreferenceKey, next: boolean): Promise<void> => {
      const api = window.electronAPI?.floatingPanels
      // If the preload bridge disappears, do nothing rather than show an
      // un-persisted value.
      if (!api) return

      const previous = values[key]
      setValues((current) => ({ ...current, [key]: next }))
      setSavingKeys((current) => new Set(current).add(key))
      setError(null)

      try {
        const applied = await PREFERENCE_SETTERS[key](api, next)
        setValues((current) => ({ ...current, [key]: applied }))
      } catch (saveError: unknown) {
        log.error('Failed to update floating window settings:', saveError)
        // Roll back to the value before the optimistic flip.
        setValues((current) => ({ ...current, [key]: previous }))
        setError('Failed to update floating window settings')
      } finally {
        setSavingKeys((current) => {
          const updated = new Set(current)
          updated.delete(key)
          return updated
        })
      }
    },
    [values],
  )

  if (hasMounted && !window.electronAPI?.floatingPanels) {
    return (
      <SettingsStateCard
        icon={Monitor}
        title="Floating windows"
        description="Floating window settings are only available in the desktop application."
        className={className}
      />
    )
  }

  // Outdated desktop app: the floatingPanels bridge exists but predates one of
  // the methods this card needs. Invite an update instead of crashing the page.
  if (
    hasMounted &&
    !hasCompleteFloatingPanelsApi(window.electronAPI?.floatingPanels)
  ) {
    return (
      <SettingsStateCard
        icon={Monitor}
        title="Floating windows"
        description="Update CoreLive to the latest version to manage floating windows."
        className={className}
      />
    )
  }

  if (!isReady) {
    return (
      <SettingsStateCard
        icon={Monitor}
        title="Floating windows"
        description="Loading floating window settings…"
        className={className}
      />
    )
  }

  const platform =
    typeof window === 'undefined' ? undefined : window.electronEnv?.platform
  const isMac = !platform || platform === 'darwin'

  return (
    <Card className={className}>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Monitor className="h-5 w-5" />
          Floating windows
        </CardTitle>
        <CardDescription>
          Shared behavior for Floating Navigator and BrainDump.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {error && (
          <div className="bg-destructive/10 rounded-md p-3 text-sm text-destructive">
            {error}
          </div>
        )}

        <FloatingToggleRow
          switchId={desktopTrackingId}
          optionKey="visibleOnAllWorkspaces"
          label="Show on all Mac desktops"
          description="Keep both panels visible while switching Spaces, including fullscreen Spaces."
          checked={values.visibleOnAllWorkspaces}
          disabled={!isMac || savingKeys.has('visibleOnAllWorkspaces')}
          onToggleAction={applyPreference}
        />

        {!isMac && (
          <p className="text-xs text-muted-foreground">
            This option only applies on macOS.
          </p>
        )}

        {/* Keep-on-top group: per-window pinning, default on for Floating only. */}
        <div className="space-y-3 border-t pt-4">
          <div className="space-y-0.5">
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Keep on top
            </p>
            <p className="text-xs text-muted-foreground">
              Pin a panel above your other windows so it stays visible.
            </p>
          </div>

          <FloatingToggleRow
            switchId={floatingPinId}
            optionKey="floatingAlwaysOnTop"
            label="Floating Navigator"
            ariaLabel="Keep Floating Navigator on top"
            checked={values.floatingAlwaysOnTop}
            disabled={savingKeys.has('floatingAlwaysOnTop')}
            onToggleAction={applyPreference}
          />

          <FloatingToggleRow
            switchId={brainDumpPinId}
            optionKey="brainDumpAlwaysOnTop"
            label="BrainDump"
            ariaLabel="Keep BrainDump on top"
            checked={values.brainDumpAlwaysOnTop}
            disabled={savingKeys.has('brainDumpAlwaysOnTop')}
            onToggleAction={applyPreference}
          />
        </div>
      </CardContent>
    </Card>
  )
})

interface FloatingToggleRowProps {
  switchId: string
  optionKey: PreferenceKey
  label: string
  /** Optional helper copy under the label; omitted for the compact pin rows. */
  description?: string
  /**
   * Optional self-describing accessible name for the Switch. The compact pin
   * rows show a short visible label ("Floating Navigator") under a "Keep on
   * top" group caption, but that caption isn't programmatically tied to the
   * switch — so a screen reader would announce "Floating Navigator, switch, on"
   * with no verb. Pass the full action here ("Keep Floating Navigator on top");
   * the visible label stays a substring, satisfying WCAG 2.5.3 Label-in-Name.
   */
  ariaLabel?: string
  checked: boolean
  disabled?: boolean
  onToggleAction: (key: PreferenceKey, next: boolean) => Promise<void>
}

/**
 * One labeled toggle row in the floating-windows card. Extracted so its
 * `onCheckedChange` can be a stable `useCallback` keyed by `optionKey` — an
 * inline arrow in the parent would allocate a fresh handler every render.
 *
 * @param props - Row props (ids, copy, current state, and the keyed parent handler)
 * @returns A label/description paired with its toggle switch
 */
const FloatingToggleRow = memo(function FloatingToggleRow({
  switchId,
  optionKey,
  label,
  description,
  ariaLabel,
  checked,
  disabled,
  onToggleAction,
}: FloatingToggleRowProps): ReactElement {
  // Bridge Radix's (checked) callback to the keyed parent handler; `void`
  // discards the returned promise so this stays a plain void event handler.
  const handleCheckedChange = useCallback(
    (next: boolean): void => {
      void onToggleAction(optionKey, next)
    },
    [onToggleAction, optionKey],
  )

  return (
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
        checked={checked}
        disabled={disabled}
        onCheckedChange={handleCheckedChange}
      />
    </div>
  )
})

export default FloatingWindowSettings
