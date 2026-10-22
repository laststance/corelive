import type {
  OfflineCompletion,
  OfflineEditorSnapshot,
} from '@corelive/desktop-contract/offline-workspace'
import type {
  DurableEditorSnapshot,
  DurableEditorStore,
} from '@corelive/live-editor/store'
import { Button } from '@corelive/live-editor/ui/button'
import { AlertCircle, Undo2 } from 'lucide-react'
import { useEffect, useRef, type RefObject } from 'react'

export type ActionFeedback = {
  text: string
  categoryId?: number
  expiresAt?: number
}
export type ActionOutcome = {
  success: string
  failure?: string
  durationMs?: number
}
type FooterProps = {
  state: DurableEditorSnapshot
  retrying: boolean
  onRetry: () => Promise<void>
  main: Extract<OfflineEditorSnapshot, { phase: 'ready' }>
  store: DurableEditorStore
  details: boolean
  detailsButton: RefObject<HTMLButtonElement | null>
  onDetails: () => void
  feedback: ActionFeedback | null
  onDismiss: () => void
  onSelect: (id: number) => Promise<void>
  onUndo: (completion: OfflineCompletion) => Promise<void>
  run: (
    operation: () => Promise<unknown>,
    outcome?: ActionOutcome,
  ) => Promise<void>
}

/** Keeps routine save and sync text within a fixed 48px footprint.
 * Actions live in the header and Details, so background work cannot resize writing.
 * @example <NativeFooter {...props} />
 */
export function NativeFooter(props: FooterProps) {
  return (
    <footer
      className="offline-status-footer h-12 shrink-0 overflow-hidden py-1 font-sans text-xs"
      aria-label="Writing status"
      aria-live="polite"
    >
      <p className="truncate leading-5">{saveCopy(props.state)}</p>
      <p className="truncate leading-5 text-muted-foreground">
        {syncCopy(props.main)}
      </p>
    </footer>
  )
}

/** Provides the same recovery entry and Undo slot in every save/sync state.
 * {@link PreparedEditor} keeps this mounted independently of footer visibility.
 * @example <NativeHeaderActions {...props} />
 */
export function NativeHeaderActions(props: FooterProps) {
  const { state, main, details, detailsButton, onDetails, onUndo } = props
  const completion = state.notice
    ? main.workspace.recentUndo.find((entry) => entry.id === state.notice?.id)
    : undefined
  const failed = state.save === 'failed'
  const attention =
    main.sync === 'sign-in-required' ||
    Boolean(state.error) ||
    main.workspace.blockedCount > 0
  const label = props.retrying
    ? 'Saving'
    : failed
      ? state.busy
        ? 'Saving'
        : 'Not saved'
      : attention
        ? 'Attention'
        : 'Details'
  const recovery = useRef<HTMLSpanElement>(null)
  const previousSave = useRef(state.save)
  useEffect(() => {
    // Announce one confirmed recovery, even when routine status announcements are hidden.
    if (recovery.current)
      recovery.current.textContent =
        previousSave.current === 'failed' && state.save === 'saved'
          ? 'Saved on this Mac'
          : ''
    // eslint-disable-next-line react-you-might-not-need-an-effect/no-event-handler -- retain the prior external-store state for the live-region transition
    if (state.save !== 'saving') previousSave.current = state.save
  }, [state.save])
  return (
    <div className="flex shrink-0 items-center gap-1">
      <Button
        ref={detailsButton}
        className="h-11 w-24 px-2"
        variant="ghost"
        aria-expanded={details}
        aria-controls="completion-details"
        aria-label={
          failed
            ? 'Not saved on this Mac. Open details and recovery'
            : attention
              ? 'Completion updates need attention. Open details'
              : 'Details'
        }
        onClick={onDetails}
      >
        {label}
      </Button>
      <div className="size-11 shrink-0">
        {completion && (
          <Button
            className="size-11 p-0"
            variant="ghost"
            aria-label="Undo last completion"
            disabled={state.busy}
            onClick={() => void onUndo(completion)}
          >
            <Undo2 className="size-4" aria-hidden="true" />
          </Button>
        )}
      </div>
      <span ref={recovery} className="sr-only" role="status" />
      <span className="sr-only" role="alert">
        {failed
          ? 'Not saved on this Mac. Open Details to retry or copy your writing.'
          : (state.error ?? '')}
      </span>
      <span className="sr-only" role="status">
        {!details && props.feedback
          ? 'Action result available in Details.'
          : ''}
      </span>
    </div>
  )
}

/** Retains recovery and action feedback inside the existing scrollable Details pane.
 * @example <NativeStatusActions {...props} />
 */
export function NativeStatusActions(props: FooterProps) {
  return (
    <div className="space-y-3 border-b border-border pb-3">
      <SaveStatus {...props} />
      <SyncStatus {...props} />
      {props.state.error && <p>{props.state.error}</p>}
      <ActionMessage
        feedback={props.feedback}
        onDismiss={props.onDismiss}
        onSelect={props.onSelect}
      />
      <CompletionFeedback {...props} />
    </div>
  )
}

