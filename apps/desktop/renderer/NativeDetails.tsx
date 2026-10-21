import type {
  OfflineDetailsPage,
  OfflineRecoveryPage,
  OfflineUndoPage,
} from '@corelive/desktop-contract/offline-editor-api'
import type {
  EditorCategory,
  OfflineCompletion,
  OfflineEditorSnapshot,
  OfflineWorkspace,
  WorkspaceCommand,
} from '@corelive/desktop-contract/offline-workspace'
import type { DurableEditorStore } from '@corelive/live-editor/store'
import { Button } from '@corelive/live-editor/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from '@corelive/live-editor/ui/dialog'
import { useEffect, useRef, useState } from 'react'

type ReadySnapshot = Extract<OfflineEditorSnapshot, { phase: 'ready' }>
type RecoveryCopy = OfflineWorkspace['recoveryCopies'][number]
type Repair =
  | { kind: 'category'; source: EditorCategory }
  | { kind: 'time' | 'conflict'; completion: OfflineCompletion }
  | { kind: 'recovery'; copy: RecoveryCopy }
type Pages = {
  details: OfflineDetailsPage
  undo: OfflineUndoPage
  recovery: OfflineRecoveryPage
}
const PAGE_SIZE = 20
const failureCopy = {
  'category-removed':
    'The category was removed. Choose where to keep this writing.',
  'invalid-time':
    'The completion time could not be accepted. Check the date and time.',
  conflict: 'This record changed on the server. Compare both versions.',
  dependency:
    'An earlier completion update must be confirmed first. Retry synchronization.',
} as const

/** Formats captured timestamps with their recorded zone; never rewrites a historical timestamp.
 * @example completionTime(record.originalCompletedAt, record.timezone)
 */
function completionTime(timestamp: number, timezone?: string): string {
  try {
    return new Date(timestamp).toLocaleString(undefined, {
      ...(timezone ? { timeZone: timezone } : {}),
      timeZoneName: 'short',
    })
  } catch {
    return new Date(timestamp).toISOString()
  }
}

/** Loads bounded local pages, keeping the previous rows visible during a refresh and rejecting obsolete replies.
 * No renderer network access or workspace-wide history copy is needed to open Details.
 * @example useDetailPages(store, main, offsets)
 */
function useDetailPages(
  store: DurableEditorStore,
  main: ReadySnapshot,
  offsets: { details: number; undo: number; recovery: number },
) {
  const [state, setState] = useState<{
    pages: Pages | null
    key: string
    error: boolean
  }>({ pages: null, key: '', error: false })
  const [retryVersion, setRetryVersion] = useState(0)
  const requestKey = [
    main.generation,
    main.workspace.revision,
    main.workspace.eligibleUndoCount,
    offsets.details,
    offsets.undo,
    offsets.recovery,
    retryVersion,
  ].join(':')
  useEffect(() => {
    let stale = false
    void Promise.all([
      store.host.details(main.generation, offsets.details, PAGE_SIZE),
      store.host.undoHistory(main.generation, offsets.undo, PAGE_SIZE),
      store.host.recoveryCopies(main.generation, offsets.recovery, PAGE_SIZE),
    ])
      .then(([details, undo, recovery]) => {
        if (!stale)
          setState({
            pages: { details, undo, recovery },
            key: requestKey,
            error: false,
          })
      })
      .catch(() => {
        if (!stale)
          setState((previous) => ({
            ...previous,
            key: requestKey,
            error: true,
          }))
      })
    return (): void => {
      stale = true
    }
  }, [
    store,
    main.generation,
    main.workspace.revision,
    main.workspace.eligibleUndoCount,
    offsets.details,
    offsets.undo,
    offsets.recovery,
    retryVersion,
    requestKey,
  ])
  return {
    ...state,
    loading: state.key !== requestKey,
    retry: (): void => setRetryVersion((value) => value + 1),
  }
}

