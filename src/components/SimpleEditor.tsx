'use client'

import React, { type ComponentProps, useRef } from 'react'
import { toast } from 'sonner'

import { ContextMenuItem, useContextMenu } from '@/lib/use-context-menu'
import { cn } from '@/lib/utils'
import {
  setCompleted,
  selectSimpleEditorText,
  setEditorText,
} from '@/redux/editorSlice'
import { useAppDispatch, useAppSelector } from '@/redux/hooks'

const SimpleEditor: React.FC<ComponentProps<'textarea'>> = ({
  className,
  ...rest
}) => {
  const dispatch = useAppDispatch()
  const simpleEditorText = useAppSelector(selectSimpleEditorText)
  const selectedRef = useRef<string>()

  // TODO change to CSS based implementation
  function selectSingleLineText(event: React.MouseEvent<HTMLTextAreaElement>) {
    event.preventDefault()

    const textarea = event.target as HTMLTextAreaElement
    const text = textarea.value
    const cursorPosition = textarea.selectionStart

    // Find the start of the current line
    const startPos = text.lastIndexOf('\n', cursorPosition - 1) + 1
    // Find the end of the current line
    let endPos = text.indexOf('\n', cursorPosition)
    if (endPos === -1) endPos = text.length

    // Get the selected text and assign it to 'selected' variable
    selectedRef.current = textarea.value.substring(startPos, endPos)

    // Select the current line content
    textarea.setSelectionRange(startPos, endPos)
    textarea.focus() // Focus the textarea to show the selection
  }

  function taskCompleted() {
    dispatch(setCompleted(selectedRef.current!))
    // TODO add _.defer() to toast
    toast.success('Task Completed! 🎉')
  }

  const { contextMenu, onContextMenu } = useContextMenu(
    <>
      <ContextMenuItem onSelect={taskCompleted}>Completed</ContextMenuItem>
    </>,
  )

  return (
    <>
      <textarea
        {...rest}
        value={simpleEditorText}
        onClick={selectSingleLineText}
        onDoubleClick={onContextMenu}
        onContextMenu={onContextMenu}
        onChange={(e) => dispatch(setEditorText(e.target.value))}
        placeholder="Write your task step by step here..."
        className={cn(
          'textarea textarea-bordered textarea-lg h-full w-full max-w-xs',
          className,
        )}
      ></textarea>
      {contextMenu}
    </>
  )
}

export default SimpleEditor