/** Describes local persistence without implying that pending writing is durable.
 * @example saveCopy(state)
 */
function saveCopy(state: DurableEditorSnapshot): string {
  return state.save === 'failed'
    ? 'Not saved on this Mac'
    : state.save === 'saving'
      ? 'Saving on this Mac…'
      : 'Saved on this Mac'
}

/** Separates completion synchronization from local writing safety.
 * @example syncCopy(main)
 */
function syncCopy(main: FooterProps['main']): string {
  const count = main.workspace.pendingCount
  const pending =
    count === 0
      ? 'No completion updates pending'
      : `${count} completion ${count === 1 ? 'update' : 'updates'} pending`
  return {
    offline: `Offline · ${pending}`,
    syncing: 'Syncing completion updates…',
    'sign-in-required': 'Sign in to sync completions',
    idle: pending,
  }[main.sync]
}

/** Keeps failed-save recovery beside its label; sync prompts never compete with unsafe local writing.
 * @example <SaveStatus {...props} />
 */
function SaveStatus({ state, store, run, retrying, onRetry }: FooterProps) {
  if (state.save === 'failed' || retrying)
    return (
      <div className="flex flex-wrap items-center justify-between gap-x-2">
        <p className="flex items-center gap-1 font-medium text-foreground">
          <AlertCircle
            className="size-4 shrink-0 text-destructive"
            aria-hidden="true"
          />
          {retrying ? 'Saving on this Mac…' : 'Not saved on this Mac'}
        </p>
        <div className="flex flex-wrap gap-1">
          <Button
            className="offline-action"
            size="sm"
            variant="ghost"
            disabled={state.busy || retrying}
            onClick={() => void onRetry()}
          >
            Retry
          </Button>
          <Button
            className="offline-action"
            size="sm"
            variant="ghost"
            onClick={() =>
              void run(async () => store.copyWriting(), {
                success: 'Copied',
                failure:
                  'Could not copy. Close Details, then select your writing and copy it.',
                durationMs: 2000,
              })
            }
          >
            Copy writing
          </Button>
          {state.unsavedCategoryCount > 0 && (
            <Button
              className="offline-action"
              size="sm"
              variant="ghost"
              onClick={() =>
                void run(async () => store.copyUnsavedWriting(), {
                  success: 'Unsaved categories copied with their names.',
                })
              }
            >
              Copy unsaved categories
            </Button>
          )}
        </div>
      </div>
    )
  return <p className="text-muted-foreground">{saveCopy(state)}</p>
}

/** Names the synchronized object explicitly so pending completions cannot imply draft CloudSync.
 * @example <SyncStatus {...props} />
 */
function SyncStatus({ main, store, run }: FooterProps) {
  return (
    <div className="flex flex-wrap items-center gap-x-2 text-muted-foreground">
      <p>{syncCopy(main)}</p>
      {main.sync === 'sign-in-required' && (
        <Button
          className="offline-action"
          variant="ghost"
          size="sm"
          onClick={() => void run(async () => store.host.signIn())}
        >
          Sign in
        </Button>
      )}
    </div>
  )
}

/** Announces an actual action result and offers optional navigation after cross-category restoration.
 * @example <ActionMessage feedback={feedback} onDismiss={dismiss} onSelect={select} />
 */
function ActionMessage({
  feedback,
  onDismiss,
  onSelect,
}: Pick<FooterProps, 'feedback' | 'onDismiss' | 'onSelect'>) {
  if (!feedback) return null
  return (
    <div className="flex flex-wrap items-center gap-x-2">
      <p role="status">{feedback.text}</p>
      {feedback.categoryId !== undefined && (
        <Button
          className="offline-action"
          variant="ghost"
          size="sm"
          onClick={() => void onSelect(feedback.categoryId!)}
        >
          View
        </Button>
      )}
      <Button
        className="offline-action"
        variant="ghost"
        size="sm"
        aria-label="Dismiss message"
        onClick={onDismiss}
      >
        Dismiss
      </Button>
    </div>
  )
}

/** Shows only an acknowledged local completion; the store and original-deadline timer own its lifetime.
 * @example <CompletionFeedback {...props} />
 */
function CompletionFeedback({ state, main, store, onUndo }: FooterProps) {
  if (!state.notice) return null
  const completion = main.workspace.recentUndo.find(
    (entry) => entry.id === state.notice?.id,
  )
  if (!completion) return null
  return (
    <div className="flex flex-wrap items-center gap-x-2 border-t border-border">
      <p className="min-w-0 flex-1 truncate" title={completion.title}>
        Kept: {completion.title}
      </p>
      <Button
        className="offline-action"
        variant="ghost"
        size="sm"
        disabled={state.busy}
        onClick={() => void onUndo(completion)}
      >
        Undo
      </Button>
      <Button
        className="offline-action"
        variant="ghost"
        size="sm"
        aria-label="Dismiss completion"
        onClick={() => store.dismissNotice()}
      >
        Dismiss
      </Button>
    </div>
  )
}