/** Presents blocked completion identities first, plus original-deadline Undo and preserved writing copies.
 * Repairs open a focus-trapped dialog above this panel; Escape closes only the topmost surface.
 * @example <NativeDetails store={store} main={main} busy={busy} onClose={close} onUndo={undo} onSelect={select} onFeedback={announce} />
 */
export function NativeDetails({
  store,
  main,
  busy,
  onClose,
  onUndo,
  onSelect,
  onFeedback,
}: {
  store: DurableEditorStore
  main: ReadySnapshot
  busy: boolean
  onClose: () => void
  onUndo: (completion: OfflineCompletion) => Promise<void>
  onSelect: (categoryId: number) => Promise<void>
  onFeedback: (text: string) => void
}) {
  const heading = useRef<HTMLHeadingElement>(null)
  const repairOpener = useRef<HTMLElement | null>(null)
  const [offsets, setOffsets] = useState({ details: 0, undo: 0, recovery: 0 })
  const [repair, setRepair] = useState<Repair | null>(null)
  const id = repair ? JSON.stringify(repair) : undefined
  const data = useDetailPages(store, main, offsets)
  const categories = main.workspace.categories
  const openRepair = (next: Repair): void => {
    // These dialogs open without a Radix Trigger, so retain their actual opener.
    repairOpener.current =
      document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null
    setRepair(next)
  }
  useEffect(() => {
    heading.current?.focus()
  }, [])
  const categoryName = (id: number): string =>
    categories.find((category) => category.id === id)?.name ??
    `Removed category ${id}`
  const paginate = (kind: keyof typeof offsets, total: number) =>
    total > PAGE_SIZE || offsets[kind] > 0 ? (
      <nav
        aria-label={`${kind} pages`}
        className="flex flex-wrap items-center gap-2"
      >
        <Button
          className="offline-action"
          size="sm"
          variant="outline"
          disabled={offsets[kind] === 0 || data.loading}
          onClick={() => {
            // Pagination may disable its own button; keep Escape within Details.
            heading.current?.focus()
            setOffsets((current) => ({
              ...current,
              [kind]: Math.max(0, current[kind] - PAGE_SIZE),
            }))
          }}
        >
          Previous
        </Button>
        <span className="text-xs text-muted-foreground">
          {total === 0 ? '0' : Math.min(offsets[kind] + 1, total)}–
          {Math.min(offsets[kind] + PAGE_SIZE, total)} of {total}
        </span>
        <Button
          className="offline-action"
          size="sm"
          variant="outline"
          disabled={offsets[kind] + PAGE_SIZE >= total || data.loading}
          onClick={() => {
            // Pagination may disable its own button; keep Escape within Details.
            heading.current?.focus()
            setOffsets((current) => ({
              ...current,
              [kind]: current[kind] + PAGE_SIZE,
            }))
          }}
        >
          Next
        </Button>
      </nav>
    ) : null

  return (
    <section
      id="completion-details"
      aria-labelledby="completion-details-title"
      className="min-h-16 min-w-0 flex-1 space-y-4 overflow-y-auto rounded border border-border bg-popover p-3 text-sm text-popover-foreground"
      onKeyDown={(event) => {
        if (event.key === 'Escape' && !event.defaultPrevented && !repair) {
          event.preventDefault()
          event.stopPropagation()
          onClose()
        }
      }}
    >
      <div className="flex items-start justify-between gap-2">
        <h2
          id="completion-details-title"
          ref={heading}
          tabIndex={-1}
          className="rounded text-base font-semibold outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          Completion details
        </h2>
        <Button
          className="offline-action"
          variant="ghost"
          size="sm"
          onClick={onClose}
        >
          Close
        </Button>
      </div>
      <p className="text-xs text-muted-foreground">
        Completed records and their updates sync to your account. Drafts stay on
        this Mac.
      </p>
      <DetailsConnection main={main} store={store} onFeedback={onFeedback} />
      {data.error && (
        <div role="alert">
          <p>Could not load details. Your writing is still available.</p>
          <Button
            className="offline-action"
            variant="outline"
            onClick={data.retry}
          >
            Retry details
          </Button>
        </div>
      )}
      {data.loading && !data.pages && (
        <p role="status">Loading saved details…</p>
      )}
      <RemovedCategories
        categories={categories}
        busy={busy}
        onRepair={openRepair}
      />
      {data.pages && (
        <>
          <section
            aria-label="Pending completion updates"
            aria-busy={data.loading}
            className="space-y-2"
          >
            <h3 className="font-medium">Completion updates</h3>
            {data.pages.details.total === 0 && (
              <p>No completion updates pending</p>
            )}
            {data.pages.details.records.map(({ entry, completion }) => (
              <article
                key={completion.id}
                className="space-y-1 border-t border-border py-3"
              >
                <p className="whitespace-pre-wrap break-words font-medium">
                  {completion.title}
                </p>
                <p className="break-words text-xs text-muted-foreground">
                  {categoryName(completion.categoryId)} ·{' '}
                  {completionTime(completion.completedAt, completion.timezone)}
                </p>
                {completion.originalCategoryId !== completion.categoryId && (
                  <p className="text-xs">
                    Originally in {categoryName(completion.originalCategoryId)}
                  </p>
                )}
                {completion.originalCompletedAt !== completion.completedAt && (
                  <p className="text-xs">
                    Original time:{' '}
                    {completionTime(
                      completion.originalCompletedAt,
                      completion.timezone,
                    )}
                  </p>
                )}
                <p className="text-xs">
                  {entry.state === 'blocked'
                    ? entry.failure
                      ? failureCopy[entry.failure]
                      : 'Needs attention'
                    : completion.cancelled
                      ? 'Cancellation waiting to sync'
                      : 'Waiting to sync'}
                </p>
                <PendingActions
                  entry={entry}
                  completion={completion}
                  categories={categories}
                  busy={busy}
                  loading={data.loading}
                  onRepair={openRepair}
                  store={store}
                />
              </article>
            ))}
            {paginate('details', data.pages.details.total)}
          </section>
          <section aria-label="Recent completions" className="space-y-2">
            <h3 className="font-medium">Recent completions</h3>
            <p className="text-xs text-muted-foreground">
              Undo keeps its original deadline, including after a restart.
            </p>
            {data.pages.undo.total === 0 && (
              <p>No completions available to undo.</p>
            )}
            {data.pages.undo.completions.map((completion) => (
              <div
                key={completion.id}
                className="space-y-1 border-t border-border py-2"
              >
                <p className="whitespace-pre-wrap break-words">
                  {completion.title}
                </p>
                <p className="text-xs text-muted-foreground">
                  {categoryName(completion.categoryId)} · Undo until{' '}
                  {completionTime(completion.undoUntil)}
                </p>
                <Button
                  className="offline-action"
                  variant="outline"
                  disabled={busy || data.loading}
                  onClick={() => void onUndo(completion)}
                >
                  Undo
                </Button>
              </div>
            ))}
            {paginate('undo', data.pages.undo.total)}
          </section>
          <section aria-label="Preserved writing" className="space-y-2">
            <h3 className="font-medium">Preserved writing</h3>
            {data.pages.recovery.total === 0 && (
              <p>No additional recovery copies.</p>
            )}
            {data.pages.recovery.copies.map((copy) => (
              <article
                key={copy.id}
                className="space-y-2 border-t border-border py-2"
              >
                <p className="text-xs text-muted-foreground">
                  {categoryName(copy.categoryId)} ·{' '}
                  {completionTime(copy.createdAt)}
                </p>
                <pre className="max-h-40 overflow-auto whitespace-pre-wrap break-words text-xs">
                  {copy.text}
                </pre>
                <div className="flex flex-wrap gap-1">
                  <Button
                    className="offline-action"
                    variant="outline"
                    onClick={() =>
                      void store.host
                        .copyWriting(main.generation, copy.text)
                        .then((copied) =>
                          onFeedback(
                            copied
                              ? 'Preserved writing copied.'
                              : 'Could not copy writing. Please try again.',
                          ),
                        )
                        .catch(() =>
                          onFeedback(
                            'Could not copy writing. Please try again.',
                          ),
                        )
                    }
                  >
                    Copy preserved writing
                  </Button>
                  {copy.restoredTo === undefined ? (
                    <Button
                      className="offline-action"
                      variant="outline"
                      disabled={busy || data.loading}
                      onClick={() => openRepair({ kind: 'recovery', copy })}
                    >
                      Restore writing
                    </Button>
                  ) : (
                    <Button
                      className="offline-action"
                      variant="ghost"
                      onClick={() => void onSelect(copy.restoredTo!)}
                    >
                      View restored writing
                    </Button>
                  )}
                </div>
              </article>
            ))}
            {paginate('recovery', data.pages.recovery.total)}
          </section>
        </>
      )}
      <Button
        className="offline-action"
        variant="outline"
        disabled={busy}
        onClick={() =>
          void store
            .flush()
            .then(async (saved) => {
              if (saved)
                onFeedback(
                  (await store.host.export(main.generation))
                    ? 'Writing exported.'
                    : 'Export was not completed.',
                )
              else
                onFeedback(
                  'Save failed. Copy your live writing before exporting saved files.',
                )
            })
            .catch(() =>
              onFeedback('Could not export writing. Please try again.'),
            )
        }
      >
        Export writing
      </Button>
      {repair && (
        <RepairDialog
          key={id}
          repair={repair}
          main={main}
          store={store}
          onClose={(saved) => {
            // Saved repairs can remove their action on the next page refresh.
            if (saved) repairOpener.current = null
            setRepair(null)
          }}
          restoreFocus={() => {
            const opener = repairOpener.current
            if (opener?.isConnected && !opener.matches(':disabled'))
              opener.focus()
            else heading.current?.focus()
          }}
          onFeedback={onFeedback}
        />
      )}
    </section>
  )
}

