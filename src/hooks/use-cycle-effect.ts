import { useEffect, type DependencyList, type EffectCallback } from 'react'

/**
 * Runs an effect with the same lifecycle semantics as React's `useEffect`.
 *
 * This alias keeps component code on named lifecycle hooks while preserving
 * the full `useEffect` behavior when mount and dependency changes both matter.
 *
 * @param effect - Effect body and optional cleanup returned to React.
 * @param deps - Optional dependency list passed through to React.
 * @returns Nothing; React owns the effect lifecycle.
 * @example
 * useCycleEffect(() => {
 *   document.title = title
 * }, [title])
 */
export function useCycleEffect(
  effect: EffectCallback,
  deps?: DependencyList,
): void {
  // This hook is a semantic alias for React's effect lifecycle.
  useEffect(effect, deps)
}
