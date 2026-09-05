/**
 * @fileoverview Input contract for `completed.importLocal`. The client sends
 * timestamps its own device produced, so a wrong clock (or a hand-edited
 * payload) can hand the server a keep dated next year. `getJournal` has no
 * upper bound, so such a row sits at the top of someone's permanent win journal
 * and never ages out.
 */
import { describe, expect, it } from 'vitest'

import {
  IMPORT_LOCAL_FUTURE_TOLERANCE_MS,
  ImportLocalSchema,
} from './completed'

describe('ImportLocalSchema', () => {
  it('rejects a keep dated beyond any plausible clock drift', () => {
    // Arrange
    const input = {
      batchId: 'batch-1',
      items: [
        {
          localId: 'k1',
          title: 'push-ups',
          completedAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
        },
      ],
    }

    // Act
    const result = ImportLocalSchema.safeParse(input)

    // Assert
    expect(result.success).toBe(false)
  })

  it('accepts a keep from a device whose clock runs slightly fast', () => {
    // Arrange — inside the tolerance: an honest keep from a drifting device.
    const input = {
      batchId: 'batch-1',
      items: [
        {
          localId: 'k1',
          title: 'push-ups',
          completedAt: new Date(
            Date.now() + IMPORT_LOCAL_FUTURE_TOLERANCE_MS / 2,
          ),
        },
      ],
    }

    // Act
    const result = ImportLocalSchema.safeParse(input)

    // Assert
    expect(result.success).toBe(true)
  })
})
