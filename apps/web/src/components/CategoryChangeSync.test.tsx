import { os } from '@orpc/server'
import { RPCHandler } from '@orpc/server/fetch'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react'
import { http, HttpResponse } from 'msw'
import { setupServer } from 'msw/node'
import { Toaster, toast } from 'sonner'
import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  expect,
  test,
  vi,
} from 'vitest'
import { z } from 'zod'

import {
  getCategoryDraftRescueReceipt,
  recordCategoryDraftRescueReceipt,
} from '@/lib/live-editor/categoryDraftRescueReceipts'
import { rescueCategoryDraft } from '@/lib/live-editor/rescueCategoryDraft'

import { CategoryChangeSync } from './CategoryChangeSync'

const fixtureAuth = vi.hoisted(
  (): {
    isLoaded: boolean
    isSignedIn: boolean
    user: { id: string } | null
  } => ({
    isLoaded: true,
    isSignedIn: true,
    user: { id: 'user_cross_host_fixture' },
  }),
)
vi.mock('@clerk/nextjs', () => ({ useUser: () => fixtureAuth }))
vi.mock('@/lib/live-editor/rescueCategoryDraft', () => ({
  rescueCategoryDraft: vi.fn(),
}))

const cursorKey = 'corelive.category-changes.user_cross_host_fixture'
const requestInputs: number[] = []
const receipt = { id: 42, sourceId: 12, destinationId: 1 }
const changes = os
  .input(z.object({ afterId: z.number() }))
  .handler(({ input }) => {
    requestInputs.push(input.afterId)
    return {
      deletions: input.afterId < 42 ? [receipt] : [],
      cursor: Math.max(input.afterId, 42),
      hasMore: false,
    }
  })
const handler = new RPCHandler({ category: { changes } })
const server = setupServer(
  http.all('*/api/orpc/category/changes', async ({ request }) => {
    const { response } = await handler.handle(request, {
      prefix: '/api/orpc',
      context: {},
    })
    return response ?? new HttpResponse('Not found', { status: 404 })
  }),
)
const clients = new Set<QueryClient>()

/** Mounts the real synchronizer and toast Retry action over a real oRPC/TanStack transport fixture.
 * Provider authentication and native draft persistence remain explicit controlled boundaries.
 * @example renderCategoryChanges()
 */
function renderCategoryChanges() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  clients.add(client)
  return render(
    <QueryClientProvider client={client}>
      <CategoryChangeSync />
      <Toaster />
    </QueryClientProvider>,
  )
}

beforeAll(() => server.listen({ onUnhandledRequest: 'error' }))
afterAll(() => server.close())
beforeEach(() => {
  vi.mocked(rescueCategoryDraft).mockReset()
  vi.mocked(rescueCategoryDraft).mockResolvedValue(undefined)
  fixtureAuth.isSignedIn = true
  fixtureAuth.user = { id: 'user_cross_host_fixture' }
  requestInputs.length = 0
  delete window.electronAPI
  delete window.liveEditorAPI
  delete window.brainDumpAPI
  localStorage.clear()
  Object.defineProperty(document, 'visibilityState', {
    configurable: true,
    value: 'visible',
  })
})
afterEach(() => {
  cleanup()
  toast.dismiss()
  for (const client of clients) client.clear()
  clients.clear()
  server.resetHandlers()
  vi.useRealTimers()
  vi.restoreAllMocks()
  // Restore the instance too: Happy DOM retains bound methods after a prototype spy is restored.
  Object.defineProperty(window.localStorage, 'setItem', {
    configurable: true,
    writable: true,
    value: Storage.prototype.setItem,
  })
})

test('signed-out pages never poll protected category changes on startup, focus or the scheduled refresh', async () => {
  // Arrange
  fixtureAuth.isSignedIn = false
  fixtureAuth.user = null
  vi.useFakeTimers()
  renderCategoryChanges()

  // Act
  await act(async () => {
    window.dispatchEvent(new Event('focus'))
    await vi.advanceTimersByTimeAsync(30_000)
  })

  // Assert
  expect(requestInputs).toEqual([])
  expect(rescueCategoryDraft).not.toHaveBeenCalled()
  expect(localStorage.getItem(cursorKey)).toBe(null)
})

test('an account cursor advances only after draft rescue succeeds and the next focus request uses the acknowledged receipt', async () => {
  // Arrange
  localStorage.setItem(cursorKey, '41')
  localStorage.setItem('corelive.category-changes.other_account', '9')
  const heldRescue = Promise.withResolvers<undefined>()
  vi.mocked(rescueCategoryDraft).mockReturnValueOnce(heldRescue.promise)
  renderCategoryChanges()

  // Act
  await waitFor(() =>
    expect(rescueCategoryDraft).toHaveBeenCalledWith(12, 1, true),
  )

  // Assert — a fetched receipt is not acknowledged while its writing is still unsettled.
  expect(requestInputs).toEqual([41])
  expect(localStorage.getItem(cursorKey)).toBe('41')
  await act(async () => {
    heldRescue.resolve(undefined)
  })
  await waitFor(() => expect(localStorage.getItem(cursorKey)).toBe('42'))
  act(() => {
    window.dispatchEvent(new Event('focus'))
  })
  await waitFor(() => expect(requestInputs).toEqual([41, 42]))
  expect(localStorage.getItem('corelive.category-changes.other_account')).toBe(
    '9',
  )
  expect(rescueCategoryDraft).toHaveBeenCalledOnce()
})

