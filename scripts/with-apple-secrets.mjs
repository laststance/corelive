#!/usr/bin/env node
/**
 * Inject migrated Apple notarization credentials only into commands that need them.
 * Package scripts call this before desktop packaging and DMG finalization; CI keeps its existing secrets.
 * @example node ../../scripts/with-apple-secrets.mjs node ../../scripts/electron-builder.mjs --dir
 */
import { spawn } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { constants } from 'node:os'
import { parseEnv } from 'node:util'

const keys = ['APPLE_APP_SPECIFIC_PASSWORD']
const referenceFile = new URL('../.env.apple.1password', import.meta.url)
const [command, ...args] = process.argv.slice(2)
const env = { ...process.env }
const externallyConfigured =
  env.CI === 'true' ||
  env.CI === '1' ||
  env.VERCEL === '1' ||
  Boolean(env.APPLE_KEYCHAIN_PROFILE)

if (!command) {
  console.error('Pass a command and its arguments to the secrets launcher.')
  process.exit(1)
}

// Preserve explicit values, including empty tokens used to disable uploads.
if (!externallyConfigured && keys.some((key) => env[key] === undefined)) {
  let references
  try {
    references = parseEnv(readFileSync(referenceFile, 'utf8'))
  } catch {
    console.error(
      'Configure .env.apple.1password with op:// references, or supply the required environment variables.',
    )
    process.exit(1)
  }
  for (const key of keys) {
    if (env[key] !== undefined) continue
    if (!references[key]?.startsWith('op://')) {
      console.error(`Missing 1Password reference for ${key}.`)
      process.exit(1)
    }
    env[key] = references[key]
  }
}

const useOp =
  !externallyConfigured && keys.some((key) => env[key]?.startsWith('op://'))
const child = spawn(
  useOp ? 'op' : command,
  useOp ? ['run', '--', command, ...args] : args,
  {
    env,
    stdio: 'inherit',
  },
)
// Forward terminal shutdown to the owned child so dev servers do not linger.
for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => child.kill(signal))
}
child.on('error', () => {
  console.error(
    useOp
      ? 'Unable to run op. Install 1Password CLI and enable its desktop integration.'
      : 'Unable to start the requested command.',
  )
  process.exitCode = 1
})
child.on('exit', (code, signal) => {
  process.exitCode = code ?? (signal ? 128 + constants.signals[signal] : 1)
})
