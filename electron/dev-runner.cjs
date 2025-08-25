const { spawn } = require('child_process')
const http = require('http')
const path = require('path')

// Set development environment
process.env.NODE_ENV = 'development'

// Function to check if Next.js dev server is running
async function checkServer(url, retries = 30) {
  return new Promise((resolve, reject) => {
    const check = (attempt) => {
      http
        .get(url, (res) => {
          if (res.statusCode === 200) {
            console.log('✅ Next.js dev server is ready')
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
        console.log(
          `⏳ Waiting for Next.js dev server... (${attempt + 1}/${retries})`,
        )
        setTimeout(() => check(attempt + 1), 1000)
      } else {
        reject(new Error('Next.js dev server failed to start'))
      }
    }

    check(0)
  })
}

// Start Electron after Next.js is ready
async function startElectron() {
  try {
    // Wait for Next.js dev server
    await checkServer('http://localhost:3000')

    console.log('🚀 Starting Electron...')

    // Start Electron
    const electronProcess = spawn(
      'electron',
      [path.join(__dirname, 'main.js')],
      {
        stdio: 'inherit',
        env: {
          ...process.env,
          NODE_ENV: 'development',
          ELECTRON_DEV_MODE: 'true', // Flag to indicate dev mode
        },
      },
    )

    electronProcess.on('close', (code) => {
      process.exit(code)
    })

    electronProcess.on('error', (error) => {
      console.error('❌ Failed to start Electron:', error)
      process.exit(1)
    })
  } catch (error) {
    console.error('❌ Error starting Electron:', error.message)
    process.exit(1)
  }
}

startElectron()
