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

import { execFile, execFileSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { promisify } from 'node:util'

import {
  DEEP_LINK_PROTOCOL,
  LAUNCH_SERVICES_OSASCRIPT_TIMEOUT_MS,
} from './constants'
import { log } from './logger'

/**
 * Unique bundle id for the unpackaged dev Electron. Deliberately distinct from
 * the packaged `com.corelive.app` so dev and prod handlers never collide, and
 * from `com.github.Electron` so other Electron projects can't hijack the scheme.
 *
 * Note the SCHEME is still shared with prod: whichever bundle claimed it last
 * owns `corelive://` OS-wide, which is why the installed app re-claims it right
 * before every OAuth handoff (see `utils/claimDefaultProtocolClient.ts`).
 */
export const DEV_BUNDLE_ID = 'com.corelive.app.dev'

/** Custom URL scheme used for deep links (mirrors electron-builder.json). */
export const DEEP_LINK_SCHEME = DEEP_LINK_PROTOCOL

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
  let patchFailed = false
  for (const step of plistBuddyCommandPlan({
    bundleId: DEV_BUNDLE_ID,
    scheme: DEEP_LINK_SCHEME,
  })) {
    try {
      runCommand(PLIST_BUDDY, ['-c', step.command, plistPath])
    } catch (error) {
      if (!step.tolerateError) {
        patchFailed = true
        log.warn(`devProtocol: PlistBuddy "${step.command}" failed:`, error)
      }
    }
  }

  // If the plist couldn't be rewritten, the identity is unchanged — re-signing,
  // refreshing LaunchServices, and logging success would all be misleading. Bail
  // honestly so the caller (and logs) reflect that the binding was NOT fixed.
  if (patchFailed) {
    return { skipped: false, reason: 'patch failed' }
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

/** Bundle id of the packaged/installed app (electron-builder.json `appId`). */
const INSTALLED_BUNDLE_ID = 'com.corelive.app'

/** What LaunchServices currently says about the scheme and the installed app. */
export interface LaunchServicesSnapshot {
  /** Bundle id of the user-level default handler, or null when none is set. */
  defaultHandler: string | null
  /** Where LaunchServices would launch {@link INSTALLED_BUNDLE_ID} from, or null when it is not installed. */
  installedAppPath: string | null
}

/** Injectable LaunchServices access so the restore decision is unit-testable
 *  without touching the real user-level handler table. Async on purpose: a
 *  blocked event loop cannot acknowledge tsx's signal relay, and tsx then
 *  SIGKILLs the dev runner mid-restore. */
export interface LaunchServicesClient {
  read(scheme: string, bundleId: string): Promise<LaunchServicesSnapshot>
  /** Resolves to the raw OSStatus of `LSSetDefaultHandlerForURLScheme` (0 = noErr). */
  setDefaultHandler(scheme: string, bundleId: string): Promise<number>
}

/** Non-blocking counterpart of {@link CommandRunner}; resolves to trimmed stdout. */
export type AsyncCommandRunner = (
  file: string,
  args: string[],
) => Promise<string>

const execFileAsync = promisify(execFile)

/** Default async runner backed by `execFile`. */
const defaultRunCommandAsync: AsyncCommandRunner = async (file, args) => {
  const { stdout } = await execFileAsync(file, args, {
    encoding: 'utf8',
    // A stalled osascript rejects instead of blocking the runner's exit.
    timeout: LAUNCH_SERVICES_OSASCRIPT_TIMEOUT_MS,
  })
  return stdout.trim()
}

// JXA passes `$()` NSStrings, which are toll-free bridged to CFStringRef.
// Plain JS strings make LSSetDefaultHandlerForURLScheme return paramErr (-50).
const READ_LAUNCH_SERVICES_JXA = `
ObjC.import('AppKit')
function run(argv) {
  const handler = ObjC.castRefToObject($.LSCopyDefaultHandlerForURLScheme($(argv[0])))
  const app = $.NSWorkspace.sharedWorkspace.URLForApplicationWithBundleIdentifier($(argv[1]))
  return JSON.stringify({
    defaultHandler: handler.isNil() ? null : handler.js,
    installedAppPath: app.isNil() ? null : app.path.js,
  })
}`

const SET_DEFAULT_HANDLER_JXA = `
ObjC.import('CoreServices')
function run(argv) {
  return String($.LSSetDefaultHandlerForURLScheme($(argv[0]), $(argv[1])))
}`

/** Accepts a string or null; anything else means the JXA output is malformed. */
function readNullableString(value: unknown, field: string): string | null {
  if (value === null || typeof value === 'string') {
    return value
  }
  throw new Error(`LaunchServices probe returned a non-string ${field}`)
}

/**
 * Parses the read-probe JSON so a malformed osascript result fails loudly
 * instead of being trusted as a snapshot.
 * @param output - Raw stdout of {@link READ_LAUNCH_SERVICES_JXA}.
 * @returns The validated snapshot; throws on any other shape.
 * @example
 * parseLaunchServicesSnapshot('{"defaultHandler":null,"installedAppPath":null}')
 * // => { defaultHandler: null, installedAppPath: null }
 */
function parseLaunchServicesSnapshot(output: string): LaunchServicesSnapshot {
  const parsed: unknown = JSON.parse(output)
  if (typeof parsed !== 'object' || parsed === null) {
    throw new Error('LaunchServices probe returned a non-object')
  }
  return {
    defaultHandler: readNullableString(
      Reflect.get(parsed, 'defaultHandler'),
      'defaultHandler',
    ),
    installedAppPath: readNullableString(
      Reflect.get(parsed, 'installedAppPath'),
      'installedAppPath',
    ),
  }
}

/**
 * Builds the default {@link LaunchServicesClient} on top of `osascript -l JavaScript`,
 * which reaches the LaunchServices C API without a Python or Swift toolchain.
 * @param runCommand - Async shell runner; defaults to `execFile`.
 * @returns A client that reads and writes the real user-level handler table.
 * @example
 * await createOsascriptLaunchServicesClient().read('corelive', 'com.corelive.app')
 * // => { defaultHandler: 'com.corelive.app.dev', installedAppPath: '/Applications/CoreLive.app' }
 */
export function createOsascriptLaunchServicesClient(
  runCommand: AsyncCommandRunner = defaultRunCommandAsync,
): LaunchServicesClient {
  const runJxa = async (script: string, args: string[]): Promise<string> =>
    runCommand('/usr/bin/osascript', [
      '-l',
      'JavaScript',
      '-e',
      script,
      ...args,
    ])

  return {
    async read(scheme, bundleId) {
      return parseLaunchServicesSnapshot(
        await runJxa(READ_LAUNCH_SERVICES_JXA, [scheme, bundleId]),
      )
    },
    async setDefaultHandler(scheme, bundleId) {
      return Number(await runJxa(SET_DEFAULT_HANDLER_JXA, [scheme, bundleId]))
    },
  }
}

export interface RestoreInstalledProtocolHandlerResult {
  restored: boolean
  reason: string
}

/**
 * Hands `corelive://` back to the installed CoreLive.app after a dev Electron exits.
 *
 * Why: every dev run claims the user-level default for the SHARED scheme under
 * {@link DEV_BUNDLE_ID}. Electron's own `before-quit` cleanup is skipped on
 * `kill -9` or a crash, so without this, deep links keep launching the bare dev
 * binary until the installed app restarts. OAuth already re-claims per handoff
 * ({@link claimDefaultProtocolClient}); this covers every other `corelive://` link.
 *
 * When: called from `electron/dev-runner.ts` after the Electron child has exited
 * (normal quit, Ctrl-C, SIGTERM, or a killed child). Dev tooling only; the
 * packaged app never runs it.
 *
 * Idempotent: once the installed app is the default, a repeat call is a no-op.
 * It never rejects, so it cannot mask the child's exit code.
 *
 * @param options.platform - OS platform (defaults to `process.platform`; inject for tests).
 * @param options.client - LaunchServices access (defaults to the osascript client).
 * @returns Resolves to `{ restored, reason }` — `restored: true` only when the default was changed.
 * @example
 * await restoreInstalledProtocolHandler() // => { restored: true, reason: 'restored to /Applications/CoreLive.app' }
 */
export async function restoreInstalledProtocolHandler(
  options: {
    platform?: NodeJS.Platform
    client?: LaunchServicesClient
  } = {},
): Promise<RestoreInstalledProtocolHandlerResult> {
  const { platform = process.platform, client } = options

  // Only macOS resolves the scheme through a per-user default bundle id.
  if (platform !== 'darwin') {
    return { restored: false, reason: 'not macOS' }
  }

  try {
    const launchServices = client ?? createOsascriptLaunchServicesClient()
    const { defaultHandler, installedAppPath } = await launchServices.read(
      DEEP_LINK_SCHEME,
      INSTALLED_BUNDLE_ID,
    )
    const handler = defaultHandler?.toLowerCase() ?? null

    if (handler === INSTALLED_BUNDLE_ID) {
      return {
        restored: false,
        reason: 'installed app already owns the scheme',
      }
    }
    // Respect an explicit choice of some other app. Unset / "None" is dev residue
    // too: Electron's removeAsDefaultProtocolClient can leave the scheme on "None".
    if (handler !== null && handler !== DEV_BUNDLE_ID && handler !== 'none') {
      return {
        restored: false,
        reason: `default handler is ${defaultHandler}, not the dev bundle`,
      }
    }
    // Nothing to hand back to: leave the dev bundle as the only handler.
    if (installedAppPath === null) {
      return { restored: false, reason: 'installed app not found' }
    }

    const status = await launchServices.setDefaultHandler(
      DEEP_LINK_SCHEME,
      INSTALLED_BUNDLE_ID,
    )
    if (status !== 0) {
      log.warn(
        `devProtocol: LSSetDefaultHandlerForURLScheme returned ${status}; ${DEEP_LINK_SCHEME}:// stays on ${defaultHandler}`,
      )
      return { restored: false, reason: `LaunchServices error ${status}` }
    }

    return { restored: true, reason: `restored to ${installedAppPath}` }
  } catch (error) {
    log.warn('devProtocol: could not restore the installed handler:', error)
    return { restored: false, reason: 'restore failed' }
  }
}
