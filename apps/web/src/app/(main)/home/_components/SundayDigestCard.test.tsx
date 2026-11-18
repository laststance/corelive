import { fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, test } from 'vitest'

import type { HeatmapDay } from '@/hooks/useHeatmapData'

import { SundayDigestCard } from './SundayDigestCard'

// `new Date(year, monthIndex, day, hours)` parses local-TZ — using noon avoids
// any DST-edge ambiguity, and these dates are Sunday / Tuesday in any TZ.
const LOCAL_SUNDAY = new Date(2026, 4, 10, 12)
const LOCAL_TUESDAY = new Date(2026, 4, 12, 12)

// The card derives its window from local Sunday → ISO string. The seed
// fixture uses the same calendar date so the test does not depend on the
// runner's TZ when comparing keys.
const LOCAL_SUNDAY_ISO = '2026-05-10'

/**
 * Helper: builds a fixture Map with `count` entries on the local Sunday
 * (the window anchor). `extra` lets a caller seed additional days.
 */
function buildWeekFixture(
  countOnSunday: number,
  extra: Array<{ date: string; count: number }> = [],
): Map<string, HeatmapDay> {
  const entries = new Map<string, HeatmapDay>()
  if (countOnSunday > 0) {
    entries.set(LOCAL_SUNDAY_ISO, {
      date: LOCAL_SUNDAY_ISO,
      count: countOnSunday,
      categories: [
        { id: 1, name: 'writing', color: 'blue', count: countOnSunday },
      ],
    })
  }
  for (const seed of extra) {
    entries.set(seed.date, {
      date: seed.date,
      count: seed.count,
      categories: [
        { id: 2, name: 'reading', color: 'green', count: seed.count },
      ],
    })
  }
  return entries
}

describe('SundayDigestCard', () => {
  beforeEach(() => {
    window.localStorage.clear()
  })

  test('keeps the recap hidden on a weekday with completed work', () => {
    // Arrange
    const data = buildWeekFixture(3)

    // Act
    const { container } = render(
      <SundayDigestCard dataByDate={data} now={LOCAL_TUESDAY} />,
    )

    // Assert
    expect(container).toBeEmptyDOMElement()
  })

  test('hides a Sunday recap with completed work while activity is unavailable', () => {
    // Arrange
    const data = buildWeekFixture(3)

    // Act
    const { container } = render(
      <SundayDigestCard dataByDate={data} hidden now={LOCAL_SUNDAY} />,
    )

    // Assert
    expect(container).toBeEmptyDOMElement()
  })

  test('shows the quiet-week message on a first Sunday with no completions', () => {
    // Arrange
    const data = new Map<string, HeatmapDay>()

    // Act
    render(<SundayDigestCard dataByDate={data} now={LOCAL_SUNDAY} />)

    // Assert
    expect(screen.getByLabelText('A quiet Sunday recap')).toBeVisible()
    expect(
      screen.getByText('the room was quiet this week — that is fine too.'),
    ).toBeVisible()
  })

  test('counts completed work from the whole week in the Sunday recap', () => {
    // Arrange
    const data = buildWeekFixture(4, [{ date: '2026-05-08', count: 2 }])

    // Act
    render(<SundayDigestCard dataByDate={data} now={LOCAL_SUNDAY} />)

    // Assert
    expect(screen.getByText('6 things made it onto the wall.')).toBeVisible()
  })

  test('shows a quiet week when all activity falls outside the seven-day window', () => {
    // Arrange
    const data = buildWeekFixture(0, [{ date: '2026-04-10', count: 5 }])

    // Act
    render(<SundayDigestCard dataByDate={data} now={LOCAL_SUNDAY} />)

    // Assert
    expect(
      screen.getByText('the room was quiet this week — that is fine too.'),
    ).toBeVisible()
  })

  test('shows the brightest day inside the week', () => {
    // Arrange
    const data = buildWeekFixture(2, [{ date: '2026-05-06', count: 6 }])

    // Act
    render(<SundayDigestCard dataByDate={data} now={LOCAL_SUNDAY} />)

    // Assert
    expect(screen.getByText(/brightest day/i)).toBeVisible()
    expect(screen.getByText('6 things')).toBeVisible()
  })

  test('uses the singular "1 thing" for a one-item brightest day', () => {
    // Arrange
    const data = buildWeekFixture(0, [{ date: '2026-05-06', count: 1 }])

    // Act
    render(<SundayDigestCard dataByDate={data} now={LOCAL_SUNDAY} />)

    // Assert
    expect(screen.getByText('1 thing')).toBeVisible()
  })

  test('dismisses the recap for the current Sunday', () => {
    // Arrange
    const data = buildWeekFixture(3)
    render(<SundayDigestCard dataByDate={data} now={LOCAL_SUNDAY} />)
    const dismissButton = screen.getByRole('button', {
      name: 'Dismiss the Sunday recap until next week',
    })

    // Act
    fireEvent.click(dismissButton)

    // Assert
    expect(screen.queryByLabelText('A quiet Sunday recap')).toBeNull()
    expect(
      window.localStorage.getItem(
        'corelive.sunday-digest-dismissed.2026-05-10',
      ),
    ).toBe('1')
  })

  test('keeps the recap hidden when returning on the same Sunday', () => {
    // Arrange
    const data = buildWeekFixture(3)
    window.localStorage.setItem(
      'corelive.sunday-digest-dismissed.2026-05-10',
      '1',
    )

    // Act
    const { container } = render(
      <SundayDigestCard dataByDate={data} now={LOCAL_SUNDAY} />,
    )

    // Assert
    expect(container).toBeEmptyDOMElement()
  })

  test('shows the new recap the Sunday after a dismissal', () => {
    // Arrange
    const data = buildWeekFixture(3)
    window.localStorage.setItem(
      'corelive.sunday-digest-dismissed.2026-05-03',
      '1',
    )

    // Act
    render(<SundayDigestCard dataByDate={data} now={LOCAL_SUNDAY} />)

    // Assert
    expect(screen.getByLabelText('A quiet Sunday recap')).toBeVisible()
  })
})

test('Sunday recap rolls Work children into six entries and keeps the whole week at seven', () => {
  // Arrange
  const work = { id: 1, name: 'Work', color: 'blue' }
  const data = new Map<string, HeatmapDay>([
    [
      LOCAL_SUNDAY_ISO,
      {
        date: LOCAL_SUNDAY_ISO,
        count: 7,
        categories: [
          { ...work, count: 1, parent: null },
          { id: 2, name: 'CoreLive', color: 'blue', count: 3, parent: work },
          {
            id: 3,
            name: 'Client work',
            color: 'green',
            count: 2,
            parent: work,
          },
          { id: 4, name: 'General', color: 'amber', count: 1, parent: null },
        ],
      },
    ],
  ])
  // Act
  render(<SundayDigestCard dataByDate={data} now={LOCAL_SUNDAY} />)
  // Assert
  expect(screen.getByText('7 things made it onto the wall.')).toBeVisible()
  expect(
    screen.getByRole('button', { name: 'Work: 6 entries, show breakdown' }),
  ).toBeVisible()
  expect(screen.getByText('General')).toBeVisible()
})
