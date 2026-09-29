// @vitest-environment node
import { describe, expect, test } from 'vitest'

import { db } from './index'

describe('shared database client', () => {
  test('survives the server dropping an idle connection instead of crashing the process', () => {
    // Arrange — pg-pool re-emits an idle client's failure as a pool 'error' event.
    const droppedConnection = new Error(
      'terminating connection due to administrator command',
    )

    // Act
    const emitDroppedConnection = () =>
      db.$client.emit('error', droppedConnection)

    // Assert — an 'error' event with no listener would throw here.
    expect(emitDroppedConnection).not.toThrow()
  })
})