/** Confirms category, time or version changes before invoking one durable command; alternate writing remains preserved.
 * @example <RepairDialog repair={repair} main={main} store={store} onClose={close} onFeedback={announce} />
 */
function RepairDialog({
  repair,
  main,
  store,
  onClose,
  restoreFocus,
  onFeedback,
}: {
  repair: Repair
  main: ReadySnapshot
  store: DurableEditorStore
  onClose: (saved: boolean) => void
  restoreFocus: () => void
  onFeedback: (text: string) => void
}) {
  const destinations = main.workspace.categories.filter(
    (category) =>
      !category.removed &&
      (repair.kind !== 'category' || category.id !== repair.source.id),
  )
  const suggestion =
    repair.kind === 'category'
      ? main.workspace.categoryDeletions[String(repair.source.id)]
      : repair.kind === 'recovery'
        ? repair.copy.categoryId
        : undefined
  const [destination, setDestination] = useState(
    String(
      destinations.find((category) => category.id === suggestion)?.id ??
        destinations[0]?.id ??
        '',
    ),
  )
  const [time, setTime] = useState(() => {
    if (repair.kind !== 'time') return ''
    const date = new Date(Math.min(repair.completion.completedAt, Date.now()))
    return new Date(date.getTime() - date.getTimezoneOffset() * 60000)
      .toISOString()
      .slice(0, 16)
  })
  const [pending, setPending] = useState(false)
  const [error, setError] = useState('')
  const submit = async (choice?: 'server' | 'local'): Promise<void> => {
    if (pending) return
    const command = repairCommand(repair, destination, time, choice)
    if (!command) {
      setError('Choose a valid date and time that is not in the future.')
      return
    }
    setPending(true)
    setError('')
    try {
      if (await store.command(command)) {
        onFeedback(
          'Change saved on this Mac. Completion updates will sync when connected.',
        )
        onClose(true)
      } else
        setError(
          store.getSnapshot().error ??
            'Could not save this change. Retry or copy your writing.',
        )
    } catch {
      setError('Could not save this change. Retry or copy your writing.')
    } finally {
      setPending(false)
    }
  }
  const title = repairTitles[repair.kind]
  const categoryName = (id: number): string =>
    main.workspace.categories.find((category) => category.id === id)?.name ??
    `Removed category ${id}`
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open && !pending) onClose(false)
      }}
    >
      <DialogContent
        showCloseButton={false}
        className="max-h-[calc(100dvh-1rem)] gap-3 overflow-y-auto p-4"
        onCloseAutoFocus={(event) => {
          event.preventDefault()
          restoreFocus()
        }}
        onEscapeKeyDown={(event) => {
          event.stopPropagation()
          if (pending) event.preventDefault()
        }}
        onPointerDownOutside={(event) => {
          if (pending) event.preventDefault()
        }}
      >
        <DialogTitle>{title}</DialogTitle>
        <RepairDescription repair={repair} />
        <RepairFields
          repair={repair}
          destinations={destinations}
          destination={destination}
          setDestination={setDestination}
          time={time}
          setTime={setTime}
          pending={pending}
          categoryName={categoryName}
        />
        {error && (
          <div role="alert" className="space-y-1">
            <p>{error}</p>
            <Button
              className="offline-action"
              variant="outline"
              onClick={() =>
                void store
                  .copyWriting()
                  .then((copied) =>
                    setError(
                      copied
                        ? 'Writing copied. You can retry this change or cancel.'
                        : 'Could not copy writing. Please try again.',
                    ),
                  )
              }
            >
              Copy writing
            </Button>
          </div>
        )}
        <RepairActions
          repair={repair}
          pending={pending}
          destination={destination}
          submit={submit}
          onClose={() => onClose(false)}
        />
      </DialogContent>
    </Dialog>
  )
}

