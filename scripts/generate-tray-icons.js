#!/usr/bin/env node
/**
 * @fileoverview Generate macOS Template tray icons
 *
 * macOS menu bar icons require:
 * - Template naming: ends with "Template.png" or "Template@2x.png"
 * - Monochrome: Black shapes on transparent background
 * - Sizes: 16x16 (1x) and 32x32 (@2x) for Retina
 *
 * macOS automatically inverts template images for dark mode.
 *
 * @see https://electronjs.org/docs/latest/tutorial/tray
 */

import fs from 'fs/promises'
import path from 'path'
import { fileURLToPath } from 'url'

import sharp from 'sharp'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

/**
 * Simple checkmark SVG for tray icon
 * - White (#FFFFFF) on transparent background for dark menu bars
 * - Bold, visible design for small sizes
 *
 * macOS Template images:
 * - Use white for visibility on dark backgrounds
 * - Thick strokes (2.5-3px at 18x18)
 * - Simple, recognizable shapes
 */
const createCheckmarkSVG = (size) => {
  // Thicker stroke for visibility
  const strokeWidth = Math.max(2.5, size / 6)

  return `
<svg width="${size}" height="${size}" viewBox="0 0 ${size} ${size}" xmlns="http://www.w3.org/2000/svg">
  <path 
    d="M${size * 0.15} ${size * 0.5} L${size * 0.4} ${size * 0.75} L${size * 0.85} ${size * 0.25}"
    stroke="#FFFFFF"
    stroke-width="${strokeWidth}"
    stroke-linecap="round"
    stroke-linejoin="round"
    fill="none"
  />
</svg>
`
}

/**
 * Filled square with checkmark - more visible in menu bar
 * Uses a WHITE filled background for better visibility on dark menu bars
 */
const createFilledCheckmarkSVG = (size) => {
  const strokeWidth = Math.max(2, size / 8)
  const padding = size * 0.08
  const iconSize = size - padding * 2

  return `
<svg width="${size}" height="${size}" viewBox="0 0 ${size} ${size}" xmlns="http://www.w3.org/2000/svg">
  <!-- White rounded square background -->
  <rect 
    x="${padding}" 
    y="${padding}" 
    width="${iconSize}" 
    height="${iconSize}" 
    rx="${Math.max(2, size / 5)}"
    fill="#FFFFFF"
  />
  <!-- Dark checkmark on white background for contrast -->
  <path 
    d="M${padding + iconSize * 0.2} ${padding + iconSize * 0.5} L${padding + iconSize * 0.4} ${padding + iconSize * 0.7} L${padding + iconSize * 0.8} ${padding + iconSize * 0.3}"
    stroke="#1a1a1a"
    stroke-width="${strokeWidth}"
    stroke-linecap="round"
    stroke-linejoin="round"
    fill="none"
  />
</svg>
`
}

/**
 * Notepad with checkmark SVG (more detailed version)
 * WHITE color with thicker strokes for dark menu bars
 */
const createNotepadCheckmarkSVG = (size) => {
  const padding = Math.round(size * 0.06)
  const innerSize = size - padding * 2
  // Thicker strokes for visibility
  const strokeWidth = Math.max(1.8, size / 9)

  return `
<svg width="${size}" height="${size}" viewBox="0 0 ${size} ${size}" xmlns="http://www.w3.org/2000/svg">
  <!-- Notepad body -->
  <rect 
    x="${padding}" 
    y="${padding + innerSize * 0.12}" 
    width="${innerSize}" 
    height="${innerSize * 0.88}" 
    rx="${Math.max(1.5, size / 8)}"
    fill="none"
    stroke="#FFFFFF"
    stroke-width="${strokeWidth}"
  />
  <!-- Notepad rings -->
  <line x1="${padding + innerSize * 0.25}" y1="${padding}" x2="${padding + innerSize * 0.25}" y2="${padding + innerSize * 0.2}" stroke="#FFFFFF" stroke-width="${strokeWidth}" stroke-linecap="round"/>
  <line x1="${padding + innerSize * 0.5}" y1="${padding}" x2="${padding + innerSize * 0.5}" y2="${padding + innerSize * 0.2}" stroke="#FFFFFF" stroke-width="${strokeWidth}" stroke-linecap="round"/>
  <line x1="${padding + innerSize * 0.75}" y1="${padding}" x2="${padding + innerSize * 0.75}" y2="${padding + innerSize * 0.2}" stroke="#FFFFFF" stroke-width="${strokeWidth}" stroke-linecap="round"/>
  <!-- Checkmark - thicker and more visible -->
  <path 
    d="M${padding + innerSize * 0.22} ${padding + innerSize * 0.55} L${padding + innerSize * 0.4} ${padding + innerSize * 0.73} L${padding + innerSize * 0.78} ${padding + innerSize * 0.38}"
    stroke="#FFFFFF"
    stroke-width="${Math.max(2, size / 8)}"
    stroke-linecap="round"
    stroke-linejoin="round"
    fill="none"
  />
</svg>
`
}

