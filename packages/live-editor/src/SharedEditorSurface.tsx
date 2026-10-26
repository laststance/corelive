'use client'
import {
  LIVE_EDITOR_FONT_FAMILY_CLASS,
  LIVE_EDITOR_LINE_HEIGHT,
  LIVE_EDITOR_NOTE_LINES_PER_CAP,
  LIVE_EDITOR_OPACITY_MAX,
  LIVE_EDITOR_OPACITY_MIN,
  LIVE_EDITOR_OPACITY_STEP,
} from '@corelive/desktop-contract/live-editor-constants'
import type { UserSettingsState } from '@corelive/desktop-contract/settings'
import * as React from 'react'
import { useId } from 'react'

import { cn } from './cn'
import { useCoarsePointer } from './hooks/useCoarsePointer'
import { isApplePlatform } from './isApplePlatform'
import { COMPLETED_TITLE_MAX_LENGTH } from './liveEditorUtils'
import { Button } from './ui/button'
import { Label } from './ui/label'
import { Slider } from './ui/slider'
import { Switch } from './ui/switch'

export interface EditorWindowSettings {
  opacity: number
  spacesTrackingEnabled: boolean
  isUpdatingSpacesTracking: boolean
  handleSpacesTrackingChange: (enabled: boolean) => void | Promise<void>
  handleOpacityValueChange: (values: number[]) => void
}
export type BrowserStorageAvailability = 'ok' | 'unavailable'

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
 * Picks the web frame's footer line for the current auth / storage state.
 * Bundled Electron supplies its own durable-save footer; this is web-only copy.
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
  storageAvailability: BrowserStorageAvailability,
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

export interface SharedEditorSurfaceProps {
  windowSettings: EditorWindowSettings
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
    | 'onCompositionStart'
    | 'onCompositionEnd'
    | 'onSelect'
  >
  categoryCount: number
  categoryPicker: React.ReactNode
  settings: UserSettingsState
  storageAvailability: BrowserStorageAvailability
  ember?: React.ReactNode
  nativeHeader?: React.ReactNode
  nativeFooter?: React.ReactNode
  noteMaxLength?: number
  details?: React.ReactNode
  linkComponent?: React.ComponentType<{
    href: string
    className: string
    children: React.ReactNode
  }>
  isCategoryListPending: boolean
  isCategoryListError: boolean
  onRetryCategories?: () => void
  isElectronPanel: boolean
  isMounted: boolean
  isSignedIn: boolean | undefined
  isAuthLoaded: boolean
  isSignedOutWeb: boolean
  isLiveEditorConfigReady: boolean
  activeCategoryId: number | null
  isNoteFieldDisabled: boolean
  handleKeepLineClick: () => void
  closeWindow: () => void
}

/** Renders the same writing surface for browser and bundled hosts; adapters supply account state and persistence controls.
 * @param props - Current editor state and the controller's interaction handlers.
 * @returns The web or native editor controls, note field, and footer.
 * @example <SharedEditorSurface {...props} />
 */
