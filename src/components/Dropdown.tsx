'use client'

import React, {
  useId,
  type ReactElement,
  type ComponentProps,
  useEffect,
} from 'react'

namespace Dropdown {
  export type Props = {
    Button: ReactElement<ComponentProps<'summary'>, 'summary'>
    MenuList: ReactElement<ComponentProps<'li'>, 'li'>[]
  } & ComponentProps<'details'>
}

export function Dropdown({ Button, MenuList, ...props }: Dropdown.Props) {
  const id = useId()

  function closeDropdown() {
    document.getElementById(id)?.removeAttribute('open')
  }

  useEffect(() => {
    document.body.addEventListener('click', closeDropdown)
    return () => document.body.removeEventListener('click', closeDropdown)
  }, [])

  return (
    <details data-react-name="Dropdown" className="dropdown" id={id} {...props}>
      {Button}
      <ul className="menu dropdown-content z-[1] w-52 rounded-box bg-base-100 p-2 shadow">
        {MenuList}
      </ul>
    </details>
  )
}
