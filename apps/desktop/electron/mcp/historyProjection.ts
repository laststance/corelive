import type {
  AccountHistoryRow,
  McpHistoryInput,
} from '@corelive/desktop-contract/completion-history'
import { stripJournalSearchLineBreaks } from '@corelive/desktop-contract/journal-search'

import type { DeviceHistory, DeviceHistoryRow } from './historyDevice'

type HistoryEntry = {
  id: string
  source: 'device' | 'account' | 'device-and-account'
  completionId: string | null
  title: string | null
  titleStatus: 'available' | 'unavailable-on-this-mac'
  completedAt: string
  categoryId: string | null
  categoryPath: string | null
  accountRow: { source: 'todo' | 'completed'; id: number } | null
}

/** Mirrors the dashboard's case-insensitive literal substring semantics, including Greek sigma.
 * @example searchKey('Final ς') // 'final σ'
 */
function searchKey(text: string): string {
  return stripJournalSearchLineBreaks(text).toLowerCase().replaceAll('ς', 'σ')
}

type Category = DeviceHistory['categories'][number]

/** Selects the category fields used by {@link accountEntry} and its filters.
 * @example const location = accountCategory(row, localCategoryId, categories, byServer)
 */
function accountCategory(
  row: AccountHistoryRow,
  localCategoryId: string | null,
  categories: Map<string, Category>,
  byServer: Map<number, Category>,
) {
  if (localCategoryId !== null) {
    const local = categories.get(localCategoryId)
    return {
      categoryId: local?.id ?? null,
      categoryPath: local?.path ?? row.categoryPath,
      parentId: local?.parentId ?? null,
    }
  }
  const parent =
    row.parentCategoryId === null
      ? undefined
      : byServer.get(row.parentCategoryId)
  return {
    categoryId: byServer.get(row.categoryId)?.id ?? null,
    categoryPath: row.categoryPath,
    parentId: parent?.id ?? null,
  }
}

/** Overlays only pending local changes on the visible account row with the same proven identity.
 * @example const resolved = accountEntry(row, matchedDeviceRow, categories, serverCategories)
 */
function accountEntry(
  row: AccountHistoryRow,
  matched: DeviceHistoryRow | undefined,
  categories: Map<string, Category>,
  byServer: Map<number, Category>,
) {
  const pending = matched?.pending ? matched : undefined
  // Settled completions can still have a pending category move.
  const localCategoryId =
    matched && (matched.pending || matched.categoryMovePending)
      ? matched.categoryId
      : null
  const { parentId, ...category } = accountCategory(
    row,
    localCategoryId,
    categories,
    byServer,
  )
  const entry: HistoryEntry = {
    id: matched ? `device:${matched.id}` : `${row.source}:${row.id}`,
    source: matched ? 'device-and-account' : 'account',
    completionId: row.completionId,
    title: pending?.title ?? row.title,
    titleStatus: 'available',
    completedAt: new Date(
      pending?.completedAt ?? row.completedAt,
    ).toISOString(),
    ...category,
    accountRow: { source: row.source, id: row.id },
  }
  return { entry, parentId }
}

/**
 * Merges only identities proven in the current account, overlays pending device edits, then filters.
 * Missing legacy titles keep their original timestamps and are never guessed from similar rows.
 * @example const page = projectHistory(device, rows, attachedAccountId, {search: '%_'})
 */
export function projectHistory(
  device: DeviceHistory,
  remote: AccountHistoryRow[],
  accountId: string | null,
  query: McpHistoryInput,
) {
  const sameAccount = accountId !== null && device.boundAccountId === accountId
  const categories = new Map(device.categories.map((cat) => [cat.id, cat]))
  const byServer = new Map(
    device.categories.flatMap((cat) =>
      sameAccount && cat.serverId !== null
        ? [[cat.serverId, cat] as const]
        : [],
    ),
  )
  const local = new Map(device.rows.map((row) => [row.id, row]))
  const suppressed = new Set(sameAccount ? device.suppressedIds : [])
  const entries: HistoryEntry[] = []
  const titleFilter = query.search ? searchKey(query.search) : ''
  const selected = query.categoryId
    ? categories.get(query.categoryId)
    : undefined
  let unverifiedFilterCount = 0
  const add = (
    entry: HistoryEntry,
    parentId: string | null,
    knownCategory: boolean,
  ): void => {
    const categoryMatches =
      !selected ||
      entry.categoryId === selected.id ||
      (query.includeSubcategories !== false && parentId === selected.id)
    const titleMatches =
      !titleFilter ||
      (entry.title !== null && searchKey(entry.title).includes(titleFilter))
    if (categoryMatches && titleMatches) entries.push(entry)
    // A known miss on either filter rules the record out, even when the other field is missing.
    else if (
      (categoryMatches || !knownCategory) &&
      (titleMatches || entry.title === null)
    )
      unverifiedFilterCount++
  }
  for (const row of remote) {
    const id = row.completionId
    if (id !== null && suppressed.has(id)) continue
    const candidate = sameAccount && id !== null ? local.get(id) : undefined
    const matched = candidate?.boundIdentity ? candidate : undefined
    const { entry, parentId } = accountEntry(row, matched, categories, byServer)
    add(entry, parentId, true)
    if (matched) local.delete(matched.id)
  }
  for (const row of local.values()) {
    const cat =
      row.categoryId === null ? undefined : categories.get(row.categoryId)
    add(
      {
        id: `device:${row.id}`,
        source: 'device',
        completionId: row.id,
        title: row.title,
        titleStatus:
          row.title === null ? 'unavailable-on-this-mac' : 'available',
        completedAt: new Date(row.completedAt).toISOString(),
        categoryId: row.categoryId,
        categoryPath: cat?.path ?? null,
        accountRow: null,
      },
      cat?.parentId ?? null,
      row.categoryId !== null,
    )
  }
  // Match the newest-first journal and give equal instants a stable tie-break across pages.
  entries.sort(
    (a, b) =>
      b.completedAt.localeCompare(a.completedAt) || a.id.localeCompare(b.id),
  )
  return { entries, unverifiedFilterCount }
}
