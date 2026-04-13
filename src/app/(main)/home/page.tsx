'use client'

import { SidebarTrigger } from '@/components/ui/sidebar'

import { TodoList } from './_components/TodoList'

import './page.css'

/**
 * Home page content. The sidebar is provided by `(main)/layout.tsx`.
 */
export default function Home() {
  return (
    <>
      <header className="window-drag-region flex h-16 shrink-0 items-center gap-2 border-b px-4">
        <SidebarTrigger className="no-drag -ml-1" />
        <div className="flex items-center gap-2">
          <h2 className="text-lg font-medium">Tasks</h2>
        </div>
      </header>
      <div className="flex flex-1 flex-col gap-4 p-4">
        <TodoList />
      </div>
    </>
  )
}
