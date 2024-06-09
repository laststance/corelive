'use client'

import React, { type ComponentProps } from 'react'
import { toast } from 'sonner'

import { ContextMenuItem, useContextMenu } from '@/lib/use-context-menu'
import { cn } from '@/lib/utils'
import {
  selectSimpleEditorText,
  setSimpleEditorText,
} from '@/redux/editorSlice'
import { useAppDispatch, useAppSelector } from '@/redux/hooks'

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

  // Select the current line content
  textarea.setSelectionRange(startPos, endPos)
  textarea.focus() // Focus the textarea to show the selection

  // TODO keep selection while context menu is open
}

function taskCompleted() {
  // TODO change task state to completed
  toast.success('Task completed')
}

export const SimpleEditor: React.FC<ComponentProps<'textarea'>> = ({
  className,
  ...rest
}) => {
  const dispatch = useAppDispatch()
  const simpleEditorText = useAppSelector(selectSimpleEditorText)
  const { contextMenu, onContextMenu } = useContextMenu(
    <>
      <ContextMenuItem onSelect={taskCompleted}>Completed</ContextMenuItem>
    </>,
  )
  // @TODO convert selectSingleLineText Promise and then call onContextMenu

  return (
    <>
      <textarea
        {...rest}
        id="SimpleEditor"
        value={simpleEditorText}
        onClick={selectSingleLineText}
        onContextMenu={onContextMenu}
        onChange={(e) => dispatch(setSimpleEditorText(e.target.value))}
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
