import { expect, test } from 'vitest'

import { parseConfigStringEntries } from '../../src/utils/parse-config-string-entries.js'

test('quoted theme token names retain punctuation instead of truncating to a trailing number', () => {
  // Arrange
  const source = `
    '1.5': '0.375rem',
    "2xl": 'var(--radius-2xl)',
    'content/quiet': 'var(--quiet)',
    accent: 'var(--accent)',
  `

  // Act
  const entries = parseConfigStringEntries(source)

  // Assert
  expect(entries).toEqual({
    '1.5': '0.375rem',
    '2xl': 'var(--radius-2xl)',
    'content/quiet': 'var(--quiet)',
    accent: 'var(--accent)',
  })
})
