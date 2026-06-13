/**
 * Sound engine — the per-window Web Audio core for the earned-beat sound palette.
 * Decodes bundled timbre assets into reusable `AudioBuffer`s (with a negative
 * cache for failures), enforces "at most one cue in-flight at a time" through a
 * single shared scheduled-source slot, and falls back to the legacy synth sine
 * when an asset can't be decoded. Pure module (no React) — the hooks call it.
 *
 * SCOPE (D3): every singleton here is module-level = per-JS-context = per Electron
 * BrowserWindow. The one-in-flight guarantee is therefore PER WINDOW; we never
 * arbitrate audio across windows (main / floating / braindump each own their own
 * engine). A single user's gestures serialize, so cross-window overlap is at most
 * a brief, quiet, sub-second edge — deliberately accepted, not a bug.
 *
 * AUTOPLAY (C2): decoding/constructing a suspended AudioContext is allowed
 * off-gesture; only `resume()` + playback need a user gesture. So `prewarm()`
 * decodes only, and `resume()` is called solely from the in-gesture play paths.
 *
 * @module lib/audio/soundEngine
 */

import {
  COMPLETION_SOUND_ATTACK_MS,
  COMPLETION_SOUND_DURATION_MS,
  COMPLETION_SOUND_FREQUENCY_HZ,
  COMPLETION_SOUND_PEAK_GAIN,
} from '@/lib/constants/completionFeedback'
import { SOUND_TIMBRES, type TimbreId } from '@/lib/constants/sound'

// --- Per-window singletons (see SCOPE note above) ---------------------------

/** The one AudioContext for this window, created lazily on first real use. */
let sharedAudioContext: AudioContext | null = null

/** Decoded asset buffers, keyed by timbre — decoded once, replayed many times. */
const decodedBuffers = new Map<TimbreId, AudioBuffer>()

/**
 * Timbres whose decode failed — a negative cache so one 404/corrupt asset doesn't
 * trigger a refetch storm on every play; it falls straight to the synth fallback.
 */
const failedTimbres = new Set<TimbreId>()

/** In-progress decodes, so concurrent plays of a cold timbre await one fetch. */
const inFlightDecodes = new Map<TimbreId, Promise<AudioBuffer | null>>()

/**
 * The single in-flight source (asset buffer OR synth oscillator — both are
 * `AudioScheduledSourceNode`). Typing the slot as the common supertype is what
 * lets an asset cut a still-ringing synth and vice-versa through ONE slot (A2).
 */
let sharedActiveSource: AudioScheduledSourceNode | null = null

// --- Internal helpers -------------------------------------------------------

/**
 * Returns this window's shared AudioContext, lazily creating it; SSR/unsupported-safe.
 * @returns
 * - In a browser with Web Audio: the shared AudioContext
 * - On the server or where AudioContext is unavailable: `null`
 */
function getAudioContext(): AudioContext | null {
  if (typeof window === 'undefined' || typeof AudioContext === 'undefined') {
    return null
  }
  sharedAudioContext ??= new AudioContext()
  return sharedAudioContext
}

/**
 * Stops the in-flight source (if any) so a rapid second cue cuts/restarts rather
 * than layering — the one-in-flight guarantee, per window.
 * @returns void
 */
function stopActiveSource(): void {
  if (sharedActiveSource) {
    try {
      sharedActiveSource.stop()
    } catch {
      // Already stopped/ended — nothing to cut.
    }
    sharedActiveSource = null
  }
}

/**
 * Installs a started source as the single in-flight one, clearing the slot when
 * it ends (only if it's still the current source — a later cue may have replaced it).
 * @param source - The just-started buffer/oscillator source.
 * @returns void
 */
function trackActiveSource(source: AudioScheduledSourceNode): void {
  sharedActiveSource = source
  source.addEventListener('ended', () => {
    if (sharedActiveSource === source) sharedActiveSource = null
  })
}

/**
 * Fetches + decodes a timbre asset into an AudioBuffer, caching success and
 * negative-caching failure; concurrent callers share one in-flight decode.
 * @param audioContext - The context to decode with.
 * @param timbreId - Which timbre's asset to load.
 * @returns
 * - On success: the decoded AudioBuffer (also cached)
 * - On fetch/decode failure: `null` (timbre added to the negative cache)
 */
async function decodeTimbre(
  audioContext: AudioContext,
  timbreId: TimbreId,
): Promise<AudioBuffer | null> {
  const cached = decodedBuffers.get(timbreId)
  if (cached) return Promise.resolve(cached)
  if (failedTimbres.has(timbreId)) return Promise.resolve(null)

  const existing = inFlightDecodes.get(timbreId)
  if (existing) return existing

  const decodePromise = (async (): Promise<AudioBuffer | null> => {
    try {
      const response = await fetch(SOUND_TIMBRES[timbreId].assetPath)
      if (!response.ok) throw new Error(`asset ${response.status}`)
      const encoded = await response.arrayBuffer()
      const buffer = await audioContext.decodeAudioData(encoded)
      decodedBuffers.set(timbreId, buffer)
      return buffer
    } catch {
      // 404 / corrupt / unsupported codec → remember the failure so we fall to
      // the synth fallback without re-fetching on every subsequent play.
      failedTimbres.add(timbreId)
      return null
    } finally {
      inFlightDecodes.delete(timbreId)
    }
  })()

  inFlightDecodes.set(timbreId, decodePromise)
  return decodePromise
}

/**
 * Plays a decoded asset buffer as the single in-flight cue at `masterVolume ×
 * normalizeGain`. AudioBufferSourceNode is single-use, so a fresh node is created
 * every play.
 * @param audioContext - The (already-resumed) context.
 * @param buffer - The decoded timbre buffer.
 * @param timbreId - Which timbre (for its normalizeGain).
 * @param masterVolume - User master volume, 0–1.
 * @returns void
 */
