/**
 * @fileoverview Plays the bundled shortcut-opening cue from Electron's main process.
 *
 * Global shortcuts originate outside a renderer gesture, so Web Audio can be
 * blocked by Chromium autoplay policy. CoreLive is macOS-only; invoking the
 * system `afplay` binary keeps this tiny cue reliable in dev and packaged apps.
 *
 * @module electron/ShortcutOpenSoundPlayer
 */

import { spawn, type ChildProcess } from 'node:child_process'
import { existsSync } from 'node:fs'
import path from 'node:path'

import { app } from 'electron'

import {
  DEFAULT_SHORTCUT_OPEN_SOUND_SELECTION,
  MACOS_AUDIO_PLAYER_PATH,
  SHORTCUT_OPEN_SOUND_ASSET_DIRECTORY,
  SHORTCUT_OPEN_SOUND_CUES,
  SHORTCUT_OPEN_SOUND_VOLUME_RATIO,
  type ShortcutOpenSoundCueId,
  type ShortcutOpenSoundSelection,
} from './constants'
import { log } from './logger'

/** Request passed to the injectable process launcher. */
export interface ShortcutOpenSoundLaunchRequest {
  executablePath: string
  arguments: string[]
}

/** Minimal native-process lifecycle needed to prevent overlapping shortcut cues. */
export interface ShortcutOpenSoundProcess {
  stop(): void
  onSettled(callback: () => void): void
}

/** Injectable native boundaries keep path and process behavior deterministic in tests. */
interface ShortcutOpenSoundPlayerDependencies {
  fileExists: (assetPath: string) => boolean
  launchProcess: (
    request: ShortcutOpenSoundLaunchRequest,
  ) => ShortcutOpenSoundProcess
  platform: NodeJS.Platform
  random: () => number
  resolveAssetPath: (filename: string) => string
}

/** Playback boundary injected into ShortcutManager so shortcut routing stays testable. */
export interface ShortcutOpenSoundController {
  play(selection?: ShortcutOpenSoundSelection): void
  cleanup(): void
}

/**
 * Wraps an `afplay` child process with the two lifecycle operations the player needs.
 * @param childProcess - Spawned macOS audio process.
 * @returns A stoppable process that reports its first exit or error.
 * @example
 * createShortcutOpenSoundProcess(spawn('/usr/bin/afplay', ['cue.mp3']))
 */
function createShortcutOpenSoundProcess(
  childProcess: ChildProcess,
): ShortcutOpenSoundProcess {
  let hasSettled = false
  let settleCallback: (() => void) | null = null

  // Subscribe immediately so a very short cue cannot exit before the player attaches.
  const settleOnce = (): void => {
    if (hasSettled) return
    hasSettled = true
    childProcess.removeListener('exit', settleOnce)
    childProcess.removeListener('error', settleOnce)
    const callback = settleCallback
    settleCallback = null
    callback?.()
  }
  childProcess.once('exit', settleOnce)
  childProcess.once('error', settleOnce)

  return {
    stop: (): void => {
      // A settled cue needs no signal; an active cue is cut before replay.
      if (!childProcess.killed) childProcess.kill()
    },
    onSettled: (callback): void => {
      // Replay immediately when native settlement beat this lifecycle subscription.
      if (hasSettled) {
        callback()
        return
      }
      settleCallback = callback
    },
  }
}

/**
 * Launches one detached macOS audio process for a shortcut cue.
 * @param request - Executable and arguments selected by the player.
 * @returns A small lifecycle adapter around the spawned child.
 * @example
 * launchShortcutOpenSoundProcess({ executablePath: '/usr/bin/afplay', arguments: ['cue.mp3'] })
 */
function launchShortcutOpenSoundProcess(
  request: ShortcutOpenSoundLaunchRequest,
): ShortcutOpenSoundProcess {
  const childProcess = spawn(request.executablePath, request.arguments, {
    stdio: 'ignore',
    windowsHide: true,
  })
  const soundProcess = createShortcutOpenSoundProcess(childProcess)
  childProcess.unref()
  return soundProcess
}

/**
 * Resolves one registered cue from source in dev and extraResources when packaged.
 * @param filename - Registry-backed MP3 filename.
 * @returns Absolute path to the bundled MP3.
 * @example
 * resolveShortcutOpenSoundAssetPath('01-balanced-deep-thock.mp3')
 */
function resolveShortcutOpenSoundAssetPath(filename: string): string {
  const publicDirectory = app.isPackaged
    ? path.join(process.resourcesPath, 'public')
    : path.join(app.getAppPath(), 'public')

  return path.join(
    publicDirectory,
    'sounds',
    SHORTCUT_OPEN_SOUND_ASSET_DIRECTORY,
    filename,
  )
}

/**
 * Creates lazy-safe default native dependencies without resolving Electron paths at import time.
 * @returns Production file, process, platform, and path adapters.
 * @example
 * createDefaultDependencies()
 */
function createDefaultDependencies(): ShortcutOpenSoundPlayerDependencies {
  return {
    fileExists: existsSync,
    launchProcess: launchShortcutOpenSoundProcess,
    platform: process.platform,
    random: Math.random,
    resolveAssetPath: resolveShortcutOpenSoundAssetPath,
  }
}

