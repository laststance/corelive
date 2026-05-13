import {
  useEffect,
  useRef,
  type DependencyList,
  type EffectCallback,
} from 'react'

/**
 * Runs an effect only after a component re-renders, skipping the first mount.
 *
 * Use this for update-only reactions such as syncing a changed setting after
 * the initial screen has already settled.
 *
 * @param effect - Effect body and optional cleanup returned to React.
 * @param deps - Dependency list that controls which updates re-run the effect.
 * @returns Nothing; React owns the update lifecycle.
 * @example
 * useUpdateEffect(() => {
 *   saveDraft(title)
 * }, [title])
 */
export function useUpdateEffect(
  effect: EffectCallback,
  deps?: DependencyList,
): void {
  const hasMountedRef = useRef(false)

  useEffect(() => {
    if (!hasMountedRef.current) {
      // The first pass marks mount complete and intentionally skips the effect.
      hasMountedRef.current = true
      return
    }

    return effect()
  }, deps)
}
