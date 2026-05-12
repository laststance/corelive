import * as React from 'react'
import { memo } from 'react'

import { cn } from '@/lib/utils'

const Skeleton = memo(function Skeleton({
  className,
  ...props
}: React.ComponentProps<'div'>) {
  return (
    <div
      data-slot="skeleton"
      className={cn('animate-pulse rounded-md bg-accent', className)}
      {...props}
    />
  )
})

export { Skeleton }
