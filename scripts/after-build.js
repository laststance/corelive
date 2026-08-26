import crypto from 'crypto'
import fs from 'fs'
import path from 'path'

/** Generates provisional checksums for publishable ZIP/DMG artifacts after electron-builder completes.
 * @param {{ outDir: string, electronPlatformName: string }} context - Completed electron-builder output context.
 * @returns {Promise<void>} Resolves after writing the checksum manifest.
 * @example
 * await afterBuild({ outDir: 'dist', electronPlatformName: 'darwin' })
 */
export default async function afterBuild(context) {
  const { outDir, electronPlatformName } = context

  // Create checksums for all built files
  const files = fs.readdirSync(outDir)
  const checksums = {}

  for (const file of files) {
    const filePath = path.join(outDir, file)
    const stats = fs.statSync(filePath)

    // Only files uploaded as installers or updater payloads belong in the manifest.
    if (stats.isFile() && (file.endsWith('.zip') || file.endsWith('.dmg'))) {
      const fileBuffer = fs.readFileSync(filePath)
      const hashSum = crypto.createHash('sha256')
      hashSum.update(fileBuffer)
      checksums[file] = {
        sha256: hashSum.digest('hex'),
        size: stats.size,
      }
    }
  }

  // Write checksums file
  const checksumsPath = path.join(outDir, 'checksums.json')
  fs.writeFileSync(checksumsPath, JSON.stringify(checksums, null, 2))

  // Platform-specific post-processing
  switch (electronPlatformName) {
    case 'darwin':
      // macOS-specific post-processing can be added here
      break
    default:
      // Only macOS is supported
      break
  }
}