async function generateTrayIcons() {
  const outputDir = path.join(__dirname, '../build/icons/tray')

  // Ensure directory exists
  await fs.mkdir(outputDir, { recursive: true })

  console.warn('🎨 Generating macOS Template tray icons (18x18, WHITE)...')
  console.warn(`📁 Output: ${outputDir}`)

  // Generate 1x (18x18) template icon - 2px larger than standard 16x16
  const svg18 = createNotepadCheckmarkSVG(18)
  try {
    await sharp(Buffer.from(svg18))
      .resize(18, 18)
      .png({ compressionLevel: 9 })
      .toFile(path.join(outputDir, 'trayTemplate.png'))
    console.warn('  ✅ Generated trayTemplate.png (18x18)')
  } catch (error) {
    console.error('  ❌ Failed to generate 18x18:', error.message)
  }

  // Generate 2x (36x36) template icon for Retina
  const svg36 = createNotepadCheckmarkSVG(36)
  try {
    await sharp(Buffer.from(svg36))
      .resize(36, 36)
      .png({ compressionLevel: 9 })
      .toFile(path.join(outputDir, 'trayTemplate@2x.png'))
    console.warn('  ✅ Generated trayTemplate@2x.png (36x36)')
  } catch (error) {
    console.error('  ❌ Failed to generate 36x36:', error.message)
  }

  // Also generate simple checkmark version as backup
  const simpleCheck18 = createCheckmarkSVG(18)
  try {
    await sharp(Buffer.from(simpleCheck18))
      .resize(18, 18)
      .png({ compressionLevel: 9 })
      .toFile(path.join(outputDir, 'checkTemplate.png'))
    console.warn('  ✅ Generated checkTemplate.png (18x18)')
  } catch (error) {
    console.error('  ❌ Failed to generate simple check 18x18:', error.message)
  }

  const simpleCheck36 = createCheckmarkSVG(36)
  try {
    await sharp(Buffer.from(simpleCheck36))
      .resize(36, 36)
      .png({ compressionLevel: 9 })
      .toFile(path.join(outputDir, 'checkTemplate@2x.png'))
    console.warn('  ✅ Generated checkTemplate@2x.png (36x36)')
  } catch (error) {
    console.error('  ❌ Failed to generate simple check 36x36:', error.message)
  }

  // Generate filled checkmark (high visibility alternative)
  const filled18 = createFilledCheckmarkSVG(18)
  try {
    await sharp(Buffer.from(filled18))
      .resize(18, 18)
      .png({ compressionLevel: 9 })
      .toFile(path.join(outputDir, 'filledTemplate.png'))
    console.warn('  ✅ Generated filledTemplate.png (18x18)')
  } catch (error) {
    console.error('  ❌ Failed to generate filled 18x18:', error.message)
  }

  const filled36 = createFilledCheckmarkSVG(36)
  try {
    await sharp(Buffer.from(filled36))
      .resize(36, 36)
      .png({ compressionLevel: 9 })
      .toFile(path.join(outputDir, 'filledTemplate@2x.png'))
    console.warn('  ✅ Generated filledTemplate@2x.png (36x36)')
  } catch (error) {
    console.error('  ❌ Failed to generate filled 36x36:', error.message)
  }

  console.warn('\n🎉 Tray icon generation completed!')
  console.warn(
    '\n📝 Note: Template icons will be auto-tinted by macOS for light/dark mode.',
  )
}

// Run if executed directly
generateTrayIcons().catch(console.error)
