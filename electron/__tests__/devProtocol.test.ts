import { describe, expect, it, vi } from 'vitest'

import {
  DEEP_LINK_SCHEME,
  DEV_BUNDLE_ID,
  ensureDevProtocolRegistration,
  plistBuddyCommandPlan,
} from '../devProtocol'

// The logger shells out to electron-log internals at import time in some
// environments; stub it so these pure-logic tests stay hermetic.
vi.mock('../logger', () => ({
  log: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}))

describe('plistBuddyCommandPlan', () => {
  it('sets a unique bundle id and declares the corelive URL scheme', () => {
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

  it('marks only the pre-clear Delete step as error-tolerant so a re-run is safe', () => {
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
  it('does nothing on non-macOS platforms because deep links bind by path there', () => {
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

  it('rewrites the shared com.github.Electron bundle id to a unique one on macOS', () => {
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

  it('skips work when the dev Electron is already stamped with the unique id', () => {
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

  it('skips when the Electron.app path does not exist instead of throwing', () => {
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
