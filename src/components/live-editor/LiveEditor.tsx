'use client'

import { useUser } from '@clerk/nextjs'
import { useQueryClient } from '@tanstack/react-query'
import Link from 'next/link'
import * as React from 'react'
import { useId, useLayoutEffect, useRef, useState } from 'react'
import { toast } from 'sonner'
import { z } from 'zod'

import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Slider } from '@/components/ui/slider'
import { Switch } from '@/components/ui/switch'
import { useCoarsePointer } from '@/hooks/use-coarse-pointer'
import { useCycleEffect } from '@/hooks/use-cycle-effect'
import { useInitialEffect } from '@/hooks/use-initial-effect'
import { useMounted } from '@/hooks/use-mounted'
import {
  type LiveEditorCompletionId,
  useCompletionWriter,
} from '@/hooks/useCompletionWriter'
import {
  useAutoSelectDefaultCategory,
  useSelectedCategory,
} from '@/hooks/useSelectedCategory'
import {
  LIVE_EDITOR_FONT_FAMILY_CSS,
  LIVE_EDITOR_LINE_HEIGHT,
  LIVE_EDITOR_NOTE_LINES_PER_CAP,
  LIVE_EDITOR_OPACITY_MAX,
  LIVE_EDITOR_OPACITY_MIN,
  LIVE_EDITOR_OPACITY_STEP,
} from '@/lib/constants/live-editor'
import { LOCAL_CATEGORY_ID } from '@/lib/live-editor/constants'
import {
  getLiveEditorHost,
  isElectronLiveEditorPanel,
} from '@/lib/live-editor/liveEditorHost'
import {
  type LocalStorageAvailability,
  getLocalStorageAvailability,
} from '@/lib/live-editor/localStorageSlot'
import { log } from '@/lib/logger'
import { orpc } from '@/lib/orpc/client-query'
import { useAppSelector } from '@/lib/redux/hooks'
import {
  selectLiveEditorClearDelayMs,
  selectLiveEditorClearOnComplete,
  selectLiveEditorFontFamily,
  selectLiveEditorFontSize,
  selectLiveEditorTextColor,
  selectLiveEditorToastDurationMs,
} from '@/lib/redux/slices/settingsSlice'
import { broadcastTodoSync } from '@/lib/todo-sync-channel'
import { cn } from '@/lib/utils'
import { isApplePlatform } from '@/lib/utils/isApplePlatform'
import type { Category, CategoryWithCount } from '@/server/schemas/category'

import { getLiveEditorCategoryChangedChannel } from '../../../electron/utils/electron-client'

import {
  type LiveEditorCompletedTitle,
  type LiveEditorLineIndex,
  COMPLETED_TITLE_MAX_LENGTH,
  insertLineAtIndex,
  lineStartOffset,
  markPlainLineCompleted,
  normalizeCompletedTitle,
  parseCheckboxLine,
  removeLineAtIndex,
  replaceLineAtIndex,
  setCheckboxStateAtLine,
} from './liveEditorUtils'

const NOTE_DEBOUNCE_MS = 400

const NOTE_MAX_LENGTH =
  COMPLETED_TITLE_MAX_LENGTH * LIVE_EDITOR_NOTE_LINES_PER_CAP

// `WebkitAppRegion` is an Electron-only CSS property not declared on the
// React/TS DOM types — cast through Record so the cast lives in one place.
const DRAG_REGION_STYLE = {
  WebkitAppRegion: 'drag',
} as React.CSSProperties
const NO_DRAG_REGION_STYLE = {
  WebkitAppRegion: 'no-drag',
} as React.CSSProperties

const categoryChangedPayloadSchema = z.object({
  categoryId: z.number().int(),
})

/** Stable empty list so the web-only default-category effect is a no-op in the Electron panel. */
const NO_CATEGORIES: CategoryWithCount[] = []

/** Accessible name of the note field; the placeholder changes with platform and pointer, this does not. */
const NOTE_FIELD_LABEL = 'Write one thing'

/** Web-frame footer: what happens to a keep, plus the one way onward. */
type FooterCopy = Readonly<{
  text: string
  link: Readonly<{ href: string; label: string }> | null
}>

/**
 * Picks the web frame's footer line for the current auth / storage state. The
 * Electron panel renders no footer, so this is web-only copy (design review DR3/DR4).
 * @param isAuthLoaded - Whether Clerk has resolved the session yet.
 * @param isSignedIn - Whether a signed-in user is present (undefined until loaded).
 * @param storageAvailability - The localStorage probe result for signed-out keeps.
 * @returns
 * - Before auth resolves: "Kept on this device." with no link (the stand-in frame)
 * - Signed in: "Keeps go to your account." + "Your year →" to /home
 * - Signed out, storage ok: "Kept on this device." + "Sign in" (returns to /write)
 * - Signed out, storage unavailable: "Kept for this session only." + "Sign in"
 * @example
 * resolveFooterCopy(true, false, 'ok') // => { text: 'Kept on this device.', link: { href: '/login?redirect_url=/write', label: 'Sign in' } }
 */
function resolveFooterCopy(
  isAuthLoaded: boolean,
  isSignedIn: boolean | undefined,
  storageAvailability: LocalStorageAvailability,
): FooterCopy {
  if (!isAuthLoaded) return { text: 'Kept on this device.', link: null }
  if (isSignedIn) {
    // "Keeps", not a blanket "kept": the finished lines reach the account, but
    // the half-written draft in the textarea lives in this browser's storage
    // either way. The old wording read as covering the textarea too.
    return {
      text: 'Keeps go to your account.',
      link: { href: '/home', label: 'Your year →' },
    }
  }
  return {
    text:
      storageAvailability === 'unavailable'
        ? 'Kept for this session only.'
        : 'Kept on this device.',
    link: { href: '/login?redirect_url=/write', label: 'Sign in' },
  }
}

type CheckedRowMemory = {
  /** Category owning the checked row across category switches. */
  categoryId: Category['id']
  /** Current line index, re-indexed whenever edits shift unchanged rows. */
  lineIndex: LiveEditorLineIndex
  /** Server-side Completed.id used by undo to call `completed.delete`. */
  completedId: LiveEditorCompletionId
  /** Verbatim title used to detect double-toggles on the same line. */
  title: LiveEditorCompletedTitle
}

type TextEditRange = Readonly<{
  /** Inclusive character offset before the textarea edit. */
  start: number
  /** Exclusive character offset before the textarea edit. */
  end: number
}>

type NoteDraftUpdateOptions = Readonly<{
  /** Category this draft belongs to; defaults to the active category ref. */
  categoryId?: Category['id'] | null
  /** True only after a user/internal edit that should be flushed to disk. */
  dirty: boolean
  /** Exact pre-edit selection, used to distinguish identical inserted rows. */
  editRange?: TextEditRange
}>

/**
 * Undo memory for a line that clear-on-complete will tuck away. Distinct from
 * `CheckedRowMemory`: here the line may be briefly visible as `[x]`, then
 * removed, so we remember both the checked text and the original text to restore.
 *
 * Mutable on purpose — `outcome`/`completedId`/`toastId` evolve as the
 * background create resolves and the user does (or doesn't) undo. Keyed by a
 * monotonic `token` (never a `lineIndex`) so a later removal shifting indices
 * can't collide with this entry; the category-swap effect clears the whole map,
 * neutralising stale cross-category undos for free.
 */
type ClearedLineMemory = {
  /** Stable map key — a monotonic counter, never reused. */
  token: number
  /** Created row id; null until the background create resolves. */
  completedId: LiveEditorCompletionId | null
  /** Normalised title persisted for this completion. */
  title: LiveEditorCompletedTitle
  /** Category the line belonged to — guards cross-category re-insertion. */
  categoryId: Category['id']
  /** Index the line sat at when removed (best-effort re-insert position). */
  originalLineIndex: LiveEditorLineIndex
  /** Checked row shown before removal; guards delayed clears from edited lines. */
  completedLineText: string
  /** Verbatim removed line, restored as-is on undo/failure (preserves spacing). */
  reinsertText: string
  /**
   * Lifecycle guard for the success/failure/undo/auto-close overlap. `undone`
   * and `restored` are BOTH terminal "line is already back" states — undo
   * early-returns on either so it can never re-insert a second copy.
   * - `pending`   — create in flight, no undo yet
   * - `undone`    — user clicked Undo (line restored by undo; suppress failure re-insert)
   * - `confirmed` — undo window elapsed with no undo (a late failure still restores → no silent loss)
   * - `restored`  — the create FAILED and the failure handler already put the line back
   */
  outcome: 'pending' | 'undone' | 'confirmed' | 'restored'
  /** sonner toast id, filled right after the create wires up so the failure
   *  handler can dismiss the optimistic success toast. */
  toastId: string | number | undefined
  /**
   * Whether the line has actually been REMOVED from the note yet. With a
   * non-zero clear delay the removal is deferred, so during the linger the line
   * is still on screen (`false`) — undo/failure replace the visible `[x]` row
   * with its original text. `true` once removed (the instant timer, or after the
   * deferred timer fired). Undo/failure re-insert only when this is `true`.
   */
  lineCleared: boolean
  /**
   * `window.setTimeout` id for a deferred removal still pending, or `undefined`
   * when none is armed (instant path, or after the timer fired / was cancelled).
   * Lets undo and the create-failure handler cancel THIS completion's pending
   * removal so it can't fire after the completion was reverted.
   */
  removalTimerId: number | undefined
  /** Exact caret destination after instant removal; null preserves the live caret. */
  caretAfterClearOffset: number | null
  /** Shared restore attempt so create-failure and Undo cannot insert the row twice. */
  restorePromise: Promise<boolean> | null
}

/**
 * In-flight create-Completed promise for a line that's been ticked but not
 * yet round-tripped to the server. The title is captured at promise creation
 * so an Undo issued before the create resolves can match the right entry
 * even after lines drift. We await it before any delete so the row is never
 * orphaned in the DB.
 */
type PendingCreate = {
  /** Category owning this optimistic completion and any later restore retry. */
  categoryId: Category['id']
  /** Current line index, re-indexed whenever edits shift the optimistic row. */
  lineIndex: LiveEditorLineIndex
  /** Exact checked row used to reject unsafe rollback targets. */
  completedLineText: string
  promise: Promise<LiveEditorCompletionId | null>
  /** Keeps duplicate completion blocked until a failed rollback is retried successfully. */
  restorePending: boolean
  title: LiveEditorCompletedTitle
}

type PendingCompletedDelete = {
  /** Single in-flight delete shared by repeated Retry clicks. */
  request: Promise<boolean> | null
}

type TrackedRowsByCategory<T extends { lineIndex: LiveEditorLineIndex }> = Map<
  Category['id'],
  Map<LiveEditorLineIndex, T>
>

/**
 * Re-reads a mutable clear entry after awaits so concurrent Undo ownership is visible.
 * @param entry - Completion lifecycle entry mutated by failure and Undo paths.
 * @returns Whether Undo has taken ownership of restoration and cleanup.
 * @example
 * isClearedLineUndone(entry)
 */
function isClearedLineUndone(entry: ClearedLineMemory): boolean {
  return entry.outcome === 'undone'
}

/**
 * Re-indexes an unchanged row across one contiguous textarea edit. Called before draft refs update.
 * @param previousText - Text whose line index the completion currently stores.
 * @param nextText - Text after the user or completion flow edits the textarea.
 * @param lineIndex - Previously tracked zero-based line index.
 * @param editRange - Exact replaced range when the change came from textarea input.
 * @returns The shifted index, or null when the tracked row itself changed.
 * @example
 * remapTrackedLineIndex('header\n- [x] task', 'new\nheader\n- [x] task', 1) // => 2
 */
