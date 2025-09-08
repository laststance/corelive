import crypto from 'crypto'
import fs from 'fs'
import path from 'path'

export default async function afterBuild(context) {
  const { outDir, electronPlatformName } = context

  // Create checksums for all built files
  const files = fs.readdirSync(outDir)
  const checksums = {}

  for (const file of files) {
    const filePath = path.join(outDir, file)
    const stats = fs.statSync(filePath)

    if (
      stats.isFile() &&
      !file.endsWith('.blockmap') &&
      !file.endsWith('.yml')
    ) {
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
      break
    case 'win32':
      break
    case 'linux':
      break
  }
}
