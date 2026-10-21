import type {
  OfflineCompletion,
  OfflineEditorSnapshot,
} from '@corelive/desktop-contract/offline-workspace'
import type {
  DurableEditorSnapshot,
  DurableEditorStore,
} from '@corelive/live-editor/store'
import { Button } from '@corelive/live-editor/ui/button'
import type { RefObject } from 'react'

export type ActionFeedback = { text: string; categoryId?: number }
type FooterProps = {
  state: DurableEditorSnapshot
  main: Extract<OfflineEditorSnapshot, { phase: 'ready' }>
  store: DurableEditorStore
  details: boolean
  detailsButton: RefObject<HTMLButtonElement | null>
  onDetails: () => void
  feedback: ActionFeedback | null
  onDismiss: () => void
  onSelect: (id: number) => Promise<void>
  onUndo: (completion: OfflineCompletion) => Promise<void>
  run: (operation: () => Promise<unknown>, success?: string) => Promise<void>
}

/** Gives local safety first priority and reserves scrollable space for feedback and recovery actions.
 * @example <NativeFooter {...footerProps} />
 */
export function NativeFooter(props: FooterProps) {
  return (
    <footer
      className="max-h-40 shrink-0 overflow-y-auto border-t border-border pt-1 font-sans text-xs"
      aria-label="Writing status"
    >
      <SaveStatus {...props} />
      <SyncStatus {...props} />
      {props.state.error && props.state.save !== 'failed' && (
        <p role="alert">{props.state.error}</p>
      )}
      <ActionMessage
        feedback={props.feedback}
        onDismiss={props.onDismiss}
        onSelect={props.onSelect}
      />
      <CompletionFeedback {...props} />
    </footer>
  )
}

/** Keeps failed-save recovery beside its label; sync prompts never compete with unsafe local writing.
 * @example <SaveStatus {...props} />
 */
function SaveStatus({
  state,
  store,
  run,
  details,
  detailsButton,
  onDetails,
}: FooterProps) {
  if (state.save === 'failed')
    return (
      <div className="flex flex-wrap items-center justify-between gap-x-2">
        <p className="font-medium text-destructive" role="alert">
          Not saved on this Mac
        </p>
        <div className="flex flex-wrap gap-1">
          <Button
            className="offline-action"
            size="sm"
            variant="ghost"
            disabled={state.busy}
            onClick={() => void store.retry()}
          >
            Retry
          </Button>
          <Button
            className="offline-action"
            size="sm"
            variant="ghost"
            onClick={() =>
              void run(async () => store.copyWriting(), 'Writing copied.')
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
                void run(
                  async () => store.copyUnsavedWriting(),
                  'Unsaved categories copied with their names.',
                )
              }
            >
              Copy unsaved categories
            </Button>
          )}
        </div>
      </div>
    )
  return (
    <div className="flex flex-wrap items-center justify-between gap-x-2">
      <p className="text-muted-foreground">
        {state.save === 'saving' ? 'Saving on this Mac…' : 'Saved on this Mac'}
      </p>
      <Button
        ref={detailsButton}
        className="offline-action"
        variant="ghost"
        size="sm"
        aria-expanded={details}
        aria-controls="completion-details"
        onClick={onDetails}
      >
        {details ? 'Close details' : 'Details'}
      </Button>
    </div>
  )
}

/** Names the synchronized object explicitly so pending completions cannot imply draft CloudSync.
 * @example <SyncStatus {...props} />
 */
function SyncStatus({ state, main, store, run }: FooterProps) {
  if (state.save === 'failed') return null
  const count = main.workspace.pendingCount
  const pending =
    count === 0
      ? 'No completion updates pending'
      : `${count} completion ${count === 1 ? 'update' : 'updates'} pending`
  const copy = {
    offline: `Offline · ${pending}`,
    syncing: 'Syncing completion updates…',
    'sign-in-required': 'Sign in to sync completions',
    idle: pending,
  }[main.sync]
  return (
    <div className="flex flex-wrap items-center gap-x-2 text-muted-foreground">
      <p>{copy}</p>
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
  if (!state.notice || state.save === 'failed') return null
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
