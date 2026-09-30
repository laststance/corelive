import { afterEach, beforeEach, expect, test, vi } from 'vitest'

import {
  appendCategoryDraft,
  flushCategoryDraft,
  mergeRescuedCategoryDraft,
  refreshCategoryDraft,
  registerLiveDraftAppender,
} from './appendCategoryDraft'

const { readNote, writeNote } = vi.hoisted(() => ({
  readNote: vi.fn<(categoryId: number) => Promise<string>>(),
  writeNote: vi.fn<(categoryId: number, text: string) => Promise<void>>(),
}))

vi.mock('./liveEditorHost', () => ({
  getLiveEditorHost: () => ({ note: { get: readNote, set: writeNote } }),
}))

let unregister: (() => void) | undefined

beforeEach(() => {
  readNote.mockReset().mockResolvedValue('existing writing')
  writeNote.mockReset().mockResolvedValue(undefined)
})

afterEach(() => unregister?.())

test('does not finish rescuing a visible draft before the editor confirms its save', async () => {
  // Arrange
  let finishSave = () => {}
  const save = new Promise<void>((resolve) => {
    finishSave = resolve
  })
  unregister = registerLiveDraftAppender(async () => {
    await save
    return true
  })
  let rescued = false

  // Act
  const rescue = appendCategoryDraft(12, 'unfinished thought').then(() => {
    rescued = true
  })
  await Promise.resolve()

  // Assert
  expect(rescued).toBe(false)
  expect(writeNote).not.toHaveBeenCalled()
  finishSave()
  await rescue
  expect(rescued).toBe(true)
})

test('stops rescue when the visible editor cannot save instead of writing behind it', async () => {
  // Arrange
  unregister = registerLiveDraftAppender(async () => {
    throw new Error('save failed')
  })

  // Act
  const rescue = appendCategoryDraft(12, 'unfinished thought')

  // Assert
  await expect(rescue).rejects.toThrow('save failed')
  expect(readNote).not.toHaveBeenCalled()
  expect(writeNote).not.toHaveBeenCalled()
})

test('keeps existing destination writing when rescuing into an inactive category', async () => {
  // Arrange
  unregister = registerLiveDraftAppender(async () => false)

  // Act
  await appendCategoryDraft(12, 'unfinished thought')

  // Assert
  expect(writeNote).toHaveBeenCalledWith(
    12,
    'existing writing\nunfinished thought',
  )
})

test('persists the source editor before category management reads its stored draft', async () => {
  // Arrange
  unregister = registerLiveDraftAppender(
    async () => false,
    async (id) => {
      await writeNote(id, 'latest unsaved text')
      return true
    },
  )

  // Act
  await flushCategoryDraft(12)

  // Assert
  expect(writeNote).toHaveBeenCalledWith(12, 'latest unsaved text')
})

test('keeps a newer editor registered when the previous editor unmounts', async () => {
  // Arrange
  const removeOldEditor = registerLiveDraftAppender(async () => false)
  const currentEditor = vi.fn(async () => true)
  unregister = registerLiveDraftAppender(currentEditor)

  // Act
  removeOldEditor()
  await appendCategoryDraft(12, 'unfinished thought')

  // Assert
  expect(currentEditor).toHaveBeenCalledWith(12, 'unfinished thought')
  expect(writeNote).not.toHaveBeenCalled()
})

test('keeps both edited destination writing and the rescued incoming suffix', () => {
  // Arrange
  const current = 'first line\nnew typing'
  const saved = 'first line'
  const incoming = 'first line\nrescued thought'

  // Act
  const merged = mergeRescuedCategoryDraft(current, saved, incoming)

  // Assert
  expect(merged).toBe('first line\nnew typing\nrescued thought')
})

test('preserves an independent typed line even when it matches the rescued suffix', () => {
  // Arrange
  const current = 'first line\nnew typing\nrescued thought'

  // Act
  const merged = mergeRescuedCategoryDraft(
    current,
    'first line',
    'first line\nrescued thought',
  )

  // Assert
  expect(merged).toBe(
    'first line\nnew typing\nrescued thought\nrescued thought',
  )
})

test('retains a pending rescue across another category until the destination finishes loading', async () => {
  // Arrange
  const rescue = {
    receipt: 'pending-category-switch',
    baseText: 'base',
    text: 'rescued',
  }
  unregister = registerLiveDraftAppender(
    async () => false,
    undefined,
    async () => 'pending',
  )
  await refreshCategoryDraft(1201, rescue)

  // Act
  unregister()
  unregister = registerLiveDraftAppender(
    async () => false,
    undefined,
    async () => false,
  )
  await Promise.resolve()
  await Promise.resolve()
  unregister()
  const readyDestination = vi.fn(async () => true)
  unregister = registerLiveDraftAppender(
    async () => false,
    undefined,
    readyDestination,
  )

  // Assert
  await vi.waitFor(() =>
    expect(readyDestination).toHaveBeenCalledWith(1201, rescue),
  )
})

test('keeps independent matching peer writing as two lines on its first rescue', () => {
  // Arrange
  const independentlyEdited = 'base\nsame thought'

  // Act
  const merged = mergeRescuedCategoryDraft(
    independentlyEdited,
    'base',
    'base\nsame thought',
    true,
  )

  // Assert
  expect(merged).toBe('base\nsame thought\nsame thought')
})

test('reports a deferred rescue save failure with evidence available for retry', async () => {
  // Arrange
  const rescue = {
    receipt: 'deferred-save-failure',
    baseText: 'base',
    text: 'rescued',
  }
  unregister = registerLiveDraftAppender(
    async () => false,
    undefined,
    async () => 'pending',
  )
  await refreshCategoryDraft(1202, rescue)
  unregister()
  const failure = new Error('disk full')
  const reportFailure = vi.fn()

  // Act
  unregister = registerLiveDraftAppender(
    async () => false,
    undefined,
    async () => {
      throw failure
    },
    reportFailure,
  )

  // Assert
  await vi.waitFor(() =>
    expect(reportFailure).toHaveBeenCalledWith(1202, rescue, failure),
  )
  unregister()
  const retry = vi.fn(async () => true)
  unregister = registerLiveDraftAppender(async () => false, undefined, retry)
  await vi.waitFor(() => expect(retry).toHaveBeenCalledWith(1202, rescue))
})
