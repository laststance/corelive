import {
  useRef,
  type ChangeEvent,
  type ClipboardEvent,
  type CompositionEvent,
  type InputEvent,
  type KeyboardEvent,
  type RefObject,
  type SyntheticEvent,
} from 'react'

import {
  markPlainLineCompleted,
  parseCheckboxLine,
  setCheckboxStateAtLine,
} from './liveEditorUtils'
import type { TextEditRange } from './rowIdentity'

export interface EditorSelection {
  start: number
  end: number
  direction: HTMLTextAreaElement['selectionDirection']
}

/** Recognizes composition on both React and native popup events, including Safari's 229 sentinel.
 * @example if (isEditorComposing(event)) return
 */
export function isEditorComposing(event: {
  nativeEvent?: { isComposing?: boolean }
  isComposing?: boolean
  keyCode?: number
}): boolean {
  return (
    event.nativeEvent?.isComposing === true ||
    event.isComposing === true ||
    event.keyCode === 229
  )
}

/** Describes the exact caret occurrence to keep without mutating writing or contacting a host.
 * Web and bundled controllers share this command interpretation; each host owns acknowledgement.
 * @example const intent = getKeepLineIntent('Write one thing', 3)
 */
export function getKeepLineIntent(text: string, caret: number) {
  const lineIndex = text.slice(0, caret).split('\n').length - 1
  const rawText = text.split('\n')[lineIndex]
  if (rawText === undefined) return null
  const checkbox = parseCheckboxLine(rawText, lineIndex)
  if (checkbox)
    return {
      kind: checkbox.checked ? ('checked' as const) : ('unchecked' as const),
      lineIndex,
      rawText,
      title: checkbox.title,
      completedText: checkbox.checked
        ? text
        : setCheckboxStateAtLine(text, lineIndex, true),
    }
  const plain = markPlainLineCompleted(text, lineIndex)
  return plain
    ? {
        kind: 'plain' as const,
        lineIndex,
        rawText,
        title: plain.title,
        completedText: plain.text,
      }
    : null
}

/**
 * Shares keyboard/clipboard/IME handling and exact splice capture between both editor hosts.
 * Controllers supply the current draft and keep operation; this hook never assumes a storage API.
 * @example const { textareaProps, handleKeepLineClick } = useEditorInput(options)
 */
export function useEditorInput(options: {
  ref: RefObject<HTMLTextAreaElement | null>
  value: string
  onChange: (text: string, editRange?: TextEditRange) => void
  onKeep: (textarea: HTMLTextAreaElement) => void
  onSelection?: (selection: EditorSelection) => void
  onComposition?: (composing: boolean) => void
}) {
  const pendingEdit = useRef<TextEditRange | null>(null)
  const capture = (
    event:
      ClipboardEvent<HTMLTextAreaElement> | InputEvent<HTMLTextAreaElement>,
  ): void => {
    pendingEdit.current = {
      start: event.currentTarget.selectionStart,
      end: event.currentTarget.selectionEnd,
    }
  }
  const selection = (event: SyntheticEvent<HTMLTextAreaElement>): void => {
    options.onSelection?.({
      start: event.currentTarget.selectionStart,
      end: event.currentTarget.selectionEnd,
      direction: event.currentTarget.selectionDirection,
    })
  }
  const handleKeepLineClick = (): void => {
    const textarea = options.ref.current
    if (!textarea) return
    options.onKeep(textarea)
    textarea.focus()
  }
  return {
    handleKeepLineClick,
    textareaProps: {
      ref: options.ref,
      value: options.value,
      onPaste: capture,
      onCut: capture,
      onDrop: (): void => {
        pendingEdit.current = null
      },
      onBeforeInput: capture,
      onChange: (event: ChangeEvent<HTMLTextAreaElement>): void => {
        const editRange = pendingEdit.current ?? undefined
        pendingEdit.current = null
        options.onChange(event.currentTarget.value, editRange)
        selection(event)
      },
      onSelect: selection,
      onCompositionStart: (): void => options.onComposition?.(true),
      onCompositionEnd: (_event: CompositionEvent<HTMLTextAreaElement>): void =>
        options.onComposition?.(false),
      onKeyDown: (event: KeyboardEvent<HTMLTextAreaElement>): void => {
        if (event.key !== 'Enter' || !(event.metaKey || event.ctrlKey)) {
          pendingEdit.current = {
            start: event.currentTarget.selectionStart,
            end: event.currentTarget.selectionEnd,
          }
          return
        }
        pendingEdit.current = null
        if (isEditorComposing(event)) return
        event.preventDefault()
        options.onKeep(event.currentTarget)
      },
    },
  }
}
