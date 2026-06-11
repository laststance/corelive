import { describe, it, expect } from 'vitest'

import { clearedAffirmation } from './clearedAffirmation'

describe('clearedAffirmation — quiet praise shown when the completed list is cleared', () => {
  it('appends the companion praise phrase to a multi-item count', () => {
    // Arrange / Act
    const message = clearedAffirmation(8)
    // Assert — verbatim DESIGN.md "Voice & Microcopy" phrasing
    expect(message).toBe('8 things done — good day')
  })

  it('uses the singular "thing" when exactly one was cleared', () => {
    // Arrange / Act
    const message = clearedAffirmation(1)
    // Assert
    expect(message).toBe('1 thing done — good day')
  })

  it('stays silent (null) when nothing was cleared, never praising zero', () => {
    // Arrange / Act
    const message = clearedAffirmation(0)
    // Assert
    expect(message).toBeNull()
  })
})
