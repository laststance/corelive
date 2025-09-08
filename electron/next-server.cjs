const { createServer } = require('http')
const path = require('path')
const { parse } = require('url')

const next = require('next')

const { log } = require('../src/lib/logger.cjs')

class NextServerManager {
  constructor() {
    this.server = null
    this.nextApp = null
    this.port = 0
  }

  async start() {
    try {
      // Determine if we're in development or production
      const isDev = process.env.NODE_ENV === 'development'

      // Set up Next.js app
      this.nextApp = next({
        dev: isDev,
        dir: path.join(__dirname, '..'),
        quiet: false,
      })

      const handle = this.nextApp.getRequestHandler()
      await this.nextApp.prepare()

      // Create HTTP server
      this.server = createServer((req, res) => {
        const parsedUrl = parse(req.url, true)
        handle(req, res, parsedUrl)
      })

      // Start server on available port
      return new Promise((resolve, reject) => {
        this.server.listen(0, 'localhost', (err) => {
          if (err) {
            reject(err)
            return
          }

          this.port = this.server.address().port

          resolve(`http://localhost:${this.port}`)
        })
      })
    } catch (error) {
      log.error('❌ Failed to start Next.js server:', error)
      throw error
    }
  }

  async stop() {
    if (this.server) {
      return new Promise((resolve) => {
        this.server.close(() => {
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
