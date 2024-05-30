'use client'

import { cn, withRef } from '@udecode/cn'
import { PlateLeaf } from '@udecode/plate-common'
import React from 'react'

export const CodeLeaf = withRef<typeof PlateLeaf>(
  ({ children, className, ...props }, ref) => {
    return (
      <PlateLeaf
        asChild
        className={cn(
          'bg-muted whitespace-pre-wrap rounded-md px-[0.3em] py-[0.2em] font-mono text-sm',
          className,
        )}
        ref={ref}
        {...props}
      >
        <code>{children}</code>
      </PlateLeaf>
    )
  },
)