/** Offers the repair matching a definite server rejection; uncertain deliveries remain immutable.
 * @example <PendingActions {...props} />
 */
function PendingActions({
  entry,
  completion,
  categories,
  busy,
  loading,
  onRepair,
  store,
}: {
  entry: OfflineDetailsPage['records'][number]['entry']
  completion: OfflineCompletion
  categories: EditorCategory[]
  busy: boolean
  loading: boolean
  onRepair: (repair: Repair) => void
  store: DurableEditorStore
}) {
  if (entry.state !== 'blocked') return null
  const disabled = busy || loading
  return (
    <div className="flex flex-wrap gap-1">
      {entry.failure === 'category-removed' && (
        <Button
          className="offline-action"
          size="sm"
          variant="outline"
          disabled={disabled}
          onClick={() => {
            const source = categories.find(
              (category) => category.id === completion.categoryId,
            )
            if (source) onRepair({ kind: 'category', source })
          }}
        >
          Choose category
        </Button>
      )}
      {entry.failure === 'invalid-time' && (
        <Button
          className="offline-action"
          size="sm"
          variant="outline"
          disabled={disabled}
          onClick={() => onRepair({ kind: 'time', completion })}
        >
          Correct time
        </Button>
      )}
      {entry.failure === 'conflict' && completion.remote && (
        <Button
          className="offline-action"
          size="sm"
          variant="outline"
          disabled={disabled}
          onClick={() => onRepair({ kind: 'conflict', completion })}
        >
          Compare versions
        </Button>
      )}
      {entry.failure === 'dependency' && (
        <Button
          className="offline-action"
          size="sm"
          variant="outline"
          disabled={busy}
          onClick={() =>
            void store.command({
              type: 'retrySync',
              commandId: crypto.randomUUID(),
              completionId: completion.id,
            })
          }
        >
          Retry sync
        </Button>
      )}
    </div>
  )
}

