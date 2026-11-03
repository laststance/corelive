import type {
  SettingsSnapshot,
  SettingsWindowAPI,
} from '@corelive/desktop-contract/offline-editor-api'
import type { WorkspaceCommand } from '@corelive/desktop-contract/offline-workspace-v2'
import {
  UserSettingsStateSchema,
  type UserSettingsState,
} from '@corelive/desktop-contract/settings'
import { useCycleEffect } from '@corelive/live-editor/hooks/use-cycle-effect'
import { DEFAULT_THEME_PREFERENCE } from '@corelive/live-editor/themes'
import {
  createContext,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from 'react'

import type { CategoryCommandOutcome } from '../editor/categoryCopy'
import { useEditorTheme } from '../editor/useEditorTheme'

import {
  EMPTY_CHANGE,
  PreferenceWriter,
  type PendingChange,
} from './PreferenceWriter'

const DEFAULT_SETTINGS = UserSettingsStateSchema.parse({})

/** What every Settings control reads and writes; the single bridge to main-owned preferences. */
export interface SettingsContextValue {
  api: SettingsWindowAPI
  snapshot: SettingsSnapshot
  /** The stored settings with unacknowledged edits applied, so controls respond instantly. */
  settings: UserSettingsState
  theme: string
  /** True after main refused or lost a preference write; the edit was reverted. */
  saveFailed: boolean
  updateSettings: (patch: Partial<UserSettingsState>) => void
  updateTheme: (theme: string) => void
  sendCategoryCommand: (
    command: WorkspaceCommand,
  ) => Promise<CategoryCommandOutcome>
  refresh: () => Promise<void>
}

const SettingsContext = createContext<SettingsContextValue | null>(null)

/**
 * Reads the Settings data layer.
 * @returns The provider value.
 * @throws When used outside {@link SettingsProvider}.
 * @example const { settings, updateSettings } = useSettings()
 */
export function useSettings(): SettingsContextValue {
  const value = useContext(SettingsContext)
  if (!value) throw new Error('useSettings requires SettingsProvider')
  return value
}

/**
 * Applies the workspace theme to `<html>` in a layout effect, so it lands before the first paint
 * of any Settings content (DA11). Mounted only once a snapshot exists, so the default theme never flashes.
 */
function ThemeApplier({ theme }: { theme: string }): null {
  useEditorTheme(theme)
  return null
}

/**
 * Loads the device-workspace projection through the preload and keeps it fresh.
 *
 * Replaces the web's Redux store, next-themes and `OfflinePreferenceSync`: preferences are
 * main-owned, edits apply optimistically, travel as one revisioned `preferences` command at a
 * time (latest wins), and a revision conflict re-reads and retries once. Children render only
 * after the first snapshot so `data-theme` is applied before the first painted frame (DA11).
 * Mounted once by the Settings entry.
 *
 * @param api - The `window.settingsAPI` capability bridge.
 * @param children - Settings UI; not rendered until the first snapshot arrives.
 * @example
 * <SettingsProvider api={window.settingsAPI}><SettingsApp /></SettingsProvider>
 */
export function SettingsProvider({
  api,
  children,
}: {
  api: SettingsWindowAPI
  children: ReactNode
}) {
  const [snapshot, setSnapshot] = useState<SettingsSnapshot | null>(null)
  const [overlay, setOverlay] = useState<PendingChange>(EMPTY_CHANGE)
  const [saveFailed, setSaveFailed] = useState(false)
  const [writer] = useState(
    () =>
      new PreferenceWriter(api, {
        onSnapshot: setSnapshot,
        onOverlay: setOverlay,
        onSaveFailed: setSaveFailed,
      }),
  )

  // Initial read, then re-read after every main-side change notification.
  useCycleEffect(() => {
    let alive = true
    const read = (): void => {
      void writer.refresh().catch(() => undefined)
    }
    read()
    const unsubscribe = api.onChanged(() => alive && read())
    return (): void => {
      alive = false
      unsubscribe()
    }
  }, [api, writer])

  // Unacknowledged edits sit on top of the stored value so a slider never snaps back mid-drag.
  const base = snapshot?.phase === 'ready' ? snapshot.preferences : null
  const settings = useMemo(
    () => ({ ...(base?.settings ?? DEFAULT_SETTINGS), ...overlay.settings }),
    [base, overlay.settings],
  )
  const theme = overlay.theme ?? base?.theme ?? DEFAULT_THEME_PREFERENCE

  if (!snapshot) return null
  const value: SettingsContextValue = {
    api,
    snapshot,
    settings,
    theme,
    saveFailed,
    updateSettings: (patch) => writer.queue({ settings: patch }),
    updateTheme: (next) => writer.queue({ settings: {}, theme: next }),
    sendCategoryCommand: async (command) => writer.sendCategoryCommand(command),
    refresh: async () => writer.refresh(),
  }
  return (
    <SettingsContext value={value}>
      <ThemeApplier theme={theme} />
      {children}
    </SettingsContext>
  )
}
