import { describe, expect, test } from 'vitest'

import { xpToLevel } from './xp'

describe('xpToLevel', () => {
  test('returns Dormant (level 0) for 0 XP', () => {
    expect(xpToLevel(0)).toEqual({ level: 0, progress: 0, next: 5 })
  })

  test('returns Dormant with progress 4 at the boundary', () => {
    expect(xpToLevel(4)).toEqual({ level: 0, progress: 4, next: 5 })
  })

  test('crosses to Level 1 at 5 XP', () => {
    expect(xpToLevel(5)).toEqual({ level: 1, progress: 0, next: 10 })
  })

  test('returns Level 1 progress 9 at upper boundary', () => {
    expect(xpToLevel(14)).toEqual({ level: 1, progress: 9, next: 10 })
  })

  test('crosses to Level 2 at 15 XP', () => {
    expect(xpToLevel(15)).toEqual({ level: 2, progress: 0, next: 15 })
  })

  test('crosses to Level 3 at 30 XP', () => {
    expect(xpToLevel(30)).toEqual({ level: 3, progress: 0, next: 20 })
  })

  test('crosses to Level 4 at 50 XP', () => {
    expect(xpToLevel(50)).toEqual({ level: 4, progress: 0, next: 25 })
  })

  test('crosses to Mastered (level 5) at 75 XP with next=null', () => {
    expect(xpToLevel(75)).toEqual({ level: 5, progress: 0, next: null })
  })

  test('caps Mastered — 200 XP still reports level 5', () => {
    expect(xpToLevel(200)).toEqual({ level: 5, progress: 0, next: null })
  })

  test('returns Level 3 mid-progress for XP 40', () => {
    expect(xpToLevel(40)).toEqual({ level: 3, progress: 10, next: 20 })
  })

  test('clamps negative XP to 0', () => {
    expect(xpToLevel(-1)).toEqual({ level: 0, progress: 0, next: 5 })
  })
})
