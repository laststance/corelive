import { createHash, randomUUID } from 'node:crypto'
import { access, readFile, readdir } from 'node:fs/promises'
import { join } from 'node:path'

import { DEFAULT_CATEGORY_SEED } from '@corelive/desktop-contract/category'
import { OfflineWorkspaceV1Schema } from '@corelive/desktop-contract/offline-workspace'
import type {
  CompletionProjection,
  CompletionSyncReceipt,
  OfflineWorkspaceV1,
} from '@corelive/desktop-contract/offline-workspace'
import {
  DEVICE_ARCHIVE_FILE_NAME,
  DEVICE_OWNER_ID,
  DEVICE_REGISTRY_FILE_NAME,
  DEVICE_WORKSPACE_FILE_NAME,
  DeviceRegistrySchema,
  OfflineWorkspaceSchema,
  WorkspaceArchiveSchema,
  type DeviceRegistry,
  type MigrationReceipt,
  type OfflineWorkspace,
  type RecoveryCopy,
} from '@corelive/desktop-contract/offline-workspace-v2'
import { UserSettingsStateSchema } from '@corelive/desktop-contract/settings'
import type { z } from 'zod'

import {
  AtomicWorkspaceFile,
  envelopeSchema,
  WorkspaceFileError,
} from './AtomicWorkspaceFile'
import { REGISTRY_OWNER_ID, registrySchema } from './OfflineAccountRegistry'

/** Points where a test can kill the migration to prove it converges (EA9). */
export type MigrationStage =
  'before-v2-write' | 'after-v2-write' | 'before-registry-write'

export interface MigrateWorkspaceV1Options {
  /** `userData/offline`. */
  directory: string
  now?: () => number
  /** Pre-offline plaintext notes keyed by server category id (`WorkspaceService` legacy notes). */
  legacyNotes?: Record<string, string>
  /** Receives the redacted C34 summary and failure lines: account ids and counts only (DX7). */
  log?: (line: string) => void
  /** Fault injection; a throw simulates a crash at that point. */
  faultPoint?: (stage: MigrationStage) => void | Promise<void>
}

type MigrationSummary = NonNullable<MigrationReceipt['summary']>

export type MigrateWorkspaceV1Result =
  | {
      ok: true
      status: 'migrated' | 'created-fresh' | 'already-migrated'
      workspace: OfflineWorkspace
      registry: DeviceRegistry
      summary: MigrationSummary | null
      /** Recovery copies imported from a v1 file an older build changed (DX8). */
      importedFromOlderVersion: number
    }
  | {
      ok: false
      code: 'WORKSPACE_MIGRATION_FAILED'
      fileName: string
      checksumPrefix: string
      errorClass: string
    }

type V1File =
  | {
      fileName: string
      checksum: string
      valid: true
      workspace: OfflineWorkspaceV1
    }
  | { fileName: string; checksum: string; valid: false; errorClass: string }

type V1Registry = z.infer<typeof registrySchema>

const V1_FILE_PATTERN = /^[a-f0-9]{64}\.json$/

/**
 * Converts the v1 per-account workspaces into the one v2 device workspace (D7).
 *
 * Wired nowhere yet: the step that switches the app to v2 calls it once before the first
 * v2 open. It only ever writes `workspaces/device.json` and `registry/device-registry.json`
 * (C32); v1 bytes are never touched. Reruns are idempotent: an existing v2 workspace is
 * kept, a missing registry is rebuilt, and v1 files an older build changed are imported as
 * recovery copies exactly once (DX8, EA13a). A corrupt or partial v1 source returns
 * `WORKSPACE_MIGRATION_FAILED` and never a fresh workspace (EA9, DX7).
 *
 * @param options - Directory, clock, legacy notes, log sink and fault hook.
 * @returns The v2 workspace and registry, or the redacted failure description.
 * @example
 * ```ts
 * const result = await migrateWorkspaceV1({ directory: join(userData, 'offline') })
 * if (!result.ok) openRecovery(result.fileName)
 * ```
 */
