import { useCycleEffect } from '@/hooks/use-cycle-effect'
import { playTimbre, prewarmTimbre } from '@/lib/audio/soundEngine'
import type { SoundMomentId } from '@/lib/constants/sound'
import { useAppSelector } from '@/lib/redux/hooks'
import {
  selectSoundMoment,
  selectSoundTimbre,
  selectSoundVolume,
} from '@/lib/redux/slices/settingsSlice'

/**
 * Earned-beat sound seam for one task-life moment (`task-create` / `complete` /
 * `clear`). Reads that moment's ON/OFF toggle plus the selected timbre + master
 * volume from Redux, prewarms the timbre's asset whenever the moment is enabled
 * (decode only — off-gesture safe, so the first cue has no latency), and returns
 * a stable `fire()` that plays the cue via the per-window sound engine ONLY when
 * the moment is ON. Why a hook: enablement + timbre + volume are app-level Redux
 * state, and several structurally-unrelated surfaces (TodoItem, FloatingNavigator,
 * TodoList's add/clear) each need the same gated trigger. `fire()` is a no-op
 * while the moment is OFF (a fresh install is silent), so callers fire it
 * unconditionally on the user gesture without re-checking settings.
 *
 * @param moment - Which earned-beat moment this trigger belongs to.
 * @returns A stable `fire()` that plays the moment's cue when enabled, else a no-op.
 * @example
 * const fireCreate = useSoundFeedback('task-create')
 * const addTodo = () => { createMutation.mutate({ ... }); fireCreate() }
 */
export function useSoundFeedback(moment: SoundMomentId): () => void {
  const isMomentEnabled = useAppSelector((state) =>
    selectSoundMoment(state, moment),
  )
  const timbre = useAppSelector(selectSoundTimbre)
  const volume = useAppSelector(selectSoundVolume)

  // Prewarm (decode-only, no resume — autoplay-safe) the selected timbre once the
  // moment is enabled, and again if the user later picks a different timbre, so
  // the first real cue plays with zero decode latency. Skipped entirely while the
  // moment is OFF, so a user who never enables sound never fetches an asset.
  useCycleEffect(() => {
    if (isMomentEnabled) void prewarmTimbre(timbre)
  }, [isMomentEnabled, timbre])

  return () => {
    // Gate on the per-moment toggle: a disabled moment stays silent and the
    // engine is never even touched. Enabled → delegate to the per-window engine,
    // which resumes the AudioContext inside this gesture, keeps at most one cue
    // in-flight, and never throws.
    if (!isMomentEnabled) return
    void playTimbre(timbre, volume)
  }
}
