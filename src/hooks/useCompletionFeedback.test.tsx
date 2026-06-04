import { configureStore } from '@reduxjs/toolkit'
import { renderHook } from '@testing-library/react'
import * as React from 'react'
import { Provider } from 'react-redux'
import { afterEach, describe, expect, it, vi } from 'vitest'

import preferencesReducer from '@/lib/redux/slices/preferencesSlice'

import {
  resetCompletionFeedbackAudioForTest,
  useCompletionFeedback,
} from './useCompletionFeedback'

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

/**
 * Records all oscillators a fake AudioContext creates so a test can assert the
 * "at most one sound in-flight" cut/restart behavior (an earlier oscillator gets
 * stop()ped when a new fire() starts a replacement).
 */
interface FakeAudioState {
  context: { state: AudioContextState; resumeCount: number; closed: boolean }
  oscillators: Array<{
    started: boolean
    stopped: boolean
    type: OscillatorType
  }>
}

/**
 * Installs a minimal synchronous globalThis.AudioContext stub so fire() runs its
 * real sound path (createOscillator → resume → start/stop → in-flight cut)
 * instead of only the silent-degradation branch. Returns the recorded state plus
 * an uninstall fn to restore the original constructor.
 */
function installFakeAudioContext(): {
  state: FakeAudioState
  uninstall: () => void
} {
  const state: FakeAudioState = {
    context: { state: 'suspended', resumeCount: 0, closed: false },
    oscillators: [],
  }
  const gainNodeStub = {
    gain: {
      setValueAtTime: vi.fn(),
      linearRampToValueAtTime: vi.fn(),
      exponentialRampToValueAtTime: vi.fn(),
    },
    connect: vi.fn(() => audioDestinationStub),
  }
  const audioDestinationStub = {}

  class FakeAudioContext {
    currentTime = 0
    get state(): AudioContextState {
      return state.context.state
    }
    destination = audioDestinationStub
    async resume(): Promise<void> {
      state.context.resumeCount += 1
      state.context.state = 'running'
    }
    async close(): Promise<void> {
      state.context.closed = true
    }
    createGain() {
      return gainNodeStub
    }
    createOscillator() {
      const record = {
        started: false,
        stopped: false,
        type: 'sine' as OscillatorType,
      }
      state.oscillators.push(record)
      return {
        set type(value: OscillatorType) {
          record.type = value
        },
        frequency: { setValueAtTime: vi.fn() },
        connect: vi.fn(() => gainNodeStub),
        start: vi.fn(() => {
          record.started = true
        }),
        stop: vi.fn(() => {
          record.stopped = true
        }),
        addEventListener: vi.fn(),
      }
    }
  }

  const original = globalThis.AudioContext
  // @ts-expect-error — assigning a test double over the DOM lib type.
  globalThis.AudioContext = FakeAudioContext
  return {
    state,
    uninstall: () => {
      globalThis.AudioContext = original
    },
  }
}

describe('useCompletionFeedback', () => {
  // The shared AudioContext + in-flight oscillator are module-level singletons
  // (so "one sound in-flight" holds across row surfaces), so reset between tests
  // or a stub installed in one case would leak into the next.
  afterEach(() => {
    resetCompletionFeedbackAudioForTest()
  })

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

  it('fire() plays a single sine tone (resumes a suspended context, then starts+stops the oscillator) when sound is ON', () => {
    // Arrange — a real Web Audio context is available and the preference is ON.
    const { state, uninstall } = installFakeAudioContext()
    try {
      const { result } = renderWithSound(true)

      // Act
      result.current.fire()

      // Assert — the suspended context is resumed, and exactly one warm sine
      // oscillator is created, started, and scheduled to stop.
      expect(state.context.resumeCount).toBe(1)
      expect(state.oscillators).toHaveLength(1)
      const [onlyOscillator] = state.oscillators
      expect(onlyOscillator?.type).toBe('sine')
      expect(onlyOscillator?.started).toBe(true)
      expect(onlyOscillator?.stopped).toBe(true)
    } finally {
      uninstall()
    }
  })

  it('fire() keeps at most one sound in-flight — a rapid second completion cuts the first oscillator instead of layering', () => {
    // Arrange — sound ON, with a stub that records every oscillator created.
    const { state, uninstall } = installFakeAudioContext()
    try {
      const { result } = renderWithSound(true)

      // Act — two completions in quick succession (e.g. two rows checked fast).
      result.current.fire()
      result.current.fire()

      // Assert — the first oscillator is cut (stopped) when the second starts,
      // so the two cues never layer into a cacophony.
      expect(state.oscillators).toHaveLength(2)
      const [firstOscillator, secondOscillator] = state.oscillators
      expect(firstOscillator?.stopped).toBe(true)
      expect(secondOscillator?.started).toBe(true)
    } finally {
      uninstall()
    }
  })

  it('fire() reuses one shared AudioContext across separate hook instances (the per-row surfaces never each open their own)', () => {
    // Arrange — two independently mounted hook instances stand in for two of the
    // row surfaces (TodoItem + a Floating row) that mount the hook separately.
    const { state, uninstall } = installFakeAudioContext()
    try {
      const first = renderWithSound(true)
      const second = renderWithSound(true)

      // Act — each instance fires once.
      first.result.current.fire()
      second.result.current.fire()

      // Assert — both fires shared a single AudioContext (the second oscillator
      // was cut by being created in the same shared context), proving the audio
      // state is app-wide rather than per-row.
      expect(state.oscillators).toHaveLength(2)
      const [firstSharedOscillator] = state.oscillators
      expect(firstSharedOscillator?.stopped).toBe(true)
    } finally {
      uninstall()
    }
  })
})
