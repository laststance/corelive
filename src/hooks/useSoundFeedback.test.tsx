import { configureStore } from '@reduxjs/toolkit'
import { renderHook } from '@testing-library/react'
import * as React from 'react'
import { Provider } from 'react-redux'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { useSoundFeedback } from '@/hooks/useSoundFeedback'
import { playTimbre, prewarmTimbre } from '@/lib/audio/soundEngine'
import type { SoundMomentId } from '@/lib/constants/sound'
import userSettingsReducer, {
  initialState,
} from '@/lib/redux/slices/settingsSlice'
import type { UserSettingsState } from '@/lib/schemas/settings'

// Mock the per-window sound engine so these tests assert the hook's gate +
// delegation (which moment fires, at which timbre/volume, and that the timbre is
// prewarmed) without real Web Audio. The engine internals — asset path, synth
// fallback, one-in-flight, shared context — live in soundEngine.test.ts.
vi.mock('@/lib/audio/soundEngine', () => ({
  playTimbre: vi.fn(),
  prewarmTimbre: vi.fn(),
  previewTimbre: vi.fn(),
  resetSoundEngineForTest: vi.fn(),
}))

/**
 * Renders useSoundFeedback for the given moment under a minimal Redux store with
 * the supplied setting overrides spread over the slice defaults (so each test
 * states only the fields it cares about).
 */
function renderSoundFeedback(
  moment: SoundMomentId,
  overrides: Partial<UserSettingsState>,
) {
  const store = configureStore({
    reducer: { settings: userSettingsReducer },
    preloadedState: {
      settings: { ...initialState, ...overrides },
    },
  })
  return renderHook(() => useSoundFeedback(moment), {
    wrapper: ({ children }: { children: React.ReactNode }) => (
      <Provider store={store}>{children}</Provider>
    ),
  })
}

describe('useSoundFeedback', () => {
  afterEach(() => {
    // The engine spies accumulate calls across tests — clear so each case sees
    // only its own fire()/prewarm.
    vi.clearAllMocks()
  })

  it('plays the moment cue at the selected timbre + master volume when that moment is ON', () => {
    // Arrange — the task-create moment ON, with a non-default timbre + volume.
    const { result } = renderSoundFeedback('task-create', {
      soundMoments: { 'task-create': true, complete: false, clear: false },
      soundTimbre: 'wood',
      soundVolume: 0.4,
    })

    // Act
    result.current()

    // Assert — delegated once to the engine with exactly the chosen timbre + volume.
    expect(vi.mocked(playTimbre)).toHaveBeenCalledTimes(1)
    expect(vi.mocked(playTimbre)).toHaveBeenCalledWith('wood', 0.4)
  })

  it('stays silent — never reaches the engine — when that moment is OFF', () => {
    // Arrange — task-create moment OFF (the fresh-install default).
    const { result } = renderSoundFeedback('task-create', {
      soundMoments: { 'task-create': false, complete: false, clear: false },
    })

    // Act
    result.current()

    // Assert — a disabled moment never touches the engine.
    expect(vi.mocked(playTimbre)).not.toHaveBeenCalled()
  })

  it('prewarms the selected timbre on mount when the moment is enabled (so the first cue has no decode latency)', () => {
    // Arrange / Act — mounting an enabled moment with a chosen timbre.
    renderSoundFeedback('clear', {
      soundMoments: { 'task-create': false, complete: false, clear: true },
      soundTimbre: 'paper',
    })

    // Assert — the chosen timbre was decoded ahead of the first fire.
    expect(vi.mocked(prewarmTimbre)).toHaveBeenCalledWith('paper')
  })

  it('does not prewarm or fetch anything while the moment is OFF (a user who never enables sound pays nothing)', () => {
    // Arrange / Act — mounting a disabled moment.
    renderSoundFeedback('clear', {
      soundMoments: { 'task-create': false, complete: false, clear: false },
    })

    // Assert — no decode happens for an OFF moment.
    expect(vi.mocked(prewarmTimbre)).not.toHaveBeenCalled()
  })
})
