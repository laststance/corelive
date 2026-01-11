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
          // Add lazy-loaded modules as separate entry points so they're built as separate files
          SystemTrayManager: resolve(
            __dirname,
            'electron/SystemTrayManager.ts',
          ),
          NotificationManager: resolve(
            __dirname,
            'electron/NotificationManager.ts',
          ),
          ShortcutManager: resolve(__dirname, 'electron/ShortcutManager.ts'),
          AutoUpdater: resolve(__dirname, 'electron/AutoUpdater.ts'),
          MenuManager: resolve(__dirname, 'electron/MenuManager.ts'),
          SystemIntegrationErrorHandler: resolve(
            __dirname,
            'electron/SystemIntegrationErrorHandler.ts',
          ),
          DeepLinkManager: resolve(__dirname, 'electron/DeepLinkManager.ts'),
        },
        output: {
          format: 'cjs',
          entryFileNames: '[name].cjs',
          preserveModules: true,
          preserveModulesRoot: resolve(__dirname, 'electron'),
          // Output structure: dist-electron/main/SystemIntegrationErrorHandler.cjs
          // This allows lazy loading to work with require()
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
