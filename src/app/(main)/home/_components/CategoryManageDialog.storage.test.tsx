import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  expect,
  test,
  vi,
} from 'vitest'

import {
  CATEGORY_DRAFT_RESCUE_STORAGE_KEY,
  LOCAL_NOTE_STORAGE_KEY,
} from '@/lib/live-editor/constants'
import type { CategoryWithCount } from '@/server/schemas/category'
import { orpcServer, readCategories, resetOrpcServer } from '@/test/orpcServer'

vi.mock('@/hooks/useClerkQueryReady', () => ({
  useClerkQueryReady: () => true,
}))

const actualStorageSetItem = window.localStorage.setItem.bind(
  window.localStorage,
)

const general: CategoryWithCount = {
  id: 1,
  name: 'General',
  color: 'blue',
  isDefault: true,
  parentId: null,
  userId: 1,
  createdAt: new Date('2026-09-01'),
  updatedAt: new Date('2026-09-01'),
  _count: { todos: 0 },
  recordCount: 0,
}
const work: CategoryWithCount = {
  ...general,
  id: 12,
  name: 'Work',
  isDefault: false,
  recordCount: 1,
}

beforeAll(() => orpcServer.listen({ onUnhandledRequest: 'error' }))
afterAll(() => orpcServer.close())
beforeEach(() => {
  vi.resetModules()
  localStorage.clear()
  delete window.liveEditorAPI
  resetOrpcServer([general, work])
  // Seed existing disk writing without invoking the slot's availability probe.
  localStorage.setItem(
    LOCAL_NOTE_STORAGE_KEY,
    JSON.stringify({ '1': 'existing', '12': 'half a thought' }),
  )
})
afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
  // Happy DOM's Storage proxy omits the original method descriptor, so restore it explicitly.
  Object.defineProperty(window.localStorage, 'setItem', {
    value: actualStorageSetItem,
    configurable: true,
    writable: true,
  })
  orpcServer.resetHandlers()
})

/**
 * Loads fresh device storage state to exercise real private-mode and quota degradation.
 * @example
 * await renderStorageGuardManager()
 */
async function renderStorageGuardManager() {
  const { CategoryManageDialog } = await import('./CategoryManageDialog')
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  })
  render(
    <QueryClientProvider client={client}>
      <CategoryManageDialog open onOpenChange={vi.fn()} />
    </QueryClientProvider>,
  )
  await screen.findByRole('button', { name: 'Delete Work' })
}

test('keeps the category and source writing when private-mode storage cannot persist a rescue', async () => {
  // Arrange
  const user = userEvent.setup()
  await renderStorageGuardManager()
  vi.spyOn(window.localStorage, 'setItem').mockImplementation(() => {
    throw new DOMException('Storage disabled', 'SecurityError')
  })
  // Act
  await user.click(screen.getByRole('button', { name: 'Delete Work' }))
  await user.click(screen.getByRole('button', { name: 'Delete' }))
  // Assert
  expect(await screen.findByRole('alert')).toHaveTextContent(
    'Nothing was deleted',
  )
  expect(readCategories().map((category) => category.id)).toEqual([1, 12])
  expect(
    JSON.parse(localStorage.getItem(LOCAL_NOTE_STORAGE_KEY) ?? '{}'),
  ).toEqual({ '1': 'existing', '12': 'half a thought' })
})

test.each([LOCAL_NOTE_STORAGE_KEY, CATEGORY_DRAFT_RESCUE_STORAGE_KEY])(
  'keeps the category when quota expires while persisting %s',
  async (failingKey) => {
    // Arrange
    const user = userEvent.setup()
    await renderStorageGuardManager()
    const actualSetItem = window.localStorage.setItem.bind(window.localStorage)
    vi.spyOn(window.localStorage, 'setItem').mockImplementation(
      (key, value) => {
        if (key === failingKey)
          throw new DOMException('Quota exceeded', 'QuotaExceededError')
        actualSetItem(key, value)
      },
    )
    // Act
    await user.click(screen.getByRole('button', { name: 'Delete Work' }))
    await user.click(screen.getByRole('button', { name: 'Delete' }))
    // Assert
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Nothing was deleted',
    )
    await waitFor(() =>
      expect(readCategories().map((category) => category.id)).toEqual([1, 12]),
    )
    const { getLocalNote } = await import('@/lib/live-editor/localNoteStore')
    expect(getLocalNote(12)).toBe('half a thought')
    // A fallback copy may exist, but it must not be accepted as durable proof for server deletion.
    expect(getLocalNote(1)).toBe(
      failingKey === LOCAL_NOTE_STORAGE_KEY
        ? 'existing\nhalf a thought'
        : 'existing',
    )
  },
)

