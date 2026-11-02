'use client'
import * as React from 'react'
import { useEffect, useLayoutEffect, useRef } from 'react'

import { cn } from './cn'
import { splitFinishedLine } from './liveEditorUtils'

/** Hairline strike drawn over a finished title only; the token keeps every theme correct. */
const FINISHED_TITLE_STRIKE_STYLE: React.CSSProperties = {
  textDecorationLine: 'line-through',
  textDecorationThickness: '1px',
  textDecorationColor: 'var(--muted-foreground)',
}

/** Matches the textarea's own wrapping so every glyph lands on the same line. */
const MIRRORED_TEXT_STYLE: React.CSSProperties = {
  whiteSpace: 'pre-wrap',
  overflowWrap: 'break-word',
}

/**
 * Keeps the strike viewport on the textarea's padding box and the content at its scroll offset.
 * The viewport is offset by the border and sized to `clientWidth × clientHeight`, so the border
 * and any scrollbar are excluded exactly once.
 * @param textarea - The writing field whose geometry is mirrored; null before it mounts.
 * @param viewport - Clip region covering the field's padding box; null before it mounts.
 * @param content - Padded text layer translated by the field's scroll offset; null before it mounts.
 * @returns Nothing; writes inline geometry on `viewport` and `content` once all three exist.
 * @example syncStrikeGeometry(field, viewport, content)
 */
function syncStrikeGeometry(
  textarea: HTMLTextAreaElement | null,
  viewport: HTMLDivElement | null,
  content: HTMLDivElement | null,
): void {
  // Any missing node means the layer or its field is not mounted yet; there is nothing to align.
  if (!textarea || !viewport || !content) return
  viewport.style.top = `${textarea.offsetTop + textarea.clientTop}px`
  viewport.style.left = `${textarea.offsetLeft + textarea.clientLeft}px`
  viewport.style.width = `${textarea.clientWidth}px`
  viewport.style.height = `${textarea.clientHeight}px`
  content.style.transform = `translate(${-textarea.scrollLeft}px, ${-textarea.scrollTop}px)`
}

/**
 * Finds the writing field that shares the strike layer's wrapper, the single place both effects read it from.
 * The wrapper in {@link SharedEditorSurface} holds exactly one textarea and this layer.
 * @param viewport - The strike layer's root element, or null before it mounts.
 * @returns
 * - Mounted layer: the sibling textarea
 * - Unmounted layer or no field: null
 * @example findSiblingField(viewportRef.current) // → the editor surface's <textarea>
 */
function findSiblingField(
  viewport: HTMLDivElement | null,
): HTMLTextAreaElement | null {
  return viewport?.parentElement?.querySelector('textarea') ?? null
}

/**
 * Draws a hairline strike over the title of every finished (`- [x]`) row, on top of the
 * writing field, without touching the field itself. The text is transparent and the layer
 * ignores the pointer, so typing, IME composition, selection and the caret stay native.
 * Rendered by {@link SharedEditorSurface} as the field's sibling when keep mode is on.
 *
 * @param text - The field's current value; re-rendered on every edit.
 * @param paddingClassName - The field's padding class, shared with the field so both agree.
 * @param fontClassName - The field's font family class.
 * @param fontStyle - The field's font size and line height.
 * @returns An aria-hidden decoration layer.
 * @example
 * <FinishedLineStrikes text={value} paddingClassName="p-3" fontClassName="font-sans" fontStyle={{ fontSize: '16px', lineHeight: 1.6 }} />
 */
export function FinishedLineStrikes({
  text,
  paddingClassName,
  fontClassName,
  fontStyle,
}: {
  text: string
  paddingClassName: string
  fontClassName: string
  fontStyle: React.CSSProperties
}) {
  const viewportRef = useRef<HTMLDivElement>(null)
  const contentRef = useRef<HTMLDivElement>(null)

  // Follow the sibling field's size and scroll for the overlay's whole lifetime.
  useEffect(() => {
    const textarea = findSiblingField(viewportRef.current)
    const sync = (): void =>
      syncStrikeGeometry(textarea, viewportRef.current, contentRef.current)
    sync()
    if (!textarea) return
    const observer = new ResizeObserver(sync)
    observer.observe(textarea)
    textarea.addEventListener('scroll', sync)
    return (): void => {
      observer.disconnect()
      textarea.removeEventListener('scroll', sync)
    }
  }, [])

  // An edit or a font/padding change can scroll the field or add a scrollbar before any scroll event fires.
  useLayoutEffect(() => {
    syncStrikeGeometry(
      findSiblingField(viewportRef.current),
      viewportRef.current,
      contentRef.current,
    )
  }, [
    text,
    paddingClassName,
    fontClassName,
    fontStyle.fontSize,
    fontStyle.lineHeight,
  ])

  return (
    <div
      ref={viewportRef}
      aria-hidden="true"
      data-finished-line-strikes
      className="pointer-events-none absolute select-none overflow-hidden"
    >
      <div
        ref={contentRef}
        className={cn('text-transparent', paddingClassName, fontClassName)}
        style={{ ...MIRRORED_TEXT_STYLE, ...fontStyle }}
      >
        {toMirrorRuns(text).map((run, index) =>
          // Plain runs only hold struck titles in place; they stay transparent and undecorated.
          run.isStruck ? (
            <span
              key={index}
              data-finished-title
              style={FINISHED_TITLE_STRIKE_STYLE}
            >
              {run.text}
            </span>
          ) : (
            <React.Fragment key={index}>{run.text}</React.Fragment>
          ),
        )}
      </div>
    </div>
  )
}

/** One stretch of mirrored text: either a struck finished title or the plain text before it. */
type MirrorRun = Readonly<{ text: string; isStruck: boolean }>

/**
 * Turns the note into the fewest mirrored runs for {@link FinishedLineStrikes}.
 * Unstruck rows merge into one plain run, and text after the last finished title is dropped
 * because later text never moves earlier glyphs; DOM size follows finished rows, not note length.
 * @param text - The field's current value.
 * @returns
 * - Finished rows present: plain and struck runs alternating, ending at the last struck title
 * - No finished row: an empty list, so nothing is mirrored
 * @example
 * toMirrorRuns('Idea\n- [x] Ship it  \nLater')
 * // → [{ text: 'Idea\n- [x] ', isStruck: false }, { text: 'Ship it', isStruck: true }]
 */
function toMirrorRuns(text: string): MirrorRun[] {
  const runs: MirrorRun[] = []
  let plainText = ''
  const rows = text.split('\n')
  for (const [index, row] of rows.entries()) {
    const finished = splitFinishedLine(row)
    const newline = index < rows.length - 1 ? '\n' : ''
    // Unfinished rows only extend the plain run so the next title lands on its own line.
    if (!finished) {
      plainText += row + newline
      continue
    }
    runs.push(
      { text: plainText + finished.prefix, isStruck: false },
      { text: finished.title, isStruck: true },
    )
    plainText = finished.trailing + newline
  }
  return runs
}
