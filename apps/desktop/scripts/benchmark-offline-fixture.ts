import { randomUUID } from 'node:crypto'

import type { OfflineWorkspace } from '@corelive/desktop-contract/offline-workspace-v2'

import {
  buildDeviceWorkspace,
  categoryUuid,
} from '../electron/offline/deviceWorkspaceFixture'
import { COMPLETED_TITLE_MAX_LENGTH } from '../renderer/editor/liveEditorUtils'

const CATEGORY_COUNT = 20
const DRAFT_ROWS = 100
/** D1: 20 completions a day, so 36,500 is five years. */
const COMPLETIONS_PER_DAY = 20
const DAY_MS = 24 * 60 * 60 * 1000

/**
 * Builds the realistic benchmark workspace: completions with receipts, a partial outbox,
 * a 100-line draft whose every tenth line is at the title length limit.
 *
 * @param completions - Number of kept completions to hold.
 * @returns A schema-valid v2 workspace bound to a synthetic account.
 * @example const workspace = buildBenchmarkWorkspace(100)
 */
export function buildBenchmarkWorkspace(completions: number): OfflineWorkspace {
  const seeded = buildDeviceWorkspace({
    categoryCount: CATEGORY_COUNT,
    boundAccountId: 'synthetic-benchmark',
  })
  const firstCategory = categoryUuid(1)
  seeded.drafts[firstCategory] = {
    revision: 0,
    rows: Array.from({ length: DRAFT_ROWS }, (_, index) => ({
      id: randomUUID(),
      text:
        index % 10 === 9
          ? 'x'.repeat(COMPLETED_TITLE_MAX_LENGTH)
          : `Synthetic line ${index}`,
    })),
  }
  // Receipt revisions never exceed the workspace revision in a real file.
  seeded.revision = completions + 1
  const now = Date.now()
  for (let index = 0; index < completions; index++) {
    const id = randomUUID()
    const categoryId = categoryUuid((index % CATEGORY_COUNT) + 1)
    // A kept completion is one line; one in ten is at the title limit (the pessimistic share).
    const title =
      index % 10 === 9
        ? 'y'.repeat(COMPLETED_TITLE_MAX_LENGTH)
        : `Recorded synthetic work ${index}`
    // 20 per day (D1), newest first, so the fixture spans the real number of days.
    const completedAt =
      now -
      Math.floor(index / COMPLETIONS_PER_DAY) * DAY_MS -
      (index % 20) * 1000
    // One completion in ten is still waiting to send: it stays live whatever its age.
    const waiting = index % 10 === 0
    // Older, sent history is what a signed-in Mac holds: retired records that keep their text.
    if (!waiting && index % 2 === 1 && completedAt < now - 2 * DAY_MS) {
      seeded.retiredCompletions[id] = {
        completedAt,
        originalCompletedAt: completedAt,
        originalCategoryId: categoryId,
        timezone: 'Asia/Tokyo',
        cancelled: false,
        revision: 1,
        remoteRevision: 1,
        title,
        rawText: title,
      }
    } else {
      seeded.completions[id] = {
        id,
        categoryId,
        originalCategoryId: categoryId,
        title,
        rawText: title,
        lineId: randomUUID(),
        lineIndex: 0,
        completedAt,
        originalCompletedAt: completedAt,
        timezone: 'Asia/Tokyo',
        revision: 1,
        undoUntil: completedAt,
        cancelled: false,
        restored: false,
        remote: null,
        clearAfter: null,
        cleared: false,
      }
    }
    // A file from before receipts were bounded holds one per command.
    seeded.commandReceipts[randomUUID()] = {
      digest: 'f'.repeat(64),
      completionId: id,
      revision: index + 1,
    }
    if (waiting) {
      const operationId = randomUUID()
      seeded.outbox[operationId] = {
        state: 'queued',
        operation: {
          operationId,
          completionId: id,
          deviceId: seeded.deviceId,
          revision: 1,
          expectedRemoteRevision: 0,
          kind: 'create',
          categoryId,
          title,
          completedAt,
          originalCompletedAt: completedAt,
          timezone: 'Asia/Tokyo',
        },
      }
    }
  }
  return seeded
}
