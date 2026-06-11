import { describe, expect, it } from 'vitest'

import { buildDateSyncUrl } from './buildDateSyncUrl'

describe('buildDateSyncUrl — mirrors the heatmap day selection into the URL', () => {
  it('adds ?date= to a URL that had no query string', () => {
    // Arrange / Act
    const url = buildDateSyncUrl('', '/home', '2026-05-10')
    // Assert
    expect(url).toBe('/home?date=2026-05-10')
  })

  it('replaces an existing date in place when the user navigates days', () => {
    // Arrange / Act — pressing → from 05-01 to 05-10 swaps the value, not appends
    const url = buildDateSyncUrl('?date=2026-05-01', '/home', '2026-05-10')
    // Assert
    expect(url).toBe('/home?date=2026-05-10')
  })

  it('drops the query entirely when the dialog closes (date is null)', () => {
    // Arrange / Act
    const url = buildDateSyncUrl('?date=2026-05-10', '/home', null)
    // Assert — no bare "?" left behind
    expect(url).toBe('/home')
  })

  it('preserves an unrelated query param when adding the date', () => {
    // Arrange / Act
    const url = buildDateSyncUrl('?tab=year', '/home', '2026-05-10')
    // Assert
    expect(url).toBe('/home?tab=year&date=2026-05-10')
  })

  it('preserves an unrelated query param when removing the date on close', () => {
    // Arrange / Act
    const url = buildDateSyncUrl('?tab=year&date=2026-05-10', '/home', null)
    // Assert — only `date` is dropped; `tab` survives
    expect(url).toBe('/home?tab=year')
  })

  it('accepts a search string with no leading "?" (defensive)', () => {
    // Arrange / Act — URLSearchParams tolerates a missing leading "?"
    const url = buildDateSyncUrl('date=2026-05-01', '/home', '2026-05-10')
    // Assert
    expect(url).toBe('/home?date=2026-05-10')
  })
})
