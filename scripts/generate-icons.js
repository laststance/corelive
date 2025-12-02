#!/usr/bin/env node
import fs from 'fs/promises'
import path from 'path'
import { fileURLToPath } from 'url'

import sharp from 'sharp'

// Simple console logger for build scripts
const log = {
  warn: (...args) => console.warn(...args),
  error: (...args) => console.error(...args),
}

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

// Icon sizes for different platforms
// Note: This project supports macOS only for desktop builds
// Windows/Linux sizes are kept for PNG generation compatibility
const ICON_SIZES = {
  // Windows ICO sizes (kept for PNG compatibility)
  windows: [16, 24, 32, 48, 64, 128, 256],
  // macOS ICNS sizes (primary platform)
  macos: [16, 32, 128, 256, 512, 1024],
  // Linux PNG sizes (kept for PNG compatibility)
  linux: [16, 24, 32, 48, 64, 128, 256, 512],
  // System tray sizes (for different DPI)
  tray: [16, 20, 24, 32],
}

// Tray icon states
const TRAY_STATES = {
  default: { suffix: '', description: 'Default tray icon' },
  active: { suffix: '-active', description: 'Active state tray icon' },
  notification: {
    suffix: '-notification',
    description: 'Notification badge tray icon',
  },
  disabled: { suffix: '-disabled', description: 'Disabled state tray icon' },
}

class IconGenerator {
  constructor() {
    this.sourceIcon = path.join(__dirname, '../build/icon.svg')
    this.outputDir = path.join(__dirname, '../build/icons')
    this.trayDir = path.join(this.outputDir, 'tray')
  }

  async initialize() {
    // Ensure output directories exist
    await fs.mkdir(this.outputDir, { recursive: true })
    await fs.mkdir(this.trayDir, { recursive: true })
    log.warn('🎨 Icon Generator initialized')
    log.warn(`📁 Source: ${this.sourceIcon}`)
    log.warn(`📁 Output: ${this.outputDir}`)
  }

  async generatePNGIcons() {
    log.warn('\n📸 Generating PNG icons...')
    const allSizes = new Set([
      ...ICON_SIZES.windows,
      ...ICON_SIZES.macos,
      ...ICON_SIZES.linux,
    ])

    for (const size of allSizes) {
      const outputPath = path.join(this.outputDir, `icon-${size}x${size}.png`)
      try {
        await sharp(this.sourceIcon)
          .resize(size, size, {
            kernel: sharp.kernel.lanczos3,
            fit: 'contain',
            background: { r: 0, g: 0, b: 0, alpha: 0 },
          })
          .png({ quality: 100, compressionLevel: 9 })
          .toFile(outputPath)
        log.warn(`  ✅ Generated ${size}x${size} PNG`)
      } catch (error) {
        log.error(`  ❌ Failed to generate ${size}x${size} PNG:`, error.message)
      }
    }
  }

  async generateTrayIcons() {
    log.warn('\n🔔 Generating tray icons...')
    for (const [state, config] of Object.entries(TRAY_STATES)) {
      for (const size of ICON_SIZES.tray) {
        const outputPath = path.join(
          this.trayDir,
          `tray-${size}x${size}${config.suffix}.png`,
        )
        try {
          let pipeline = sharp(this.sourceIcon).resize(size, size, {
            kernel: sharp.kernel.lanczos3,
            fit: 'contain',
            background: { r: 0, g: 0, b: 0, alpha: 0 },
          })

          // Apply state-specific modifications
          switch (state) {
            case 'active':
              // Make the icon slightly brighter/more saturated
              pipeline = pipeline.modulate({ brightness: 1.2, saturation: 1.1 })
              break
            case 'notification':
              // Add a red notification dot (simplified approach)
              pipeline = pipeline.composite([
                {
                  input: Buffer.from(`
                  <svg width="${size}" height="${size}">
                    <circle cx="${size - 4}" cy="4" r="3" fill="#ff4444" stroke="#ffffff" stroke-width="1"/>
                  </svg>
                `),
                  top: 0,
                  left: 0,
                },
              ])
              break
            case 'disabled':
              // Make the icon grayscale and semi-transparent
              pipeline = pipeline.grayscale().modulate({ brightness: 0.7 })
              break
          }

          await pipeline
            .png({ quality: 100, compressionLevel: 9 })
            .toFile(outputPath)
          log.warn(`  ✅ Generated ${size}x${size} tray icon (${state})`)
        } catch (error) {
          log.error(
            `  ❌ Failed to generate ${size}x${size} tray icon (${state}):`,
            error.message,
          )
        }
      }
    }
  }

