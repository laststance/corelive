'use client'

import React, { type ComponentProps } from 'react'

import { cn } from '@/lib/utils'

export const SimpleEditor: React.FC<ComponentProps<'textarea'>> = ({
  className,
  ...rest
}) => {
  return (
    <textarea
      {...rest}
      placeholder="Write your task step by step here..."
      className={cn(
        'textarea textarea-bordered textarea-lg h-full w-full max-w-xs',
        className,
      )}
    ></textarea>
  )
}
