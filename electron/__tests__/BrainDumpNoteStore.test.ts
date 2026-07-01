import fs from 'fs'
import os from 'os'
import path from 'path'

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// A mutable holder lets the hoisted Electron app mock return a fresh userData
// directory per test before ConfigManager reads the path.
const userDataDir = vi.hoisted(() => ({ current: '' }))

vi.mock('electron', () => ({
  app: {
    getPath: vi.fn(() => userDataDir.current),
  },
}))

vi.mock('../logger', () => ({
  log: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}))

import { getBrainDumpNote, setBrainDumpNote } from '../BrainDumpNoteStore'
import { ConfigManager } from '../ConfigManager'

/**
 * Reads the persisted BrainDump notes from ConfigManager so assertions prove disk-shape compatibility.
 * @param configManager - The temp-directory-backed config manager under test.
 * @returns The persisted note map keyed by category id string.
 * @example
 * readBrainDumpNotes(configManager) // => { '1': 'note' }
 */
const readBrainDumpNotes = (
  configManager: ConfigManager,
): Record<string, string> =>
  configManager.get<Record<string, string>>('braindump.notes', {})

describe('BrainDumpNoteStore', () => {
  beforeEach(() => {
    // Arrange: isolate config.json per test so note writes prove real shape.
    userDataDir.current = fs.mkdtempSync(
      path.join(os.tmpdir(), 'corelive-braindump-note-store-'),
    )
  })

  afterEach(() => {
    fs.rmSync(userDataDir.current, { recursive: true, force: true })
  })

  it('returns an empty string when a category has no persisted note', () => {
    // Arrange
    const configManager = new ConfigManager()
    configManager.set('braindump.notes', {
      '1': 'existing CoreLive note',
    })

    // Act
    const noteText = getBrainDumpNote(configManager, 2)

    // Assert
    expect(noteText).toBe('')
  })

  it('reads the persisted note for the requested category', () => {
    // Arrange
    const configManager = new ConfigManager()
    configManager.set('braindump.notes', {
      '1': 'existing CoreLive note',
    })

    // Act
    const noteText = getBrainDumpNote(configManager, 1)

    // Assert
    expect(noteText).toBe('existing CoreLive note')
  })

  it('updates one category note while preserving the other category notes', () => {
    // Arrange
    const configManager = new ConfigManager()
    configManager.set('braindump.notes', {
      '1': 'existing CoreLive note',
      '2': 'other category note',
    })

    // Act
    setBrainDumpNote(configManager, 1, 'updated CoreLive note')

    // Assert
    expect(readBrainDumpNotes(configManager)).toEqual({
      '1': 'updated CoreLive note',
      '2': 'other category note',
    })
  })

  it('creates a notes map when none exists yet', () => {
    // Arrange
    const configManager = new ConfigManager()

    // Act
    setBrainDumpNote(configManager, 3, 'first note')

    // Assert
    expect(readBrainDumpNotes(configManager)).toEqual({
      '3': 'first note',
    })
  })
})
