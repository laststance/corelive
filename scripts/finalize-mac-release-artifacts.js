import { execFileSync } from 'child_process'
import crypto from 'crypto'
import fs from 'fs'
import path from 'path'

import 'dotenv/config'

const projectRoot = process.cwd()
const distDir = path.join(projectRoot, 'dist')
const packageJsonPath = path.join(projectRoot, 'package.json')
const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'))
const version = packageJson.version

/**
 * Build notarytool auth args so local `.env` and CI secrets work the same way.
 * @returns {string[]}
 * @example buildNotaryArgs()
 */
function buildNotaryArgs() {
  const keychainProfile = process.env.APPLE_KEYCHAIN_PROFILE
  if (keychainProfile) {
    return ['--keychain-profile', keychainProfile]
  }

  const appleId = process.env.APPLE_ID
  const appleAppSpecificPassword = process.env.APPLE_APP_SPECIFIC_PASSWORD
  const teamId = process.env.APPLE_TEAM_ID

  if (!appleId || !appleAppSpecificPassword || !teamId) {
    throw new Error(
      'Missing notarization credentials. Set APPLE_KEYCHAIN_PROFILE or APPLE_ID / APPLE_APP_SPECIFIC_PASSWORD / APPLE_TEAM_ID.',
    )
  }

  return [
    '--apple-id',
    appleId,
    '--password',
    appleAppSpecificPassword,
    '--team-id',
    teamId,
  ]
}

/**
 * Fail fast when the build did not emit a required artifact.
 * @param {string} filePath
 * @returns {void}
 * @example assertFileExists('/tmp/CoreLive-0.8.4.dmg')
 */
function assertFileExists(filePath) {
  if (!fs.existsSync(filePath)) {
    throw new Error(`Expected artifact does not exist: ${filePath}`)
  }
}

/**
 * Run a child process with inherited stdio so release logs stay human-readable.
 * @param {string} command
 * @param {string[]} args
 * @returns {void}
 * @example runCommand('xcrun', ['stapler', 'validate', '/tmp/App.dmg'])
 */
function runCommand(command, args) {
  execFileSync(command, args, { stdio: 'inherit' })
}

/**
 * Write an informational release log without tripping the repo's no-console lint rule.
 * @param {string} message
 * @returns {void}
 * @example writeInfo('[finalize-mac] Stapling CoreLive-0.8.4.dmg...')
 */
function writeInfo(message) {
  process.stdout.write(`${message}\n`)
}

/**
 * Detect whether a DMG already has a stapled ticket so retries stay idempotent.
 * @param {string} filePath
 * @returns {boolean}
 * @example hasStapledTicket('/tmp/CoreLive-0.8.4.dmg')
 */
function hasStapledTicket(filePath) {
  try {
    execFileSync('xcrun', ['stapler', 'validate', filePath], {
      stdio: 'pipe',
    })
    return true
  } catch {
    return false
  }
}

/**
 * Return a file's SHA-512 as base64 for `latest-mac.yml`.
 * @param {string} filePath
 * @returns {string}
 * @example getSha512Base64('/tmp/CoreLive-0.8.4-mac.zip')
 */
function getSha512Base64(filePath) {
  return crypto
    .createHash('sha512')
    .update(fs.readFileSync(filePath))
    .digest('base64')
}

/**
 * Return a file's SHA-256 as hex for `checksums.json`.
 * @param {string} filePath
 * @returns {string}
 * @example getSha256Hex('/tmp/CoreLive-0.8.4.dmg')
 */
function getSha256Hex(filePath) {
  return crypto
    .createHash('sha256')
    .update(fs.readFileSync(filePath))
    .digest('hex')
}

/**
 * Return the file size in bytes so metadata stays aligned with final artifacts.
 * @param {string} filePath
 * @returns {number}
 * @example getFileSize('/tmp/CoreLive-0.8.4-arm64.dmg')
 */
function getFileSize(filePath) {
  return fs.statSync(filePath).size
}

/**
 * Notarize, staple, and assess one DMG so manual downloads satisfy Gatekeeper.
 * @param {string} filePath
 * @param {string[]} notaryArgs
 * @returns {void}
 * @example finalizeDmg('/tmp/CoreLive-0.8.4.dmg', buildNotaryArgs())
 */
