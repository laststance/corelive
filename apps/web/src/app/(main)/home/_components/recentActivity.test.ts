import { expect, test } from 'vitest'

import type { HeatmapDay } from '@/hooks/useHeatmapData'

import { getRecentActivity } from './recentActivity'

test('seven local days include their first and last date across New Year', () => {
  // Arrange
  const dataByDate = new Map<string, HeatmapDay>([
    ['2025-12-26', { date: '2025-12-26', count: 10, categories: [] }],
    ['2025-12-27', { date: '2025-12-27', count: 2, categories: [] }],
    ['2026-01-02', { date: '2026-01-02', count: 4, categories: [] }],
    ['2026-01-03', { date: '2026-01-03', count: 10, categories: [] }],
  ])

  // Act
  const activity = getRecentActivity({
    dataByDate,
    today: '2026-01-02',
    period: 7,
  })

  // Assert
  expect(activity).toEqual({
    start: '2025-12-27',
    end: '2026-01-02',
    days: [
      { date: '2025-12-27', count: 2 },
      { date: '2025-12-28', count: 0 },
      { date: '2025-12-29', count: 0 },
      { date: '2025-12-30', count: 0 },
      { date: '2025-12-31', count: 0 },
      { date: '2026-01-01', count: 0 },
      { date: '2026-01-02', count: 4 },
    ],
    total: 6,
    activeDays: 2,
    categories: [{ id: 0, name: 'Unassigned', color: 'neutral', count: 6 }],
  })
})

test('thirty local days count each child once under its root and keep uncategorized work visible', () => {
  // Arrange
  const work = { id: 8, name: 'Work', color: 'blue' }
  const client = { id: 9, name: 'Client', color: 'green', parent: work }
  const dataByDate = new Map<string, HeatmapDay>([
    [
      '2026-10-31',
      { date: '2026-10-31', count: 5, categories: [{ ...client, count: 5 }] },
    ],
    [
      '2026-11-01',
      { date: '2026-11-01', count: 3, categories: [{ ...client, count: 2 }] },
    ],
    [
      '2026-11-30',
      {
        date: '2026-11-30',
        count: 4,
        categories: [
          { ...client, count: 1 },
          { ...work, count: 2 },
        ],
      },
    ],
  ])

  // Act
  const activity = getRecentActivity({
    dataByDate,
    today: '2026-11-30',
    period: 30,
  })

  // Assert
  expect(activity.start).toBe('2026-11-01')
  expect(activity.end).toBe('2026-11-30')
  expect(activity.days).toHaveLength(30)
  expect(activity.total).toBe(7)
  expect(activity.activeDays).toBe(2)
  expect(activity.categories).toEqual([
    {
      id: 8,
      name: 'Work',
      color: 'blue',
      count: 5,
      directCount: 2,
      children: [{ id: 9, name: 'Client', color: 'green', count: 3 }],
    },
    { id: 0, name: 'Unassigned', color: 'neutral', count: 2 },
  ])
})
