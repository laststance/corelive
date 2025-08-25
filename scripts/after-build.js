import crypto from 'crypto'
import fs from 'fs'
import path from 'path'

export default async function afterBuild(context) {
  const { outDir, electronPlatformName } = context

  console.log(`Post-build processing for ${electronPlatformName}...`)

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

  console.log(`Checksums written to ${checksumsPath}`)

  // Platform-specific post-processing
  switch (electronPlatformName) {
    case 'darwin':
      console.log('macOS build completed')
      break
    case 'win32':
      console.log('Windows build completed')
      break
    case 'linux':
      console.log('Linux build completed')
      break
  }
}
