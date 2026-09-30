import { afterEach, beforeEach, expect, test, vi } from 'vitest'

import {
  getCategoryDraftRescueReceipt,
  recordCategoryDraftRescueReceipt,
  retireCategoryDraftRescueReceipts,
  prepareCategoryDraftRescueReceipt,
  hasCategoryDraftRescueLanded,
} from './categoryDraftRescueReceipts'
import { CATEGORY_DRAFT_RESCUE_STORAGE_KEY } from './constants'

beforeEach(() => {
  localStorage.clear()
  vi.spyOn(crypto, 'randomUUID').mockReturnValue(
    '00000000-0000-4000-8000-000000000001',
  )
})
afterEach(() => vi.restoreAllMocks())

test('retains immutable rescue evidence after destination content changes', () => {
  // Arrange
  const rescue = recordCategoryDraftRescueReceipt(
    12,
    1,
    'same thought',
    'same thought',
  )
  // Act
  recordCategoryDraftRescueReceipt(12, 1, 'edited destination', 'same thought')
  // Assert
  expect(rescue).toEqual({
    receipt: '00000000-0000-4000-8000-000000000001',
    identity: '[12,1,"same thought"]',
    baseText: 'same thought',
    text: 'same thought',
    state: 'saved',
  })
  expect(getCategoryDraftRescueReceipt(12, 1, 'same thought')).toEqual(rescue)
  expect(
    JSON.parse(localStorage.getItem(CATEGORY_DRAFT_RESCUE_STORAGE_KEY) ?? '[]'),
  ).toHaveLength(1)
})

test('requires separate rescue receipts for changed source writing or a different destination', () => {
  // Arrange
  recordCategoryDraftRescueReceipt(12, 1, 'base', 'thought')
  // Act / Assert
  expect(
    getCategoryDraftRescueReceipt(12, 1, 'thought changed'),
  ).toBeUndefined()
  expect(getCategoryDraftRescueReceipt(12, 2, 'thought')).toBeUndefined()
  expect(getCategoryDraftRescueReceipt(13, 1, 'thought')).toBeUndefined()
})

test('does not infer a completed rescue from corrupt device metadata', () => {
  // Arrange
  localStorage.setItem(CATEGORY_DRAFT_RESCUE_STORAGE_KEY, 'not JSON')
  // Act
  const rescue = getCategoryDraftRescueReceipt(12, 1, 'thought')
  // Assert
  expect(rescue).toBeUndefined()
})

test('persists a prepared rescue before an append and retains its original base when marking saved', () => {
  // Arrange
  const prepared = prepareCategoryDraftRescueReceipt(
    12,
    1,
    'existing',
    'thought',
  )
  // Act
  const saved = recordCategoryDraftRescueReceipt(
    12,
    1,
    'different current destination',
    'thought',
  )
  // Assert
  expect(prepared).toEqual({
    receipt: '00000000-0000-4000-8000-000000000001',
    identity: '[12,1,"thought"]',
    baseText: 'existing',
    text: 'thought',
    state: 'prepared',
  })
  expect(saved).toEqual({
    receipt: '00000000-0000-4000-8000-000000000001',
    identity: '[12,1,"thought"]',
    baseText: 'existing',
    text: 'thought',
    state: 'saved',
  })
  expect(
    JSON.parse(localStorage.getItem(CATEGORY_DRAFT_RESCUE_STORAGE_KEY) ?? '[]'),
  ).toEqual([saved])
})

test('does not skip two independently identical notes until the specific prepared append is present', () => {
  // Arrange
  const prepared = prepareCategoryDraftRescueReceipt(
    12,
    1,
    'same thought',
    'same thought',
  )
  // Act / Assert
  expect(hasCategoryDraftRescueLanded(prepared, 'same thought')).toBe(false)
  expect(
    hasCategoryDraftRescueLanded(prepared, 'same thought\nsame thought'),
  ).toBe(true)
  expect(
    hasCategoryDraftRescueLanded(
      prepared,
      'same thought\nsame thought\nnew writing',
    ),
  ).toBe(true)
})

test('retries the append when only its unchanged original destination is present', () => {
  // Arrange
  const prepared = prepareCategoryDraftRescueReceipt(12, 1, 'base', 'thought')
  // Act / Assert
  expect(hasCategoryDraftRescueLanded(prepared, 'base')).toBe(false)
  expect(
    hasCategoryDraftRescueLanded(
      prepared,
      'thought in an unrelated destination',
    ),
  ).toBe(false)
})

test('does not mistake a longer independently written line for the whole rescued source line', () => {
  // Arrange
  const prepared = prepareCategoryDraftRescueReceipt(12, 1, 'base', 'buy milk')
  // Act
  const landed = hasCategoryDraftRescueLanded(prepared, 'base\nbuy milk today')
  // Assert
  expect(landed).toBe(false)
})

test('saved receipts stop proving safety when the destination copy has been removed', () => {
  // Arrange
  const saved = recordCategoryDraftRescueReceipt(12, 1, 'base', 'thought')
  // Act / Assert
  expect(hasCategoryDraftRescueLanded(saved, 'base')).toBe(false)
  expect(hasCategoryDraftRescueLanded(saved, 'base\nthought')).toBe(true)
})

