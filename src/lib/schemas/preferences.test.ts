import { describe, expect, it } from 'vitest'

import { PreferencesStateSchema } from '@/lib/schemas/preferences'

describe('PreferencesStateSchema', () => {
  it('parses an empty object into the fully-silent default state (fresh install makes no sound)', () => {
    // Act
    const result = PreferencesStateSchema.parse({})

    // Assert — every moment OFF, default timbre + volume, both legacy flags OFF.
    expect(result).toEqual({
      completionSound: false,
      retainCompletedInList: false,
      soundMoments: { 'task-create': false, complete: false, clear: false },
      soundTimbre: 'felt',
      soundVolume: 0.6,
    })
  })

  it('accepts a legacy payload of only the original two booleans, defaulting the new sound fields', () => {
    // Arrange — exactly the shape persisted before the sound palette existed.
    const legacyPayload = { completionSound: true, retainCompletedInList: true }

    // Act
    const result = PreferencesStateSchema.parse(legacyPayload)

    // Assert — the legacy values survive; the new fields fill with defaults.
    expect(result).toEqual({
      completionSound: true,
      retainCompletedInList: true,
      soundMoments: { 'task-create': false, complete: false, clear: false },
      soundTimbre: 'felt',
      soundVolume: 0.6,
    })
  })

  it('clamps an out-of-range master volume number into [0,1]', () => {
    // Act
    const tooLoud = PreferencesStateSchema.parse({ soundVolume: 50 })
    const tooQuiet = PreferencesStateSchema.parse({ soundVolume: -3 })

    // Assert
    expect(tooLoud.soundVolume).toBe(1)
    expect(tooQuiet.soundVolume).toBe(0)
  })

  it('rejects a non-number master volume so a malformed sync payload fails wholesale', () => {
    // Act
    const result = PreferencesStateSchema.safeParse({ soundVolume: 'loud' })

    // Assert — the whole payload is rejected, not silently coerced.
    expect(result.success).toBe(false)
  })

  it('self-heals an unknown timbre id to the default instead of rejecting', () => {
    // Act
    const result = PreferencesStateSchema.parse({ soundTimbre: 'banjo' })

    // Assert
    expect(result.soundTimbre).toBe('felt')
  })

  it('fills missing moments with OFF when soundMoments is present but partial', () => {
    // Arrange — only the complete moment supplied.
    const partial = { soundMoments: { complete: true } }

    // Act
    const result = PreferencesStateSchema.parse(partial)

    // Assert — the supplied moment is kept; the rest default to OFF.
    expect(result.soundMoments).toEqual({
      'task-create': false,
      complete: true,
      clear: false,
    })
  })
})
