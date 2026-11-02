// @vitest-environment happy-dom
import { applyThemeAttribute } from '@corelive/live-editor/theme-transition'
import { afterEach, describe, expect, test } from 'vitest'

describe('applyThemeAttribute (desktop editor theme crossfade)', () => {
  afterEach(() => {
    delete document.documentElement.dataset.theme
    document.documentElement.classList.remove('theme-transition')
  })

  test('arms the crossfade before the palette changes, so a theme switch in the editor fades instead of snapping', () => {
    // Arrange: the editor already shows shadcn Default light.
    document.documentElement.dataset.theme = 'light'

    // Act: the workspace preference switches to Warm Cathedral.
    applyThemeAttribute('cathedral-light')

    // Assert: the transition class is present together with the new theme.
    expect(document.documentElement.dataset.theme).toBe('cathedral-light')
    expect(
      document.documentElement.classList.contains('theme-transition'),
    ).toBe(true)
  })

  test('does not crossfade the first paint, so the editor never animates in from no theme', () => {
    // Arrange: nothing applied yet (the renderer index.html has no data-theme).

    // Act
    applyThemeAttribute('dark')

    // Assert
    expect(document.documentElement.dataset.theme).toBe('dark')
    expect(
      document.documentElement.classList.contains('theme-transition'),
    ).toBe(false)
  })

  test('does not arm the crossfade for a same-theme write, so hover and focus transitions stay instant', () => {
    // Arrange: an OS change event re-applies the theme that is already active.
    document.documentElement.dataset.theme = 'dark'

    // Act
    applyThemeAttribute('dark')

    // Assert
    expect(
      document.documentElement.classList.contains('theme-transition'),
    ).toBe(false)
  })
})
