import { createSyncStoragePersister } from '@tanstack/query-sync-storage-persister'
import {
  dehydrate,
  useIsRestoring,
  useMutation,
  useQuery,
  useQueryClient,
  type QueryClient,
} from '@tanstack/react-query'
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'

import { PERSISTED_QUERY_STORAGE_KEY } from '@/lib/constants/query'
import {
  LOCAL_COMPLETIONS_STORAGE_KEY,
  LOCAL_NOTE_STORAGE_KEY,
} from '@/lib/live-editor/constants'
import { getLocalCompletionsSnapshot } from '@/lib/live-editor/localCompletionStore'
import { getLocalNote } from '@/lib/live-editor/localNoteStore'
import { createQueryClient } from '@/lib/query/createQueryClient'
import { STORAGE_KEY as REDUX_STORAGE_KEY } from '@/lib/redux/store'

const authState = vi.hoisted(() => ({ isLoaded: true, isSignedIn: true }))
vi.mock('@clerk/nextjs', () => ({ useAuth: () => authState }))

import { QueryClientProvider } from './QueryClientProvider'

const clients = new Set<QueryClient>()
const queryKey = ['persisted-journal']
const savedAt = new Date('2026-09-30T09:00:00.000Z')

/** Observes restored dates through the real provider, so invalid old metadata cannot hide behind a mocked persister. @example `<RestoredJournal fetchJournal={fetchJournal} />` */
function RestoredJournal({
  fetchJournal,
}: {
  fetchJournal: () => Promise<{ savedAt: Date; title: string }>
}) {
  const client = useQueryClient()
  clients.add(client)
  const restoring = useIsRestoring()
  const { data } = useQuery({ queryKey, queryFn: fetchJournal })
  return (
    <span>
      {restoring
        ? 'Restoring'
        : data
          ? `${data.title}: ${data.savedAt.toISOString()}`
          : 'Empty'}
    </span>
  )
}

/** Starts a held mutation against the current client, exposing the session-swap boundary used by sign-out. @example `<PendingWrite write={heldWrite} capture={capture} />` */
function PendingWrite({
  write,
  capture,
}: {
  write: () => Promise<string>
  capture: (client: QueryClient) => void
}) {
  const client = useQueryClient()
  clients.add(client)
  capture(client)
  const restoring = useIsRestoring()
  const mutation = useMutation({
    mutationFn: write,
    onSuccess: (title) => client.setQueryData(queryKey, { title }),
  })
  const { data } = useQuery<{ title: string }>({ queryKey, enabled: false })
  return (
    <>
      <button disabled={restoring} onClick={() => mutation.mutate()}>
        Save old session
      </button>
      <span>{data?.title ?? 'Empty session'}</span>
    </>
  )
}

beforeEach(() => {
  // Let React polling advance while retaining explicit control over the persister's one-second window.
  vi.useFakeTimers({ shouldAdvanceTime: true })
  vi.setSystemTime(new Date('2026-10-02T00:00:00.000Z'))
})

afterEach(async () => {
  cleanup()
  for (const client of clients) client.clear()
  clients.clear()
  // Drain throttled writes only after subscriptions and query GC timers have been detached.
  await act(async () => {
    await vi.runOnlyPendingTimersAsync()
  })
  vi.clearAllTimers()
  vi.useRealTimers()
  localStorage.clear()
  authState.isSignedIn = true
  vi.restoreAllMocks()
})

