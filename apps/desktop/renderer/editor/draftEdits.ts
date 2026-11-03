import type { DraftRow } from '@corelive/desktop-contract/offline-workspace'

import type { EditorSelection } from './editorInput'
import { createLineRemapper, type TextEditRange } from './rowIdentity'

export interface DraftEdit {
  version: number
  removedIds: string[]
  inserted: DraftRow[]
  beforeId: string | null
  afterId: string | null
  index: number
}

/** Coalesces idle typing by stable row identity while retaining unchanged rows as merge anchors.
 * This bounds edit-history memory during a long uninterrupted typing/composition session.
 * @example const edits = diffDraftRows(base.rows, live.rows, liveVersion)
 */
export function diffDraftRows(
  base: DraftRow[],
  live: DraftRow[],
  version: number,
): DraftEdit[] {
  const positions = new Map(base.map((row, index) => [row.id, index]))
  const edits: DraftEdit[] = []
  let oldStart = 0
  let newStart = 0
  const append = (oldEnd: number, newEnd: number): void => {
    if (oldEnd === oldStart && newEnd === newStart) return
    edits.push({
      version,
      removedIds: base.slice(oldStart, oldEnd).map((row) => row.id),
      inserted: live.slice(newStart, newEnd),
      beforeId: base[oldStart - 1]?.id ?? null,
      afterId: base[oldEnd]?.id ?? null,
      index: oldStart,
    })
  }
  for (const [index, row] of live.entries()) {
    const old = positions.get(row.id)
    if (old === undefined || old < oldStart || base[old]!.text !== row.text)
      continue
    append(old, index)
    oldStart = old + 1
    newStart = index + 1
  }
  append(base.length, live.length)
  return edits
}

/** Gives unchanged occurrences their existing identities and ambiguous edited rows fresh identities.
 * Uses the same exact browser-splice remapping as the web completion controller.
 * @example const change = editDraftRows(rows, nextText, selection, version)
 */
export function editDraftRows(
  previous: DraftRow[],
  text: string,
  range: TextEditRange | undefined,
  version: number,
  nextId: () => string = () => crypto.randomUUID(),
) {
  const oldText = previous.map((row) => row.text).join('\n')
  const lines = text.split('\n')
  const kept = new Map<number, DraftRow>()
  const remap = createLineRemapper(oldText, text, range)
  for (const [index, row] of previous.entries()) {
    const next = remap(index)
    if (next !== null && lines[next] === row.text && !kept.has(next))
      kept.set(next, row)
  }
  const rows = lines.map(
    (line, index) => kept.get(index) ?? { id: nextId(), text: line },
  )
  let prefix = 0
  while (
    prefix < previous.length &&
    prefix < rows.length &&
    previous[prefix]!.id === rows[prefix]!.id
  )
    prefix++
  let suffix = 0
  while (
    suffix < previous.length - prefix &&
    suffix < rows.length - prefix &&
    previous[previous.length - suffix - 1]!.id ===
      rows[rows.length - suffix - 1]!.id
  )
    suffix++
  const edit: DraftEdit = {
    version,
    removedIds: previous
      .slice(prefix, previous.length - suffix)
      .map((row) => row.id),
    inserted: rows.slice(prefix, rows.length - suffix),
    beforeId: previous[prefix - 1]?.id ?? null,
    afterId: previous[previous.length - suffix]?.id ?? null,
    index: prefix,
  }
  return { rows, edit }
}

/** Replays unacknowledged local edits over a durable clear/Undo/move without overwriting newer writing.
 * Remote additions stay intact; matching titles never identify an occurrence.
 * @example const live = applyDraftEdits(acknowledgedRows, remainingEdits)
 */
export function applyDraftEdits(
  base: DraftRow[],
  edits: readonly DraftEdit[],
): DraftRow[] {
  let rows = base.slice()
  for (const edit of edits) {
    const removed = new Set(edit.removedIds)
    const first = rows.findIndex((row) => removed.has(row.id))
    const firstRetainedIndex =
      first < 0
        ? -1
        : rows.slice(0, first).filter((row) => !removed.has(row.id)).length
    rows = rows.filter((row) => !removed.has(row.id))
    const before = rows.findIndex((row) => row.id === edit.beforeId)
    const after = rows.findIndex((row) => row.id === edit.afterId)
    const position =
      firstRetainedIndex >= 0
        ? firstRetainedIndex
        : before >= 0
          ? before + 1
          : after >= 0
            ? after
            : Math.min(edit.index, rows.length)
    const present = new Set(rows.map((row) => row.id))
    rows.splice(
      position,
      0,
      ...edit.inserted.filter((row) => !present.has(row.id)),
    )
  }
  return rows
}

/** Maps live caret/selection through acknowledged row changes, retaining the actual occurrence when possible.
 * @example const selection = remapEditorSelection(previousRows, nextRows, currentSelection)
 */
export function remapEditorSelection(
  previous: DraftRow[],
  next: DraftRow[],
  selection: EditorSelection,
): EditorSelection {
  const offset = (value: number): number => {
    let start = 0
    let index = 0
    for (; index < previous.length - 1; index++) {
      if (value <= start + previous[index]!.text.length) break
      start += previous[index]!.text.length + 1
    }
    const old = previous[index]
    const found = old ? next.findIndex((row) => row.id === old.id) : -1
    const target =
      found >= 0 ? found : Math.min(index, Math.max(0, next.length - 1))
    const rowStart = next
      .slice(0, target)
      .reduce((sum, row) => sum + row.text.length + 1, 0)
    if (found < 0 || !old) return rowStart
    const current = next[found]!.text
    const column = Math.min(Math.max(0, value - start), old.text.length)
    let suffix = 0
    while (
      suffix < old.text.length &&
      suffix < current.length &&
      old.text[old.text.length - suffix - 1] ===
        current[current.length - suffix - 1]
    )
      suffix++
    return (
      rowStart +
      Math.max(
        0,
        Math.min(
          current.length,
          column >= old.text.length - suffix
            ? column + current.length - old.text.length
            : column,
        ),
      )
    )
  }
  return {
    start: offset(selection.start),
    end: offset(selection.end),
    direction: selection.direction,
  }
}
