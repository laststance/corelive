/* eslint-disable no-redeclare */
import { cn } from '@/lib/utils'

export namespace Button {
  export type Props = {
    className?: string
    pending?: boolean
    type?: 'button' | 'submit' | 'reset'
    children: React.ReactNode
  } & React.ComponentProps<'button'>
}
export function Button({
  children,
  className,
  pending,
  type = 'button',
  ...props
}: Button.Props) {
  return (
    <button
      type={type}
      className={cn('btn', className)}
      {...props}
      disabled={pending}
    >
      {pending && <span className="loading loading-spinner" />}
      {children}
    </button>
  )
}
