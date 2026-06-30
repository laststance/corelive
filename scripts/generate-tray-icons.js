#!/usr/bin/env node
/**
 * @fileoverview Generate the macOS Template tray icons by reusing the main icon pipeline.
 */

import path from 'path'
import { fileURLToPath } from 'url'

import { generateMacTemplateTrayIcons } from './generate-icons.js'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

/**
 * Runs the standalone tray-template generator for manual refreshes and old scripts.
 * @param outputDir - Directory that receives the generated Template PNG files.
 * @returns A promise that resolves when the tray template files are current.
 * @example
 * await generateStandaloneTrayIcons('build/icons/tray')
 */
async function generateStandaloneTrayIcons(
  outputDir = path.join(__dirname, '../build/icons/tray'),
) {
  await generateMacTemplateTrayIcons(outputDir)
}

generateStandaloneTrayIcons().catch((error) => {
  console.error('Failed to generate macOS Template tray icons:', error)
  process.exit(1)
})
