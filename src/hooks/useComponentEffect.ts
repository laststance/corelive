import { useEffect, type DependencyList, type EffectCallback } from 'react'

/**
 * Runs a React effect from a named custom hook boundary.
 *
 * This hook exists for effect blocks that are already intentionally scoped to a
 * component but must not call `useEffect` directly under the strict React/Next
 * ESLint rule set.
 *
 * @param effect - Effect body and optional cleanup returned to React.
 * @param deps - Dependency list that controls when React re-runs the effect.
 * @returns Nothing; React owns the effect lifecycle.
 * @example
 * useComponentEffect(() => {
 *   document.title = title
 * }, [title])
 */
export function useComponentEffect(
  effect: EffectCallback,
  deps?: DependencyList,
): void {
  useEffect(effect, deps)
}