test('failed draft rescue retains the old cursor and its visible Retry replays the unacknowledged receipt', async () => {
  // Arrange
  localStorage.setItem(cursorKey, '41')
  const rescueEvidence = recordCategoryDraftRescueReceipt(
    12,
    1,
    'Existing writing',
    'Host-local draft',
  )
  vi.mocked(rescueCategoryDraft).mockResolvedValue(rescueEvidence)
  vi.mocked(rescueCategoryDraft).mockRejectedValueOnce(
    new Error('Draft could not be durably saved'),
  )
  renderCategoryChanges()

  // Act
  const retry = await screen.findByRole('button', { name: 'Retry' })

  // Assert
  expect(retry).toBeVisible()
  expect(requestInputs).toEqual([41])
  expect(localStorage.getItem(cursorKey)).toBe('41')

  // Arrange — the next rescue succeeds, but its durable cursor write runs out of quota.
  const originalSetItem = Storage.prototype.setItem
  Object.defineProperty(window.localStorage, 'setItem', {
    configurable: true,
    writable: true,
    value: originalSetItem,
  })
  let quotaFailureInjected = false
  const writeCursor = vi
    .spyOn(window.localStorage, 'setItem')
    .mockImplementation(function (this: Storage, key: string, value: string) {
      if (key === cursorKey && !quotaFailureInjected) {
        quotaFailureInjected = true
        throw new DOMException(
          'Account cursor storage is full',
          'QuotaExceededError',
        )
      }
      originalSetItem.call(this, key, value)
    })
  const notifyFailure = vi.spyOn(toast, 'error')

  // Act
  fireEvent.click(retry)

  // Assert — successful rescue alone cannot acknowledge or retire its saved evidence.
  await waitFor(() => expect(notifyFailure).toHaveBeenCalledOnce())
  expect(quotaFailureInjected).toBe(true)
  expect(writeCursor).toHaveBeenCalledWith(cursorKey, '42')
  expect(requestInputs).toEqual([41, 41])
  expect(localStorage.getItem(cursorKey)).toBe('41')
  expect(rescueCategoryDraft).toHaveBeenCalledTimes(2)
  await expect(
    vi.mocked(rescueCategoryDraft).mock.results[1]!.value,
  ).resolves.toEqual(rescueEvidence)
  expect(getCategoryDraftRescueReceipt(12, 1, 'Host-local draft')).toEqual(
    rescueEvidence,
  )
  await waitFor(() =>
    expect(screen.getByRole('button', { name: 'Retry' })).toBeVisible(),
  )
  const quotaRetry = screen.getByRole('button', { name: 'Retry' })

  // Act — storage recovers; the same user-visible Retry replays the unacknowledged receipt.
  writeCursor.mockRestore()
  Object.defineProperty(window.localStorage, 'setItem', {
    configurable: true,
    writable: true,
    value: originalSetItem,
  })
  fireEvent.click(quotaRetry)

  // Assert
  await waitFor(() => expect(localStorage.getItem(cursorKey)).toBe('42'))
  expect(requestInputs).toEqual([41, 41, 41])
  expect(rescueCategoryDraft).toHaveBeenCalledTimes(3)
  expect(vi.mocked(rescueCategoryDraft).mock.calls).toEqual([
    [12, 1, true],
    [12, 1, true],
    [12, 1, true],
  ])
  expect(
    getCategoryDraftRescueReceipt(12, 1, 'Host-local draft'),
  ).toBeUndefined()
})

test('signed-in Electron Settings cannot acknowledge deletion receipts before the native panel rescues its note file', async () => {
  // Arrange — this preload has the Electron bridge but no native note namespace.
  Object.defineProperty(window, 'electronAPI', {
    configurable: true,
    value: {},
  })
  localStorage.setItem(cursorKey, '41')
  vi.useFakeTimers()
  renderCategoryChanges()

  // Act
  await act(async () => {
    window.dispatchEvent(new Event('focus'))
    await vi.advanceTimersByTimeAsync(30_000)
  })

  // Assert — the panel remains the only renderer allowed to acknowledge its native notes.
  expect(requestInputs).toEqual([])
  expect(rescueCategoryDraft).not.toHaveBeenCalled()
  expect(localStorage.getItem(cursorKey)).toBe('41')
  delete window.electronAPI
})