function playBuffer(
  audioContext: AudioContext,
  buffer: AudioBuffer,
  timbreId: TimbreId,
  masterVolume: number,
): void {
  stopActiveSource()
  const source = audioContext.createBufferSource()
  source.buffer = buffer
  const gainNode = audioContext.createGain()
  // No clamp: normalizeGain may exceed 1 to lift a quiet timbre; it is calibrated
  // so peak × gain stays well below clipping (see SoundTimbre.normalizeGain).
  gainNode.gain.value = masterVolume * SOUND_TIMBRES[timbreId].normalizeGain
  source.connect(gainNode).connect(audioContext.destination)
  source.start()
  trackActiveSource(source)
}

/**
 * Plays the legacy synth sine as the single in-flight cue — the fallback when an
 * asset can't be decoded, so completion feedback never goes fully silent. Reuses
 * the original completion-sound envelope, scaled by `masterVolume`.
 * @param audioContext - The (already-resumed) context.
 * @param masterVolume - User master volume, 0–1.
 * @returns void
 */
function playSynthFallback(
  audioContext: AudioContext,
  masterVolume: number,
): void {
  stopActiveSource()
  const startTime = audioContext.currentTime
  const endTime = startTime + COMPLETION_SOUND_DURATION_MS / 1000
  const oscillator = audioContext.createOscillator()
  const gainNode = audioContext.createGain()

  // Soft, warm, non-melodic: a single low-mid sine, fast attack, short decay.
  oscillator.type = 'sine'
  oscillator.frequency.setValueAtTime(COMPLETION_SOUND_FREQUENCY_HZ, startTime)
  gainNode.gain.setValueAtTime(0, startTime)
  gainNode.gain.linearRampToValueAtTime(
    COMPLETION_SOUND_PEAK_GAIN * masterVolume,
    startTime + COMPLETION_SOUND_ATTACK_MS / 1000,
  )
  // Decay toward (not to) zero — exponential ramps cannot target 0.
  gainNode.gain.exponentialRampToValueAtTime(0.0001, endTime)

  oscillator.connect(gainNode).connect(audioContext.destination)
  oscillator.start(startTime)
  oscillator.stop(endTime)
  trackActiveSource(oscillator)
}

// --- Public API -------------------------------------------------------------

/**
 * Decodes a timbre ahead of its first play WITHOUT resuming the context, so the
 * first real cue has no fetch/decode latency. Safe off-gesture (C2: decode is
 * allowed while suspended; only playback needs a gesture). No-op on SSR.
 * @param timbreId - The timbre to warm.
 * @returns A promise that resolves when the decode attempt settles.
 * @example
 * useInitialEffect(() => { void prewarmTimbre(selectedTimbre) })
 */
export async function prewarmTimbre(timbreId: TimbreId): Promise<void> {
  const audioContext = getAudioContext()
  if (!audioContext) return
  await decodeTimbre(audioContext, timbreId)
}

/**
 * Plays a timbre as the single in-flight cue. Call ONLY from a user gesture — it
 * resumes the (autoplay-suspended) context, then plays the decoded asset, or the
 * synth fallback if the asset can't be decoded. Whether a given moment plays is
 * decided by the hook/selectors, not here — this just plays the timbre. No-op on
 * SSR / where Web Audio is unavailable; never throws (a cue must not break a flow).
 * @param timbreId - Which timbre to play.
 * @param masterVolume - User master volume, 0–1.
 * @returns A promise that resolves once the cue has been scheduled (or skipped).
 * @example
 * const fire = () => { if (momentEnabled) void playTimbre(selectedTimbre, volume) }
 */
export async function playTimbre(
  timbreId: TimbreId,
  masterVolume: number,
): Promise<void> {
  try {
    const audioContext = getAudioContext()
    if (!audioContext) return
    // In-gesture: this is the legitimate moment to start audio.
    if (audioContext.state === 'suspended') void audioContext.resume()

    // Cached → play now; cold → decode (context already resuming, so awaiting and
    // then playing is still within the running context, not blocked by autoplay).
    const buffer =
      decodedBuffers.get(timbreId) ??
      (failedTimbres.has(timbreId)
        ? null
        : await decodeTimbre(audioContext, timbreId))

    if (buffer) {
      playBuffer(audioContext, buffer, timbreId, masterVolume)
    } else {
      playSynthFallback(audioContext, masterVolume)
    }
  } catch {
    // AudioContext unavailable / autoplay blocked / decode race — silently skip.
  }
}

/**
 * Plays a timbre for the Settings preview, bypassing the per-moment gate (preview
 * must sound even when every moment toggle is OFF). Identical playback to
 * {@link playTimbre}; named for intent at the call site.
 * @param timbreId - The timbre to preview.
 * @param masterVolume - User master volume, 0–1.
 * @returns A promise that resolves once the preview has been scheduled.
 * @example
 * <RadioGroup onValueChange={(id) => void previewTimbre(id, volume)} />
 */
export async function previewTimbre(
  timbreId: TimbreId,
  masterVolume: number,
): Promise<void> {
  return playTimbre(timbreId, masterVolume)
}

/**
 * Test-only reset of all module-level engine state (context, buffer cache,
 * negative cache, in-flight decodes, active-source slot). The engine is a
 * per-window singleton, so without this, state leaks between test cases.
 * @returns void
 * @example
 * afterEach(() => resetSoundEngineForTest())
 */
export function resetSoundEngineForTest(): void {
  sharedAudioContext = null
  sharedActiveSource = null
  decodedBuffers.clear()
  failedTimbres.clear()
  inFlightDecodes.clear()
}
