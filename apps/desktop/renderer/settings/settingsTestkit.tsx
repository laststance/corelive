import type {
  AccountStatus,
  SignInStartResult,
  SignOutResult,
} from '@corelive/desktop-contract/offline-account'
import type {
  OfflineSyncDetails,
  SettingsSnapshot,
  SettingsWindowAPI,
} from '@corelive/desktop-contract/offline-editor-api'
import type { OfflinePreferences } from '@corelive/desktop-contract/offline-workspace'
import type { LocalCategory } from '@corelive/desktop-contract/offline-workspace-v2'
import { UserSettingsStateSchema } from '@corelive/desktop-contract/settings'
import { act, render } from '@testing-library/react'
import { vi } from 'vitest'

import { SettingsProvider } from './SettingsProvider'

/** A signed-out, never-attached account, the default first-run state (DA3 state A). */
const NEVER_ATTACHED_ACCOUNT: AccountStatus = {
  state: 'never-attached',
  boundEmail: null,
  signedInEmail: null,
  waitingCount: 0,
  needsALookCount: 0,
  lastSyncedAt: null,
  pendingConnect: null,
  firstUpload: null,
  signIn: 'idle',
}

/** An empty Sync details payload ("No sync issues"). */
export const EMPTY_SYNC_DETAILS: OfflineSyncDetails = {
  rows: [],
  history: [],
  migrationSummary: null,
  preservedBackups: [],
  dashboardOnlyCount: 0,
}

/** The device workspace's default General category. */
export const GENERAL_CATEGORY: LocalCategory = {
  id: '00000000-0000-4000-8000-000000000001',
  name: 'General',
  color: 'blue',
  isDefault: true,
  parentId: null,
  removed: false,
  historical: false,
  fieldRevisions: { name: 0, color: 0, parentLocalId: 0 },
}

/** Options of {@link createFakeSettingsApi}. */
export interface FakeSettingsOptions {
  settings?: Partial<OfflinePreferences['settings']>
  theme?: string
  categories?: LocalCategory[]
  phase?: 'ready' | 'opening'
  /** Overrides of the account status (DA3 states A-D, pending connect, ...). */
  account?: Partial<AccountStatus>
  /** The Sync details payload main would return. */
  syncDetails?: OfflineSyncDetails
}

/**
 * Builds an in-memory `window.settingsAPI` whose preference patches behave like main:
 * a stale `expectedRevision` is refused with `revision-conflict`, a valid one bumps the revision.
 * Used by every Settings component test so assertions read the persisted workspace, not React state.
 * @example
 * const fake = createFakeSettingsApi({ settings: { showTodayEmber: true } })
 */
