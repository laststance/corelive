import { resolve } from 'path'

import { defineConfig, externalizeDepsPlugin } from 'electron-vite'

import packageJson from './package.json' with { type: 'json' }

// Declare runtime dependencies before Vite 8 normalizes the legacy plugin's options.
const dependencyNames = Object.keys(packageJson.dependencies)
const externalDependencies = [
  'electron',
  ...dependencyNames,
  new RegExp(`^(${dependencyNames.join('|')})/`),
]

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
        // Keep separately emitted manager files as runtime imports under Vite 8.
        external: [
          ...externalDependencies,
          './OAuthManager.cjs',
          './DeepLinkManager.cjs',
          './SystemTrayManager.cjs',
          './NotificationManager.cjs',
          './ShortcutManager.cjs',
          './AutoUpdater.cjs',
          './MenuManager.cjs',
          './SystemIntegrationErrorHandler.cjs',
        ],
        input: {
          index: resolve(import.meta.dirname, 'electron/main.ts'),
          // Add lazy-loaded modules as separate entry points so they're built as separate files
          SystemTrayManager: resolve(
            import.meta.dirname,
            'electron/SystemTrayManager.ts',
          ),
          NotificationManager: resolve(
            import.meta.dirname,
            'electron/NotificationManager.ts',
          ),
          ShortcutManager: resolve(
            import.meta.dirname,
            'electron/ShortcutManager.ts',
          ),
          AutoUpdater: resolve(import.meta.dirname, 'electron/AutoUpdater.ts'),
          MenuManager: resolve(import.meta.dirname, 'electron/MenuManager.ts'),
          SystemIntegrationErrorHandler: resolve(
            import.meta.dirname,
            'electron/SystemIntegrationErrorHandler.ts',
          ),
          DeepLinkManager: resolve(
            import.meta.dirname,
            'electron/DeepLinkManager.ts',
          ),
          OAuthManager: resolve(
            import.meta.dirname,
            'electron/OAuthManager.ts',
          ),
        },
        output: {
          format: 'cjs',
          exports: 'named',
          entryFileNames: '[name].cjs',
          preserveModules: true,
          preserveModulesRoot: resolve(import.meta.dirname, 'electron'),
          // Output structure: dist-electron/main/SystemIntegrationErrorHandler.cjs
          // This allows lazy loading to work with require()
        },
      },
      outDir: 'dist-electron/main',
      sourcemap: true,
    },
    resolve: {
      alias: {
        '@electron': resolve(import.meta.dirname, 'electron'),
        '@types': resolve(import.meta.dirname, 'electron/types'),
      },
    },
  },
  preload: {
    plugins: [externalizeDepsPlugin()],
    build: {
      rollupOptions: {
        external: externalDependencies,
        input: {
          preload: resolve(import.meta.dirname, 'electron/preload.ts'),
          'preload-login': resolve(
            import.meta.dirname,
            'electron/preload-login.ts',
          ),
          'preload-live-editor': resolve(
            import.meta.dirname,
            'electron/preload-live-editor.ts',
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
