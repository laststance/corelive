'use client'

import { PanelLeftOpen } from 'lucide-react'
import React, { type ComponentProps } from 'react'

import { SignoutButton } from '@/components/SignoutButton'
import { cn } from '@/lib/utils'
import { toggleDrawer } from '@/redux/drawerSlice'
import { selectEditorMode, updateEditorMode } from '@/redux/editorSlice'
import { useAppDispatch, useAppSelector } from '@/redux/hooks'

const Sidebar: React.FC<ComponentProps<'div'>> = ({ className }) => {
  const dispatch = useAppDispatch()
  const editorMode = useAppSelector(selectEditorMode)

  return (
    <div className={cn('drawer min-h-screen w-9 pl-2 pt-3', className)}>
      <input id="sidebar" type="checkbox" className="drawer-toggle" />
      <div className="drawer-content h-full place-content-start">
        {/* Page content here */}
        <label htmlFor="sidebar" className="drawer-button">
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
          <li className="grid place-content-center">
            <div className="dropdown dropdown-bottom">
              <div
                tabIndex={0}
                role="button"
                className="btn btn-neutral btn-wide"
              >
                Editor Mode
              </div>
              <ul
                tabIndex={0}
                className="menu dropdown-content z-[1] w-52 rounded-box bg-base-100 p-2 shadow"
              >
                <li>
                  <div
                    className={cn({ active: editorMode === 'Simple' })}
                    onClick={() => {
                      dispatch(updateEditorMode('Simple'))
                      dispatch(toggleDrawer())
                    }}
                  >
                    Simple
                  </div>
                </li>
                <li>
                  <div
                    className={cn({ active: editorMode === 'Plate' })}
                    onClick={() => {
                      dispatch(updateEditorMode('Plate'))
                      dispatch(toggleDrawer())
                    }}
                  >
                    Plate
                  </div>
                </li>
              </ul>
            </div>
          </li>
          <li>
            <div className="dropdown dropdown-bottom">
              <div
                tabIndex={0}
                role="button"
                className="btn btn-neutral btn-wide"
              >
                Dropdown Item 2
              </div>
              <ul
                tabIndex={0}
                className="menu dropdown-content z-[1] w-52 rounded-box bg-base-100 p-2 shadow"
              >
                <li>
                  <div>Item 1</div>
                </li>
                <li>
                  <div>Item 2</div>
                </li>
              </ul>
            </div>
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
