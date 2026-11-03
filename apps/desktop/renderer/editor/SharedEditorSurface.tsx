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
import { cn } from '@corelive/live-editor/cn'
import { Button } from '@corelive/live-editor/ui/button'
import { Label } from '@corelive/live-editor/ui/label'
import { Slider } from '@corelive/live-editor/ui/slider'
import { Switch } from '@corelive/live-editor/ui/switch'
import * as React from 'react'
import { useId } from 'react'

import { FinishedLineStrikes } from './FinishedLineStrikes'
import { useCoarsePointer } from './hooks/useCoarsePointer'
import { isApplePlatform } from './isApplePlatform'
import { COMPLETED_TITLE_MAX_LENGTH } from './liveEditorUtils'

export interface EditorWindowSettings {
  opacity: number
  spacesTrackingEnabled: boolean
  isUpdatingSpacesTracking: boolean
  handleSpacesTrackingChange: (enabled: boolean) => void | Promise<void>
  handleOpacityValueChange: (values: number[]) => void
}

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
  ember?: React.ReactNode
  nativeHeader?: React.ReactNode
  nativeFooter?: React.ReactNode
  noteMaxLength?: number
  details?: React.ReactNode
  isCategoryListPending: boolean
  isCategoryListError: boolean
  onRetryCategories?: () => void
  isMounted: boolean
  isLiveEditorConfigReady: boolean
  activeCategoryId: string | null
  isNoteFieldDisabled: boolean
  /**
   * Draws a hairline strike over every finished (`- [x]`) title. The desktop editor
   * passes keep mode ("Clear finished lines" off); other hosts leave it unset.
   */
  strikeFinishedLines?: boolean
  handleKeepLineClick: () => void
  closeWindow: () => void
}

/** Renders the bundled desktop panel's writing surface; the native adapter supplies persistence controls.
 * @param props - Current editor state and the controller's interaction handlers.
 * @returns The native editor header, controls, note field, and footer.
 * @example <SharedEditorSurface {...props} />
 */
