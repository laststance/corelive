'use client'

import { useCallback, useRef } from 'react'

import {
  COMPLETION_SOUND_ATTACK_MS,
  COMPLETION_SOUND_DURATION_MS,
  COMPLETION_SOUND_FREQUENCY_HZ,
  COMPLETION_SOUND_PEAK_GAIN,
} from '@/lib/constants/completionFeedback'
import { useAppSelector } from '@/lib/redux/hooks'
import { selectCompletionSound } from '@/lib/redux/slices/preferencesSlice'

/**
 * motion-safe gated amber fill for the checkbox (~200ms ease-out, `duration-200`
 * = CHECKBOX_COMPLETION_FILL_MS). Transitions background + border + box-shadow so
 * the amber fills in over the short tier; `prefers-reduced-motion` users get an
 * instant, motionless state change (the motion-safe classes simply don't apply).
 * Deliberately NOT the heatmap's radial-sweep / celebration easing — the heatmap
 * stays the single performative hero moment.
 */
const CHECKBOX_COMPLETION_MOTION_CLASS =
  'motion-safe:transition-[background-color,border-color,box-shadow] motion-safe:duration-200 motion-safe:ease-out'

/**
 * Return shape of useCompletionFeedback.
 *
 * @property checkboxMotionClassName - motion-safe class to apply to the checkbox.
 * @property fire - Plays the opt-in completion sound (no-op unless enabled).
 */
export interface CompletionFeedback {
  checkboxMotionClassName: string
  fire: () => void
}

/**
 * Shared completion-feedback seam for the three row surfaces (TodoItem + the two
 * Floating rows), which share no row component. Returns the motion-safe checkbox
 * fill className and a `fire()` that plays the opt-in completion sound. Why a
 * hook, not a component: the surfaces differ structurally, so the hook is the
 * shared spot. The sound is opt-in (default OFF), read app-level from Redux, and
 * synthesized (no bundled asset); at most one sound is in-flight, so a rapid
 * second check cuts/restarts rather than layering. Call `fire()` only on a
 * false→true completion (un-completing is quiet).
 *
 * @returns The checkbox motion className and the sound `fire` trigger.
 * @example
 * const { checkboxMotionClassName, fire } = useCompletionFeedback()
 * const onCheck = () => { if (!todo.completed) fire(); toggle(todo.id) }
 * <Checkbox className={checkboxMotionClassName} onCheckedChange={onCheck} />
 */
export function useCompletionFeedback(): CompletionFeedback {
  const isSoundEnabled = useAppSelector(selectCompletionSound)
  const audioContextRef = useRef<AudioContext | null>(null)
  const activeOscillatorRef = useRef<OscillatorNode | null>(null)

  const fire = useCallback(() => {
    // Opt-in only (default OFF) and browser-only — no-op otherwise.
    if (!isSoundEnabled || typeof window === 'undefined') return

    try {
      // Lazily create the AudioContext on first real use so users who never
      // enable sound never pay for one.
      audioContextRef.current ??= new AudioContext()
      const audioContext = audioContextRef.current
      // Browsers suspend audio until a user gesture; a checkbox click is one, so
      // resume here is the moment playback can legitimately start.
      if (audioContext.state === 'suspended') void audioContext.resume()

      // At most one in-flight: cut any still-ringing tone so rapid checks never
      // layer into a cacophony — they restart the single cue instead.
      if (activeOscillatorRef.current) {
        try {
          activeOscillatorRef.current.stop()
        } catch {
          // Already stopped — nothing to cut.
        }
        activeOscillatorRef.current = null
      }

      const startTime = audioContext.currentTime
      const endTime = startTime + COMPLETION_SOUND_DURATION_MS / 1000
      const oscillator = audioContext.createOscillator()
      const gainNode = audioContext.createGain()

      // Soft, warm, non-melodic: a single low-mid sine with a fast attack and a
      // short exponential decay — a paper-soft thud, never a gamified chime.
      oscillator.type = 'sine'
      oscillator.frequency.setValueAtTime(
        COMPLETION_SOUND_FREQUENCY_HZ,
        startTime,
      )
      gainNode.gain.setValueAtTime(0, startTime)
      gainNode.gain.linearRampToValueAtTime(
        COMPLETION_SOUND_PEAK_GAIN,
        startTime + COMPLETION_SOUND_ATTACK_MS / 1000,
      )
      // Decay toward (but not to) zero — exponential ramps cannot target 0.
      gainNode.gain.exponentialRampToValueAtTime(0.0001, endTime)

      oscillator.connect(gainNode).connect(audioContext.destination)
      oscillator.start(startTime)
      oscillator.stop(endTime)
      activeOscillatorRef.current = oscillator
      oscillator.addEventListener('ended', () => {
        if (activeOscillatorRef.current === oscillator) {
          activeOscillatorRef.current = null
        }
      })
    } catch {
      // AudioContext unavailable / autoplay blocked — silently skip. The sound
      // is a non-essential opt-in cue; never let it break the completion flow.
    }
  }, [isSoundEnabled])

  return { checkboxMotionClassName: CHECKBOX_COMPLETION_MOTION_CLASS, fire }
}
