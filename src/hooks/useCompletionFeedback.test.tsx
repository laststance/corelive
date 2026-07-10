import { configureStore } from '@reduxjs/toolkit'
import { renderHook } from '@testing-library/react'
import * as React from 'react'
import { Provider } from 'react-redux'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { useCompletionFeedback } from '@/hooks/useCompletionFeedback'
import { playTimbre } from '@/lib/audio/soundEngine'
import userSettingsReducer, {
  initialState,
} from '@/lib/redux/slices/settingsSlice'

// The wrapper delegates all audio to the per-window sound engine; mock it so each
// test asserts the delegation contract (the complete cue's timbre/volume, and
// that an OFF moment never reaches the engine) without real Web Audio. The engine
// itself — asset path, synth fallback, one-in-flight, shared context — is covered
// by soundEngine.test.ts.
vi.mock('@/lib/audio/soundEngine', () => ({
  playTimbre: vi.fn(),
  prewarmTimbre: vi.fn(),
  previewTimbre: vi.fn(),
  resetSoundEngineForTest: vi.fn(),
}))

/**
 * Renders useCompletionFeedback under a minimal Redux store with the `complete`
 * earned-beat moment turned ON or OFF. The moment is set on `soundMoments`
 * directly (not via the legacy completionSound flag): an explicit soundMoments
 * value WINS over the legacy flag, so the cue only fires when complete is true.
 */
function renderWithCompleteMoment(enabled: boolean) {
  const store = configureStore({
    reducer: { settings: userSettingsReducer },
    preloadedState: {
      settings: {
        ...initialState,
        soundMoments: { 'task-create': false, complete: enabled, clear: false },
      },
    },
  })
  return renderHook(() => useCompletionFeedback(), {
    wrapper: ({ children }: { children: React.ReactNode }) => (
      <Provider store={store}>{children}</Provider>
    ),
  })
}

describe('useCompletionFeedback', () => {
  afterEach(() => {
    // The engine spies accumulate calls across tests — clear so each case's
    // delegation assertions see only its own fire().
    vi.clearAllMocks()
  })

  it('returns the motion-safe, short-tier checkbox fill className (not celebration easing)', () => {
    // Act
    const { result } = renderWithCompleteMoment(false)

    // Assert — motion-safe gated, 200ms ease-out; NOT the heatmap celebration easing.
    expect(result.current.checkboxMotionClassName).toContain('motion-safe:')
    expect(result.current.checkboxMotionClassName).toContain('duration-200')
    expect(result.current.checkboxMotionClassName).toContain('ease-out')
    expect(result.current.checkboxMotionClassName).not.toContain('cubic-bezier')
  })

  it('plays the complete cue at the selected timbre + master volume when the complete moment is ON', () => {
    // Arrange — complete moment ON; the slice defaults are the 'felt' timbre at 0.6.
    const { result } = renderWithCompleteMoment(true)

    // Act — a false→true completion fires the cue.
    result.current.fire()

    // Assert — delegated once to the engine with the selected timbre + volume.
    expect(vi.mocked(playTimbre)).toHaveBeenCalledTimes(1)
    expect(vi.mocked(playTimbre)).toHaveBeenCalledWith('felt', 0.6)
  })

  it('stays silent — never reaches the sound engine — when the complete moment is OFF (the fresh-install default)', () => {
    // Arrange — complete moment OFF (opt-in default).
    const { result } = renderWithCompleteMoment(false)

    // Act
    result.current.fire()

    // Assert — no cue is played; a default install makes no completion sound.
    expect(vi.mocked(playTimbre)).not.toHaveBeenCalled()
  })
})
