// @vitest-environment node
import { EventEmitter } from 'node:events'

import { beforeEach, describe, expect, test, vi } from 'vitest'

const logged = vi.hoisted(() => ({ warn: vi.fn(), error: vi.fn() }))

vi.mock('../lib/logger', () => ({
  createModuleLogger: () => ({ ...logged, info: vi.fn(), debug: vi.fn() }),
}))

import { db } from './index'

describe('shared database client', () => {
  beforeEach(() => {
    logged.warn.mockClear()
    logged.error.mockClear()
  })

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

  test('logs a dropped idle connection once, not once for the client and again for the pool', () => {
    // Arrange — a new client is announced to the pool's 'connect' listeners; when it later drops
    // while idle, pg-pool emits the failure on the client and re-emits it on the pool.
    const client = new EventEmitter()
    const droppedConnection = new Error(
      'terminating connection due to administrator command',
    )
    db.$client.emit('connect', client)

    // Act
    client.emit('error', droppedConnection)
    db.$client.emit('error', droppedConnection)

    // Assert
    expect(logged.warn).toHaveBeenCalledTimes(1)
    expect(logged.warn).toHaveBeenCalledWith(
      { err: droppedConnection },
      'PostgreSQL client error',
    )
    expect(logged.error).not.toHaveBeenCalled()
  })

  test('keeps a client that fails while checked out from crashing the process', () => {
    // Arrange — pg-pool has removed its own idle listener for a checked-out client.
    const client = new EventEmitter()
    db.$client.emit('connect', client)

    // Act
    const emitDroppedConnection = () =>
      client.emit('error', new Error('Connection terminated unexpectedly'))

    // Assert — an 'error' event with no listener would throw here.
    expect(emitDroppedConnection).not.toThrow()
  })
})
