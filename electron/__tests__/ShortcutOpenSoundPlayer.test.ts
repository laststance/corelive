import { EventEmitter } from 'node:events'
import { existsSync } from 'node:fs'
import path from 'node:path'

import { describe, expect, it, vi } from 'vitest'

const spawnMock = vi.hoisted(() => vi.fn())

vi.mock('node:child_process', () => ({
  spawn: spawnMock,
}))

import { SHORTCUT_OPEN_SOUND_CUES } from '../constants'
import {
  ShortcutOpenSoundPlayer,
  type ShortcutOpenSoundProcess,
} from '../ShortcutOpenSoundPlayer'

/** Test process that can emit native settlement on demand. */
interface ObservableShortcutOpenSoundProcess extends ShortcutOpenSoundProcess {
  settle(): void
}

/** Native child seam that exits during `unref`, before the player subscribes. */
class ImmediateExitChildProcess extends EventEmitter {
  killed = false

  kill = vi.fn(() => {
    this.killed = true
    return true
  })

  unref = vi.fn(() => {
    this.emit('exit', 0, null)
  })
}

/**
 * Creates an observable native-audio process for player lifecycle assertions.
 * @param settleWhenStopped - Whether stop synchronously emits native settlement.
 * @returns A process whose stop, subscription, and settlement are controlled by the test.
 * @example
 * const audioProcess = createAudioProcess(true)
 */
function createAudioProcess(
  settleWhenStopped = false,
): ObservableShortcutOpenSoundProcess {
  let settleCallback: (() => void) | null = null

  return {
    stop: vi.fn(() => {
      if (settleWhenStopped) settleCallback?.()
    }),
    onSettled: vi.fn((callback: () => void) => {
      settleCallback = callback
    }),
    settle: (): void => {
      settleCallback?.()
    },
  }
}

