import crypto from 'crypto'
import fs from 'fs'
import path from 'path'

/** Generates provisional checksums for ARM64 distributions emitted by this electron-builder run.
 * @param {{ outDir: string, artifactPaths: string[] }} context - Completed electron-builder output.
 * @returns {Promise<void>} Resolves after writing the checksum manifest.
 * @example
 * await afterBuild({ outDir: 'dist', artifactPaths: ['/tmp/CoreLive-0.8.4-arm64.dmg'] })
 */
export default async function afterBuild({ outDir, artifactPaths }) {
  const checksums = {}

  for (const filePath of artifactPaths) {
    const file = path.basename(filePath)
    // Include only the ARM64 installer and updater archive, even if the output directory holds an old release.
    if (!/(?:-arm64\.dmg|-arm64-mac\.zip)$/.test(file)) continue
    const stats = fs.statSync(filePath)
    if (!stats.isFile()) continue
    checksums[file] = {
      sha256: crypto
        .createHash('sha256')
        .update(fs.readFileSync(filePath))
        .digest('hex'),
      size: stats.size,
    }
  }

  const checksumsPath = path.join(outDir, 'checksums.json')
  fs.writeFileSync(checksumsPath, JSON.stringify(checksums, null, 2))
}
