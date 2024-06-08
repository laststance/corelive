'use client'

import React, { type ComponentProps } from 'react'
import { toast } from 'sonner'
import { ContextMenuItem, useContextMenu } from 'use-context-menu'

import { cn } from '@/lib/utils'

function selectSingleLineText(event: React.MouseEvent<HTMLTextAreaElement>) {
  event.preventDefault()

  const textarea = event.target as HTMLTextAreaElement

  const cursorPosition = textarea.selectionStart
  const textBeforeCursor = textarea.value.substring(0, cursorPosition)
  const linesBeforeCursor = textBeforeCursor.split('\n')
  const lineNumber = linesBeforeCursor.length
  const currentLineContent = linesBeforeCursor[lineNumber - 1]!

  // Calculate the start and end positions of the current line
  const startPos = textBeforeCursor.lastIndexOf('\n') + 1
  const endPos = startPos + currentLineContent.length

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
        onClick={selectSingleLineText}
        onContextMenu={onContextMenu}
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
