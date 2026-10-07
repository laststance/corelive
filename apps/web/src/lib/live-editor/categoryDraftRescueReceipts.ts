import { z } from 'zod'

import type { CategoryDraftRescue } from './appendCategoryDraft'
import { CATEGORY_DRAFT_RESCUE_STORAGE_KEY } from './constants'
import { createLocalStorageSlot } from './localStorageSlot'

const receiptSlot = createLocalStorageSlot(CATEGORY_DRAFT_RESCUE_STORAGE_KEY)
const rescueIdentitySchema = z.tuple([
  z.number().int().positive(),
  z.number().int().positive(),
  z.string(),
])
const receiptsSchema = z.array(
  z.object({
    receipt: z.string(),
    identity: z.string().optional(),
    baseText: z.string(),
    text: z.string(),
    state: z.enum(['prepared', 'saved']).default('saved'),
  }),
)

type CategoryDraftRescueReceipt = CategoryDraftRescue & {
  identity: string
  state: 'prepared' | 'saved'
}

/**
 * Reads source-specific rescue intents independently of the destination's mutable writing.
 * @returns Valid stored evidence, or an empty list when the device record is absent/corrupt.
 * @example
 * readRescueReceipts() // [{ receipt: '[12,1,"thought"]', baseText: '', text: 'thought', state: 'prepared' }]
 */
function readRescueReceipts(): CategoryDraftRescueReceipt[] {
  const raw = receiptSlot.read()
  if (raw === null) return []
  try {
    const result = receiptsSchema.safeParse(JSON.parse(raw))
    return result.success
      ? result.data.map((receipt) => ({
          ...receipt,
          identity: receipt.identity ?? receipt.receipt,
        }))
      : []
  } catch {
    return []
  }
}

/**
 * Finds persisted intent/completion evidence without conflating independent identical notes.
 * @returns Original immutable evidence and its persistence stage, or undefined before preparation.
 * @example
 * getCategoryDraftRescueReceipt(12, 1, 'thought') // undefined before preparation
 */
export function getCategoryDraftRescueReceipt(
  sourceId: number,
  destinationId: number,
  text: string,
): CategoryDraftRescueReceipt | undefined {
  const identity = JSON.stringify([sourceId, destinationId, text])
  return readRescueReceipts().find(
    (candidate) => candidate.identity === identity,
  )
}

/**
 * Saves or renews a source-specific intent before append so retries recover without hiding a removed copy.
 * @param sourceRevision - Full source text distinguishing repeated identical suffixes from a previous rescued prefix.
 * @param renewReceipt - Gives a missing previous copy a fresh peer-event identity and current base.
 * @returns The existing intent/completion, or a newly written prepared intent; caller must verify storage durability.
 * @example
 * prepareCategoryDraftRescueReceipt(12, 1, 'existing', 'thought')
 */
export function prepareCategoryDraftRescueReceipt(
  sourceId: number,
  destinationId: number,
  baseText: string,
  text: string,
  renewReceipt = false,
  sourceRevision = text,
): CategoryDraftRescueReceipt {
  const existing = getCategoryDraftRescueReceipt(
    sourceId,
    destinationId,
    sourceRevision,
  )
  if (existing && !renewReceipt) return existing
  const prepared: CategoryDraftRescueReceipt = {
    receipt: crypto.randomUUID(),
    identity: JSON.stringify([sourceId, destinationId, sourceRevision]),
    baseText,
    text,
    state: 'prepared',
  }
  const receipts = readRescueReceipts().filter(
    (candidate) => candidate.identity !== prepared.identity,
  )
  receiptSlot.write(JSON.stringify([...receipts, prepared]))
  return prepared
}

/**
 * Marks an awaited append complete while retaining the prepared base needed for retry and peer refresh.
 * @param sourceRevision - Full source revision used by the prepared intent, independent of the appended suffix.
 * @returns The saved evidence; caller must verify storage durability before deleting the server category.
 * @example
 * recordCategoryDraftRescueReceipt(12, 1, 'existing', 'thought')
 */
