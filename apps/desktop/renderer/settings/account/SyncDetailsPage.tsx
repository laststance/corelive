import type {
  SyncDetailAction,
  SyncDetailRow,
} from '@corelive/desktop-contract/category-sync'
import type { OfflineSyncDetails } from '@corelive/desktop-contract/offline-editor-api'
import type { SyncHistoryItem } from '@corelive/desktop-contract/offline-workspace-v2'
import { useCycleEffect } from '@corelive/live-editor/hooks/use-cycle-effect'
import { Button } from '@corelive/live-editor/ui/button'
import { useRef, useState } from 'react'

import type { CategoryCommandOutcome } from '../../editor/categoryCopy'
import { useSettings } from '../SettingsProvider'

import { fieldLabel } from './accountCopy'
import { MiddleTruncate } from './MiddleTruncate'
import { SyncDetailRowItem } from './SyncDetailRowItem'

/** DA7: History lists the latest 50 entries. */
const HISTORY_LIMIT = 50

/** The calm History sentence of one entry (DA7). */
function historyMessage(item: SyncHistoryItem): string {
  switch (item.kind) {
    case 'resolved':
      return 'Resolved'
    case 'reverted':
      return 'Changed back to match the dashboard.'
    case 'applied-elsewhere':
      return 'Changed on the dashboard.'
    default:
      return 'Removed on the dashboard. Its writing moved to your default category.'
  }
}

/**
 * Tells whether the migration summary reports anything that was brought over or kept.
 *
 * The v1 to v2 migration always writes a summary, so a Mac that never ran an earlier build
 * gets one with every count at zero. Called by {@link SyncDetailsPage} to decide whether
 * History shows the "Brought your earlier writing" block.
 *
 * @param summary - The migration summary from Sync details, or null when there is none.
 * @returns
 * - true when any imported, copied or kept count is above zero
 * - false for a missing summary or an all-zero one
 * @example
 * hasImportedWriting({ importedDrafts: 0, importedCompletions: 0, recoveryCopies: 0, v1FilesKept: 0, preservedBackups: 0, sourceAccountId: null }) // => false
 * hasImportedWriting({ importedDrafts: 2, importedCompletions: 0, recoveryCopies: 0, v1FilesKept: 1, preservedBackups: 0, sourceAccountId: 'acct-1' }) // => true
 */
function hasImportedWriting(
  summary: OfflineSyncDetails['migrationSummary'],
): boolean {
  if (!summary) return false
  return (
    summary.importedDrafts +
      summary.importedCompletions +
      summary.recoveryCopies +
      summary.v1FilesKept +
      summary.preservedBackups >
    0
  )
}

/**
 * The Sync details page inside the Settings window (#216 DA7, DA9, DA13, DA14, C31, C34).
 *
 * Reached from Account and always headed by a sticky "Back to Settings". "Needs a look" lists
 * actionable rows (or "No sync issues. Everything on this Mac is saved."); "History" lists the
 * latest resolved or informational entries, the migration summary when it reports anything
 * (with "Open recovery copies" only when copies exist) and preserved v1 backups.
 * Each action is a `syncDetailAction` category command; focus then
 * moves to the next row, or to the "Needs a look" heading when none remain.
 * Rendered by {@link ElectronSettingsPage} while the Sync details view is active.
 *
 * @param onBack - Returns to the Settings sections.
 * @example <SyncDetailsPage onBack={showSettings} />
 */
