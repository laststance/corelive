import type {
  DraftRow,
  OfflineDraft,
} from '@corelive/desktop-contract/offline-workspace'
import { z } from 'zod'

export const DraftTextPageInputSchema = z.strictObject({
  offset: z.int().nonnegative(),
  limit: z.int().min(1).max(65536).default(32768),
  expectedRevision: z.int().nonnegative().optional(),
})

type RowSpan = Pick<DraftRow, 'id' | 'completionId'> & {
  startOffset: number
  endOffset: number
}
type Page = {
  text: string
  revision: number
  offset: number
  nextOffset: number | null
  totalLength: number
  rowSpans: RowSpan[]
}
export type DraftTextPageInput = z.output<typeof DraftTextPageInputSchema>
export type DraftTextPageResult =
  | { status: 'page'; page: Page }
  | { status: 'revision-conflict'; currentRevision: number }
  | { status: 'invalid-offset' }

const MAX_ROW_SPANS = 1024
const offsetsByDraft = new WeakMap<OfflineDraft, number[]>()

/** Indexes the worker's committed draft so continuation pages can seek by UTF-16 offset.
 * @example const starts = rowStarts(draft)
 */
function rowStarts(draft: OfflineDraft): number[] {
  const cached = offsetsByDraft.get(draft)
  if (cached) return cached
  let offset = 0
  const starts = draft.rows.map(({ text }) => {
    const start = offset
    offset += text.length + 1
    return start
  })
  offsetsByDraft.set(draft, starts)
  return starts
}

/** Finds the row owning an offset, including the separator after its text.
 * @example rowAtOffset([0, 4], 3) // => 0
 */
function rowAtOffset(starts: readonly number[], offset: number): number {
  let low = 0
  let high = starts.length
  while (low < high) {
    const middle = Math.floor((low + high) / 2)
    if (starts[middle]! <= offset) low = middle + 1
    else high = middle
  }
  return Math.max(0, low - 1)
}

/** Checks whether a UTF-16 boundary cuts a Unicode surrogate pair in half.
 * @example splitsSurrogatePair('A😀B', 2) // => true
 */
function splitsSurrogatePair(text: string, offset: number): boolean {
  const first = text.charCodeAt(offset - 1)
  const second = text.charCodeAt(offset)
  return (
    first >= 0xd800 && first <= 0xdbff && second >= 0xdc00 && second <= 0xdfff
  )
}

/** Projects bounded writing and original row identities inside the storage worker.
 * Row spans exclude separating newlines and describe whole rows even when their text spans pages.
 * @example draftTextPage(draft, { offset: 0, limit: 32768 })
 */
export function draftTextPage(
  draft: OfflineDraft,
  { offset, limit, expectedRevision }: DraftTextPageInput,
): DraftTextPageResult {
  const { revision, rows } = draft
  if (expectedRevision !== undefined && expectedRevision !== revision)
    return { status: 'revision-conflict', currentRevision: revision }

  const starts = rowStarts(draft)
  const totalLength = (starts.at(-1) ?? 0) + (rows.at(-1)?.text.length ?? 0)
  if (offset > totalLength) return { status: 'invalid-offset' }
  const firstIndex = rowAtOffset(starts, offset)
  const firstRow = rows[firstIndex]
  if (
    firstRow &&
    splitsSurrogatePair(firstRow.text, offset - starts[firstIndex]!)
  )
    return { status: 'invalid-offset' }

  // Bound row metadata independently of text, including notes made entirely of empty lines.
  const rowLimit = starts[firstIndex + MAX_ROW_SPANS] ?? totalLength
  let end = Math.min(totalLength, offset + limit, rowLimit)
  const lastIndex = rowAtOffset(starts, end)
  const lastRow = rows[lastIndex]
  if (lastRow && splitsSurrogatePair(lastRow.text, end - starts[lastIndex]!))
    end++

  const chunks: string[] = []
  const rowSpans: RowSpan[] = []
  for (
    let index = firstIndex;
    index <= lastIndex && index < rows.length;
    index++
  ) {
    const { id, text, completionId } = rows[index]!
    const startOffset = starts[index]!
    // Include the final empty row when its start is the end of the document.
    if (startOffset >= end && startOffset < totalLength) break
    const endOffset = startOffset + text.length
    rowSpans.push({ id, completionId, startOffset, endOffset })
    chunks.push(
      text.slice(Math.max(0, offset - startOffset), end - startOffset),
    )
    if (endOffset < end) chunks.push('\n')
  }
  return {
    status: 'page',
    page: {
      text: chunks.join(''),
      revision,
      offset,
      nextOffset: end < totalLength ? end : null,
      totalLength,
      rowSpans,
    },
  }
}