function finalizeDmg(filePath, notaryArgs) {
  if (hasStapledTicket(filePath)) {
    writeInfo(
      `[finalize-mac] Skipping ${path.basename(filePath)} because a stapled ticket is already present.`,
    )
    return
  }

  writeInfo(`\n[finalize-mac] Notarizing ${path.basename(filePath)}...`)
  runCommand('xcrun', [
    'notarytool',
    'submit',
    filePath,
    ...notaryArgs,
    '--wait',
    '--output-format',
    'json',
  ])

  writeInfo(`[finalize-mac] Stapling ${path.basename(filePath)}...`)
  runCommand('xcrun', ['stapler', 'staple', filePath])

  writeInfo(
    `[finalize-mac] Validating staple for ${path.basename(filePath)}...`,
  )
  runCommand('xcrun', ['stapler', 'validate', filePath])
}

/**
 * Delete DMG blockmaps because stapling mutates the DMG bytes after blockmap generation.
 * @param {string[]} dmgPaths
 * @returns {void}
 * @example removeDmgBlockmaps(['/tmp/CoreLive-0.8.4.dmg'])
 */
function removeDmgBlockmaps(dmgPaths) {
  for (const dmgPath of dmgPaths) {
    const blockmapPath = `${dmgPath}.blockmap`
    if (fs.existsSync(blockmapPath)) {
      fs.unlinkSync(blockmapPath)
    }
  }
}

/**
 * Rewrite `latest-mac.yml` so ZIP + DMG metadata reflects the post-staple bytes.
 * @param {string[]} artifactPaths
 * @returns {void}
 * @example rewriteLatestMacYaml(['/tmp/CoreLive-0.8.4-mac.zip'])
 */
function rewriteLatestMacYaml(artifactPaths) {
  const latestMacPath = path.join(distDir, 'latest-mac.yml')
  const files = artifactPaths.map((artifactPath) => ({
    name: path.basename(artifactPath),
    sha512: getSha512Base64(artifactPath),
    size: getFileSize(artifactPath),
  }))

  const primaryZip =
    files.find((file) => file.name === `CoreLive-${version}-mac.zip`) ??
    files[0]

  const yaml = [
    `version: ${version}`,
    'files:',
    ...files.flatMap((file) => [
      `  - url: ${file.name}`,
      `    sha512: ${file.sha512}`,
      `    size: ${file.size}`,
    ]),
    `path: ${primaryZip.name}`,
    `sha512: ${primaryZip.sha512}`,
    `releaseDate: '${new Date().toISOString()}'`,
    '',
  ].join('\n')

  fs.writeFileSync(latestMacPath, yaml)
}

/**
 * Rewrite `checksums.json` after stapling so manual-download hashes stay truthful.
 * @returns {void}
 * @example rewriteChecksumsJson()
 */
function rewriteChecksumsJson() {
  const checksums = {}

  for (const file of fs.readdirSync(distDir)) {
    const filePath = path.join(distDir, file)
    const stats = fs.statSync(filePath)

    if (
      stats.isFile() &&
      !file.endsWith('.blockmap') &&
      !file.endsWith('.yml')
    ) {
      checksums[file] = {
        sha256: getSha256Hex(filePath),
        size: stats.size,
      }
    }
  }

  fs.writeFileSync(
    path.join(distDir, 'checksums.json'),
    JSON.stringify(checksums, null, 2),
  )
}

/**
 * Finalize the macOS release artifacts after electron-builder emits ZIP/DMG files.
 * @returns {void}
 * @example main()
 */
function main() {
  if (process.platform !== 'darwin') {
    writeInfo(
      '[finalize-mac] Skipping: only macOS release artifacts need DMG notarization.',
    )
    return
  }

  const notaryArgs = buildNotaryArgs()
  const x64DmgPath = path.join(distDir, `CoreLive-${version}.dmg`)
  const arm64DmgPath = path.join(distDir, `CoreLive-${version}-arm64.dmg`)
  const x64ZipPath = path.join(distDir, `CoreLive-${version}-mac.zip`)
  const arm64ZipPath = path.join(distDir, `CoreLive-${version}-arm64-mac.zip`)
  const dmgPaths = [x64DmgPath, arm64DmgPath]
  const releaseArtifactPaths = [
    x64ZipPath,
    arm64ZipPath,
    x64DmgPath,
    arm64DmgPath,
  ]

  for (const artifactPath of releaseArtifactPaths) {
    assertFileExists(artifactPath)
  }

  for (const dmgPath of dmgPaths) {
    finalizeDmg(dmgPath, notaryArgs)
  }

  removeDmgBlockmaps(dmgPaths)
  rewriteLatestMacYaml(releaseArtifactPaths)
  rewriteChecksumsJson()

  writeInfo(
    '\n[finalize-mac] Finalized signed + notarized macOS release artifacts.',
  )
}

main()
