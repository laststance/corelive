#!/usr/bin/env node

import { spawn } from 'child_process'
import { createServer } from 'http'
import path from 'path'
import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

// const isDev = process.env.NODE_ENV !== 'production'
const port = process.env.PORT || 3000

/**
 * Development server script for CoreLive TODO Electron app
 *
 * This script:
 * 1. Starts the Next.js development server
 * 2. Waits for it to be ready
 * 3. Starts Electron in development mode
 * 4. Handles graceful shutdown
 */

let nextProcess = null
let electronProcess = null

// Cleanup function
function cleanup() {
  console.log('\n🧹 Cleaning up processes...')

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

      const req = createServer().listen(0, () => {
        // const testPort = req.address().port
        req.close()

        const http = require('http')
        const testReq = http.get(`http://localhost:${port}`, (res) => {
          if (res.statusCode === 200) {
            console.log(
              `✅ Next.js server is ready at http://localhost:${port}`,
            )
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
      })
    }

    const scheduleNextCheck = () => {
      if (attempts >= maxAttempts) {
        reject(new Error(`Server not ready after ${maxAttempts} attempts`))
        return
      }

      console.log(
        `⏳ Waiting for Next.js server... (attempt ${attempts}/${maxAttempts})`,
      )
      setTimeout(check, interval)
    }

    check()
  })
}

async function startDevelopment() {
  try {
    console.log('🚀 Starting CoreLive TODO development environment...\n')

    // Start Next.js development server
    console.log('📦 Starting Next.js development server...')
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
        console.log(`📦 Next.js: ${output.trim()}`)
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
    console.log('\n⚡ Starting Electron...')
    electronProcess = spawn(
      'node',
      [path.join(__dirname, '..', 'electron', 'dev-runner.cjs')],
      {
        stdio: 'inherit',
        shell: true,
        env: {
          ...process.env,
          NODE_ENV: 'development',
          ELECTRON_DEV_SERVER_URL: `http://localhost:${port}`,
        },
      },
    )

    electronProcess.on('exit', (code) => {
      if (code !== 0 && code !== null) {
        console.error(`⚡ Electron process exited with code ${code}`)
      }
      cleanup()
    })

    console.log('\n✅ Development environment started successfully!')
    console.log(`📱 Next.js: http://localhost:${port}`)
    console.log('⚡ Electron: Running in development mode')
    console.log('\n💡 Press Ctrl+C to stop all processes\n')
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
