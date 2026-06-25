/**
 * @fileoverview Brick-proof launch latch for the native key-tap (#125). A tap
 * that loads, `start()`s, then crashes/wedges the process during arming would
 * re-arm — and re-crash — on every relaunch, bricking the app with no in-app
 * recovery. This latch breaks that loop: arm a marker file BEFORE `start()`,
 * clear it a stability window after a healthy start (or on clean stop); if a
 * launch finds the marker still set from last run, the tap is started INACTIVE
 * instead of re-arming. It is a **process-stability** guard (crash/wedge during
 * arming), NOT tap-liveness — a `start()`-succeeds-but-tap-silent case clears the
 * marker normally and is handled by powerMonitor/manual re-arm, not here.
 *
 * Kept in its OWN file (not `ConfigManager`, whose `saveConfig` does temp+rename
 * WITHOUT fsync) because a launch-safety gate needs durable, fail-safe writes:
 * fsync the file AND the userData dir, and treat any read ambiguity as "armed"
 * so a corrupt/locked marker blocks rather than silently re-arming a brick loop.
 *
 * @module electron/utils/nativeTapLatch
 */

import fs from 'fs'
import path from 'path'

import { app } from 'electron'

import { log } from '../logger'

/** Marker filename under userData; its mere presence means "armed, unconfirmed". */
export const LATCH_FILENAME = 'native-tap-arming.json'

/** Absolute path to the latch marker in the per-user app data dir. */
function latchPath(): string {
  return path.join(app.getPath('userData'), LATCH_FILENAME)
}

/**
 * fsync a directory so a create/rename/unlink of one of its entries is durable
 * across a power loss — without it the rename can be lost even though the file
 * data was fsync'd. Best-effort: some filesystems reject directory fsync, which
 * must not fail the caller.
 * @param dirPath - The directory whose metadata to flush.
 */
function fsyncDir(dirPath: string): void {
  let fd: number | undefined
  try {
    fd = fs.openSync(dirPath, 'r')
    fs.fsyncSync(fd)
  } catch (error) {
    log.warn('[nativeTapLatch] directory fsync failed (non-fatal):', error)
  } finally {
    if (fd !== undefined) {
      try {
        fs.closeSync(fd)
      } catch {
        // closing a read fd after fsync — nothing actionable on failure.
      }
    }
  }
}

/**
 * Whether a prior launch armed the tap but never cleared the marker — i.e. it
 * crashed/wedged during arming. Fail-safe: a present OR unreadable marker counts
 * as set, so ambiguity blocks the re-arm rather than risking the brick loop.
 * @returns
 * - `true`: marker present (or its state can't be read) → start the tap INACTIVE
 * - `false`: no marker → safe to arm
 * @example
 * if (isNativeTapLatchSet()) startInactive() // a prior arming never confirmed
 */
export function isNativeTapLatchSet(): boolean {
  try {
    return fs.existsSync(latchPath())
  } catch (error) {
    log.warn(
      '[nativeTapLatch] latch stat failed; treating as SET (fail-safe):',
      error,
    )
    return true
  }
}

/**
 * Arm the latch DURABLY before starting the tap: temp write → fsync file →
 * atomic rename → fsync dir. Returns `false` if the marker didn't persist so the
 * caller can refuse to start a tap whose brick-guard isn't on disk.
 * @returns
 * - `true`: marker is durably on disk → safe to `start()` the tap
 * - `false`: write failed → do NOT start (no brick-guard means a freeze bricks)
 * @example
 * if (armNativeTapLatch()) uIOhook.start() // guard persisted first
 */
export function armNativeTapLatch(): boolean {
  const target = latchPath()
  const temp = `${target}.tmp`
  let fd: number | undefined
  try {
    fd = fs.openSync(temp, 'w')
    fs.writeSync(fd, JSON.stringify({ armedAt: Date.now() }))
    fs.fsyncSync(fd)
    fs.closeSync(fd)
    fd = undefined
    fs.renameSync(temp, target)
    fsyncDir(path.dirname(target))
    return true
  } catch (error) {
    log.error('[nativeTapLatch] failed to arm latch:', error)
    if (fd !== undefined) {
      try {
        fs.closeSync(fd)
      } catch {
        // best-effort cleanup of the temp fd
      }
    }
    try {
      if (fs.existsSync(temp)) fs.unlinkSync(temp)
    } catch {
      // best-effort cleanup of the temp file
    }
    return false
  }
}

/**
 * Clear the latch after a healthy start (or on clean tap stop). Idempotent — a
 * missing marker is success, not an error. Fsyncs the dir so a stale marker can't
 * survive to falsely block the next launch.
 * @example
 * setTimeout(clearNativeTapLatch, STABILITY_WINDOW_MS) // confirmed stable
 */
export function clearNativeTapLatch(): void {
  const target = latchPath()
  try {
    fs.unlinkSync(target)
    fsyncDir(path.dirname(target))
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
      log.warn('[nativeTapLatch] failed to clear latch:', error)
    }
  }
}

/**
 * The latch operations the tap engine depends on, as an INJECTABLE seam so the
 * engine unit-tests with an in-memory fake (no `electron.app` / no fs) — mirroring
 * how the engine already injects its native-module loader. `main.ts` uses the
 * default fs-backed implementation below.
 */
export interface NativeTapLatch {
  /** True when a prior launch armed but never confirmed (start the tap INACTIVE). */
  isSet(): boolean
  /** Persist the marker before `start()`; false if the write didn't land. */
  arm(): boolean
  /** Remove the marker after a healthy start / clean stop. Idempotent. */
  clear(): void
}

/** The real, fsync-durable latch backed by a marker file under userData. */
export const defaultNativeTapLatch: NativeTapLatch = {
  isSet: isNativeTapLatchSet,
  arm: armNativeTapLatch,
  clear: clearNativeTapLatch,
}