/** Keeps removed-category writing visible and offers an explicit destination choice.
 * @example <RemovedCategories categories={categories} busy={busy} onRepair={setRepair} />
 */
function RemovedCategories({
  categories,
  busy,
  onRepair,
}: {
  categories: EditorCategory[]
  busy: boolean
  onRepair: (repair: Repair) => void
}) {
  if (!categories.some((category) => category.removed)) return null
  return (
    <section aria-label="Removed categories" className="space-y-2">
      <h3 className="font-medium">Removed categories</h3>
      {categories
        .filter((category) => category.removed)
        .map((category) => (
          <div key={category.id} className="border-t border-border py-2">
            <p className="break-words">{category.name}</p>
            <Button
              className="offline-action"
              variant="outline"
              disabled={busy}
              onClick={() => onRepair({ kind: 'category', source: category })}
            >
              Move writing
            </Button>
          </div>
        ))}
    </section>
  )
}

/** Explains which online operations remain unavailable without blocking local repairs.
 * @example <DetailsConnection main={main} store={store} onFeedback={announce} />
 */
function DetailsConnection({
  main,
  store,
  onFeedback,
}: {
  main: ReadySnapshot
  store: DurableEditorStore
  onFeedback: (text: string) => void
}) {
  return (
    <>
      {' '}
      {main.sync === 'offline' && (
        <p>
          Connect to manage categories. You can still move writing to another
          saved category below.
        </p>
      )}
      {main.sync === 'sign-in-required' && (
        <Button
          className="offline-action"
          variant="outline"
          onClick={() =>
            void store.host
              .signIn()
              .catch(() =>
                onFeedback('Could not open sign in. Please try again.'),
              )
          }
        >
          Sign in to sync completions
        </Button>
      )}
    </>
  )
}

