import { configureStore } from '@reduxjs/toolkit'
import { renderHook } from '@testing-library/react'
import * as React from 'react'
import { Provider } from 'react-redux'
import { describe, expect, it } from 'vitest'

import preferencesReducer from '@/lib/redux/slices/preferencesSlice'

import { useCompletionFeedback } from './useCompletionFeedback'

/**
 * Renders useCompletionFeedback under a minimal Redux store with the given
 * completion-sound preference (the hook reads it app-level via useAppSelector).
 */
function renderWithSound(completionSound: boolean) {
  const store = configureStore({
    reducer: { preferences: preferencesReducer },
    preloadedState: {
      preferences: { completionSound, retainCompletedInList: false },
    },
  })
  return renderHook(() => useCompletionFeedback(), {
    wrapper: ({ children }: { children: React.ReactNode }) => (
      <Provider store={store}>{children}</Provider>
    ),
  })
}

describe('useCompletionFeedback', () => {
  it('returns the motion-safe, short-tier checkbox fill className (not celebration easing)', () => {
    // Act
    const { result } = renderWithSound(false)

    // Assert — motion-safe gated, 200ms ease-out; NOT the heatmap celebration easing.
    expect(result.current.checkboxMotionClassName).toContain('motion-safe:')
    expect(result.current.checkboxMotionClassName).toContain('duration-200')
    expect(result.current.checkboxMotionClassName).toContain('ease-out')
    expect(result.current.checkboxMotionClassName).not.toContain('cubic-bezier')
  })

  it('fire() never throws when the completion sound is OFF (the default — a pure no-op)', () => {
    // Arrange
    const { result } = renderWithSound(false)

    // Act / Assert — opt-in default OFF means no audio is created or played.
    expect(() => result.current.fire()).not.toThrow()
  })

  it('fire() never throws even when sound is ON in a context without Web Audio (degrades silently)', () => {
    // Arrange — enabling the preference must never let a missing/blocked
    // AudioContext break the completion flow; it degrades to silence.
    const { result } = renderWithSound(true)

    // Act / Assert
    expect(() => result.current.fire()).not.toThrow()
  })
})
