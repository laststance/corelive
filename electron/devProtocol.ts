/**
 * @fileoverview Dev-only macOS deep-link protocol registration fix.
 *
 * Why this exists:
 * On macOS, LaunchServices resolves a custom URL scheme (`corelive://`) by an
 * app's **bundle id**, not its on-disk path. Every *unpackaged* Electron shares
 * the generic bundle id `com.github.Electron`. A dev machine typically has many
 * such copies (this app's `node_modules`, plus unrelated Electron projects). So
 * `app.setAsDefaultProtocolClient('corelive')` from `pnpm electron:dev` binds the
 * scheme to the ambiguous `com.github.Electron`, and the OS later launches an
 * *arbitrary* copy (often the highest-versioned one from another project) — which
 * is the bare Electron welcome window, not our running dev app. This breaks the
 * browser→app return leg of Google OAuth (`corelive://oauth/callback?token=…`).
 *
 * When it triggers:
 * Called from `electron/dev-runner.ts` once, right before the dev Electron is
 * spawned (so the new identity is in place at process launch). No-op off macOS
 * and no-op once already patched (idempotent), so repeated `pnpm electron:dev`
 * runs stay fast. The packaged app is unaffected — it ships the unique, signed
 * bundle id `com.corelive.app`.
 *
 * What it does:
 * Rewrites the dev `Electron.app/Contents/Info.plist` to a **unique** bundle id
 * (`com.corelive.app.dev`, distinct from prod) and declares the `corelive` URL
 * scheme, ad-hoc re-signs (tolerant), and refreshes the LaunchServices record.
 * After this, `setAsDefaultProtocolClient('corelive')` registers an unambiguous
 * handler and `corelive://` resolves to *this* running dev app.
 *
 * @module electron/devProtocol
 */

import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'

import { log } from './logger'

/**
 * Unique bundle id for the unpackaged dev Electron. Deliberately distinct from
 * the packaged `com.corelive.app` so dev and prod handlers never collide, and
 * from `com.github.Electron` so other Electron projects can't hijack the scheme.
 */
export const DEV_BUNDLE_ID = 'com.corelive.app.dev'

/** Custom URL scheme used for deep links (mirrors electron-builder.json). */
export const DEEP_LINK_SCHEME = 'corelive'

/** One PlistBuddy mutation; `tolerateError` is true when re-running may have
 *  already removed/added the entry (Delete on first run has nothing to delete). */
export interface PlistBuddyStep {
  command: string
  tolerateError: boolean
}

/**
 * Builds the ordered, idempotent PlistBuddy command plan that rewrites the dev
 * Electron Info.plist to a unique bundle id and a declared URL scheme. Pure (no
 * I/O) so it can be unit-tested without a real plist. Delete-before-Add makes a
 * re-run safe even though Add fails on existing keys.
 *
 * @param options.bundleId - The unique bundle id to set.
 * @param options.scheme - The URL scheme to declare (e.g. `corelive`).
 * @returns Ordered PlistBuddy steps; the lone Delete tolerates a missing entry.
 * @example
 * plistBuddyCommandPlan({ bundleId: 'com.corelive.app.dev', scheme: 'corelive' })
 * // => [{ command: 'Set :CFBundleIdentifier com.corelive.app.dev', tolerateError: false }, ...]
 */
export function plistBuddyCommandPlan(options: {
  bundleId: string
  scheme: string
}): PlistBuddyStep[] {
  const { bundleId, scheme } = options
  return [
    { command: `Set :CFBundleIdentifier ${bundleId}`, tolerateError: false },
    // Reset the URL-types array first so re-runs don't stack duplicate entries.
    { command: 'Delete :CFBundleURLTypes', tolerateError: true },
    { command: 'Add :CFBundleURLTypes array', tolerateError: false },
    {
      command: `Add :CFBundleURLTypes:0:CFBundleURLName string ${bundleId}`,
      tolerateError: false,
    },
    {
      command: 'Add :CFBundleURLTypes:0:CFBundleURLSchemes array',
      tolerateError: false,
    },
    {
      command: `Add :CFBundleURLTypes:0:CFBundleURLSchemes:0 string ${scheme}`,
      tolerateError: false,
    },
  ]
}

/** Injectable shell runner so the orchestrator can be unit-tested without
 *  touching PlistBuddy/codesign/lsregister. Returns trimmed stdout. */
export type CommandRunner = (file: string, args: string[]) => string

/** Default runner backed by `execFileSync` (real shell-outs in dev). */
const defaultRunCommand: CommandRunner = (file, args) =>
  execFileSync(file, args, { encoding: 'utf8' }).trim()

