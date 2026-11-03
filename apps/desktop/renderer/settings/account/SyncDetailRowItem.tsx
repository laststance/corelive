import type {
  SyncDetailAction,
  SyncDetailRow,
} from '@corelive/desktop-contract/category-sync'
import { Button } from '@corelive/live-editor/ui/button'
import { useRef, useState } from 'react'

import {
  categoryRefusalCopy,
  type CategoryCommandOutcome,
} from '../../editor/categoryCopy'

import { fieldLabel } from './accountCopy'
import { MiddleTruncate } from './MiddleTruncate'

/** Props of {@link SyncDetailRowItem}. */
export interface SyncDetailRowItemProps {
  row: SyncDetailRow
  /** Sends one DA7 action; resolves with main's verdict (a refusal keeps the row). */
  onAction: (
    row: SyncDetailRow,
    action: SyncDetailAction,
    name?: string,
  ) => Promise<CategoryCommandOutcome>
}

/** The calm sentence a row type carries (DA7), or null when only the values are shown. */
function rowMessage(row: SyncDetailRow): string | null {
  switch (row.type) {
    case 'invalid-parent':
    case 'forbidden':
      return 'Changed back to match the dashboard.'
    case 'digest-mismatch':
    case 'parked':
      return "Couldn't apply a change. It was kept on this Mac."
    case 'delete-blocked':
      return `Couldn't remove "${row.categoryPath.split(' / ').pop()}" on the dashboard.`
    case 'waiting-confirm':
      return 'Waiting for the dashboard to confirm a change'
    default:
      return null
  }
}

/** The visible label of one action for this row (DA7, DX11). */
function actionLabel(row: SyncDetailRow, action: SyncDetailAction): string {
  const blocked = row.type === 'delete-blocked'
  switch (action) {
    case 'use-mac-value':
      return `Use "${row.macValue ?? ''}"`
    case 'keep-dashboard-value':
      return blocked
        ? 'Keep it on the dashboard'
        : `Keep "${row.dashboardValue ?? ''}"`
    case 'choose-another-name':
      return blocked ? `Rename "${row.childName ?? ''}"` : 'Choose another name'
    case 'try-again':
      return 'Try again'
  }
}

/**
 * One "Needs a look" row of the Sync details page (#216 DA7, DA9, DA13).
 *
 * A hairline-separated list item, not a card: the category's full path, the field, "On this
 * Mac" and "On the dashboard" values, then the row's actions. While an action runs the row shows
 * "Applying…" with its actions disabled; a failure shows "Couldn't apply. Try again." inline;
 * Choose another name opens an inline form whose refusals show the DA8 copy and keep the typed
 * value. On success the page refetches and the row moves to History as "Resolved".
 * Rendered by {@link SyncDetailsPage}.
 *
 * @param row - The row data from main.
 * @param onAction - Sends an action through the category command channel.
 * @example <SyncDetailRowItem row={row} onAction={act} />
 */
export function SyncDetailRowItem({ row, onAction }: SyncDetailRowItemProps) {
  const [status, setStatus] = useState<'idle' | 'applying' | 'failed'>('idle')
  const [renaming, setRenaming] = useState(false)
  const [draft, setDraft] = useState('')
  const [error, setError] = useState<string | null>(null)
  const renameButtonRef = useRef<HTMLButtonElement>(null)

  const applying = status === 'applying'
  const message = rowMessage(row)

  const run = async (
    action: SyncDetailAction,
    name?: string,
  ): Promise<void> => {
    setStatus('applying')
    setError(null)
    const outcome = await onAction(row, action, name)
    if (outcome.ok) {
      setStatus('idle')
      setRenaming(false)
      return
    }
    // A name the validator refused is a form state, not a failed apply (DA8).
    if (action === 'choose-another-name' && name !== undefined) {
      setStatus('idle')
      setError(categoryRefusalCopy(outcome.reason, name, outcome.detail))
      return
    }
    setStatus('failed')
  }

  const closeRename = (): void => {
    setRenaming(false)
    setError(null)
    renameButtonRef.current?.focus()
  }

  const startRename = (): void => {
    setDraft(row.type === 'delete-blocked' ? (row.childName ?? '') : '')
    setError(null)
    setRenaming(true)
  }

  return (
    <li
      data-row-id={row.id}
      tabIndex={-1}
      className="space-y-2 border-b py-3 outline-none last:border-b-0"
    >
      <p className="font-medium">
        <MiddleTruncate text={row.categoryPath} max={40} />
        <span className="type-small ml-2 text-muted-foreground">
          {fieldLabel(row.field)}
        </span>
      </p>
      {message && (
        <p className="type-small leading-5 text-muted-foreground">{message}</p>
      )}
      {(row.macValue !== null || row.dashboardValue !== null) && (
        // Below 360px the two values stack (DA13); colors and parents are already text.
        <dl className="type-small grid grid-cols-1 gap-x-4 gap-y-1 min-[360px]:grid-cols-2">
          {row.macValue !== null && (
            <div className="min-w-0">
              <dt className="inline text-muted-foreground">On this Mac: </dt>
              <dd className="inline break-words">{row.macValue}</dd>
            </div>
          )}
          {row.dashboardValue !== null && (
            <div className="min-w-0">
              <dt className="inline text-muted-foreground">
                On the dashboard:{' '}
              </dt>
              <dd className="inline break-words">{row.dashboardValue}</dd>
            </div>
          )}
        </dl>
      )}
      {applying && (
        <p role="status" className="type-small text-muted-foreground">
          Applying…
        </p>
      )}
      {status === 'failed' && (
        <p role="alert" className="type-small text-destructive">
          Couldn&apos;t apply. Try again.
        </p>
      )}
      {renaming ? (
        <form
          className="space-y-2"
          onSubmit={(event) => {
            event.preventDefault()
            void run('choose-another-name', draft)
          }}
          onKeyDown={(event) => {
            if (event.key === 'Escape') {
              event.stopPropagation()
              closeRename()
            }
          }}
        >
          <label className="type-small block text-muted-foreground">
            New name
            <input
              autoFocus
              value={draft}
              disabled={applying}
              aria-invalid={error ? true : undefined}
              aria-describedby={error ? `${row.id}-error` : undefined}
              onChange={(event) => setDraft(event.target.value)}
              className="mt-1 block h-9 w-full min-w-0 rounded-md border bg-background px-3 text-foreground"
            />
          </label>
          {error && (
            <p
              id={`${row.id}-error`}
              role="alert"
              className="type-small text-destructive"
            >
              {error}
            </p>
          )}
          <div className="flex flex-wrap gap-2">
            <Button type="submit" size="sm" disabled={applying}>
              Save name
            </Button>
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={applying}
              onClick={closeRename}
            >
              Cancel
            </Button>
          </div>
        </form>
      ) : (
        row.actions.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {row.actions.map((action) => (
              <Button
                key={action}
                ref={action === 'choose-another-name' ? renameButtonRef : null}
                size="sm"
                variant="outline"
                disabled={applying}
                onClick={() =>
                  action === 'choose-another-name'
                    ? startRename()
                    : void run(action)
                }
              >
                {actionLabel(row, action)}
              </Button>
            ))}
          </div>
        )
      )}
    </li>
  )
}
