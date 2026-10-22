import type { LiveEditorLineIndex } from './liveEditorUtils'

export type TextEditRange = Readonly<{
  /** Inclusive character offset before the textarea edit. */
  start: number
  /** Exclusive character offset before the textarea edit. */
  end: number
}>

type ExactSplice = {
  range: TextEditRange
  inserted: string
  removed: string
  newlineDelta: number
}

/** Verifies the browser's captured selection against both strings once per edit.
 * @example const splice = exactSplice(previousText, nextText, selection)
 */
function exactSplice(
  previousText: string,
  nextText: string,
  range?: TextEditRange,
): ExactSplice | null {
  if (
    !range ||
    range.start < 0 ||
    range.start > range.end ||
    range.end > previousText.length
  )
    return null
  const length =
    nextText.length - (previousText.length - range.end + range.start)
  const end = range.start + length
  if (
    length < 0 ||
    previousText.slice(0, range.start) !== nextText.slice(0, range.start) ||
    previousText.slice(range.end) !== nextText.slice(end)
  )
    return null
  const inserted = nextText.slice(range.start, end)
  const removed = previousText.slice(range.start, range.end)
  return {
    range,
    inserted,
    removed,
    newlineDelta: inserted.split('\n').length - removed.split('\n').length,
  }
}

/** Maps one row in constant time after the shared edit's offsets have been computed.
 * @example mapExactRow(2, 10, 15, splice)
 */
function mapExactRow(
  index: number,
  start: number,
  end: number,
  splice: ExactSplice,
): number | null {
  if (splice.range.end < start) return index + splice.newlineDelta
  if (splice.range.end === start)
    return !splice.removed.endsWith('\n') || splice.inserted.endsWith('\n')
      ? index + splice.newlineDelta
      : null
  if (splice.range.start > end) return index
  if (splice.range.start === end)
    return splice.inserted.startsWith('\n') ? index : null
  return null
}

/** Builds a linear-time index for one textarea edit; each occurrence lookup is then constant time.
 * Both native draft identities and web Undo tracking use this exact splice/fallback policy.
 * @example const remap = createLineRemapper('a\nb', 'new\na\nb', { start: 0, end: 0 }); remap(1)
 */
export function createLineRemapper(
  previousText: string,
  nextText: string,
  range?: TextEditRange,
): (index: number) => number | null {
  if (previousText === nextText) return (index) => index
  const previous = previousText.split('\n')
  const next = nextText.split('\n')
  const splice = exactSplice(previousText, nextText, range)
  if (splice) {
    let offset = 0
    const starts = previous.map((line) => {
      const start = offset
      offset += line.length + 1
      return start
    })
    return (index) =>
      mapExactRow(
        index,
        starts[index] ?? previousText.length,
        (starts[index] ?? previousText.length) + (previous[index]?.length ?? 0),
        splice,
      )
  }
  const occurrences = new Map<string, number>()
  for (const line of next)
    occurrences.set(line, (occurrences.get(line) ?? 0) + 1)
  let prefix = 0
  while (
    prefix < previous.length &&
    prefix < next.length &&
    previous[prefix] === next[prefix]
  )
    prefix++
  let suffix = 0
  while (
    suffix < previous.length - prefix &&
    suffix < next.length - prefix &&
    previous[previous.length - suffix - 1] === next[next.length - suffix - 1]
  )
    suffix++
  return (index) => {
    const line = previous[index]
    if (line !== undefined && (occurrences.get(line) ?? 0) > 1) return null
    if (index < prefix) return index
    if (index < previous.length - suffix) return null
    return index + next.length - previous.length
  }
}

/** Re-indexes one unchanged completion occurrence; edited/ambiguous rows lose their identity.
 * @example remapTrackedLineIndex('header\ntask', 'new\nheader\ntask', 1)
 */
export function remapTrackedLineIndex(
  previousText: string,
  nextText: string,
  index: LiveEditorLineIndex,
  range?: TextEditRange,
): LiveEditorLineIndex | null {
  return createLineRemapper(previousText, nextText, range)(index)
}
