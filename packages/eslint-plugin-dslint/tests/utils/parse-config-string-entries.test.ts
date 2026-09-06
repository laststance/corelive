import { expect, test } from 'vitest'

import { parseConfigStringEntries } from '../../src/utils/parse-config-string-entries.js'

test('token configuration preserves numeric-leading radius names and existing color keys', () => {
  // Arrange
  const source = `
    '4xl': 'var(--radius-4xl)',
    "2xl": 'var(--radius-2xl)',
    500: 'var(--color-500)',
    "primary-foreground": 'var(--primary-foreground)',
    accent: 'var(--accent)',
  `

  // Act
  const entries = parseConfigStringEntries(source)

  // Assert
  expect(entries).toEqual({
    '4xl': 'var(--radius-4xl)',
    '2xl': 'var(--radius-2xl)',
    '500': 'var(--color-500)',
    'primary-foreground': 'var(--primary-foreground)',
    accent: 'var(--accent)',
  })
})
