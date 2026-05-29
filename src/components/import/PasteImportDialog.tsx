'use client'

import { Loader2, X } from 'lucide-react'
import * as React from 'react'
import { useCallback, useDeferredValue, useId, useMemo, useState } from 'react'
import { match } from 'ts-pattern'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import type { CategoryWithCount } from '@/server/schemas/category'

import {
  computePasteImportPreview,
  type PasteImportItem,
  type PasteImportZone,
} from './paste-import-types'

/**
 * Zone-specific copy. Centralized so the title, placeholder, confirm verb, and
 * the Todo pre-confirm expectation note all read from one table (mirrors the
 * plan's copy table). English strings — the shipped app is English.
 */
const ZONE_COPY: Record<
  PasteImportZone,
  {
    title: string
    placeholder: string
    /** Confirm label builder, e.g. "Add 12 to Completed". */
    confirmLabel: (count: string) => string
    /** Shown only for the Todo zone, above the confirm. */
    note?: string
  }
> = {
  completed: {
    title: 'Add to Completed',
    placeholder: 'paste your wins — one per line',
    confirmLabel: (count) => `Add ${count} to Completed`,
  },
  todo: {
    title: 'Add to your list',
    placeholder: 'paste your tasks — one per line',
    confirmLabel: (count) => `Add ${count} to your list`,
    note: "these stay open — they'll light the heatmap as you complete them",
  },
}

/**
 * Props for the presentational paste-import dialog. Deliberately oRPC-free:
 * the parent ({@link PasteImport}) injects `categories`, owns the mutation, and
 * passes `isSubmitting` / `error` / `onConfirm`. This seam lets the Storybook
 * stories render the full UI with zero providers (no react-query, no Toaster).
 */
export interface PasteImportDialogProps {
  /** Destination zone — selects copy + which procedure the parent will call. */
  zone: PasteImportZone
  /** Categories for the shared + per-row Select (injected, never fetched here). */
  categories: CategoryWithCount[]
  /** Initial shared category (from `useSelectedCategory()`); null = first/none. */
  defaultCategoryId: number | null
  /** Controlled open state (lifted so D7 can open it without a trigger click). */
  open: boolean
  /** Open-state setter from the parent. */
  onOpenChange: (open: boolean) => void
  /** Optional trigger node (e.g. an "Import" button) rendered as the dialog trigger. */
  trigger?: React.ReactNode
  /** True while the confirm submit is in flight — locks inputs + shows the spinner. */
  isSubmitting: boolean
  /** Non-null when the last submit failed — keeps the dialog open with a retry. */
  error: string | null
  /**
   * Confirm handler. Receives the capped item list + a stable batch id (the
   * parent holds the id so a retry reuses it → idempotent). Resolves when the
   * parent finishes (success closes; failure surfaces via `error`).
   */
  onConfirm: (items: PasteImportItem[]) => void | Promise<void>
  /**
   * Seed text for the textarea. Defaults to `''`. Exists so Storybook stories
   * and unit tests can render the preview/over-cap states without simulating
   * typing; production callers leave it unset.
   */
  initialText?: string
}

/**
 * Presentational variant-C paste-import dialog: serif title → textarea → shared
 * category + live count → quiet dense preview list → confirm. Parses on every
 * change (cheap/sync) and renders all interaction states. Holds only local UI
 * state (text, shared category, per-row overrides); all async + data come from
 * props so it renders in Storybook with no providers.
 *
 * @param props - See {@link PasteImportDialogProps}.
 * @returns The paste-import dialog (trigger + modal content).
 * @example
 * <PasteImportDialog zone="completed" categories={cats} defaultCategoryId={1}
 *   open={open} onOpenChange={setOpen} isSubmitting={false} error={null}
 *   onConfirm={(items) => console.log(items)} trigger={<Button>Import</Button>} />
 */
