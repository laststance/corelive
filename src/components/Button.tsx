import { cn } from '@/lib/utils'

type Props = {
  className?: string
  pending?: boolean
  type?: 'button' | 'submit' | 'reset'
  children: React.ReactNode
} & React.ComponentProps<'button'>

export const Button: React.FC<Props> = ({
  children,
  className,
  pending,
  type = 'button',
  ...props
}) => {
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
