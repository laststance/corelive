import Image from 'next/image'
import React, { type ComponentProps } from 'react'

import panelLeftOpen from '@/components/icons/panel-left-open.svg'
import { SignoutButton } from '@/components/SignoutButton'
import { cn } from '@/lib/utils'

const Sidebar: React.FC<ComponentProps<'div'>> = ({ className }) => {
  return (
    <div className={cn('drawer min-h-screen w-9', className)}>
      <input id="sidebar" type="checkbox" className="drawer-toggle" />
      <div className="drawer-content h-full place-content-center">
        {/* Page content here */}
        <label htmlFor="sidebar" className="drawer-button">
          <Image src={panelLeftOpen} alt="Open sidebar" />
        </label>
      </div>
      <div className="drawer-side">
        <label
          htmlFor="sidebar"
          aria-label="close sidebar"
          className="drawer-overlay"
        ></label>
        <ul className="menu p-4 w-80 min-h-full bg-base-200 text-base-content">
          {/* Sidebar content here */}
          <li>
            <a>Sidebar Item 1</a>
          </li>
          <li>
            <a>Sidebar Item 2</a>
          </li>
          <li>
            <SignoutButton />
          </li>
        </ul>
      </div>
    </div>
  )
}

export default Sidebar
