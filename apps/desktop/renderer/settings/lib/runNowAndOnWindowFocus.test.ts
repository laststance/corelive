// @vitest-environment happy-dom
import '@testing-library/jest-dom/vitest'
import { afterEach, describe, expect, test } from 'vitest'

import { runNowAndOnWindowFocus } from './runNowAndOnWindowFocus'

let stopRunning: () => void = () => {}

afterEach(() => {
  stopRunning()
})

describe('runNowAndOnWindowFocus', () => {
  test('reads once on mount and again each time the window regains focus', () => {
    // Arrange
    let runCount = 0

    // Act
    stopRunning = runNowAndOnWindowFocus(() => {
      runCount += 1
    })
    window.dispatchEvent(new Event('focus'))
    window.dispatchEvent(new Event('focus'))

    // Assert
    expect(runCount).toBe(3)
  })

  test('keeps a slower earlier read from overwriting the value a newer read applied', () => {
    // Arrange
    const staleChecks: Array<() => boolean> = []
    stopRunning = runNowAndOnWindowFocus((isStale) => {
      staleChecks.push(isStale)
    })

    // Act: the window regains focus while the mount read is still in flight.
    window.dispatchEvent(new Event('focus'))

    // Assert
    expect(staleChecks.map((isStale) => isStale())).toEqual([true, false])
  })

  test('marks the last read stale and stops listening after cleanup', () => {
    // Arrange
    const staleChecks: Array<() => boolean> = []
    const stop = runNowAndOnWindowFocus((isStale) => {
      staleChecks.push(isStale)
    })

    // Act
    stop()
    window.dispatchEvent(new Event('focus'))

    // Assert
    expect(staleChecks.map((isStale) => isStale())).toEqual([true])
  })
})
