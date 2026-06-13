'use client'

import { useSoundFeedback } from '@/hooks/useSoundFeedback'

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
 * Completion-feedback seam for the three row surfaces (TodoItem + the two
 * Floating rows), which share no row component. Returns the motion-safe checkbox
 * fill className and a `fire()` that plays the opt-in **complete** earned-beat
 * cue. A thin wrapper over `useSoundFeedback('complete')`: timbre selection,
 * master volume, the per-window AudioContext, and the at-most-one-in-flight
 * policy all live in the shared sound engine now, so this hook is purely the
 * checkbox-motion class plus the complete-moment binding. Call `fire()` only on a
 * false→true completion (un-completing is quiet).
 *
 * @returns The checkbox motion className and the complete-cue `fire` trigger.
 * @example
 * const { checkboxMotionClassName, fire } = useCompletionFeedback()
 * const onCheck = () => { if (!todo.completed) fire(); toggle(todo.id) }
 * <Checkbox className={checkboxMotionClassName} onCheckedChange={onCheck} />
 */
export function useCompletionFeedback(): CompletionFeedback {
  const fire = useSoundFeedback('complete')
  return { checkboxMotionClassName: CHECKBOX_COMPLETION_MOTION_CLASS, fire }
}
