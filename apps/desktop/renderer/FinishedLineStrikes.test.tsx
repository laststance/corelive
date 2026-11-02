// @vitest-environment happy-dom
import '@testing-library/jest-dom/vitest'
import { UserSettingsStateSchema } from '@corelive/desktop-contract/settings'
import { SharedEditorSurface } from '@corelive/live-editor/surface'
import { splitFinishedLine } from '@corelive/live-editor/utils'
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, test, vi } from 'vitest'

afterEach(() => {
  cleanup()
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
      storageAvailability="ok"
      details={details}
      isCategoryListPending={false}
      isCategoryListError={false}
      isElectronPanel
      isMounted
      isSignedIn
      isAuthLoaded
      isSignedOutWeb={false}
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
})
