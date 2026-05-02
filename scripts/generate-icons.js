#!/usr/bin/env node
import { execFile as execFileCb } from 'child_process'
import fs from 'fs/promises'
import path from 'path'
import { fileURLToPath } from 'url'
import { promisify } from 'util'

import sharp from 'sharp'

const execFile = promisify(execFileCb)

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

// Apple Big Sur+ macOS app icon spec
// (verified against Apple HIG + Bjango templates + iconsur).
// Artwork must occupy the centered 824×824 box of a 1024×1024 transparent PNG,
// pre-cut to a continuous-corner squircle. macOS does NOT auto-mask on Mac
// (unlike iOS), so the squircle and gutter must be baked into the source.
const BIG_SUR_CANVAS = 1024
const BIG_SUR_SAFE_AREA = 824
const BIG_SUR_PADDING = (BIG_SUR_CANVAS - BIG_SUR_SAFE_AREA) / 2 // 100

class IconGenerator {
  constructor() {
    this.outputDir = path.join(__dirname, '../build/icons')
    this.trayDir = path.join(this.outputDir, 'tray')
    // Raw photographic source (1254×1254 RGB) — the artist asset, untouched.
    this.rawAppSourceIcon = path.join(__dirname, '../build/icon-source.png')
    // Squircle mask vendored from iconsur (MIT) — 1024×1024 RGBA template
    // including the natural Big Sur drop-shadow band. dest-in compositing
    // gives us Apple-compliant rounded-rect alpha + subtle shadow in one pass.
    this.bigSurMask = path.join(__dirname, '../build/bigsur-mask.png')
    // Normalized master (1024×1024, padded + squircle-cut) is produced at
    // runtime by normalizeBigSurMaster() and consumed by every downstream
    // app/icns/favicon step. Tray pipeline ignores it (see traySourceIcon).
    this.appSourceIcon = path.join(this.outputDir, 'normalized-master.png')
    // Tray icon source: kept on the original simplified SVG so menubar
    // glyphs stay readable at 16-32px. Replacing this would degrade tray UX.
    this.traySourceIcon = path.join(__dirname, '../build/icon.svg')
  }

  async initialize() {
    // Ensure output directories exist
    await fs.mkdir(this.outputDir, { recursive: true })
    await fs.mkdir(this.trayDir, { recursive: true })
    log.warn('🎨 Icon Generator initialized')
    log.warn(`📁 Raw source : ${this.rawAppSourceIcon}`)
    log.warn(`📁 Tray source: ${this.traySourceIcon}`)
    log.warn(`📁 Output     : ${this.outputDir}`)
  }

