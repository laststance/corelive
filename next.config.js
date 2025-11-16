import { codeInspectorPlugin } from 'code-inspector-plugin'
/** @type {import('next').NextConfig} */
const nextConfig = {
  // Electron configuration - keep images unoptimized for better compatibility
  images: {
    unoptimized: true,
  },
  // Turbopack configuration (Next.js 16+)
  // Empty config silences warnings while allowing future customization
  turbopack: {
    rules: {},
  },
  // Performance optimizations
  experimental: {
    // Disable optimizeCss for Electron builds due to critters dependency issue
    optimizeCss: !process.env.ELECTRON_BUILD,
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
    // Code inspector plugin for development
    if (dev && !isServer) {
      config.plugins.push(
        ...codeInspectorPlugin({
          bundler: 'webpack',
          hotKeys: ['altKey'],
        }),
      )
    }

    // Handle Electron environment
    if (process.env.ELECTRON_BUILD) {
      // Handle Node.js modules in Electron renderer
      config.externals = config.externals || []
      if (!isServer) {
        config.externals.push({
          electron: 'require("electron")',
        })
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
  // Output configuration for Electron
  output: process.env.ELECTRON_BUILD ? 'standalone' : undefined,
  trailingSlash: !!process.env.ELECTRON_BUILD,
  distDir: process.env.ELECTRON_BUILD ? '.next' : '.next',
}

export default nextConfig