export function createFakeSettingsApi(options: FakeSettingsOptions = {}) {
  const stored: OfflinePreferences = {
    revision: 1,
    settings: UserSettingsStateSchema.parse(options.settings ?? {}),
    theme: options.theme ?? 'system',
  }
  let categories = options.categories ?? [GENERAL_CATEGORY]
  let account: AccountStatus = { ...NEVER_ATTACHED_ACCOUNT, ...options.account }
  let syncDetails = options.syncDetails ?? EMPTY_SYNC_DETAILS
  const listeners = new Set<() => void>()
  const snapshot = (): SettingsSnapshot =>
    options.phase === 'opening'
      ? { phase: 'opening', generation: 1, account }
      : {
          phase: 'ready',
          generation: 1,
          preferences: structuredClone(stored),
          categories,
          account,
        }
  const api = {
    version: 1,
    platform: 'darwin',
    snapshot: vi.fn(async () => snapshot()),
    onChanged: vi.fn((listener: () => void) => {
      listeners.add(listener)
      return (): void => {
        listeners.delete(listener)
      }
    }),
    preferences: {
      patch: vi.fn(async (_generation, command) => {
        if (command.expectedRevision !== stored.revision)
          return { ok: false as const, reason: 'revision-conflict' }
        Object.assign(stored.settings, command.patch)
        if (command.theme !== undefined) stored.theme = command.theme
        stored.revision++
        return {
          ok: true as const,
          generation: 1,
          preferences: structuredClone(stored),
        }
      }),
    },
    categories: {
      command: vi.fn(async () => ({
        ok: true as const,
        generation: 1,
        revision: 2,
        workspace: null,
      })),
    },
    account: {
      status: vi.fn(async () => account),
      connect: vi.fn(async () => true),
      notNow: vi.fn(async (): Promise<SignOutResult> => ({
        status: 'signed-out',
      })),
      signIn: vi.fn(async (): Promise<SignInStartResult> => ({
        status: 'opened',
      })),
      cancelSignIn: vi.fn(async () => undefined),
      signOut: vi.fn(async (): Promise<SignOutResult> => ({
        status: 'signed-out',
      })),
      clearAgain: vi.fn(async (): Promise<SignOutResult> => ({
        status: 'signed-out',
      })),
      acknowledgeFirstUpload: vi.fn(async () => undefined),
      openDashboard: vi.fn(async () => true),
    },
    syncDetails: vi.fn(async () => structuredClone(syncDetails)),
    config: {
      get: vi.fn(
        async (_path: string, fallback?: unknown) => fallback,
      ) as SettingsWindowAPI['config']['get'] & ReturnType<typeof vi.fn>,
      set: vi.fn(async () => true),
      open: vi.fn(async () => true),
    },
    app: { getVersion: vi.fn(async () => '0.0.0') },
    updater: {
      checkForUpdates: vi.fn(async () => true),
      quitAndInstall: vi.fn(async () => true),
      getStatus: vi.fn(async () => ({
        updateAvailable: false,
        updateDownloaded: false,
        downloadProgress: null,
        isChecking: false,
        message: null,
      })),
    },
    settings: {
      setHideAppIcon: vi.fn(async () => true),
      setShowInMenuBar: vi.fn(async () => true),
      setStartAtLogin: vi.fn(async () => true),
      getLoginItemSettings: vi.fn(async () => ({ openAtLogin: false })),
      resetPopoverSize: vi.fn(async () => true),
    },
    floatingPanels: {
      getVisibleOnAllWorkspaces: vi.fn(async () => false),
      setVisibleOnAllWorkspaces: vi.fn(async () => true),
      getLiveEditorAlwaysOnTop: vi.fn(async () => false),
      setLiveEditorAlwaysOnTop: vi.fn(async () => true),
    },
    liveEditor: {
      show: vi.fn(async () => undefined),
      getOpacity: vi.fn(async () => 1),
      setOpacity: vi.fn(async (value: number) => value),
      getShortcut: vi.fn(async () => ''),
      setShortcut: vi.fn(async () => true),
      getShortcutSecondary: vi.fn(async () => ''),
      setShortcutSecondary: vi.fn(async () => true),
    },
  } satisfies SettingsWindowAPI
  return {
    api,
    /** The preferences main would have persisted. */
    stored,
    /** Replaces the account status and notifies like a main-side change. */
    setAccount(next: Partial<AccountStatus>): void {
      account = { ...account, ...next }
      for (const listener of listeners) listener()
    },
    /** Replaces the Sync details payload and notifies like a main-side change. */
    setSyncDetails(next: OfflineSyncDetails): void {
      syncDetails = next
      for (const listener of listeners) listener()
    },
    /** Replaces the category list and notifies like a main-side change. */
    setCategories(next: LocalCategory[]): void {
      categories = next
      for (const listener of listeners) listener()
    },
  }
}

/**
 * Renders UI under a {@link SettingsProvider} backed by a fake preload and waits for the first snapshot.
 * @param ui - The Settings component under test.
 * @param options - Initial persisted workspace state.
 * @returns The fake (for persisted-state assertions) and the testing-library result.
 * @example
 * const { fake } = await renderWithSettings(<TodayEmberSetting />)
 */
export async function renderWithSettings(
  ui: React.ReactElement,
  options: FakeSettingsOptions = {},
) {
  const fake = createFakeSettingsApi(options)
  Object.defineProperty(window, 'settingsAPI', {
    configurable: true,
    value: fake.api,
  })
  let result!: ReturnType<typeof render>
  await act(async () => {
    result = render(<SettingsProvider api={fake.api}>{ui}</SettingsProvider>)
  })
  return { fake, ...result }
}
