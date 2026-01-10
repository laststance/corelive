/**
 * @fileoverview Next.js Server Manager for Electron Production Builds
 *
 * Embeds a Next.js server within the Electron app for production.
 *
 * Why embed Next.js in Electron?
 * - Electron needs to load web content from somewhere
 * - In dev: External Next.js dev server (hot reload)
 * - In prod: Embedded server (self-contained app)
 *
 * Architecture benefits:
 * - No need for users to run a separate server
 * - Works offline (no external dependencies)
 * - Consistent URL structure (localhost)
 * - Better security (no remote server)
 * - Easier distribution (single app bundle)
 *
 * How it works:
 * 1. Next.js builds static files and server bundle
 * 2. Electron starts this embedded server
 * 3. BrowserWindow loads from localhost
 * 4. Server handles routing and API calls
 *
 * Alternative approaches:
 * - file:// protocol (breaks routing, security issues)
 * - Static export (loses SSR, API routes)
 * - External server (requires internet, complexity)
 *
 * @module electron/next-server
 */

const { createServer } = require('http')
const path = require('path')
const { parse } = require('url')

const next = require('next')

const { log } = require('./logger.cjs')

/**
 * Manages the embedded Next.js server for production Electron apps.
 *
 * Features:
 * - Automatic port selection (avoids conflicts)
 * - Graceful startup and shutdown
 * - Error handling and logging
 * - Development/production mode support
 *
 * The server runs on localhost with a random port to avoid
 * conflicts with other applications.
 */
class NextServerManager {
  constructor() {
    this.server = null // HTTP server instance
    this.nextApp = null // Next.js app instance
    this.port = 0 // Dynamically assigned port
  }

  /**
   * Starts the embedded Next.js server.
   *
   * Startup process:
   * 1. Initialize Next.js with correct mode
   * 2. Prepare/compile the application
   * 3. Create HTTP server
   * 4. Listen on dynamic port
   *
   * Port selection:
   * - Port 0 = OS assigns available port
   * - Avoids conflicts with other apps
   * - Electron doesn't care about port number
   *
   * @returns {Promise<string>} Server URL (e.g., http://localhost:12345)
   */
  async start() {
    try {
      // Check environment (affects optimization level)
      const isDev = process.env.NODE_ENV === 'development'

      // Initialize Next.js application
      this.nextApp = next({
        dev: isDev, // Development mode flag
        dir: path.join(__dirname, '..'), // Project root
        quiet: false, // Show compilation logs
      })

      // Get request handler and compile app
      const handle = this.nextApp.getRequestHandler()
      await this.nextApp.prepare() // This compiles the app

      // Create HTTP server
      this.server = createServer((req, res) => {
        const parsedUrl = parse(req.url, true)
        handle(req, res, parsedUrl)
      })

      /**
       * Start server with dynamic port allocation.
       *
       * Why dynamic ports?
       * - User might have other services on 3000, 8080, etc.
       * - Multiple Electron apps can run simultaneously
       * - OS knows which ports are available
       *
       * 'localhost' binding:
       * - Security: Only accessible from local machine
       * - No firewall prompts
       * - Works offline
       */
      return new Promise((resolve, reject) => {
        this.server.listen(0, 'localhost', (err) => {
          if (err) {
            reject(err)
            return
          }

          // Get the assigned port
          this.port = this.server.address().port
          log.info(`🚀 Next.js server started on port ${this.port}`)

          // Return full URL for Electron to load
          resolve(`http://localhost:${this.port}`)
        })
      })
    } catch (error) {
      log.error('❌ Failed to start Next.js server:', error)
      throw error
    }
  }

  /**
   * Gracefully shuts down the Next.js server.
   *
   * Important for:
   * - Clean app exit
   * - Releasing the port
   * - Flushing any pending requests
   * - Preventing zombie processes
   *
   * @returns {Promise<void>} Resolves when server is closed
   */
  async stop() {
    if (this.server) {
      return new Promise((resolve) => {
        this.server.close(() => {
          log.info('Next.js server stopped')
          resolve()
        })
      })
    }
  }

  getUrl() {
    return this.port ? `http://localhost:${this.port}` : null
  }
}

module.exports = { NextServerManager }
