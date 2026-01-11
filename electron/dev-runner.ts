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

import { spawn, type ChildProcess } from 'child_process'
import http from 'http'
import path from 'path'

import { log } from './logger'

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
 * @param url - URL to check (http://localhost:3011)
 * @param retries - Max attempts (default: 30 = 30 seconds)
 * @returns Promise that resolves when server is ready
 */
async function checkServer(url: string, retries = 30): Promise<void> {
  return new Promise((resolve, reject) => {
    const check = (attempt: number): void => {
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

    const retry = (attempt: number): void => {
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
async function startElectron(): Promise<void> {
  try {
    // Wait for Next.js to be fully ready
    log.info('⏳ Waiting for Next.js dev server...')
    await checkServer('http://localhost:3011')
    log.info('✅ Next.js is ready')

    // Path to compiled main process (built by electron-vite)
    // dev-runner is executed from project root, so use process.cwd()
    const mainProcessPath = path.join(
      process.cwd(),
      'dist-electron',
      'main',
      'index.cjs',
    )

    // Start Electron with development configuration
    const electronProcess: ChildProcess = spawn(
      path.join(process.cwd(), 'node_modules', '.bin', 'electron'),
      [mainProcessPath],
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
      process.exit(code ?? 0)
    })

    electronProcess.on('error', (error) => {
      log.error('❌ Failed to start Electron:', error)
      process.exit(1)
    })
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error)
    log.error('❌ Error starting Electron:', errorMessage)
    process.exit(1)
  }
}

startElectron()
