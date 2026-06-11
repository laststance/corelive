import type { ComponentProps, PropsWithChildren } from 'react'
import { memo } from 'react'

type Props = PropsWithChildren<ComponentProps<'div'>>
export const Box = memo(function Box({ children, ...rest }: Props) {
  return <div {...rest}>{children}</div>
})
