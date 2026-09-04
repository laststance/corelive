/**
 * @fileoverview Device-local note map behind the web host's `note.get` / `note.set`.
 * If these fail, the `/write` textarea forgets its text on reload or one category's
 * note overwrites another's.
 */
import { beforeEach, describe, expect, it } from 'vitest'

import { LOCAL_NOTE_STORAGE_KEY } from './constants'
import { getLocalNote, setLocalNote } from './localNoteStore'

beforeEach(() => {
  localStorage.clear()
})

describe('local note store — the /write textarea survives a reload', () => {
  it('reads an empty note before anything was written', () => {
    // Act / Assert
    expect(getLocalNote(0)).toBe('')
  })

  it('round-trips the signed-out note under the "0" key', () => {
    // Act
    setLocalNote(0, '- [ ] buy milk')

    // Assert
    expect(getLocalNote(0)).toBe('- [ ] buy milk')
    expect(
      JSON.parse(localStorage.getItem(LOCAL_NOTE_STORAGE_KEY) ?? ''),
    ).toEqual({ '0': '- [ ] buy milk' })
  })

  it("writing one category's note leaves every other category's note intact", () => {
    // Arrange
    setLocalNote(0, 'local')
    setLocalNote(7, 'work')

    // Act
    setLocalNote(0, 'local edited')

    // Assert
    expect(getLocalNote(7)).toBe('work')
    expect(getLocalNote(0)).toBe('local edited')
  })

  it('reads a corrupt map as empty instead of throwing', () => {
    // Arrange
    localStorage.setItem(LOCAL_NOTE_STORAGE_KEY, '{"0": 42}')

    // Act / Assert
    expect(getLocalNote(0)).toBe('')
  })
})
