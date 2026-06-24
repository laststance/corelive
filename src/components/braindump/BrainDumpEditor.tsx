'use client'

import { useMutation, useQueryClient } from '@tanstack/react-query'
import * as React from 'react'
import { useId, useLayoutEffect, useRef, useState } from 'react'
import { toast } from 'sonner'
import { z } from 'zod'

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
import { useCycleEffect } from '@/hooks/use-cycle-effect'
import { useMounted } from '@/hooks/use-mounted'
import { useClerkQueryReady } from '@/hooks/useClerkQueryReady'
import { useSelectedCategory } from '@/hooks/useSelectedCategory'
import {
  BRAINDUMP_FONT_FAMILY_CSS,
  BRAINDUMP_LINE_HEIGHT,
  BRAINDUMP_NOTE_LINES_PER_CAP,
  BRAINDUMP_OPACITY_MAX,
  BRAINDUMP_OPACITY_MIN,
  BRAINDUMP_OPACITY_STEP,
} from '@/lib/constants/braindump'
import { log } from '@/lib/logger'
import { orpc } from '@/lib/orpc/client-query'
import { useAppSelector } from '@/lib/redux/hooks'
import {
  selectBraindumpClearDelayMs,
  selectBraindumpClearOnComplete,
  selectBraindumpFontFamily,
  selectBraindumpFontSize,
  selectBraindumpTextColor,
  selectBraindumpToastDurationMs,
} from '@/lib/redux/slices/preferencesSlice'
import { broadcastTodoSync } from '@/lib/todo-sync-channel'
import type { Category, CategoryWithCount } from '@/server/schemas/category'
import type { Completed } from '@/server/schemas/completed'

import { isBrainDumpEnvironment } from '../../../electron/utils/electron-client'

import {
  type BrainDumpCompletedTitle,
  type BrainDumpLineIndex,
  COMPLETED_TITLE_MAX_LENGTH,
  insertLineAtIndex,
  lineStartOffset,
  markPlainLineCompleted,
  normalizeCompletedTitle,
  parseAllCheckboxes,
  parseCheckboxLine,
  removeLineAtIndex,
  replaceLineAtIndex,
  setCheckboxStateAtLine,
} from './braindumpUtils'

const NOTE_DEBOUNCE_MS = 400

const NOTE_MAX_LENGTH =
  COMPLETED_TITLE_MAX_LENGTH * BRAINDUMP_NOTE_LINES_PER_CAP

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

type CheckedRowMemory = Readonly<{
  /** Server-side Completed.id used by undo to call `completed.delete`. */
  completedId: Completed['id']
  /** Verbatim title used to detect double-toggles on the same line. */
  title: BrainDumpCompletedTitle
}>

/**
 * Undo memory for a line removed the *instant* it completes (clear-on-complete
 * ON path). Distinct from `CheckedRowMemory`: there the `[x]` line persists, so
 * undo re-resolves it by title; here the line is gone, so we must remember its
 * verbatim text + position to put it back.
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
  completedId: Completed['id'] | null
  /** Normalised title persisted for this completion. */
  title: BrainDumpCompletedTitle
  /** Category the line belonged to — guards cross-category re-insertion. */
  categoryId: Category['id']
  /** Index the line sat at when removed (best-effort re-insert position). */
  originalLineIndex: BrainDumpLineIndex
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
   * is still on screen (`false`) — undo/failure then just cancel the pending
   * removal and leave it in place (no re-insert). `true` once removed (the
   * instant path, or after the deferred timer fired). Undo/failure only
   * re-insert when this is `true`.
   */
  lineCleared: boolean
  /**
   * `window.setTimeout` id for a deferred removal still pending, or `undefined`
   * when none is armed (instant path, or after the timer fired / was cancelled).
   * Lets undo and the create-failure handler cancel THIS completion's pending
   * removal so it can't fire after the completion was reverted.
   */
  removalTimerId: number | undefined
}

/**
 * In-flight create-Completed promise for a line that's been ticked but not
 * yet round-tripped to the server. The title is captured at promise creation
 * so an Undo issued before the create resolves can match the right entry
 * even after lines drift. We await it before any delete so the row is never
 * orphaned in the DB.
 */
type PendingCreate = Readonly<{
  promise: Promise<Completed['id'] | null>
  title: BrainDumpCompletedTitle
}>

/**
 * Find the first `[x]` line in the given text whose title matches.
 *
 * Why title-based lookup: line indices drift the moment the user inserts or
 * deletes a line above a checked item, so storing a stale lineIndex in the
 * undo memory is unsafe. Titles are the only stable handle we have between
 * the toggle and the Undo click.
 *
 * @param text - Current textarea contents.
 * @param title - Title to look for (already normalised).
 * @returns Zero-based line index, or null when no `[x]` line matches.
 * @example
 * findCheckedLineIndexByTitle('- [x] buy milk\n- [ ] dishes', 'buy milk') // → 0
 */
function findCheckedLineIndexByTitle(
  text: string,
  title: BrainDumpCompletedTitle,
): BrainDumpLineIndex | null {
  const checkboxes = parseAllCheckboxes(text)
  for (const box of checkboxes) {
    if (box.checked && box.title === title) return box.lineIndex
  }
  return null
}

