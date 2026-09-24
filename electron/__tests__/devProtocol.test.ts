import { beforeEach, describe, expect, test, vi } from 'vitest'

import {
  createOsascriptLaunchServicesClient,
  DEEP_LINK_SCHEME,
  DEV_BUNDLE_ID,
  ensureDevProtocolRegistration,
  plistBuddyCommandPlan,
  restoreInstalledProtocolHandler,
  type LaunchServicesClient,
  type LaunchServicesSnapshot,
} from '../devProtocol'
import { log } from '../logger'

// The logger shells out to electron-log internals at import time in some
// environments; stub it so these pure-logic tests stay hermetic.
vi.mock('../logger', () => ({
  log: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}))

describe('plistBuddyCommandPlan', () => {
  test('sets a unique bundle id and declares the corelive URL scheme', () => {
    // Arrange
    const bundleId = 'com.corelive.app.dev'
    const scheme = 'corelive'

    // Act
    const plan = plistBuddyCommandPlan({ bundleId, scheme })
    const commands = plan.map((step) => step.command)

    // Assert
    expect(commands).toEqual([
      'Set :CFBundleIdentifier com.corelive.app.dev',
      'Delete :CFBundleURLTypes',
      'Add :CFBundleURLTypes array',
      'Add :CFBundleURLTypes:0:CFBundleURLName string com.corelive.app.dev',
      'Add :CFBundleURLTypes:0:CFBundleURLSchemes array',
      'Add :CFBundleURLTypes:0:CFBundleURLSchemes:0 string corelive',
    ])
  })

  test('marks only the pre-clear Delete step as error-tolerant so a re-run is safe', () => {
    // Arrange + Act
    const plan = plistBuddyCommandPlan({
      bundleId: DEV_BUNDLE_ID,
      scheme: DEEP_LINK_SCHEME,
    })

    // Assert — the lone tolerant step is the Delete (nothing to delete on first run)
    const tolerantCommands = plan
      .filter((step) => step.tolerateError)
      .map((step) => step.command)
    expect(tolerantCommands).toEqual(['Delete :CFBundleURLTypes'])
  })
})

describe('ensureDevProtocolRegistration', () => {
  test('does nothing on non-macOS platforms because deep links bind by path there', () => {
    // Arrange
    const runCommand = vi.fn((_file: string, _args: string[]) => '')

    // Act
    const result = ensureDevProtocolRegistration({
      platform: 'linux',
      electronAppPath: '/any/Electron.app',
      runCommand,
      readBundleId: () => 'com.github.Electron',
    })

    // Assert
    expect(result).toEqual({ skipped: true, reason: 'not macOS' })
    expect(runCommand).not.toHaveBeenCalled()
  })

  test('rewrites the shared com.github.Electron bundle id to a unique one on macOS', () => {
    // Arrange — simulate the buggy starting state: generic shared bundle id
    const runCommand = vi.fn((_file: string, _args: string[]) => '')

    // Act
    const result = ensureDevProtocolRegistration({
      platform: 'darwin',
      electronAppPath: __dirname, // a real, existing directory so the fs guard passes
      runCommand,
      readBundleId: () => 'com.github.Electron',
    })

    // Assert — it patched, and the very first PlistBuddy call sets the unique id
    expect(result).toEqual({ skipped: false, reason: 'patched' })
    const plistBuddyCalls = runCommand.mock.calls.filter(
      ([file]) => file === '/usr/libexec/PlistBuddy',
    )
    expect(plistBuddyCalls[0]?.[1]).toEqual([
      '-c',
      'Set :CFBundleIdentifier com.corelive.app.dev',
      expect.stringContaining('Info.plist'),
    ])
  })

  test('reports patch failed and skips re-signing when a required PlistBuddy step throws', () => {
    // Arrange — the bundle-id Set fails (e.g. a read-only plist); without an
    // honest failure path the function would still claim success.
    const runCommand = vi.fn((_file: string, args: string[]) => {
      if (args.includes('Set :CFBundleIdentifier com.corelive.app.dev')) {
        throw new Error('Permission denied')
      }
      return ''
    })

    // Act
    const result = ensureDevProtocolRegistration({
      platform: 'darwin',
      electronAppPath: __dirname,
      runCommand,
      readBundleId: () => 'com.github.Electron',
    })

    // Assert — honest result, and no codesign attempted after the early bail
    expect(result).toEqual({ skipped: false, reason: 'patch failed' })
    const codesignCalls = runCommand.mock.calls.filter(
      ([file]) => file === '/usr/bin/codesign',
    )
    expect(codesignCalls).toHaveLength(0)
  })

  test('skips work when the dev Electron is already stamped with the unique id', () => {
    // Arrange — idempotency: a second `pnpm electron:dev` must not re-sign
    const runCommand = vi.fn((_file: string, _args: string[]) => '')

    // Act
    const result = ensureDevProtocolRegistration({
      platform: 'darwin',
      electronAppPath: __dirname,
      runCommand,
      readBundleId: () => DEV_BUNDLE_ID,
    })

    // Assert
    expect(result).toEqual({ skipped: true, reason: 'already patched' })
    expect(runCommand).not.toHaveBeenCalled()
  })

  test('skips when the Electron.app path does not exist instead of throwing', () => {
    // Arrange
    const runCommand = vi.fn((_file: string, _args: string[]) => '')

    // Act
    const result = ensureDevProtocolRegistration({
      platform: 'darwin',
      electronAppPath: '/nonexistent/path/Electron.app',
      runCommand,
      readBundleId: () => 'com.github.Electron',
    })

    // Assert
    expect(result.skipped).toBe(true)
    expect(result.reason).toContain('not found')
    expect(runCommand).not.toHaveBeenCalled()
  })
})

