'use client'

import React, {
  useId,
  type ReactElement,
  type ComponentProps,
  useEffect,
} from 'react'

interface Props {
  Button: ReactElement<ComponentProps<'summary'>, 'summary'>
  List: string[]
}

export const Dropdown: React.FC<Props> = ({ Button, List }) => {
  const id = useId()

  function closeDropdown() {
    document.getElementById(id)?.removeAttribute('open')
  }

  useEffect(() => {
    document.body.addEventListener('click', closeDropdown)
    return () => document.body.removeEventListener('click', closeDropdown)
  }, [])

  return (
    <details className="dropdown" id={id}>
      {Button}
      <ul className="menu dropdown-content z-[1] w-52 rounded-box bg-base-100 p-2 shadow">
        {List.map((menu, index) => (
          <li onClick={closeDropdown} key={index}>
            <a>{menu}</a>
          </li>
        ))}
      </ul>
    </details>
  )
}
