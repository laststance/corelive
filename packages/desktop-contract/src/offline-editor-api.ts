import { z } from 'zod'

import type { SyncDetailRow } from './category-sync'
import type {
  ElectronConfigAPI,
  ElectronPanelsAPI,
  ElectronSettingsAPI,
  ElectronUpdaterAPI,
  LiveEditorSettingsAPI,
} from './electron-api'
import type { AccountStatus, SignOutResult } from './offline-account'
import type { OfflinePreferences } from './offline-workspace'
import {
  WorkspaceCommandSchema,
  type OfflineCommandResult,
  type OfflineCompletion,
  type OfflineDraftRecord,
  type OfflineEditorSnapshot,
  type OfflineWorkspace,
  type LocalCategory,
  type OfflineWorkspaceView,
  type OutboxEntry,
  type SyncHistoryItem,
  type WorkspaceCommand,
} from './offline-workspace-v2'

export interface OfflineDetailsPage {
  total: number
  records: { entry: OutboxEntry; completion: OfflineCompletion }[]
}
export interface OfflineUndoPage {
  total: number
  completions: OfflineCompletion[]
}
export interface OfflineRecoveryPage {
  total: number
  copies: OfflineWorkspace['recoveryCopies']
}
export interface OfflineRecoveryPreview {
  workspace: OfflineWorkspaceView
  savedAt: number
}
/** Everything the Sync details page renders (DA7, C34). */
export interface OfflineSyncDetails {
  rows: SyncDetailRow[]
  history: SyncHistoryItem[]
  migrationSummary: OfflineWorkspace['migration']['summary']
  preservedBackups: { fileName: string; accountId: string | null }[]
  dashboardOnlyCount: number
}
export type OfflineSettingsResult =
  | { ok: true; generation: number; preferences: OfflinePreferences }
  | { ok: false; reason: string }
export interface OfflineFlushRequest {
  requestId: string
  generation: number
}

/** Bundled editor capability; account identity and file locations are owned by main. */
export interface OfflineEditorAPI {
  version: 1
  snapshot: () => Promise<OfflineEditorSnapshot>
  draft: (generation: number, categoryId: string) => Promise<OfflineDraftRecord>
  command: (
    generation: number,
    command: WorkspaceCommand,
  ) => Promise<OfflineCommandResult>
  retry: () => Promise<void>
  details: (
    generation: number,
    offset: number,
    limit: number,
  ) => Promise<OfflineDetailsPage>
  undoHistory: (
    generation: number,
    offset: number,
    limit: number,
  ) => Promise<OfflineUndoPage>
  recoveryCopies: (
    generation: number,
    offset: number,
    limit: number,
  ) => Promise<OfflineRecoveryPage>
  signIn: () => Promise<void>
  /** Sync details page data (rows, History, C34 summary); read-only. */
  syncDetails: (generation: number) => Promise<OfflineSyncDetails>
  copyWriting: (generation: number, text: string) => Promise<boolean>
  export: (generation: number) => Promise<boolean>
  previewRecovery: (generation: number) => Promise<OfflineRecoveryPreview>
  recover: (generation: number) => Promise<boolean>
  subscribe: (listener: (snapshot: OfflineEditorSnapshot) => void) => () => void
  onFlush: (listener: (request: OfflineFlushRequest) => void) => () => void
  onShown: (listener: () => void) => () => void
  replyFlush: (request: OfflineFlushRequest, saved: boolean) => Promise<boolean>
}

/** What the bundled Settings window renders; the draft text never crosses this boundary. */
export type SettingsSnapshot =
  | {
      phase: 'ready'
      generation: number
      preferences: OfflinePreferences
      categories: LocalCategory[]
      account: AccountStatus
    }
  | {
      phase: 'opening' | 'recovery'
      generation: number
      account: AccountStatus
    }

/**
 * Named capabilities of the bundled Settings window (#216 D5), exposed as `window.settingsAPI`
 * by the sandboxed `preload-settings`. It carries no token, no filesystem path and no remote
 * URL; main owns every network call and the dashboard address (EA16).
 */
export interface SettingsWindowAPI {
  version: 1
  platform: string
  /** Current device-workspace projection plus account status. */
  snapshot: () => Promise<SettingsSnapshot>
  /** Fires after any workspace, preference or account change; re-read with {@link snapshot}. */
  onChanged: (listener: () => void) => () => void
  preferences: {
    /** Applies one revisioned preferences command to the device workspace. */
    patch: (
      generation: number,
      command: Extract<WorkspaceCommand, { type: 'preferences' }>,
    ) => Promise<OfflineSettingsResult>
  }
  categories: {
    /** Sends one category command (step-4b worker commands); works offline. */
    command: (
      generation: number,
      command: WorkspaceCommand,
    ) => Promise<OfflineCommandResult>
  }
  account: {
    status: () => Promise<AccountStatus>
    connect: () => Promise<boolean>
    notNow: () => Promise<SignOutResult>
    signIn: () => Promise<void>
    signOut: () => Promise<SignOutResult>
    /** Opens the dashboard at the configured server URL; the renderer supplies no address. */
    openDashboard: () => Promise<boolean>
  }
  /** Sync details page data (rows, History, C34 summary); read-only. */
  syncDetails: (generation: number) => Promise<OfflineSyncDetails>
  config: Pick<ElectronConfigAPI, 'get' | 'set' | 'open'>
  app: { getVersion: () => Promise<string> }
  updater: ElectronUpdaterAPI
  settings: ElectronSettingsAPI
  floatingPanels: ElectronPanelsAPI
  liveEditor: LiveEditorSettingsAPI
}