export async function migrateWorkspaceV1(
  options: MigrateWorkspaceV1Options,
): Promise<MigrateWorkspaceV1Result> {
  const now = options.now ?? Date.now
  const workspacesDirectory = join(options.directory, 'workspaces')
  const registryDirectory = join(options.directory, 'registry')
  const v2File = new AtomicWorkspaceFile({
    directory: workspacesDirectory,
    ownerId: DEVICE_OWNER_ID,
    fileName: DEVICE_WORKSPACE_FILE_NAME,
    parse: OfflineWorkspaceSchema.parse,
  })
  const registryFile = new AtomicWorkspaceFile({
    directory: registryDirectory,
    ownerId: 'corelive-device-registry',
    fileName: DEVICE_REGISTRY_FILE_NAME,
    parse: DeviceRegistrySchema.parse,
  })

  const v1 = await scanV1(options.directory)
  const fail = (
    fileName: string,
    checksum: string,
    errorClass: string,
  ): MigrateWorkspaceV1Result => {
    const checksumPrefix = checksum.slice(0, 8)
    options.log?.(
      `WORKSPACE_MIGRATION_FAILED file=${fileName} checksum=${checksumPrefix} error=${errorClass}`,
    )
    return {
      ok: false,
      code: 'WORKSPACE_MIGRATION_FAILED',
      fileName,
      checksumPrefix,
      errorClass,
    }
  }

  // A v2 workspace already exists: finish the registry and import older-build changes.
  const existing = await readOrNull(v2File)
  if (existing === 'invalid')
    return fail(`${DEVICE_WORKSPACE_FILE_NAME}.json`, '', 'invalid')
  if (existing === null && (await exists(v2File.recoveryPath)))
    return fail(`${DEVICE_WORKSPACE_FILE_NAME}.recovery.json`, '', 'orphaned')
  if (existing) {
    const importedWorkspace = await importOlderVersionChanges(
      v2File,
      workspacesDirectory,
      existing,
      v1.files,
      now,
    )
    const registry = await ensureRegistry(
      registryFile,
      importedWorkspace,
      v1.registry,
      options.faultPoint,
    )
    if (registry === 'invalid')
      return fail(`${DEVICE_REGISTRY_FILE_NAME}.json`, '', 'invalid')
    return {
      ok: true,
      status: 'already-migrated',
      workspace: importedWorkspace,
      registry,
      summary: importedWorkspace.migration.summary,
      importedFromOlderVersion:
        importedWorkspace.recoveryCopies.length -
        existing.recoveryCopies.length,
    }
  }

  if (v1.registry === 'invalid')
    return fail(v1.registryFileName, v1.registryChecksum, 'registry-invalid')
  const registryState = v1.registry
  const sourceId =
    registryState?.activeAccountId ?? registryState?.lastAccountId ?? null
  const sourceFileName = sourceId ? `${hash(sourceId)}.json` : null
  const source = sourceFileName
    ? v1.files.find((file) => file.fileName === sourceFileName)
    : undefined
  // A registry that names a workspace we cannot read is never turned into a fresh start.
  if (sourceFileName && !source)
    return fail(sourceFileName, '', 'source-missing')
  if (source && !source.valid)
    return fail(source.fileName, source.checksum, source.errorClass)

  let built: OfflineWorkspace
  try {
    built = buildWorkspace({
      source: source?.valid ? source : null,
      others: v1.files.filter((file) => file !== source),
      registryState,
      keptFileCount: v1.files.length + (registryState ? 1 : 0),
      legacyNotes: options.legacyNotes ?? {},
      now: now(),
    })
  } catch {
    return fail(
      source?.fileName ?? 'workspaces',
      source?.checksum ?? '',
      'conversion',
    )
  }

  await options.faultPoint?.('before-v2-write')
  await v2File.initialize(built)
  await options.faultPoint?.('after-v2-write')
  const registry = await ensureRegistry(
    registryFile,
    built,
    registryState,
    options.faultPoint,
  )
  if (registry === 'invalid')
    return fail(`${DEVICE_REGISTRY_FILE_NAME}.json`, '', 'invalid')

  const summary = built.migration.summary
  if (summary)
    options.log?.(
      `workspace migration: source=${summary.sourceAccountId ?? 'none'} drafts=${summary.importedDrafts} completions=${summary.importedCompletions} recoveryCopies=${summary.recoveryCopies} v1FilesKept=${summary.v1FilesKept} preservedBackups=${summary.preservedBackups}`,
    )
  return {
    ok: true,
    status: source ? 'migrated' : 'created-fresh',
    workspace: built,
    registry,
    summary,
    importedFromOlderVersion: 0,
  }
}

/**
 * Lists and validates every v1 workspace file plus the v1 registry without writing.
 * Unlike `OfflineAccountRegistry.read`, it never creates a missing registry.
 */
async function scanV1(directory: string): Promise<{
  files: V1File[]
  registry: V1Registry | null | 'invalid'
  registryFileName: string
  registryChecksum: string
}> {
  const names = await readdir(join(directory, 'workspaces')).catch(
    (): string[] => [],
  )
  const files: V1File[] = []
  for (const fileName of names
    .filter((name) => V1_FILE_PATTERN.test(name))
    .sort())
    files.push(
      await readV1Workspace(join(directory, 'workspaces', fileName), fileName),
    )

  const registryFileName = `${hash(REGISTRY_OWNER_ID)}.json`
  const registryBytes = await readFile(
    join(directory, 'registry', registryFileName),
    'utf8',
  ).catch(() => null)
  if (registryBytes === null)
    return { files, registry: null, registryFileName, registryChecksum: '' }
  const registryChecksum = hash(registryBytes)
  const decoded = decodeEnvelope(registryBytes, REGISTRY_OWNER_ID)
  const parsed = decoded.ok ? registrySchema.safeParse(decoded.value) : null
  return {
    files,
    registry: parsed?.success ? parsed.data : 'invalid',
    registryFileName,
    registryChecksum,
  }
}

