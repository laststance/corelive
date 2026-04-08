import { describe, expect, it } from 'vitest'

import { xpToLevel } from './xp'

describe('xpToLevel', () => {
  it('returns Dormant (level 0) for 0 XP', () => {
    expect(xpToLevel(0)).toEqual({ level: 0, progress: 0, next: 5 })
  })

  it('returns Dormant with progress 4 at the boundary', () => {
    expect(xpToLevel(4)).toEqual({ level: 0, progress: 4, next: 5 })
  })

  it('crosses to Level 1 at 5 XP', () => {
    expect(xpToLevel(5)).toEqual({ level: 1, progress: 0, next: 10 })
  })

  it('returns Level 1 progress 9 at upper boundary', () => {
    expect(xpToLevel(14)).toEqual({ level: 1, progress: 9, next: 10 })
  })

  it('crosses to Level 2 at 15 XP', () => {
    expect(xpToLevel(15)).toEqual({ level: 2, progress: 0, next: 15 })
  })

  it('crosses to Level 3 at 30 XP', () => {
    expect(xpToLevel(30)).toEqual({ level: 3, progress: 0, next: 20 })
  })

  it('crosses to Level 4 at 50 XP', () => {
    expect(xpToLevel(50)).toEqual({ level: 4, progress: 0, next: 25 })
  })

  it('crosses to Mastered (level 5) at 75 XP with next=null', () => {
    expect(xpToLevel(75)).toEqual({ level: 5, progress: 0, next: null })
  })

  it('caps Mastered — 200 XP still reports level 5', () => {
    expect(xpToLevel(200)).toEqual({ level: 5, progress: 0, next: null })
  })

  it('returns Level 3 mid-progress for XP 40', () => {
    expect(xpToLevel(40)).toEqual({ level: 3, progress: 10, next: 20 })
  })

  it('clamps negative XP to 0', () => {
    expect(xpToLevel(-1)).toEqual({ level: 0, progress: 0, next: 5 })
  })
})