const PLIST_BUDDY = '/usr/libexec/PlistBuddy'

/** Known `lsregister` locations across macOS versions; the canonical
 *  LaunchServices.framework path first, with the legacy shortcut as fallback. */
const LSREGISTER_CANDIDATES = [
  '/System/Library/Frameworks/CoreServices.framework/Versions/A/Frameworks/LaunchServices.framework/Versions/A/Support/lsregister',
  '/System/Library/Frameworks/CoreServices.framework/Support/lsregister',
]

/** Resolves the first `lsregister` binary that exists, or null if none do. */
function resolveLsregister(): string | null {
  return (
    LSREGISTER_CANDIDATES.find((candidate) => fs.existsSync(candidate)) ?? null
  )
}

export interface EnsureDevProtocolResult {
  skipped: boolean
  reason: string
}

/**
 * Ensures the dev Electron.app carries a unique bundle id + declared scheme so
 * macOS routes `corelive://` to it. Safe to call every dev launch: no-op off
 * macOS, no-op when the app is missing, and no-op once already patched.
 *
 * @param options.platform - OS platform (defaults to `process.platform`; inject for tests).
 * @param options.electronAppPath - Path to the dev `Electron.app` bundle.
 * @param options.runCommand - Injectable command runner (defaults to execFileSync).
 * @param options.readBundleId - Injectable reader for the current bundle id (defaults to PlistBuddy Print).
 * @returns `{ skipped, reason }` — `skipped: true` when nothing was changed.
 * @example
 * ensureDevProtocolRegistration({ platform: 'linux' }) // => { skipped: true, reason: 'not macOS' }
 */
export function ensureDevProtocolRegistration(options: {
  electronAppPath: string
  platform?: NodeJS.Platform
  runCommand?: CommandRunner
  readBundleId?: (plistPath: string) => string
}): EnsureDevProtocolResult {
  const {
    electronAppPath,
    platform = process.platform,
    runCommand = defaultRunCommand,
    readBundleId,
  } = options

  // Deep-link bundle-id collision is macOS-only; other platforms register by path.
  if (platform !== 'darwin') {
    return { skipped: true, reason: 'not macOS' }
  }

  if (!fs.existsSync(electronAppPath)) {
    return {
      skipped: true,
      reason: `Electron.app not found: ${electronAppPath}`,
    }
  }

  const plistPath = path.join(electronAppPath, 'Contents', 'Info.plist')

  const readCurrentBundleId =
    readBundleId ??
    ((plist: string): string => {
      try {
        return runCommand(PLIST_BUDDY, [
          '-c',
          'Print :CFBundleIdentifier',
          plist,
        ])
      } catch {
        return ''
      }
    })

  // Idempotent: once we've stamped the unique id, leave it (keeps launches fast).
  if (readCurrentBundleId(plistPath) === DEV_BUNDLE_ID) {
    return { skipped: true, reason: 'already patched' }
  }

  // 1. Rewrite bundle id + declare the corelive scheme.
  for (const step of plistBuddyCommandPlan({
    bundleId: DEV_BUNDLE_ID,
    scheme: DEEP_LINK_SCHEME,
  })) {
    try {
      runCommand(PLIST_BUDDY, ['-c', step.command, plistPath])
    } catch (error) {
      if (!step.tolerateError) {
        log.warn(`devProtocol: PlistBuddy "${step.command}" failed:`, error)
      }
    }
  }

  // 2. Ad-hoc re-sign so any Electron build that seals Info.plist still launches.
  //    Tolerated: this binary's signature leaves Info.plist unbound, so a failure
  //    here does not block launch — we just lose the belt-and-suspenders.
  try {
    runCommand('/usr/bin/codesign', ['--force', '--sign', '-', electronAppPath])
  } catch (error) {
    log.warn('devProtocol: ad-hoc re-sign failed (continuing):', error)
  }

  // 3. Refresh LaunchServices so the new identity + scheme are known immediately.
  //    Not fatal: the Electron main process also self-registers via
  //    setAsDefaultProtocolClient on launch, so a missing lsregister only delays
  //    the binding until first run.
  const lsregister = resolveLsregister()
  if (lsregister) {
    try {
      runCommand(lsregister, ['-f', electronAppPath])
    } catch (error) {
      log.warn('devProtocol: lsregister refresh failed (continuing):', error)
    }
  } else {
    log.warn(
      'devProtocol: lsregister not found; relying on runtime registration',
    )
  }

  log.info(
    `devProtocol: dev Electron bundle id set to ${DEV_BUNDLE_ID} for corelive:// deep links`,
  )
  return { skipped: false, reason: 'patched' }
}
