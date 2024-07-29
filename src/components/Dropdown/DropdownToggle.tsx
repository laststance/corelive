import type { LabelHTMLAttributes } from 'react'

import { Button } from '../Button'
import type {
  ComponentColor,
  ComponentSize,
  IComponentBaseProps,
} from '../types'

export type DropdownToggleProps = Omit<
  LabelHTMLAttributes<HTMLLabelElement>,
  'color'
> &
  IComponentBaseProps & {
    color?: ComponentColor
    size?: ComponentSize
    button?: boolean
    disabled?: boolean
  }

const DropdownToggle = ({
  children,
  color,
  size,
  button = true,
  dataTheme,
  className,
  disabled,
  ...props
}: DropdownToggleProps) => {
  return (
    <label tabIndex={0} className={className} {...props}>
      {button ? (
        <Button
          type="button"
          dataTheme={dataTheme}
          color={color}
          size={size}
          disabled={disabled}
        >
          {children}
        </Button>
      ) : (
        children
      )}
    </label>
  )
}

export default DropdownToggle