/**
 * Build the BrainDump completion toast — the `Completed: <title>` success toast
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
 * @param params.durationMs - How long the toast stays before auto-dismiss (the user pref).
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
  title: BrainDumpCompletedTitle
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
 * BrainDumpEditor — frameless transparent panel that pairs a category picker
 * with a freeform textarea using markdown checkboxes.
 *
 * UX contract:
 *  - Per-category text is persisted via the Electron preload (`note.set`)
 *    with a 400 ms debounce — the panel is offline-tolerant on purpose.
 *  - Toggling `- [ ]` → `- [x]` instantly creates a `Completed` row and shows
 *    a 5 s sonner toast with **Undo**. Undo deletes the row and flips the
 *    checkbox back, mirroring the FloatingNav undo flow.
 *  - When sync mode is on, the editor follows the FloatingNav category via
 *    `useSelectedCategory()` (BroadcastChannel-backed). When off, the user
 *    picks the category locally and we persist it via `category.setLast`.
 *
 * Why optimistic UI: the checkbox flip must feel instant — we mutate the
 * textarea state first, then fire the IPC + oRPC writes. Failure rollback
 * is handled by the toast cleanup path.
 */
export const BrainDumpEditor = function BrainDumpEditor({
  categories,
}: {
  categories: CategoryWithCount[]
}) {
  const queryClient = useQueryClient()
  const isMounted = useMounted()
  const isClerkReady = useClerkQueryReady()
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  const [opacity, setOpacity] = useState<number>(BRAINDUMP_OPACITY_MAX)
  const [syncEnabled, setSyncEnabled] = useState<boolean>(true)
  const [floatingCategoryId] = useSelectedCategory()
  const [localCategoryId, setLocalCategoryId] = useState<Category['id'] | null>(
    null,
  )
  const [noteText, setNoteText] = useState<string>('')
  const [isLoadingNote, setIsLoadingNote] = useState<boolean>(false)
  const [spacesTrackingEnabled, setSpacesTrackingEnabled] =
    useState<boolean>(false)
  const [isUpdatingSpacesTracking, setIsUpdatingSpacesTracking] =
    useState<boolean>(false)
  const noteInputId = useId()
  const opacityInputId = useId()
  const syncInputId = useId()
  const categoryInputId = useId()
  const spacesInputId = useId()

  // BrainDump text-presentation preferences (shared via the preferences slice,
  // hydrated from localStorage + live-synced across windows by the prefs sync
  // middleware). Read here and applied inline to the editor surface.
  const braindumpFontFamily = useAppSelector(selectBraindumpFontFamily)
  const braindumpFontSize = useAppSelector(selectBraindumpFontSize)
  const braindumpTextColor = useAppSelector(selectBraindumpTextColor)
  // When ON, a finished line is dropped once its undo window closes (see the
  // toast's onAutoClose in promoteLineToCompleted). Default OFF keeps every line.
  const clearOnComplete = useAppSelector(selectBraindumpClearOnComplete)
  const braindumpToastDurationMs = useAppSelector(
    selectBraindumpToastDurationMs,
  )
  // How long the finished line lingers before it's removed (clear-on-complete ON
  // path). 0 = remove instantly (prior behaviour); >0 defers the removal by this
  // many ms so the eye registers the completion first (#108). Clamped ≤ the Undo
  // window by the schema, so the line never outlasts its own Undo affordance.
  const clearDelayMs = useAppSelector(selectBraindumpClearDelayMs)

  const activeCategoryId = syncEnabled ? floatingCategoryId : localCategoryId
  const checkedRowsRef = useRef<Map<BrainDumpLineIndex, CheckedRowMemory>>(
    new Map(),
  )
  // Pending creates per line — Undo awaits this before issuing delete to
  // avoid the race where a tick is reverted before the server responds.
  const pendingCreatesRef = useRef<Map<BrainDumpLineIndex, PendingCreate>>(
    new Map(),
  )
  // Clear-on-complete ON path: token-keyed undo memory for lines removed the
  // instant they complete. Separate map from checkedRowsRef (which serves the
  // keep-the-[x] OFF path) so the two flows never share keys. Cleared on
  // category swap (load effect below) to neutralise stale cross-category undos.
  const clearedLinesRef = useRef<Map<number, ClearedLineMemory>>(new Map())
  // Monotonic token source for clearedLinesRef keys (never reused → no collision).
  const nextTokenRef = useRef<number>(0)
  // Deferred-clear timers still pending (token → entry). SEPARATE from
  // clearedLinesRef, which the create-success path empties eagerly — this map
  // must outlive that so a firing timer can (a) be cancelled in bulk on a
  // category swap / unmount and (b) re-index its still-pending siblings after it
  // removes a line (a sequential top-to-bottom burst of completions all shift up
  // by one, so each later entry's tracked index must follow — finding G).
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
  // Synchronous guard because state-driven disabled UI applies after render.
  const isUpdatingSpacesTrackingRef = useRef<boolean>(false)
  // Last value persisted via `note.set` — guards against the load effect
  // re-emitting a write for content the renderer just received from main.
  const lastPersistedRef = useRef<{
    categoryId: Category['id'] | null
    text: string
  }>({ categoryId: null, text: '' })

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
        }
      }
      pendingTimers.clear()
    }
  }, [activeCategoryId])

  const createCompletedMutation = useMutation(
    orpc.completed.create.mutationOptions({}),
  )
  const deleteCompletedMutation = useMutation(
    orpc.completed.delete.mutationOptions({}),
  )

  // Initial pull of opacity + sync mode + Spaces tracking from the main process.
  useCycleEffect(() => {
    if (!isMounted || !isBrainDumpEnvironment()) return
    let cancelled = false
    const api = window.brainDumpAPI
    if (!api) return
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
      })
      .catch((error) => {
        // Failures here keep the safe defaults seeded by useState; surface
        // a toast so the user knows their persisted prefs didn't load.
        if (cancelled) return
        toast.error('Failed to load BrainDump preferences')
        log.error('BrainDump preferences load failed', error)
      })
    return () => {
      cancelled = true
    }
  }, [isMounted])

  // Subscribe to main-process category broadcasts (e.g., when another window
  // changes the active category and main updates the BrainDump config).
  useCycleEffect(() => {
    if (!isMounted || !isBrainDumpEnvironment()) return
    const api = window.brainDumpAPI
    if (!api) return
    return api.on('braindump-category-changed', (payload) => {
      // Preload sanitizes args and strips the IpcRendererEvent — payload is
      // the first user arg.
      const parsed = categoryChangedPayloadSchema.safeParse(payload)
      if (parsed.success) setLocalCategoryId(parsed.data.categoryId)
    })
  }, [isMounted])

  // Move keyboard focus into the note editor whenever the BrainDump window is
  // shown, so a quick global-shortcut capture lands in the textarea instead of
  // the first focusable control (the "Follow Spaces" switch). The window is
  // hidden — not destroyed — between toggles, so the textarea can't lean on a
  // mount-time autoFocus to refocus on re-show; we listen for the Page
  // Visibility transition to 'visible' that BrowserWindow.show() drives, and
  // also focus once on mount for the first open. focus() is a no-op while the
  // textarea is disabled (no active category) — picking a category first is the
  // expected flow there.
  useCycleEffect(() => {
    if (!isMounted || !isBrainDumpEnvironment()) return
    const focusNoteEditor = () => {
      textareaRef.current?.focus()
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
  }, [isMounted])

  // Whenever the active category flips, load that category's note text.
  useCycleEffect(() => {
    if (!isMounted || !isBrainDumpEnvironment() || activeCategoryId === null) {
      setNoteText('')
      lastPersistedRef.current = { categoryId: null, text: '' }
      return
    }
    const api = window.brainDumpAPI
    // Guard before flipping the spinner so the editor doesn't get stuck
    // loading when the preload hasn't injected `brainDumpAPI` yet.
    if (!api) return
    let cancelled = false
    setIsLoadingNote(true)
    api.note
      .get(activeCategoryId)
      .then((text) => {
        if (cancelled) return
        setNoteText(text)
        // Mark as already-persisted so the debounce effect doesn't immediately
        // echo this text back to disk.
        lastPersistedRef.current = { categoryId: activeCategoryId, text }
        checkedRowsRef.current.clear()
        pendingCreatesRef.current.clear()
        clearedLinesRef.current.clear()
      })
      .catch((error) => {
        if (cancelled) return
        toast.error('Failed to load note for this category')
        log.error('BrainDump note load failed', error)
        // Reset editor state BEFORE clearing the loading flag so the
        // category swap doesn't briefly show stale text from category A
        // while we render category B's failure.
        setNoteText('')
        lastPersistedRef.current = { categoryId: null, text: '' }
        checkedRowsRef.current.clear()
        pendingCreatesRef.current.clear()
        clearedLinesRef.current.clear()
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
    if (!isMounted || !isBrainDumpEnvironment() || activeCategoryId === null)
      return
    if (isLoadingNote) return
    const api = window.brainDumpAPI
    if (!api) return
    const persisted = lastPersistedRef.current
    if (
      persisted.categoryId === activeCategoryId &&
      persisted.text === noteText
    ) {
      return
    }
    const timeoutId = window.setTimeout(() => {
      lastPersistedRef.current = {
        categoryId: activeCategoryId,
        text: noteText,
      }
      void api.note.set(activeCategoryId, noteText)
    }, NOTE_DEBOUNCE_MS)
    return () => {
      window.clearTimeout(timeoutId)
    }
  }, [activeCategoryId, isLoadingNote, isMounted, noteText])

  // Final flush: runs on category swap and unmount only (not on every keystroke).
  // Reads the latest text via ref so we never persist a stale snapshot.
  useCycleEffect(() => {
    if (!isMounted || !isBrainDumpEnvironment() || activeCategoryId === null)
      return
    const api = window.brainDumpAPI
    if (!api) return
    const flushCategoryId = activeCategoryId
    return () => {
      const text = noteTextRef.current
      const persisted = lastPersistedRef.current
      if (persisted.categoryId === flushCategoryId && persisted.text === text) {
        return
      }
      lastPersistedRef.current = { categoryId: flushCategoryId, text }
      void api.note.set(flushCategoryId, text)
    }
  }, [activeCategoryId, isMounted])

  const handleToggleSync = (enabled: boolean) => {
    setSyncEnabled(enabled)
    void window.brainDumpAPI?.sync.setEnabled(enabled)
  }

  const handleManualCategoryChange = (id: Category['id']) => {
    setLocalCategoryId(id)
    void window.brainDumpAPI?.category.setLast(id)
  }

  const handleOpacityChange = (next: number) => {
    const clamped = Math.max(
      BRAINDUMP_OPACITY_MIN,
      Math.min(BRAINDUMP_OPACITY_MAX, next),
    )
    setOpacity(clamped)
    void window.brainDumpAPI?.window.setOpacity(clamped)
  }

  const handleCategoryValueChange = (value: string) => {
    handleManualCategoryChange(Number(value))
  }

  const handleOpacityValueChange = (values: number[]) => {
    const next = values[0]
    if (next !== undefined) handleOpacityChange(next)
  }

  /**
   * Applies the Mac Spaces tracking switch from the BrainDump header.
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
        await window.brainDumpAPI?.spaces?.setVisibleOnAllWorkspaces(enabled)
      setSpacesTrackingEnabled(applied ?? enabled)
    } catch (error) {
      setSpacesTrackingEnabled(previous)
      toast.error('Failed to update desktop tracking')
      log.error('BrainDump Spaces tracking update failed', error)
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
   * Promote the caret line to `[x]`, create a Completed row, and arm the
   * 5-second undo toast. Called by the complete command (Cmd/Ctrl+Enter) for
   * both checkbox lines and — via `markPlainLineCompleted` — plain prose lines.
   *
   * Failure mode: when the create rejects, we roll the textarea back, drift-aware
   * via `noteTextRef` so the user's concurrent edits survive. A checkbox line
   * reverts to `[ ]`; a plain line (when `rollbackPlainText` is supplied) is
   * restored to its original prose instead of being left as a `- [ ] <title>`
   * skeleton the user never typed.
   *
   * @param lineIndex - Zero-based index of the line being completed.
   * @param title - Title to persist (uncapped; normalised for the DB here).
   * @param rollbackPlainText - When set, the plain prose to restore on failure
   *   (plain-line completions); omit for checkbox lines so they revert to `[ ]`.
   * @returns Promise<void>; the created row id is tracked internally for undo.
   */
  const promoteLineToCompleted = async (
    lineIndex: BrainDumpLineIndex,
    title: BrainDumpCompletedTitle,
    rollbackPlainText?: BrainDumpCompletedTitle,
  ) => {
    if (activeCategoryId === null) {
      toast.error('Pick a category before checking items')
      return
    }
    const safeTitle = normalizeCompletedTitle(title)
    const promise = createCompletedMutation
      .mutateAsync({
        categoryId: activeCategoryId,
        title: safeTitle,
      })
      .then(
        (created) => created.id,
        (error) => {
          const message =
            error instanceof Error
              ? error.message
              : 'Failed to record completion'
          toast.error(message)
          // Re-resolve which line still holds the `[x]` for this title —
          // the original lineIndex may have drifted if the user inserted
          // text above before the create rejected.
          const resolvedLine = findCheckedLineIndexByTitle(
            noteTextRef.current,
            safeTitle,
          )
          const currentLine = resolvedLine ?? lineIndex
          // Plain-line completion: restore the original prose rather than
          // leaving a `- [ ] <title>` skeleton the user never typed — but ONLY
          // when the title search positively found the line. On a miss we fall
          // back to the safe uncheck (a no-op on non-checkbox lines) so a
          // drifted stale lineIndex never blind-overwrites an unrelated line
          // the user edited while the create was in flight. Checkbox lines
          // (no rollbackPlainText) always revert to `[ ]` as before.
          setNoteText(
            rollbackPlainText !== undefined && resolvedLine !== null
              ? replaceLineAtIndex(
                  noteTextRef.current,
                  resolvedLine,
                  rollbackPlainText,
                )
              : setCheckboxStateAtLine(noteTextRef.current, currentLine, false),
          )
          return null
        },
      )
    const pendingEntry: PendingCreate = { promise, title: safeTitle }
    pendingCreatesRef.current.set(lineIndex, pendingEntry)

    const completedId = await promise
    // Drop the pending entry only if it's still the same one — a fresh
    // tick on the same line would have replaced it.
    if (pendingCreatesRef.current.get(lineIndex) === pendingEntry) {
      pendingCreatesRef.current.delete(lineIndex)
    }
    if (completedId === null) return

    checkedRowsRef.current.set(lineIndex, {
      completedId,
      title: safeTitle,
    })
    await syncCompletedAcrossViews()

    showCompletionToast({
      title: safeTitle,
      durationMs: braindumpToastDurationMs,
      // Read latest text via ref so the user's keystrokes between creation and
      // undo are preserved. Pass the captured title so undoCompleted can
      // re-resolve the current line index even if lines have drifted.
      onUndo: () => {
        void undoCompleted(
          safeTitle,
          completedId,
          noteTextRef.current,
          lineIndex,
        )
      },
      // Clear-on-complete: when the toast auto-closes (the undo window elapsed
      // without an Undo), drop the finished line so the scratchpad clears as
      // you go. Sonner fires onAutoClose ONLY on the timeout — an Undo OR a ✕
      // fires onDismiss instead (site A wires no onDismiss), so an undone or
      // ✕-closed completion is never cleared here; the ✕ just hides the toast
      // early (this site's clear is toast-tied, so dismissing simply skips it).
      onAutoClose: clearOnComplete
        ? () => {
            // Tie the clear to THIS completion via its completedId entry in
            // checkedRowsRef. If the entry is gone, the completion was already
            // reverted (toast Undo / manual uncheck both delete it) or the
            // category was switched (which clears the whole map) — skip, so we
            // never strip a same-title line belonging to a different
            // completion or category.
            let memoryKey: BrainDumpLineIndex | null = null
            for (const [key, value] of checkedRowsRef.current.entries()) {
              if (value.completedId === completedId) {
                memoryKey = key
                break
              }
            }
            if (memoryKey === null) return
            // Drop the now-defunct entry BEFORE mutating text so no stale
            // {lineIndex → completedId} lingers: a leftover entry would let the
            // uncheck path's index/title fallback later delete the WRONG
            // Completed row (titles repeat by design — repetition is a feature).
            checkedRowsRef.current.delete(memoryKey)

            // Re-resolve by title against the freshest text (the index may have
            // drifted) and remove ONLY a line that is STILL checked: a manual
            // uncheck leaves it `- [ ]`, which won't match, so this self-suppresses.
            const lineToClear = findCheckedLineIndexByTitle(
              noteTextRef.current,
              safeTitle,
            )
            if (lineToClear === null) return
            setNoteText(removeLineAtIndex(noteTextRef.current, lineToClear))
          }
        : undefined,
    })
  }

  /**
   * Reverse a completion: delete the Completed row and flip the line back
   * to `[ ]`. Called from the toast Undo action and from the manual-uncheck
   * keyboard path.
   *
   * Drift handling: the `fallbackLineIndex` captured at toggle time may be
   * stale by undo time (the user can edit text between the two events). We
   * re-resolve the line by `title` against the latest text and walk the
   * `checkedRowsRef` map by `completedId` so the cleanup targets the right
   * entry no matter how the keys have shifted.
   */
  const undoCompleted = async (
    title: BrainDumpCompletedTitle,
    completedId: Completed['id'],
    originalText: string,
    fallbackLineIndex: BrainDumpLineIndex,
  ) => {
    const resolvedLineIndex =
      findCheckedLineIndexByTitle(originalText, title) ?? fallbackLineIndex

    // Find the ref entry by completedId (key may have drifted).
    let memoryKey: BrainDumpLineIndex | null = null
    let memoryBeforeUndo: CheckedRowMemory | undefined
    for (const [key, value] of checkedRowsRef.current.entries()) {
      if (value.completedId === completedId) {
        memoryKey = key
        memoryBeforeUndo = value
        break
      }
    }
    if (memoryKey !== null) checkedRowsRef.current.delete(memoryKey)
    setNoteText(setCheckboxStateAtLine(originalText, resolvedLineIndex, false))

    try {
      await deleteCompletedMutation.mutateAsync({ id: completedId })
      await syncCompletedAcrossViews()
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Failed to undo completion'
      toast.error(message)
      // Roll back the optimistic uncheck so the checkbox state matches
      // the still-existing Completed row. Re-resolve again from the
      // latest text — drift may have continued during the await.
      const rollbackLineIndex =
        findCheckedLineIndexByTitle(noteTextRef.current, title) ??
        resolvedLineIndex
      setNoteText(
        setCheckboxStateAtLine(noteTextRef.current, rollbackLineIndex, true),
      )
      if (memoryBeforeUndo) {
        checkedRowsRef.current.set(rollbackLineIndex, memoryBeforeUndo)
      }
    }
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
   * @returns Promise<void> — settles once the line is back: synchronously in-editor when still active, or after the IPC write when cross-category.
   * @example
   * await restoreClearedLineToCategory(entry, true)  // user tapped Undo
   * void restoreClearedLineToCategory(entry, false)  // background create failed
   */
  const restoreClearedLineToCategory = async (
    entry: ClearedLineMemory,
    moveCaret: boolean,
  ): Promise<void> => {
    // Still in the origin category → restore into the live editor; the textarea
    // shows this category's note, so an in-place re-insert is correct.
    if (activeCategoryIdRef.current === entry.categoryId) {
      const restored = insertLineAtIndex(
        noteTextRef.current,
        entry.originalLineIndex,
        entry.reinsertText,
      )
      setNoteText(restored)
      if (moveCaret) {
        pendingCaretRef.current = lineStartOffset(
          restored,
          entry.originalLineIndex,
        )
      }
      return
    }
    // Switched away → the live textarea now shows a DIFFERENT category's note, so
    // writing there would corrupt it. Persist the line into the origin category's
    // stored note directly (read-modify-write its on-disk text) so the line and
    // the win never BOTH vanish. The debounce/flush effects only ever touch the
    // *active* note, so this out-of-band write to an inactive category can't race
    // them. (Worst case, if that category is re-opened mid-write, the line lands
    // on disk and surfaces on its next load — eventual consistency, never loss.)
    const api = window.brainDumpAPI
    if (!api) return
    try {
      const stored = await api.note.get(entry.categoryId)
      await api.note.set(
        entry.categoryId,
        insertLineAtIndex(stored, entry.originalLineIndex, entry.reinsertText),
      )
    } catch (error) {
      log.error('BrainDump cross-category line restore failed', error)
    }
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
   * tracked index STILL holds the verbatim line (finding A: a user edit, or an
   * unaccounted shift, self-suppresses to a no-op, leaving the line). The caret
   * is preserved across the removal (finding B). After removing, every
   * still-pending sibling below shifts up by one, so we decrement their tracked
   * index (finding G) — without this a top-to-bottom burst of completions within
   * one linger would leave all but the first un-cleared. Category swap / unmount
   * cancel every pending timer synchronously (the layout effect above).
   *
   * @param entry - The completion's undo memory; its `removalTimerId` is set here.
   * @returns void — the timer drives the removal; nothing to await.
   * @example
   * scheduleDeferredClear(entry) // drops entry's line after clearDelayMs, unless undone/edited
   */
  const scheduleDeferredClear = (entry: ClearedLineMemory): void => {
    // Clamp the linger to the toast duration so a finished line can never outlast
    // its own Undo: once the toast (carrying that Undo) auto-closes, the line must
    // already be gone. #108 used a FIXED ceiling (BRAINDUMP_CLEAR_DELAY_MAX_MS);
    // now that the toast duration is user-configurable (#109) this live `min()`
    // does that job — the clear-delay slider keeps its own fixed [0,5000] bounds.
    const effectiveClearDelayMs = Math.min(
      clearDelayMs,
      braindumpToastDurationMs,
    )
    const removalTimerId = window.setTimeout(() => {
      // No longer pending — drop it from tracking before doing anything else.
      pendingClearTimersRef.current.delete(entry.token)
      entry.removalTimerId = undefined
      // Undo / a failed create already put the line back (or never removed it).
      if (entry.outcome === 'undone' || entry.outcome === 'restored') return
      const currentText = noteTextRef.current
      const lines = currentText.split('\n')
      // Finding A: only remove when the tracked index STILL holds this exact
      // line; otherwise leave it (the win is already recorded).
      if (lines[entry.originalLineIndex] !== entry.reinsertText) return
      const removalStart = lineStartOffset(currentText, entry.originalLineIndex)
      // removeLineAtIndex drops the line plus its joining newline.
      const removedLength = entry.reinsertText.length + 1
      const clearedText = removeLineAtIndex(
        currentText,
        entry.originalLineIndex,
      )
      // Finding B: keep the caret put across the removal — below the removed
      // block shift up by its length, inside the block clamp to its start, above
      // it leave untouched. Read the LIVE DOM caret (the user may have typed on).
      const liveCaret = textareaRef.current?.selectionStart ?? removalStart
      let nextCaret = liveCaret
      if (liveCaret >= removalStart + removedLength) {
        nextCaret = liveCaret - removedLength
      } else if (liveCaret > removalStart) {
        nextCaret = removalStart
      }
      pendingCaretRef.current = nextCaret
      setNoteText(clearedText)
      entry.lineCleared = true
      // Finding G: our removal shifted every later still-pending line up by one,
      // so decrement their tracked index to keep their own finding-A guard matching.
      for (const pendingEntry of pendingClearTimersRef.current.values()) {
        if (pendingEntry.originalLineIndex > entry.originalLineIndex) {
          pendingEntry.originalLineIndex -= 1
        }
      }
    }, effectiveClearDelayMs)
    entry.removalTimerId = removalTimerId
    pendingClearTimersRef.current.set(entry.token, entry)
  }

  /**
   * Clear-on-complete ON path: remove the just-completed line from the note —
   * instantly when the clear delay is 0, else after the configured `clearDelayMs`
   * linger (#108) — show the optimistic Undo toast immediately, and run the
   * Completed-create in the background. This kills the old "wait for the server
   * round-trip + 5 s, then delete" lag.
   *
   * Undo / failure restore the verbatim line ONLY if it was already removed; during
   * the linger the line is still on screen, so they just cancel the pending removal
   * and leave it. A create rejection still re-inserts a removed line even after the
   * 5 s undo window closed (otherwise the win is lost AND the line is gone — silent
   * data loss). The `outcome` flag on the entry guards the
   * success/failure/undo/auto-close overlap so nothing double-applies.
   *
   * @param text - The note text as it was when the key fired (pre-removal).
   * @param lineIndex - Zero-based index of the line being completed.
   * @param originalLine - The verbatim line, restored as-is on undo/failure.
   * @param title - Title to persist (uncapped; normalised for the DB here).
   * @returns void — kicks off the background create; nothing to await.
   */
  const completeAndClearLine = (
    text: string,
    lineIndex: BrainDumpLineIndex,
    originalLine: string,
    title: BrainDumpCompletedTitle,
  ): void => {
    if (activeCategoryId === null) {
      toast.error('Pick a category before checking items')
      return
    }
    const safeTitle = normalizeCompletedTitle(title)
    const categoryId = activeCategoryId

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
      reinsertText: originalLine,
      outcome: 'pending',
      toastId: undefined,
      lineCleared: false,
      removalTimerId: undefined,
    }
    clearedLinesRef.current.set(token, entry)

    // 2) Remove the line — instantly (delay ≤ 0) or after the chosen linger.
    if (clearDelayMs <= 0) {
      // Instant path (verbatim prior behaviour): drop the line now and put the
      // caret at the start of the line that slid up into its place. The layout
      // effect applies the caret post-commit since the line count changed.
      const clearedText = removeLineAtIndex(text, lineIndex)
      setNoteText(clearedText)
      pendingCaretRef.current = lineStartOffset(clearedText, lineIndex)
      entry.lineCleared = true
    } else {
      // Deferred path: leave the line on screen for the linger, but move the
      // caret to the START OF THE NEXT line NOW so a repeated Cmd/Ctrl+Enter
      // walks down the list instead of re-completing this still-visible line.
      // Apply it synchronously (NOT via pendingCaretRef): the textarea value is
      // unchanged in this branch, so the `[noteText]` layout effect never fires
      // to consume a pending ref — a stashed offset would sit stale and then
      // yank the caret on the next unrelated noteText change (e.g. typing).
      // The line itself is removed when the timer fires (finding A/B/G).
      const nextLineCaret = lineStartOffset(text, lineIndex + 1)
      textareaRef.current?.setSelectionRange(nextLineCaret, nextLineCaret)
      scheduleDeferredClear(entry)
    }

    // 3) Background create. Success/failure mutate `entry` and consult
    //    `outcome` so undo / auto-close / late-failure never double-apply.
    const createPromise = createCompletedMutation
      .mutateAsync({ categoryId, title: safeTitle })
      .then(
        (created): Completed['id'] | null => {
          entry.completedId = created.id
          // The row is now persisted, so drop the map entry eagerly instead of
          // waiting for onAutoClose. Sonner PAUSES the close timer while the
          // window is hidden, and BrainDump windows are hidden (not destroyed)
          // between toggles — so onAutoClose can be deferred indefinitely, which
          // would leak this entry across a long session. Undo still works after
          // this delete: undoClearedCompletion holds `entry` via closure, not
          // via the map (the map only serves the category-swap bulk-clear).
          clearedLinesRef.current.delete(token)
          // Skip the sibling-view sync when the user already undid — the row is
          // about to be deleted by undoClearedCompletion's awaited delete.
          if (entry.outcome !== 'undone') void syncCompletedAcrossViews()
          return created.id
        },
        (error): null => {
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
          if (entry.lineCleared) {
            void restoreClearedLineToCategory(entry, false)
          }
          // Terminal NOW: a late Undo — the toast stays clickable through sonner's
          // dismiss exit-animation — must not restore a SECOND copy (undo
          // early-returns on 'restored'). Set before dismissing the toast.
          entry.outcome = 'restored'
          clearedLinesRef.current.delete(token)
          if (entry.toastId !== undefined) toast.dismiss(entry.toastId)
          toast.error(
            error instanceof Error
              ? error.message
              : 'Failed to record completion',
          )
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
      clearedLinesRef.current.delete(token)
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
      durationMs: braindumpToastDurationMs,
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
    createPromise: Promise<Completed['id'] | null>,
  ): Promise<void> => {
    // Idempotent: once the line is already back — via a prior Undo ('undone') or
    // the failure handler's restore ('restored') — do nothing. Re-inserting
    // would duplicate the line; this is the failure→Undo double-insert guard.
    if (entry.outcome === 'undone' || entry.outcome === 'restored') return
    entry.outcome = 'undone'
    clearedLinesRef.current.delete(entry.token)
    // Cancel a still-pending deferred removal: if the line never left the editor
    // (linger not yet elapsed), undo just abandons the clear and leaves it.
    cancelPendingClearTimer(entry)

    // Re-insert the verbatim line into the category it came from — but ONLY if it
    // was actually removed (instant path, or the timer already fired). If it is
    // still on screen (deferred clear cancelled above) there is nothing to put
    // back. When restored: into the live editor while still here (the caret moves
    // to it, since this IS a user action), or into that category's STORED note
    // once the user switched away (so the line returns to category A, never
    // category B's visible note).
    if (entry.lineCleared) {
      await restoreClearedLineToCategory(entry, true)
    }

    // Delete the server row once the create resolves. A failed create resolves
    // to null → nothing to delete.
    const completedId = await createPromise
    if (completedId === null) return
    try {
      await deleteCompletedMutation.mutateAsync({ id: completedId })
      await syncCompletedAcrossViews()
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : 'Failed to undo completion',
      )
    }
  }

  /**
   * Complete the line nearest the caret: toggle an existing `- [ ]`/`- [x]`
   * checkbox, or finish a plain prose line by wrapping it as `- [x]` and
   * promoting it (so users don't have to pre-type `- [ ]` to log a win).
   * Triggered by Cmd/Ctrl+Enter inside the textarea — the keyboard path is the
   * deliberate UX; pointer-clicks would require a second editor mode.
   */
  const handleKeyDown = (event: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key !== 'Enter' || !(event.metaKey || event.ctrlKey)) return
    // Skip while IME is composing — never hijack a CJK confirmation Enter.
    if (event.nativeEvent.isComposing) return
    const textarea = textareaRef.current
    if (!textarea) return
    event.preventDefault()

    const text = textarea.value
    const caret = textarea.selectionStart
    const lines = text.split('\n')
    const lineIndex = text.slice(0, caret).split('\n').length - 1
    const line = lines[lineIndex]
    if (line === undefined) return
    const parsed = parseCheckboxLine(line, lineIndex)

    // Clear-on-complete ON + a COMPLETION (a plain line, or ticking an unchecked
    // box) → remove the line instantly and show the optimistic Undo toast.
    // Un-ticking an existing `[x]` line (parsed.checked === true) and the OFF
    // preference both fall through to the legacy keep-the-`[x]` path below.
    if (clearOnComplete && parsed?.checked !== true) {
      let completionTitle: BrainDumpCompletedTitle
      if (parsed) {
        completionTitle = parsed.title
      } else {
        // Plain prose line: reuse markPlainLineCompleted only for its title +
        // skip guards (blank / empty skeleton → null → no-op); ignore its
        // `[x]`-wrapped text since this path removes the line instead.
        const promoted = markPlainLineCompleted(text, lineIndex)
        if (!promoted) return
        completionTitle = promoted.title
      }
      // `line` is the verbatim source row → restored as-is on undo/failure.
      completeAndClearLine(text, lineIndex, line, completionTitle)
      return
    }

    if (!parsed) {
      // Not a checkbox line: let the complete command finish an ordinary prose
      // line by wrapping it as `- [x] …` and promoting it, so users don't have
      // to pre-type `- [ ]` markdown just to log a win. Blank lines and empty
      // checkbox skeletons return null and fall through to a no-op.
      const promoted = markPlainLineCompleted(text, lineIndex)
      if (!promoted) return
      setNoteText(promoted.text)
      // Pass the plain prose as rollback text so a failed create restores the
      // original line instead of leaving the optimistic `- [x]` skeleton.
      void promoteLineToCompleted(lineIndex, promoted.title, promoted.title)
      return
    }

    const nextChecked = !parsed.checked
    const nextText = setCheckboxStateAtLine(text, lineIndex, nextChecked)
    setNoteText(nextText)

    if (nextChecked) {
      void promoteLineToCompleted(lineIndex, parsed.title)
    } else {
      // Look up the ref entry — first by current lineIndex, then by
      // matching title (the lineIndex key may have drifted since the
      // toggle if the user inserted/removed lines above it).
      let memory = checkedRowsRef.current.get(lineIndex)
      if (!memory) {
        for (const value of checkedRowsRef.current.values()) {
          if (value.title === parsed.title) {
            memory = value
            break
          }
        }
      }
      if (memory) {
        void undoCompleted(
          memory.title,
          memory.completedId,
          nextText,
          lineIndex,
        )
        return
      }
      // No memory yet → the create is probably still in flight. Await it
      // before issuing delete so the row is never orphaned in the DB.
      // Cosmetic wart: the success toast from `promoteLineToCompleted`
      // will still flash for an item the user already unchecked. The DB
      // stays consistent because the awaited delete runs right after.
      let pending = pendingCreatesRef.current.get(lineIndex)
      if (!pending) {
        for (const value of pendingCreatesRef.current.values()) {
          if (value.title === parsed.title) {
            pending = value
            break
          }
        }
      }
      if (pending) {
        const pendingTitle = pending.title
        void pending.promise.then((completedId) => {
          if (completedId === null) return
          void undoCompleted(
            pendingTitle,
            completedId,
            noteTextRef.current,
            lineIndex,
          )
        })
      }
    }
  }

  const closeWindow = () => {
    void window.brainDumpAPI?.window.close()
  }

  // Block oRPC calls until Clerk has loaded — otherwise the request 401s
  // before useUser hydrates.
  const isReady = isMounted && isClerkReady && isBrainDumpEnvironment()
  const opacityValue = [opacity]
  if (!isReady) {
    return (
      <div className="flex h-full w-full items-center justify-center text-sm text-muted-foreground">
        Loading BrainDump…
      </div>
    )
  }

  const hasCategories = categories.length > 0

  return (
    <div
      className="flex h-screen w-full flex-col gap-2 p-3"
      data-braindump-root
    >
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
            aria-label="Show BrainDump on all Mac desktops"
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
            aria-label="Close BrainDump"
          >
            ✕
          </button>
        </div>
      </header>

      <div
        className="flex items-center gap-3 text-xs"
        style={NO_DRAG_REGION_STYLE}
      >
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

        <Select
          value={activeCategoryId === null ? '' : String(activeCategoryId)}
          onValueChange={handleCategoryValueChange}
          disabled={syncEnabled || !hasCategories}
        >
          <SelectTrigger
            id={categoryInputId}
            aria-label="Active category"
            className="h-7 w-32 text-xs"
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

        <div className="flex flex-1 items-center gap-2">
          <Label
            htmlFor={opacityInputId}
            className="text-xs text-muted-foreground"
          >
            Opacity
          </Label>
          <Slider
            id={opacityInputId}
            min={BRAINDUMP_OPACITY_MIN}
            max={BRAINDUMP_OPACITY_MAX}
            step={BRAINDUMP_OPACITY_STEP}
            value={opacityValue}
            onValueChange={handleOpacityValueChange}
            className="flex-1"
            aria-label="Window opacity"
          />

          <span className="w-10 text-right tabular-nums">
            {Math.round(opacity * 100)}%
          </span>
        </div>
      </div>

      <textarea
        ref={textareaRef}
        id={noteInputId}
        value={noteText}
        onChange={(event) => setNoteText(event.target.value)}
        onKeyDown={handleKeyDown}
        placeholder={
          activeCategoryId === null
            ? 'Pick a category to start writing'
            : '- [ ] braindump anything here…\nUse Cmd/Ctrl+Enter to complete the current line.'
        }
        disabled={activeCategoryId === null}
        maxLength={NOTE_MAX_LENGTH}
        spellCheck
        className="bg-background/60 flex-1 resize-none rounded-lg border p-3 shadow-sm focus:outline-none disabled:opacity-50"
        // Inline (not a useMemo) — a fresh style object on an intrinsic element is
        // free. Spread NO_DRAG_REGION_STYLE first (load-bearing: keeps the
        // textarea outside the frameless drag region), then layer the saved
        // presentation. lineHeight is unitless so spacing scales with the size.
        style={{
          ...NO_DRAG_REGION_STYLE,
          fontFamily: BRAINDUMP_FONT_FAMILY_CSS[braindumpFontFamily],
          fontSize: `${braindumpFontSize}px`,
          lineHeight: BRAINDUMP_LINE_HEIGHT,
          color: braindumpTextColor,
        }}
      />
    </div>
  )
}
