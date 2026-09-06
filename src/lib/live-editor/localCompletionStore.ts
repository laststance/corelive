import { toLocalDayKey } from '@/lib/toLocalDayKey'

import {
  LOCAL_COMPLETIONS_SCHEMA_VERSION,
  LOCAL_COMPLETIONS_STORAGE_KEY,
} from './constants'
import { createLocalStorageSlot } from './localStorageSlot'
import { type LocalCompletion, localCompletionsFileSchema } from './schemas'

const slot = createLocalStorageSlot(LOCAL_COMPLETIONS_STORAGE_KEY)

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

/**
 * Serialises and stores the full item list under the versioned file shape.
 * @param items - Every item that should survive (read-modify-write result).
 * @returns Nothing; subscribers are notified by the slot.
 * @example
 * writeLocalCompletions([{ id: 'a', title: 'milk', completedAt: '2026-09-04T09:00:00.000Z' }])
 */
function writeLocalCompletions(items: LocalCompletion[]): void {
  slot.write(
    JSON.stringify({ version: LOCAL_COMPLETIONS_SCHEMA_VERSION, items }),
  )
}

/**
 * Generates a local completion id — a uuid where the platform offers one, else
 * a time + random string (insecure LAN origins have no `crypto.randomUUID`).
 * @returns A non-empty id unique enough for one device's keeps.
 * @example
 * createLocalCompletionId() // => '7d0c1a2e-…'
 */
function createLocalCompletionId(): string {
  if (
    typeof crypto !== 'undefined' &&
    typeof crypto.randomUUID === 'function'
  ) {
    return crypto.randomUUID()
  }
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`
}

/**
 * Records a signed-out keep. Read-modify-write on the raw string so items a
 * sibling tab wrote since the last read survive. Called by `useCompletionWriter`.
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
    id: createLocalCompletionId(),
    title,
    completedAt: completedAt.toISOString(),
  }
  writeLocalCompletions([...parseLocalCompletions(slot.read()), item])
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
  const items = parseLocalCompletions(slot.read())
  const remaining = items.filter((item) => item.id !== id)
  if (remaining.length === items.length) return
  writeLocalCompletions(remaining)
}

/**
 * Raw stored string for `useSyncExternalStore` — strings compare by value, so an
 * unchanged store never re-renders subscribers.
 * @returns The raw value, or null when nothing was written yet.
 * @example
 * getLocalCompletionsSnapshot() // => '{"version":1,"items":[…]}'
 */
export const getLocalCompletionsSnapshot = (): string | null => slot.read()

/** Subscribes to same-tab writes and other tabs' `storage` events for the completions key. */
export const subscribeToLocalCompletions = slot.subscribe

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
  return parseLocalCompletions(slot.read()).filter(
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
  let changed = false
  const items = parseLocalCompletions(slot.read()).map((item) => {
    if (!wanted.has(item.id) || item.mergedBatchId !== undefined) return item
    changed = true
    return { ...item, mergedBatchId: batchId }
  })
  if (!changed) return
  writeLocalCompletions(items)
}
