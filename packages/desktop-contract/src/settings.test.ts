import { describe, expect, test } from 'vitest'

import { UserSettingsPatchSchema, UserSettingsStateSchema } from './settings'

describe('LiveEditor status visibility', () => {
  test('preserves visible status for old preferences and an explicit hidden preference', () => {
    // Arrange / Act
    const old = UserSettingsStateSchema.parse({ liveEditorFontSize: 20 })
    const hidden = UserSettingsStateSchema.parse({
      liveEditorShowStatusBar: false,
    })

    // Assert
    expect(old.liveEditorShowStatusBar).toBe(true)
    expect(old.liveEditorFontSize).toBe(20)
    expect(hidden.liveEditorShowStatusBar).toBe(false)
  })

  test('repairs corrupt stored visibility without discarding other preferences', () => {
    // Arrange / Act
    const result = UserSettingsStateSchema.parse({
      liveEditorShowStatusBar: 'hidden',
      liveEditorFontSize: 22,
    })

    // Assert
    expect(result.liveEditorShowStatusBar).toBe(true)
    expect(result.liveEditorFontSize).toBe(22)
  })

  test('rejects a malformed visibility command atomically while retaining numeric normalization', () => {
    // Arrange / Act
    const invalid = UserSettingsPatchSchema.safeParse({
      liveEditorShowStatusBar: 'hidden',
      liveEditorFontSize: 22,
    })
    const valid = UserSettingsPatchSchema.parse({
      liveEditorShowStatusBar: false,
      liveEditorFontSize: 100,
    })

    // Assert
    expect(invalid.success).toBe(false)
    expect(valid).toEqual({
      liveEditorShowStatusBar: false,
      liveEditorFontSize: 24,
    })
  })
})
