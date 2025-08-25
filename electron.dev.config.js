/**
 * Development configuration for Electron
 * This file contains development-specific settings and overrides
 */

module.exports = {
  // Development server settings
  devServer: {
    port: process.env.PORT || 3000,
    host: 'localhost',
    protocol: 'http',
  },

  // Electron development settings
  electron: {
    // Enable development tools
    devTools: true,

    // Reload on changes
    hotReload: true,

    // Development window settings
    window: {
      // Show window immediately in development
      show: true,

      // Enable web security in development (can be disabled for testing)
      webSecurity: true,

      // Development-specific window size
      width: 1200,
      height: 800,

      // Enable development menu
      autoHideMenuBar: false,
    },

    // Development-specific preload settings
    preload: {
      // Enable more verbose logging in development
      enableLogging: true,

      // Development-specific API exposure
      exposeDevTools: true,
    },
  },

  // Build settings for development builds
  build: {
    // Skip code signing in development
    skipCodeSigning: true,

    // Faster builds for development
    compression: 'store',

    // Include source maps
    sourceMaps: true,

    // Development-specific directories
    directories: {
      output: 'dist-electron-dev',
    },
  },

  // Auto-updater settings for development
  updater: {
    // Disable auto-updater in development
    enabled: false,

    // Use development update server if needed
    updateServer: 'http://localhost:3001/updates',
  },

  // Logging configuration
  logging: {
    level: 'debug',
    enableConsole: true,
    enableFile: true,
    logPath: '.logs/electron-dev.log',
  },
}