function remapTrackedLineIndex(
  previousText: string,
  nextText: string,
  lineIndex: LiveEditorLineIndex,
  editRange?: TextEditRange,
): LiveEditorLineIndex | null {
  if (previousText === nextText) return lineIndex

  const previousLines = previousText.split('\n')
  const nextLines = nextText.split('\n')
  if (
    editRange &&
    editRange.start >= 0 &&
    editRange.start <= editRange.end &&
    editRange.end <= previousText.length
  ) {
    const replacedLength = editRange.end - editRange.start
    const insertedLength =
      nextText.length - (previousText.length - replacedLength)
    const insertedEnd = editRange.start + insertedLength
    const editMatchesText =
      insertedLength >= 0 &&
      previousText.slice(0, editRange.start) ===
        nextText.slice(0, editRange.start) &&
      previousText.slice(editRange.end) === nextText.slice(insertedEnd)
    if (editMatchesText) {
      const insertedText = nextText.slice(editRange.start, insertedEnd)
      const removedText = previousText.slice(editRange.start, editRange.end)
      const newlineDelta =
        insertedText.split('\n').length - removedText.split('\n').length
      const rowStart = lineStartOffset(previousText, lineIndex)
      const rowEnd = rowStart + (previousLines[lineIndex]?.length ?? 0)

      // A splice wholly before this row shifts it by exactly the newline delta.
      if (editRange.end < rowStart) return lineIndex + newlineDelta
      if (editRange.end === rowStart) {
        const keepsRowBoundary =
          !removedText.endsWith('\n') || insertedText.endsWith('\n')
        return keepsRowBoundary ? lineIndex + newlineDelta : null
      }

      // A splice wholly after this row cannot change its line identity.
      if (editRange.start > rowEnd) return lineIndex
      if (editRange.start === rowEnd) {
        return insertedText.startsWith('\n') ? lineIndex : null
      }

      // Editing through the tracked row is ambiguous, so callers drop its identity.
      return null
    }
  }

  const trackedLineText = previousLines[lineIndex]
  if (
    trackedLineText !== undefined &&
    nextLines.filter((line) => line === trackedLineText).length > 1
  ) {
    // Duplicate full rows are indistinguishable without an exact browser splice.
    return null
  }

  // Internal changes have no DOM selection; retain the conservative content fallback.
  let unchangedPrefixLength = 0
  while (
    unchangedPrefixLength < previousLines.length &&
    unchangedPrefixLength < nextLines.length &&
    previousLines[unchangedPrefixLength] === nextLines[unchangedPrefixLength]
  ) {
    unchangedPrefixLength += 1
  }

  let unchangedSuffixLength = 0
  while (
    unchangedSuffixLength < previousLines.length - unchangedPrefixLength &&
    unchangedSuffixLength < nextLines.length - unchangedPrefixLength &&
    previousLines[previousLines.length - 1 - unchangedSuffixLength] ===
      nextLines[nextLines.length - 1 - unchangedSuffixLength]
  ) {
    unchangedSuffixLength += 1
  }

  if (lineIndex < unchangedPrefixLength) return lineIndex
  const previousSuffixStart = previousLines.length - unchangedSuffixLength
  if (lineIndex < previousSuffixStart) return null
  return lineIndex + nextLines.length - previousLines.length
}

/**
 * Keeps line-index keyed completion memory aligned after rows above it move. Called by setNoteDraft.
 * @param entries - Pending or recorded completion memory keyed by current line index.
 * @param previousText - Text before the edit.
 * @param nextText - Text after the edit.
 * @param editRange - Exact textarea splice when available.
 * @returns Nothing; mutates the ref-owned map and each surviving entry's index.
 * @example
 * reindexTrackedCompletionMap(entries, 'a\n- [x] task', 'new\na\n- [x] task')
 */
function reindexTrackedCompletionMap<
  T extends { lineIndex: LiveEditorLineIndex },
>(
  entries: Map<LiveEditorLineIndex, T>,
  previousText: string,
  nextText: string,
  editRange?: TextEditRange,
): void {
  if (entries.size === 0 || previousText === nextText) return
  const reindexedEntries = new Map<LiveEditorLineIndex, T>()
  for (const [lineIndex, entry] of entries) {
    const nextLineIndex = remapTrackedLineIndex(
      previousText,
      nextText,
      lineIndex,
      editRange,
    )
    // Editing the tracked row ends its identity; unchanged rows keep following shifts.
    if (nextLineIndex === null) continue
    entry.lineIndex = nextLineIndex
    reindexedEntries.set(nextLineIndex, entry)
  }
  entries.clear()
  for (const [lineIndex, entry] of reindexedEntries) {
    entries.set(lineIndex, entry)
  }
}

/**
 * Returns one category's tracked rows, creating its isolated map on first use. Called by completion/edit paths.
 * @param entriesByCategory - Completion memory partitioned by category.
 * @param categoryId - Category whose row identities are being read or updated.
 * @returns Mutable row map belonging only to the requested category.
 * @example
 * getTrackedRowsForCategory(rowsByCategory, 1).set(0, entry)
 */
function getTrackedRowsForCategory<
  T extends { lineIndex: LiveEditorLineIndex },
>(
  entriesByCategory: TrackedRowsByCategory<T>,
  categoryId: Category['id'],
): Map<LiveEditorLineIndex, T> {
  const existing = entriesByCategory.get(categoryId)
  if (existing) return existing
  const entries = new Map<LiveEditorLineIndex, T>()
  entriesByCategory.set(categoryId, entries)
  return entries
}

/**
 * Rebuilds a failed optimistic completion in the note it came from. Called by create rollback paths.
 * @param text - Note text to repair.
 * @param lineIndex - Original/fallback line index for the optimistic completion.
 * @param completedLineText - Exact optimistic checked row used as the identity guard.
 * @param rollbackLineText - Verbatim source row for plain or pre-checked completions; omitted for unchecked rows.
 * @returns Text with the optimistic `[x]` row reverted, or the input when no safe target exists.
 * @example
 * rollbackPromotedLineText('- [x] buy milk', 0, '- [x] buy milk') // => '- [ ] buy milk'
 */
function rollbackPromotedLineText(
  text: string,
  lineIndex: LiveEditorLineIndex,
  completedLineText: string,
  rollbackLineText?: string,
): string {
  const currentLine = text.split('\n')[lineIndex]
  // Exact text plus the re-indexed position prevents duplicate titles from targeting a sibling row.
  if (currentLine !== completedLineText) return text
  if (rollbackLineText !== undefined) {
    return replaceLineAtIndex(text, lineIndex, rollbackLineText)
  }
  return setCheckboxStateAtLine(text, lineIndex, false)
}

/**
 * Build the LiveEditor completion toast — the `Completed: <title>` success toast
 * with an Undo action AND a close (✕) button. Both completion paths
 * (`promoteLineToCompleted`, `completeAndClearLine`) call this so the ✕, the
 * configurable display duration, the dynamic Undo-window copy, and the Undo
 * wiring live in ONE place and can't drift between the two sites (#109).
 *
 * The two sites differ only in their dismiss bookkeeping, so `onAutoClose` /
 * `onDismiss` are passed in: site A ties its line-clear to `onAutoClose` and has
 * no `onDismiss`; site B's clear is timer-independent and runs the same cleanup
 * on BOTH auto-close and a ✕-close. Sonner can't distinguish a ✕-close from an
 * Undo-close (both fire `onDismiss`), so that disambiguation is owned by the call
 * site (which captures the Undo handler), never by this helper.
 *
 * @param params - Toast inputs.
 * @param params.title - Already-normalised completed title (rendered `Completed: <title>`).
 * @param params.durationMs - How long the toast stays before auto-dismiss (the user setting).
 * @param params.onUndo - Runs when the user clicks Undo; the toast is dismissed right after.
 * @param params.onAutoClose - Optional: runs when the toast times out (NOT on ✕/Undo).
 * @param params.onDismiss - Optional: runs on a manual close (✕ OR Undo — caller guards).
 * @returns The sonner toast id, so the caller can dismiss it later (e.g. on a late create failure).
 * @example
 * const id = showCompletionToast({ title, durationMs: 5000, onUndo: () => revert() })
 */
function showCompletionToast({
  title,
  durationMs,
  onUndo,
  onAutoClose,
  onDismiss,
}: {
  title: LiveEditorCompletedTitle
  durationMs: number
  onUndo: () => void
  onAutoClose?: () => void
  onDismiss?: () => void
}): string | number {
  const toastId = toast.success(`Completed: ${title}`, {
    // Dynamic Undo-window copy in the quiet-companion voice — once the duration
    // is user-configurable a fixed "5 s" would be wrong at every non-default
    // setting (#109). floor (not round) keeps the promise regret-safe: at a
    // half-step like 2500ms it reads "2 s" (under), never "3 s" (over), so the
    // Undo never expires earlier than the copy says.
    description: `Undo stays here for ${Math.floor(durationMs / 1000)} s if you need it.`,
    duration: durationMs,
    closeButton: true,
    action: {
      label: 'Undo',
      onClick: () => {
        onUndo()
        toast.dismiss(toastId)
      },
    },
    onAutoClose,
    onDismiss,
  })
  return toastId
}

/**
 * LiveEditor — the one surface that creates keeps. It renders inside the
 * frameless Electron panel AND on the public `/write` page: `getLiveEditorHost()`
 * hides the persistence difference (preload bridge vs. localStorage),
 * `isElectronLiveEditorPanel()` gates the Cocoa-only chrome, and
 * `useCompletionWriter()` routes each keep to the account (signed in) or the
 * device (signed out).
 *
 * UX contract:
 *  - Per-category text is persisted through the host's `note.set` with a
 *    400 ms debounce — offline-tolerant on purpose (device-local on the web).
 *  - Cmd/Ctrl+Enter (or the touch-only "Keep line" button) instantly records a
 *    keep and shows an Undo toast; Undo removes it and flips the line back.
 *  - The Electron panel can follow the FloatingNav category or pick one locally
 *    (`category.setLast`); the web follows the shared selection the sidebar
 *    uses, and a signed-out visitor writes into the implicit
 *    `LOCAL_CATEGORY_ID` category with clear-on-complete forced on.
 *
 * Why optimistic UI: the checkbox flip must feel instant — we mutate the
 * textarea state first, then fire the persistence writes. Failure rollback
 * is handled by the toast cleanup path.
 */
