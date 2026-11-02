// @vitest-environment happy-dom
import '@testing-library/jest-dom/vitest'
import { UserSettingsStateSchema } from '@corelive/desktop-contract/settings'
import { SharedEditorSurface } from '@corelive/live-editor/surface'
import { splitFinishedLine } from '@corelive/live-editor/utils'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, test, vi } from 'vitest'

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

describe('splitFinishedLine', () => {
  test.each([
    {
      line: '- [x] Ship the release',
      expected: { prefix: '- [x] ', title: 'Ship the release', trailing: '' },
    },
    {
      line: '  - [x] Nested task',
      expected: { prefix: '  - [x] ', title: 'Nested task', trailing: '' },
    },
    {
      line: '- [x] 10月の請求書の提出   ',
      expected: {
        prefix: '- [x] ',
        title: '10月の請求書の提出',
        trailing: '   ',
      },
    },
    {
      line: '- [x]    spaced title\t',
      expected: { prefix: '- [x]    ', title: 'spaced title', trailing: '\t' },
    },
  ])(
    'strikes only the visible title of finished row "$line"',
    ({ line, expected }) => {
      // Act
      const parts = splitFinishedLine(line)

      // Assert
      expect(parts).toEqual(expected)
      expect(`${parts?.prefix}${parts?.title}${parts?.trailing}`).toBe(line)
    },
  )

  test.each([
    '- [ ] Not done yet',
    'Plain writing',
    '',
    '- [x] ',
    '- [X] Uppercase',
  ])('leaves row "%s" without a strike', (line) => {
    // Act / Assert
    expect(splitFinishedLine(line)).toBeNull()
  })
})

/** Renders the shared editor surface as the desktop panel with synthetic settings only.
 * @example renderSurface({ text: '- [x] Done', strike: true })
 */
function renderSurface({
  text,
  strike,
  details,
}: {
  text: string
  strike: boolean
  details?: React.ReactNode
}) {
  return render(
    <SharedEditorSurface
      windowSettings={{
        opacity: 1,
        spacesTrackingEnabled: false,
        isUpdatingSpacesTracking: false,
        handleSpacesTrackingChange: vi.fn(),
        handleOpacityValueChange: vi.fn(),
      }}
      textareaProps={{ value: text, onChange: vi.fn() }}
      categoryCount={1}
      categoryPicker={null}
      settings={UserSettingsStateSchema.parse({ liveEditorFontSize: 18 })}
      details={details}
      isCategoryListPending={false}
      isCategoryListError={false}
      isMounted
      isLiveEditorConfigReady
      activeCategoryId={1}
      isNoteFieldDisabled={false}
      strikeFinishedLines={strike}
      handleKeepLineClick={vi.fn()}
      closeWindow={vi.fn()}
    />,
  )
}

