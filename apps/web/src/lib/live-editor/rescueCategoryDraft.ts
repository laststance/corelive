import { broadcastCategorySync } from '../category-sync-channel'

import {
  appendCategoryDraft,
  flushCategoryDraft,
  type CategoryDraftRescue,
} from './appendCategoryDraft'
import {
  getCategoryDraftRescueReceipt,
  getUnrescuedCategoryDraftText,
  hasCategoryDraftRescueLanded,
  prepareCategoryDraftRescueReceipt,
  recordCategoryDraftRescueReceipt,
} from './categoryDraftRescueReceipts'
import { getLiveEditorHost } from './liveEditorHost'
import { getLocalStorageAvailability } from './localStorageSlot'

/** Preserves this host's writing before a local delete or while replaying another host's deletion.
 * Category management and {@link CategoryChangeSync} share the same durable, retry-safe append.
 * @param confirmedDeletion - True only for a verified account deletion receipt; saved copies may have since been kept or edited.
 * @returns Immutable rescue evidence, or undefined when this host has no source writing.
 * @throws When storage or the host write fails; callers must not delete or acknowledge the receipt.
 * @example await rescueCategoryDraft(12, 1)
 */
export async function rescueCategoryDraft(
  sourceId: number,
  destinationId: number,
  confirmedDeletion = false,
): Promise<CategoryDraftRescue | undefined> {
  if (!navigator.locks)
    throw new Error('This browser cannot safely coordinate draft rescue')
  return navigator.locks.request('corelive-category-draft-rescue', async () => {
    await flushCategoryDraft(sourceId)
    await flushCategoryDraft(destinationId)
    const sourceText = (await getLiveEditorHost().note.get(sourceId)).trim()
    if (!sourceText) return undefined
    if (getLocalStorageAvailability() !== 'ok')
      throw new Error('Device storage is unavailable')
    const host = getLiveEditorHost()
    const destinationText = await host.note.get(destinationId)
    let rescue = getCategoryDraftRescueReceipt(
      sourceId,
      destinationId,
      sourceText,
    )
    // Confirmed replay must respect writing already kept or edited after its durable rescue.
    if (confirmedDeletion && rescue?.state === 'saved') return rescue
    // Retained saved evidence distinguishes a replay from an independent identical draft.
    if (!rescue || !hasCategoryDraftRescueLanded(rescue, destinationText)) {
      const source = getUnrescuedCategoryDraftText(
        sourceId,
        destinationId,
        sourceText,
        destinationText,
        confirmedDeletion,
      )
      if (!source) return undefined
      rescue = prepareCategoryDraftRescueReceipt(
        sourceId,
        destinationId,
        destinationText,
        source,
        rescue !== undefined &&
          (rescue.state === 'saved' || rescue.baseText !== destinationText),
        sourceText,
      )
      if (getLocalStorageAvailability() !== 'ok')
        throw new Error('The rescue intent was not durably persisted')
      await appendCategoryDraft(destinationId, source)
    }
    if (rescue.state === 'prepared')
      rescue = recordCategoryDraftRescueReceipt(
        sourceId,
        destinationId,
        rescue.baseText,
        rescue.text,
        sourceText,
      )
    if (getLocalStorageAvailability() !== 'ok')
      throw new Error('The moved writing was not durably persisted')
    broadcastCategorySync(destinationId, rescue)
    return rescue
  })
}
