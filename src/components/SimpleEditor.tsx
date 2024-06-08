'use client'

import React, { useRef, type ComponentProps } from 'react'
import { toast } from 'sonner'

import { cn } from '@/lib/utils'

export const SimpleEditor: React.FC<ComponentProps<'textarea'>> = ({
  className,
  ...rest
}) => {
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  const selectAllText = () => {
    toast.success('Text selected')
  }
  return (
    <>
      <textarea
        {...rest}
        ref={textareaRef}
        placeholder="Write your task step by step here..."
        className={cn(
          'textarea textarea-bordered textarea-lg h-full w-full max-w-xs',
          className,
        )}
      ></textarea>
      <button onClick={selectAllText}>Select all</button>
    </>
  )
}
