import React from 'react'
import { Toaster } from 'sonner'
// TODO Use this way https://react.dev/blog/2024/04/25/react-19#support-for-stylesheets
import '@/lib/use-context-menu/styles.css'

import type { RootLayoutProps } from '@/app/layout'
import { EditCategoryDialog } from '@/components/EditCategoryDialog'
import { NewCategoryDialog } from '@/components/NewCategoryDialog'
import Sidebar from '@/components/Sidebar'

export const metadata = {
  title: 'Dashboard',
}

const Layout: React.FC<RootLayoutProps> = ({ children }) => {
  return (
    <>
      <Toaster richColors />
      <Sidebar className="absolute z-[1]" />
      <main className="container mx-auto ml-40 min-h-screen">{children}</main>
      <NewCategoryDialog />
      <EditCategoryDialog />
    </>
  )
}

export default Layout
