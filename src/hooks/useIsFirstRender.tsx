import { useReducer } from 'react'

/**
 * Returns `true` only on the hook's first render, then `false` afterward.
 *
 * Uses the supported "update state during render" reducer pattern so the
 * answer is available synchronously on the render pass (no ref reads).
 *
 * @returns Whether the current render is the first for this hook instance.
 * @example
 * const isFirstRender = useIsFirstRender()
 */
export function useIsFirstRender(): boolean {
  const [renderCount, incrementRenderCount] = useReducer(
    (count: number) => count + 1,
    0,
  )

  const isFirstRender = renderCount === 0

  if (renderCount === 0) {
    incrementRenderCount()
  }

  return isFirstRender
}
