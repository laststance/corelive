'use client'

import { useMutation, useQueryClient } from '@tanstack/react-query'
import * as React from 'react'
import { memo, useCallback, useId, useMemo, useRef, useState } from 'react'
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
  selectBraindumpFontFamily,
  selectBraindumpFontSize,
  selectBraindumpTextColor,
} from '@/lib/redux/slices/preferencesSlice'
import { broadcastTodoSync } from '@/lib/todo-sync-channel'
import type { Category, CategoryWithCount } from '@/server/schemas/category'
import type { Completed } from '@/server/schemas/completed'

import { isBrainDumpEnvironment } from '../../../electron/utils/electron-client'

import {
  type BrainDumpCompletedTitle,
  type BrainDumpLineIndex,
  COMPLETED_TITLE_MAX_LENGTH,
  markPlainLineCompleted,
  normalizeCompletedTitle,
  parseAllCheckboxes,
  parseCheckboxLine,
  setCheckboxStateAtLine,
} from './braindumpUtils'

const NOTE_DEBOUNCE_MS = 400
const TOAST_UNDO_MS = 5000

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
export const BrainDumpEditor = memo(function BrainDumpEditor({
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

  const activeCategoryId = syncEnabled ? floatingCategoryId : localCategoryId
  const checkedRowsRef = useRef<Map<BrainDumpLineIndex, CheckedRowMemory>>(
    new Map(),
  )
  // Pending creates per line — Undo awaits this before issuing delete to
  // avoid the race where a tick is reverted before the server responds.
  const pendingCreatesRef = useRef<Map<BrainDumpLineIndex, PendingCreate>>(
    new Map(),
  )
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

  const handleToggleSync = useCallback((enabled: boolean) => {
    setSyncEnabled(enabled)
    void window.brainDumpAPI?.sync.setEnabled(enabled)
  }, [])

  const handleManualCategoryChange = useCallback((id: Category['id']) => {
    setLocalCategoryId(id)
    void window.brainDumpAPI?.category.setLast(id)
  }, [])

  const handleOpacityChange = useCallback((next: number) => {
    const clamped = Math.max(
      BRAINDUMP_OPACITY_MIN,
      Math.min(BRAINDUMP_OPACITY_MAX, next),
    )
    setOpacity(clamped)
    void window.brainDumpAPI?.window.setOpacity(clamped)
  }, [])

  const handleCategoryValueChange = useCallback(
    (value: string) => {
      handleManualCategoryChange(Number(value))
    },
    [handleManualCategoryChange],
  )

  const handleOpacityValueChange = useCallback(
    (values: number[]) => {
      const next = values[0]
      if (next !== undefined) handleOpacityChange(next)
    },
    [handleOpacityChange],
  )

  /**
   * Applies the Mac Spaces tracking switch from the BrainDump header.
   *
   * @param enabled - true keeps both utility panels visible across Spaces.
   * @returns Promise that settles after the main process confirms or rolls back.
   * @example
   * await handleSpacesTrackingChange(true)
   */
  const handleSpacesTrackingChange = useCallback(
    async (enabled: boolean): Promise<void> => {
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
    },
    [spacesTrackingEnabled],
  )

  /**
   * Promote a `[ ]` line to `[x]`, create a Completed row, and arm the
   * 5-second undo toast.
   *
   * Failure mode: when the server rejects the create, we revert the textarea
   * to the unchecked state and toast the error. The optimistic flip never
   * leaves the local memory map.
   */
  const promoteLineToCompleted = useCallback(
    async (lineIndex: BrainDumpLineIndex, title: BrainDumpCompletedTitle) => {
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
            const currentLine =
              findCheckedLineIndexByTitle(noteTextRef.current, safeTitle) ??
              lineIndex
            setNoteText(
              setCheckboxStateAtLine(noteTextRef.current, currentLine, false),
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
      await queryClient.invalidateQueries({
        queryKey: orpc.completed.heatmap.key(),
      })
      broadcastTodoSync()

      const undoToastId = toast.success(`Completed: ${safeTitle}`, {
        description: 'Tap Undo within 5 s to revert.',
        duration: TOAST_UNDO_MS,
        action: {
          label: 'Undo',
          onClick: () => {
            // Read latest text via ref so the user's keystrokes between
            // creation and undo are preserved. Pass the captured title so
            // undoCompleted can re-resolve the current line index even if
            // lines have drifted.
            void undoCompleted(
              safeTitle,
              completedId,
              noteTextRef.current,
              lineIndex,
            )
            toast.dismiss(undoToastId)
          },
        },
      })
    },
    [activeCategoryId, createCompletedMutation, queryClient],
  )

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
  const undoCompleted = useCallback(
    async (
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
      setNoteText(
        setCheckboxStateAtLine(originalText, resolvedLineIndex, false),
      )

      try {
        await deleteCompletedMutation.mutateAsync({ id: completedId })
        await queryClient.invalidateQueries({
          queryKey: orpc.completed.heatmap.key(),
        })
        broadcastTodoSync()
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
    },
    [deleteCompletedMutation, queryClient],
  )

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
    if (!parsed) {
      // Not a checkbox line: let the complete command finish an ordinary prose
      // line by wrapping it as `- [x] …` and promoting it, so users don't have
      // to pre-type `- [ ]` markdown just to log a win. Blank lines and empty
      // checkbox skeletons return null and fall through to a no-op.
      const promoted = markPlainLineCompleted(text, lineIndex)
      if (!promoted) return
      setNoteText(promoted.text)
      void promoteLineToCompleted(lineIndex, promoted.title)
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
  const opacityValue = useMemo(() => [opacity], [opacity])
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
})