/** Reads one v1 file; the checksum is of the file bytes, so any edit changes it (DX8). */
async function readV1Workspace(
  path: string,
  fileName: string,
): Promise<V1File> {
  const bytes = await readFile(path, 'utf8')
  const checksum = hash(bytes)
  const decoded = decodeEnvelope(bytes, null)
  if (!decoded.ok)
    return { fileName, checksum, valid: false, errorClass: decoded.errorClass }
  const parsed = OfflineWorkspaceV1Schema.safeParse(decoded.value)
  if (!parsed.success)
    return { fileName, checksum, valid: false, errorClass: 'schema' }
  // The file name is the owner hash; a mismatch means the file was moved or tampered with.
  if (`${hash(parsed.data.ownerId)}.json` !== fileName)
    return { fileName, checksum, valid: false, errorClass: 'owner-mismatch' }
  return { fileName, checksum, valid: true, workspace: parsed.data }
}

/** Verifies the AtomicWorkspaceFile envelope and returns the parsed payload. */
function decodeEnvelope(
  bytes: string,
  expectedOwner: string | null,
):
  | { ok: true; value: unknown }
  | { ok: false; errorClass: 'json' | 'envelope' | 'checksum' } {
  let envelope: z.infer<typeof envelopeSchema>
  try {
    envelope = envelopeSchema.parse(JSON.parse(bytes) as unknown)
  } catch {
    return { ok: false, errorClass: 'envelope' }
  }
  if (hash(envelope.payload) !== envelope.checksum)
    return { ok: false, errorClass: 'checksum' }
  if (expectedOwner !== null && envelope.ownerId !== expectedOwner)
    return { ok: false, errorClass: 'envelope' }
  try {
    return { ok: true, value: JSON.parse(envelope.payload) as unknown }
  } catch {
    return { ok: false, errorClass: 'json' }
  }
}

/**
 * Lists the completion identities held by the archive file; empty when it is absent or
 * unreadable (an extra recovery copy is a safer outcome than a dropped one).
 *
 * @param directory - The `workspaces` directory.
 * @returns Every archived completion and retired-completion id.
 * @example const ids = await readArchivedIds(join(userData, 'offline', 'workspaces'))
 */
async function readArchivedIds(directory: string): Promise<Set<string>> {
  const archive = await readOrNull(
    new AtomicWorkspaceFile({
      directory,
      ownerId: DEVICE_OWNER_ID,
      fileName: DEVICE_ARCHIVE_FILE_NAME,
      parse: WorkspaceArchiveSchema.parse,
    }),
  )
  if (!archive || archive === 'invalid') return new Set()
  return new Set([
    ...Object.keys(archive.completions),
    ...Object.keys(archive.retiredCompletions),
  ])
}

/** Reads a v2 file: its value, null when missing, or 'invalid' (never overwritten). */
async function readOrNull<T>(
  file: AtomicWorkspaceFile<T>,
): Promise<T | null | 'invalid'> {
  try {
    return await file.read()
  } catch (error) {
    if (!(error instanceof WorkspaceFileError)) throw error
    return error.reason === 'missing' ? null : 'invalid'
  }
}

/** Writes the registry only when missing (idempotent repair after a crash). */
async function ensureRegistry(
  file: AtomicWorkspaceFile<DeviceRegistry>,
  workspace: OfflineWorkspace,
  v1Registry: V1Registry | null | 'invalid',
  faultPoint: MigrateWorkspaceV1Options['faultPoint'],
): Promise<DeviceRegistry | 'invalid'> {
  const current = await readOrNull(file)
  if (current === 'invalid') return 'invalid'
  if (current) return current
  await faultPoint?.('before-registry-write')
  // Legacy `locked` (no active account) stays detached; a bound active account stays attached (D7.3).
  const activeAccountId =
    v1Registry && v1Registry !== 'invalid' ? v1Registry.activeAccountId : null
  return file.initialize({
    version: 2,
    deviceId: workspace.deviceId,
    attachedAccountId:
      activeAccountId !== null &&
      workspace.binding?.accountId === activeAccountId
        ? activeAccountId
        : null,
    signOutPending: false,
    pendingConnect: null,
  })
}