export function SyncDetailsPage({ onBack }: { onBack: () => void }) {
  const { api, snapshot, sendCategoryCommand } = useSettings()
  const [details, setDetails] = useState<OfflineSyncDetails | null>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const needsHeadingRef = useRef<HTMLHeadingElement>(null)
  const pendingFocus = useRef<{
    rowId: string
    nextRowId: string | null
  } | null>(null)

  // Re-read whenever main reports a change, so rows resolved elsewhere disappear.
  useCycleEffect(() => {
    let alive = true
    api
      .syncDetails(snapshot.generation)
      .then((next) => alive && setDetails(next))
      .catch(() => undefined)
    return (): void => {
      alive = false
    }
  }, [api, snapshot])

  // DA14: after a row resolves, focus its successor, or the "Needs a look" heading.
  useCycleEffect(() => {
    const pending = pendingFocus.current
    if (!pending || !details) return
    if (details.rows.some((row) => row.id === pending.rowId)) return
    pendingFocus.current = null
    const next = pending.nextRowId
      ? containerRef.current?.querySelector<HTMLElement>(
          `[data-row-id="${CSS.escape(pending.nextRowId)}"]`,
        )
      : null
    ;(next ?? needsHeadingRef.current)?.focus()
  })

  const act = async (
    row: SyncDetailRow,
    action: SyncDetailAction,
    name?: string,
  ): Promise<CategoryCommandOutcome> => {
    const rows = details?.rows ?? []
    const index = rows.findIndex((entry) => entry.id === row.id)
    const successor = rows[index + 1] ?? rows[index - 1]
    pendingFocus.current = { rowId: row.id, nextRowId: successor?.id ?? null }
    const outcome = await sendCategoryCommand({
      type: 'syncDetailAction',
      commandId: crypto.randomUUID(),
      rowId: row.id,
      action,
      ...(name === undefined ? {} : { name }),
    })
    if (!outcome.ok) pendingFocus.current = null
    else
      setDetails(
        await api.syncDetails(snapshot.generation).catch(() => details),
      )
    return outcome
  }

  const rows = details?.rows ?? []
  const history = (details?.history ?? []).slice(0, HISTORY_LIMIT)
  const migrationSummary = details?.migrationSummary ?? null
  // A fresh install records an all-zero summary; it has nothing to report.
  const summary = hasImportedWriting(migrationSummary) ? migrationSummary : null
  const backups = details?.preservedBackups ?? []

  return (
    <div ref={containerRef} className="space-y-8">
      {/* DA13: stays visible while the page scrolls. */}
      <div className="sticky top-0 z-10 -mx-4 border-b bg-background px-4 py-2">
        <Button variant="ghost" size="sm" onClick={onBack}>
          <span aria-hidden="true">←</span> Back to Settings
        </Button>
      </div>
      <h1 className="type-h2">Sync details</h1>

      <section aria-labelledby="sync-needs-a-look" className="space-y-3">
        <h2
          id="sync-needs-a-look"
          ref={needsHeadingRef}
          tabIndex={-1}
          className="type-h3 leading-7 outline-none"
        >
          Needs a look
        </h2>
        {details && rows.length === 0 ? (
          <p className="type-small text-muted-foreground">
            No sync issues. Everything on this Mac is saved.
          </p>
        ) : (
          <ul>
            {rows.map((row) => (
              <SyncDetailRowItem key={row.id} row={row} onAction={act} />
            ))}
          </ul>
        )}
      </section>

      <section aria-labelledby="sync-history" className="space-y-3">
        <h2 id="sync-history" className="type-h3 leading-7">
          History
        </h2>
        {summary && (
          <div className="space-y-2 border-b pb-3">
            <p className="type-small leading-5">
              Brought your earlier writing into this Mac&apos;s workspace:{' '}
              {summary.importedDrafts} drafts, {summary.importedCompletions}{' '}
              keeps, {summary.recoveryCopies} recovery copies.{' '}
              {summary.v1FilesKept} earlier files kept as backups.
            </p>
            {/* Only offered when the import actually left recovery copies to open. */}
            {summary.recoveryCopies > 0 && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => void api.liveEditor.show()}
              >
                Open recovery copies
              </Button>
            )}
          </div>
        )}
        {backups.map((backup) => (
          <p
            key={backup.fileName}
            className="type-small border-b pb-3 text-muted-foreground"
          >
            Kept as a backup: <MiddleTruncate text={backup.fileName} max={36} />
          </p>
        ))}
        {(details?.dashboardOnlyCount ?? 0) > 0 && (
          <p className="type-small border-b pb-3 text-muted-foreground">
            Kept on the dashboard only: {details?.dashboardOnlyCount}
          </p>
        )}
        {history.length === 0 && !summary && backups.length === 0 && (
          <p className="type-small text-muted-foreground">Nothing here yet.</p>
        )}
        <ul>
          {history.map((item) => (
            <li
              key={item.id}
              className="space-y-1 border-b py-3 last:border-b-0"
            >
              <p className="font-medium">
                <MiddleTruncate text={item.categoryPath} max={40} />
                <span className="type-small ml-2 text-muted-foreground">
                  {fieldLabel(item.field)}
                </span>
              </p>
              <p className="type-small text-muted-foreground">
                {historyMessage(item)}
              </p>
            </li>
          ))}
        </ul>
      </section>
    </div>
  )
}
