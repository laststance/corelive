'use client'

import { ChevronsUpDown } from 'lucide-react'
import React, { type ComponentProps, useRef } from 'react'
import { toast } from 'sonner'

import { createCompleted } from '@/actions/createCompleted'
import { Dropdown } from '@/components/Dropdown'
import { ContextMenuItem, useContextMenu } from '@/lib/use-context-menu'
import { cn } from '@/lib/utils'
import {
  selectCurrentCategoryId,
  setCurrentCategoryText,
  removeCompletedTaskFromEditorText,
  selectCategories,
  switchCategory,
} from '@/redux/editorSlice'
import { useAppDispatch, useAppSelector } from '@/redux/hooks'
import { selectUser } from '@/redux/userSlice'

const SimpleEditor: React.FC<ComponentProps<'textarea'>> = ({
  className,
  ...rest
}) => {
  const dispatch = useAppDispatch()
  const currentCategoryId = useAppSelector(selectCurrentCategoryId)
  const categories = useAppSelector(selectCategories)
  const user = useAppSelector(selectUser)
  const selectedRef = useRef<string>('')

  // TODO change to CSS based implementation
  function selectSingleLineText(event: React.MouseEvent<HTMLTextAreaElement>) {
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

  async function taskCompleted() {
    try {
      if (user === null) throw new Error('User not found')
      dispatch(removeCompletedTaskFromEditorText(selectedRef.current!))
      await createCompleted(selectedRef.current!, currentCategory.name, user.id)
      toast.success('Task Completed! 🎉')
    } catch (error) {
      toast.error('Failed to complete task')
    }
  }

  const { contextMenu, onContextMenu } = useContextMenu(
    <>
      <ContextMenuItem onSelect={taskCompleted}>Completed</ContextMenuItem>
    </>,
  )

  function handleOnContextMenu(event: React.MouseEvent<HTMLTextAreaElement>) {
    selectSingleLineText(event)
    onContextMenu(event)
  }

  return (
    <section className="flex h-full flex-col items-center gap-2">
      <div className="flex items-center gap-4">
        <h2 className="text-2xl font-bold">
          {categories[currentCategoryId]?.name}
        </h2>
        <Dropdown
          Button={
            <summary className="btn btn-circle btn-ghost m-1">
              <ChevronsUpDown />
            </summary>
          }
          MenuList={Object.entries(categories).map(([id, category]) => {
            return (
              <li
                onClick={() => dispatch(switchCategory(id))}
                className="cursor-pointer text-lg"
                key={id}
              >
                <a>{category.name}</a>
              </li>
            )
          })}
        />
      </div>
      <textarea
        {...rest}
        value={categories[currentCategoryId]?.text}
        onDoubleClick={selectSingleLineText}
        onContextMenu={handleOnContextMenu}
        onChange={(e) => dispatch(setCurrentCategoryText(e.target.value))}
        placeholder="Write your task step by step here..."
        className={cn(
          'textarea textarea-bordered textarea-lg h-full w-full max-w-xs',
          className,
        )}
      ></textarea>
      {contextMenu}
    </section>
  )
}

export default SimpleEditor
