import type { ComponentProps, PropsWithChildren } from 'react'

type Props = PropsWithChildren<ComponentProps<'div'>>
export const Box = function Box({ children, ...rest }: Props) {
  return <div {...rest}>{children}</div>
}
