import { beforeEach, expect, test } from 'vitest'

import { getLocalNote, setLocalNote } from './localNoteStore'
import { rescueCategoryDraft } from './rescueCategoryDraft'
beforeEach(() => {
  localStorage.clear()
  delete window.liveEditorAPI
  delete window.brainDumpAPI
})
test.each([
  ['draft A', 'draft B', 'draft B\ndraft A'],
  ['echo', 'echo', 'echo\necho'],
])(
  'delayed upstream deletions preserve each chained draft once when the intermediate category was already locally rescued (%s into %s)',
  async (draftA, draftB, expected) => {
    // Arrange — this host deleted B into C before receiving another host's A into B receipt.
    setLocalNote(12, draftA)
    setLocalNote(1, draftB)
    setLocalNote(2, '')
    await rescueCategoryDraft(1, 2)
    // Act — replay the historical chain, including a retry before its cursor can be saved.
    await rescueCategoryDraft(12, 1, true)
    await rescueCategoryDraft(1, 2, true)
    await rescueCategoryDraft(1, 2, true)
    // Assert — both independent source drafts and backups survive without repeating B.
    expect(getLocalNote(2)).toBe(expected)
    expect(getLocalNote(1)).toBe(expected)
    expect(getLocalNote(12)).toBe(draftA)
  },
)

test('confirmed replay does not restore rescued writing that the user already kept or edited before acknowledgement', async () => {
  // Arrange — durable local rescue completed before the server confirmed deletion.
  setLocalNote(12, 'rescued line')
  setLocalNote(1, 'existing line')
  await rescueCategoryDraft(12, 1)
  // Act — the user keeps the existing line, then finishes the rescued line before the stream catches up.
  setLocalNote(1, 'rescued line')
  await rescueCategoryDraft(12, 1, true)
  expect(getLocalNote(1)).toBe('rescued line')
  setLocalNote(1, 'new independent writing')
  await rescueCategoryDraft(12, 1, true)
  // Assert — no duplicate or resurrected copy; the original backup remains available.
  expect(getLocalNote(1)).toBe('new independent writing')
  expect(getLocalNote(12)).toBe('rescued line')
})
