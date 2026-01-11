import { resolve } from 'path'

import { defineConfig, externalizeDepsPlugin } from 'electron-vite'

/**
 * electron-vite configuration for TypeScript compilation.
 *
 * This configuration:
 * - Compiles TypeScript to CommonJS (for Electron compatibility)
 * - Bundles main and preload processes separately
 * - Externalizes node_modules for faster builds
 * - Generates source maps for debugging
 *
 * @see https://electron-vite.org/config
 */
export default defineConfig({
  main: {
    plugins: [externalizeDepsPlugin()],
    build: {
      rollupOptions: {
        input: {
          index: resolve(__dirname, 'electron/main.ts'),
        },
        output: {
          format: 'cjs',
          entryFileNames: '[name].cjs',
        },
      },
      outDir: 'dist-electron/main',
      sourcemap: true,
    },
    resolve: {
      alias: {
        '@electron': resolve(__dirname, 'electron'),
        '@types': resolve(__dirname, 'electron/types'),
      },
    },
  },
  preload: {
    plugins: [externalizeDepsPlugin()],
    build: {
      rollupOptions: {
        input: {
          preload: resolve(__dirname, 'electron/preload.ts'),
          'preload-floating': resolve(
            __dirname,
            'electron/preload-floating.ts',
          ),
        },
        output: {
          format: 'cjs',
          entryFileNames: '[name].cjs',
        },
      },
      outDir: 'dist-electron/preload',
      sourcemap: true,
    },
  },
  // Renderer is omitted - Next.js handles it via WebView architecture
  // (loads https://corelive.app/ directly, no local renderer entry)
})