/** Everything a v1 workspace holds that is worth keeping as text. */
function describeWriting(workspace: OfflineWorkspaceV1) {
  const drafts = Object.entries(workspace.drafts).flatMap(([key, draft]) => {
    const text = draft.rows.map((row) => row.text).join('\n')
    return text.trim()
      ? [
          {
            serverCategoryId: Number(key),
            text,
            rows: draft.rows.map((row) => row.text),
          },
        ]
      : []
  })
  const unresolved = new Set(
    Object.values(workspace.outbox)
      .filter((entry) => entry.receipt?.status !== 'applied')
      .map((entry) => entry.operation.completionId),
  )
  const completions = Object.values(workspace.completions).map(
    (completion) => ({
      id: completion.id,
      text: completion.rawText.trim() || completion.title,
      title: completion.title,
      cancelled: completion.cancelled,
      unresolved: unresolved.has(completion.id),
    }),
  )
  return { drafts, completions }
}

/** Collects every category id a v1 workspace references anywhere (EA9). */
function collectServerCategoryIds(workspace: OfflineWorkspaceV1): Set<number> {
  const ids = new Set<number>()
  const projection = (value: CompletionProjection | null | undefined): void => {
    if (value) ids.add(value.categoryId)
  }
  const receipt = (value: CompletionSyncReceipt | undefined): void =>
    projection(value?.projection)
  for (const category of workspace.categories) {
    ids.add(category.id)
    if (category.parentId !== null) ids.add(category.parentId)
  }
  ids.add(workspace.selectedCategoryId)
  for (const key of Object.keys(workspace.drafts)) ids.add(Number(key))
  for (const completion of Object.values(workspace.completions)) {
    ids.add(completion.categoryId)
    ids.add(completion.originalCategoryId)
    projection(completion.remote)
  }
  for (const retired of Object.values(workspace.retiredCompletions))
    ids.add(retired.originalCategoryId)
  for (const entry of Object.values(workspace.outbox)) {
    ids.add(entry.operation.categoryId)
    receipt(entry.receipt)
  }
  for (const [from, to] of [
    ...Object.entries(workspace.categoryMoves),
    ...Object.entries(workspace.categoryDeletions),
  ]) {
    ids.add(Number(from))
    ids.add(to)
  }
  for (const value of Object.values(workspace.checkpoint?.identities ?? {}))
    projection(value)
  for (const copy of workspace.recoveryCopies) {
    ids.add(copy.categoryId)
    if (copy.restoredTo !== undefined) ids.add(copy.restoredTo)
  }
  return ids
}

interface BuildInput {
  source: Extract<V1File, { valid: true }> | null
  others: V1File[]
  registryState: V1Registry | null
  keptFileCount: number
  legacyNotes: Record<string, string>
  now: number
}

/**
 * The v1-to-v2 id mapping shared by every conversion step of one {@link buildWorkspace} run.
 *
 * Exists so each step (categories, drafts, records, binding) maps server category ids to the
 * same deterministic local UUIDs without re-deriving them. Inferred from {@link createConversion}
 * so the projection and receipt mappers keep their exact v1 to v2 types.
 */
type Conversion = ReturnType<typeof createConversion>['conversion']

/** Fields of a recovery copy built during migration, before its deterministic id is assigned. */
type RecoveryCopyDraft = Pick<
  RecoveryCopy,
  'categoryId' | 'text' | 'reason'
> & {
  origin: NonNullable<RecoveryCopy['origin']>
}

/**
 * Builds the id mapping for one conversion run.
 *
 * @param source - The converted v1 file, or null when starting fresh.
 * @param registryState - The v1 registry, used for the device id of a fresh start.
 * @returns The {@link Conversion} plus the device id the workspace keeps.
 * @example const { conversion, deviceId } = createConversion(source, registryState)
 */
function createConversion(
  source: Extract<V1File, { valid: true }> | null,
  registryState: V1Registry | null,
) {
  const v1 = source?.workspace ?? null
  const deviceId = v1?.deviceId ?? registryState?.deviceId ?? randomUUID()
  const seed = source?.checksum ?? `fresh:${deviceId}`
  const localIds = new Map<number, string>()
  for (const serverId of [...(v1 ? collectServerCategoryIds(v1) : [])].sort(
    (a, b) => a - b,
  ))
    localIds.set(serverId, uuidFrom(`${seed}:category:${serverId}`))
  const local = (serverId: number): string => {
    const id = localIds.get(serverId)
    if (!id) throw new Error('unmapped category id')
    return id
  }
  const mapProjection = (value: CompletionProjection) => ({
    ...value,
    categoryId: local(value.categoryId),
  })
  const mapReceipt = (value: CompletionSyncReceipt) => ({
    ...value,
    projection: value.projection ? mapProjection(value.projection) : null,
  })
  const conversion = {
    v1,
    seed,
    localIds,
    local,
    mapProjection,
    mapReceipt,
  }
  return {
    conversion,
    deviceId,
  }
}

/** A category row with no edits yet, as the v2 workspace stores it. */
function untouchedCategory(
  fields: Pick<
    OfflineWorkspace['categories'][number],
    | 'id'
    | 'name'
    | 'color'
    | 'isDefault'
    | 'parentId'
    | 'removed'
    | 'historical'
  >,
): OfflineWorkspace['categories'][number] {
  return { ...fields, fieldRevisions: { name: 0, color: 0, parentLocalId: 0 } }
}