describe('finished-line strikes on the desktop writing field', () => {
  test('keep mode strikes the title of each finished row and nothing else', () => {
    // Arrange / Act
    const { container } = renderSurface({
      text: '- [x] 10月の請求書の提出  \n- [ ] セルフコードレビュー\nLaravelの学習\n  - [x] DB構造の学習',
      strike: true,
    })

    // Assert
    const titles = [...container.querySelectorAll('[data-finished-title]')].map(
      (element) => element.textContent,
    )
    expect(titles).toEqual(['10月の請求書の提出', 'DB構造の学習'])
    const layer = container.querySelector('[data-finished-line-strikes]')
    expect(layer).toHaveAttribute('aria-hidden', 'true')
    expect(layer).toHaveClass('pointer-events-none')
    // The mirror holds the text through the last finished title so wrapping matches the field line for line.
    expect(layer?.textContent).toBe(
      '- [x] 10月の請求書の提出  \n- [ ] セルフコードレビュー\nLaravelの学習\n  - [x] DB構造の学習',
    )
  })

  test('a long note with no finished line adds no text to the strike layer', () => {
    // Arrange / Act — a newline-heavy paste must not become one DOM node per row.
    const { container } = renderSurface({
      text: `${'\n'.repeat(5000)}Plain idea`,
      strike: true,
    })

    // Assert
    const content = container.querySelector(
      '[data-finished-line-strikes] > div',
    )
    expect(content?.childNodes).toHaveLength(0)
  })

  test('unfinished rows collapse into one run and text after the last finished title is not mirrored', () => {
    // Arrange / Act
    const { container } = renderSurface({
      text: 'Idea one\nIdea two\n- [x] Done  \nLater one\nLater two',
      strike: true,
    })

    // Assert — one plain run plus the struck title, nothing after it.
    const content = container.querySelector(
      '[data-finished-line-strikes] > div',
    )
    expect(content?.childNodes).toHaveLength(2)
    expect(content?.textContent).toBe('Idea one\nIdea two\n- [x] Done')
  })

  test('the strike is a hairline in the muted theme token, never a fixed color', () => {
    // Arrange / Act
    const { container } = renderSurface({ text: '- [x] Done', strike: true })

    // Assert
    const title = container.querySelector<HTMLElement>('[data-finished-title]')
    expect(title?.style.textDecorationLine).toBe('line-through')
    expect(title?.style.textDecorationThickness).toBe('1px')
    expect(title?.style.textDecorationColor).toBe('var(--muted-foreground)')
  })

  test('the strike layer mirrors the field font size and padding so text wraps identically', () => {
    // Arrange / Act
    const { container } = renderSurface({ text: '- [x] Done', strike: true })

    // Assert
    const field = screen.getByRole('textbox', { name: 'Write one thing' })
    const content = container.querySelector(
      '[data-finished-line-strikes] > div',
    )
    expect(content).toHaveClass('p-3')
    expect(field).toHaveClass('p-3')
    expect((content as HTMLElement | null)?.style.fontSize).toBe('18px')
    expect(field.style.fontSize).toBe('18px')
  })

  test('clear mode draws no strike layer', () => {
    // Arrange / Act
    const { container } = renderSurface({ text: '- [x] Done', strike: false })

    // Assert
    expect(container.querySelector('[data-finished-line-strikes]')).toBeNull()
  })

  test('opening Details hides the field and its strikes while keeping the field mounted', () => {
    // Arrange / Act
    const { container } = renderSurface({
      text: '- [x] Done',
      strike: true,
      details: <section aria-label="Details panel">Details</section>,
    })

    // Assert
    const field = container.querySelector('textarea')
    expect(field).not.toBeNull()
    expect(field).not.toBeVisible()
    expect(
      container.querySelector('[data-finished-line-strikes]'),
    ).not.toBeVisible()
    expect(screen.getByLabelText('Details panel')).toBeVisible()
  })

  // Value: protects=strike layer follows the field's scroll offset and padding box; fails_when=scroll sync or viewport sizing is dropped;
  // why_new=existing tests cover markup only, never geometry; seam=none; no_claim=real layout (happy-dom stubs box metrics)
  test('scrolling a long note moves the strikes with the text instead of leaving them behind', () => {
    // Arrange
    vi.stubGlobal(
      'ResizeObserver',
      class {
        observe(): void {}
        unobserve(): void {}
        disconnect(): void {}
      },
    )
    const { container } = renderSurface({ text: '- [x] Done', strike: true })
    const field = container.querySelector('textarea') as HTMLTextAreaElement
    stubFieldBox(field, {
      fieldRect: { left: 6, top: 4, width: 302, height: 122 },
      offsetWidth: 302,
      clientWidth: 300,
      offsetHeight: 122,
      clientHeight: 120,
      scrollTop: 48,
    })

    // Act
    fireEvent.scroll(field)

    // Assert
    const viewport = container.querySelector<HTMLElement>(
      '[data-finished-line-strikes]',
    )
    const content = viewport?.firstElementChild as HTMLElement
    expect(viewport?.style.top).toBe('5px')
    expect(viewport?.style.left).toBe('7px')
    expect(viewport?.style.width).toBe('300px')
    expect(viewport?.style.height).toBe('120px')
    expect(content.style.transform).toBe('translate(0px, -48px)')
  })

  // Value: protects=a zoomed (fractional-width) field wraps its mirror at the same glyph as the field; fails_when=the mirror width is
  // rounded to whole pixels, so a near-limit line breaks one glyph later and the strike leaves its text; why_new=the scroll test uses
  // whole-pixel metrics only; seam=none; no_claim=real glyph layout (happy-dom stubs box metrics; headless QA covers real wrapping)
  test('a zoomed field with a fractional width keeps the strikes wrapping at the same glyph as the text', () => {
    // Arrange — Electron page zoom lays the field out at fractional CSS pixels; clientWidth rounds 698.59375 up to 699.
    vi.stubGlobal(
      'ResizeObserver',
      class {
        observe(): void {}
        unobserve(): void {}
        disconnect(): void {}
      },
    )
    const { container } = renderSurface({ text: '- [x] Done', strike: true })
    const field = container.querySelector('textarea') as HTMLTextAreaElement
    stubFieldBox(field, {
      fieldRect: { left: 0.25, top: 0.5, width: 700.59375, height: 400.5 },
      offsetWidth: 701,
      clientWidth: 699,
      offsetHeight: 401,
      clientHeight: 399,
      scrollTop: 0,
    })

    // Act
    fireEvent.scroll(field)

    // Assert — the mirror's padding box equals the field's exact padding box, not the rounded clientWidth.
    const viewport = container.querySelector<HTMLElement>(
      '[data-finished-line-strikes]',
    )
    expect(viewport?.style.width).toBe('698.59375px')
    expect(viewport?.style.height).toBe('398.5px')
    expect(viewport?.style.left).toBe('1.25px')
    expect(viewport?.style.top).toBe('1.5px')
  })

  // Value: protects=a zoomed field whose border is a fractional CSS width still mirrors its exact padding box; fails_when=integer
  // rounding of offsetWidth/clientWidth/border is mistaken for a 1px scrollbar and the mirror wraps a glyph early; why_new=the other
  // geometry tests use whole-pixel borders; seam=none; no_claim=real glyph layout (happy-dom stubs box metrics)
  test('a zoomed field with fractional borders keeps the strikes on the text instead of inventing a scrollbar gap', () => {
    // Arrange — at 1.5x device pixels a 1-device-pixel border is 0.666667 CSS px; offset/client sizes still round to integers.
    vi.stubGlobal(
      'ResizeObserver',
      class {
        observe(): void {}
        unobserve(): void {}
        disconnect(): void {}
      },
    )
    const { container } = renderSurface({ text: '- [x] Done', strike: true })
    const field = container.querySelector('textarea') as HTMLTextAreaElement
    stubFieldBox(field, {
      fieldRect: { left: 0, top: 0, width: 700.6, height: 400.6 },
      offsetWidth: 701,
      clientWidth: 699,
      offsetHeight: 401,
      clientHeight: 399,
      scrollTop: 0,
      borderPx: 0.666667,
    })

    // Act
    fireEvent.scroll(field)

    // Assert — 700.6 - 2 × 0.666667, not one pixel less.
    const viewport = container.querySelector<HTMLElement>(
      '[data-finished-line-strikes]',
    )
    expect(Number.parseFloat(viewport?.style.width ?? '')).toBeCloseTo(
      699.266666,
      5,
    )
    expect(Number.parseFloat(viewport?.style.height ?? '')).toBeCloseTo(
      399.266666,
      5,
    )
  })

  // Value: protects=a classic (always-shown) scrollbar is excluded from the mirror at sub-pixel precision, so a zoomed field with a
  // scrollbar wraps where the mirror wraps; fails_when=the scrollbar gutter is treated as text width, or the width is rounded to the
  // integer clientWidth; why_new=other geometry tests have no scrollbar; seam=none;
  // no_claim=the platform scrollbar width itself (layout reserves it through scrollbar-gutter; headless QA forces a classic scrollbar)
  test('a zoomed field showing a classic scrollbar keeps its fractional width and reserves the same scrollbar gutter for the strikes', () => {
    // Arrange
    vi.stubGlobal(
      'ResizeObserver',
      class {
        observe(): void {}
        unobserve(): void {}
        disconnect(): void {}
      },
    )
    const { container } = renderSurface({ text: '- [x] Done', strike: true })
    const field = container.querySelector('textarea') as HTMLTextAreaElement
    // A 702.4px border box with 1px borders and a 15px classic scrollbar: clientWidth rounds 685.4 down to 685.
    stubFieldBox(field, {
      fieldRect: { left: 0, top: 0, width: 702.4, height: 402 },
      offsetWidth: 702,
      clientWidth: 685,
      offsetHeight: 402,
      clientHeight: 400,
      scrollTop: 0,
    })

    // Act
    fireEvent.scroll(field)

    // Assert — the viewport spans the exact padding box including the gutter, and layout reserves the scrollbar inside it.
    const viewport = container.querySelector<HTMLElement>(
      '[data-finished-line-strikes]',
    )
    expect(viewport?.style.width).toBe('700.4px')
    expect(viewport?.style.getPropertyValue('scrollbar-gutter')).toBe('stable')
    expect(viewport?.style.height).toBe('400px')
  })

  // Value: protects=strike layer resizes with the field when the field box changes without a scroll; fails_when=the ResizeObserver is not
  // registered on the field or its callback is not the geometry sync; why_new=every geometry test uses a no-op observer and drives
  // geometry through scroll; seam=none; no_claim=real layout (happy-dom stubs box metrics)
  test('resizing the writing field without scrolling resizes the strikes to the new field box', () => {
    // Arrange
    // The surface hosts other observers (e.g. the opacity slider), so pair each callback with its target.
    const registrations: { target: Element; callback: () => void }[] = []
    vi.stubGlobal(
      'ResizeObserver',
      class {
        callback: () => void
        constructor(callback: () => void) {
          this.callback = callback
        }
        observe(target: Element): void {
          registrations.push({ target, callback: this.callback })
        }
        unobserve(): void {}
        disconnect(): void {}
      },
    )
    const { container } = renderSurface({ text: '- [x] Done', strike: true })
    const field = container.querySelector('textarea') as HTMLTextAreaElement
    stubFieldBox(field, {
      fieldRect: { left: 6, top: 4, width: 402, height: 202 },
      offsetWidth: 402,
      clientWidth: 400,
      offsetHeight: 202,
      clientHeight: 200,
      scrollTop: 0,
    })

    // Act
    const fieldRegistration = registrations.find(
      ({ target }) => target === field,
    )
    fieldRegistration?.callback()

    // Assert
    const viewport = container.querySelector<HTMLElement>(
      '[data-finished-line-strikes]',
    )
    expect(fieldRegistration).toBeDefined()
    expect(viewport?.style.width).toBe('400px')
    expect(viewport?.style.height).toBe('200px')
  })
})

