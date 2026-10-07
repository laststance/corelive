import { createRequire } from 'node:module'

import { expect, test } from 'vitest'

const { sprintf } = createRequire(import.meta.url)('sprintf-js') as {
  sprintf: (format: string, value: number) => string
}

test.each([
  [
    '%.999999999f',
    '1.0000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000',
  ],
  [
    '%.999999999e',
    '1.0000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000e+0',
  ],
  ['%.999999999g', '1'],
  ['%.0g', '1'],
])(
  'desktop build logging survives excessive numeric precision (%s)',
  (format, expected) => {
    // Arrange
    const value = 1
    // Act
    const formatted = sprintf(format, value)
    // Assert
    expect(formatted).toBe(expected)
  },
)

test('desktop build logging preserves ordinary numeric formatting', () => {
  // Arrange
  const format = '%.2f'
  // Act
  const formatted = sprintf(format, 1.25)
  // Assert
  expect(formatted).toBe('1.25')
})
