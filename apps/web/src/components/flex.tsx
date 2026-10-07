import { type ComponentProps, type PropsWithChildren } from 'react'

import { cn } from '@/lib/utils'

type Props = PropsWithChildren<ComponentProps<'div'>>

/**
 * Flexbox layout wrapper — applies `display: flex` via Tailwind.
 * @param className - Extra Tailwind classes merged with `flex`.
 * @param children - Content to lay out.
 * @param rest - Native div attributes forwarded to the root element.
 * @returns A `div` with `display: flex`.
 * @example
 * <Flex className="items-center gap-2">
 *   <Button>Login</Button>
 * </Flex>
 */
export const Flex = ({ className, children, ...rest }: Props) => (
  <div className={cn('flex', className)} {...rest}>
    {children}
  </div>
)