/**
 * Stubs the field's box metrics that happy-dom cannot lay out: its border (1px unless given), its fractional border box
 * relative to a wrapper at the origin, and the integer offset/client sizes the browser would report.
 * @example stubFieldBox(field, { fieldRect: { left: 6, top: 4, width: 302, height: 122 }, offsetWidth: 302, clientWidth: 300, offsetHeight: 122, clientHeight: 120, scrollTop: 0 })
 */
function stubFieldBox(
  field: HTMLTextAreaElement,
  metrics: {
    fieldRect: { left: number; top: number; width: number; height: number }
    offsetWidth: number
    clientWidth: number
    offsetHeight: number
    clientHeight: number
    scrollTop: number
    /** Border width on every side in CSS px; defaults to the field's 1px. */
    borderPx?: number
  },
): void {
  const border = `${metrics.borderPx ?? 1}px`
  field.style.borderTopWidth = border
  field.style.borderRightWidth = border
  field.style.borderBottomWidth = border
  field.style.borderLeftWidth = border
  const { left, top, width, height } = metrics.fieldRect
  field.getBoundingClientRect = (): DOMRect =>
    DOMRect.fromRect({ x: left, y: top, width, height })
  if (field.parentElement)
    field.parentElement.getBoundingClientRect = (): DOMRect =>
      DOMRect.fromRect({
        x: 0,
        y: 0,
        width: width + left,
        height: height + top,
      })
  for (const [key, value] of Object.entries({
    offsetWidth: metrics.offsetWidth,
    clientWidth: metrics.clientWidth,
    offsetHeight: metrics.offsetHeight,
    clientHeight: metrics.clientHeight,
    scrollTop: metrics.scrollTop,
    scrollLeft: 0,
  })) {
    Object.defineProperty(field, key, { value, configurable: true })
  }
}
