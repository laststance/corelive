'use client'

import { PanelLeftOpen } from 'lucide-react'
import React, { type ComponentProps } from 'react'

import { SignoutButton } from '@/components/SignoutButton'
import { cn, getModalDOM } from '@/lib/utils'
import { toggleDrawer } from '@/redux/drawerSlice'
import { useAppDispatch } from '@/redux/hooks'

const Sidebar: React.FC<ComponentProps<'div'>> = ({ className }) => {
  const dispatch = useAppDispatch()
  function toggleSidebar(e: React.MouseEvent<HTMLLabelElement>) {
    e.preventDefault()
    dispatch(toggleDrawer())
  }

  return (
    <div className={cn('drawer min-h-screen w-9 pl-2 pt-3', className)}>
      <input id="sidebar" type="checkbox" className="drawer-toggle" />
      <div className="drawer-content h-full place-content-start">
        {/* Page content here */}
        <label
          htmlFor="sidebar"
          className="drawer-button"
          onClick={toggleSidebar}
        >
          <PanelLeftOpen className="rounded-md hover:bg-neutral-content" />
        </label>
      </div>
      <div className="drawer-side">
        <label
          htmlFor="sidebar"
          aria-label="close sidebar"
          className="drawer-overlay"
        />
        <ul className="menu min-h-full w-80 bg-base-200 p-4 text-base-content">
          <div className="pl-4">
            <h1 className="text-3xl font-bold">Settings</h1>
          </div>
          <hr className="divider mb-0" />
          <li>
            <button
              className="btn btn-neutral btn-md"
              onClick={() => getModalDOM('new_category_modal').showModal()}
            >
              New Category
            </button>
          </li>
          <li>
            <button
              className="btn btn-neutral btn-md"
              onClick={() => getModalDOM('edit_category_modal').showModal()}
            >
              Edit Category
            </button>
          </li>
          <div className="divider" />
          <li>
            <SignoutButton />
          </li>
        </ul>
      </div>
    </div>
  )
}

export default Sidebar
