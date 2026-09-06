import { Linter, type Rule } from 'eslint'
import { expect, test } from 'vitest'

import { banStylelist } from '../../src/rules/ban-stylelist.js'
import { tokenOnly } from '../../src/rules/token-only.js'

/** Exercises the real ESLint parser and listeners for shared class traversal regressions.
 * @param source - JavaScript/JSX containing a class expression.
 * @param rule - Token-only or ban-stylelist policy under test.
 * @returns Actual ESLint diagnostics for the source.
 * @example lintClasses('const view = <div className="p-[17px]" />', banStylelist)
 */
function lintClasses(source: string, rule: Rule.RuleModule) {
  return new Linter().verify(source, {
    languageOptions: { parserOptions: { ecmaFeatures: { jsx: true } } },
    plugins: { design: { rules: { classes: rule } } },
    rules: { 'design/classes': 'error' },
  })
}

for (const [name, rule] of [
  ['ban-stylelist', banStylelist],
  ['token-only', tokenOnly],
] as const) {
  test(`${name} reports an arbitrary class in a JSX utility call exactly once`, () => {
    // Arrange
    const source = 'const view = <div className={cn("p-[17px]")} />'

    // Act
    const messages = lintClasses(source, rule)

    // Assert
    expect(messages.map(({ message }) => message)).toEqual([
      name === 'ban-stylelist'
        ? '"p-[17px]" uses a hardcoded spacing value. Use design tokens instead.'
        : '"p-[17px]" uses an arbitrary value. Use design tokens instead.',
    ])
  })

  test(`${name} reports a cva variant violation exactly once`, () => {
    // Arrange
    const source =
      'const classes = cva("flex", { variants: { size: { large: "p-[17px]" } } })'

    // Act
    const messages = lintClasses(source, rule)

    // Assert
    expect(
      messages.filter(({ message }) => message.includes('p-[17px]')),
    ).toHaveLength(1)
  })

  test(`${name} accepts CSS-variable classes in literal and template attributes`, () => {
    // Arrange
    const source =
      'const view = <><div className="bg-[var(--accent)]" /><div className={`text-[var(--foreground)]`} /></>'

    // Act
    const messages = lintClasses(source, rule)

    // Assert
    expect(messages).toEqual([])
  })
}
