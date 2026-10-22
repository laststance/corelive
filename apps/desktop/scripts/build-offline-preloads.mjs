import { fileURLToPath } from 'node:url'

import { build } from 'vite'

const desktopDirectory = fileURLToPath(new URL('../', import.meta.url))

/**
 * Bundles each sandboxed offline preload as one file with only Electron external.
 * electron-vite's multi-entry preload build shares local chunks, which sandboxed
 * preloads cannot require. The desktop build invokes this after its ordinary build.
 * @example await buildOfflinePreloads()
 */
async function buildOfflinePreloads() {
  for (const name of ['preload-offline-auth', 'preload-offline-editor']) {
    const result = await build({
      configFile: false,
      envDir: false,
      root: desktopDirectory,
      build: {
        outDir: 'dist-electron/preload',
        emptyOutDir: false,
        sourcemap: true,
        minify: false,
        lib: {
          entry: `electron/${name}.ts`,
          formats: ['cjs'],
          fileName: () => `${name}.cjs`,
        },
        rollupOptions: { external: ['electron'] },
      },
    })
    // Fail the build if a future import escapes the sandbox-compatible single-file boundary.
    for (const output of Array.isArray(result) ? result : [result]) {
      if (!('output' in output))
        throw new Error('Unexpected preload build watcher')
      for (const chunk of output.output) {
        if (chunk.type !== 'chunk') continue
        if (
          chunk.imports.some((specifier) => specifier !== 'electron') ||
          chunk.dynamicImports.length > 0
        ) {
          throw new Error(
            `Sandboxed preload ${name} contains an unsupported dependency`,
          )
        }
      }
    }
  }
}

await buildOfflinePreloads()
