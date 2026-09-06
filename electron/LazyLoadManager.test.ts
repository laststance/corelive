import { readFileSync } from 'node:fs'
import { runInNewContext } from 'node:vm'

import { ModuleKind, transpileModule } from 'typescript'
import { describe, expect, test, vi } from 'vitest'

import type * as LazyLoadModule from './LazyLoadManager'

/**
 * Runs the real loader with isolated CommonJS imports so constructor identity can be checked without Electron.
 * @param requireComponent - Supplies the compiled manager exports.
 * @returns A fresh loader and its independent constructor cache.
 * @example const loader = createLoader(() => ({ MenuManager: class {} }))
 */
function createLoader(requireComponent: (path: string) => unknown) {
  const source = readFileSync(
    new URL('./LazyLoadManager.ts', import.meta.url),
    'utf8',
  )
  const compiled = transpileModule(source, {
    compilerOptions: { module: ModuleKind.CommonJS },
  }).outputText
  const exports = {}
  runInNewContext(compiled, { exports, require: requireComponent })
  // This VM boundary executes the module whose type is imported above.
  return (exports as typeof LazyLoadModule).lazyLoadManager
}

describe('deferred Electron managers', () => {
  test('reuses a manager constructor after the Node module cache changes', async () => {
    // Arrange
    class OriginalMenuManager {}
    class ReloadedMenuManager {}
    const requireComponent = vi
      .fn()
      .mockReturnValue({ MenuManager: OriginalMenuManager })
    const loader = createLoader(requireComponent)

    // Act
    const first = await loader.loadComponent('MenuManager')
    requireComponent.mockReturnValue({ MenuManager: ReloadedMenuManager })
    const [second, third] = await Promise.all([
      loader.loadComponent('MenuManager'),
      loader.loadComponent('MenuManager'),
    ])

    // Assert
    expect(first).toBe(OriginalMenuManager)
    expect(second).toBe(OriginalMenuManager)
    expect(third).toBe(OriginalMenuManager)
    expect(requireComponent).toHaveBeenCalledExactlyOnceWith(
      './MenuManager.cjs',
    )
  })

  test('allows startup to retry a manager whose first module load failed', async () => {
    // Arrange
    class TrayManager {}
    const requireComponent = vi
      .fn()
      .mockImplementationOnce(() => {
        throw new Error('Module unavailable')
      })
      .mockReturnValue({ SystemTrayManager: TrayManager })
    const loader = createLoader(requireComponent)

    // Act
    await expect(loader.loadComponent('SystemTrayManager')).rejects.toThrow(
      'Module unavailable',
    )
    const recovered = await loader.loadComponent('SystemTrayManager')

    // Assert
    expect(recovered).toBe(TrayManager)
    expect(requireComponent).toHaveBeenCalledTimes(2)
  })

  test('releases retained constructors at shutdown', async () => {
    // Arrange
    class OriginalMenuManager {}
    class ReloadedMenuManager {}
    const requireComponent = vi
      .fn()
      .mockReturnValue({ MenuManager: OriginalMenuManager })
    const loader = createLoader(requireComponent)
    await loader.loadComponent('MenuManager')

    // Act
    loader.cleanup()
    requireComponent.mockReturnValue({ MenuManager: ReloadedMenuManager })
    const reloaded = await loader.loadComponent('MenuManager')

    // Assert
    expect(reloaded).toBe(ReloadedMenuManager)
    expect(requireComponent).toHaveBeenCalledTimes(2)
  })
})
