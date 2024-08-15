import React from 'react'

import { cn } from '@/lib/utils'

interface Props {}

export const Skeleton: React.FC<Props> = () => {
  return (
    <div
      className={cn(
        `textarea textarea-bordered textarea-lg flex h-full w-full max-w-xs flex-col gap-4`,
        'mt-8 h-[calc(100%-4rem)] w-full max-w-xl text-xl',
      )}
    >
      <div className="skeleton h-32 w-full"></div>
      <div className="skeleton h-4 w-28"></div>
      <div className="skeleton h-4 w-full"></div>
      <div className="skeleton h-4 w-full"></div>
      <div className="skeleton h-4 w-28"></div>
      <div className="skeleton h-4 w-full"></div>
      <div className="skeleton h-4 w-full"></div>
    </div>
  )
}