/**
 * Builds an in-memory LaunchServices whose default handler flips when set,
 * so a second restore observes the first one's write like the real table.
 * @param snapshot - Initial default handler + installed-app path.
 * @param setStatus - OSStatus the fake setter reports (0 = noErr).
 * @returns The fake client plus a spy on its setter.
 */
function createFakeLaunchServices(
  snapshot: LaunchServicesSnapshot,
  setStatus = 0,
): {
  client: LaunchServicesClient
  setDefaultHandler: ReturnType<typeof vi.fn>
} {
  let currentHandler = snapshot.defaultHandler
  const setDefaultHandler = vi.fn(async (_scheme: string, bundleId: string) => {
    if (setStatus === 0) {
      currentHandler = bundleId
    }
    return setStatus
  })
  return {
    client: {
      read: async () => ({
        defaultHandler: currentHandler,
        installedAppPath: snapshot.installedAppPath,
      }),
      setDefaultHandler,
    },
    setDefaultHandler,
  }
}

describe('restoreInstalledProtocolHandler', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  test('hands corelive:// back to the installed CoreLive.app when the exited dev Electron still owns it', async () => {
    // Arrange
    const { client, setDefaultHandler } = createFakeLaunchServices({
      defaultHandler: 'com.corelive.app.dev',
      installedAppPath: '/Applications/CoreLive.app',
    })

    // Act
    const result = await restoreInstalledProtocolHandler({
      platform: 'darwin',
      client,
    })

    // Assert
    expect(result).toEqual({
      restored: true,
      reason: 'restored to /Applications/CoreLive.app',
    })
    expect(setDefaultHandler).toHaveBeenCalledExactlyOnceWith(
      'corelive',
      'com.corelive.app',
    )
  })

  test('hands corelive:// back when Electron quit cleanup left the scheme on "None"', async () => {
    // Arrange — removeAsDefaultProtocolClient can fall back to the "None" handler
    const { client, setDefaultHandler } = createFakeLaunchServices({
      defaultHandler: 'None',
      installedAppPath: '/Applications/CoreLive.app',
    })

    // Act
    const result = await restoreInstalledProtocolHandler({
      platform: 'darwin',
      client,
    })

    // Assert
    expect(result.restored).toBe(true)
    expect(setDefaultHandler).toHaveBeenCalledExactlyOnceWith(
      'corelive',
      'com.corelive.app',
    )
  })

  test('hands corelive:// back when no default handler is set at all', async () => {
    // Arrange
    const { client, setDefaultHandler } = createFakeLaunchServices({
      defaultHandler: null,
      installedAppPath: '/Applications/CoreLive.app',
    })

    // Act
    const result = await restoreInstalledProtocolHandler({
      platform: 'darwin',
      client,
    })

    // Assert
    expect(result.restored).toBe(true)
    expect(setDefaultHandler).toHaveBeenCalledExactlyOnceWith(
      'corelive',
      'com.corelive.app',
    )
  })

  test('changes nothing on a second dev exit once the installed app owns the scheme again', async () => {
    // Arrange — the close handler and the 3s signal fallback can both fire
    const { client, setDefaultHandler } = createFakeLaunchServices({
      defaultHandler: 'com.corelive.app.dev',
      installedAppPath: '/Applications/CoreLive.app',
    })
    await restoreInstalledProtocolHandler({ platform: 'darwin', client })

    // Act
    const secondResult = await restoreInstalledProtocolHandler({
      platform: 'darwin',
      client,
    })

    // Assert
    expect(secondResult).toEqual({
      restored: false,
      reason: 'installed app already owns the scheme',
    })
    expect(setDefaultHandler).toHaveBeenCalledTimes(1)
  })

  test('leaves the dev bundle as the handler when CoreLive.app is not installed', async () => {
    // Arrange
    const { client, setDefaultHandler } = createFakeLaunchServices({
      defaultHandler: 'com.corelive.app.dev',
      installedAppPath: null,
    })

    // Act
    const result = await restoreInstalledProtocolHandler({
      platform: 'darwin',
      client,
    })

    // Assert
    expect(result).toEqual({
      restored: false,
      reason: 'installed app not found',
    })
    expect(setDefaultHandler).not.toHaveBeenCalled()
  })

  test('keeps a handler the user explicitly assigned to another app', async () => {
    // Arrange
    const { client, setDefaultHandler } = createFakeLaunchServices({
      defaultHandler: 'com.example.other',
      installedAppPath: '/Applications/CoreLive.app',
    })

    // Act
    const result = await restoreInstalledProtocolHandler({
      platform: 'darwin',
      client,
    })

    // Assert
    expect(result).toEqual({
      restored: false,
      reason: 'default handler is com.example.other, not the dev bundle',
    })
    expect(setDefaultHandler).not.toHaveBeenCalled()
  })

  test('does not touch LaunchServices off macOS', async () => {
    // Arrange
    const read = vi.fn()
    const setDefaultHandler = vi.fn()

    // Act
    const result = await restoreInstalledProtocolHandler({
      platform: 'linux',
      client: { read, setDefaultHandler },
    })

    // Assert
    expect(result).toEqual({ restored: false, reason: 'not macOS' })
    expect(read).not.toHaveBeenCalled()
    expect(setDefaultHandler).not.toHaveBeenCalled()
  })

  test('reports and logs a LaunchServices refusal instead of claiming the scheme was restored', async () => {
    // Arrange — paramErr, e.g. when the arguments are not CFStrings
    const { client } = createFakeLaunchServices(
      {
        defaultHandler: 'com.corelive.app.dev',
        installedAppPath: '/Applications/CoreLive.app',
      },
      -50,
    )

    // Act
    const result = await restoreInstalledProtocolHandler({
      platform: 'darwin',
      client,
    })

    // Assert
    expect(result).toEqual({
      restored: false,
      reason: 'LaunchServices error -50',
    })
    expect(log.warn).toHaveBeenCalledTimes(1)
  })

  test('never rejects when osascript fails, so the dev runner still exits with the child code', async () => {
    // Arrange
    const client: LaunchServicesClient = {
      read: async () => {
        throw new Error('osascript: execution error')
      },
      setDefaultHandler: vi.fn(),
    }

    // Act
    const result = await restoreInstalledProtocolHandler({
      platform: 'darwin',
      client,
    })

    // Assert
    expect(result).toEqual({ restored: false, reason: 'restore failed' })
    expect(log.warn).toHaveBeenCalledTimes(1)
  })
})