test('does not duplicate the rescued draft after receipt completion hits quota and the app reloads', async () => {
  // Arrange
  const user = userEvent.setup()
  await renderStorageGuardManager()
  vi.spyOn(window.localStorage, 'setItem').mockImplementation((key, value) => {
    if (key === CATEGORY_DRAFT_RESCUE_STORAGE_KEY) {
      // A prepared intent persists; completing that receipt fails after note persistence.
      if (!value.includes('"state":"prepared"'))
        throw new DOMException('Quota exceeded', 'QuotaExceededError')
    }
    actualStorageSetItem(key, value)
  })
  await user.click(screen.getByRole('button', { name: 'Delete Work' }))
  await user.click(screen.getByRole('button', { name: 'Delete' }))
  expect(await screen.findByRole('alert')).toHaveTextContent(
    'Nothing was deleted',
  )
  expect(readCategories().map((category) => category.id)).toEqual([1, 12])
  // Act — storage becomes writable on a new module lifetime, preserving disk data.
  cleanup()
  vi.restoreAllMocks()
  Object.defineProperty(window.localStorage, 'setItem', {
    value: actualStorageSetItem,
    configurable: true,
    writable: true,
  })
  vi.resetModules()
  await renderStorageGuardManager()
  await user.click(screen.getByRole('button', { name: 'Delete Work' }))
  await user.click(screen.getByRole('button', { name: 'Delete' }))
  // Assert
  await waitFor(() =>
    expect(readCategories().map((category) => category.id)).toEqual([1]),
  )
  const { getLocalNote } = await import('@/lib/live-editor/localNoteStore')
  expect(getLocalNote(1)).toBe('existing\nhalf a thought')
  expect(getLocalNote(12)).toBe('half a thought')
})

test('still appends an independent first copy when matching destination writing arrives during preparation', async () => {
  // Arrange
  const user = userEvent.setup()
  await renderStorageGuardManager()
  vi.spyOn(window.localStorage, 'setItem').mockImplementation((key, value) => {
    actualStorageSetItem(key, value)
    if (
      key === CATEGORY_DRAFT_RESCUE_STORAGE_KEY &&
      value.includes('"state":"prepared"')
    ) {
      // A peer independently writes the same line after the prepared intent, before the first append.
      actualStorageSetItem(
        LOCAL_NOTE_STORAGE_KEY,
        JSON.stringify({
          '1': 'existing\nhalf a thought',
          '12': 'half a thought',
        }),
      )
    }
  })
  // Act
  await user.click(screen.getByRole('button', { name: 'Delete Work' }))
  await user.click(screen.getByRole('button', { name: 'Delete' }))
  // Assert
  await waitFor(() =>
    expect(readCategories().map((category) => category.id)).toEqual([1]),
  )
  const { getLocalNote } = await import('@/lib/live-editor/localNoteStore')
  expect(getLocalNote(1)).toBe('existing\nhalf a thought\nhalf a thought')
})

test('rescues the whole source after a prepared append failed and a longer independent destination line was typed', async () => {
  // Arrange
  const user = userEvent.setup()
  await renderStorageGuardManager()
  vi.spyOn(window.localStorage, 'setItem').mockImplementation((key, value) => {
    if (key === LOCAL_NOTE_STORAGE_KEY)
      throw new DOMException('Quota exceeded', 'QuotaExceededError')
    actualStorageSetItem(key, value)
  })
  await user.click(screen.getByRole('button', { name: 'Delete Work' }))
  await user.click(screen.getByRole('button', { name: 'Delete' }))
  expect(await screen.findByRole('alert')).toHaveTextContent(
    'Nothing was deleted',
  )
  // Act — after reload a peer's independently typed longer line is on disk, not the source's complete line.
  cleanup()
  vi.restoreAllMocks()
  Object.defineProperty(window.localStorage, 'setItem', {
    value: actualStorageSetItem,
    configurable: true,
    writable: true,
  })
  actualStorageSetItem(
    LOCAL_NOTE_STORAGE_KEY,
    JSON.stringify({
      '1': 'existing\nhalf a thought today',
      '12': 'half a thought',
    }),
  )
  vi.resetModules()
  await renderStorageGuardManager()
  await user.click(screen.getByRole('button', { name: 'Delete Work' }))
  await user.click(screen.getByRole('button', { name: 'Delete' }))
  // Assert
  await waitFor(() =>
    expect(readCategories().map((category) => category.id)).toEqual([1]),
  )
  const { getLocalNote } = await import('@/lib/live-editor/localNoteStore')
  expect(getLocalNote(1)).toBe('existing\nhalf a thought today\nhalf a thought')
})

test('keeps a confirmed deletion successful when quota prevents receipt retirement', async () => {
  // Arrange
  const user = userEvent.setup()
  await renderStorageGuardManager()
  vi.spyOn(window.localStorage, 'setItem').mockImplementation((key, value) => {
    if (key === CATEGORY_DRAFT_RESCUE_STORAGE_KEY && value === '[]') {
      throw new DOMException(
        'Quota exceeded during cleanup',
        'QuotaExceededError',
      )
    }
    actualStorageSetItem(key, value)
  })
  // Act
  await user.click(screen.getByRole('button', { name: 'Delete Work' }))
  await user.click(screen.getByRole('button', { name: 'Delete' }))
  // Assert
  await waitFor(() =>
    expect(readCategories().map((category) => category.id)).toEqual([1]),
  )
  await waitFor(() =>
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument(),
  )
  expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  // The durable saved receipt remains because cleanup failed, but writing and confirmed server state survive.
  expect(
    JSON.parse(localStorage.getItem(CATEGORY_DRAFT_RESCUE_STORAGE_KEY) ?? '[]'),
  ).toHaveLength(1)
  expect(
    JSON.parse(localStorage.getItem(LOCAL_NOTE_STORAGE_KEY) ?? '{}'),
  ).toEqual({ '1': 'existing\nhalf a thought', '12': 'half a thought' })
})