/** Converts confirmed inputs into a typed command, rejecting invalid times before IPC.
 * @example const command = repairCommand(repair, destination, time, choice)
 */
function repairCommand(
  repair: Repair,
  destination: string,
  time: string,
  choice?: 'server' | 'local',
): WorkspaceCommand | null {
  const commandId = crypto.randomUUID()
  if (repair.kind === 'category')
    return {
      type: 'moveCategory',
      commandId,
      sourceId: repair.source.id,
      destinationId: Number(destination),
    }
  else if (repair.kind === 'recovery')
    return {
      type: 'restoreRecovery',
      commandId,
      copyId: repair.copy.id,
      destinationId: Number(destination),
    }
  else if (repair.kind === 'conflict')
    return {
      type: 'resolveConflict',
      commandId,
      completionId: repair.completion.id,
      choice: choice ?? 'server',
      expectedLocalRevision: repair.completion.revision,
      expectedRemoteRevision: repair.completion.remote?.revision ?? 0,
    }
  else {
    const completedAt = new Date(time).getTime()
    if (
      !Number.isFinite(completedAt) ||
      completedAt < 0 ||
      completedAt > Date.now()
    ) {
      return null
    }
    return {
      type: 'correctTime',
      commandId,
      completionId: repair.completion.id,
      completedAt,
    }
  }
}

/** Shows destination inputs, original timestamps or the two compared versions for one repair.
 * @example <RepairFields {...props} />
 */
