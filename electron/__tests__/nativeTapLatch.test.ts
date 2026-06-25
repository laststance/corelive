/**
 * @fileoverview Brick-proof launch-latch tests (#125).
 *
 * Locks the contract that the native key-tap's on-disk arming marker survives a
 * crash/wedge during arming (so a frozen tap can't re-arm and re-brick on every
 * relaunch) and that any read ambiguity is treated as "armed" (fail-safe). Guards
 * the durable arm → clear-after-stability → block-on-relaunch lifecycle the latch
 * exists to deliver, plus the corrupt/unreadable-marker fail-safe.
 *
 * Triggered when: `pnpm test:electron` (Vitest).
 *
 * @example
 *   pnpm test:electron -- nativeTapLatch
 */
import fs from 'fs'
import os from 'os'
import path from 'path'

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// A mutable holder so the hoisted electron mock resolves a fresh temp userData
// directory per test (vi.mock factories cannot close over later-declared vars).
const userDataDir = vi.hoisted(() => ({ current: '' }))

vi.mock('electron', () => ({
  app: {
    getPath: vi.fn(() => userDataDir.current),
  },
}))

// Silence the real pino logger so fail-safe warnings never spew into output.
vi.mock('../logger', () => ({
  log: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}))

// Imported after the mocks so the latch's `import { app }` is stubbed.
import {
  armNativeTapLatch,
  clearNativeTapLatch,
  defaultNativeTapLatch,
  isNativeTapLatchSet,
  LATCH_FILENAME,
} from '../utils/nativeTapLatch'

/** Absolute path to the marker the latch writes under the temp userData dir. */
function markerPath(): string {
  return path.join(userDataDir.current, LATCH_FILENAME)
}

describe('nativeTapLatch', () => {
  beforeEach(() => {
    // Arrange: isolate every test in its own temp userData directory.
    userDataDir.current = fs.mkdtempSync(
      path.join(os.tmpdir(), 'corelive-latch-'),
    )
  })

  afterEach(() => {
    fs.rmSync(userDataDir.current, { recursive: true, force: true })
    vi.restoreAllMocks()
    vi.clearAllMocks()
  })

  it('reports not-set when no prior arming left a marker', () => {
    // Act + Assert: a clean userData dir means the tap is safe to arm.
    expect(isNativeTapLatchSet()).toBe(false)
  })

  it('arms a durable marker that then reads as set', () => {
    // Act
    const didArm = armNativeTapLatch()

    // Assert: the marker persisted, so a relaunch before clear would block.
    expect(didArm).toBe(true)
    expect(fs.existsSync(markerPath())).toBe(true)
    expect(isNativeTapLatchSet()).toBe(true)
  })

  it('writes a valid JSON marker carrying the arm timestamp', () => {
    // Act
    armNativeTapLatch()

    // Assert: the marker is well-formed JSON (so a future read could inspect it).
    const parsed = JSON.parse(fs.readFileSync(markerPath(), 'utf8'))
    expect(typeof parsed.armedAt).toBe('number')
  })

  it('clears the marker after a confirmed-healthy session so the next launch is unblocked', () => {
    // Arrange
    armNativeTapLatch()
    expect(isNativeTapLatchSet()).toBe(true)

    // Act
    clearNativeTapLatch()

    // Assert
    expect(fs.existsSync(markerPath())).toBe(false)
    expect(isNativeTapLatchSet()).toBe(false)
  })

  it('treats clearing a missing marker as success (idempotent)', () => {
    // Act + Assert: clearing when nothing is armed must not throw.
    expect(() => clearNativeTapLatch()).not.toThrow()
    expect(isNativeTapLatchSet()).toBe(false)
  })

  it('blocks on a corrupt marker — presence alone means "armed, unconfirmed"', () => {
    // Arrange: a prior arming wrote garbage / was interrupted mid-write.
    fs.writeFileSync(markerPath(), 'not-json{{{')

    // Act + Assert: the latch is presence-based, so a corrupt marker still blocks.
    expect(isNativeTapLatchSet()).toBe(true)
  })

  it('treats a permission/IO stat error as SET, not absent (fail-safe over re-bricking)', () => {
    // Arrange: statSync fails with a NON-ENOENT error (e.g. permission/IO). The
    // old existsSync collapsed this to "false" (not armed) and would re-brick;
    // statSync lets us treat the ambiguity as armed instead (codex #2).
    vi.spyOn(fs, 'statSync').mockImplementation(() => {
      throw Object.assign(new Error('EACCES: permission denied'), {
        code: 'EACCES',
      })
    })

    // Act + Assert
    expect(isNativeTapLatchSet()).toBe(true)
  })

  it('rolls back and returns false when a real IO error breaks the directory fsync', () => {
    // Arrange: the temp write + atomic rename succeed, but flushing the directory
    // metadata hits a real IO error, so the rename may not be crash-durable. arm()
    // must refuse (return false) AND leave no unconfirmed marker behind (codex #1).
    let fsyncCallCount = 0
    vi.spyOn(fs, 'fsyncSync').mockImplementation(() => {
      fsyncCallCount += 1
      // 1st fsync = the temp FILE (let it pass); 2nd fsync = the DIRECTORY (fail).
      if (fsyncCallCount >= 2) {
        throw Object.assign(new Error('EIO: i/o error'), { code: 'EIO' })
      }
    })

    // Act
    const didArm = armNativeTapLatch()

    // Assert: refused to start unguarded, and the half-durable marker is gone.
    expect(didArm).toBe(false)
    expect(fs.existsSync(markerPath())).toBe(false)
  })

  it('still arms when the filesystem cannot fsync a directory (EINVAL is benign)', () => {
    // Arrange: some filesystems reject directory fsync outright — that is NOT a
    // durability failure of our write, so the lone-modifier feature must keep
    // working there: arm() still succeeds and the marker persists (codex #1).
    let fsyncCallCount = 0
    vi.spyOn(fs, 'fsyncSync').mockImplementation(() => {
      fsyncCallCount += 1
      if (fsyncCallCount >= 2) {
        throw Object.assign(new Error('EINVAL: invalid argument'), {
          code: 'EINVAL',
        })
      }
    })

    // Act
    const didArm = armNativeTapLatch()

    // Assert
    expect(didArm).toBe(true)
    expect(fs.existsSync(markerPath())).toBe(true)
  })

  it('returns false from arm when the marker write fails (refuse to start unguarded)', () => {
    // Arrange: the atomic rename into place fails, so the guard never lands.
    vi.spyOn(fs, 'renameSync').mockImplementation(() => {
      throw new Error('ENOSPC: no space')
    })

    // Act
    const didArm = armNativeTapLatch()

    // Assert: a failed arm reports false so the caller refuses to start the tap.
    expect(didArm).toBe(false)
  })

  it('exposes the fs-backed lifecycle through the default injectable latch', () => {
    // Act: drive the same arm → set → clear cycle via the injected default.
    expect(defaultNativeTapLatch.isSet()).toBe(false)
    expect(defaultNativeTapLatch.arm()).toBe(true)
    expect(defaultNativeTapLatch.isSet()).toBe(true)
    defaultNativeTapLatch.clear()

    // Assert
    expect(defaultNativeTapLatch.isSet()).toBe(false)
  })
})
