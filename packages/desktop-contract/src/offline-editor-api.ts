import { z } from 'zod'

import {
  OfflinePreferencesSchema,
  WorkspaceCommandSchema,
  type OfflineCommandResult,
  type OfflineCompletion,
  type OfflineEditorSnapshot,
  type OfflinePreferences,
  type OfflineWorkspaceView,
  type OfflineWorkspace,
  type OfflineDraftRecord,
  type OutboxEntry,
  type WorkspaceCommand,
} from './offline-workspace'

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
export const OfflineCategoryActionSchema = z.object({
  action: z.enum(['create', 'manage']),
  initialName: z.string().max(255).optional(),
})
export type OfflineCategoryAction = z.infer<typeof OfflineCategoryActionSchema>
export type OfflineCategoryRequest = OfflineCategoryAction & {
  generation: number
}
export interface OfflineSettingsContext {
  generation: number
  preferences: OfflinePreferences | null
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
  draft: (generation: number, categoryId: number) => Promise<OfflineDraftRecord>
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
  manageCategories: (request?: OfflineCategoryAction) => Promise<void>
  copyWriting: (generation: number, text: string) => Promise<boolean>
  export: (generation: number) => Promise<boolean>
  previewRecovery: (generation: number) => Promise<OfflineRecoveryPreview>
  recover: (generation: number) => Promise<boolean>
  subscribe: (listener: (snapshot: OfflineEditorSnapshot) => void) => () => void
  onFlush: (listener: (request: OfflineFlushRequest) => void) => () => void
  onShown: (listener: () => void) => () => void
  onCategoryCreated: (
    listener: (selection: { generation: number; categoryId: number }) => void,
  ) => () => void
  replyFlush: (request: OfflineFlushRequest, saved: boolean) => Promise<boolean>
}

/** Remote Settings transfers hydrated preferences only for its verified account challenge. */
export interface OfflineSettingsAPI {
  version: 1
  read: (accountId: string) => Promise<OfflineSettingsContext | null>
  prepare: (
    accountId: string,
    generation: number,
    preferences: OfflinePreferences,
  ) => Promise<boolean>
  patch: (
    accountId: string,
    generation: number,
    command: Extract<WorkspaceCommand, { type: 'preferences' }>,
  ) => Promise<OfflineSettingsResult>
  onChanged: (listener: () => void) => () => void
  onManageCategories: (listener: () => void) => () => void
  consumeCategoryRequest: () => Promise<OfflineCategoryRequest | null>
  categoryCreated: (
    accountId: string,
    generation: number,
    categoryId: number,
  ) => Promise<boolean>
  refreshCategories: () => Promise<void>
}

export interface OfflineIPCChannels {
  'offline-editor-draft': {
    request: [number, number]
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
  'offline-editor-manage-categories': {
    request: OfflineCategoryAction
    response: void
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
  'offline-settings-read': {
    request: string
    response: OfflineSettingsContext | null
  }
  'offline-settings-prepare': {
    request: [string, number, OfflinePreferences]
    response: boolean
  }
  'offline-settings-patch': {
    request: [
      string,
      number,
      Extract<WorkspaceCommand, { type: 'preferences' }>,
    ]
    response: OfflineSettingsResult
  }
  'auth-session-unavailable': { request: void; response: void }
  'offline-settings-category-request': {
    request: void
    response: OfflineCategoryRequest | null
  }
  'offline-settings-category-created': {
    request: [string, number, number]
    response: boolean
  }
  'offline-settings-refresh-categories': { request: void; response: void }
}

const generation = z.number().int().nonnegative()
const pagination = z.tuple([
  generation,
  z.number().int().nonnegative(),
  z.number().int().min(1).max(100),
])
/** Validates every offline invoke tuple before the exact window/frame authorization check. */
export const OFFLINE_IPC_ARGUMENT_SCHEMAS = {
  'offline-editor-draft': z.tuple([generation, z.number().int().positive()]),
  'offline-editor-snapshot': z.tuple([]),
  'offline-editor-command': z.tuple([generation, WorkspaceCommandSchema]),
  'offline-editor-retry': z.tuple([]),
  'offline-editor-details': pagination,
  'offline-editor-undo-history': pagination,
  'offline-editor-recovery-copies': pagination,
  'offline-editor-sign-in': z.tuple([]),
  'offline-editor-manage-categories': z.tuple([OfflineCategoryActionSchema]),
  'offline-editor-copy': z.tuple([generation, z.string()]),
  'offline-editor-export': z.tuple([generation]),
  'offline-editor-preview-recovery': z.tuple([generation]),
  'offline-editor-recover': z.tuple([generation]),
  'offline-editor-flush-result': z.tuple([
    z.object({ requestId: z.uuid(), generation }),
    z.boolean(),
  ]),
  'offline-settings-read': z.tuple([z.string().min(1)]),
  'offline-settings-prepare': z.tuple([
    z.string().min(1),
    generation,
    OfflinePreferencesSchema,
  ]),
  'offline-settings-patch': z.tuple([
    z.string().min(1),
    generation,
    WorkspaceCommandSchema.refine((command) => command.type === 'preferences'),
  ]),
  'auth-session-unavailable': z.tuple([]),
  'offline-settings-category-request': z.tuple([]),
  'offline-settings-category-created': z.tuple([
    z.string().min(1),
    generation,
    z.number().int().positive(),
  ]),
  'offline-settings-refresh-categories': z.tuple([]),
} satisfies Record<keyof OfflineIPCChannels, z.ZodType>
