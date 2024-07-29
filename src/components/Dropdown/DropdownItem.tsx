import type { AnchorHTMLAttributes } from 'react'
import { forwardRef } from 'react'

type Anchor = AnchorHTMLAttributes<HTMLAnchorElement> & {
  anchor?: boolean
}

// type NoAnchor = Exclude<Anchor, "anchor"> & { anchor?: false };

// export type DropdownItemProps = Anchor | NoAnchor;
export type DropdownItemProps = Anchor

const DropdownItem = forwardRef<HTMLAnchorElement, DropdownItemProps>(
  ({ anchor = true, ...props }, ref) => {
    return <li>{anchor ? <a ref={ref} {...props}></a> : props.children}</li>
  },
)

DropdownItem.displayName = 'Dropdown Item'

export default DropdownItem