describe('createOsascriptLaunchServicesClient', () => {
  test('reads the default handler and the installed app through one JXA call', async () => {
    // Arrange
    const runCommand = vi.fn(
      async (_file: string, _args: string[]) =>
        '{"defaultHandler":"com.corelive.app.dev","installedAppPath":"/Applications/CoreLive.app"}',
    )
    const client = createOsascriptLaunchServicesClient(runCommand)

    // Act
    const snapshot = await client.read('corelive', 'com.corelive.app')

    // Assert
    expect(snapshot).toEqual({
      defaultHandler: 'com.corelive.app.dev',
      installedAppPath: '/Applications/CoreLive.app',
    })
    const [file, args] = runCommand.mock.calls[0] ?? []
    expect(file).toBe('/usr/bin/osascript')
    expect(args?.slice(0, 3)).toEqual(['-l', 'JavaScript', '-e'])
    expect(args?.slice(-2)).toEqual(['corelive', 'com.corelive.app'])
  })

  test('rejects a malformed probe result instead of trusting it as a snapshot', async () => {
    // Arrange
    const client = createOsascriptLaunchServicesClient(
      async () => '{"defaultHandler":42,"installedAppPath":null}',
    )

    // Act
    const readSnapshot = client.read('corelive', 'com.corelive.app')

    // Assert
    await expect(readSnapshot).rejects.toThrow(
      'LaunchServices probe returned a non-string defaultHandler',
    )
  })

  test('reports the OSStatus of the handler write as a number', async () => {
    // Arrange
    const runCommand = vi.fn(async (_file: string, _args: string[]) => '0')
    const client = createOsascriptLaunchServicesClient(runCommand)

    // Act
    const status = await client.setDefaultHandler(
      'corelive',
      'com.corelive.app',
    )

    // Assert
    expect(status).toBe(0)
    expect(runCommand.mock.calls[0]?.[1]?.slice(-2)).toEqual([
      'corelive',
      'com.corelive.app',
    ])
  })
})
