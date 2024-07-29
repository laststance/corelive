import clsx from 'clsx'
import type { HTMLAttributes, ReactElement, ReactNode } from 'react'
import { forwardRef } from 'react'
import { twMerge } from 'tailwind-merge'

import type { IComponentBaseProps } from '../types'

export type DropdownProps<T extends HTMLElement = HTMLDivElement> =
  HTMLAttributes<T> &
    IComponentBaseProps & {
      item?: ReactNode
      horizontal?: 'left' | 'right'
      vertical?: 'top' | 'bottom'
      end?: boolean
      hover?: boolean
      open?: boolean
    }

export const classesFn = ({
  className,
  horizontal,
  vertical,
  end,
  hover,
  open,
}: Pick<
  DropdownProps,
  'className' | 'horizontal' | 'vertical' | 'end' | 'hover' | 'open'
>) =>
  twMerge(
    'dropdown',
    className,
    clsx({
      'dropdown-left': horizontal === 'left',
      'dropdown-right': horizontal === 'right',
      'dropdown-top': vertical === 'top',
      'dropdown-bottom': vertical === 'bottom',
      'dropdown-end': end,
      'dropdown-hover': hover,
      'dropdown-open': open,
    }),
  )

const Dropdown = forwardRef<HTMLDivElement, DropdownProps>(
  (
    {
      children,
      className,
      item,
      horizontal,
      vertical,
      end,
      hover,
      open,
      dataTheme,
      ...props
    },
    ref,
  ): ReactElement => {
    return (
      <div
        {...props}
        ref={ref}
        data-theme={dataTheme}
        className={classesFn({
          className,
          horizontal,
          vertical,
          end,
          hover,
          open,
        })}
      >
        {item ? (
          <>
            <label tabIndex={0}>{children}</label>
            <ul className="dropdown-content">{item}</ul>
          </>
        ) : (
          <>{children}</>
        )}
      </div>
    )
  },
)

Dropdown.displayName = 'Dropdown'

export default Dropdown
