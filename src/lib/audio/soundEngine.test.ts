import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import {
  playTimbre,
  prewarmTimbre,
  resetSoundEngineForTest,
} from './soundEngine'

/**
 * Records everything the engine drives on a fake AudioContext + fetch so a test
 * can assert the asset path (fetch → decode → buffer source), the synth fallback,
 * the one-in-flight cut, the negative cache, decode dedup, and the applied gain.
 */
interface EngineRecorder {
  constructCount: number
  contextState: AudioContextState
  resumeCount: number
  decodeCount: number
  fetchedUrls: string[]
  bufferSources: Array<{ started: boolean; stopped: boolean }>
  gainNodes: Array<{ value: number }>
  oscillators: Array<{ started: boolean; stopped: boolean }>
}

let recorder: EngineRecorder
let fetchSucceeds: boolean

beforeEach(() => {
  recorder = {
    constructCount: 0,
    contextState: 'suspended',
    resumeCount: 0,
    decodeCount: 0,
    fetchedUrls: [],
    bufferSources: [],
    gainNodes: [],
    oscillators: [],
  }
  fetchSucceeds = true

  // A synchronous-enough fake: decode resolves immediately so awaiting playTimbre
  // settles the whole asset path within the test tick.
  class FakeAudioContext {
    currentTime = 0
    destination = {}
    constructor() {
      recorder.constructCount += 1
    }
    get state(): AudioContextState {
      return recorder.contextState
    }
    async resume(): Promise<void> {
      recorder.resumeCount += 1
      recorder.contextState = 'running'
    }
    async decodeAudioData(): Promise<AudioBuffer> {
      recorder.decodeCount += 1
      // The engine only stores this and sets source.buffer — never inspects it.
      return {} as AudioBuffer
    }
    createBufferSource() {
      const record = { started: false, stopped: false }
      recorder.bufferSources.push(record)
      return {
        buffer: null as AudioBuffer | null,
        connect: (node: unknown) => node,
        start: () => {
          record.started = true
        },
        stop: () => {
          record.stopped = true
        },
        addEventListener: vi.fn(),
      }
    }
    createGain() {
      const gain = {
        value: 0,
        setValueAtTime: vi.fn(),
        linearRampToValueAtTime: vi.fn(),
        exponentialRampToValueAtTime: vi.fn(),
      }
      recorder.gainNodes.push(gain)
      return { gain, connect: (node: unknown) => node }
    }
    createOscillator() {
      const record = { started: false, stopped: false }
      recorder.oscillators.push(record)
      return {
        type: 'sine' as OscillatorType,
        frequency: { setValueAtTime: vi.fn() },
        connect: (node: unknown) => node,
        start: () => {
          record.started = true
        },
        stop: () => {
          record.stopped = true
        },
        addEventListener: vi.fn(),
      }
    }
  }

  const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
    recorder.fetchedUrls.push(String(input))
    return fetchSucceeds
      ? new Response(new ArrayBuffer(8), { status: 200 })
      : new Response(null, { status: 404 })
  })

  vi.stubGlobal('AudioContext', FakeAudioContext)
  vi.stubGlobal('fetch', fetchMock)
  resetSoundEngineForTest()
})

afterEach(() => {
  resetSoundEngineForTest()
  vi.unstubAllGlobals()
})

describe('soundEngine', () => {
  it('plays the decoded asset (fetches it, resumes a suspended context, starts a buffer source) when a moment fires', async () => {
    // Act
    await playTimbre('felt', 0.6)

    // Assert — the suspended context is resumed, the asset is fetched + decoded,
    // and exactly one buffer source is started; no synth fallback was needed.
    expect(recorder.resumeCount).toBe(1)
    expect(recorder.fetchedUrls).toEqual(['/sounds/felt.mp3'])
    expect(recorder.decodeCount).toBe(1)
    expect(recorder.bufferSources).toHaveLength(1)
    expect(recorder.bufferSources[0]?.started).toBe(true)
    expect(recorder.oscillators).toHaveLength(0)
  })

  it('applies masterVolume × the timbre normalizeGain to the cue', async () => {
    // Act — felt has normalizeGain 1.57; at half volume the gain is 0.5 × 1.57.
    await playTimbre('felt', 0.5)

    // Assert
    expect(recorder.gainNodes).toHaveLength(1)
    expect(recorder.gainNodes[0]?.value).toBeCloseTo(0.785, 6)
  })

  it('falls back to the synth sine when the asset cannot be decoded, so a fired moment is never silent', async () => {
    // Arrange — the asset 404s.
    fetchSucceeds = false

    // Act
    await playTimbre('felt', 0.6)

    // Assert — no buffer source; one synth oscillator started + scheduled to stop.
    expect(recorder.bufferSources).toHaveLength(0)
    expect(recorder.oscillators).toHaveLength(1)
    expect(recorder.oscillators[0]?.started).toBe(true)
    expect(recorder.oscillators[0]?.stopped).toBe(true)
  })

  it('negative-caches a failed asset so it is not re-fetched on the next fire', async () => {
    // Arrange — the asset 404s on the first attempt.
    fetchSucceeds = false

    // Act — fire the same timbre twice.
    await playTimbre('felt', 0.6)
    await playTimbre('felt', 0.6)

    // Assert — fetched only ONCE (the failure is remembered), both fired the synth.
    expect(recorder.fetchedUrls).toHaveLength(1)
    expect(recorder.oscillators).toHaveLength(2)
  })

  it('keeps at most one cue in-flight — a rapid second fire cuts the first buffer source', async () => {
    // Act — two completions in quick succession.
    await playTimbre('felt', 0.6)
    await playTimbre('felt', 0.6)

    // Assert — the first source is stopped (cut) when the second starts, so the
    // two cues never layer.
    expect(recorder.bufferSources).toHaveLength(2)
    expect(recorder.bufferSources[0]?.stopped).toBe(true)
    expect(recorder.bufferSources[1]?.started).toBe(true)
  })

  it('prewarms an asset by decoding it WITHOUT resuming the context (off-gesture safe)', async () => {
    // Act
    await prewarmTimbre('felt')

    // Assert — fetched + decoded, but the context was never resumed and nothing
    // played (autoplay-safe: only a real gesture resumes + plays).
    expect(recorder.fetchedUrls).toEqual(['/sounds/felt.mp3'])
    expect(recorder.decodeCount).toBe(1)
    expect(recorder.resumeCount).toBe(0)
    expect(recorder.bufferSources).toHaveLength(0)
    expect(recorder.oscillators).toHaveLength(0)
  })

  it('shares one decode across concurrent cold plays (no duplicate fetch)', async () => {
    // Act — two plays of a cold timbre fired at once.
    await Promise.all([playTimbre('felt', 0.6), playTimbre('felt', 0.6)])

    // Assert — a single fetch + decode is shared; both plays still produce a cue.
    expect(recorder.fetchedUrls).toHaveLength(1)
    expect(recorder.decodeCount).toBe(1)
    expect(recorder.bufferSources).toHaveLength(2)
  })

  it('degrades to silence (never throws) when Web Audio is unavailable, e.g. SSR', async () => {
    // Arrange — no AudioContext in this runtime.
    vi.stubGlobal('AudioContext', undefined)
    resetSoundEngineForTest()

    // Act / Assert — the call resolves quietly; nothing is fetched or played.
    await expect(playTimbre('felt', 0.6)).resolves.toBeUndefined()
    expect(recorder.fetchedUrls).toHaveLength(0)
  })
})
