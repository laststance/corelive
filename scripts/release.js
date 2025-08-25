#!/usr/bin/env node

import { spawn, execSync } from 'child_process'
import fs from 'fs'
import path from 'path'
// import { fileURLToPath } from 'url'

// const __filename = fileURLToPath(import.meta.url)
// const __dirname = path.dirname(__filename)

/**
 * Release script for CoreLive TODO Electron app
 *
 * This script:
 * 1. Validates the release environment
 * 2. Updates version numbers
 * 3. Builds the application
 * 4. Creates git tags
 * 5. Publishes to GitHub releases
 */

async function runCommand(command, args, options = {}) {
  return new Promise((resolve, reject) => {
    console.log(`🔧 Running: ${command} ${args.join(' ')}`)

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

function getPackageVersion() {
  const packagePath = path.join(process.cwd(), 'package.json')
  const packageJson = JSON.parse(fs.readFileSync(packagePath, 'utf8'))
  return packageJson.version
}

function validateEnvironment() {
  console.log('🔍 Validating release environment...\n')

  const requiredEnvVars = ['GH_TOKEN']

  const missingVars = requiredEnvVars.filter((varName) => !process.env[varName])

  if (missingVars.length > 0) {
    console.error('❌ Missing required environment variables:')
    missingVars.forEach((varName) => {
      console.error(`   - ${varName}`)
    })
    throw new Error('Environment validation failed')
  }

  // Check git status
  try {
    const gitStatus = execSync('git status --porcelain', { encoding: 'utf8' })

    if (gitStatus.trim()) {
      console.error('❌ Git working directory is not clean:')
      console.error(gitStatus)
      throw new Error('Please commit or stash your changes before releasing')
    }
  } catch (error) {
    throw new Error('Failed to check git status: ' + error.message)
  }

  console.log('✅ Environment validation passed!\n')
}

async function updateVersion(versionType) {
  console.log(`📝 Updating version (${versionType})...\n`)

  try {
    await runCommand('npm', ['version', versionType, '--no-git-tag-version'])

    const newVersion = getPackageVersion()
    console.log(`✅ Version updated to ${newVersion}\n`)
    return newVersion
  } catch (error) {
    console.error('❌ Version update failed:', error.message)
    throw error
  }
}

async function buildForRelease() {
  console.log('🏗️  Building for release...\n')

  try {
    // Use the build script
    await runCommand('node', ['scripts/build.js', 'all'])
    console.log('✅ Release build completed!\n')
  } catch (error) {
    console.error('❌ Release build failed:', error.message)
    throw error
  }
}

async function createGitTag(version) {
  console.log(`🏷️  Creating git tag v${version}...\n`)

  try {
    await runCommand('git', ['add', '.'])
    await runCommand('git', ['commit', '-m', `chore: release v${version}`])
    await runCommand('git', ['tag', `v${version}`])

    console.log(`✅ Git tag v${version} created!\n`)
  } catch (error) {
    console.error('❌ Git tag creation failed:', error.message)
    throw error
  }
}

async function publishRelease(version) {
  console.log(`🚀 Publishing release v${version}...\n`)

  try {
    // Push commits and tags
    await runCommand('git', ['push'])
    await runCommand('git', ['push', '--tags'])

    // The GitHub Actions workflow will handle the actual release creation
    console.log(
      '✅ Release published! GitHub Actions will build and create the release.\n',
    )
  } catch (error) {
    console.error('❌ Release publishing failed:', error.message)
    throw error
  }
}

function generateReleaseNotes(version) {
  console.log('📝 Generating release notes...\n')

  try {
    // Get commits since last tag
    let commits
    try {
      commits = execSync(
        'git log $(git describe --tags --abbrev=0)..HEAD --oneline',
        { encoding: 'utf8' },
      )
    } catch {
      // If no previous tags, get all commits
      commits = execSync('git log --oneline', { encoding: 'utf8' })
    }

    const releaseNotes = {
      version: version,
      date: new Date().toISOString().split('T')[0],
      commits: commits
        .trim()
        .split('\n')
        .filter((line) => line.trim()),
    }

    // Write release notes
    const notesPath = path.join(
      process.cwd(),
      'dist-electron',
      'release-notes.json',
    )
    fs.writeFileSync(notesPath, JSON.stringify(releaseNotes, null, 2))

    console.log('📝 Release Notes:')
    console.log(`   Version: ${releaseNotes.version}`)
    console.log(`   Date: ${releaseNotes.date}`)
    console.log(`   Commits: ${releaseNotes.commits.length}`)
    console.log(`   📋 Full notes: ${notesPath}\n`)

    return releaseNotes
  } catch (error) {
    console.warn('⚠️  Failed to generate release notes:', error.message)
    return null
  }
}

async function main() {
  const versionType = process.argv[2] || 'patch'
  const skipBuild = process.argv.includes('--skip-build')
  const dryRun = process.argv.includes('--dry-run')

  console.log('🚀 CoreLive TODO - Release Script\n')
  console.log(`Version type: ${versionType}`)
  console.log(`Skip build: ${skipBuild}`)
  console.log(`Dry run: ${dryRun}\n`)

  try {
    const startTime = Date.now()

    // Validate environment
    if (!dryRun) {
      validateEnvironment()
    }

    // Update version
    const newVersion = await updateVersion(versionType)

    // Build for release
    if (!skipBuild) {
      await buildForRelease()
    }

    // Generate release notes
    generateReleaseNotes(newVersion)

    if (!dryRun) {
      // Create git tag
      await createGitTag(newVersion)

      // Publish release
      await publishRelease(newVersion)
    } else {
      console.log('🔍 Dry run completed - no changes were published\n')
    }

    const duration = ((Date.now() - startTime) / 1000).toFixed(2)
    console.log(
      `🎉 Release ${dryRun ? 'simulation' : 'process'} completed in ${duration}s!`,
    )

    if (!dryRun) {
      console.log(
        `📦 Release v${newVersion} is being processed by GitHub Actions`,
      )
      console.log('🔗 Check the Actions tab for build progress')
    }
  } catch (error) {
    console.error('\n❌ Release failed:', error.message)
    process.exit(1)
  }
}

// Show help
if (process.argv.includes('--help') || process.argv.includes('-h')) {
  console.log(`
CoreLive TODO - Release Script

Usage: node scripts/release.js [version-type] [options]

Version Types:
  patch   Increment patch version (default)
  minor   Increment minor version
  major   Increment major version

Options:
  --skip-build    Skip the build process
  --dry-run       Simulate release without publishing
  --help, -h      Show this help message

Environment Variables:
  GH_TOKEN        GitHub token for releases (required)

Examples:
  node scripts/release.js                    # Patch release
  node scripts/release.js minor              # Minor release
  node scripts/release.js major --dry-run    # Simulate major release
`)
  process.exit(0)
}

// Run if this script is executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  main()
}

export { main, validateEnvironment, updateVersion, buildForRelease }
