#!/usr/bin/env node

import { spawn } from 'child_process'
import fs from 'fs'
import path from 'path'

/**
 * Production build script for CoreLive TODO Electron app
 *
 * This script:
 * 1. Runs pre-build checks (tests, linting, type checking)
 * 2. Builds the Next.js application
 * 3. Builds the Electron application for specified platforms
 * 4. Generates checksums and build reports
 */

const platforms = {
  mac: 'macOS',
}

async function runCommand(command, args, options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      stdio: 'inherit',
      shell: true,
      ...options,
    })

    child.on('exit', (code) => {
      if (code === 0) {
        resolve()
      } else {
        reject(new Error(`Command failed with exit code ${code}`))
      }
    })

    child.on('error', (error) => {
      reject(error)
    })
  })
}

async function runPreBuildChecks() {
  try {
    // Type checking

    await runCommand('pnpm', ['typecheck'])

    // Linting

    await runCommand('pnpm', ['lint'])

    // Unit tests

    await runCommand('pnpm', ['test', '--run'])

    // Electron tests

    await runCommand('pnpm', ['test:electron', '--run'])
  } catch (error) {
    console.error('❌ Pre-build checks failed:', error.message)
    throw error
  }
}

async function buildNextJS() {
  try {
    // Set environment variables for Electron build
    const env = {
      ...process.env,
      NODE_ENV: 'production',
      ELECTRON_BUILD: 'true',
    }

    await runCommand('pnpm', ['build'], { env })
  } catch (error) {
    console.error('❌ Next.js build failed:', error.message)
    throw error
  }
}

async function buildElectron(platform = 'mac') {
  try {
    // Set optimization environment variable
    process.env.ELECTRON_BUILD = 'true'

    const buildCommands = {
      mac: ['electron:build:mac'],
    }

    const command = buildCommands[platform] || ['electron:build:mac']
    await runCommand('pnpm', command)

    // Analyze bundle size after build
    await analyzeBundleSize()
  } catch (error) {
    console.error(
      `❌ Electron build failed for ${platforms[platform] || platform}:`,
      error.message,
    )
    throw error
  }
}

async function analyzeBundleSize() {
  try {
    const distDir = path.join(process.cwd(), 'dist-electron')
    const nextDir = path.join(process.cwd(), '.next')

    if (fs.existsSync(distDir)) {
      await getFolderSize(distDir)
    }

    if (fs.existsSync(nextDir)) {
      await getFolderSize(nextDir)

      // Analyze specific Next.js chunks
      const staticDir = path.join(nextDir, 'static')
      if (fs.existsSync(staticDir)) {
        await getFolderSize(staticDir)
      }
    }
  } catch (error) {
    console.warn('⚠️ Bundle analysis failed:', error.message)
  }
}

async function getFolderSize(folderPath) {
  let totalSize = 0

  const files = fs.readdirSync(folderPath, { withFileTypes: true })

  for (const file of files) {
    const filePath = path.join(folderPath, file.name)

    if (file.isDirectory()) {
      totalSize += await getFolderSize(filePath)
    } else {
      const stats = fs.statSync(filePath)
      totalSize += stats.size
    }
  }

  return totalSize
}

function generateBuildReport() {
  const distDir = path.join(process.cwd(), 'dist-electron')

  if (!fs.existsSync(distDir)) {
    return
  }

  const files = fs.readdirSync(distDir)
  const report = {
    timestamp: new Date().toISOString(),
    platform: process.platform,
    nodeVersion: process.version,
    artifacts: [],
  }

  files.forEach((file) => {
    const filePath = path.join(distDir, file)
    const stats = fs.statSync(filePath)

    if (stats.isFile()) {
      report.artifacts.push({
        name: file,
        size: stats.size,
        sizeFormatted: formatBytes(stats.size),
        modified: stats.mtime.toISOString(),
      })
    }
  })

  // Write report
  const reportPath = path.join(distDir, 'build-report.json')
  fs.writeFileSync(reportPath, JSON.stringify(report, null, 2))

  report.artifacts.forEach((_artifact) => {})
}

function formatBytes(bytes) {
  if (bytes === 0) return '0 Bytes'
  const k = 1024
  const sizes = ['Bytes', 'KB', 'MB', 'GB']
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i]
}

async function main() {
  const platform = process.argv[2] || 'mac'
  const skipChecks = process.argv.includes('--skip-checks')
  const skipNextJS = process.argv.includes('--skip-nextjs')

  try {
    const startTime = Date.now()

    // Pre-build checks
    if (!skipChecks) {
      await runPreBuildChecks()
    }

    // Build Next.js
    if (!skipNextJS) {
      await buildNextJS()
    }

    // Build Electron
    await buildElectron(platform)

    // Generate report
    generateBuildReport()((Date.now() - startTime) / 1000).toFixed(2)
  } catch (error) {
    console.error('\n❌ Build failed:', error.message)
    process.exit(1)
  }
}

// Show help
if (process.argv.includes('--help') || process.argv.includes('-h')) {
  // eslint-disable-next-line no-console
  console.log(`
CoreLive TODO - Production Build Script

Usage: node scripts/build.js [platform] [options]

Platforms:
  mac     Build for macOS (default)

Options:
  --skip-checks    Skip pre-build checks (tests, linting)
  --skip-nextjs    Skip Next.js build (use existing build)
  --help, -h       Show this help message

Examples:
  node scripts/build.js                    # Build for macOS
  node scripts/build.js mac                # Build for macOS
  node scripts/build.js mac --skip-checks  # Build for macOS, skip checks
`)
  process.exit(0)
}

// Run if this script is executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  main()
}

export { main, runPreBuildChecks, buildNextJS, buildElectron }