export function recordCategoryDraftRescueReceipt(
  sourceId: number,
  destinationId: number,
  baseText: string,
  text: string,
  sourceRevision = text,
): CategoryDraftRescueReceipt {
  const existing = getCategoryDraftRescueReceipt(
    sourceId,
    destinationId,
    sourceRevision,
  )
  if (existing?.state === 'saved') return existing
  const saved: CategoryDraftRescueReceipt = {
    receipt: existing?.receipt ?? crypto.randomUUID(),
    identity: JSON.stringify([sourceId, destinationId, sourceRevision]),
    baseText: existing?.baseText ?? baseText,
    text,
    state: 'saved',
  }
  const receipts = readRescueReceipts().filter(
    (candidate) => candidate.identity !== saved.identity,
  )
  receiptSlot.write(JSON.stringify([...receipts, saved]))
  return saved
}

/**
 * Recovers a prepared append after note persistence succeeded but its completion marker failed.
 *
 * The prepared source/destination identity makes this evidence specific to one rescue;
 * matching destination text without an intent cannot skip an independent first append.
 * @returns True only while the receipt-specific whole-line copy remains in the current destination.
 * @example
 * hasCategoryDraftRescueLanded(prepared, 'existing\nthought\nnew writing') // true
 */
export function hasCategoryDraftRescueLanded(
  receipt: CategoryDraftRescueReceipt,
  destinationText: string,
): boolean {
  const expected = receipt.baseText
    ? `${receipt.baseText.trimEnd()}\n${receipt.text}`
    : receipt.text
  return (
    Boolean(expected) &&
    (destinationText === expected ||
      destinationText.startsWith(`${expected}\n`))
  )
}

/** Removes only consecutive source prefixes whose receipt-specific copies still exist in the destination.
 * Used when an earlier category deletion rescued this draft before a delayed upstream deletion extended it.
 * Independent identical lines without durable rescue evidence remain part of the append.
 * @param confirmedDeletion - Accept saved-copy proof after the account deletion is confirmed, respecting later user edits.
 * @returns The source suffix still requiring rescue, or an empty string when every part already landed.
 * @example getUnrescuedCategoryDraftText(12, 1, 'old\nnew', 'old') // 'new' with saved evidence for old
 */
export function getUnrescuedCategoryDraftText(
  sourceId: number,
  destinationId: number,
  sourceText: string,
  destinationText: string,
  confirmedDeletion = false,
): string {
  let remaining = sourceText
  const receipts = readRescueReceipts()
  for (const receipt of receipts) {
    // An exact source/destination identity and whole-line destination copy prove this prefix was preserved.
    let identity: unknown
    try {
      identity = JSON.parse(receipt.identity)
    } catch {
      continue
    }
    const parsed = rescueIdentitySchema.safeParse(identity)
    if (
      !parsed.success ||
      parsed.data[0] !== sourceId ||
      parsed.data[1] !== destinationId ||
      (!(confirmedDeletion && receipt.state === 'saved') &&
        !hasCategoryDraftRescueLanded(receipt, destinationText))
    )
      continue
    if (remaining === receipt.text) return ''
    if (remaining.startsWith(`${receipt.text}\n`))
      remaining = remaining.slice(receipt.text.length + 1)
  }
  return remaining
}

/**
 * Retires retry evidence only after host-local draft replay and its account cursor are durably saved.
 *
 * Prepared and saved evidence for every other source remains available. This bounds
 * completed-operation growth without an arbitrary cap that would break unresolved retries.
 * @param sourceId - Exact source category whose deletion has been durably replayed.
 * @returns Nothing; metadata maintenance failures never invalidate a confirmed deletion.
 * @example
 * localStorage.setItem('corelive.category-changes.user_123', '42')
 * retireCategoryDraftRescueReceipts(12) // after rescue and durable cursor acknowledgement
 */
export function retireCategoryDraftRescueReceipts(sourceId: number): void {
  try {
    const receipts = readRescueReceipts()
    const remaining = receipts.filter((receipt) => {
      try {
        const identity = rescueIdentitySchema.safeParse(
          JSON.parse(receipt.identity),
        )
        // Unknown identity formats cannot establish ownership and retain their evidence.
        return !identity.success || identity.data[0] !== sourceId
      } catch {
        return true
      }
    })
    if (remaining.length !== receipts.length)
      receiptSlot.write(JSON.stringify(remaining))
  } catch {
    // Deletion is already committed; failed local cleanup must not present it as a failed operation.
  }
}
