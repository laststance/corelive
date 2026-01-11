import { codeInspectorPlugin } from 'code-inspector-plugin'

/** @type {import('next').NextConfig} */
const nextConfig = {
  // Electron configuration - keep images unoptimized for better compatibility
  images: {
    unoptimized: true,
  },
  // Turbopack configuration (Next.js 16+)
  // code-inspector-plugin enables Alt+click to jump to source code in IDE
  turbopack: {
    rules: codeInspectorPlugin({
      bundler: 'turbopack',
      hotKeys: ['altKey'],
    }),
  },
  // Performance optimizations
  experimental: {
    optimizeCss: true,
    optimizePackageImports: [
      '@radix-ui/react-accordion',
      '@radix-ui/react-alert-dialog',
      '@radix-ui/react-avatar',
      '@radix-ui/react-checkbox',
      '@radix-ui/react-dialog',
      '@radix-ui/react-dropdown-menu',
      '@radix-ui/react-popover',
      '@radix-ui/react-select',
      '@radix-ui/react-tabs',
      'lucide-react',
    ],
  },
  // Configure webpack for Electron environment and performance
  webpack: (config, { isServer, dev }) => {
    // Externalize Prisma packages for client-side bundles (server-only)
    if (!isServer) {
      const originalExternals = config.externals || []
      config.externals = [
        ...(Array.isArray(originalExternals)
          ? originalExternals
          : [originalExternals]),
        ({ request }, callback) => {
          if (
            request === '@prisma/client' ||
            request === '@prisma/adapter-pg' ||
            request === 'dotenv' ||
            request?.startsWith('@prisma/')
          ) {
            return callback(null, `commonjs ${request}`)
          }
          callback()
        },
      ]
    }

    // Code inspector plugin for development
    if (dev && !isServer) {
      const plugin = codeInspectorPlugin({
        bundler: 'webpack',
        hotKeys: ['altKey'],
      })
      if (plugin) {
        if (Array.isArray(plugin)) {
          config.plugins.push(...plugin)
        } else {
          config.plugins.push(plugin)
        }
      } else {
        console.error('Code inspector plugin not found')
      }
    }

    // Performance optimizations for production
    if (!dev) {
      // Enable tree shaking for better bundle size
      config.optimization = {
        ...config.optimization,
        usedExports: true,
        sideEffects: false,
      }

      // Optimize chunks for better loading
      config.optimization.splitChunks = {
        ...config.optimization.splitChunks,
        chunks: 'all',
        cacheGroups: {
          ...config.optimization.splitChunks.cacheGroups,
          // Separate vendor chunks for better caching
          vendor: {
            test: /[\\/]node_modules[\\/]/,
            name: 'vendors',
            chunks: 'all',
            priority: 10,
          },
          // Separate UI components
          ui: {
            test: /[\\/]node_modules[\\/]@radix-ui[\\/]/,
            name: 'ui-components',
            chunks: 'all',
            priority: 20,
          },
          // Separate React chunks
          react: {
            test: /[\\/]node_modules[\\/](react|react-dom)[\\/]/,
            name: 'react',
            chunks: 'all',
            priority: 30,
          },
        },
      }
    }

    // Optimize module resolution
    config.resolve.alias = {
      ...config.resolve.alias,
    }

    return config
  },
}

export default nextConfig
