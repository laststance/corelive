import { randomUUID } from 'node:crypto'

import {
  DEVICE_OWNER_ID,
  DEVICE_WORKSPACE_FILE_NAME,
  OfflineWorkspaceSchema,
  type AccountBinding,
  type LocalCategory,
  type OfflineWorkspace,
} from '@corelive/desktop-contract/offline-workspace-v2'
import { UserSettingsStateSchema } from '@corelive/desktop-contract/settings'

import { AtomicWorkspaceFile } from './AtomicWorkspaceFile'

/**
 * Deterministic local category id for fixtures: `categoryUuid(1)` is the first category.
 * @example categoryUuid(2) // => '00000000-0000-4000-8000-000000000002'
 */
export function categoryUuid(index: number): string {
  return `00000000-0000-4000-8000-${String(index).padStart(12, '0')}`
}

export interface DeviceWorkspaceFixtureInput {
  /** Number of categories; the first is the default `General`-like category. */
  categoryCount?: number
  /** Draft text by category index (1-based). */
  notes?: Record<number, string>
  /** Attach the fixture to an account: category n gets server id n. */
  boundAccountId?: string
  displayEmail?: string | null
  /** Category names by position; when set, its length is the category count. */
  categoryNames?: string[]
  /** Settings overrides applied over the schema defaults. */
  settings?: Partial<ReturnType<typeof UserSettingsStateSchema.parse>>
}

/**
 * Builds a valid device workspace for tests, the QA fixture and the storage benchmark.
 * Category `n` has local id {@link categoryUuid}`(n)`, server id `n` when bound.
 * @param input - Category count, draft text and optional binding.
 * @returns A schema-valid v2 workspace with `ownerId: "device"`.
 * @example const workspace = buildDeviceWorkspace({ boundAccountId: 'user_a' })
 */
export function buildDeviceWorkspace(
  input: DeviceWorkspaceFixtureInput = {},
): OfflineWorkspace {
  const count = input.categoryNames?.length ?? input.categoryCount ?? 1
  const categories: LocalCategory[] = Array.from(
    { length: count },
    (_, index) => ({
      id: categoryUuid(index + 1),
      name:
        input.categoryNames?.[index] ??
        (index === 0 ? 'General' : `Category ${index + 1}`),
      color: 'blue',
      isDefault: index === 0,
      parentId: null,
      removed: false,
      historical: false,
      fieldRevisions: { name: 0, color: 0, parentLocalId: 0 },
    }),
  )
  const binding: AccountBinding | null = input.boundAccountId
    ? {
        accountId: input.boundAccountId,
        displayEmail: input.displayEmail ?? null,
        serverCategoryIds: Object.fromEntries(
          categories.map((category, index) => [category.id, index + 1]),
        ),
        base: Object.fromEntries(
          categories.map((category) => [
            category.id,
            { name: category.name, color: category.color, parentLocalId: null },
          ]),
        ),
        declined: {},
        deletionReceipts: {},
        lastSyncedAt: null,
      }
    : null
  return OfflineWorkspaceSchema.parse({
    version: 2,
    ownerId: DEVICE_OWNER_ID,
    deviceId: randomUUID(),
    revision: 0,
    createdAt: Date.now(),
    selectedCategoryId: categories[0]!.id,
    categories,
    preferences: {
      revision: 0,
      theme: 'cathedral-dark',
      settings: { ...UserSettingsStateSchema.parse({}), ...input.settings },
    },
    drafts: Object.fromEntries(
      categories.map((category, index) => [
        category.id,
        {
          revision: 0,
          rows: (input.notes?.[index + 1] ?? '')
            .split('\n')
            .map((text) => ({ id: randomUUID(), text })),
        },
      ]),
    ),
    completions: {},
    outbox: {},
    commandReceipts: {},
    categoryMoves: {},
    binding,
    migration: {
      version: 2,
      sourceChecksum: null,
      receipts: {},
      v1Files: {},
      dashboardOnly: {},
      summary: null,
    },
    checkpoint: null,
    recoveryCopies: [],
  })
}

/**
 * Writes {@link buildDeviceWorkspace} to `device.json` in a workspaces directory.
 * @param workspacesDirectory - `<userData>/offline/workspaces`.
 * @returns The stored workspace.
 * @example await initializeDeviceWorkspace(join(directory, 'workspaces'), { categoryCount: 3 })
 */
export async function initializeDeviceWorkspace(
  workspacesDirectory: string,
  input: DeviceWorkspaceFixtureInput = {},
): Promise<OfflineWorkspace> {
  const file = new AtomicWorkspaceFile({
    directory: workspacesDirectory,
    ownerId: DEVICE_OWNER_ID,
    fileName: DEVICE_WORKSPACE_FILE_NAME,
    parse: OfflineWorkspaceSchema.parse,
  })
  return file.initialize(buildDeviceWorkspace(input))
}