/**
 * Converts the v1 categories (or seeds the default category on a fresh start).
 *
 * Ids with no live category stay referenced through a historical placeholder (EA9).
 *
 * @example const categories = convertCategories(conversion)
 */
function convertCategories(
  conversion: Conversion,
): OfflineWorkspace['categories'] {
  const { v1, seed, localIds, local } = conversion
  if (!v1)
    return [
      untouchedCategory({
        id: uuidFrom(`${seed}:default`),
        name: DEFAULT_CATEGORY_SEED.name,
        color: DEFAULT_CATEGORY_SEED.color,
        isDefault: true,
        parentId: null,
        removed: false,
        historical: false,
      }),
    ]
  const liveIds = new Set(v1.categories.map((category) => category.id))
  const categories = v1.categories.map((category) =>
    untouchedCategory({
      id: local(category.id),
      name: category.name,
      color: category.color,
      isDefault: category.isDefault,
      parentId: category.parentId === null ? null : local(category.parentId),
      removed: category.removed,
      historical: false,
    }),
  )
  for (const [serverId, id] of localIds)
    if (!liveIds.has(serverId))
      categories.push(
        untouchedCategory({
          id,
          name: 'Earlier category',
          color: 'blue',
          isDefault: false,
          parentId: null,
          removed: false,
          historical: true,
        }),
      )
  return categories
}

/**
 * Converts the v1 drafts and gives every live category an empty one.
 *
 * @example const drafts = convertDrafts(conversion, categories)
 */
function convertDrafts(
  conversion: Conversion,
  categories: OfflineWorkspace['categories'],
): OfflineWorkspace['drafts'] {
  const { v1, seed, local } = conversion
  const drafts: OfflineWorkspace['drafts'] = {}
  for (const [key, draft] of Object.entries(v1?.drafts ?? {}))
    drafts[local(Number(key))] = draft
  for (const category of categories)
    if (!category.removed && !category.historical)
      drafts[category.id] ??= {
        revision: 0,
        rows: [{ id: uuidFrom(`${seed}:row:${category.id}`), text: '' }],
      }
  return drafts
}

/**
 * Records one migration receipt per v1 file and collects the recovery copies they imply.
 *
 * C7: another account's writing is kept as recovery copies; nothing is sent to that account.
 *
 * @param addCopy - Appends a recovery copy; the caller owns the deterministic id counter.
 * @returns The receipts, the v1 file checksums and how many unreadable files were preserved.
 * @example const { receipts, v1Files } = recordV1Files(source, others, now, id, addCopy)
 */
function recordV1Files(
  source: Extract<V1File, { valid: true }> | null,
  others: V1File[],
  now: number,
  defaultCategoryId: string,
  addCopy: (copy: RecoveryCopyDraft) => void,
): {
  receipts: MigrationReceipt['receipts']
  v1Files: MigrationReceipt['v1Files']
  preservedBackups: number
} {
  const receipts: MigrationReceipt['receipts'] = {}
  const v1Files: MigrationReceipt['v1Files'] = {}
  let preservedBackups = 0
  for (const file of [...(source ? [source] : []), ...others]) {
    v1Files[file.fileName] = file.checksum
    if (file === source) {
      receipts[file.checksum] = {
        fileName: file.fileName,
        accountId: source.workspace.ownerId,
        outcome: 'source-converted',
        at: now,
      }
    } else if (file.valid) {
      importOtherAccountWriting(file.workspace, defaultCategoryId, addCopy)
      receipts[file.checksum] = {
        fileName: file.fileName,
        accountId: file.workspace.ownerId,
        outcome: 'recovery-imported',
        at: now,
      }
    } else {
      preservedBackups++
      receipts[file.checksum] = {
        fileName: file.fileName,
        accountId: null,
        outcome: 'backup-preserved',
        at: now,
      }
    }
  }
  return { receipts, v1Files, preservedBackups }
}

/**
 * Keeps another account's unsent writing as recovery copies in the default category (C7).
 *
 * @example importOtherAccountWriting(otherWorkspace, defaultCategoryId, addCopy)
 */
function importOtherAccountWriting(
  workspace: OfflineWorkspaceV1,
  defaultCategoryId: string,
  addCopy: (copy: RecoveryCopyDraft) => void,
): void {
  const writing = describeWriting(workspace)
  const origin = {
    kind: 'other-account' as const,
    accountId: workspace.ownerId,
  }
  const reason = `Other account: ${workspace.ownerId}`
  for (const draft of writing.drafts)
    addCopy({ categoryId: defaultCategoryId, text: draft.text, reason, origin })
  for (const completion of writing.completions)
    if (completion.unresolved && !completion.cancelled)
      addCopy({
        categoryId: defaultCategoryId,
        text: completion.title,
        reason,
        origin,
      })
}