export function SharedEditorSurface({
  windowSettings,
  textareaProps,
  categoryCount,
  categoryPicker,
  settings,
  ember,
  nativeHeader,
  nativeFooter,
  noteMaxLength = NOTE_MAX_LENGTH,
  details,
  isCategoryListPending,
  isMounted,
  isLiveEditorConfigReady,
  activeCategoryId,
  isNoteFieldDisabled,
  strikeFinishedLines = false,
  handleKeepLineClick,
  closeWindow,
}: SharedEditorSurfaceProps) {
  const isCoarsePointer = useCoarsePointer()
  const noteInputId = useId()
  const opacityInputId = useId()
  const spacesInputId = useId()

  // Only a loaded config with categories but no active pick can be waiting on a
  // category pick. An empty list is never a prompt: an account with no
  // categories is told so by the picker's own "No categories", and telling
  // someone to pick from a list that has nothing in it is what this must not do.
  const needsCategoryPick =
    isLiveEditorConfigReady && activeCategoryId === null && categoryCount > 0
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

  return (
    <div
      className="flex h-full min-h-0 w-full flex-col gap-2 overflow-y-auto p-3"
      data-live-editor-root
    >
      <div className="shrink-0 space-y-2">
        <NativeEditorHeader
          windowSettings={windowSettings}
          nativeHeader={nativeHeader}
          spacesInputId={spacesInputId}
          closeWindow={closeWindow}
        />

        {/* Unmount the count observer when disabled, so Ember makes no background reads. */}
        {ember}

        <EditorCategoryControls
          categoryPicker={categoryPicker}
          windowSettings={windowSettings}
          opacityInputId={opacityInputId}
        />
      </div>
      {details}
      <EditorNoteField
        textareaProps={textareaProps}
        isHidden={details !== undefined}
        noteInputId={noteInputId}
        placeholder={placeholder}
        isNoteFieldDisabled={isNoteFieldDisabled}
        noteMaxLength={noteMaxLength}
        settings={settings}
        strikeFinishedLines={strikeFinishedLines}
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

      {nativeFooter}
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

/** Groups category selection and native opacity controls without affecting the writing node.
 * @example <EditorCategoryControls {...props} />
 */
function EditorCategoryControls({
  categoryPicker,
  windowSettings,
  opacityInputId,
}: Pick<SharedEditorSurfaceProps, 'categoryPicker' | 'windowSettings'> & {
  opacityInputId: string
}) {
  const { opacity, handleOpacityValueChange } = windowSettings
  const opacityValue = [opacity]
  return (
    <div
      className="flex flex-wrap items-center gap-2 text-xs"
      style={NO_DRAG_REGION_STYLE}
    >
      {categoryPicker}

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
    </div>
  )
}

/**
 * The writing field plus its finished-line strike layer, sharing one set of text metrics.
 * Split from {@link SharedEditorSurface} so the overlay can never drift from the field's
 * padding, font and line height. The wrapper hides with Details while the field stays mounted.
 *
 * @param props - The field's controller props, visibility and the strike switch.
 * @returns The positioned field wrapper.
 * @example <EditorNoteField {...fieldProps} strikeFinishedLines />
 */
function EditorNoteField({
  textareaProps,
  isHidden,
  noteInputId,
  placeholder,
  isNoteFieldDisabled,
  noteMaxLength,
  settings,
  strikeFinishedLines,
}: Pick<
  SharedEditorSurfaceProps,
  'textareaProps' | 'isNoteFieldDisabled' | 'settings'
> & {
  isHidden: boolean
  noteInputId: string
  placeholder: string
  noteMaxLength: number
  strikeFinishedLines: boolean
}) {
  const { liveEditorFontFamily, liveEditorFontSize, liveEditorTextColor } =
    settings
  // One source for the field's text metrics: the strike overlay must wrap exactly like the field.
  const noteFieldPaddingClass = 'p-3'
  const noteFieldFontClass = LIVE_EDITOR_FONT_FAMILY_CLASS[liveEditorFontFamily]
  const noteFieldFontStyle: React.CSSProperties = {
    fontSize: `${liveEditorFontSize}px`,
    lineHeight: LIVE_EDITOR_LINE_HEIGHT,
  }
  // The wrapper positions the strike overlay over the field. It hides with Details
  // while the field stays mounted, so its value, caret and IME state survive.
  return (
    <div
      hidden={isHidden}
      className="relative flex min-h-16 min-w-0 flex-1 flex-col"
    >
      <textarea
        {...textareaProps}
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
        // Token slots only (design review DR8): the panel keeps its translucent look.
        className={cn(
          // No focus line on purpose (Raphtalia, 2026-09-05): the writing surface
          // is the whole panel, so the caret is the focus cue. `outline-none`
          // drops the UA ring; keep it if you re-add a ring so the two never
          // stack. Deliberate WCAG 2.4.7 trade-off for this textarea.
          'min-h-16 min-w-0 flex-1 resize-none rounded-lg border outline-none',
          noteFieldPaddingClass,
          'bg-background/60 disabled:opacity-50',
          // The saved face is a stock Tailwind utility (see the class map).
          noteFieldFontClass,
        )}
        // Inline (not a useMemo) — a fresh style object on an intrinsic element is
        // free. Spread NO_DRAG_REGION_STYLE first (load-bearing: keeps the
        // textarea outside the frameless drag region), then layer the saved
        // size and color. lineHeight is unitless so spacing scales with the size.
        style={{
          ...NO_DRAG_REGION_STYLE,
          ...noteFieldFontStyle,
          color: liveEditorTextColor,
        }}
      />
      {strikeFinishedLines && (
        <FinishedLineStrikes
          text={
            typeof textareaProps.value === 'string' ? textareaProps.value : ''
          }
          paddingClassName={noteFieldPaddingClass}
          fontClassName={noteFieldFontClass}
          fontStyle={noteFieldFontStyle}
        />
      )}
    </div>
  )
}
