'use client'
import Link from 'next/link'
import * as React from 'react'
import { useId, useState } from 'react'

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
import { useInitialEffect } from '@/hooks/use-initial-effect'
import {
  LIVE_EDITOR_FONT_FAMILY_CLASS,
  LIVE_EDITOR_LINE_HEIGHT,
  LIVE_EDITOR_NOTE_LINES_PER_CAP,
  LIVE_EDITOR_OPACITY_MAX,
  LIVE_EDITOR_OPACITY_MIN,
  LIVE_EDITOR_OPACITY_STEP,
} from '@/lib/constants/live-editor'
import {
  type LocalStorageAvailability,
  getLocalStorageAvailability,
} from '@/lib/live-editor/localStorageSlot'
import { useAppSelector } from '@/lib/redux/hooks'
import {
  selectLiveEditorFontFamily,
  selectLiveEditorFontSize,
  selectLiveEditorTextColor,
  selectShowTodayEmber,
} from '@/lib/redux/slices/settingsSlice'
import { cn } from '@/lib/utils'
import { isApplePlatform } from '@/lib/utils/isApplePlatform'
import type { Category, CategoryWithCount } from '@/server/schemas/category'

import { LiveEditorTodayEmber } from './LiveEditorTodayEmber'
import { COMPLETED_TITLE_MAX_LENGTH } from './liveEditorUtils'
import type { useLiveEditorWindowSettings } from './useLiveEditorWindowSettings'

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

interface LiveEditorSurfaceProps {
  windowSettings: ReturnType<typeof useLiveEditorWindowSettings>
  textareaProps: Pick<
    React.ComponentProps<'textarea'>,
    | 'ref'
    | 'value'
    | 'onPaste'
    | 'onCut'
    | 'onDrop'
    | 'onBeforeInput'
    | 'onChange'
    | 'onKeyDown'
  >
  categories: CategoryWithCount[]
  isCategoryListPending: boolean
  isElectronPanel: boolean
  isMounted: boolean
  isSignedIn: boolean | undefined
  isAuthLoaded: boolean
  isSignedOutWeb: boolean
  isLiveEditorConfigReady: boolean
  activeCategoryId: Category['id'] | null
  isNoteFieldDisabled: boolean
  handleCategoryValueChange: (value: string) => void
  handleKeepLineClick: () => void
  closeWindow: () => void
}

/** Renders {@link LiveEditor}'s writing surface and presentation settings while its controller owns persistence and Undo.
 * @param props - Current editor state and the controller's interaction handlers.
 * @returns The web or native editor controls, note field, and footer.
 * @example <LiveEditorSurface {...props} />
 */
export function LiveEditorSurface({
  windowSettings,
  textareaProps,
  categories,
  isCategoryListPending,
  isElectronPanel,
  isMounted,
  isSignedIn,
  isAuthLoaded,
  isSignedOutWeb,
  isLiveEditorConfigReady,
  activeCategoryId,
  isNoteFieldDisabled,
  handleCategoryValueChange,
  handleKeepLineClick,
  closeWindow,
}: LiveEditorSurfaceProps) {
  const {
    opacity,
    spacesTrackingEnabled,
    isUpdatingSpacesTracking,
    handleSpacesTrackingChange,
    handleOpacityValueChange,
  } = windowSettings
  const isCoarsePointer = useCoarsePointer()
  // The probe writes (and removes) a key, so it runs in an effect rather than in
  // the render body — a side effect there is what React Compiler memoization is
  // free to drop or repeat. 'ok' until it answers, matching the server render.
  const [storageAvailability, setStorageAvailability] =
    useState<LocalStorageAvailability>('ok')
  useInitialEffect(() => {
    setStorageAvailability(getLocalStorageAvailability())
  })
  const noteInputId = useId()
  const opacityInputId = useId()
  const categoryInputId = useId()
  const spacesInputId = useId()

  // LiveEditor text-presentation settings (shared via the settings slice,
  // hydrated from localStorage + live-synced across windows by the settings sync
  // middleware). Read here and applied inline to the editor surface.
  const liveEditorFontFamily = useAppSelector(selectLiveEditorFontFamily)
  const showTodayEmber = useAppSelector(selectShowTodayEmber)
  const liveEditorFontSize = useAppSelector(selectLiveEditorFontSize)
  const liveEditorTextColor = useAppSelector(selectLiveEditorTextColor)
  const opacityValue = [opacity]
  const hasCategories = categories.length > 0
  // The field is disabled until its note is ready. On the web that disabled
  // field IS the first-paint stand-in (design review DR5) — same placeholder,
  // same styling, no spinner — and turns live once Clerk resolves.
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
  const placeholder = getNotePlaceholder(
    isCategoryListPending,
    needsCategoryPick,
    isCoarsePointer,
    modifierLabel,
  )
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

      {/* Unmount the count observer when disabled, so Ember makes no background reads. */}
      {showTodayEmber && <LiveEditorTodayEmber compact={isElectronPanel} />}

      {(isElectronPanel || isSignedIn) && (
        <div
          className="flex items-center gap-3 text-xs"
          style={NO_DRAG_REGION_STYLE}
        >
          {/* /write has no sidebar, so on the signed-in web this picker is the
              only category control (design review DR3); it writes the shared
              selection. Signed out there is one implicit category — no picker. */}
          <Select
            value={activeCategoryId === null ? '' : String(activeCategoryId)}
            onValueChange={handleCategoryValueChange}
            disabled={!hasCategories}
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
        {...textareaProps}
        id={noteInputId}
        aria-label={NOTE_FIELD_LABEL}
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
          // No focus line on purpose (Raphtalia, 2026-09-05): the writing surface
          // is the whole panel, so the caret is the focus cue. `outline-none`
          // drops the UA ring on both hosts; keep it if you re-add a ring so the
          // two never stack. Deliberate WCAG 2.4.7 trade-off for this textarea.
          'flex-1 resize-none rounded-lg border outline-none',
          isElectronPanel
            ? 'bg-background/60 p-3 disabled:opacity-50'
            : 'border-border bg-card p-4 disabled:cursor-default',
          // The saved face is a stock Tailwind utility (see the class map).
          LIVE_EDITOR_FONT_FAMILY_CLASS[liveEditorFontFamily],
        )}
        // Inline (not a useMemo) — a fresh style object on an intrinsic element is
        // free. Spread NO_DRAG_REGION_STYLE first (load-bearing: keeps the
        // textarea outside the frameless drag region), then layer the saved
        // size and color. lineHeight is unitless so spacing scales with the size.
        style={{
          ...NO_DRAG_REGION_STYLE,
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

/** Explains the note field's readiness and input method for {@link LiveEditorSurface}.
 * @param isCategoryListPending - Whether category loading is still in flight.
 * @param needsCategoryPick - Whether a signed-in user must select a category.
 * @param isCoarsePointer - Whether touch is the primary input.
 * @param modifierLabel - Platform-specific keyboard modifier.
 * @returns Honest loading, selection, or input guidance.
 * @example getNotePlaceholder(false, false, true, '⌘')
 */
function getNotePlaceholder(
  isCategoryListPending: boolean,
  needsCategoryPick: boolean,
  isCoarsePointer: boolean,
  modifierLabel: string,
): string {
  if (isCategoryListPending) return 'Loading your categories…'
  if (needsCategoryPick) return 'Pick a category to start writing'
  if (isCoarsePointer) return "Write one thing. Tap Keep when it's done."
  return `Write one thing. ${modifierLabel} Enter keeps it.`
}