describe('QueryClientProvider persistence', () => {
  test('discards v1 metadata before hydration and preserves drafts, tasks, and settings in other storage entries', async () => {
    // Arrange
    const oldClient = createQueryClient()
    clients.add(oldClient)
    oldClient.setQueryData(queryKey, { title: 'Old cache', savedAt })
    const oldState = dehydrate(oldClient)
    // Match the prior numeric Date metadata, which v2 must never try to hydrate.
    oldState.queries[0]!.state.data = {
      json: { title: 'Old cache', savedAt: '2026-09-30T09:00:00.000Z' },
      meta: [[21, 'savedAt']],
    }
    localStorage.setItem(
      PERSISTED_QUERY_STORAGE_KEY,
      JSON.stringify({
        timestamp: Date.now(),
        buster: '',
        clientState: oldState,
      }),
    )
    localStorage.setItem(LOCAL_NOTE_STORAGE_KEY, '{"0":"My unfinished note"}')
    localStorage.setItem(REDUX_STORAGE_KEY, '{"theme":"dark"}')
    localStorage.setItem(
      LOCAL_COMPLETIONS_STORAGE_KEY,
      '{"version":1,"items":[{"id":"keep-1","title":"Keep this task","completedAt":"2026-09-30T09:00:00.000Z"}]}',
    )
    const fetchJournal = vi.fn(async () => ({
      title: 'Fresh journal',
      savedAt,
    }))

    // Act
    render(
      <QueryClientProvider>
        <RestoredJournal fetchJournal={fetchJournal} />
      </QueryClientProvider>,
    )

    // Assert
    expect(
      await screen.findByText('Fresh journal: 2026-09-30T09:00:00.000Z'),
    ).toBeVisible()
    expect(fetchJournal).toHaveBeenCalledTimes(1)
    expect(screen.queryByText(/Old cache/)).not.toBeInTheDocument()
    // Inspect the replacement cache after the production throttle has had time to write it.
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1000)
    })
    const persisted: unknown = JSON.parse(
      localStorage.getItem(PERSISTED_QUERY_STORAGE_KEY)!,
    )
    expect(persisted).toMatchObject({
      buster: 'orpc-v2',
      clientState: {
        queries: [
          {
            state: {
              data: {
                json: {
                  title: 'Fresh journal',
                  savedAt: '2026-09-30T09:00:00.000Z',
                },
                meta: [['date', 'savedAt']],
              },
            },
          },
        ],
      },
    })
    expect(localStorage.getItem(PERSISTED_QUERY_STORAGE_KEY)).not.toContain(
      'Old cache',
    )
    expect(JSON.stringify({ '0': getLocalNote(0) })).toBe(
      '{"0":"My unfinished note"}',
    )
    expect(localStorage.getItem(REDUX_STORAGE_KEY)).toBe('{"theme":"dark"}')
    expect(getLocalCompletionsSnapshot()).toBe(
      '{"version":1,"items":[{"id":"keep-1","title":"Keep this task","completedAt":"2026-09-30T09:00:00.000Z"}]}',
    )
  })

  test('restores fresh v2 persisted dates without issuing another journal request', async () => {
    // Arrange
    const seedClient = createQueryClient()
    clients.add(seedClient)
    seedClient.setQueryData(queryKey, { title: 'Saved journal', savedAt })
    const persister = createSyncStoragePersister({
      storage: localStorage,
      key: PERSISTED_QUERY_STORAGE_KEY,
      throttleTime: 0,
    })
    await persister.persistClient({
      timestamp: Date.now(),
      buster: 'orpc-v2',
      clientState: dehydrate(seedClient),
    })
    await waitFor(() =>
      expect(localStorage.getItem(PERSISTED_QUERY_STORAGE_KEY)).not.toBeNull(),
    )
    const fetchJournal = vi.fn(async () => ({
      title: 'Duplicate request',
      savedAt,
    }))

    // Act
    render(
      <QueryClientProvider>
        <RestoredJournal fetchJournal={fetchJournal} />
      </QueryClientProvider>,
    )

    // Assert
    expect(
      await screen.findByText('Saved journal: 2026-09-30T09:00:00.000Z'),
    ).toBeVisible()
    expect(fetchJournal).not.toHaveBeenCalled()
  })

  test('restores fresh Home data from a six-day-old v2 envelope but expires envelopes older than seven days', async () => {
    // Arrange
    const seedClient = createQueryClient()
    clients.add(seedClient)
    seedClient.setQueryData(queryKey, { title: 'Saved journal', savedAt })
    const state = dehydrate(seedClient)
    localStorage.setItem(
      PERSISTED_QUERY_STORAGE_KEY,
      JSON.stringify({
        timestamp: Date.now() - 6 * 86_400_000,
        buster: 'orpc-v2',
        clientState: state,
      }),
    )
    const fetchJournal = vi.fn(async () => ({
      title: 'Fresh journal',
      savedAt,
    }))
    const view = render(
      <QueryClientProvider>
        <RestoredJournal fetchJournal={fetchJournal} />
      </QueryClientProvider>,
    )
    expect(
      await screen.findByText('Saved journal: 2026-09-30T09:00:00.000Z'),
    ).toBeVisible()
    expect(fetchJournal).not.toHaveBeenCalled()
    view.unmount()
    localStorage.setItem(
      PERSISTED_QUERY_STORAGE_KEY,
      JSON.stringify({
        timestamp: Date.now() - 604_800_001,
        buster: 'orpc-v2',
        clientState: state,
      }),
    )

    // Act
    render(
      <QueryClientProvider>
        <RestoredJournal fetchJournal={fetchJournal} />
      </QueryClientProvider>,
    )

    // Assert
    expect(
      await screen.findByText('Fresh journal: 2026-09-30T09:00:00.000Z'),
    ).toBeVisible()
    expect(fetchJournal).toHaveBeenCalledTimes(1)
  })

  test('isolates old pending mutation callbacks from the replacement client after sign-out', async () => {
    // Arrange
    let finishWrite!: (title: string) => void
    const pendingWrite = new Promise<string>((resolve) => {
      finishWrite = resolve
    })
    let currentClient!: QueryClient
    const capture = (client: QueryClient) => {
      currentClient = client
    }
    localStorage.setItem(LOCAL_NOTE_STORAGE_KEY, '{"0":"Preserved draft"}')
    const view = render(
      <QueryClientProvider>
        <PendingWrite write={async () => pendingWrite} capture={capture} />
      </QueryClientProvider>,
    )
    await waitFor(() =>
      expect(
        screen.getByRole('button', { name: 'Save old session' }),
      ).toBeEnabled(),
    )
    const oldClient = currentClient
    fireEvent.click(screen.getByRole('button', { name: 'Save old session' }))
    await waitFor(() =>
      expect(oldClient.getMutationCache().getAll()).toHaveLength(1),
    )

    // Act
    authState.isSignedIn = false
    view.rerender(
      <QueryClientProvider>
        <PendingWrite write={async () => pendingWrite} capture={capture} />
      </QueryClientProvider>,
    )
    await waitFor(() => expect(currentClient).not.toBe(oldClient))
    await act(async () => {
      finishWrite('Old account result')
      await pendingWrite
    })

    // Assert
    await waitFor(() =>
      expect(oldClient.getQueryData(queryKey)).toEqual({
        title: 'Old account result',
      }),
    )
    expect(currentClient.getQueryData(queryKey)).toBeUndefined()
    expect(screen.getByText('Empty session')).toBeVisible()
    // The old generation may flush an empty snapshot, but it must never persist its late account result.
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1000)
    })
    const persisted = localStorage.getItem(PERSISTED_QUERY_STORAGE_KEY)
    expect(persisted).not.toContain('Old account result')
    if (persisted !== null) {
      expect(JSON.parse(persisted)).toMatchObject({
        buster: 'orpc-v2',
        clientState: { queries: [], mutations: [] },
      })
    }
    expect(currentClient.getQueryData(queryKey)).toBeUndefined()
    expect(screen.getByText('Empty session')).toBeVisible()
    expect(JSON.stringify({ '0': getLocalNote(0) })).toBe(
      '{"0":"Preserved draft"}',
    )
  })
})
