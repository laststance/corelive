/**
 * @fileoverview Development Runner for Electron with Next.js
 *
 * Coordinates the startup of Next.js dev server and Electron in development.
 *
 * Why this coordination is needed:
 * - Electron needs the web server running before it can load pages
 * - Next.js dev server takes time to compile and start
 * - Starting them separately is error-prone
 * - Developers want a single command to start everything
 *
 * Development workflow this enables:
 * 1. Run single command: `pnpm electron:dev`
 * 2. Next.js dev server starts (hot reload enabled)
 * 3. Wait for server to be ready
 * 4. Launch Electron pointing to dev server
 * 5. Changes to web code hot reload
 * 6. Changes to Electron code require restart
 *
 * This script assumes Next.js is started separately because:
 * - Better process management
 * - Cleaner console output
 * - Easier to restart one without the other
 *
 * @module electron/dev-runner
 */

const { spawn } = require('child_process')
const http = require('http')
const path = require('path')

const { log } = require('../src/lib/logger.cjs')

// Ensure we're in development mode
process.env.NODE_ENV = 'development'

/**
 * Checks if the Next.js development server is ready.
 *
 * The dev server needs time to:
 * - Compile TypeScript
 * - Bundle JavaScript
 * - Process CSS
 * - Start the HTTP server
 *
 * This can take 5-30 seconds depending on project size.
 *
 * @param {string} url - URL to check (http://localhost:3011)
 * @param {number} retries - Max attempts (default: 30 = 30 seconds)
 * @returns {Promise<void>} Resolves when server is ready
 */
async function checkServer(url, retries = 30) {
  return new Promise((resolve, reject) => {
    const check = (attempt) => {
      http
        .get(url, (res) => {
          if (res.statusCode === 200) {
            resolve()
          } else {
            retry(attempt)
          }
        })
        .on('error', () => {
          retry(attempt)
        })
    }

    const retry = (attempt) => {
      if (attempt < retries) {
        setTimeout(() => check(attempt + 1), 1000)
      } else {
        reject(new Error('Next.js dev server failed to start'))
      }
    }

    check(0)
  })
}

/**
 * Starts Electron after ensuring Next.js is ready.
 *
 * Development environment setup:
 * - Waits for web server availability
 * - Passes development flags to Electron
 * - Enables remote debugging for testing tools
 * - Inherits stdio for better debugging
 *
 * The startup sequence prevents common dev errors like:
 * - Electron showing blank screen (server not ready)
 * - Port conflicts
 * - Missing environment variables
 */
async function startElectron() {
  try {
    // Wait for Next.js to be fully ready
    log.info('⏳ Waiting for Next.js dev server...')
    await checkServer('http://localhost:3011')
    log.info('✅ Next.js is ready')

    // Start Electron with development configuration
    const electronProcess = spawn(
      path.join(__dirname, '..', 'node_modules', '.bin', 'electron'),
      [path.join(__dirname, 'main.cjs')],
      {
        stdio: 'inherit', // See Electron logs in console
        env: {
          ...process.env,
          NODE_ENV: 'development',
          ELECTRON_DEV_MODE: 'true', // Dev mode flag
          PLAYWRIGHT_REMOTE_DEBUGGING_PORT: '9222', // For E2E tests/MCP
        },
      },
    )

    electronProcess.on('close', (code) => {
      process.exit(code)
    })

    electronProcess.on('error', (error) => {
      log.error('❌ Failed to start Electron:', error)
      process.exit(1)
    })
  } catch (error) {
    log.error('❌ Error starting Electron:', error.message)
    process.exit(1)
  }
}

startElectron()
