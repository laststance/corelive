'use client'

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useCallback, useEffect, useId, useRef, useState } from 'react'
import { toast } from 'sonner'

import { useMounted } from '@/hooks/use-mounted'
import { useClerkQueryReady } from '@/hooks/useClerkQueryReady'
import { useSelectedCategory } from '@/hooks/useSelectedCategory'
import { orpc } from '@/lib/orpc/client-query'
import { broadcastTodoSync } from '@/lib/todo-sync-channel'
import type { CategoryWithCount } from '@/server/schemas/category'

import {
  COMPLETED_TITLE_MAX_LENGTH,
  normalizeCompletedTitle,
  parseCheckboxLine,
  setCheckboxStateAtLine,
} from './braindumpUtils'

const NOTE_DEBOUNCE_MS = 400
const TOAST_UNDO_MS = 5000
const OPACITY_MIN = 0.3
const OPACITY_MAX = 1
const OPACITY_STEP = 0.05

type CheckedRowMemory = Readonly<{
  /** Server-side Completed.id used by undo to call `completed.delete`. */
  completedId: number
  /** Verbatim title used to detect double-toggles on the same line. */
  title: string
}>

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
export function BrainDumpEditor({
  categories,
}: {
  categories: CategoryWithCount[]
}) {
  const queryClient = useQueryClient()
  const isMounted = useMounted()
  const isClerkReady = useClerkQueryReady()
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  const [opacity, setOpacity] = useState<number>(OPACITY_MAX)
  const [syncEnabled, setSyncEnabled] = useState<boolean>(true)
  const [floatingCategoryId] = useSelectedCategory()
  const [localCategoryId, setLocalCategoryId] = useState<number | null>(null)
  const [noteText, setNoteText] = useState<string>('')
  const [isLoadingNote, setIsLoadingNote] = useState<boolean>(false)
  const noteInputId = useId()
  const opacityInputId = useId()

  const activeCategoryId = syncEnabled ? floatingCategoryId : localCategoryId
  const checkedRowsRef = useRef<Map<number, CheckedRowMemory>>(new Map())

  const createCompletedMutation = useMutation(
    orpc.completed.create.mutationOptions({}),
  )
  const deleteCompletedMutation = useMutation(
    orpc.completed.delete.mutationOptions({}),
  )

  const { data: opacityFromMain } = useQuery({
    queryKey: ['braindump', 'opacity'],
    queryFn: async () =>
      window.brainDumpAPI?.window.getOpacity() ?? OPACITY_MAX,
    enabled: isMounted && Boolean(window.brainDumpAPI),
  })

  useEffect(() => {
    if (typeof opacityFromMain === 'number') {
      setOpacity(opacityFromMain)
    }
  }, [opacityFromMain])

  // Read sync mode + last category from main once on mount.
  useEffect(() => {
    if (!isMounted || !window.brainDumpAPI) return
    let cancelled = false
    const api = window.brainDumpAPI
    void Promise.all([api.sync.getEnabled(), api.category.getLast()]).then(
      ([enabled, lastCategoryId]) => {
        if (cancelled) return
        setSyncEnabled(enabled)
        setLocalCategoryId(lastCategoryId)
      },
    )
    return () => {
      cancelled = true
    }
  }, [isMounted])

  // Subscribe to main-process category broadcasts (e.g., when another window
  // changes the active category and main updates the BrainDump config).
  useEffect(() => {
    if (!isMounted || !window.brainDumpAPI) return
    const api = window.brainDumpAPI
    const cleanup = api.on(
      'braindump-category-changed',
      (...args: unknown[]) => {
        const [, payload] = args
        if (
          payload &&
          typeof payload === 'object' &&
          'categoryId' in payload &&
          typeof (payload as { categoryId: unknown }).categoryId === 'number'
        ) {
          const id = (payload as { categoryId: number }).categoryId
          setLocalCategoryId(id)
        }
      },
    )
    return cleanup
  }, [isMounted])

  // Whenever the active category flips, load that category's note text.
  useEffect(() => {
    if (!isMounted || !window.brainDumpAPI || activeCategoryId === null) {
      setNoteText('')
      return
    }
    let cancelled = false
    setIsLoadingNote(true)
    const api = window.brainDumpAPI
    void api.note.get(activeCategoryId).then((text) => {
      if (cancelled) return
      setNoteText(text)
      setIsLoadingNote(false)
      checkedRowsRef.current.clear()
    })
    return () => {
      cancelled = true
    }
  }, [activeCategoryId, isMounted])

  // Debounce note writes to avoid hammering the config file on every keystroke.
  useEffect(() => {
    if (!isMounted || !window.brainDumpAPI || activeCategoryId === null) return
    if (isLoadingNote) return
    const api = window.brainDumpAPI
    const timeoutId = window.setTimeout(() => {
      void api.note.set(activeCategoryId, noteText)
    }, NOTE_DEBOUNCE_MS)
    return () => {
      window.clearTimeout(timeoutId)
    }
  }, [activeCategoryId, isLoadingNote, isMounted, noteText])

  // Persist sync changes locally so the UI is the source of truth.
  const handleToggleSync = useCallback((enabled: boolean) => {
    setSyncEnabled(enabled)
    if (window.brainDumpAPI) {
      void window.brainDumpAPI.sync.setEnabled(enabled)
    }
  }, [])

  const handleManualCategoryChange = useCallback((id: number) => {
    setLocalCategoryId(id)
    if (window.brainDumpAPI) {
      void window.brainDumpAPI.category.setLast(id)
    }
  }, [])

  const handleOpacityChange = useCallback((next: number) => {
    const clamped = Math.max(OPACITY_MIN, Math.min(OPACITY_MAX, next))
    setOpacity(clamped)
    if (window.brainDumpAPI) {
      void window.brainDumpAPI.window.setOpacity(clamped)
    }
  }, [])

  /**
   * Promote a `[ ]` line to `[x]`, create a Completed row, and arm the
   * 5-second undo toast.
   *
   * Failure mode: when the server rejects the create, we revert the textarea
   * to the unchecked state and toast the error. The optimistic flip never
   * leaves the local memory map.
   */
  const promoteLineToCompleted = useCallback(
    async (lineIndex: number, title: string, currentText: string) => {
      if (activeCategoryId === null) {
        toast.error('Pick a category before checking items')
        return
      }
      const safeTitle = normalizeCompletedTitle(title)
      try {
        const created = await createCompletedMutation.mutateAsync({
          categoryId: activeCategoryId,
          title: safeTitle,
        })
        checkedRowsRef.current.set(lineIndex, {
          completedId: created.id,
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
              void undoCompleted(lineIndex, created.id, currentText)
              toast.dismiss(undoToastId)
            },
          },
        })
      } catch (error) {
        const message =
          error instanceof Error ? error.message : 'Failed to record completion'
        toast.error(message)
        setNoteText(setCheckboxStateAtLine(currentText, lineIndex, false))
      }
    },
    [activeCategoryId, createCompletedMutation, queryClient],
  )

  /**
   * Reverse a completion: delete the Completed row and flip the line back
   * to `[ ]`. Called from the toast Undo action.
   */
  const undoCompleted = useCallback(
    async (lineIndex: number, completedId: number, originalText: string) => {
      try {
        await deleteCompletedMutation.mutateAsync({ id: completedId })
        checkedRowsRef.current.delete(lineIndex)
        setNoteText(setCheckboxStateAtLine(originalText, lineIndex, false))
        await queryClient.invalidateQueries({
          queryKey: orpc.completed.heatmap.key(),
        })
        broadcastTodoSync()
      } catch (error) {
        const message =
          error instanceof Error ? error.message : 'Failed to undo completion'
        toast.error(message)
      }
    },
    [deleteCompletedMutation, queryClient],
  )

  /**
   * Toggle the checkbox on the line nearest the caret. Triggered by Cmd/Ctrl+
   * Enter inside the textarea — the keyboard path is the deliberate UX,
   * pointer-clicks would require a second editor mode.
   */
  const handleKeyDown = useCallback(
    (event: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if (event.key !== 'Enter' || !(event.metaKey || event.ctrlKey)) return
      const textarea = textareaRef.current
      if (!textarea) return
      event.preventDefault()

      const text = textarea.value
      const caret = textarea.selectionStart
      const upToCaret = text.slice(0, caret)
      const lineIndex = upToCaret.split('\n').length - 1
      const line = text.split('\n')[lineIndex]
      if (line === undefined) return
      const parsed = parseCheckboxLine(line, lineIndex)
      if (!parsed) return

      const nextChecked = !parsed.checked
      const nextText = setCheckboxStateAtLine(text, lineIndex, nextChecked)
      setNoteText(nextText)

      if (nextChecked) {
        void promoteLineToCompleted(lineIndex, parsed.title, nextText)
      } else {
        const memory = checkedRowsRef.current.get(lineIndex)
        if (memory) {
          void undoCompleted(lineIndex, memory.completedId, nextText)
        }
      }
    },
    [promoteLineToCompleted, undoCompleted],
  )

  const closeWindow = useCallback(() => {
    if (window.brainDumpAPI) {
      void window.brainDumpAPI.window.close()
    }
  }, [])

  // Block oRPC calls until Clerk has loaded — otherwise the request 401s
  // before useUser hydrates.
  const isReady = isMounted && isClerkReady && Boolean(window.brainDumpAPI)
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
        // The drag region lets the user move the frameless panel by its header.
        style={{ WebkitAppRegion: 'drag' } as React.CSSProperties}
      >
        <div className="flex items-center gap-2">
          <span className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
            BrainDump
          </span>
        </div>
        <button
          type="button"
          onClick={closeWindow}
          className="rounded-md px-2 py-1 text-xs text-muted-foreground hover:bg-muted hover:text-foreground"
          style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
          aria-label="Close BrainDump"
        >
          ✕
        </button>
      </header>

      <div
        className="flex items-center gap-2 text-xs"
        style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
      >
        <label className="flex items-center gap-1">
          <input
            type="checkbox"
            checked={syncEnabled}
            onChange={(event) => handleToggleSync(event.target.checked)}
          />
          <span>Follow FloatingNav</span>
        </label>

        <select
          value={activeCategoryId ?? ''}
          onChange={(event) =>
            handleManualCategoryChange(Number(event.target.value))
          }
          disabled={syncEnabled || !hasCategories}
          className="rounded-md border bg-background px-2 py-1 text-xs disabled:opacity-50"
          aria-label="Active category"
        >
          {hasCategories ? (
            categories.map((category) => (
              <option key={category.id} value={category.id}>
                {category.name}
              </option>
            ))
          ) : (
            <option value="">No categories</option>
          )}
        </select>

        <label
          className="flex flex-1 items-center gap-1"
          htmlFor={opacityInputId}
        >
          <span className="text-muted-foreground">Opacity</span>
          <input
            id={opacityInputId}
            type="range"
            min={OPACITY_MIN}
            max={OPACITY_MAX}
            step={OPACITY_STEP}
            value={opacity}
            onChange={(event) =>
              handleOpacityChange(Number(event.target.value))
            }
            className="flex-1"
            aria-label="Window opacity"
          />
          {/* eslint-disable-next-line dslint/token-only -- tabular-nums is standard Tailwind utility */}
          <span className="w-10 text-right tabular-nums">
            {Math.round(opacity * 100)}%
          </span>
        </label>
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
            : '- [ ] braindump anything here…\nUse Cmd/Ctrl+Enter on a checkbox line to toggle.'
        }
        disabled={activeCategoryId === null}
        maxLength={COMPLETED_TITLE_MAX_LENGTH * 200}
        spellCheck
        className="bg-background/60 flex-1 resize-none rounded-lg border p-3 font-mono text-sm shadow-sm focus:outline-none focus:ring-2 focus:ring-ring disabled:opacity-50"
        style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
      />
    </div>
  )
}
