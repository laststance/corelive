import { describe, expect, test } from 'vitest'

import {
  normalizeCategoryName,
  validateCategoryAction,
  validateCategorySet,
  type CategoryAction,
  type ValidatedCategory,
} from './category-validator'

const general: ValidatedCategory<string> = {
  id: 'general',
  name: 'General',
  isDefault: true,
  parentId: null,
}
const work: ValidatedCategory<string> = {
  id: 'work',
  name: 'Work',
  isDefault: false,
  parentId: null,
}
const home: ValidatedCategory<string> = {
  id: 'home',
  name: 'Home',
  isDefault: false,
  parentId: null,
}
const email: ValidatedCategory<string> = {
  id: 'email',
  name: 'Email',
  isDefault: false,
  parentId: 'work',
}
const set = [general, work, home, email]

const cases: {
  title: string
  categories?: ValidatedCategory<string>[]
  action: CategoryAction<string>
  expected: ReturnType<typeof validateCategoryAction>
}[] = [
  {
    title: 'accepts a fresh root name',
    action: { type: 'create', name: 'Study', parentId: null },
    expected: { ok: true, name: 'Study' },
  },
  {
    title: 'refuses a duplicate root name',
    action: { type: 'create', name: 'Work', parentId: null },
    expected: { ok: false, reason: 'name-taken-local' },
  },
  {
    title: 'matches names case-sensitively like the server index',
    action: { type: 'create', name: 'work', parentId: null },
    expected: { ok: true, name: 'work' },
  },
  {
    title: 'treats a decomposed and a composed name as the same (NFC)',
    categories: [{ ...work, name: 'Café' }],
    action: { type: 'create', name: ' Café ', parentId: null },
    expected: { ok: false, reason: 'name-taken-local' },
  },
  {
    title: 'refuses an empty name after trimming',
    action: { type: 'create', name: '   ', parentId: null },
    expected: { ok: false, reason: 'invalid-name' },
  },
  {
    title: 'refuses a 31 character name',
    action: { type: 'create', name: 'a'.repeat(31), parentId: null },
    expected: { ok: false, reason: 'invalid-name' },
  },
  {
    title: 'allows the same name under a different parent',
    action: { type: 'create', name: 'Email', parentId: 'home' },
    expected: { ok: true, name: 'Email' },
  },
  {
    title: 'refuses a third level',
    action: { type: 'create', name: 'Deep', parentId: 'email' },
    expected: { ok: false, reason: 'invalid-parent' },
  },
  {
    title: 'refuses a missing parent',
    action: { type: 'create', name: 'Orphan', parentId: 'nope' },
    expected: { ok: false, reason: 'invalid-parent' },
  },
  {
    title: 'refuses renaming the default',
    action: { type: 'rename', id: 'general', name: 'Main' },
    expected: { ok: false, reason: 'default-locked' },
  },
  {
    title: 'allows recoloring the default',
    action: { type: 'recolor', id: 'general' },
    expected: { ok: true },
  },
  {
    title: 'refuses giving the default a parent',
    action: { type: 'reparent', id: 'general', parentId: 'work' },
    expected: { ok: false, reason: 'default-locked' },
  },
  {
    title: 'refuses deleting the default',
    action: { type: 'delete', id: 'general', destinationId: 'work' },
    expected: { ok: false, reason: 'default-locked' },
  },
  {
    title: 'refuses a rename onto a sibling name',
    action: { type: 'rename', id: 'home', name: 'Work' },
    expected: { ok: false, reason: 'name-taken-local' },
  },
  {
    title: 'allows renaming a category to itself',
    action: { type: 'rename', id: 'work', name: 'Work' },
    expected: { ok: true, name: 'Work' },
  },
  {
    title: 'refuses making a category its own parent',
    action: { type: 'reparent', id: 'home', parentId: 'home' },
    expected: { ok: false, reason: 'invalid-parent' },
  },
  {
    title: 'refuses turning a root that has children into a child',
    action: { type: 'reparent', id: 'work', parentId: 'home' },
    expected: { ok: false, reason: 'invalid-parent' },
  },
  {
    title: 'refuses a reparent that collides with a sibling in the new parent',
    categories: [
      ...set,
      { ...home, id: 'mail2', name: 'Email', parentId: 'home' },
    ],
    action: { type: 'reparent', id: 'email', parentId: 'home' },
    expected: { ok: false, reason: 'name-taken-local' },
  },
  {
    title: 'allows promoting a child to a root',
    action: { type: 'reparent', id: 'email', parentId: null },
    expected: { ok: true, name: 'Email' },
  },
  {
    title: 'refuses a delete whose promoted child collides with a root',
    categories: [...set, { ...home, id: 'root-email', name: 'Email' }],
    action: { type: 'delete', id: 'work', destinationId: 'home' },
    expected: { ok: false, reason: 'name-taken-local', childName: 'Email' },
  },
  {
    title: 'allows a delete whose promoted children are unique',
    action: { type: 'delete', id: 'work', destinationId: 'home' },
    expected: { ok: true },
  },
  {
    title: 'refuses a delete into itself',
    action: { type: 'delete', id: 'home', destinationId: 'home' },
    expected: { ok: false, reason: 'invalid-destination' },
  },
  {
    title: 'ignores removed and historical categories',
    categories: [
      ...set,
      { ...home, id: 'gone', name: 'Study', removed: true },
      { ...home, id: 'old', name: 'Archive', historical: true },
    ],
    action: { type: 'create', name: 'Study', parentId: null },
    expected: { ok: true, name: 'Study' },
  },
]

describe('category validator', () => {
  test.each(cases)('$title', ({ categories, action, expected }) => {
    // Arrange
    const known = categories ?? set

    // Act
    const verdict = validateCategoryAction(known, action)

    // Assert
    expect(verdict).toEqual(expected)
  })

  test('works with numeric server ids exactly like local ids', () => {
    // Arrange
    const serverSet: ValidatedCategory<number>[] = [
      { id: 1, name: 'General', isDefault: true, parentId: null },
      { id: 2, name: 'Work', isDefault: false, parentId: null },
    ]

    // Act
    const verdict = validateCategoryAction(serverSet, {
      type: 'create',
      name: 'Work',
      parentId: null,
    })

    // Assert
    expect(verdict).toEqual({ ok: false, reason: 'name-taken-local' })
  })

  test('reports a merged set where two roots ended up with one name', () => {
    // Arrange
    const merged = [work, { ...home, name: 'Work' }]

    // Act
    const problems = validateCategorySet(merged)

    // Assert
    expect(problems).toEqual([{ id: 'home', reason: 'name-taken-local' }])
  })

  test('normalizes names to NFC before trimming', () => {
    // Arrange / Act
    const name = normalizeCategoryName(' Café ')

    // Assert
    expect(name).toBe('Café')
  })
})