describe('ShortcutOpenSoundPlayer', () => {
  it('ships exactly ten stable and unique cue identifiers and filenames', () => {
    // Arrange / Act
    const cueIds = SHORTCUT_OPEN_SOUND_CUES.map((cue) => cue.id)
    const filenames = SHORTCUT_OPEN_SOUND_CUES.map((cue) => cue.filename)

    // Assert
    expect(cueIds).toEqual([
      'balanced-deep-thock',
      'soft-double-thock',
      'typebar-over-thock',
      'velvet-capacitive-key',
      'damped-enter-latch',
      'pbt-thock-metal-tick',
      'felted-office-thock',
      'walnut-desk-thock',
      'three-key-flourish',
      'press-release-mechanism',
    ])
    expect(new Set(cueIds).size).toBe(10)
    expect(filenames).toEqual([
      '01-balanced-deep-thock.mp3',
      '02-soft-double-thock.mp3',
      '03-typebar-over-thock.mp3',
      '04-velvet-capacitive-key.mp3',
      '05-damped-enter-latch.mp3',
      '06-pbt-thock-metal-tick.mp3',
      '07-felted-office-thock.mp3',
      '08-walnut-desk-thock.mp3',
      '09-three-key-flourish.mp3',
      '10-press-release-mechanism.mp3',
    ])
    expect(new Set(filenames).size).toBe(10)
  })

  it('has a real source asset for every cue that can be bundled into the packaged app', () => {
    // Arrange
    const soundDirectory = path.resolve(
      process.cwd(),
      'public',
      'sounds',
      'shortcut-opening',
    )

    // Act
    const missingAssetFilenames = SHORTCUT_OPEN_SOUND_CUES.filter(
      (cue) => !existsSync(path.join(soundDirectory, cue.filename)),
    ).map((cue) => cue.filename)

    // Assert
    expect(missingAssetFilenames).toEqual([])
  })

  it('plays the exact bundled cue the user selected through the macOS audio player', () => {
    // Arrange
    const audioProcess = createAudioProcess()
    const launchProcess = vi.fn(() => audioProcess)
    const player = new ShortcutOpenSoundPlayer({
      fileExists: () => true,
      launchProcess,
      platform: 'darwin',
      resolveAssetPath: (filename: string) =>
        `/CoreLive/Resources/public/sounds/shortcut-opening/${filename}`,
    })

    // Act
    player.play('balanced-deep-thock')

    // Assert
    expect(launchProcess).toHaveBeenCalledWith({
      arguments: [
        '-v',
        '0.55',
        '/CoreLive/Resources/public/sounds/shortcut-opening/01-balanced-deep-thock.mp3',
      ],
      executablePath: '/usr/bin/afplay',
    })
  })

  it('waits for the previous cue to stop before replaying so rapid shortcuts never layer sounds', () => {
    // Arrange
    const firstProcess = createAudioProcess()
    const secondProcess = createAudioProcess()
    const launchProcess = vi
      .fn()
      .mockReturnValueOnce(firstProcess)
      .mockReturnValueOnce(secondProcess)
    const player = new ShortcutOpenSoundPlayer({
      fileExists: () => true,
      launchProcess,
      platform: 'darwin',
      random: () => 0,
      resolveAssetPath: (filename: string) => `/tmp/${filename}`,
    })

    // Act
    player.play('balanced-deep-thock')
    player.play('soft-double-thock')

    // Assert
    expect(firstProcess.stop).toHaveBeenCalledTimes(1)
    expect(launchProcess).toHaveBeenCalledTimes(1)

    // Act: only native settlement makes it safe to launch the replacement cue.
    firstProcess.settle()

    // Assert
    expect(launchProcess).toHaveBeenCalledTimes(2)
    expect(launchProcess).toHaveBeenNthCalledWith(2, {
      arguments: ['-v', '0.55', '/tmp/02-soft-double-thock.mp3'],
      executablePath: '/usr/bin/afplay',
    })
    expect(secondProcess.stop).not.toHaveBeenCalled()
  })

  it('launches one replacement without losing it when stop settles synchronously', () => {
    // Arrange
    const firstProcess = createAudioProcess(true)
    const secondProcess = createAudioProcess()
    const launchProcess = vi
      .fn()
      .mockReturnValueOnce(firstProcess)
      .mockReturnValueOnce(secondProcess)
    const player = new ShortcutOpenSoundPlayer({
      fileExists: () => true,
      launchProcess,
      platform: 'darwin',
      random: () => 0,
      resolveAssetPath: (filename: string) => `/sounds/${filename}`,
    })

    // Act
    player.play('balanced-deep-thock')
    player.play('press-release-mechanism')

    // Assert
    expect(firstProcess.stop).toHaveBeenCalledOnce()
    expect(launchProcess).toHaveBeenCalledTimes(2)
    expect(launchProcess).toHaveBeenNthCalledWith(2, {
      arguments: ['-v', '0.55', '/sounds/10-press-release-mechanism.mp3'],
      executablePath: '/usr/bin/afplay',
    })
    expect(secondProcess.stop).not.toHaveBeenCalled()
  })

  it('continues playing future shortcuts after afplay exits before lifecycle subscription', () => {
    // Arrange
    spawnMock.mockReset()
    spawnMock
      .mockReturnValueOnce(new ImmediateExitChildProcess())
      .mockReturnValueOnce(new ImmediateExitChildProcess())
    const player = new ShortcutOpenSoundPlayer({
      fileExists: () => true,
      platform: 'darwin',
      resolveAssetPath: (filename: string) => `/sounds/${filename}`,
    })

    // Act
    player.play('balanced-deep-thock')
    player.play('soft-double-thock')

    // Assert
    expect(spawnMock).toHaveBeenCalledTimes(2)
  })

  it('never repeats the previous cue when shuffled playback receives the same random position', () => {
    // Arrange
    const firstProcess = createAudioProcess()
    const secondProcess = createAudioProcess()
    const launchProcess = vi
      .fn()
      .mockReturnValueOnce(firstProcess)
      .mockReturnValueOnce(secondProcess)
    const player = new ShortcutOpenSoundPlayer({
      fileExists: () => true,
      launchProcess,
      platform: 'darwin',
      random: () => 0,
      resolveAssetPath: (filename: string) => `/sounds/${filename}`,
    })

    // Act
    player.play('shuffle')
    firstProcess.settle()
    player.play('shuffle')

    // Assert
    expect(launchProcess).toHaveBeenNthCalledWith(1, {
      arguments: ['-v', '0.55', '/sounds/01-balanced-deep-thock.mp3'],
      executablePath: '/usr/bin/afplay',
    })
    expect(launchProcess).toHaveBeenNthCalledWith(2, {
      arguments: ['-v', '0.55', '/sounds/02-soft-double-thock.mp3'],
      executablePath: '/usr/bin/afplay',
    })
  })

  it('keeps opening the window silently when the packaged sound asset is unavailable', () => {
    // Arrange
    const launchProcess = vi.fn()
    const player = new ShortcutOpenSoundPlayer({
      fileExists: () => false,
      launchProcess,
      platform: 'darwin',
      random: () => 0,
      resolveAssetPath: (filename: string) => `/missing/${filename}`,
    })

    // Act
    player.play()

    // Assert
    expect(launchProcess).not.toHaveBeenCalled()
  })
})
