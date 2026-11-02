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
 * @param textarea - The writing field whose geometry is mirrored.
 * @param viewport - Clip region covering the field's padding box.
 * @param content - Padded text layer translated by the field's scroll offset.
 * @returns Nothing; writes inline geometry on `viewport` and `content`.
 * @example syncStrikeGeometry(field, viewport, content)
 */
function syncStrikeGeometry(
  textarea: HTMLTextAreaElement,
  viewport: HTMLDivElement,
  content: HTMLDivElement,
): void {
  viewport.style.top = `${textarea.offsetTop + textarea.clientTop}px`
  viewport.style.left = `${textarea.offsetLeft + textarea.clientLeft}px`
  viewport.style.width = `${textarea.clientWidth}px`
  viewport.style.height = `${textarea.clientHeight}px`
  content.style.transform = `translate(${-textarea.scrollLeft}px, ${-textarea.scrollTop}px)`
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
    const viewport = viewportRef.current
    const content = contentRef.current
    const textarea = viewport?.parentElement?.querySelector('textarea')
    if (!viewport || !content || !textarea) return
    const sync = (): void => syncStrikeGeometry(textarea, viewport, content)
    sync()
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
    const viewport = viewportRef.current
    const content = contentRef.current
    const textarea = viewport?.parentElement?.querySelector('textarea')
    if (!viewport || !content || !textarea) return
    syncStrikeGeometry(textarea, viewport, content)
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
