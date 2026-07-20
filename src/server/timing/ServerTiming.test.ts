import { describe, expect, it, vi } from 'vitest'

import { ServerTiming } from './ServerTiming'

describe('ServerTiming', () => {
  it('exposes accumulated Home bootstrap phases as a valid Server-Timing value', async () => {
    // Arrange
    const now = vi
      .spyOn(performance, 'now')
      .mockReturnValueOnce(10)
      .mockReturnValueOnce(11.25)
    const serverTiming = new ServerTiming()

    // Act
    await serverTiming.measure('auth', async () => 'authenticated')
    serverTiming.record('auth', 0.75)
    serverTiming.record('db', 12.345)
    serverTiming.record('user', 2)
    serverTiming.record('sql', 8.5)

    // Assert
    expect(serverTiming.toHeaderValue()).toBe(
      'auth;dur=2.00, db;dur=12.35, user;dur=2.00, sql;dur=8.50',
    )
    now.mockRestore()
  })

  it('still records a failed phase so production errors remain diagnosable', async () => {
    // Arrange
    const now = vi
      .spyOn(performance, 'now')
      .mockReturnValueOnce(20)
      .mockReturnValueOnce(23)
    const serverTiming = new ServerTiming()

    // Act
    const operation = serverTiming.measure('sql', async () => {
      throw new Error('query failed')
    })

    // Assert
    await expect(operation).rejects.toThrow('query failed')
    expect(serverTiming.toHeaderValue()).toBe('sql;dur=3.00')
    now.mockRestore()
  })
})