export interface OfflineIPCChannels {
  'offline-editor-draft': {
    request: [number, string]
    response: OfflineDraftRecord
  }
  'offline-editor-snapshot': { request: void; response: OfflineEditorSnapshot }
  'offline-editor-command': {
    request: [number, WorkspaceCommand]
    response: OfflineCommandResult
  }
  'offline-editor-retry': { request: void; response: void }
  'offline-editor-details': {
    request: [number, number, number]
    response: OfflineDetailsPage
  }
  'offline-editor-undo-history': {
    request: [number, number, number]
    response: OfflineUndoPage
  }
  'offline-editor-recovery-copies': {
    request: [number, number, number]
    response: OfflineRecoveryPage
  }
  'offline-editor-sign-in': { request: void; response: void }
  'offline-editor-sync-details': {
    request: number
    response: OfflineSyncDetails
  }
  'offline-editor-copy': { request: [number, string]; response: boolean }
  'offline-editor-export': { request: number; response: boolean }
  'offline-editor-preview-recovery': {
    request: number
    response: OfflineRecoveryPreview
  }
  'offline-editor-recover': { request: number; response: boolean }
  'offline-editor-flush-result': {
    request: [OfflineFlushRequest, boolean]
    response: boolean
  }
  'auth-session-unavailable': { request: void; response: void }
  'settings-window-snapshot': { request: void; response: SettingsSnapshot }
  'settings-window-preferences-patch': {
    request: [number, Extract<WorkspaceCommand, { type: 'preferences' }>]
    response: OfflineSettingsResult
  }
  'settings-window-category-command': {
    request: [number, WorkspaceCommand]
    response: OfflineCommandResult
  }
  'settings-window-sync-details': {
    request: number
    response: OfflineSyncDetails
  }
  'settings-window-account-status': { request: void; response: AccountStatus }
  'settings-window-account-connect': { request: void; response: boolean }
  'settings-window-account-not-now': { request: void; response: SignOutResult }
  'settings-window-account-sign-in': { request: void; response: void }
  'settings-window-account-sign-out': {
    request: void
    response: SignOutResult
  }
  'settings-window-account-open-dashboard': {
    request: void
    response: boolean
  }
}

/** Command types the Settings window may send through its category capability (D4, step 4b). */
const SETTINGS_CATEGORY_COMMAND_TYPES: ReadonlySet<string> = new Set([
  'categoryCreate',
  'categoryRename',
  'categoryRecolor',
  'categoryReparent',
  'categoryDelete',
  'syncDetailAction',
])

const generation = z.number().int().nonnegative()
const pagination = z.tuple([
  generation,
  z.number().int().nonnegative(),
  z.number().int().min(1).max(100),
])
/** Validates every offline invoke tuple before the exact window/frame authorization check. */
export const OFFLINE_IPC_ARGUMENT_SCHEMAS = {
  'offline-editor-draft': z.tuple([generation, z.uuid()]),
  'offline-editor-snapshot': z.tuple([]),
  'offline-editor-command': z.tuple([generation, WorkspaceCommandSchema]),
  'offline-editor-retry': z.tuple([]),
  'offline-editor-details': pagination,
  'offline-editor-undo-history': pagination,
  'offline-editor-recovery-copies': pagination,
  'offline-editor-sign-in': z.tuple([]),
  'offline-editor-sync-details': z.tuple([generation]),
  'offline-editor-copy': z.tuple([generation, z.string()]),
  'offline-editor-export': z.tuple([generation]),
  'offline-editor-preview-recovery': z.tuple([generation]),
  'offline-editor-recover': z.tuple([generation]),
  'offline-editor-flush-result': z.tuple([
    z.object({ requestId: z.uuid(), generation }),
    z.boolean(),
  ]),
  'auth-session-unavailable': z.tuple([]),
  'settings-window-snapshot': z.tuple([]),
  'settings-window-preferences-patch': z.tuple([
    generation,
    WorkspaceCommandSchema.refine((command) => command.type === 'preferences'),
  ]),
  'settings-window-category-command': z.tuple([
    generation,
    WorkspaceCommandSchema.refine((command) =>
      SETTINGS_CATEGORY_COMMAND_TYPES.has(command.type),
    ),
  ]),
  'settings-window-sync-details': z.tuple([generation]),
  'settings-window-account-status': z.tuple([]),
  'settings-window-account-connect': z.tuple([]),
  'settings-window-account-not-now': z.tuple([]),
  'settings-window-account-sign-in': z.tuple([]),
  'settings-window-account-sign-out': z.tuple([]),
  'settings-window-account-open-dashboard': z.tuple([]),
} satisfies Record<keyof OfflineIPCChannels, z.ZodType>
