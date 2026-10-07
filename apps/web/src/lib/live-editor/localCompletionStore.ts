import { toLocalDayKey } from '@/lib/toLocalDayKey'

import {
  LOCAL_COMPLETIONS_SCHEMA_VERSION,
  LOCAL_COMPLETIONS_STORAGE_KEY,
} from './constants'
import { createLocalId } from './createLocalId'
import { createLocalRecordStore } from './localRecordStore'
import { createLocalStorageSlot } from './localStorageSlot'
import { type LocalCompletion, localCompletionsFileSchema } from './schemas'

const slot = createLocalStorageSlot(LOCAL_COMPLETIONS_STORAGE_KEY)
const records = createLocalRecordStore(LOCAL_COMPLETIONS_STORAGE_KEY)

/**
 * Parses the raw stored completions string. Corrupt or foreign values read as
 * empty (never thrown) and are overwritten on the next write. Pure, so the
 * ember can derive its count in a `useMemo` keyed on the raw snapshot.
 * @param raw - The raw localStorage value, or null when nothing was written.
 * @returns The stored items, or `[]` for null / corrupt / foreign input.
 * @example
 * parseLocalCompletions('{"version":1,"items":[]}') // => []
 * parseLocalCompletions('not json')                 // => []
 */
export function parseLocalCompletions(raw: string | null): LocalCompletion[] {
  if (raw === null) return []
  try {
    const parsed = localCompletionsFileSchema.safeParse(JSON.parse(raw))
    return parsed.success ? parsed.data.items : []
  } catch {
    return []
  }
}

/** Serializes one completion so independent additions, Undo and merge tags cannot replace sibling records.
 * @example writeLocalCompletion({ id: 'a', title: 'milk', completedAt: '2026-09-04T09:00:00.000Z' })
 */
function writeLocalCompletion(item: LocalCompletion): void {
  records.write(
    item.id,
    JSON.stringify({
      version: LOCAL_COMPLETIONS_SCHEMA_VERSION,
      items: [item],
    }),
  )
}

/**
 * Records a signed-out keep with an independent per-ID write so sibling tab additions survive.
 * Called by {@link useCompletionWriter}; legacy aggregate values remain readable.
 * @param title - Normalised completed title (repeats are kept, never deduplicated).
 * @param completedAt - When the keep happened; defaults to now.
 * @returns The stored item, whose `id` the Undo path passes to {@link removeLocalCompletion}.
 * @example
 * addLocalCompletion('buy milk') // => { id: '7d0c…', title: 'buy milk', completedAt: '2026-09-04T…' }
 */
export function addLocalCompletion(
  title: string,
  completedAt: Date = new Date(),
): LocalCompletion {
  const item: LocalCompletion = {
    id: createLocalId(),
    title,
    completedAt: completedAt.toISOString(),
  }
  writeLocalCompletion(item)
  return item
}

/**
 * Deletes one signed-out keep by id (the Undo path). A missing id is a no-op
 * that writes nothing, so a double Undo never disturbs sibling tabs.
 * @param id - The id returned by {@link addLocalCompletion}.
 * @returns Nothing.
 * @example
 * removeLocalCompletion('7d0c1a2e-…')
 */
export function removeLocalCompletion(id: string): void {
  if (
    !parseLocalCompletions(getLocalCompletionsSnapshot()).some(
      (item) => item.id === id,
    )
  )
    return
  // Only legacy rows require a tombstone; new undone IDs must not consume storage forever.
  if (parseLocalCompletions(slot.read()).some((item) => item.id === id))
    records.write(id, 'null')
  else records.remove(id)
}

/**
 * Raw stored string for `useSyncExternalStore` — strings compare by value, so an
 * unchanged store never re-renders subscribers.
 * @returns The raw value, or null when nothing was written yet.
 * @example
 * getLocalCompletionsSnapshot() // => '{"version":1,"items":[…]}'
 */
export const getLocalCompletionsSnapshot = (): string | null => {
  const legacy = slot.read()
  const entries = records.entries()
  if (legacy === null && entries.length === 0) return null
  const items = new Map(
    parseLocalCompletions(legacy).map((item) => [item.id, item]),
  )
  for (const [id, raw] of entries) {
    items.delete(id)
    const [item] = parseLocalCompletions(raw)
    if (item?.id === id) items.set(id, item)
  }
  return JSON.stringify({
    version: LOCAL_COMPLETIONS_SCHEMA_VERSION,
    items: [...items.values()],
  })
}

/** Subscribes to same-tab writes and other tabs' `storage` events for the completions key. */
export const subscribeToLocalCompletions = records.subscribe

/**
 * Counts the unmerged keeps that fall on one local calendar day — the ember's
 * "today" while signed out, and the unmerged term while signed in.
 * @param items - Parsed items (see {@link parseLocalCompletions}).
 * @param dayKey - YYYY-MM-DD local day to match (from `useLocalDayKey()`).
 * @param timeZone - IANA zone used to bucket each `completedAt`; null buckets by UTC.
 * @returns How many unmerged items completed on that day; unparsable timestamps are skipped.
 * @example
 * countLocalCompletionsOnDay(items, '2026-09-04', 'Asia/Tokyo') // => 3
 */
export function countLocalCompletionsOnDay(
  items: LocalCompletion[],
  dayKey: string,
  timeZone: string | null,
): number {
  let count = 0
  for (const item of items) {
    // Items already merged into the account are counted by the server instead.
    if (item.mergedBatchId !== undefined) continue
    const completedAt = new Date(item.completedAt)
    if (Number.isNaN(completedAt.getTime())) continue
    if (toLocalDayKey(completedAt, timeZone) === dayKey) count += 1
  }
  return count
}

/**
 * The keeps a sign-in merge should send: not yet merged, and carrying a
 * timestamp the server can parse. Unparsable ones are skipped for the same
 * reason {@link countLocalCompletionsOnDay} skips them — they are already
 * invisible to the ember, and shipping an Invalid Date would 400 the whole batch.
 * @returns Items in stored order; `[]` when there is nothing to merge.
 * @example
 * readUnmergedLocalCompletions() // => [{ id: '5b1c…', title: 'buy milk', completedAt: '2026-09-04T…' }]
 */
export function readUnmergedLocalCompletions(): LocalCompletion[] {
  return parseLocalCompletions(getLocalCompletionsSnapshot()).filter(
    (item) =>
      item.mergedBatchId === undefined &&
      !Number.isNaN(new Date(item.completedAt).getTime()),
  )
}

/**
 * Stamps `mergedBatchId` on the keeps a merge just landed, which is what takes
 * them out of the ember's local count so the server's total is not double
 * counted. Safe to re-run: items already tagged (or missing entirely) are left
 * alone and an all-no-op call writes nothing, so a retry after a partially
 * applied tag-back cannot disturb sibling tabs.
 * @param ids - Exactly the ids that were sent, read from the pending merge record.
 * @param batchId - The client batch id the merge used.
 * @returns Nothing; subscribers re-read through the slot.
 * @example
 * tagLocalCompletionsMerged(['5b1c…'], '7d0c1a2e-…')
 */
export function tagLocalCompletionsMerged(
  ids: string[],
  batchId: string,
): void {
  const wanted = new Set(ids)
  for (const item of parseLocalCompletions(getLocalCompletionsSnapshot())) {
    // Each acknowledged record is updated independently; concurrent new keeps stay untouched.
    if (wanted.has(item.id) && item.mergedBatchId === undefined)
      writeLocalCompletion({ ...item, mergedBatchId: batchId })
  }
}