/**
 * Keeps pre-offline notes that changed since the v1 import, or were never mapped, as copies.
 *
 * @example importLegacyNotes(conversion, { '7': 'note' }, defaultCategoryId, addCopy)
 */
function importLegacyNotes(
  conversion: Conversion,
  legacyNotes: Record<string, string>,
  defaultCategoryId: string,
  addCopy: (copy: RecoveryCopyDraft) => void,
): void {
  const { v1, localIds } = conversion
  for (const [key, text] of Object.entries(legacyNotes)) {
    if (!text.trim()) continue
    const sourceHash = v1?.migration.sourceHashes[key]
    const textHash = hash(text)
    if (
      textHash === sourceHash ||
      textHash === v1?.migration.observedHashes[key]
    )
      continue
    const serverId = Number(key)
    addCopy({
      categoryId: localIds.get(serverId) ?? defaultCategoryId,
      text,
      reason: localIds.has(serverId) ? 'legacy-changed' : 'legacy-unmapped',
      origin: { kind: 'legacy-note', accountId: null },
    })
  }
}

/**
 * Converts the v1 account binding: server ids, merge base, deletions and last sync time.
 *
 * @returns The binding, or null on a fresh start.
 * @example const binding = convertBinding(conversion)
 */
function convertBinding(conversion: Conversion): OfflineWorkspace['binding'] {
  const { v1, local } = conversion
  if (!v1) return null
  const liveCategories = v1.categories.filter((category) => !category.removed)
  return {
    accountId: v1.ownerId,
    displayEmail: null,
    serverCategoryIds: Object.fromEntries(
      liveCategories.map((category) => [local(category.id), category.id]),
    ),
    base: Object.fromEntries(
      liveCategories.map((category) => [
        local(category.id),
        {
          name: category.name,
          color: category.color,
          parentLocalId:
            category.parentId === null ? null : local(category.parentId),
        },
      ]),
    ),
    declined: {},
    deletionReceipts: Object.fromEntries(
      Object.entries(v1.categoryDeletions).map(([from, to]) => [
        local(Number(from)),
        local(to),
      ]),
    ),
    lastSyncedAt: v1.checkpoint?.fetchedAt ?? null,
  }
}

/**
 * Converts completions, retired completions, the outbox, category moves and the checkpoint.
 *
 * A queued v1 entry was never offered to the server: it is re-derived from its completion.
 * Anything already offered keeps its exact bytes (EA3, P3).
 *
 * @example const records = convertRecords(conversion)
 */
function convertRecords(
  conversion: Conversion,
): Pick<
  OfflineWorkspace,
  | 'completions'
  | 'retiredCompletions'
  | 'outbox'
  | 'categoryMoves'
  | 'checkpoint'
> {
  const { v1, local, mapProjection, mapReceipt } = conversion
  return {
    completions: Object.fromEntries(
      Object.entries(v1?.completions ?? {}).map(([id, completion]) => [
        id,
        {
          ...completion,
          categoryId: local(completion.categoryId),
          originalCategoryId: local(completion.originalCategoryId),
          remote: completion.remote ? mapProjection(completion.remote) : null,
        },
      ]),
    ),
    retiredCompletions: Object.fromEntries(
      Object.entries(v1?.retiredCompletions ?? {}).map(([id, retired]) => [
        id,
        { ...retired, originalCategoryId: local(retired.originalCategoryId) },
      ]),
    ),
    outbox: Object.fromEntries(
      Object.entries(v1?.outbox ?? {})
        .filter(([, entry]) => entry.state !== 'queued')
        .map(([id, entry]) => [
          id,
          {
            operation: {
              ...entry.operation,
              categoryId: local(entry.operation.categoryId),
            },
            wire: entry.operation,
            state: entry.state,
            failure: entry.failure,
            receipt: entry.receipt ? mapReceipt(entry.receipt) : undefined,
          },
        ]),
    ),
    categoryMoves: Object.fromEntries(
      Object.entries(v1?.categoryMoves ?? {}).map(([from, to]) => [
        local(Number(from)),
        local(to),
      ]),
    ),
    checkpoint: v1?.checkpoint
      ? {
          ...v1.checkpoint,
          identities: Object.fromEntries(
            Object.entries(v1.checkpoint.identities).map(([id, value]) => [
              id,
              value ? mapProjection(value) : null,
            ]),
          ),
        }
      : null,
  }
}

/**
 * Counts what the migration carried over, for the redacted C34 summary (DX7).
 *
 * @example const summary = buildSummary(conversion, 2, 3, 0)
 */
