import type { ReactElement } from 'react'
import { forwardRef } from 'react'

import type { ButtonProps } from '../Button'
import { Button } from '../Button'

export type DropdownSummaryProps = Omit<ButtonProps, 'tag'>
export const DropdownSummary = forwardRef<HTMLElement, DropdownSummaryProps>(
  (props, ref): ReactElement => {
    // @ts-ignore
    return <Button {...props} ref={ref} tag="summary" />
  },
)

DropdownSummary.displayName = 'Dropdown Summary'

export default DropdownSummary