export const LiveEditor = function LiveEditor({
  categories,
  isCategoryListPending = false,
}: {
  categories: CategoryWithCount[]
  /**
   * `category.list` is still in flight for a signed-in visitor. Without it an
   * empty `categories` is ambiguous — mid-fetch and "this account has none"
   * look identical from here, and the field is disabled either way.
   */
  isCategoryListPending?: boolean
}) {
  const queryClient = useQueryClient()
  const isMounted = useMounted()
  // Auth gate follows the Floating pattern (`isLoaded` / `isSignedIn`), never
  // useClerkQueryReady — that is false while signed out, a first-class state here.
  const { isLoaded: isAuthLoaded, isSignedIn } = useUser()
  // Read after mount so the server render (no preload) and the first client
  // render agree; the Electron panel is only ever mounted client-side.
  const isElectronPanel = isMounted && isElectronLiveEditorPanel()
  const isSignedOutWeb = !isElectronPanel && isAuthLoaded && !isSignedIn
  const isCoarsePointer = useCoarsePointer()
  const completionWriter = useCompletionWriter()
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  const [opacity, setOpacity] = useState<number>(LIVE_EDITOR_OPACITY_MAX)
  const [syncEnabled, setSyncEnabled] = useState<boolean>(true)
  const [floatingCategoryId, setFloatingCategoryId] = useSelectedCategory()
  // The web has no FloatingNavigator to pick a default category, so the editor
  // does it itself; the Electron panel leaves that to the Floating window.
  useAutoSelectDefaultCategory(
    floatingCategoryId,
    setFloatingCategoryId,
    isElectronPanel ? NO_CATEGORIES : categories,
  )
  const [localCategoryId, setLocalCategoryId] = useState<Category['id'] | null>(
    null,
  )
  const [noteText, setNoteText] = useState<string>('')
  const [isLoadingNote, setIsLoadingNote] = useState<boolean>(false)
  const [noteReadyCategoryId, setNoteReadyCategoryId] = useState<
    Category['id'] | null
  >(null)
  const [isLiveEditorConfigReady, setIsLiveEditorConfigReady] =
    useState<boolean>(false)
  // The probe writes (and removes) a key, so it runs in an effect rather than in
  // the render body — a side effect there is what React Compiler memoization is
  // free to drop or repeat. 'ok' until it answers, matching the server render.
  const [storageAvailability, setStorageAvailability] =
    useState<LocalStorageAvailability>('ok')
  useInitialEffect(() => {
    setStorageAvailability(getLocalStorageAvailability())
  })
  const [spacesTrackingEnabled, setSpacesTrackingEnabled] =
    useState<boolean>(false)
  const [isUpdatingSpacesTracking, setIsUpdatingSpacesTracking] =
    useState<boolean>(false)
  const noteInputId = useId()
  const opacityInputId = useId()
  const syncInputId = useId()
  const categoryInputId = useId()
  const spacesInputId = useId()

  // LiveEditor text-presentation settings (shared via the settings slice,
  // hydrated from localStorage + live-synced across windows by the settings sync
  // middleware). Read here and applied inline to the editor surface.
  const liveEditorFontFamily = useAppSelector(selectLiveEditorFontFamily)
  const liveEditorFontSize = useAppSelector(selectLiveEditorFontSize)
  const liveEditorTextColor = useAppSelector(selectLiveEditorTextColor)
  // When ON, a finished line is dropped once its undo window closes (see the
  // toast's onAutoClose in promoteLineToCompleted). Default OFF keeps every line.
  const clearOnComplete = useAppSelector(selectLiveEditorClearOnComplete)
  const liveEditorToastDurationMs = useAppSelector(
    selectLiveEditorToastDurationMs,
  )
  // How long the checked finished line lingers before it's removed
  // (clear-on-complete ON path). 0 = remove on the next timer turn after `[x]`
  // renders; >0 defers the removal so the eye registers the completion first.
  // Clamped ≤ the Undo window by the schema, so the line never outlasts Undo.
  const clearDelayMs = useAppSelector(selectLiveEditorClearDelayMs)
  // Signed out there is no account to keep `[x]` rows for, so every finished
  // line clears (standard linger); the persisted setting still rules signed in.
  const effectiveClearOnComplete = isSignedIn ? clearOnComplete : true

  // Shared device: the remembered id belongs to whoever was signed in when it
  // was stored, and category ids are globally unique, so on the web it can point
  // at the previous account's category — whose note this editor would then show
  // and, on the next debounced flush, overwrite. `categories` is the CURRENT
  // account's list, so the pointer is only honoured once it appears there.
  // The Electron panel follows the Floating window's selection instead and gets
  // its list from another window, so it keeps the pointer as-is.
  const isRememberedCategoryConfirmed =
    isElectronPanel ||
    categories.some((category) => category.id === floatingCategoryId)

  // Signed out, the implicit local category is set directly: useSelectedCategory
  // rejects the `0` sentinel by design (server ids are positive).
  const activeCategoryId =
    !isLiveEditorConfigReady || !isAuthLoaded
      ? null
      : isSignedOutWeb
        ? LOCAL_CATEGORY_ID
        : syncEnabled
          ? isRememberedCategoryConfirmed
            ? floatingCategoryId
            : null
          : localCategoryId
  const checkedRowsRef = useRef<TrackedRowsByCategory<CheckedRowMemory>>(
    new Map(),
  )
  // Pending creates per line — Undo awaits this before issuing delete to
  // avoid the race where a tick is reverted before the server responds.
  const pendingCreatesRef = useRef<TrackedRowsByCategory<PendingCreate>>(
    new Map(),
  )
  const pendingCompletedDeletesRef = useRef<
    Map<LiveEditorCompletionId, PendingCompletedDelete>
  >(new Map())
  const failedPromotionRestoresRef = useRef<Set<PendingCreate>>(new Set())
  // Clear-on-complete ON path: token-keyed undo memory for lines removed the
  // instant they complete. Separate map from checkedRowsRef (which serves the
  // keep-the-[x] OFF path) so the two flows never share keys. Entries retain
  // their category identity until toast/create cleanup, even across category swaps.
  const clearedLinesRef = useRef<Map<number, ClearedLineMemory>>(new Map())
  // Monotonic token source for clearedLinesRef keys (never reused → no collision).
  const nextTokenRef = useRef<number>(0)
  // Deferred-clear timers still pending (token → entry). This separate map lets
  // category swaps/unmount cancel timers in bulk while clearedLinesRef keeps the
  // same entries available for row re-indexing until each Undo toast expires.
  const pendingClearTimersRef = useRef<Map<number, ClearedLineMemory>>(
    new Map(),
  )
  // Caret offset to apply AFTER the next noteText commit. The optimistic clear
  // changes the line count, so the caret must be repositioned post-render (see
  // the layout effect). null = leave the caret alone (the normal typing case).
  const pendingCaretRef = useRef<number | null>(null)
  // Latest active category for async create handlers — guards a late failure
  // from re-inserting a line into a different category's note after a swap.
  const activeCategoryIdRef = useRef<Category['id'] | null>(activeCategoryId)
  // Latest noteText for callbacks (toast Undo) so they never see a stale snapshot.
  const noteTextRef = useRef<string>('')
  // Captured before browser input so identical inserted rows still have an unambiguous splice.
  const pendingTextareaEditRef = useRef<TextEditRange | null>(null)
  // Category owning noteTextRef; prevents a category load from re-indexing old completion memory.
  const noteTextCategoryRef = useRef<Category['id'] | null>(null)
  // Synchronous guard because state-driven disabled UI applies after render.
  const isUpdatingSpacesTrackingRef = useRef<boolean>(false)
  // Last value persisted via `note.set` — guards against the load effect
  // re-emitting a write for content the renderer just received from main.
  const lastPersistedRef = useRef<{
    categoryId: Category['id'] | null
    text: string
  }>({ categoryId: null, text: '' })
  // Category whose textarea value may be written back to disk. It flips on only
  // after the load attempt settles or direct user input; dirty guard blocks a
  // load-failure empty reset from writing "".
  const noteWritableCategoryRef = useRef<Category['id'] | null>(null)
  // Tracks whether the visible draft diverged from the last loaded/saved value.
  // Loaded clean notes must never be flushed by category swaps or updater quits.
  const dirtyNoteRef = useRef<{
    categoryId: Category['id'] | null
    dirty: boolean
  }>({ categoryId: null, dirty: false })

  /**
   * Updates the visible LiveEditor draft and marks whether it may flush to disk.
   * @param text - Next textarea value.
   * @param options - Category ownership plus whether the change is user/internal dirty.
   * @returns Nothing; synchronizes React state and the callback ref in one tick.
   * @example
   * setNoteDraft('buy milk', { dirty: true })
   */
  const setNoteDraft = (
    text: string,
    options: NoteDraftUpdateOptions,
  ): void => {
    const categoryId = options.categoryId ?? activeCategoryIdRef.current
    const previousText = noteTextRef.current
    // Only edits within one category may move its tracked rows; a category load is unrelated text.
    if (categoryId !== null && noteTextCategoryRef.current === categoryId) {
      reindexTrackedCompletionMap(
        getTrackedRowsForCategory(pendingCreatesRef.current, categoryId),
        previousText,
        text,
        options.editRange,
      )
      for (const entry of failedPromotionRestoresRef.current) {
        // Only the origin category can move a failed rollback target.
        if (entry.categoryId !== categoryId) continue
        const nextLineIndex = remapTrackedLineIndex(
          previousText,
          text,
          entry.lineIndex,
          options.editRange,
        )
        if (nextLineIndex === null) {
          // A user rewrite supersedes the stale optimistic row; no rollback remains.
          failedPromotionRestoresRef.current.delete(entry)
          continue
        }
        entry.lineIndex = nextLineIndex
      }
      reindexTrackedCompletionMap(
        getTrackedRowsForCategory(checkedRowsRef.current, categoryId),
        previousText,
        text,
        options.editRange,
      )
      // Token-keyed clear entries share objects across both maps, so update each only once.
      const trackedClearEntries = new Set([
        ...clearedLinesRef.current.values(),
        ...pendingClearTimersRef.current.values(),
      ])
      for (const entry of trackedClearEntries) {
        // Only edits in the origin category may move this row's restore position.
        if (entry.categoryId !== categoryId) continue
        const nextLineIndex = remapTrackedLineIndex(
          previousText,
          text,
          entry.originalLineIndex,
          options.editRange,
        )
        // Never drop clear memory: its reinsertText may be the row's only copy.
        // If that row changed, its last index is a safer best-effort Undo position than losing it.
        if (nextLineIndex !== null) entry.originalLineIndex = nextLineIndex
      }
    }
    noteTextCategoryRef.current = categoryId
    noteTextRef.current = text
    dirtyNoteRef.current =
      options.dirty && categoryId !== null
        ? { categoryId, dirty: true }
        : { categoryId, dirty: false }
    setNoteText(text)
  }

  /**
   * Removes one persisted completion identity from its category. Called by clear and Undo paths.
   * @param categoryId - Category whose checked-row memory owns the completion.
   * @param completedId - Persisted Completed row id to forget.
   * @returns Nothing; unrelated rows and categories stay tracked.
   * @example
   * forgetCheckedCompletion(1, 42)
   */
  const forgetCheckedCompletion = (
    categoryId: Category['id'],
    completedId: LiveEditorCompletionId,
  ): void => {
    const checkedRows = checkedRowsRef.current.get(categoryId)
    if (!checkedRows) return
    for (const [lineIndex, memory] of checkedRows) {
      if (memory.completedId !== completedId) continue
      checkedRows.delete(lineIndex)
      break
    }
  }

  /**
   * Persists a dirty draft and marks it clean only after the host write succeeds. Called by debounce/final flush effects.
   * @param categoryId - Category whose note is being written.
   * @param text - Exact note text being persisted.
   * @returns void; completion updates refs only when the visible draft still matches.
   * @example
   * persistNoteDraft(1, '- [ ] buy milk')
   */
  const persistNoteDraft = React.useCallback(
    (categoryId: Category['id'], text: string): void => {
      void getLiveEditorHost()
        .note.set(categoryId, text)
        .then(
          () => {
            // A late save from category A must not mark category B's active draft clean.
            if (
              activeCategoryIdRef.current === categoryId &&
              noteTextRef.current === text
            ) {
              lastPersistedRef.current = { categoryId, text }
              dirtyNoteRef.current = { categoryId, dirty: false }
            }
          },
          (error: unknown) => {
            toast.error('Failed to save LiveEditor note')
            log.error('LiveEditor note save failed', error)
          },
        )
    },
    [],
  )

  /**
   * Restores a failed keep-visible completion in its origin category. Called by create rollback handlers.
   * @param categoryId - Category that owned the optimistic completion.
   * @param lineIndex - Original/fallback line index for the completed row.
   * @param completedLineText - Exact optimistic checked row used as the identity guard.
   * @param rollbackLineText - Verbatim source row when failure must preserve its checked state or prose shape.
   * @returns Whether the optimistic row was safely restored or no longer needs rollback.
   * @example
   * await restoreFailedPromotionToCategory(1, 0, '- [x] buy milk')
   */
  const restoreFailedPromotionToCategory = async (
    categoryId: Category['id'],
    lineIndex: LiveEditorLineIndex,
    completedLineText: string,
    rollbackLineText?: string,
  ): Promise<boolean> => {
    const restoreText = (text: string) =>
      rollbackPromotedLineText(
        text,
        lineIndex,
        completedLineText,
        rollbackLineText,
      )

    if (activeCategoryIdRef.current === categoryId) {
      const restored = restoreText(noteTextRef.current)
      setNoteDraft(restored, {
        categoryId,
        dirty: true,
      })
      return true
    }

    const api = getLiveEditorHost()
    try {
      const stored = await api.note.get(categoryId)
      const restored = restoreText(stored)
      if (restored !== stored) await api.note.set(categoryId, restored)
      return true
    } catch (error) {
      log.error('LiveEditor failed completion restore failed', error)
      return false
    }
  }

  /**
   * Writes an undo/rollback checkbox state to the category that owns it. Called by undoCompleted.
   * @param categoryId - Category that owns the completion row.
   * @param title - Normalised title that the exact fallback checkbox must match.
   * @param fallbackLineIndex - Tracked or captured line index; no global title search is allowed.
   * @param checked - Target checkbox state.
   * @param sourceText - Optional active-category snapshot for immediate visible updates.
   * @returns The exact updated line index, or null when no safe row remains.
   * @example
   * await setCompletedCheckboxStateInCategory(1, 'buy milk', 0, false)
   */
  const setCompletedCheckboxStateInCategory = async (
    categoryId: Category['id'],
    title: LiveEditorCompletedTitle,
    fallbackLineIndex: LiveEditorLineIndex,
    checked: boolean,
    sourceText?: string,
  ): Promise<LiveEditorLineIndex | null> => {
    const updateText = (text: string) => {
      const fallbackLine = text.split('\n')[fallbackLineIndex]
      const fallbackCheckbox =
        fallbackLine === undefined
          ? null
          : parseCheckboxLine(fallbackLine, fallbackLineIndex)
      // Only the tracked fallback is safe; a same-title search can select another repeated task.
      const resolvedLineIndex =
        fallbackCheckbox?.title === title ? fallbackLineIndex : null
      // A renamed or removed task has no safe checkbox target, so leave the note untouched.
      if (resolvedLineIndex === null) {
        return { lineIndex: null, text }
      }
      return {
        lineIndex: resolvedLineIndex,
        text: setCheckboxStateAtLine(text, resolvedLineIndex, checked),
      }
    }

    if (activeCategoryIdRef.current === categoryId) {
      const updated = updateText(sourceText ?? noteTextRef.current)
      if (updated.lineIndex !== null) {
        setNoteDraft(updated.text, { categoryId, dirty: true })
      }
      return updated.lineIndex
    }

    const api = getLiveEditorHost()
    try {
      const stored = await api.note.get(categoryId)
      const updated = updateText(stored)
      if (updated.text !== stored) await api.note.set(categoryId, updated.text)
      return updated.lineIndex
    } catch (error) {
      log.error('LiveEditor cross-category checkbox restore failed', error)
      return null
    }
  }

  useCycleEffect(() => {
    noteTextRef.current = noteText
  }, [noteText])

  // Keep the category ref in step so async create handlers compare against the
  // live category, not the one captured when the completion fired.
  useCycleEffect(() => {
    activeCategoryIdRef.current = activeCategoryId
  }, [activeCategoryId])

  // Apply a pending caret position after the textarea value commits. The
  // optimistic clear/undo changes the line count, so a synchronous
  // setSelectionRange right after setNoteText would read the stale DOM value —
  // it has to run post-commit. This is a deliberate raw useLayoutEffect (no
  // lifecycle-effect wrapper is layout-timed; useRenderEffect is a passive
  // useEffect, which would let a wrong-position caret paint for a frame). The
  // null guard makes ordinary typing a no-op.
  useLayoutEffect(() => {
    const caretOffset = pendingCaretRef.current
    if (caretOffset === null) return
    pendingCaretRef.current = null
    const textarea = textareaRef.current
    if (!textarea) return
    textarea.setSelectionRange(caretOffset, caretOffset)
  }, [noteText])

  // Cancel every pending deferred-clear timer SYNCHRONOUSLY when the active
  // category changes or the editor unmounts. This is a deliberate raw layout
  // effect (like the caret effect above — no lifecycle-effect wrapper is
  // layout-timed): a passive cleanup could let a timer fire AFTER the swap began
  // loading category B's note and remove a line from the WRONG category's text
  // (finding C). The lingering lines stay in their origin note (the win is
  // already recorded); only the deferred REMOVAL is abandoned. Keyed on
  // activeCategoryId so it does not re-run on every keystroke — timers must
  // survive ordinary typing within a category.
  useLayoutEffect(() => {
    const pendingTimers = pendingClearTimersRef.current
    return () => {
      for (const trackedEntry of pendingTimers.values()) {
        if (trackedEntry.removalTimerId !== undefined) {
          window.clearTimeout(trackedEntry.removalTimerId)
          trackedEntry.removalTimerId = undefined
        }
      }
      pendingTimers.clear()
    }
  }, [activeCategoryId])

  // Initial pull of opacity + sync mode + Spaces tracking from the host (the
  // main process, or the web host's instant defaults — which is what marks the
  // browser editor ready with no preload).
  useCycleEffect(() => {
    if (!isMounted) return
    let cancelled = false
    const api = getLiveEditorHost()
    void Promise.all([
      api.window.getOpacity(),
      api.sync.getEnabled(),
      api.category.getLast(),
      api.spaces?.getVisibleOnAllWorkspaces?.() ?? Promise.resolve(false),
    ])
      .then(([opacityValue, enabled, lastCategoryId, followsSpaces]) => {
        if (cancelled) return
        setOpacity(opacityValue)
        setSyncEnabled(enabled)
        setLocalCategoryId(lastCategoryId)
        setSpacesTrackingEnabled(followsSpaces)
        setIsLiveEditorConfigReady(true)
      })
      .catch((error) => {
        // Failures here keep the safe defaults seeded by useState; surface
        // a toast so the user knows their persisted settings didn't load.
        if (cancelled) return
        toast.error('Failed to load LiveEditor settings')
        log.error('LiveEditor settings load failed', error)
        setIsLiveEditorConfigReady(true)
      })
    return () => {
      cancelled = true
    }
  }, [isMounted])

  // Subscribe to main-process category broadcasts (e.g., when another window
  // changes the active category and main updates the LiveEditor config).
  useCycleEffect(() => {
    if (!isMounted) return
    return getLiveEditorHost().on(
      getLiveEditorCategoryChangedChannel(),
      (payload) => {
        // Preload sanitizes args and strips the IpcRendererEvent — payload is
        // the first user arg.
        const parsed = categoryChangedPayloadSchema.safeParse(payload)
        if (parsed.success) setLocalCategoryId(parsed.data.categoryId)
      },
    )
  }, [isMounted])

  // Move keyboard focus into the note editor whenever the LiveEditor window is
  // shown (and on the web, as soon as the note is ready — the stranger lands on
  // /write typing), so a quick global-shortcut capture lands in the textarea
  // instead of the first focusable control (the "Follow Spaces" switch). The window is
  // hidden — not destroyed — between toggles, so the textarea can't lean on a
  // mount-time autoFocus to refocus on re-show; we listen for the Page
  // Visibility transition to 'visible' that BrowserWindow.show() drives, and
  // also focus once on mount / after config+note loading for the first open.
  // focus() is a no-op while the textarea is disabled (no active category) —
  // picking a category first is the expected flow there.
  useCycleEffect(() => {
    if (!isMounted) return
    const canFocusNoteEditor =
      activeCategoryId !== null &&
      noteReadyCategoryId === activeCategoryId &&
      !isLoadingNote
    const focusNoteEditor = () => {
      if (!canFocusNoteEditor) return
      const textarea = textareaRef.current
      if (!textarea || textarea.disabled) return
      // Defer past child mount/update effects (Radix Slider thumb auto-focus) so
      // quick-capture keyboard input lands in the note field, not header controls.
      window.setTimeout(() => {
        const el = textareaRef.current
        if (!el || el.disabled) return
        el.focus()
      }, 0)
    }
    // First open: show() already fired before this effect subscribed, so the
    // visibilitychange we would catch has passed — focus directly.
    focusNoteEditor()
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') focusNoteEditor()
    }
    document.addEventListener('visibilitychange', handleVisibilityChange)
    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange)
    }
  }, [activeCategoryId, isLoadingNote, isMounted, noteReadyCategoryId])

  // Whenever the active category flips, load that category's note text.
  useCycleEffect(() => {
    if (!isMounted || activeCategoryId === null) {
      setNoteDraft('', { categoryId: null, dirty: false })
      lastPersistedRef.current = { categoryId: null, text: '' }
      noteWritableCategoryRef.current = null
      setNoteReadyCategoryId(null)
      return
    }
    const api = getLiveEditorHost()
    let cancelled = false
    setIsLoadingNote(true)
    noteWritableCategoryRef.current = null
    setNoteReadyCategoryId(null)
    dirtyNoteRef.current = { categoryId: activeCategoryId, dirty: false }
    api.note
      .get(activeCategoryId)
      .then((text) => {
        if (cancelled) return
        setNoteDraft(text, { categoryId: activeCategoryId, dirty: false })
        // Mark as already-persisted so the debounce effect doesn't immediately
        // echo this text back to disk.
        lastPersistedRef.current = { categoryId: activeCategoryId, text }
        noteWritableCategoryRef.current = activeCategoryId
        setNoteReadyCategoryId(activeCategoryId)
      })
      .catch((error) => {
        if (cancelled) return
        toast.error('Failed to load note for this category')
        log.error('LiveEditor note load failed', error)
        // Reset editor state BEFORE clearing the loading flag so the
        // category swap doesn't briefly show stale text from category A
        // while we render category B's failure.
        setNoteDraft('', { categoryId: activeCategoryId, dirty: false })
        lastPersistedRef.current = { categoryId: null, text: '' }
        noteWritableCategoryRef.current = activeCategoryId
        setNoteReadyCategoryId(activeCategoryId)
      })
      .finally(() => {
        if (cancelled) return
        setIsLoadingNote(false)
      })
    return () => {
      cancelled = true
    }
  }, [activeCategoryId, isMounted])

  // Debounce note writes to avoid hammering the config file on every keystroke.
  // The cleanup *only* clears the pending timer — flushing here would defeat
  // the debounce because cleanup runs on every keystroke (noteText is a dep).
  // The companion effect below handles category-swap/unmount flushes.
  useCycleEffect(() => {
    if (!isMounted || activeCategoryId === null) return
    if (isLoadingNote) return
    const persisted = lastPersistedRef.current
    // Never persist the initial empty textarea before this category's note has
    // loaded; a deploy-driven reload can otherwise overwrite real disk content.
    if (noteWritableCategoryRef.current !== activeCategoryId) return
    const dirtyNote = dirtyNoteRef.current
    if (!dirtyNote.dirty || dirtyNote.categoryId !== activeCategoryId) return
    if (
      persisted.categoryId === activeCategoryId &&
      persisted.text === noteText
    ) {
      return
    }
    const timeoutId = window.setTimeout(() => {
      persistNoteDraft(activeCategoryId, noteText)
    }, NOTE_DEBOUNCE_MS)
    return () => {
      window.clearTimeout(timeoutId)
    }
  }, [activeCategoryId, isLoadingNote, isMounted, noteText, persistNoteDraft])

  // Final flush: runs on category swap and unmount only (not on every keystroke).
  // Reads the latest text via ref so we never persist a stale snapshot.
  useCycleEffect(() => {
    if (!isMounted || activeCategoryId === null) return
    const flushCategoryId = activeCategoryId
    return () => {
      const text = noteTextRef.current
      const persisted = lastPersistedRef.current
      // If note.get never resolved for this category, `text` is only the local
      // initial value. Skipping the flush preserves the existing stored note.
      if (noteWritableCategoryRef.current !== flushCategoryId) return
      const dirtyNote = dirtyNoteRef.current
      if (!dirtyNote.dirty || dirtyNote.categoryId !== flushCategoryId) return
      if (persisted.categoryId === flushCategoryId && persisted.text === text) {
        return
      }
      persistNoteDraft(flushCategoryId, text)
    }
  }, [activeCategoryId, isMounted, persistNoteDraft])

  const handleToggleSync = (enabled: boolean) => {
    setSyncEnabled(enabled)
    void getLiveEditorHost().sync.setEnabled(enabled)
  }

  const handleManualCategoryChange = (id: Category['id']) => {
    setLocalCategoryId(id)
    void getLiveEditorHost().category.setLast(id)
  }

  const handleOpacityChange = (next: number) => {
    const clamped = Math.max(
      LIVE_EDITOR_OPACITY_MIN,
      Math.min(LIVE_EDITOR_OPACITY_MAX, next),
    )
    setOpacity(clamped)
    void getLiveEditorHost().window.setOpacity(clamped)
  }

  const handleCategoryValueChange = (value: string) => {
    const nextCategoryId = Number(value)
    // The web has no FloatingNav: its picker writes the shared selection the
    // sidebar reads, so /write and /home never disagree about the category.
    if (!isElectronPanel) {
      setFloatingCategoryId(nextCategoryId)
      return
    }
    handleManualCategoryChange(nextCategoryId)
  }

  const handleOpacityValueChange = (values: number[]) => {
    const next = values[0]
    if (next !== undefined) handleOpacityChange(next)
  }

  /**
   * Applies the Mac Spaces tracking switch from the LiveEditor header.
   *
   * @param enabled - true keeps both utility panels visible across Spaces.
   * @returns Promise that settles after the main process confirms or rolls back.
   * @example
   * await handleSpacesTrackingChange(true)
   */
  const handleSpacesTrackingChange = async (
    enabled: boolean,
  ): Promise<void> => {
    if (isUpdatingSpacesTrackingRef.current) return
    isUpdatingSpacesTrackingRef.current = true
    setIsUpdatingSpacesTracking(true)

    const previous = spacesTrackingEnabled
    setSpacesTrackingEnabled(enabled)

    try {
      const applied =
        await getLiveEditorHost().spaces?.setVisibleOnAllWorkspaces(enabled)
      setSpacesTrackingEnabled(applied ?? enabled)
    } catch (error) {
      setSpacesTrackingEnabled(previous)
      toast.error('Failed to update desktop tracking')
      log.error('LiveEditor Spaces tracking update failed', error)
    } finally {
      isUpdatingSpacesTrackingRef.current = false
      setIsUpdatingSpacesTracking(false)
    }
  }

  /**
   * Invalidate the heatmap query and ask sibling windows to refetch — the
   * shared tail of every completion mutation (keep-the-`[x]` create-success,
   * undo, and the optimistic clear's create-success). Extracted so the three
   * call sites can't drift apart. Awaits the local invalidate first, then
   * broadcasts, matching the original inline order.
   *
   * @returns Promise that settles once the local heatmap refetch is requested.
   * @example
   * await syncCompletedAcrossViews()
   */
  const syncCompletedAcrossViews = async (): Promise<void> => {
    await queryClient.invalidateQueries({
      queryKey: orpc.completed.heatmap.key(),
    })
    broadcastTodoSync()
  }

  /**
   * Deletes an undone completion with single-flight Retry state. Called after either Undo path restores the note.
   * @param completedId - Server completion row that must disappear before the undo is consistent.
   * @returns Whether deletion and cross-window synchronization succeeded.
   * @example
   * await deleteCompletedWithRetry(42)
   */
  const deleteCompletedWithRetry = async (
    completedId: LiveEditorCompletionId,
  ): Promise<boolean> => {
    let entry = pendingCompletedDeletesRef.current.get(completedId)
    if (!entry) {
      entry = { request: null }
      pendingCompletedDeletesRef.current.set(completedId, entry)
    }
    if (entry.request) return entry.request

    const request = (async (): Promise<boolean> => {
      try {
        await completionWriter.remove({ id: completedId })
      } catch (error) {
        const message =
          error instanceof Error ? error.message : 'Failed to undo completion'
        const currentEntry = pendingCompletedDeletesRef.current.get(completedId)
        if (currentEntry === entry) currentEntry.request = null
        toast.error(message, {
          action: {
            label: 'Retry',
            onClick: () => {
              void deleteCompletedWithRetry(completedId)
            },
          },
        })
        return false
      }

      // Deletion succeeded; never issue it twice merely because sibling refresh failed.
      pendingCompletedDeletesRef.current.delete(completedId)
      try {
        await syncCompletedAcrossViews()
      } catch (error) {
        toast.error('Completion undone, but refresh failed')
        log.error('LiveEditor undo synchronization failed', error)
      }
      return true
    })()
    entry.request = request
    return request
  }

  /**
   * Promote the caret line to `[x]`, create a Completed row, and arm the
   * 5-second undo toast. Called by the complete command (Cmd/Ctrl+Enter) for
   * both checkbox lines and — via `markPlainLineCompleted` — plain prose lines.
   *
   * Failure mode: when the create rejects, we roll the textarea back, drift-aware
   * via `noteTextRef` so the user's concurrent edits survive. An unchecked
   * checkbox reverts to `[ ]`; a source row (when `rollbackLineText` is supplied)
   * is restored verbatim instead of being left as a generated
   * `- [ ] <title>` skeleton the user never typed.
   *
   * @param lineIndex - Zero-based index of the line being completed.
   * @param title - Title to persist (uncapped; normalised for the DB here).
   * @param rollbackLineText - When set, the verbatim source row to restore on
   *   failure; omit for unchecked checkbox lines so they revert to `[ ]`.
   * @returns Promise<void>; the created row id is tracked internally for undo.
   */
  const promoteLineToCompleted = async (
    lineIndex: LiveEditorLineIndex,
    title: LiveEditorCompletedTitle,
    rollbackLineText?: string,
  ) => {
    if (activeCategoryId === null) {
      toast.error('Pick a category before checking items')
      return
    }
    const categoryId = activeCategoryId
    const safeTitle = normalizeCompletedTitle(title)
    const completedLineText =
      noteTextRef.current.split('\n')[lineIndex] ?? rollbackLineText ?? ''
    const pendingCreates = getTrackedRowsForCategory(
      pendingCreatesRef.current,
      categoryId,
    )
    const checkedRows = getTrackedRowsForCategory(
      checkedRowsRef.current,
      categoryId,
    )
    const pendingCompletion = pendingCreates.get(lineIndex)
    const recordedCompletion = checkedRows.get(lineIndex)
    const failedRestore = [...failedPromotionRestoresRef.current].some(
      (entry) =>
        entry.categoryId === categoryId &&
        entry.lineIndex === lineIndex &&
        entry.title === safeTitle,
    )
    // Repeated shortcuts for the same visible task must not create duplicate Completed rows.
    if (
      pendingCompletion?.title === safeTitle ||
      recordedCompletion?.title === safeTitle ||
      failedRestore
    ) {
      return
    }
    const createRequest = completionWriter.create({
      categoryId,
      title: safeTitle,
    })
    const pendingEntry: PendingCreate = {
      categoryId,
      lineIndex,
      completedLineText,
      promise: Promise.resolve(null),
      restorePending: false,
      title: safeTitle,
    }

    /**
     * Retries this failed optimistic row rollback and keeps duplicate completion blocked until it succeeds.
     * @param message - User-facing create failure retained on each retry toast.
     * @returns Whether the origin note is now consistent with the failed create.
     * @example
     * await retryFailedRestore('Failed to record completion')
     */
    const retryFailedRestore = async (message: string): Promise<boolean> => {
      const restored = await restoreFailedPromotionToCategory(
        categoryId,
        pendingEntry.lineIndex,
        pendingEntry.completedLineText,
        rollbackLineText,
      )
      pendingEntry.restorePending = !restored
      if (restored) {
        failedPromotionRestoresRef.current.delete(pendingEntry)
        if (pendingCreates.get(pendingEntry.lineIndex) === pendingEntry) {
          pendingCreates.delete(pendingEntry.lineIndex)
        }
        return true
      }
      failedPromotionRestoresRef.current.add(pendingEntry)
      toast.error(message, {
        action: {
          label: 'Retry',
          onClick: () => {
            void retryFailedRestore(message)
          },
        },
      })
      return false
    }

    pendingEntry.promise = createRequest.then(
      (created) => created.id,
      async (error) => {
        const message =
          error instanceof Error ? error.message : 'Failed to record completion'
        // Restore the origin category. If the user already switched away, this
        // writes category A's stored note instead of touching category B's draft.
        const restored = await retryFailedRestore(message)
        if (restored) toast.error(message)
        return null
      },
    )
    pendingCreates.set(lineIndex, pendingEntry)

    const completedId = await pendingEntry.promise
    // Drop the pending entry only if it's still the same one — a fresh
    // tick on the same line would have replaced it.
    const completionStillTracked =
      pendingCreates.get(pendingEntry.lineIndex) === pendingEntry
    if (completionStillTracked && !pendingEntry.restorePending) {
      pendingCreates.delete(pendingEntry.lineIndex)
    }
    if (completedId === null) return

    // A category switch preserves identity inside its category; editing the row still drops it.
    if (completionStillTracked) {
      checkedRows.set(pendingEntry.lineIndex, {
        categoryId,
        lineIndex: pendingEntry.lineIndex,
        completedId,
        title: safeTitle,
      })
    }
    await syncCompletedAcrossViews()

    showCompletionToast({
      title: safeTitle,
      durationMs: liveEditorToastDurationMs,
      // Read latest text via ref so the user's keystrokes between creation and
      // undo are preserved. The tracked map follows safe row shifts; the
      // captured position is accepted only when its checkbox still matches.
      onUndo: () => {
        void undoCompleted(
          safeTitle,
          completedId,
          noteTextRef.current,
          pendingEntry.lineIndex,
          categoryId,
        )
      },
      // Clear-on-complete: when the toast auto-closes (the undo window elapsed
      // without an Undo), drop the finished line so the scratchpad clears as
      // you go. Sonner fires onAutoClose ONLY on the timeout — an Undo OR a ✕
      // fires onDismiss instead (site A wires no onDismiss), so an undone or
      // ✕-closed completion is never cleared here; the ✕ just hides the toast
      // early (this site's clear is toast-tied, so dismissing simply skips it).
      onAutoClose: effectiveClearOnComplete
        ? () => {
            // Tie the clear to THIS completion via its completedId entry in
            // checkedRowsRef. If the entry is gone, the completion was already
            // reverted or edited — skip, so we never strip a same-title line
            // belonging to a different completion or category.
            let memoryKey: LiveEditorLineIndex | null = null
            for (const [key, value] of checkedRows.entries()) {
              if (value.completedId === completedId) {
                memoryKey = key
                break
              }
            }
            if (memoryKey === null) return
            // The origin note is off-screen; leave both its row and identity intact.
            if (activeCategoryIdRef.current !== categoryId) return
            // Drop the now-defunct entry BEFORE mutating text so no stale
            // {lineIndex → completedId} lingers: a leftover entry would let the
            // uncheck path's index/title fallback later delete the WRONG
            // Completed row (titles repeat by design — repetition is a feature).
            checkedRows.delete(memoryKey)

            // The ref key follows row shifts; verify that exact row is still this checked task.
            const currentLine = noteTextRef.current.split('\n')[memoryKey]
            const currentCheckbox =
              currentLine === undefined
                ? null
                : parseCheckboxLine(currentLine, memoryKey)
            if (
              !currentCheckbox?.checked ||
              currentCheckbox.title !== safeTitle
            )
              return
            setNoteDraft(removeLineAtIndex(noteTextRef.current, memoryKey), {
              dirty: true,
            })
          }
        : undefined,
    })
  }

  /**
   * Reverse a completion: delete the Completed row and flip the line back
   * to `[ ]`. Called from the toast Undo action and from the manual-uncheck
   * keyboard path.
   *
   * Drift handling: `checkedRowsRef` follows safe row shifts by `completedId`.
   * If edits destroy that identity, only an exact checkbox at the captured
   * fallback index may be changed; repeated titles are never searched globally.
   *
   * @param categoryId - Origin category for cross-category undo and rollback writes.
   */
  const undoCompleted = async (
    title: LiveEditorCompletedTitle,
    completedId: LiveEditorCompletionId,
    originalText: string,
    fallbackLineIndex: LiveEditorLineIndex,
    categoryId: Category['id'],
  ) => {
    const checkedRows = getTrackedRowsForCategory(
      checkedRowsRef.current,
      categoryId,
    )
    // Find the ref entry by completedId (key may have drifted).
    let memoryKey: LiveEditorLineIndex | null = null
    let memoryBeforeUndo: CheckedRowMemory | undefined
    for (const [key, value] of checkedRows.entries()) {
      if (value.completedId === completedId) {
        memoryKey = key
        memoryBeforeUndo = value
        break
      }
    }
    // Without tracked memory, only the captured fallback position may be tried.
    // A global title lookup is unsafe because repeated task titles are intentional.
    const resolvedLineIndex = memoryKey ?? fallbackLineIndex
    if (memoryKey !== null) checkedRows.delete(memoryKey)
    const updatedLineIndex = await setCompletedCheckboxStateInCategory(
      categoryId,
      title,
      resolvedLineIndex,
      false,
      originalText,
    )
    // Keep both the note and Completed record intact when the exact row is gone.
    if (updatedLineIndex === null) {
      if (
        memoryKey !== null &&
        memoryBeforeUndo &&
        !checkedRows.has(memoryKey)
      ) {
        checkedRows.set(memoryKey, memoryBeforeUndo)
      }
      return
    }

    // Keep the note visibly undone; a failed server delete gets its own Retry action.
    await deleteCompletedWithRetry(completedId)
  }

  /**
   * Put a cleared line back into the category it came from. While still in that
   * category, restore it into the live editor (optionally moving the caret);
   * after switching away, persist it straight to that category's STORED note via
   * IPC — so a cross-category Undo / failed create never drops the line. Called
   * by both undoClearedCompletion and the background-create failure path.
   *
   * @param entry - The completion's undo memory (line text, origin category, index).
   * @param moveCaret - Move the caret to the restored line (true for a user Undo; false for a background failure that must not yank a caret elsewhere).
   * @returns Whether the line is safely restored or no longer needs restoration.
   * @example
   * await restoreClearedLineToCategory(entry, true)  // user tapped Undo
   * await restoreClearedLineToCategory(entry, false) // background create failed
   */
  const restoreClearedLineToCategory = async (
    entry: ClearedLineMemory,
    moveCaret: boolean,
  ): Promise<boolean> => {
    // Still in the origin category → restore into the live editor; the textarea
    // shows this category's note, so an in-place re-insert is correct.
    if (activeCategoryIdRef.current === entry.categoryId) {
      const restored = insertLineAtIndex(
        noteTextRef.current,
        entry.originalLineIndex,
        entry.reinsertText,
      )
      setNoteDraft(restored, { categoryId: entry.categoryId, dirty: true })
      if (moveCaret) {
        pendingCaretRef.current = lineStartOffset(
          restored,
          entry.originalLineIndex,
        )
      }
      return true
    }
    // Switched away → the live textarea now shows a DIFFERENT category's note, so
    // writing there would corrupt it. Persist the line into the origin category's
    // stored note directly (read-modify-write its on-disk text) so the line and
    // the win never BOTH vanish. The debounce/flush effects only ever touch the
    // *active* note, so this out-of-band write to an inactive category can't race
    // them. (Worst case, if that category is re-opened mid-write, the line lands
    // on disk and surfaces on its next load — eventual consistency, never loss.)
    const api = getLiveEditorHost()
    try {
      const stored = await api.note.get(entry.categoryId)
      await api.note.set(
        entry.categoryId,
        insertLineAtIndex(stored, entry.originalLineIndex, entry.reinsertText),
      )
      return true
    } catch (error) {
      log.error('LiveEditor cross-category line restore failed', error)
      return false
    }
  }

  /**
   * Reverts a still-visible checked clear-on-complete line back to its original text.
   *
   * @param entry - Completion memory containing the checked row and original row.
   * @param moveCaret - Move the caret to the restored row for a user Undo.
   * @returns Whether the row is safely restored or a user edit made restoration unnecessary.
   * @example
   * await restoreLingeringCompletedLine(entry, true)
   */
  const restoreLingeringCompletedLine = async (
    entry: ClearedLineMemory,
    moveCaret: boolean,
  ): Promise<boolean> => {
    if (activeCategoryIdRef.current === entry.categoryId) {
      const lines = noteTextRef.current.split('\n')
      // If the user edited the lingering row, do not overwrite their new text.
      if (lines[entry.originalLineIndex] !== entry.completedLineText)
        return true
      const restored = replaceLineAtIndex(
        noteTextRef.current,
        entry.originalLineIndex,
        entry.reinsertText,
      )
      setNoteDraft(restored, { categoryId: entry.categoryId, dirty: true })
      if (moveCaret) {
        pendingCaretRef.current = lineStartOffset(
          restored,
          entry.originalLineIndex,
        )
      }
      return true
    }

    const api = getLiveEditorHost()
    try {
      const stored = await api.note.get(entry.categoryId)
      const lines = stored.split('\n')
      const currentLine = lines[entry.originalLineIndex]
      // Category switched before linger finished; write the original row even if
      // the stored note still shows the pre-flush original instead of `[x]`.
      if (
        currentLine !== entry.completedLineText &&
        currentLine !== entry.reinsertText
      ) {
        return true
      }
      await api.note.set(
        entry.categoryId,
        replaceLineAtIndex(stored, entry.originalLineIndex, entry.reinsertText),
      )
      return true
    } catch (error) {
      log.error('LiveEditor lingering line restore failed', error)
      return false
    }
  }

  /**
   * Shares one clear-line restore across create-failure and Undo races for the same entry.
   * @param entry - Clear completion whose original row must be restored once.
   * @param moveCaret - Whether a user-triggered Undo should move the caret after restore.
   * @returns The shared restore result for every concurrent caller.
   * @example
   * await restoreClearedCompletionLine(entry, true)
   */
  const restoreClearedCompletionLine = async (
    entry: ClearedLineMemory,
    moveCaret: boolean,
  ): Promise<boolean> => {
    if (entry.restorePromise) return entry.restorePromise
    entry.restorePromise = (async () => {
      try {
        const restored = entry.lineCleared
          ? await restoreClearedLineToCategory(entry, moveCaret)
          : await restoreLingeringCompletedLine(entry, moveCaret)
        entry.restorePromise = null
        return restored
      } catch (error) {
        entry.restorePromise = null
        throw error
      }
    })()
    return entry.restorePromise
  }

  /**
   * Retries a failed create's cleared-line restore until the origin note is safe again.
   * @param entry - Clear completion retaining the only copy of the removed row.
   * @param message - Original create failure shown with the Retry action.
   * @returns Whether restoration succeeded or concurrent Undo took ownership.
   * @example
   * await retryFailedClearedCompletionRestore(entry, 'network down')
   */
  const retryFailedClearedCompletionRestore = async (
    entry: ClearedLineMemory,
    message: string,
  ): Promise<boolean> => {
    // A stale Retry toast must not insert a second row after Undo or a prior retry restored it.
    if (isClearedLineUndone(entry) || entry.outcome === 'restored') return true
    const restored = await restoreClearedCompletionLine(entry, false)
    // Undo may join the same IPC attempt and owns its own terminal cleanup.
    if (isClearedLineUndone(entry)) return true
    if (!restored) {
      clearedLinesRef.current.set(entry.token, entry)
      toast.error(message, {
        action: {
          label: 'Retry',
          onClick: () => {
            void retryFailedClearedCompletionRestore(entry, message)
          },
        },
      })
      return false
    }
    entry.outcome = 'restored'
    clearedLinesRef.current.delete(entry.token)
    if (entry.toastId !== undefined) toast.dismiss(entry.toastId)
    toast.error(message)
    return true
  }

  /**
   * Cancel a single completion's pending deferred-clear timer (if still armed)
   * and stop tracking it. Idempotent. Called by undo and the create-failure
   * handler so a removal can't fire after the completion was reverted.
   *
   * @param entry - The completion whose pending removal timer to cancel.
   * @returns void.
   * @example
   * cancelPendingClearTimer(entry) // a no-op when no timer is armed
   */
  const cancelPendingClearTimer = (entry: ClearedLineMemory): void => {
    if (entry.removalTimerId !== undefined) {
      window.clearTimeout(entry.removalTimerId)
      entry.removalTimerId = undefined
    }
    pendingClearTimersRef.current.delete(entry.token)
  }

  /**
   * Schedule the deferred removal of an already-completed line after the
   * `clearDelayMs` linger (clear-on-complete ON, delay > 0). The line stays on
   * screen during the linger so it exits gently instead of snapping out the
   * instant it completes; when the timer fires we remove it — but ONLY if the
   * tracked index STILL holds the checked line (finding A: a user edit, or an
   * unaccounted shift, self-suppresses to a no-op, leaving the line). The caret
   * is preserved across the removal (finding B). setNoteDraft re-indexes every
   * unchanged sibling after row edits or removals, so each pending timer follows
   * its own line. Category swap / unmount cancel every pending timer synchronously.
   *
   * @param entry - The completion's undo memory; its `removalTimerId` is set here.
   * @returns void — the timer drives the removal; nothing to await.
   * @example
   * scheduleDeferredClear(entry) // drops entry's line after clearDelayMs, unless undone/edited
   */
  const scheduleDeferredClear = (entry: ClearedLineMemory): void => {
    // Clamp the linger to the toast duration so a finished line can never outlast
    // its own Undo: once the toast (carrying that Undo) auto-closes, the line must
    // already be gone. #108 used a FIXED ceiling (LIVE_EDITOR_CLEAR_DELAY_MAX_MS);
    // now that the toast duration is user-configurable (#109) this live `min()`
    // does that job — the clear-delay slider keeps its own fixed [0,5000] bounds.
    const effectiveClearDelayMs = Math.min(
      clearDelayMs,
      liveEditorToastDurationMs,
    )
    const removalTimerId = window.setTimeout(() => {
      // No longer pending — drop it from tracking before doing anything else.
      pendingClearTimersRef.current.delete(entry.token)
      entry.removalTimerId = undefined
      // Undo / a failed create already put the line back (or never removed it).
      if (entry.outcome === 'undone' || entry.outcome === 'restored') return
      const currentText = noteTextRef.current
      const lines = currentText.split('\n')
      // Finding A: only remove when the tracked index STILL holds this checked
      // line; otherwise leave it (the win is already recorded).
      if (lines[entry.originalLineIndex] !== entry.completedLineText) {
        if (entry.completedId !== null) {
          forgetCheckedCompletion(entry.categoryId, entry.completedId)
        }
        return
      }
      const removalStart = lineStartOffset(currentText, entry.originalLineIndex)
      // removeLineAtIndex drops the line plus its joining newline.
      const removedLength = entry.completedLineText.length + 1
      const clearedText = removeLineAtIndex(
        currentText,
        entry.originalLineIndex,
      )
      // Finding B: keep the caret put across the removal — below the removed
      // block shift up by its length, inside the block clamp to its start, above
      // it leave untouched. Read the LIVE DOM caret (the user may have typed on).
      const liveCaret = textareaRef.current?.selectionStart ?? removalStart
      let nextCaret = entry.caretAfterClearOffset ?? liveCaret
      if (entry.caretAfterClearOffset === null) {
        if (liveCaret >= removalStart + removedLength) {
          nextCaret = liveCaret - removedLength
        } else if (liveCaret > removalStart) {
          nextCaret = removalStart
        }
      }
      pendingCaretRef.current = nextCaret
      setNoteDraft(clearedText, { categoryId: entry.categoryId, dirty: true })
      entry.lineCleared = true
      if (entry.completedId !== null) {
        forgetCheckedCompletion(entry.categoryId, entry.completedId)
      }
    }, effectiveClearDelayMs)
    entry.removalTimerId = removalTimerId
    pendingClearTimersRef.current.set(entry.token, entry)
  }

  /**
   * Clear-on-complete ON path: show `[x]` first, then remove the just-completed
   * line on the configured clear timer while the Completed-create runs in the
   * background. This keeps the completion visually legible without waiting for
   * the server round-trip.
   *
   * Undo / failure restore the verbatim line: they replace a still-visible `[x]`
   * row during linger, or re-insert the row after the clear timer has removed it.
   * A create rejection still re-inserts a removed line even after the 5 s undo
   * window closed (otherwise the win is lost AND the line is gone — silent data
   * loss). The `outcome` flag guards success/failure/undo/auto-close overlap.
   *
   * @param completedText - Full note text with the completed row shown as `[x]`.
   * @param lineIndex - Zero-based index of the line being completed.
   * @param originalLine - The verbatim source line, restored as-is on undo/failure.
   * @param title - Title to persist (uncapped; normalised for the DB here).
   * @returns void — kicks off the background create; nothing to await.
   */
  const completeAndClearLine = (
    completedText: string,
    lineIndex: LiveEditorLineIndex,
    originalLine: string,
    title: LiveEditorCompletedTitle,
  ): void => {
    if (activeCategoryId === null) {
      toast.error('Pick a category before checking items')
      return
    }
    const safeTitle = normalizeCompletedTitle(title)
    const categoryId = activeCategoryId
    const completedLineText =
      completedText.split('\n')[lineIndex] ?? originalLine
    const checkedRows = getTrackedRowsForCategory(
      checkedRowsRef.current,
      categoryId,
    )
    // A cancelled delayed clear leaves `[x]` visible; returning to its category must not record it twice.
    if (checkedRows.get(lineIndex)?.title === safeTitle) return
    const trackedClearEntries = new Set([
      ...clearedLinesRef.current.values(),
      ...pendingClearTimersRef.current.values(),
    ])
    // Both clear maps share the same token entry, which follows row shifts during edits.
    for (const trackedEntry of trackedClearEntries) {
      if (
        trackedEntry.categoryId === categoryId &&
        trackedEntry.originalLineIndex === lineIndex &&
        trackedEntry.completedLineText === completedLineText &&
        trackedEntry.outcome !== 'undone' &&
        trackedEntry.outcome !== 'restored'
      ) {
        return
      }
    }

    // 1) Per-completion record (token-keyed; see ClearedLineMemory). Created
    //    BEFORE the removal so the deferred-clear timer can close over it.
    const token = nextTokenRef.current
    nextTokenRef.current += 1
    const entry: ClearedLineMemory = {
      token,
      completedId: null,
      title: safeTitle,
      categoryId,
      originalLineIndex: lineIndex,
      completedLineText,
      reinsertText: originalLine,
      outcome: 'pending',
      toastId: undefined,
      lineCleared: false,
      removalTimerId: undefined,
      caretAfterClearOffset:
        clearDelayMs <= 0
          ? lineStartOffset(
              removeLineAtIndex(completedText, lineIndex),
              lineIndex,
            )
          : null,
      restorePromise: null,
    }
    clearedLinesRef.current.set(token, entry)

    // 2) Show the checked state first, then remove it on the clear timer. A
    // 0 ms setting means "next turn", not "skip the visible check mark".
    setNoteDraft(completedText, { categoryId, dirty: true })
    if (clearDelayMs > 0) {
      // During a linger, move the caret to the START OF THE NEXT line after the
      // checked text commits, so repeated Cmd/Ctrl+Enter walks down the list.
      pendingCaretRef.current = lineStartOffset(completedText, lineIndex + 1)
    }
    scheduleDeferredClear(entry)

    // 3) Background create. Success/failure mutate `entry` and consult
    //    `outcome` so undo / auto-close / late-failure never double-apply.
    const createPromise = completionWriter
      .create({ categoryId, title: safeTitle })
      .then(
        (created): LiveEditorCompletionId | null => {
          entry.completedId = created.id
          const rowStillVisible =
            !entry.lineCleared &&
            (activeCategoryIdRef.current !== categoryId ||
              noteTextRef.current.split('\n')[entry.originalLineIndex] ===
                entry.completedLineText)
          // A category swap cancels delayed removal; retain the row's identity in its origin category.
          if (
            rowStillVisible &&
            entry.outcome !== 'undone' &&
            entry.outcome !== 'restored'
          ) {
            checkedRows.set(entry.originalLineIndex, {
              categoryId,
              lineIndex: entry.originalLineIndex,
              completedId: created.id,
              title: safeTitle,
            })
          }
          if (entry.outcome === 'confirmed') {
            clearedLinesRef.current.delete(token)
          }
          // Keep this entry while Undo remains actionable: later note edits must
          // continue shifting its restore position even after persistence wins.
          // Toast close/Undo/category cleanup owns the eventual map deletion.
          // Skip the sibling-view sync when the user already undid — the row is
          // about to be deleted by undoClearedCompletion's awaited delete.
          if (entry.outcome !== 'undone') void syncCompletedAcrossViews()
          return created.id
        },
        async (error): Promise<null> => {
          // Whatever happens next, this completion's deferred-clear timer (if one
          // is still pending) must NOT fire — cancel it up front so it can't drop
          // a line whose win never persisted.
          cancelPendingClearTimer(entry)
          // The user already undid → the line is back and they abandoned this
          // completion, so the create's failure is irrelevant to them: leave the
          // note alone (undo handled it) and stay silent (no error toast).
          if (entry.outcome === 'undone') {
            clearedLinesRef.current.delete(token)
            return null
          }
          // Create failed and the win never persisted. Restore the line ONLY if it
          // was already removed (instant path, or the timer fired): this re-insert
          // fires even after the 5 s window closed (outcome 'confirmed') — that is
          // the whole point, else the line AND the win silently vanish.
          // restoreClearedLineToCategory puts it back in the live editor while
          // we're still here, or into the origin category's STORED note once the
          // user switched away (never the wrong category's visible note). No caret
          // move: a background failure must not yank a user typing elsewhere. If
          // the line is STILL on screen (linger not yet elapsed, timer just
          // cancelled above), there is nothing to restore — leave it.
          const message =
            error instanceof Error
              ? error.message
              : 'Failed to record completion'
          await retryFailedClearedCompletionRestore(entry, message)
          return null
        },
      )

    // 4) Immediate optimistic toast — feedback at keypress, not after the
    //    round-trip. Undo re-inserts the line; auto-close just closes the
    //    affordance (the line is already gone).
    // Confirm-cleanup: the undo window closed WITHOUT an undo (a timeout, OR a
    // manual ✕ close) → mark the outcome confirmed and drop the map entry. The
    // create promise's closure still holds the reinsert info for a late failure,
    // so this is safe. (The deferred-clear timer is independent and still fires.)
    const confirmClearedCompletion = (): void => {
      if (entry.outcome === 'pending') entry.outcome = 'confirmed'
      // Keep an in-flight entry discoverable until create settles, preventing a second create after category return.
      if (entry.completedId !== null) clearedLinesRef.current.delete(token)
    }
    // A manual ✕ close and an Undo BOTH fire sonner's onDismiss, but only the ✕
    // should run confirmClearedCompletion (Undo already reverts via
    // undoClearedCompletion). This call-site flag — set by onUndo, read by
    // onDismiss — is what tells the two dismiss paths apart; the helper can't,
    // since sonner reports both as a plain dismiss (#109 / CEO-D4). Without it, a
    // ✕ would leak a stale clearedLinesRef entry and leave outcome stuck 'pending'.
    let wasUndoCalled = false
    entry.toastId = showCompletionToast({
      title: safeTitle,
      durationMs: liveEditorToastDurationMs,
      onUndo: () => {
        wasUndoCalled = true
        void undoClearedCompletion(entry, createPromise)
      },
      // Timeout (no Undo, no ✕) → confirm + cleanup.
      onAutoClose: confirmClearedCompletion,
      // Manual close: a ✕ runs the SAME cleanup as a timeout; an Undo does not
      // (it already reverted — the flag guards the double-run).
      onDismiss: () => {
        if (!wasUndoCalled) confirmClearedCompletion()
      },
    })
  }

  /**
   * Undo an optimistic clear: put the verbatim line back at its original index
   * and delete the Completed row once the create resolves. Called from the
   * clear toast's Undo action.
   *
   * Idempotent via `entry.outcome` so a double Undo (or undo racing a late
   * failure) never re-inserts twice or double-deletes. Restores the verbatim
   * line into its origin category — in the live editor when still there, else
   * into that category's stored note via IPC — then deletes the row.
   *
   * @param entry - The completion's undo memory (mutated to `undone`).
   * @param createPromise - The background create; awaited for the row id.
   * @returns Promise<void>.
   */
  const undoClearedCompletion = async (
    entry: ClearedLineMemory,
    createPromise: Promise<LiveEditorCompletionId | null>,
  ): Promise<void> => {
    // Idempotent: once the line is already back — via a prior Undo ('undone') or
    // the failure handler's restore ('restored') — do nothing. Re-inserting
    // would duplicate the line; this is the failure→Undo double-insert guard.
    if (entry.outcome === 'undone' || entry.outcome === 'restored') return
    const outcomeBeforeUndo = entry.outcome
    entry.outcome = 'undone'
    // Cancel a still-pending deferred removal: if the line never left the editor
    // (linger not yet elapsed), undo cancels the clear and restores `[x]` to
    // the original row; after removal, it re-inserts the original row.
    cancelPendingClearTimer(entry)

    // Restore the verbatim line into the category it came from. If the clear timer
    // already removed it, re-insert; if it is still on screen as `[x]`, replace it.
    // Cross-category restore writes to the origin category's STORED note, never
    // category B's visible note.
    const restored = await restoreClearedCompletionLine(entry, true)
    if (!restored) {
      // Roll back the terminal marker so the same Undo action can retry safely.
      entry.outcome = outcomeBeforeUndo
      clearedLinesRef.current.set(entry.token, entry)
      toast.error('Failed to restore LiveEditor line', {
        action: {
          label: 'Retry',
          onClick: () => {
            void undoClearedCompletion(entry, createPromise)
          },
        },
      })
      return
    }
    clearedLinesRef.current.delete(entry.token)
    if (entry.completedId !== null) {
      forgetCheckedCompletion(entry.categoryId, entry.completedId)
    }

    // Delete the server row once the create resolves. A failed create resolves
    // to null → nothing to delete.
    const completedId = await createPromise
    if (completedId === null) return
    await deleteCompletedWithRetry(completedId)
  }

  /**
   * Keep the line nearest the caret: finish an existing `- [ ]`/`- [x]`
   * checkbox, or wrap a plain prose line as `- [x]` before promoting it (so
   * users don't have to pre-type `- [ ]` to log a win). The shared body of the
   * Cmd/Ctrl+Enter shortcut and the touch-only "Keep line" button — one code
   * path, so the two can never drift.
   * @returns void; a blank caret line is a no-op.
   * @example
   * keepCaretLine() // caret on "ship it" → "- [x] ship it" plus a keep
   */
  const keepCaretLine = (): void => {
    const textarea = textareaRef.current
    if (!textarea) return

    const text = textarea.value
    const caret = textarea.selectionStart
    const lines = text.split('\n')
    const lineIndex = text.slice(0, caret).split('\n').length - 1
    const line = lines[lineIndex]
    if (line === undefined) return
    const parsed = parseCheckboxLine(line, lineIndex)

    // Clear-on-complete treats plain, unchecked, and manually checked rows alike:
    // record the win, show `[x]`, then tuck the source row away with Undo available.
    if (effectiveClearOnComplete) {
      let completionTitle: LiveEditorCompletedTitle
      let completedText: string
      if (parsed) {
        completionTitle = parsed.title
        // Preserve a manually checked row verbatim; only unchecked rows need rewriting.
        completedText = parsed.checked
          ? text
          : setCheckboxStateAtLine(text, lineIndex, true)
      } else {
        // Plain prose line: wrap as `[x]` first so the eye sees the completion.
        const promoted = markPlainLineCompleted(text, lineIndex)
        if (!promoted) return
        completionTitle = promoted.title
        completedText = promoted.text
      }
      // `line` is the verbatim source row → restored as-is on undo/failure.
      completeAndClearLine(completedText, lineIndex, line, completionTitle)
      return
    }

    if (!parsed) {
      // Not a checkbox line: let the complete command finish an ordinary prose
      // line by wrapping it as `- [x] …` and promoting it, so users don't have
      // to pre-type `- [ ]` markdown just to log a win. Blank lines and empty
      // checkbox skeletons return null and fall through to a no-op.
      const promoted = markPlainLineCompleted(text, lineIndex)
      if (!promoted) return
      setNoteDraft(promoted.text, { dirty: true })
      // Pass the plain prose as rollback text so a failed create restores the
      // original line instead of leaving the optimistic `- [x]` skeleton.
      void promoteLineToCompleted(lineIndex, promoted.title, line)
      return
    }

    if (activeCategoryIdRef.current === null) return
    if (!parsed.checked) {
      const completedText = setCheckboxStateAtLine(text, lineIndex, true)
      setNoteDraft(completedText, { dirty: true })
    }
    // A pre-checked row is still a completion command, not an uncheck command.
    void promoteLineToCompleted(
      lineIndex,
      parsed.title,
      parsed.checked ? line : undefined,
    )
  }

  /**
   * Cmd/Ctrl+Enter keeps the caret line; every other key just records the
   * pre-edit selection so identical inserted rows still re-index unambiguously.
   * @param event - The textarea keydown.
   * @returns void.
   * @example
   * <textarea onKeyDown={handleKeyDown} />
   */
  const handleKeyDown = (event: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key !== 'Enter' || !(event.metaKey || event.ctrlKey)) {
      // Keyboard edits expose their pre-change selection here; beforeinput covers paste/IME.
      pendingTextareaEditRef.current = {
        start: event.currentTarget.selectionStart,
        end: event.currentTarget.selectionEnd,
      }
      return
    }
    pendingTextareaEditRef.current = null
    // Skip while IME is composing — never hijack a CJK confirmation Enter.
    if (event.nativeEvent.isComposing) return
    event.preventDefault()
    keepCaretLine()
  }

  /**
   * Touch-only "Keep line" button (design review DR9): the same completion path
   * as the shortcut, then focus returns to the textarea so the next line can start.
   * @returns void.
   * @example
   * <Button onClick={handleKeepLineClick}>Keep line</Button>
   */
  const handleKeepLineClick = (): void => {
    keepCaretLine()
    textareaRef.current?.focus()
  }

  const closeWindow = () => {
    void getLiveEditorHost().window.close()
  }

  const opacityValue = [opacity]
  const hasCategories = categories.length > 0
  // The field is disabled until its note is ready. On the web that disabled
  // field IS the first-paint stand-in (design review DR5) — same placeholder,
  // same styling, no spinner — and turns live once Clerk resolves.
  const isNoteFieldDisabled =
    activeCategoryId === null ||
    isLoadingNote ||
    noteReadyCategoryId !== activeCategoryId
  // Only a signed-in editor with a loaded config can be waiting on a category
  // pick; before auth resolves the disabled field is the stand-in, not a prompt.
  // An empty list is never a prompt either: `/write` passes `[]` while
  // `category.list` is still in flight, and an account with no categories is
  // told so by the Select's own "No categories". Either way, telling someone to
  // pick from a list that has nothing in it is the one thing this must not do.
  const needsCategoryPick =
    isLiveEditorConfigReady &&
    isAuthLoaded &&
    !isSignedOutWeb &&
    activeCategoryId === null &&
    categories.length > 0
  // Platform copy is read after mount so the server's ⌘ and the first client render agree.
  const modifierLabel = isMounted && !isApplePlatform() ? 'Ctrl' : '⌘'
  // Ordered by honesty about the disabled field: say why it is not ready before
  // inviting anyone to type into it. A network round trip is long enough that
  // "⌘ Enter keeps it" over a dead textarea reads as a broken editor.
  const placeholder = isCategoryListPending
    ? 'Loading your categories…'
    : needsCategoryPick
      ? 'Pick a category to start writing'
      : isCoarsePointer
        ? "Write one thing. Tap Keep when it's done."
        : `Write one thing. ${modifierLabel} Enter keeps it.`
  const footerCopy = resolveFooterCopy(
    isAuthLoaded,
    isSignedIn,
    storageAvailability,
  )

  return (
    <div
      className={cn(
        'flex w-full flex-col',
        isElectronPanel
          ? 'h-screen gap-2 p-3'
          : 'mx-auto h-dvh max-w-2xl gap-3 px-4 py-6',
      )}
      data-live-editor-root
    >
      {isElectronPanel ? (
        <header
          className="flex items-center justify-between gap-2"
          style={DRAG_REGION_STYLE}
        >
          <div className="flex items-center gap-2">{/* Header Text Zone*/}</div>
          <div className="flex items-center gap-2" style={NO_DRAG_REGION_STYLE}>
            <Switch
              id={spacesInputId}
              checked={spacesTrackingEnabled}
              onCheckedChange={handleSpacesTrackingChange}
              disabled={isUpdatingSpacesTracking}
              aria-label="Show LiveEditor on all Mac desktops"
            />

            <Label
              htmlFor={spacesInputId}
              className="cursor-pointer text-xs text-muted-foreground"
            >
              Follow Spaces
            </Label>
            <button
              type="button"
              onClick={closeWindow}
              className="rounded-md px-2 py-1 text-xs text-muted-foreground hover:bg-muted hover:text-foreground"
              aria-label="Close LiveEditor"
            >
              ✕
            </button>
          </div>
        </header>
      ) : (
        // Web caption row (design review DR2/DR3): plain wordmark left (a link
        // home once signed in), the shortcut hint right — it stays after typing.
        <div className="flex items-center justify-between font-sans text-sm">
          {isSignedIn ? (
            <Link
              href="/home"
              className="inline-flex min-h-11 items-center rounded-sm font-semibold text-muted-foreground outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
            >
              CoreLive
            </Link>
          ) : (
            <span className="inline-flex min-h-11 items-center font-semibold text-muted-foreground">
              CoreLive
            </span>
          )}
          {/* Touch has no ⌘: the placeholder already says "Tap Keep", so a
              keyboard chip here would contradict it on the same screen. */}
          {!isCoarsePointer && (
            <span className="text-muted-foreground">
              <kbd className="rounded border border-border px-1.5 py-0.5 font-sans text-foreground">
                {modifierLabel} Enter
              </kbd>{' '}
              = kept
            </span>
          )}
        </div>
      )}

      {(isElectronPanel || isSignedIn) && (
        <div
          className="flex items-center gap-3 text-xs"
          style={NO_DRAG_REGION_STYLE}
        >
          {isElectronPanel && (
            <div className="flex items-center gap-2">
              <Switch
                id={syncInputId}
                checked={syncEnabled}
                onCheckedChange={handleToggleSync}
              />

              <Label htmlFor={syncInputId} className="cursor-pointer text-xs">
                Follow FloatingNav
              </Label>
            </div>
          )}

          {/* /write has no sidebar, so on the signed-in web this picker is the
              only category control (design review DR3); it writes the shared
              selection. Signed out there is one implicit category — no picker. */}
          <Select
            value={activeCategoryId === null ? '' : String(activeCategoryId)}
            onValueChange={handleCategoryValueChange}
            disabled={(isElectronPanel && syncEnabled) || !hasCategories}
          >
            <SelectTrigger
              id={categoryInputId}
              aria-label="Active category"
              className={cn(
                'text-xs',
                // 44px touch target on the web (/write is the phone surface).
                // `min-h-11`, not `h-11`: SelectTrigger's own
                // `data-[size=default]:h-9` outranks a plain height.
                isElectronPanel ? 'h-7 w-32' : 'min-h-11 w-44',
              )}
            >
              <SelectValue placeholder="No categories" />
            </SelectTrigger>
            <SelectContent>
              {categories.map((category) => (
                <SelectItem key={category.id} value={String(category.id)}>
                  {category.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          {isElectronPanel && (
            <div className="flex flex-1 items-center gap-2">
              <Label
                htmlFor={opacityInputId}
                className="text-xs text-muted-foreground"
              >
                Opacity
              </Label>
              <Slider
                id={opacityInputId}
                min={LIVE_EDITOR_OPACITY_MIN}
                max={LIVE_EDITOR_OPACITY_MAX}
                step={LIVE_EDITOR_OPACITY_STEP}
                value={opacityValue}
                onValueChange={handleOpacityValueChange}
                className="flex-1"
                aria-label="Window opacity"
              />

              <span className="w-10 text-right tabular-nums">
                {Math.round(opacity * 100)}%
              </span>
            </div>
          )}
        </div>
      )}

      <textarea
        ref={textareaRef}
        id={noteInputId}
        aria-label={NOTE_FIELD_LABEL}
        value={noteText}
        onPaste={(event) => {
          // Context-menu paste has no keydown, so capture its replaced selection here.
          pendingTextareaEditRef.current = {
            start: event.currentTarget.selectionStart,
            end: event.currentTarget.selectionEnd,
          }
        }}
        onCut={(event) => {
          // Context-menu cut also needs the selection before the browser deletes it.
          pendingTextareaEditRef.current = {
            start: event.currentTarget.selectionStart,
            end: event.currentTarget.selectionEnd,
          }
        }}
        onDrop={() => {
          // A drop can land away from the caret, so discard any stale keyboard selection.
          pendingTextareaEditRef.current = null
        }}
        onBeforeInput={(event) => {
          // Capture the browser's exact splice before duplicate text makes content diff ambiguous.
          pendingTextareaEditRef.current = {
            start: event.currentTarget.selectionStart,
            end: event.currentTarget.selectionEnd,
          }
        }}
        onChange={(event) => {
          const editRange = pendingTextareaEditRef.current ?? undefined
          pendingTextareaEditRef.current = null
          // A direct edit after a load failure is intentional new content, so it
          // can be saved even though no prior disk value was loaded.
          noteWritableCategoryRef.current = activeCategoryId
          setNoteReadyCategoryId(activeCategoryId)
          setNoteDraft(event.target.value, {
            categoryId: activeCategoryId,
            dirty: true,
            editRange,
          })
        }}
        onKeyDown={handleKeyDown}
        placeholder={placeholder}
        disabled={isNoteFieldDisabled}
        maxLength={NOTE_MAX_LENGTH}
        // LiveEditor is messy quick-capture — the native red spellcheck underlines
        // make unfinished / mixed-language fragments feel "corrected" and noisy, so
        // we keep the writing surface calm by disabling them. Only the correction
        // overlay is suppressed; typing / IME / save are unaffected (#128).
        spellCheck={false}
        // Token slots only (design review DR8): the web surface inherits the
        // visitor's theme through --card / --border / --ring; the panel keeps its
        // translucent look. The web stand-in is not dimmed while disabled — it is
        // the first paint, not a loading state.
        className={cn(
          // The focus indicator is SHARED: `outline-none` kills the UA ring for
          // both hosts, so the replacement has to cover both or the packaged
          // panel's primary surface has none at all (WCAG 2.4.7).
          'flex-1 resize-none rounded-lg border outline-none focus-visible:border-ring focus-visible:ring-1 focus-visible:ring-ring',
          isElectronPanel
            ? 'bg-background/60 p-3 disabled:opacity-50'
            : 'border-border bg-card p-4 disabled:cursor-default',
        )}
        // Inline (not a useMemo) — a fresh style object on an intrinsic element is
        // free. Spread NO_DRAG_REGION_STYLE first (load-bearing: keeps the
        // textarea outside the frameless drag region), then layer the saved
        // presentation. lineHeight is unitless so spacing scales with the size.
        style={{
          ...NO_DRAG_REGION_STYLE,
          fontFamily: LIVE_EDITOR_FONT_FAMILY_CSS[liveEditorFontFamily],
          fontSize: `${liveEditorFontSize}px`,
          lineHeight: LIVE_EDITOR_LINE_HEIGHT,
          color: liveEditorTextColor,
        }}
      />

      {/* Touch has no Cmd+Enter (design review DR9): a 44px button under the
          editor keeps the caret line through the same handler. */}
      {isCoarsePointer && (
        <Button
          type="button"
          variant="secondary"
          className="h-11 w-full"
          onClick={handleKeepLineClick}
          disabled={isNoteFieldDisabled}
        >
          Keep line
        </Button>
      )}

      {!isElectronPanel && (
        <footer className="flex items-center justify-between text-sm text-muted-foreground">
          <span>{footerCopy.text}</span>
          {footerCopy.link && (
            <Link
              href={footerCopy.link.href}
              className="inline-flex min-h-11 items-center rounded-sm px-2 outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
            >
              {footerCopy.link.label}
            </Link>
          )}
        </footer>
      )}
    </div>
  )
}
