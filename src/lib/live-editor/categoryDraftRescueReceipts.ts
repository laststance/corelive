import { z } from 'zod'

import type { CategoryDraftRescue } from './appendCategoryDraft'
import { CATEGORY_DRAFT_RESCUE_STORAGE_KEY } from './constants'
import { createLocalStorageSlot } from './localStorageSlot'

const receiptSlot = createLocalStorageSlot(CATEGORY_DRAFT_RESCUE_STORAGE_KEY)
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
): CategoryDraftRescueReceipt {
  const existing = getCategoryDraftRescueReceipt(sourceId, destinationId, text)
  if (existing && !renewReceipt) return existing
  const prepared: CategoryDraftRescueReceipt = {
    receipt: crypto.randomUUID(),
    identity: JSON.stringify([sourceId, destinationId, text]),
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
 * @returns The saved evidence; caller must verify storage durability before deleting the server category.
 * @example
 * recordCategoryDraftRescueReceipt(12, 1, 'existing', 'thought')
 */
export function recordCategoryDraftRescueReceipt(
  sourceId: number,
  destinationId: number,
  baseText: string,
  text: string,
): CategoryDraftRescueReceipt {
  const existing = getCategoryDraftRescueReceipt(sourceId, destinationId, text)
  if (existing?.state === 'saved') return existing
  const saved: CategoryDraftRescueReceipt = {
    receipt: existing?.receipt ?? crypto.randomUUID(),
    identity: JSON.stringify([sourceId, destinationId, text]),
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
