import path from 'node:path'

import { describe, expect, it } from 'vitest'

import nextConfig from '../../../next.config.js'

interface CodeInspectorLoaderOptions {
  bundler?: string
  hotKeys?: string[]
  injectTo?: string[]
}

interface TurbopackLoader {
  options?: unknown
}

interface TurbopackRule {
  loaders: TurbopackLoader[]
}

interface WebpackPlugin {
  options?: CodeInspectorLoaderOptions
}

interface MinimalWebpackConfig {
  externals: unknown[]
  optimization: Record<string, unknown>
  plugins: WebpackPlugin[]
  resolve: { alias: Record<string, unknown> }
}

const codeInspectorClientPath = path.join(
  process.cwd(),
  'src',
  'components',
  'code-inspector',
  'CodeInspectorClient.tsx',
)

/**
 * Checks whether an unknown value has Turbopack loader entries.
 *
 * @param value - Candidate rule from `nextConfig.turbopack.rules`.
 * @returns `true` when the rule exposes a loaders array.
 * @example
 * isTurbopackRule({ loaders: [] }) // true
 */
function isTurbopackRule(value: unknown): value is TurbopackRule {
  return (
    typeof value === 'object' &&
    value !== null &&
    'loaders' in value &&
    Array.isArray(value.loaders)
  )
}

/**
 * Checks whether loader options are code-inspector options.
 *
 * @param value - Candidate loader options from a Turbopack rule.
 * @returns `true` when the value can be inspected as plugin options.
 * @example
 * isCodeInspectorLoaderOptions({ bundler: 'turbopack' }) // true
 */
function isCodeInspectorLoaderOptions(
  value: unknown,
): value is CodeInspectorLoaderOptions {
  return typeof value === 'object' && value !== null
}

/**
 * Reads code-inspector loader options from the generated Turbopack rules.
 *
 * @returns Loader options emitted by `codeInspectorPlugin`.
 * @example
 * getTurbopackInspectorOptions().some((options) => options.bundler === 'turbopack')
 */
function getTurbopackInspectorOptions(): CodeInspectorLoaderOptions[] {
  const rules = Object.values(nextConfig.turbopack?.rules ?? {})

  return rules.flatMap((rule) => {
    if (!isTurbopackRule(rule)) return []

    return rule.loaders
      .map((loader) => loader.options)
      .filter(isCodeInspectorLoaderOptions)
  })
}

describe('CodeInspectorClient', () => {
  it('pins Turbopack inspector injection to the global client mount', () => {
    const inspectorOptions = getTurbopackInspectorOptions()

    expect(inspectorOptions).not.toHaveLength(0)
    expect(
      inspectorOptions.every((options) =>
        options.injectTo?.includes(codeInspectorClientPath),
      ),
    ).toBe(true)
  })

  it('pins Webpack inspector injection to the same global client mount', () => {
    const configureWebpack = nextConfig.webpack
    const webpackConfig: MinimalWebpackConfig = {
      externals: [],
      optimization: {},
      plugins: [],
      resolve: { alias: {} },
    }

    if (typeof configureWebpack !== 'function') {
      throw new Error('Expected nextConfig.webpack to be configured')
    }

    // The production callback uses only `dev` and `isServer`; the cast keeps
    // this test focused without fabricating the whole Next.js build context.
    const configured = configureWebpack(webpackConfig, {
      dev: true,
      isServer: false,
    } as unknown as Parameters<
      typeof configureWebpack
    >[1]) as MinimalWebpackConfig
    const inspectorPlugin = configured.plugins.find(
      (plugin: WebpackPlugin) => plugin.options?.bundler === 'webpack',
    )

    expect(inspectorPlugin?.options?.injectTo).toContain(
      codeInspectorClientPath,
    )
  })
})