/**
 * Plays a selected shortcut cue, waiting for an earlier native process to stop so audio never layers.
 * @example
 * const player = new ShortcutOpenSoundPlayer()
 * player.play()
 */
export class ShortcutOpenSoundPlayer implements ShortcutOpenSoundController {
  private readonly dependencies: ShortcutOpenSoundPlayerDependencies

  private activeProcess: ShortcutOpenSoundProcess | null = null

  /** Coalesces rapid shortcut presses while retaining the most recent requested choice. */
  private pendingSelection: ShortcutOpenSoundSelection | null = null

  /** Prevents repeated stop signals while the current native process is settling. */
  private isStopPending = false

  /** Last successfully launched cue, excluded from the next shuffled choice. */
  private lastPlayedCueId: ShortcutOpenSoundCueId | null = null

  /**
   * Creates a player with optionally replaced native boundaries for deterministic tests.
   * @param dependencyOverrides - File, process, platform, or asset-path adapters to replace.
   * @example
   * new ShortcutOpenSoundPlayer({ platform: 'darwin' })
   */
  constructor(
    dependencyOverrides: Partial<ShortcutOpenSoundPlayerDependencies> = {},
  ) {
    this.dependencies = {
      ...createDefaultDependencies(),
      ...dependencyOverrides,
    }
  }

  /**
   * Starts the selected cue on macOS and silently degrades if its asset or process is unavailable.
   * @param selection - Fixed cue id or the default shuffled rotation.
   * @returns Nothing.
   * @example
   * player.play('balanced-deep-thock')
   */
  play(
    selection: ShortcutOpenSoundSelection = DEFAULT_SHORTCUT_OPEN_SOUND_SELECTION,
  ): void {
    if (this.dependencies.platform !== 'darwin') return

    if (this.activeProcess) {
      this.pendingSelection = selection

      // Wait for native settlement before replacing the cue; SIGTERM is asynchronous.
      if (!this.isStopPending) {
        this.isStopPending = true
        try {
          this.activeProcess.stop()
        } catch (error) {
          log.warn('Shortcut opening sound could not stop before replay', error)
        }
      }
      return
    }

    this.launchCue(selection)
  }

  /**
   * Launches one cue and replays a coalesced request only after native settlement.
   * @param selection - Fixed cue id or the shuffled rotation to resolve.
   * @returns Nothing.
   * @example
   * this.launchCue('balanced-deep-thock')
   */
  private launchCue(selection: ShortcutOpenSoundSelection): void {
    const selectedCue = this.selectCue(selection)
    if (!selectedCue) {
      log.warn('Shortcut opening sound selection is unavailable', { selection })
      return
    }

    const assetPath = this.dependencies.resolveAssetPath(selectedCue.filename)
    if (!this.dependencies.fileExists(assetPath)) {
      log.warn('Shortcut opening sound asset is unavailable', { assetPath })
      return
    }

    try {
      const nextProcess = this.dependencies.launchProcess({
        executablePath: MACOS_AUDIO_PLAYER_PATH,
        arguments: [
          '-v',
          SHORTCUT_OPEN_SOUND_VOLUME_RATIO.toString(),
          assetPath,
        ],
      })
      this.activeProcess = nextProcess
      this.lastPlayedCueId = selectedCue.id
      nextProcess.onSettled(() => {
        // Cleanup can detach the process before its late exit event arrives.
        if (this.activeProcess !== nextProcess) return

        this.activeProcess = null
        this.isStopPending = false
        const nextSelection = this.pendingSelection
        this.pendingSelection = null

        // Launch only after `afplay` confirms the prior process has exited.
        if (nextSelection) this.launchCue(nextSelection)
      })
    } catch (error) {
      this.activeProcess = null
      this.pendingSelection = null
      this.isStopPending = false
      log.warn('Shortcut opening sound could not start', error)
    }
  }

  /**
   * Resolves a fixed cue or samples the rotation after excluding the last successful launch.
   * @param selection - Stable fixed id or `shuffle`.
   * @returns One registry entry, or undefined only if a fixed id is unexpectedly absent.
   * @example
   * this.selectCue('balanced-deep-thock')
   */
  private selectCue(
    selection: ShortcutOpenSoundSelection,
  ): (typeof SHORTCUT_OPEN_SOUND_CUES)[number] | undefined {
    if (selection !== DEFAULT_SHORTCUT_OPEN_SOUND_SELECTION) {
      return SHORTCUT_OPEN_SOUND_CUES.find((cue) => cue.id === selection)
    }

    const availableCues =
      this.lastPlayedCueId === null
        ? SHORTCUT_OPEN_SOUND_CUES
        : SHORTCUT_OPEN_SOUND_CUES.filter(
            (cue) => cue.id !== this.lastPlayedCueId,
          )
    const randomIndex = Math.floor(
      this.dependencies.random() * availableCues.length,
    )
    return availableCues[randomIndex] ?? availableCues[0]
  }

  /**
   * Stops any in-flight cue during ShortcutManager teardown.
   * @returns Nothing.
   * @example
   * player.cleanup()
   */
  cleanup(): void {
    const activeProcess = this.activeProcess
    this.activeProcess = null
    this.pendingSelection = null
    this.isStopPending = false

    try {
      activeProcess?.stop()
    } catch (error) {
      log.warn('Shortcut opening sound could not stop during cleanup', error)
    }
  }
}

export default ShortcutOpenSoundPlayer
