const { spawn } = require('child_process')
const path = require('path')

// Set development environment
process.env.NODE_ENV = 'development'

// Start Electron
const electronProcess = spawn('electron', [path.join(__dirname, 'main.js')], {
  stdio: 'inherit',
  env: {
    ...process.env,
    NODE_ENV: 'development',
  },
})

electronProcess.on('close', (code) => {
  process.exit(code)
})
