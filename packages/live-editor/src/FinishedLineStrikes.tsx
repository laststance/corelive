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

  // An edit can scroll the field or add a scrollbar before any scroll event fires.
  useLayoutEffect(() => {
    syncStrikeGeometry(
      findSiblingField(viewportRef.current),
      viewportRef.current,
      contentRef.current,
    )
  }, [text])

  const rows = text.split('\n')
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
        {rows.map((row, index) => {
          const finished = splitFinishedLine(row)
          const newline = index < rows.length - 1 ? '\n' : ''
          // Unfinished rows still render so wrapping and line positions stay identical.
          if (!finished)
            return <React.Fragment key={index}>{row + newline}</React.Fragment>
          return (
            <React.Fragment key={index}>
              {finished.prefix}
              <span data-finished-title style={FINISHED_TITLE_STRIKE_STYLE}>
                {finished.title}
              </span>
              {finished.trailing + newline}
            </React.Fragment>
          )
        })}
      </div>
    </div>
  )
}