function buildSummary(
  conversion: Conversion,
  recoveryCopyCount: number,
  keptFileCount: number,
  preservedBackups: number,
): MigrationSummary {
  const { v1 } = conversion
  const writing = v1 ? describeWriting(v1) : { drafts: [], completions: [] }
  return {
    sourceAccountId: v1?.ownerId ?? null,
    importedDrafts: writing.drafts.length,
    importedCompletions:
      Object.keys(v1?.completions ?? {}).length +
      Object.keys(v1?.retiredCompletions ?? {}).length,
    recoveryCopies: recoveryCopyCount,
    v1FilesKept: keptFileCount,
    preservedBackups,
  }
}

/**
 * Carries the scalar workspace fields: revision, creation time, selection, preferences and
 * command receipts. A fresh start selects the default category and uses default preferences.
 *
 * @example const header = convertHeader(conversion, defaultCategoryId, Date.now())
 */
function convertHeader(
  conversion: Conversion,
  defaultCategoryId: string,
  now: number,
): Pick<
  OfflineWorkspace,
  | 'revision'
  | 'createdAt'
  | 'selectedCategoryId'
  | 'preferences'
  | 'commandReceipts'
> {
  const { v1, local } = conversion
  return {
    revision: v1?.revision ?? 0,
    createdAt: v1?.preparedAt ?? now,
    selectedCategoryId: v1 ? local(v1.selectedCategoryId) : defaultCategoryId,
    preferences: v1?.preferences ?? {
      revision: 0,
      settings: UserSettingsStateSchema.parse({}),
      theme: 'system',
    },
    commandReceipts: v1?.commandReceipts ?? {},
  }
}

/**
 * Carries the v1 recovery copies over with their categories mapped to local ids.
 *
 * @example const copies = convertRecoveryCopies(conversion)
 */
function convertRecoveryCopies(conversion: Conversion): RecoveryCopy[] {
  const { v1, local } = conversion
  return (v1?.recoveryCopies ?? []).map((copy) => ({
    ...copy,
    categoryId: local(copy.categoryId),
    restoredTo:
      copy.restoredTo === undefined ? undefined : local(copy.restoredTo),
  }))
}

/** Builds the complete v2 workspace in memory; pure apart from `randomUUID` for a fresh device id. */
function buildWorkspace(input: BuildInput): OfflineWorkspace {
  const { source, now } = input
  const { conversion, deviceId } = createConversion(source, input.registryState)
  const { seed } = conversion

  const categories = convertCategories(conversion)
  const defaultCategoryId =
    categories.find((category) => category.isDefault && !category.removed)
      ?.id ?? categories[0]!.id
  const drafts = convertDrafts(conversion, categories)

  // Copy ids count up in creation order, so the file loop must run before the legacy notes.
  const created: RecoveryCopy[] = []
  const addCopy = (copy: RecoveryCopyDraft): void => {
    created.push({
      id: uuidFrom(`${seed}:recovery:${created.length}`),
      ...copy,
      createdAt: now,
    })
  }
  const { receipts, v1Files, preservedBackups } = recordV1Files(
    source,
    input.others,
    now,
    defaultCategoryId,
    addCopy,
  )
  importLegacyNotes(conversion, input.legacyNotes, defaultCategoryId, addCopy)

  const summary = buildSummary(
    conversion,
    created.length,
    input.keptFileCount,
    preservedBackups,
  )

  return OfflineWorkspaceSchema.parse({
    version: 2,
    ownerId: DEVICE_OWNER_ID,
    deviceId,
    ...convertHeader(conversion, defaultCategoryId, now),
    categories,
    drafts,
    ...convertRecords(conversion),
    categoryOutbox: {},
    binding: convertBinding(conversion),
    migration: {
      version: 2,
      sourceChecksum: source?.checksum ?? null,
      receipts,
      v1Files,
      dashboardOnly: {},
      summary,
    },
    recoveryCopies: [...convertRecoveryCopies(conversion), ...created],
  })
}

/**
 * What {@link importOlderFile} needs beyond the workspace being updated.
 */
interface OlderImportContext {
  /** Every line v2 already holds, so unchanged writing is not copied again. */
  knownLines: Set<string>
  defaultCategoryId: string
  /** Settled completion ids that live in the archive file. */
  archivedIds: Set<string>
  now: () => number
}

/**
 * Imports what an older build wrote into v1 files after the upgrade (DX8, EA13a).
 * Changed files are compared by completion identity and line text; each checksum imports
 * once, v2 content is never overwritten and nothing is queued.
 */
