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
import path from 'path'

import {
  ensureDevProtocolRegistration,
  restoreInstalledProtocolHandler,
} from './devProtocol'
import { log } from './logger'
import { waitForDevServer } from './utils/waitForDevServer'

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
    await waitForDevServer('http://localhost:4991')
    log.info('✅ Next.js is ready')

    // macOS only: stamp the unpackaged dev Electron with a unique bundle id so
    // `corelive://` deep links (Google OAuth return leg) resolve to THIS app and
    // not an arbitrary other `com.github.Electron` copy on the machine. No-op off
    // macOS and once already patched. Never block startup if it fails.
    try {
      ensureDevProtocolRegistration({
        electronAppPath: path.join(
          process.cwd(),
          'node_modules',
          'electron',
          'dist',
          'Electron.app',
        ),
      })
    } catch (error) {
      log.warn('Dev deep-link protocol registration skipped:', error)
    }

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
          CORELIVE_DEBUG: '1', // Enable DevTools and CDP for local tooling
          CORELIVE_REMOTE_DEBUGGING_PORT: '9222',
        },
      },
    )

    // Set on the first signal or child exit; later signals become no-ops.
    let isShuttingDown = false
    // Set once the handler restore starts, so it runs at most once.
    let hasStartedRestore = false

    /**
     * Cleanup function to terminate electron process and remove listeners.
     */
    const cleanup = (): void => {
      process.removeListener('SIGINT', handleSignal)
      process.removeListener('SIGTERM', handleSignal)
      electronProcess.removeAllListeners('close')
      electronProcess.removeAllListeners('error')
    }

    /**
     * Hands `corelive://` back to the installed app, then exits. Runs only once
     * the child is gone, so a late `before-quit` cannot re-touch the default.
     * Signal listeners stay attached so a late SIGTERM cannot cut the restore short.
     *
     * @param code - Exit code for this runner process
     */
    const restoreHandlerAndExit = async (code: number): Promise<void> => {
      // The child 'close' and the signal fallback timer can both land here.
      if (hasStartedRestore) return
      hasStartedRestore = true
      isShuttingDown = true
      // Async so the event loop can still acknowledge tsx's signal relay;
      // a blocked loop gets the runner SIGKILLed mid-restore.
      const { reason } = await restoreInstalledProtocolHandler()
      log.info(`corelive:// handler after dev exit: ${reason}`)
      process.exit(code)
    }

    /**
     * Signal handler for graceful shutdown.
     *
     * @param signal - The signal received (SIGINT or SIGTERM)
     */
    const handleSignal = (signal: NodeJS.Signals): void => {
      // Ctrl-C also makes scripts/dev.js SIGTERM this runner via pnpm/tsx. Stay
      // subscribed and swallow repeats: the default action would kill the runner
      // before the child exits and the handler restore runs.
      if (isShuttingDown) return
      isShuttingDown = true
      log.info(`Received ${signal}, shutting down Electron...`)
      // Keep the 'close' listener: the restore must run after the child exits.
      electronProcess.kill(signal)
      // Give the process time to exit gracefully, then force exit
      setTimeout(() => {
        void restoreHandlerAndExit(0)
      }, 3000)
    }

    // Register signal handlers for graceful shutdown
    process.on('SIGINT', handleSignal)
    process.on('SIGTERM', handleSignal)

    // Fires for every child exit path the runner can observe, including a
    // `kill -9` of the Electron child that skips its own `before-quit` cleanup.
    electronProcess.on('close', (code) => {
      void restoreHandlerAndExit(code ?? 0)
    })

    electronProcess.on('error', (error) => {
      log.error('❌ Failed to start Electron:', error)
      cleanup()
      process.exit(1)
    })
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error)
    log.error('❌ Error starting Electron:', errorMessage)
    process.exit(1)
  }
}

startElectron()
