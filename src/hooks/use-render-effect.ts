import { useEffect, type DependencyList, type EffectCallback } from 'react'

/**
 * A dependency list with at least one entry.
 */
type NonEmptyDependencyList = readonly [unknown, ...unknown[]]

/**
 * Runs an effect after render.
 *
 * Two call shapes are supported:
 * - `useRenderEffect(effect)` fires on every render, including mount.
 * - `useRenderEffect(effect, [dep])` fires on mount and non-empty dependency
 *   changes.
 *
 * Passing `[]` is intentionally a type error. Use `useInitialEffect` for
 * mount-only work so the lifecycle intent stays readable at the call site.
 *
 * @param effect - Effect body and optional cleanup returned to React.
 * @param deps - Optional non-empty dependency list.
 * @returns Nothing; React owns the render lifecycle.
 * @example
 * useRenderEffect(() => {
 *   document.title = title
 * }, [title])
 */
export function useRenderEffect(effect: EffectCallback): void
export function useRenderEffect(
  effect: EffectCallback,
  deps: NonEmptyDependencyList,
): void
export function useRenderEffect(
  effect: EffectCallback,
  deps?: DependencyList,
): void {
  // Omitted deps means every render; non-empty deps means mount plus changes.
  useEffect(effect, deps)
}
