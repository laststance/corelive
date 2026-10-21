import type {
  OfflineEditorAPI,
  OfflineRecoveryPreview,
} from '@corelive/desktop-contract/offline-editor-api'
import type { OfflineEditorSnapshot } from '@corelive/desktop-contract/offline-workspace'
import { Button } from '@corelive/live-editor/ui/button'
import { useState } from 'react'

/** Explains startup, explicit logout and preserved-file recovery without rendering account content while locked.
 * Recovery previews are available only through main's validated same-account capability.
 * @example <NativeStateScene snapshot={snapshot} host={host} close={close} />
 */
export function NativeStateScene({
  snapshot,
  host,
  close,
}: {
  snapshot: Exclude<OfflineEditorSnapshot, { phase: 'ready' }>
  host: OfflineEditorAPI
  close: () => Promise<void>
}) {
  const [preview, setPreview] = useState<OfflineRecoveryPreview | null>(null)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')
  const run = async (
    operation: () => Promise<unknown>,
    success?: string,
  ): Promise<void> => {
    if (busy) return
    setBusy(true)
    setMessage('')
    try {
      const result = await operation()
      if (success)
        setMessage(
          result === false
            ? 'The action was not completed. Your saved files are preserved.'
            : success,
        )
    } catch {
      setMessage(
        'Could not complete that action. Your saved files are preserved. Please try again.',
      )
    } finally {
      setBusy(false)
    }
  }
  const title = stateCopy[snapshot.phase].title
  return (
    <main className="flex h-dvh min-w-0 flex-col gap-3 overflow-y-auto p-4 font-sans text-sm">
      <div className="flex items-center justify-between gap-2">
        <span className="font-semibold">CoreLive</span>
        <Button
          className="offline-action"
          variant="ghost"
          size="sm"
          aria-label="Close LiveEditor"
          onClick={() => void run(close)}
        >
          Close
        </Button>
      </div>
      <h1
        className="text-lg font-semibold"
        aria-live={snapshot.phase === 'preparing' ? 'polite' : undefined}
      >
        {title}
      </h1>
      <p>{stateCopy[snapshot.phase].description}</p>
      <div className="flex flex-wrap gap-2">
        {(snapshot.phase === 'locked' ||
          snapshot.phase === 'needs-preparation') && (
          <Button
            className="offline-action"
            disabled={busy}
            onClick={() => void run(async () => host.signIn())}
          >
            Sign in
          </Button>
        )}
        {snapshot.phase !== 'opening' && snapshot.phase !== 'locked' && (
          <Button
            className="offline-action"
            variant="outline"
            disabled={busy}
            onClick={() => void run(async () => host.retry())}
          >
            Retry
          </Button>
        )}
        {snapshot.phase === 'recovery' && (
          <>
            <Button
              className="offline-action"
              variant="outline"
              disabled={busy}
              onClick={() =>
                void run(
                  async () => host.export(snapshot.generation),
                  'Writing exported.',
                )
              }
            >
              Export files
            </Button>
            {snapshot.canRecover && (
              <Button
                className="offline-action"
                disabled={busy}
                onClick={() =>
                  void run(async () =>
                    setPreview(await host.previewRecovery(snapshot.generation)),
                  )
                }
              >
                Preview recovery copy
              </Button>
            )}
          </>
        )}
      </div>
      {preview && (
        <RecoveryPreview
          preview={preview}
          busy={busy}
          host={host}
          generation={snapshot.generation}
          run={run}
          onCancel={() => setPreview(null)}
        />
      )}
      {message && <p role="status">{message}</p>}
    </main>
  )
}

/** Shows the validated recovery copy and its file age before a deliberate restore.
 * @example <RecoveryPreview {...props} />
 */
function RecoveryPreview({
  preview,
  busy,
  host,
  generation,
  run,
  onCancel,
}: {
  preview: OfflineRecoveryPreview
  busy: boolean
  host: OfflineEditorAPI
  generation: number
  run: (operation: () => Promise<unknown>, success?: string) => Promise<void>
  onCancel: () => void
}) {
  return (
    <section
      aria-label="Recovery copy preview"
      className="space-y-3 border-t border-border pt-3"
    >
      <p>
        Recovery copy last written:{' '}
        <time dateTime={new Date(preview.savedAt).toISOString()}>
          {new Date(preview.savedAt).toLocaleString()}
        </time>
        . Saved revision {preview.workspace.revision}.
      </p>
      <p>
        Category:{' '}
        {
          preview.workspace.categories.find(
            (category) => category.id === preview.workspace.selectedCategoryId,
          )?.name
        }
      </p>
      <pre className="max-h-40 overflow-auto whitespace-pre-wrap break-words rounded border border-border p-2 text-xs">
        {preview.workspace.draft.rows.map((row) => row.text).join('\n') ||
          'No writing in this category.'}
      </pre>
      <p>
        Use this copy for all categories. More recent changes may be missing.
        The original files will remain available for recovery.
      </p>
      <div className="flex flex-wrap gap-2">
        <Button
          className="offline-action"
          disabled={busy}
          onClick={() =>
            void run(
              async () => host.recover(generation),
              'Recovery copy restored.',
            )
          }
        >
          Use this copy
        </Button>
        <Button
          className="offline-action"
          variant="outline"
          disabled={busy}
          onClick={() => onCancel()}
        >
          Cancel
        </Button>
      </div>
    </section>
  )
}

const stateCopy = {
  opening: {
    title: 'Opening your writing…',
    description: 'Opening locally saved writing.',
  },
  preparing: {
    title: 'Preparing offline access…',
    description:
      'Keep this window open while your account, categories and settings are prepared.',
  },
  locked: {
    title: 'Signed out',
    description:
      'Saved writing stays on this Mac. Sign in with the same account to open it again. You will need an internet connection.',
  },
  'needs-preparation': {
    title: 'Connect once to prepare this Mac.',
    description:
      'Your existing writing is preserved. Connect to the internet and sign in once to prepare offline access. Preparation resumes automatically when the connection returns.',
  },
  recovery: {
    title: 'Your writing needs recovery',
    description:
      'CoreLive could not safely open the saved workspace. The original files are preserved. Preview an available recovery copy or export your files before choosing what to restore.',
  },
} as const