function RepairFields({
  repair,
  destinations,
  destination,
  setDestination,
  time,
  setTime,
  pending,
  categoryName,
}: {
  repair: Repair
  destinations: EditorCategory[]
  destination: string
  setDestination: (value: string) => void
  time: string
  setTime: (value: string) => void
  pending: boolean
  categoryName: (id: number) => string
}) {
  return (
    <>
      {' '}
      {(repair.kind === 'category' || repair.kind === 'recovery') && (
        <label className="space-y-1 text-sm">
          Destination category
          <select
            className="offline-field"
            value={destination}
            disabled={pending}
            onChange={(event) => setDestination(event.target.value)}
          >
            {destinations.map((category) => (
              <option key={category.id} value={category.id}>
                {category.name}
              </option>
            ))}
          </select>
          {!destinations.length && (
            <span>Connect to create another category first.</span>
          )}
        </label>
      )}
      {repair.kind === 'time' && (
        <div className="space-y-3 text-sm">
          <p>
            Original:{' '}
            {completionTime(
              repair.completion.originalCompletedAt,
              repair.completion.timezone,
            )}
          </p>
          <p>Recorded time zone: {repair.completion.timezone}</p>
          <label className="block space-y-1">
            Corrected time ({Intl.DateTimeFormat().resolvedOptions().timeZone}
            )
            <input
              type="datetime-local"
              className="offline-field"
              value={time}
              disabled={pending}
              onChange={(event) => setTime(event.target.value)}
            />
          </label>
        </div>
      )}
      {repair.kind === 'conflict' && (
        <div className="space-y-3 text-sm">
          <section className="space-y-1 border-t border-border pt-2">
            <h3 className="font-medium">On this Mac</h3>
            <p className="whitespace-pre-wrap break-words">
              {repair.completion.title}
            </p>
            <p>
              {categoryName(repair.completion.categoryId)} ·{' '}
              {completionTime(
                repair.completion.completedAt,
                repair.completion.timezone,
              )}
            </p>
          </section>
          <section className="space-y-1 border-t border-border pt-2">
            <h3 className="font-medium">On the server</h3>
            <p className="whitespace-pre-wrap break-words">
              {repair.completion.remote?.title}
            </p>
            {repair.completion.remote && (
              <p>
                {categoryName(repair.completion.remote.categoryId)} ·{' '}
                {completionTime(repair.completion.remote.completedAt)}
                {repair.completion.remote.cancelled ? ' · Cancelled' : ''}
              </p>
            )}
          </section>
        </div>
      )}
    </>
  )
}

/** Presents deliberate confirmation choices and blocks duplicate clicks during a durable commit.
 * @example <RepairActions {...props} />
 */
function RepairActions({
  repair,
  pending,
  destination,
  submit,
  onClose,
}: {
  repair: Repair
  pending: boolean
  destination: string
  submit: (choice?: 'server' | 'local') => Promise<void>
  onClose: () => void
}) {
  return (
    <div className="flex flex-wrap gap-2">
      {repair.kind === 'conflict' ? (
        <>
          <Button
            className="offline-action"
            disabled={pending}
            onClick={() => void submit('server')}
          >
            Keep server
          </Button>
          <Button
            className="offline-action"
            variant="outline"
            disabled={pending}
            onClick={() => void submit('local')}
          >
            {repair.completion.remote?.cancelled
              ? 'Restore writing'
              : 'Apply my version'}
          </Button>
        </>
      ) : (
        <Button
          className="offline-action"
          disabled={
            pending ||
            ((repair.kind === 'category' || repair.kind === 'recovery') &&
              !destination)
          }
          onClick={() => void submit()}
        >
          {pending ? 'Saving…' : 'Confirm'}
        </Button>
      )}
      <Button
        className="offline-action"
        variant="outline"
        disabled={pending}
        onClick={onClose}
      >
        Cancel
      </Button>
    </div>
  )
}

/** Explains preservation and the consequence of the currently confirmed repair.
 * @example <RepairDescription repair={repair} />
 */
function RepairDescription({ repair }: { repair: Repair }) {
  return (
    <DialogDescription>
      {repair.kind === 'category'
        ? `Move writing from ${repair.source.name}. Existing writing in the destination will be kept.`
        : repair.kind === 'time'
          ? 'Review the original time before confirming a correction. The original timestamp stays in the record.'
          : repair.kind === 'recovery'
            ? 'Append this copy to a saved category. Existing writing will be kept.'
            : 'Choose the version to keep. The alternate writing remains available in Preserved writing.'}
    </DialogDescription>
  )
}
const repairTitles = {
  category: 'Move writing',
  time: 'Correct completion time',
  recovery: 'Restore preserved writing',
  conflict: 'Compare versions',
} as const