test('renews a missing copy with a new notification receipt while retaining its stable source lookup', () => {
  // Arrange
  vi.mocked(crypto.randomUUID)
    .mockReturnValueOnce('00000000-0000-4000-8000-000000000001')
    .mockReturnValueOnce('00000000-0000-4000-8000-000000000002')
  const first = recordCategoryDraftRescueReceipt(12, 1, 'base', 'thought')
  // Act
  const prepared = prepareCategoryDraftRescueReceipt(
    12,
    1,
    'edited base',
    'thought',
    true,
  )
  const saved = recordCategoryDraftRescueReceipt(
    12,
    1,
    'edited base',
    'thought',
  )
  // Assert
  expect(first.receipt).toBe('00000000-0000-4000-8000-000000000001')
  expect(prepared.receipt).toBe('00000000-0000-4000-8000-000000000002')
  expect(saved).toEqual({
    receipt: '00000000-0000-4000-8000-000000000002',
    identity: '[12,1,"thought"]',
    baseText: 'edited base',
    text: 'thought',
    state: 'saved',
  })
  expect(getCategoryDraftRescueReceipt(12, 1, 'thought')).toEqual(saved)
  expect(
    JSON.parse(localStorage.getItem(CATEGORY_DRAFT_RESCUE_STORAGE_KEY) ?? '[]'),
  ).toHaveLength(1)
})

test('keeps receipt storage flat across 150 confirmed operations while retaining unresolved writing', () => {
  // Arrange
  prepareCategoryDraftRescueReceipt(12, 1, 'base', 'pending writing')
  // Act
  for (let sourceId = 101; sourceId <= 250; sourceId += 1) {
    prepareCategoryDraftRescueReceipt(sourceId, 1, 'base', 'confirmed writing')
    recordCategoryDraftRescueReceipt(sourceId, 1, 'base', 'confirmed writing')
    retireCategoryDraftRescueReceipts(sourceId)
  }
  // Assert
  expect(
    JSON.parse(localStorage.getItem(CATEGORY_DRAFT_RESCUE_STORAGE_KEY) ?? '[]'),
  ).toEqual([
    {
      receipt: '00000000-0000-4000-8000-000000000001',
      identity: '[12,1,"pending writing"]',
      baseText: 'base',
      text: 'pending writing',
      state: 'prepared',
    },
  ])
})

test('retires every receipt of the confirmed source without touching another source or unparseable identity', () => {
  // Arrange
  recordCategoryDraftRescueReceipt(12, 1, 'base', 'first thought')
  prepareCategoryDraftRescueReceipt(12, 2, 'base', 'second thought')
  prepareCategoryDraftRescueReceipt(13, 1, 'base', 'pending writing')
  const foreign = {
    receipt: 'foreign',
    identity: 'unknown-format',
    baseText: 'base',
    text: 'unknown source',
    state: 'prepared',
  }
  const saved = JSON.parse(
    localStorage.getItem(CATEGORY_DRAFT_RESCUE_STORAGE_KEY) ?? '[]',
  )
  localStorage.setItem(
    CATEGORY_DRAFT_RESCUE_STORAGE_KEY,
    JSON.stringify([...saved, foreign]),
  )
  // Act
  retireCategoryDraftRescueReceipts(12)
  // Assert
  expect(getCategoryDraftRescueReceipt(12, 1, 'first thought')).toBeUndefined()
  expect(getCategoryDraftRescueReceipt(12, 2, 'second thought')).toBeUndefined()
  expect(
    JSON.parse(localStorage.getItem(CATEGORY_DRAFT_RESCUE_STORAGE_KEY) ?? '[]'),
  ).toEqual([
    {
      receipt: '00000000-0000-4000-8000-000000000001',
      identity: '[13,1,"pending writing"]',
      baseText: 'base',
      text: 'pending writing',
      state: 'prepared',
    },
    {
      receipt: 'foreign',
      identity: 'unknown-format',
      baseText: 'base',
      text: 'unknown source',
      state: 'prepared',
    },
  ])
})

test('retires a known legacy source identity while retaining other pending sources', () => {
  // Arrange
  const legacy = {
    receipt: '[12,1,"legacy thought"]',
    baseText: 'base',
    text: 'legacy thought',
    state: 'saved',
  }
  const pending = {
    receipt: '[13,1,"pending thought"]',
    baseText: 'base',
    text: 'pending thought',
    state: 'prepared',
  }
  localStorage.setItem(
    CATEGORY_DRAFT_RESCUE_STORAGE_KEY,
    JSON.stringify([legacy, pending]),
  )
  // Act
  retireCategoryDraftRescueReceipts(12)
  // Assert
  expect(getCategoryDraftRescueReceipt(12, 1, 'legacy thought')).toBeUndefined()
  expect(getCategoryDraftRescueReceipt(13, 1, 'pending thought')).toEqual({
    receipt: '[13,1,"pending thought"]',
    identity: '[13,1,"pending thought"]',
    baseText: 'base',
    text: 'pending thought',
    state: 'prepared',
  })
})
