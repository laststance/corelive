import { createHash } from 'node:crypto'

import {
  CompletionRangeSchema,
  HistoryFrameSchema,
  historyMember,
  type HistoryFrame,
} from '@corelive/desktop-contract/completion-history'
import { asyncIteratorObject } from '@orpc/server'

import { authMiddleware } from '../middleware/auth'
import { fetchCompletionHistoryRange } from '../utils/completedAggregation'

/**
 * Streams a finite, account-scoped database observation to an attached Mac. The rows and
 * terminal membership originate from the same query even if the account changes during transfer.
 * @example const frames = await client.completed.historyRange({ from, before })
 */
export const historyRange = authMiddleware
  .input(CompletionRangeSchema)
  .output(asyncIteratorObject(HistoryFrameSchema))
  .handler(async function* ({ input, context }): AsyncGenerator<HistoryFrame> {
    const rows = await fetchCompletionHistoryRange(context.user.id, input)
    const membership = createHash('sha256')
    for (let offset = 0; offset < rows.length; offset += 128) {
      const entries = rows.slice(offset, offset + 128)
      for (const row of entries) membership.update(historyMember(row))
      yield { type: 'rows', offset, entries }
    }
    yield {
      type: 'end',
      accountId: context.user.clerkId,
      total: rows.length,
      membership: membership.digest('hex'),
    }
  })
