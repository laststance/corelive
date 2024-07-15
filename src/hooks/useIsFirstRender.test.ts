import { renderHook } from '@testing-library/react'

import { useIsFirstRender } from './useIsFirstRender'

describe('useIsFirstRender', () => {
  it('should return true on first render and false on subsequent renders', () => {
    const { result, rerender } = renderHook(() => useIsFirstRender())

    // First render should return true
    expect(result.current).toBe(true)

    // Re-render the hook
    rerender()

    // Now it should return false
    expect(result.current).toBe(false)

    // Re-render the hook
    rerender()

    // Now it should return false
    expect(result.current).toBe(false)

    // Re-render the hook
    rerender()

    // Now it should return false
    expect(result.current).toBe(false)
  })
})