export function SharedEditorSurface({
  windowSettings,
  textareaProps,
  categoryCount,
  categoryPicker,
  settings,
  storageAvailability,
  ember,
  nativeHeader,
  nativeFooter,
  noteMaxLength = NOTE_MAX_LENGTH,
  details,
  linkComponent,
  isCategoryListPending,
  isElectronPanel,
  isMounted,
  isSignedIn,
  isAuthLoaded,
  isSignedOutWeb,
  isLiveEditorConfigReady,
  activeCategoryId,
  isNoteFieldDisabled,
  handleKeepLineClick,
  closeWindow,
}: SharedEditorSurfaceProps) {
  const isCoarsePointer = useCoarsePointer()
  const Link = linkComponent ?? 'a'
  const noteInputId = useId()
  const opacityInputId = useId()
  const spacesInputId = useId()

  const { liveEditorFontFamily, liveEditorFontSize, liveEditorTextColor } =
    settings
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
    categoryCount > 0
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
          ? 'h-full min-h-0 gap-2 overflow-y-auto p-3'
          : 'mx-auto h-dvh max-w-2xl gap-3 px-4 py-6',
      )}
      data-live-editor-root
    >
      <div className={isElectronPanel ? 'shrink-0 space-y-2' : 'contents'}>
        {isElectronPanel ? (
          <NativeEditorHeader
            windowSettings={windowSettings}
            nativeHeader={nativeHeader}
            spacesInputId={spacesInputId}
            closeWindow={closeWindow}
          />
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
        {ember}

        {(isElectronPanel || isSignedIn) && (
          <EditorCategoryControls
            categoryPicker={categoryPicker}
            windowSettings={windowSettings}
            opacityInputId={opacityInputId}
            isElectronPanel={isElectronPanel}
          />
        )}
      </div>
      {details}
      <textarea
        {...textareaProps}
        hidden={details !== undefined}
        id={noteInputId}
        aria-label={NOTE_FIELD_LABEL}
        placeholder={placeholder}
        disabled={isNoteFieldDisabled}
        maxLength={noteMaxLength}
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
          'min-h-16 min-w-0 flex-1 resize-none rounded-lg border outline-none',
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
      {isCoarsePointer && details === undefined && (
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

      {isElectronPanel && nativeFooter}
      {!isElectronPanel && (
        <WebEditorFooter footerCopy={footerCopy} Link={Link} />
      )}
    </div>
  )
}

/** Explains the note field's readiness and input method for {@link SharedEditorSurface}.
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

/** Keeps native header space draggable and window controls clickable across save/sync states.
 * {@link SharedEditorSurface} provides the host's action slot and window settings.
 * @example <NativeEditorHeader {...props} />
 */
function NativeEditorHeader({
  windowSettings,
  nativeHeader,
  spacesInputId,
  closeWindow,
}: {
  windowSettings: EditorWindowSettings
  nativeHeader: React.ReactNode
  spacesInputId: string
  closeWindow: () => void
}) {
  const {
    spacesTrackingEnabled,
    isUpdatingSpacesTracking,
    handleSpacesTrackingChange,
  } = windowSettings
  return (
    <header
      className="flex select-none flex-wrap items-center justify-between gap-2"
      style={DRAG_REGION_STYLE}
    >
      <div className="flex items-center gap-2" style={NO_DRAG_REGION_STYLE}>
        {nativeHeader}
      </div>
      <div
        className="flex min-w-0 flex-1 basis-44 items-center gap-2"
        style={DRAG_REGION_STYLE}
      >
        {/* Exclude only controls; a stretching no-drag wrapper blocks window movement through blank space. */}
        <Switch
          id={spacesInputId}
          checked={spacesTrackingEnabled}
          onCheckedChange={handleSpacesTrackingChange}
          disabled={isUpdatingSpacesTracking}
          aria-label="Show LiveEditor on all Mac desktops"
          style={NO_DRAG_REGION_STYLE}
        />

        <Label
          htmlFor={spacesInputId}
          className="min-w-0 cursor-pointer text-xs text-muted-foreground"
          style={NO_DRAG_REGION_STYLE}
        >
          Follow Spaces
        </Label>
        <button
          type="button"
          onClick={closeWindow}
          className="ml-auto size-11 shrink-0 rounded-md text-xs text-muted-foreground hover:bg-muted hover:text-foreground"
          aria-label="Close LiveEditor"
          style={NO_DRAG_REGION_STYLE}
        >
          ✕
        </button>
      </div>
    </header>
  )
}

/** Shows the web storage explanation without coupling native status geometry to web auth.
 * @example <WebEditorFooter footerCopy={copy} Link="a" />
 */
function WebEditorFooter({
  footerCopy,
  Link,
}: {
  footerCopy: FooterCopy
  Link: NonNullable<SharedEditorSurfaceProps['linkComponent']> | 'a'
}) {
  return (
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
  )
}

/** Groups category selection and native opacity controls without affecting the writing node.
 * @example <EditorCategoryControls {...props} />
 */
function EditorCategoryControls({
  categoryPicker,
  windowSettings,
  opacityInputId,
  isElectronPanel,
}: Pick<
  SharedEditorSurfaceProps,
  'categoryPicker' | 'windowSettings' | 'isElectronPanel'
> & { opacityInputId: string }) {
  const { opacity, handleOpacityValueChange } = windowSettings
  const opacityValue = [opacity]
  return (
    <div
      className={cn(
        'flex items-center text-xs',
        isElectronPanel ? 'flex-wrap gap-2' : 'gap-3',
      )}
      style={NO_DRAG_REGION_STYLE}
    >
      {/* /write has no sidebar, so on the signed-in web this picker is the
              only category control (design review DR3); it writes the shared
              selection. Signed out there is one implicit category — no picker. */}
      {categoryPicker}

      {isElectronPanel && (
        <div className="flex min-w-32 flex-1 items-center gap-2">
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
  )
}