async function importOlderVersionChanges(
  file: AtomicWorkspaceFile<OfflineWorkspace>,
  workspacesDirectory: string,
  current: OfflineWorkspace,
  v1Files: V1File[],
  now: () => number,
): Promise<OfflineWorkspace> {
  const changed = v1Files.filter(
    (v1File) => current.migration.v1Files[v1File.fileName] !== v1File.checksum,
  )
  if (!changed.length) return current
  // Settled history lives in the archive file; those identities are not "missing" from v2.
  const archivedIds = await readArchivedIds(workspacesDirectory)
  return file.update((state) => {
    const next = structuredClone(state)
    const context: OlderImportContext = {
      knownLines: collectKnownLines(next),
      defaultCategoryId:
        next.categories.find(
          (category) => category.isDefault && !category.removed,
        )?.id ?? next.categories[0]!.id,
      archivedIds,
      now,
    }
    for (const v1File of changed) importOlderFile(next, v1File, context)
    next.revision++
    return next
  })
}

/** Every draft row, recovery-copy line and completion text already stored in v2. */
function collectKnownLines(workspace: OfflineWorkspace): Set<string> {
  const knownLines = new Set<string>()
  for (const draft of Object.values(workspace.drafts))
    for (const row of draft.rows) knownLines.add(row.text)
  for (const copy of workspace.recoveryCopies)
    for (const line of copy.text.split('\n')) knownLines.add(line)
  for (const completion of Object.values(workspace.completions)) {
    knownLines.add(completion.title)
    knownLines.add(completion.rawText)
  }
  return knownLines
}

/** True when v2 or the archive already holds the completion identity (EA13a). */
function holdsCompletionIdentity(
  workspace: OfflineWorkspace,
  archivedIds: Set<string>,
  id: string,
): boolean {
  return Boolean(
    workspace.completions[id] ||
    workspace.retiredCompletions[id] ||
    archivedIds.has(id),
  )
}

/**
 * Imports one changed v1 file into the v2 workspace and stamps its receipt.
 *
 * @param next - The cloned workspace being updated; mutated in place.
 * @example importOlderFile(next, v1File, context)
 */
function importOlderFile(
  next: OfflineWorkspace,
  v1File: V1File,
  context: OlderImportContext,
): void {
  next.migration.v1Files[v1File.fileName] = v1File.checksum
  // Each checksum imports once, even if the user already deleted what it produced.
  if (next.migration.receipts[v1File.checksum]) return
  if (!v1File.valid) {
    next.migration.receipts[v1File.checksum] = {
      fileName: v1File.fileName,
      accountId: null,
      outcome: 'backup-preserved',
      at: context.now(),
    }
    return
  }
  const workspace = v1File.workspace
  const reverse = new Map<number, string>()
  if (next.binding?.accountId === workspace.ownerId)
    for (const [localId, serverId] of Object.entries(
      next.binding.serverCategoryIds,
    ))
      reverse.set(serverId, localId)
  const { defaultCategoryId, archivedIds } = context
  const push = (categoryId: string, text: string) =>
    next.recoveryCopies.push({
      id: uuidFrom(`${v1File.checksum}:older:${next.recoveryCopies.length}`),
      categoryId,
      text,
      reason: 'From an older CoreLive version',
      createdAt: context.now(),
      origin: { kind: 'older-version' as const, accountId: workspace.ownerId },
    })
  for (const draft of describeWriting(workspace).drafts) {
    const fresh = draft.rows.filter(
      (line) => line.trim() && !context.knownLines.has(line),
    )
    if (fresh.length)
      push(
        reverse.get(draft.serverCategoryId) ?? defaultCategoryId,
        fresh.join('\n'),
      )
  }
  for (const completion of Object.values(workspace.completions)) {
    // Identity, not send state, decides what v2 lacks (EA13a).
    if (holdsCompletionIdentity(next, archivedIds, completion.id)) continue
    push(
      reverse.get(completion.categoryId) ?? defaultCategoryId,
      completion.rawText.trim() || completion.title,
    )
  }
  for (const [id, retired] of Object.entries(workspace.retiredCompletions)) {
    if (holdsCompletionIdentity(next, archivedIds, id)) continue
    next.migration.dashboardOnly[id] = {
      completedAt: retired.completedAt,
      originalCategoryId:
        reverse.get(retired.originalCategoryId) ?? defaultCategoryId,
      cancelled: retired.cancelled,
    }
  }
  next.migration.receipts[v1File.checksum] = {
    fileName: v1File.fileName,
    accountId: workspace.ownerId,
    outcome: 'older-version-imported',
    at: context.now(),
  }
}

/** SHA-256 hex of a string. */
function hash(value: string): string {
  return createHash('sha256').update(value).digest('hex')
}

/** Derives a stable, valid v4-shaped UUID so a retried migration yields identical ids. */
function uuidFrom(seed: string): string {
  const digest = hash(seed)
  const variant = '89ab'[Number.parseInt(digest[16]!, 16) % 4]!
  return `${digest.slice(0, 8)}-${digest.slice(8, 12)}-4${digest.slice(13, 16)}-${variant}${digest.slice(17, 20)}-${digest.slice(20, 32)}`
}

/** True when a path exists. */
async function exists(path: string): Promise<boolean> {
  return access(path).then(
    () => true,
    () => false,
  )
}
