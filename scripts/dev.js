#!/usr/bin/env node

import { spawn } from 'child_process'
import http from 'http'
import path from 'path'
import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

// const isDev = process.env.NODE_ENV !== 'production'
const port = process.env.PORT || 3011

/**
 * Development server script for CoreLive Electron app
 *
 * This script:
 * 1. Builds Electron code with electron-vite
 * 2. Starts the Next.js development server
 * 3. Waits for Next.js to be ready
 * 4. Starts Electron in development mode
 * 5. Handles graceful shutdown
 */

let nextProcess = null
let electronProcess = null
let buildProcess = null

// Cleanup function
function cleanup() {
  if (buildProcess) {
    buildProcess.kill('SIGTERM')
    buildProcess = null
  }

  if (electronProcess) {
    electronProcess.kill('SIGTERM')
    electronProcess = null
  }

  if (nextProcess) {
    nextProcess.kill('SIGTERM')
    nextProcess = null
  }

  process.exit(0)
}

// Handle process termination
process.on('SIGINT', cleanup)
process.on('SIGTERM', cleanup)
process.on('exit', cleanup)

// Check if server is ready
async function checkServer(_url, maxAttempts = 30, interval = 1000) {
  return new Promise((resolve, reject) => {
    let attempts = 0

    const check = () => {
      attempts++

      const testReq = http.get(`http://localhost:${port}`, (res) => {
        if (res.statusCode === 200) {
          resolve()
        } else {
          scheduleNextCheck()
        }
      })

      testReq.on('error', () => {
        scheduleNextCheck()
      })

      testReq.setTimeout(2000, () => {
        testReq.destroy()
        scheduleNextCheck()
      })
    }

    const scheduleNextCheck = () => {
      if (attempts >= maxAttempts) {
        reject(new Error(`Server not ready after ${maxAttempts} attempts`))
        return
      }

      setTimeout(check, interval)
    }

    check()
  })
}

async function startDevelopment() {
  try {
    // Build Electron code first (required for lazy loading to work)
    // eslint-disable-next-line no-console
    console.log('🔨 Building Electron code...')
    buildProcess = spawn('pnpm', ['electron:build:ts'], {
      stdio: 'inherit',
      shell: true,
      env: {
        ...process.env,
        NODE_ENV: 'development',
      },
    })

    await new Promise((resolve, reject) => {
      buildProcess.on('exit', (code) => {
        // Clear tracked reference after build completes
        buildProcess = null
        if (code !== 0 && code !== null) {
          reject(new Error(`Electron build failed with code ${code}`))
        } else {
          resolve()
        }
      })
      buildProcess.on('error', (err) => {
        buildProcess = null
        reject(err)
      })
    })

    // eslint-disable-next-line no-console
    console.log('✅ Electron build complete')

    // Start Next.js development server

    nextProcess = spawn('pnpm', ['dev'], {
      stdio: 'pipe',
      shell: true,
      env: {
        ...process.env,
        NODE_ENV: 'development',
        PORT: port.toString(),
      },
    })

    // Handle Next.js output
    nextProcess.stdout.on('data', (data) => {
      const output = data.toString()
      if (output.includes('Ready') || output.includes('compiled')) {
      }
    })

    nextProcess.stderr.on('data', (data) => {
      console.error(`📦 Next.js Error: ${data.toString().trim()}`)
    })

    nextProcess.on('exit', (code) => {
      if (code !== 0 && code !== null) {
        console.error(`📦 Next.js process exited with code ${code}`)
        cleanup()
      }
    })

    // Wait for Next.js server to be ready
    await checkServer(`http://localhost:${port}`)

    // Start Electron

    electronProcess = spawn(
      'pnpm',
      ['tsx', path.join(__dirname, '..', 'electron', 'dev-runner.ts')],
      {
        stdio: 'inherit',
        shell: true,
        env: {
          ...process.env,
          NODE_ENV: 'development',
          PLAYWRIGHT_REMOTE_DEBUGGING_PORT: '9222', // Enable remote debugging for MCP tools
        },
      },
    )

    electronProcess.on('exit', (code) => {
      if (code !== 0 && code !== null) {
        console.error(`⚡ Electron process exited with code ${code}`)
      }
      cleanup()
    })
  } catch (error) {
    console.error('❌ Failed to start development environment:', error.message)
    cleanup()
  }
}

// Start development if this script is run directly
if (import.meta.url === `file://${process.argv[1]}`) {
  startDevelopment()
}

export { startDevelopment, cleanup }
