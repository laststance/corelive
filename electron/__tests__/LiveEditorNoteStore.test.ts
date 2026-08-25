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

import { ConfigManager } from '../ConfigManager'
import { getLiveEditorNote, setLiveEditorNote } from '../LiveEditorNoteStore'

/**
 * Reads the persisted LiveEditor notes from ConfigManager so assertions prove disk-shape compatibility.
 * @param configManager - The temp-directory-backed config manager under test.
 * @returns The persisted note map keyed by category id string.
 * @example
 * readLiveEditorNotes(configManager) // => { '1': 'note' }
 */
const readLiveEditorNotes = (
  configManager: ConfigManager,
): Record<string, string> =>
  configManager.get<Record<string, string>>('liveEditor.notes', {})

describe('LiveEditorNoteStore', () => {
  beforeEach(() => {
    // Arrange: isolate config.json per test so note writes prove real shape.
    userDataDir.current = fs.mkdtempSync(
      path.join(os.tmpdir(), 'corelive-live-editor-note-store-'),
    )
  })

  afterEach(() => {
    fs.rmSync(userDataDir.current, { recursive: true, force: true })
  })

  it('returns an empty string when a category has no persisted note', () => {
    // Arrange
    const configManager = new ConfigManager()
    configManager.set('liveEditor.notes', {
      '1': 'existing CoreLive note',
    })

    // Act
    const noteText = getLiveEditorNote(configManager, 2)

    // Assert
    expect(noteText).toBe('')
  })

  it('reads the persisted note for the requested category', () => {
    // Arrange
    const configManager = new ConfigManager()
    configManager.set('liveEditor.notes', {
      '1': 'existing CoreLive note',
    })

    // Act
    const noteText = getLiveEditorNote(configManager, 1)

    // Assert
    expect(noteText).toBe('existing CoreLive note')
  })

  it('updates one category note while preserving the other category notes', () => {
    // Arrange
    const configManager = new ConfigManager()
    configManager.set('liveEditor.notes', {
      '1': 'existing CoreLive note',
      '2': 'other category note',
    })

    // Act
    setLiveEditorNote(configManager, 1, 'updated CoreLive note')

    // Assert
    expect(readLiveEditorNotes(configManager)).toEqual({
      '1': 'updated CoreLive note',
      '2': 'other category note',
    })
  })

  it('creates a notes map when none exists yet', () => {
    // Arrange
    const configManager = new ConfigManager()

    // Act
    setLiveEditorNote(configManager, 3, 'first note')

    // Assert
    expect(readLiveEditorNotes(configManager)).toEqual({
      '3': 'first note',
    })
  })
})
