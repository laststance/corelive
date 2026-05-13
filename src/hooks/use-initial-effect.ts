import { useEffect, type EffectCallback } from 'react'

/**
 * Runs an effect exactly once after the component mounts.
 *
 * This hook gives mount-only effects an explicit lifecycle name so component
 * code does not need a raw `useEffect(..., [])` call.
 *
 * @param effect - Effect body and optional cleanup returned to React.
 * @returns Nothing; React owns the mount lifecycle.
 * @example
 * useInitialEffect(() => {
 *   analytics.track('settings_opened')
 * })
 */
export function useInitialEffect(effect: EffectCallback): void {
  // Mount-only work intentionally maps to React's empty dependency list.
  useEffect(effect, [])
}
