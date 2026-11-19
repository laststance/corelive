import { createHash } from 'node:crypto'

import {
  HistoryFrameSchema,
  historyMember,
  type AccountHistoryRow,
  type CompletionRange,
} from '@corelive/desktop-contract/completion-history'

/**
 * Accepts account history only once its terminal count, membership, account and UTC bounds agree.
 * A failed or interrupted transfer rejects with no partial account rows exposed to a helper.
 * @example const rows = await readAccountFrames(frames, binding.accountId, range)
 */
export async function readAccountFrames(
  frames: AsyncIterable<unknown>,
  accountId: string,
  range: CompletionRange,
): Promise<AccountHistoryRow[]> {
  const rows: AccountHistoryRow[] = []
  const visible = new Set<string>()
  const linked = new Set<string>()
  const hash = createHash('sha256')
  let complete = false
  for await (const raw of frames) {
    if (complete) throw new Error('history-after-end')
    const frame = HistoryFrameSchema.parse(raw)
    if (frame.type === 'end') {
      if (
        frame.accountId !== accountId ||
        frame.total !== rows.length ||
        frame.membership !== hash.digest('hex')
      )
        throw new Error('history-membership-mismatch')
      complete = true
      continue
    }
    if (frame.offset !== rows.length) throw new Error('history-offset-mismatch')
    for (const row of frame.entries) {
      const key = `${row.source}:${row.id}`
      if (
        visible.has(key) ||
        row.completedAt < range.from ||
        row.completedAt >= range.before ||
        (row.completionId !== null &&
          (row.source !== 'completed' || linked.has(row.completionId)))
      )
        throw new Error('invalid-history-member')
      visible.add(key)
      if (row.completionId !== null) linked.add(row.completionId)
      hash.update(historyMember(row))
      rows.push(row)
    }
  }
  if (!complete) throw new Error('history-end-missing')
  return rows
}