  /**
   * Bake the raw artist asset into a 1024×1024 PNG that conforms to Apple's
   * macOS Big Sur+ app-icon template:
   *   - Artwork resized into the centered 824×824 safe area
   *   - Squircle alpha cut via the iconsur mask (continuous corners + shadow)
   *   - 100 px transparent gutter on every edge so the dock can render its
   *     own depth/lighting effects without clipping the artwork
   * macOS does not auto-mask icons (unlike iOS), so this normalization step
   * is what stops the dock from showing a raw rectangle with white margins.
   */
  async normalizeBigSurMaster() {
    log.warn('\n🎭 Normalizing source to Apple Big Sur+ icon spec...')

    // 1. Scale the artwork into the safe-area box. `cover` because the source
    //    is already a perfect square — `contain` would re-introduce padding
    //    inside the artwork, which is exactly what we just removed.
    const artwork = await sharp(this.rawAppSourceIcon)
      .resize(BIG_SUR_SAFE_AREA, BIG_SUR_SAFE_AREA, {
        kernel: sharp.kernel.lanczos3,
        fit: 'cover',
      })
      .ensureAlpha()
      .toBuffer()

    // 2. Resize the squircle mask to match the artwork box (824×824).
    //    Using the same dimensions lets dest-in clip artwork pixel-for-pixel.
    const mask = await sharp(this.bigSurMask)
      .resize(BIG_SUR_SAFE_AREA, BIG_SUR_SAFE_AREA, {
        kernel: sharp.kernel.lanczos3,
        fit: 'cover',
      })
      .toBuffer()

    // 3. Apply the squircle alpha. `dest-in` keeps the artwork color and
    //    multiplies its alpha by the mask alpha — pixels outside the
    //    squircle become fully transparent, the soft shadow band is preserved.
    const masked = await sharp(artwork)
      .composite([{ input: mask, blend: 'dest-in' }])
      .png({ quality: 100, compressionLevel: 9 })
      .toBuffer()

    // 4. Drop the masked 824 onto a 1024 transparent canvas at (100,100).
    //    This creates the Apple-spec gutter so the dock's lighting/shadow
    //    has somewhere to land without the artwork bleeding to the edge.
    await sharp({
      create: {
        width: BIG_SUR_CANVAS,
        height: BIG_SUR_CANVAS,
        channels: 4,
        background: { r: 0, g: 0, b: 0, alpha: 0 },
      },
    })
      .composite([
        { input: masked, top: BIG_SUR_PADDING, left: BIG_SUR_PADDING },
      ])
      .png({ quality: 100, compressionLevel: 9 })
      .toFile(this.appSourceIcon)

    log.warn(
      `  ✅ Normalized master → ${path.relative(process.cwd(), this.appSourceIcon)}`,
    )
    log.warn(
      `     ${BIG_SUR_CANVAS}×${BIG_SUR_CANVAS} canvas / ${BIG_SUR_SAFE_AREA}×${BIG_SUR_SAFE_AREA} safe area / ${BIG_SUR_PADDING}px gutter / iconsur squircle mask`,
    )
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
        await sharp(this.appSourceIcon)
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
          let pipeline = sharp(this.traySourceIcon).resize(size, size, {
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
        await sharp(this.appSourceIcon)
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
      await sharp(this.appSourceIcon)
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
        await sharp(this.appSourceIcon)
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

  async generateICNS() {
    log.warn('\n🍎 Generating macOS .icns bundle...')

    // iconutil is bundled with macOS only — Linux CI runners (ubuntu-latest)
    // don't have it. Skip cleanly so the test job can still validate the rest
    // of the icon pipeline; the committed icon.icns covers the macOS build job.
    if (process.platform !== 'darwin') {
      log.warn(
        `  ⏭️  Skipped (platform=${process.platform}); using committed icon.icns`,
      )
      return
    }

    // Apple iconset naming convention: pairs of @1x / @2x for each retina tier.
    // iconutil expects exactly these filenames inside a *.iconset directory.
    const iconsetEntries = [
      { name: 'icon_16x16.png', size: 16 },
      { name: 'icon_16x16@2x.png', size: 32 },
      { name: 'icon_32x32.png', size: 32 },
      { name: 'icon_32x32@2x.png', size: 64 },
      { name: 'icon_128x128.png', size: 128 },
      { name: 'icon_128x128@2x.png', size: 256 },
      { name: 'icon_256x256.png', size: 256 },
      { name: 'icon_256x256@2x.png', size: 512 },
      { name: 'icon_512x512.png', size: 512 },
      { name: 'icon_512x512@2x.png', size: 1024 },
    ]

    const iconsetDir = path.join(this.outputDir, 'icon.iconset')
    const icnsPath = path.join(this.outputDir, 'icon.icns')

    try {
      // Re-create iconset dir from scratch to avoid stale @2x leftovers
      await fs.rm(iconsetDir, { recursive: true, force: true })
      await fs.mkdir(iconsetDir, { recursive: true })

      // Render every required size directly from the high-res source so each
      // tier is sharp (vs. upscaling a pre-resized PNG which softens edges).
      for (const entry of iconsetEntries) {
        await sharp(this.appSourceIcon)
          .resize(entry.size, entry.size, {
            kernel: sharp.kernel.lanczos3,
            fit: 'contain',
            background: { r: 0, g: 0, b: 0, alpha: 0 },
          })
          .png({ quality: 100, compressionLevel: 9 })
          .toFile(path.join(iconsetDir, entry.name))
      }
      log.warn(`  ✅ Populated iconset (${iconsetEntries.length} sizes)`)

      // iconutil is a macOS-only system binary; this project is macOS-only
      // so we don't bother with a cross-platform fallback.
      await execFile('iconutil', ['-c', 'icns', '-o', icnsPath, iconsetDir])
      log.warn(`  ✅ Generated ${path.relative(process.cwd(), icnsPath)}`)

      // Clean up intermediate .iconset directory; the .icns is the artifact.
      await fs.rm(iconsetDir, { recursive: true, force: true })
    } catch (error) {
      log.error(`  ❌ Failed to generate icon.icns:`, error.message)
      throw error
    }
  }

  async generateIconManifest() {
    log.warn('\n📋 Generating icon manifest...')
    const manifest = {
      generated: new Date().toISOString(),
      sources: {
        appRaw: this.rawAppSourceIcon,
        appNormalized: this.appSourceIcon,
        bigSurMask: this.bigSurMask,
        tray: this.traySourceIcon,
      },
      bigSurSpec: {
        canvas: BIG_SUR_CANVAS,
        safeArea: BIG_SUR_SAFE_AREA,
        padding: BIG_SUR_PADDING,
      },
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
      await this.normalizeBigSurMaster()
      await this.generatePNGIcons()
      await this.generateTrayIcons()
      await this.generateFavicons()
      await this.generateAppIcons()
      await this.generateICNS()
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
