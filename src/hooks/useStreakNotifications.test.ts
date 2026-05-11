import { renderHook } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { shiftIsoDate } from '@/lib/shiftIsoDate'

import type { HeatmapDay } from './useHeatmapData'
import { useStreakNotifications } from './useStreakNotifications'

const electronMocks = vi.hoisted(() => ({
  showNotification: vi.fn().mockResolvedValue(undefined),
  isSupported: true,
  isEnabled: true,
}))

vi.mock('./useElectronNotifications', () => ({
  useElectronNotifications: () => ({
    isSupported: electronMocks.isSupported,
    isEnabled: electronMocks.isEnabled,
    preferences: null,
    activeCount: 0,
    showNotification: electronMocks.showNotification,
    updatePreferences: vi.fn(),
    clearAll: vi.fn(),
    clearNotification: vi.fn(),
    refreshActiveCount: vi.fn(),
  }),
}))

vi.mock('@/lib/logger', () => ({
  log: {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}))

const STORAGE_KEY = 'corelive.streak-max-tier-notified'
const TODAY = new Date('2026-05-12T08:00:00.000Z')
const TODAY_ISO = '2026-05-12'

/** Builds a heatmap data Map of N consecutive UTC days ending on TODAY_ISO. */
function buildConsecutive(days: number): Map<string, HeatmapDay> {
  return new Map(
    Array.from({ length: days }, (_, i) => {
      const date = shiftIsoDate(TODAY_ISO, -i)
      return [date, { date, count: 1, categories: [] }]
    }),
  )
}

describe('useStreakNotifications', () => {
  beforeEach(() => {
    electronMocks.showNotification.mockClear()
    electronMocks.isSupported = true
    electronMocks.isEnabled = true
    window.localStorage.clear()
  })

  it('does nothing when isSupported is false (web environment)', () => {
    electronMocks.isSupported = false
    renderHook(() =>
      useStreakNotifications({
        dataByDate: buildConsecutive(7),
        isLoading: false,
        now: TODAY,
      }),
    )
    expect(electronMocks.showNotification).not.toHaveBeenCalled()
  })

  it('does nothing when isEnabled is false (user-disabled)', () => {
    electronMocks.isEnabled = false
    renderHook(() =>
      useStreakNotifications({
        dataByDate: buildConsecutive(7),
        isLoading: false,
        now: TODAY,
      }),
    )
    expect(electronMocks.showNotification).not.toHaveBeenCalled()
  })

  it('does nothing while heatmap data is loading', () => {
    renderHook(() =>
      useStreakNotifications({
        dataByDate: buildConsecutive(7),
        isLoading: true,
        now: TODAY,
      }),
    )
    expect(electronMocks.showNotification).not.toHaveBeenCalled()
  })

  it('does nothing on an empty heatmap', () => {
    renderHook(() =>
      useStreakNotifications({
        dataByDate: new Map(),
        isLoading: false,
        now: TODAY,
      }),
    )
    expect(electronMocks.showNotification).not.toHaveBeenCalled()
  })

  it('does nothing for streaks below 7 days', () => {
    renderHook(() =>
      useStreakNotifications({
        dataByDate: buildConsecutive(6),
        isLoading: false,
        now: TODAY,
      }),
    )
    expect(electronMocks.showNotification).not.toHaveBeenCalled()
  })

  it('fires once when crossing the 7-day tier and persists to localStorage', () => {
    renderHook(() =>
      useStreakNotifications({
        dataByDate: buildConsecutive(7),
        isLoading: false,
        now: TODAY,
      }),
    )
    expect(electronMocks.showNotification).toHaveBeenCalledTimes(1)
    const firstCall = electronMocks.showNotification.mock.calls[0]
    expect(firstCall?.[0]).toMatch(/day 7/i)
    expect(firstCall?.[1]).toMatch(/cathedral/i)
    expect(firstCall?.[2]).toMatchObject({ tag: 'streak-tier-7' })
    expect(window.localStorage.getItem(STORAGE_KEY)).toBe('7')
  })

  it('fires the 30-day tier and stores it as the new max', () => {
    renderHook(() =>
      useStreakNotifications({
        dataByDate: buildConsecutive(30),
        isLoading: false,
        now: TODAY,
      }),
    )
    expect(electronMocks.showNotification).toHaveBeenCalledTimes(1)
    expect(electronMocks.showNotification.mock.calls[0]?.[0]).toMatch(/day 30/i)
    expect(window.localStorage.getItem(STORAGE_KEY)).toBe('30')
  })

  it('does not re-fire a tier already stored as max (dedupe)', () => {
    window.localStorage.setItem(STORAGE_KEY, '7')
    renderHook(() =>
      useStreakNotifications({
        dataByDate: buildConsecutive(8),
        isLoading: false,
        now: TODAY,
      }),
    )
    expect(electronMocks.showNotification).not.toHaveBeenCalled()
  })

  it('skips lower tiers when stored max is higher (rebuilt-from-zero scenario)', () => {
    window.localStorage.setItem(STORAGE_KEY, '30')
    // User had a 30-day streak, broke it, and is now back at day 8.
    renderHook(() =>
      useStreakNotifications({
        dataByDate: buildConsecutive(8),
        isLoading: false,
        now: TODAY,
      }),
    )
    expect(electronMocks.showNotification).not.toHaveBeenCalled()
    expect(window.localStorage.getItem(STORAGE_KEY)).toBe('30')
  })

  it('fires the next tier when streak grows past stored max', () => {
    window.localStorage.setItem(STORAGE_KEY, '7')
    renderHook(() =>
      useStreakNotifications({
        dataByDate: buildConsecutive(30),
        isLoading: false,
        now: TODAY,
      }),
    )
    expect(electronMocks.showNotification).toHaveBeenCalledTimes(1)
    expect(electronMocks.showNotification.mock.calls[0]?.[0]).toMatch(/day 30/i)
  })

  it('tolerates corrupted localStorage and still fires the milestone', () => {
    window.localStorage.setItem(STORAGE_KEY, 'not-a-number')
    renderHook(() =>
      useStreakNotifications({
        dataByDate: buildConsecutive(7),
        isLoading: false,
        now: TODAY,
      }),
    )
    expect(electronMocks.showNotification).toHaveBeenCalledTimes(1)
    expect(window.localStorage.getItem(STORAGE_KEY)).toBe('7')
  })
})