export const PasteImportDialog = React.memo(function PasteImportDialog({
  zone,
  categories,
  defaultCategoryId,
  open,
  onOpenChange,
  trigger,
  isSubmitting,
  error,
  onConfirm,
  initialText = '',
}: PasteImportDialogProps) {
  const [text, setText] = useState(initialText)
  // The shared category falls back to the explicit default, else the first
  // category, else null (Select stays empty until categories load).
  const initialSharedCategory = defaultCategoryId ?? categories[0]?.id ?? null
  const [sharedCategoryId, setSharedCategoryId] = useState<number | null>(
    initialSharedCategory,
  )
  // Per-row overrides keyed by row index. Cleared whenever the parse changes
  // (the BrainDump line-index-drift bug: an edit shifts rows, so a stale
  // index-keyed override would mis-apply). Calm-first for Slice 1.
  const [rowOverrides, setRowOverrides] = useState<Map<number, number>>(
    () => new Map(),
  )
  // Tracks which row is revealing its override Select (hover/focus on desktop,
  // tap on mobile). Keeps the list calm at rest — no always-on dropdowns.
  const [activeOverrideRow, setActiveOverrideRow] = useState<number | null>(
    null,
  )

  const ariaLiveId = useId()

  // Visible count is instant; the SR announcement is debounced via the
  // deferred text so a screen reader is not spammed on every keystroke.
  const preview = useMemo(() => computePasteImportPreview(text), [text])
  const deferredText = useDeferredValue(text)
  const deferredPreview = useMemo(
    () => computePasteImportPreview(deferredText),
    [deferredText],
  )

  const categoryName = useCallback(
    (id: number | null): string => {
      if (id === null) return 'Uncategorized'
      return (
        categories.find((category) => category.id === id)?.name ?? 'Category'
      )
    },
    [categories],
  )

  // Reset all transient state when the dialog closes so a reopen is fresh.
  const resetState = useCallback(() => {
    setText(initialText)
    setSharedCategoryId(initialSharedCategory)
    setRowOverrides(new Map())
    setActiveOverrideRow(null)
  }, [initialSharedCategory, initialText])

  const handleOpenChange = useCallback(
    (next: boolean) => {
      // Block close while submitting so an in-flight import is never abandoned.
      if (!next && isSubmitting) return
      if (!next) resetState()
      onOpenChange(next)
    },
    [isSubmitting, onOpenChange, resetState],
  )

  const handleTextChange = useCallback(
    (event: React.ChangeEvent<HTMLTextAreaElement>) => {
      setText(event.target.value)
      // Parse changed → drop overrides + any open override Select.
      setRowOverrides((current) => (current.size === 0 ? current : new Map()))
      setActiveOverrideRow(null)
    },
    [],
  )

  const handleSharedCategoryChange = useCallback((value: string) => {
    setSharedCategoryId(Number(value))
  }, [])

  const handleRowOverrideChange = useCallback(
    (rowIndex: number, value: string) => {
      setRowOverrides((current) => {
        const next = new Map(current)
        next.set(rowIndex, Number(value))
        return next
      })
      setActiveOverrideRow(null)
    },
    [],
  )

  const clearRowOverride = useCallback((rowIndex: number) => {
    setRowOverrides((current) => {
      if (!current.has(rowIndex)) return current
      const next = new Map(current)
      next.delete(rowIndex)
      return next
    })
  }, [])

  // Semantic reveal handlers (instead of passing the raw setter down) — keeps
  // the per-row override Select hidden at rest, revealed on hover/focus/tap.
  const revealRowOverride = useCallback((rowIndex: number) => {
    setActiveOverrideRow(rowIndex)
  }, [])

  const hideRowOverride = useCallback(() => {
    setActiveOverrideRow(null)
  }, [])

  const handleConfirm = useCallback(() => {
    if (preview.total === 0 || isSubmitting) return
    const items: PasteImportItem[] = preview.rows.map((row, index) => {
      const override = rowOverrides.get(index)
      // Inherit the shared category by sending its id; only attach a per-row
      // id when it actually differs (omitting lets the server default it).
      const categoryId = override ?? sharedCategoryId ?? undefined
      return categoryId === undefined
        ? { title: row.title }
        : { title: row.title, categoryId }
    })
    void onConfirm(items)
  }, [
    isSubmitting,
    onConfirm,
    preview.rows,
    preview.total,
    rowOverrides,
    sharedCategoryId,
  ])

  const handleCancel = useCallback(() => {
    handleOpenChange(false)
  }, [handleOpenChange])

  // Block dismissal (outside-click / ESC) while a submit is in flight so an
  // in-progress import is never abandoned mid-request.
  const preventDismissWhileSubmitting = useCallback(
    (event: Event) => {
      if (isSubmitting) event.preventDefault()
    },
    [isSubmitting],
  )

  const copy = ZONE_COPY[zone]
  const hasCategories = categories.length > 0
  const confirmDisabled = preview.total === 0 || isSubmitting
  const countLabel = preview.total.toLocaleString()

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      {trigger ? <DialogTrigger asChild>{trigger}</DialogTrigger> : null}
      <DialogContent
        className="gap-5 sm:max-w-xl lg:max-w-2xl"
        // Keep focus inside while submitting; let Radix restore on close.
        onInteractOutside={preventDismissWhileSubmitting}
        onEscapeKeyDown={preventDismissWhileSubmitting}
      >
        <DialogHeader>
          {/* Serif H2 — the warm anchor (matches DayDetailDialog / YearInReview). */}
          <DialogTitle className="font-serif text-2xl font-medium text-foreground">
            {copy.title}
          </DialogTitle>
          {/* SR-only description satisfies Radix's aria-describedby contract
              without adding visible chrome (the spec's read order is title →
              textarea, no visible subtitle). */}
          <DialogDescription className="sr-only">
            Paste one task per line, then review and confirm to import them.
          </DialogDescription>
        </DialogHeader>

        {/* Textarea — the import mouth. */}
        <Textarea
          value={text}
          onChange={handleTextChange}
          disabled={isSubmitting}
          placeholder={copy.placeholder}
          aria-label={copy.title}
          spellCheck={false}
          className="min-h-32 resize-y font-sans"
        />

        {/* Shared category + live count row. */}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <span className="text-sm text-muted-foreground">Category</span>
            <Select
              value={sharedCategoryId === null ? '' : String(sharedCategoryId)}
              onValueChange={handleSharedCategoryChange}
              disabled={isSubmitting || !hasCategories}
            >
              <SelectTrigger
                size="sm"
                aria-label="Shared category for imported items"
                className="min-w-36"
              >
                <SelectValue placeholder="Default" />
              </SelectTrigger>
              <SelectContent>
                {categories.map((category) => (
                  <SelectItem key={category.id} value={String(category.id)}>
                    {category.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <PasteImportCount preview={preview} />
        </div>

        {/* Polite, debounced announcement of the parse result for SR users. */}
        <div id={ariaLiveId} aria-live="polite" className="sr-only">
          {`${deferredPreview.total} parsed, ${deferredPreview.skipped} skipped`}
        </div>

        {/* The anchor: quiet dense preview list (never a card grid). */}
        <PasteImportPreviewList
          preview={preview}
          categories={categories}
          sharedCategoryId={sharedCategoryId}
          rowOverrides={rowOverrides}
          activeOverrideRow={activeOverrideRow}
          isSubmitting={isSubmitting}
          categoryName={categoryName}
          onRevealOverride={revealRowOverride}
          onHideOverride={hideRowOverride}
          onOverrideChange={handleRowOverrideChange}
          onClearOverride={clearRowOverride}
        />

        {/* Todo-only expectation note — set the "no heatmap fill" expectation
            at preview, not only on success. */}
        {copy.note && preview.total > 0 ? (
          <p className="text-sm text-muted-foreground">{copy.note}</p>
        ) : null}

        {/* Error / offline line — dialog stays open, paste preserved. */}
        {error ? (
          <p className="text-sm text-destructive" role="alert">
            {error}
          </p>
        ) : null}

        <DialogFooter>
          <Button
            type="button"
            variant="ghost"
            onClick={handleCancel}
            disabled={isSubmitting}
          >
            Cancel
          </Button>
          <Button
            type="button"
            onClick={handleConfirm}
            disabled={confirmDisabled}
            aria-busy={isSubmitting}
          >
            {match({ isSubmitting, hasError: Boolean(error) })
              .with({ isSubmitting: true }, () => (
                <>
                  <Loader2 className="size-4 animate-spin" aria-hidden="true" />
                  Adding…
                </>
              ))
              .with({ hasError: true }, () => 'Try again')
              .otherwise(() => copy.confirmLabel(countLabel))}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
})

/**
 * The Geist-Mono tabular count line: `N tasks`, ` · M skipped` when lines were
 * dropped, and the over-cap line. Single-sourced from the preview so the
 * numbers always reconcile with what the confirm sends.
 *
 * @param props.preview - The derived preview.
 * @returns The count line(s).
 * @example
 * <PasteImportCount preview={{ total: 12, skipped: 2, ... }} /> // "12 tasks · 2 skipped"
 */
const PasteImportCount = React.memo(function PasteImportCount({
  preview,
}: {
  preview: ReturnType<typeof computePasteImportPreview>
}) {
  const taskWord = preview.total === 1 ? 'task' : 'tasks'
  return (
    <div className="text-right font-mono text-sm tabular-nums text-muted-foreground">
      <span>
        {preview.total.toLocaleString()} {taskWord}
        {/* Only mention skips when something was actually dropped. */}
        {preview.skipped > 0 && !preview.isOverCap
          ? ` · ${preview.skipped.toLocaleString()} skipped`
          : null}
      </span>
      {preview.isOverCap ? (
        <div>
          {preview.rawLineCount.toLocaleString()} lines · importing the first{' '}
          {preview.cap.toLocaleString()}
        </div>
      ) : null}
    </div>
  )
})

/**
 * The quiet dense preview list. Renders one compact row per parsed line with an
 * at-rest inherited category chip; revealing a per-row override Select only on
 * hover/focus (desktop) or tap (mobile). Shows the warm empty hint when nothing
 * parses yet.
 *
 * @param props - Preview data, category lookups, override state, and handlers.
 * @returns The preview list or the empty hint.
 */
const PasteImportPreviewList = React.memo(function PasteImportPreviewList({
  preview,
  categories,
  sharedCategoryId,
  rowOverrides,
  activeOverrideRow,
  isSubmitting,
  categoryName,
  onRevealOverride,
  onHideOverride,
  onOverrideChange,
  onClearOverride,
}: {
  preview: ReturnType<typeof computePasteImportPreview>
  categories: CategoryWithCount[]
  sharedCategoryId: number | null
  rowOverrides: Map<number, number>
  activeOverrideRow: number | null
  isSubmitting: boolean
  categoryName: (id: number | null) => string
  onRevealOverride: (rowIndex: number) => void
  onHideOverride: () => void
  onOverrideChange: (rowIndex: number, value: string) => void
  onClearOverride: (rowIndex: number) => void
}) {
  if (preview.total === 0) {
    return (
      <div className="rounded-md border border-dashed border-border px-4 py-8 text-center text-sm text-muted-foreground">
        nothing to import yet — paste a few lines above
      </div>
    )
  }

  return (
    <ul
      className="max-h-64 divide-y divide-border overflow-y-auto rounded-md border border-border"
      aria-label={`${preview.total} items to import`}
    >
      {preview.rows.map((row, index) => {
        const overrideId = rowOverrides.get(index)
        return (
          <PasteImportPreviewRow
            key={index}
            rowIndex={index}
            title={row.title}
            effectiveCategoryId={overrideId ?? sharedCategoryId}
            isOverridden={overrideId !== undefined}
            isRevealing={activeOverrideRow === index}
            hasCategories={categories.length > 0}
            categories={categories}
            categoryName={categoryName}
            isSubmitting={isSubmitting}
            onRevealOverride={onRevealOverride}
            onHideOverride={onHideOverride}
            onOverrideChange={onOverrideChange}
            onClearOverride={onClearOverride}
          />
        )
      })}
    </ul>
  )
})

/**
 * One preview row: the title plus the category affordance. At rest it shows the
 * inherited category as a quiet outline chip (a real button); on hover/focus/tap
 * it reveals a per-row override Select with a reset control. Owns its own stable
 * per-row handlers (bound to `rowIndex`) so the list passes no index-closing
 * inline functions.
 *
 * @param props - The row's title, resolved category, reveal/override state, and handlers.
 * @returns A single `<li>` preview row.
 */
const PasteImportPreviewRow = React.memo(function PasteImportPreviewRow({
  rowIndex,
  title,
  effectiveCategoryId,
  isOverridden,
  isRevealing,
  hasCategories,
  categories,
  categoryName,
  isSubmitting,
  onRevealOverride,
  onHideOverride,
  onOverrideChange,
  onClearOverride,
}: {
  rowIndex: number
  title: string
  effectiveCategoryId: number | null
  isOverridden: boolean
  isRevealing: boolean
  hasCategories: boolean
  categories: CategoryWithCount[]
  categoryName: (id: number | null) => string
  isSubmitting: boolean
  onRevealOverride: (rowIndex: number) => void
  onHideOverride: () => void
  onOverrideChange: (rowIndex: number, value: string) => void
  onClearOverride: (rowIndex: number) => void
}) {
  // Stable callbacks for the MEMOIZED Select/SelectTrigger (the lint rule wants
  // useCallback for memoized-component props but plain inline functions for
  // intrinsic elements like <li>/<button> — hence the split below).
  const changeOverride = useCallback(
    (value: string) => onOverrideChange(rowIndex, value),
    [onOverrideChange, rowIndex],
  )
  const revealOnFocus = useCallback(
    () => onRevealOverride(rowIndex),
    [onRevealOverride, rowIndex],
  )

  return (
    <li
      className="flex items-center gap-3 px-3 py-2"
      onMouseEnter={() => onRevealOverride(rowIndex)}
      onMouseLeave={onHideOverride}
    >
      <span className="min-w-0 flex-1 truncate text-sm text-foreground">
        {title}
      </span>

      {hasCategories ? (
        isRevealing || isOverridden ? (
          <div className="flex items-center gap-1">
            <Select
              value={
                effectiveCategoryId === null ? '' : String(effectiveCategoryId)
              }
              onValueChange={changeOverride}
              disabled={isSubmitting}
            >
              <SelectTrigger
                size="sm"
                aria-label={`Category for "${title}"`}
                className="min-w-28"
                onFocus={revealOnFocus}
              >
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {categories.map((category) => (
                  <SelectItem key={category.id} value={String(category.id)}>
                    {category.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {isOverridden ? (
              <button
                type="button"
                onClick={() => onClearOverride(rowIndex)}
                disabled={isSubmitting}
                aria-label={`Reset "${title}" to the shared category`}
                className="flex size-9 items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground"
              >
                <X className="size-4" aria-hidden="true" />
              </button>
            ) : null}
          </div>
        ) : (
          // At rest: a quiet inherited chip; tap/focus reveals the Select.
          <button
            type="button"
            onClick={() => onRevealOverride(rowIndex)}
            onFocus={() => onRevealOverride(rowIndex)}
            className="flex min-h-9 shrink-0 items-center"
            aria-label={`Category ${categoryName(effectiveCategoryId)} — change`}
          >
            <Badge
              variant="outline"
              className="font-normal text-muted-foreground"
            >
              {categoryName(effectiveCategoryId)}
            </Badge>
          </button>
        )
      ) : null}
    </li>
  )
})
