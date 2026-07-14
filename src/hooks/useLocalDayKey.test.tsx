import { act, renderHook } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { useLocalDayKey } from './useLocalDayKey'

const LOCAL_DAY_BOUNDARY_ADVANCE_MS = 1_000

describe('useLocalDayKey', () => {
  afterEach(() => {
    vi.useRealTimers()
  })

  it('publishes the next local day after midnight without remounting Home', () => {
    // Arrange
    vi.useFakeTimers()
    vi.setSystemTime(new Date(2026, 6, 14, 23, 59, 59, 500))
    const { result } = renderHook(() => useLocalDayKey())
    expect(result.current).toBe('2026-07-14')

    // Act
    act(() => {
      vi.advanceTimersByTime(LOCAL_DAY_BOUNDARY_ADVANCE_MS)
    })

    // Assert
    expect(result.current).toBe('2026-07-15')
  })
})