  async generateFavicons() {
    log.warn('\n🌐 Generating web favicons...')
    const faviconSizes = [16, 32, 48, 64, 128, 192, 512]
    const webDir = path.join(__dirname, '../public')

    // Ensure web directory exists
    await fs.mkdir(webDir, { recursive: true })

    for (const size of faviconSizes) {
      const outputPath = path.join(webDir, `favicon-${size}x${size}.png`)
      try {
        await sharp(this.sourceIcon)
          .resize(size, size, {
            kernel: sharp.kernel.lanczos3,
            fit: 'contain',
            background: { r: 255, g: 255, b: 255, alpha: 1 },
          })
          .png({ quality: 100, compressionLevel: 9 })
          .toFile(outputPath)
        log.warn(`  ✅ Generated ${size}x${size} favicon`)
      } catch (error) {
        log.error(
          `  ❌ Failed to generate ${size}x${size} favicon:`,
          error.message,
        )
      }
    }

    // Generate standard favicon.ico (16x16)
    try {
      await sharp(this.sourceIcon)
        .resize(16, 16, {
          kernel: sharp.kernel.lanczos3,
          fit: 'contain',
          background: { r: 255, g: 255, b: 255, alpha: 1 },
        })
        .png()
        .toFile(path.join(webDir, 'favicon.ico'))
      log.warn(`  ✅ Generated favicon.ico`)
    } catch (error) {
      log.error(`  ❌ Failed to generate favicon.ico:`, error.message)
    }
  }

  async generateAppIcons() {
    log.warn('\n📱 Generating app store icons...')
    // Generate high-resolution icons for app stores
    const appIconSizes = [512, 1024]
    for (const size of appIconSizes) {
      const outputPath = path.join(
        this.outputDir,
        `app-icon-${size}x${size}.png`,
      )
      try {
        await sharp(this.sourceIcon)
          .resize(size, size, {
            kernel: sharp.kernel.lanczos3,
            fit: 'contain',
            background: { r: 0, g: 0, b: 0, alpha: 0 },
          })
          .png({ quality: 100, compressionLevel: 9 })
          .toFile(outputPath)
        log.warn(`  ✅ Generated ${size}x${size} app icon`)
      } catch (error) {
        log.error(
          `  ❌ Failed to generate ${size}x${size} app icon:`,
          error.message,
        )
      }
    }
  }

  async generateIconManifest() {
    log.warn('\n📋 Generating icon manifest...')
    const manifest = {
      generated: new Date().toISOString(),
      source: this.sourceIcon,
      icons: {
        png: {},
        tray: {},
        favicons: {},
        appIcons: {},
      },
    }

    // List all generated PNG icons
    try {
      const files = await fs.readdir(this.outputDir)
      for (const file of files) {
        if (file.startsWith('icon-') && file.endsWith('.png')) {
          const match = file.match(/icon-(\d+)x(\d+)\.png/)
          if (match) {
            const size = parseInt(match[1], 10)
            manifest.icons.png[size] = file
          }
        }
        if (file.startsWith('app-icon-') && file.endsWith('.png')) {
          const match = file.match(/app-icon-(\d+)x(\d+)\.png/)
          if (match) {
            const size = parseInt(match[1], 10)
            manifest.icons.appIcons[size] = file
          }
        }
      }

      // List tray icons
      const trayFiles = await fs.readdir(this.trayDir)
      for (const file of trayFiles) {
        if (file.startsWith('tray-') && file.endsWith('.png')) {
          const match = file.match(/tray-(\d+)x(\d+)(-\w+)?\.png/)
          if (match) {
            const size = parseInt(match[1], 10)
            const state = match[3] ? match[3].substring(1) : 'default'
            if (!manifest.icons.tray[state]) {
              manifest.icons.tray[state] = {}
            }
            manifest.icons.tray[state][size] = `tray/${file}`
          }
        }
      }

      // Save manifest
      const manifestPath = path.join(this.outputDir, 'icon-manifest.json')
      await fs.writeFile(manifestPath, JSON.stringify(manifest, null, 2))
      log.warn(`  ✅ Generated icon manifest: ${manifestPath}`)
    } catch (error) {
      log.error(`  ❌ Failed to generate icon manifest:`, error.message)
    }
  }

  async generateAll() {
    try {
      await this.initialize()
      await this.generatePNGIcons()
      await this.generateTrayIcons()
      await this.generateFavicons()
      await this.generateAppIcons()
      await this.generateIconManifest()

      log.warn('\n🎉 Icon generation completed successfully!')
      log.warn('\n📊 Summary:')
      log.warn(
        `  • PNG icons: ${ICON_SIZES.windows.length + ICON_SIZES.macos.length + ICON_SIZES.linux.length} sizes`,
      )
      log.warn(
        `  • Tray icons: ${ICON_SIZES.tray.length * Object.keys(TRAY_STATES).length} variants`,
      )
      log.warn(`  • Favicons: 8 sizes`)
      log.warn(`  • App icons: 2 high-res versions`)
    } catch (error) {
      log.error('\n❌ Icon generation failed:', error)
      process.exit(1)
    }
  }
}

// Run the icon generator
if (import.meta.url === `file://${process.argv[1]}`) {
  const generator = new IconGenerator()
  generator.generateAll()
}

export { IconGenerator }
