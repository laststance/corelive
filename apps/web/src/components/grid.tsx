import type { ComponentProps, PropsWithChildren } from 'react'

import { cn } from '@/lib/utils'

type Props = PropsWithChildren<ComponentProps<'div'>>
export const Grid = ({ children, className, ...rest }: Props) => (
  <div className={cn('grid', className)} {...rest}>
    {children}
  </div>
)
