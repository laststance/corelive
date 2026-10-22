import { execFileSync } from 'node:child_process'
import { createRequire } from 'node:module'
import path from 'node:path'

import { expect, test } from 'vitest'

const require = createRequire(import.meta.url)

test('workspace type checks use the native TypeScript 7 compiler', () => {
  // Arrange
  const compiler = path.join(
    path.dirname(require.resolve('typescript/package.json')),
    'bin/tsc',
  )
  // Act
  const version = execFileSync(process.execPath, [compiler, '--version'], {
    encoding: 'utf8',
  })
  // Assert
  expect(version.trim()).toBe('Version 7.0.2')
})

test.each(['@typescript-eslint/parser', 'tsup', 'ts-api-utils'])(
  '%s can parse TypeScript through its private compiler API',
  (consumer) => {
    // Arrange
    const consumerRequire = createRequire(require.resolve(consumer))
    const compiler = consumerRequire('typescript') as {
      version: string
      createSourceFile: (
        name: string,
        source: string,
        target: number,
      ) => {
        statements: unknown[]
      }
    }
    // Act
    const source = compiler.createSourceFile('sample.ts', 'const count = 1', 99)
    // Assert
    expect(compiler.version).toBe('6.0.3')
    expect(source.statements).toHaveLength(1)
  },
)
