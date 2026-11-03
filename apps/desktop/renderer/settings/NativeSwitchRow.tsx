import { useCycleEffect } from '@corelive/live-editor/hooks/use-cycle-effect'
import { Label } from '@corelive/live-editor/ui/label'
import { Switch } from '@corelive/live-editor/ui/switch'
import { useState } from 'react'

import { log } from './lib/log'

/** Props of {@link NativeSwitchRow}. */
export interface NativeSwitchRowProps {
  /** DOM id of the switch; the description gets `${id}-description`. */
  id: string
  label: string
  description: string
  /** Reads the confirmed native value (login item or config.json). */
  load: () => Promise<boolean>
  /** Applies the value natively; resolves false when main could not apply it. */
  save: (checked: boolean) => Promise<boolean>
  /** Shown until the first native read resolves. */
  defaultValue: boolean
}

/**
 * One window-chrome switch whose single source of truth is native (login item or config.json).
 *
 * Loads the confirmed value on mount, applies a change through main first and only then shows
 * it, so the toggle never claims a state that was not applied (hide app icon, show in menu bar,
 * start at login). Used three times by {@link ElectronSettingsPage}'s Application section.
 *
 * @example
 * <NativeSwitchRow id="start-at-login" label="Start at Login" description="…" defaultValue={false} load={read} save={write} />
 */
export function NativeSwitchRow({
  id,
  label,
  description,
  load,
  save,
  defaultValue,
}: NativeSwitchRowProps) {
  const [checked, setChecked] = useState(defaultValue)
  useCycleEffect(() => {
    let alive = true
    load()
      .then((value) => alive && setChecked(value))
      .catch((error: unknown) => log.error(`Failed to load ${id}:`, error))
    return (): void => {
      alive = false
    }
  }, [id, load])
  const change = async (next: boolean): Promise<void> => {
    try {
      // An IPC refusal keeps the previous state so the toggle stays truthful.
      if (await save(next)) setChecked(next)
    } catch (error) {
      log.error(`Failed to update ${id}:`, error)
    }
  }
  return (
    <div className="flex items-center justify-between gap-4">
      <div className="min-w-0 space-y-1">
        <Label htmlFor={id} className="settings-label">
          {label}
        </Label>
        <p
          id={`${id}-description`}
          className="type-small leading-5 text-muted-foreground"
        >
          {description}
        </p>
      </div>
      <Switch
        className="shrink-0"
        id={id}
        aria-describedby={`${id}-description`}
        checked={checked}
        onCheckedChange={(next) => void change(next)}
      />
    </div>
  )
}
