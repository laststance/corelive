import { fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it } from 'vitest'

import type { HeatmapDay } from '@/hooks/useHeatmapData'
import { shiftIsoDate } from '@/lib/shiftIsoDate'

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

  it('renders nothing on a non-Sunday', () => {
    const { container } = render(
      <SundayDigestCard
        dataByDate={buildWeekFixture(3)}
        isLoading={false}
        now={LOCAL_TUESDAY}
      />,
    )
    expect(container).toBeEmptyDOMElement()
  })

  it('renders nothing while loading', () => {
    const { container } = render(
      <SundayDigestCard
        dataByDate={buildWeekFixture(3)}
        isLoading={true}
        now={LOCAL_SUNDAY}
      />,
    )
    expect(container).toBeEmptyDOMElement()
  })

  it('renders the quiet-week fallback when the heatmap is empty', () => {
    // A new user (or a fully quiet week) should still see the digest —
    // the "quiet week" copy is exactly what the empty path was designed
    // for (DESIGN.md: self-affirmation on rest weeks too).
    render(
      <SundayDigestCard
        dataByDate={new Map()}
        isLoading={false}
        now={LOCAL_SUNDAY}
      />,
    )
    expect(screen.getByLabelText(/quiet sunday recap/i)).toBeInTheDocument()
    expect(screen.getByText(/room was quiet this week/i)).toBeInTheDocument()
  })

  it('renders the digest on Sunday with non-zero data', () => {
    render(
      <SundayDigestCard
        dataByDate={buildWeekFixture(4, [
          { date: shiftIsoDate(LOCAL_SUNDAY_ISO, -2), count: 2 },
        ])}
        isLoading={false}
        now={LOCAL_SUNDAY}
      />,
    )
    expect(screen.getByLabelText(/quiet sunday recap/i)).toBeInTheDocument()
    expect(
      screen.getByText(/things made it onto the wall/i),
    ).toBeInTheDocument()
  })

  it('shows the zero-week fallback when total is zero', () => {
    // dataByDate is non-empty but only has activity outside the 7-day window
    const data = new Map<string, HeatmapDay>()
    const oldDate = shiftIsoDate(LOCAL_SUNDAY_ISO, -30)
    data.set(oldDate, { date: oldDate, count: 5, categories: [] })

    render(
      <SundayDigestCard
        dataByDate={data}
        isLoading={false}
        now={LOCAL_SUNDAY}
      />,
    )
    expect(screen.getByText(/room was quiet this week/i)).toBeInTheDocument()
  })

  it('shows the brightest day inside the week', () => {
    const wednesday = shiftIsoDate(LOCAL_SUNDAY_ISO, -4)
    const data = buildWeekFixture(2, [{ date: wednesday, count: 6 }])
    render(
      <SundayDigestCard
        dataByDate={data}
        isLoading={false}
        now={LOCAL_SUNDAY}
      />,
    )
    // The "brightest day:" line surfaces the best day; assert the spelled-out
    // count ("6 things") renders — the previous "(6)" framing read as KPI.
    expect(screen.getByText(/brightest day/i)).toBeInTheDocument()
    expect(screen.getByText(/6 things/i)).toBeInTheDocument()
  })

  it('uses the singular "1 thing" for a one-item brightest day', () => {
    const wednesday = shiftIsoDate(LOCAL_SUNDAY_ISO, -4)
    const data = buildWeekFixture(0, [{ date: wednesday, count: 1 }])
    render(
      <SundayDigestCard
        dataByDate={data}
        isLoading={false}
        now={LOCAL_SUNDAY}
      />,
    )
    expect(screen.getByText(/1 thing(?!s)/i)).toBeInTheDocument()
  })

  it('hides the card after the dismiss button is clicked and persists per-week', () => {
    render(
      <SundayDigestCard
        dataByDate={buildWeekFixture(3)}
        isLoading={false}
        now={LOCAL_SUNDAY}
      />,
    )
    expect(screen.getByLabelText(/quiet sunday recap/i)).toBeInTheDocument()

    const dismissButton = screen.getByRole('button', {
      name: /dismiss the sunday recap/i,
    })
    fireEvent.click(dismissButton)

    expect(
      screen.queryByLabelText(/quiet sunday recap/i),
    ).not.toBeInTheDocument()

    // Find the dismiss key — exact format depends on local TZ. We expect
    // exactly one key set to '1'.
    const setKeys = Object.keys(window.localStorage).filter((k) =>
      k.startsWith('corelive.sunday-digest-dismissed.'),
    )
    expect(setKeys.length).toBe(1)
    expect(window.localStorage.getItem(setKeys[0]!)).toBe('1')
  })

  it('honors a pre-existing dismiss flag for the same week (mount-time read)', () => {
    // Seed the dismiss flag for the current Sunday before mount.
    const sundayKey = `corelive.sunday-digest-dismissed.${LOCAL_SUNDAY.toLocaleDateString('en-CA')}`
    window.localStorage.setItem(sundayKey, '1')

    const { container } = render(
      <SundayDigestCard
        dataByDate={buildWeekFixture(3)}
        isLoading={false}
        now={LOCAL_SUNDAY}
      />,
    )
    expect(container).toBeEmptyDOMElement()
  })

  it('re-appears next Sunday (different week key)', () => {
    // Seed dismiss for last Sunday.
    const lastSunday = new Date(2026, 4, 3, 12)
    const lastSundayKey = `corelive.sunday-digest-dismissed.${lastSunday.toLocaleDateString('en-CA')}`
    window.localStorage.setItem(lastSundayKey, '1')

    render(
      <SundayDigestCard
        dataByDate={buildWeekFixture(3)}
        isLoading={false}
        now={LOCAL_SUNDAY}
      />,
    )
    expect(screen.getByLabelText(/quiet sunday recap/i)).toBeInTheDocument()
  })
})
