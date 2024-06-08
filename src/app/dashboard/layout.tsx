import React from 'react'
import { Toaster } from 'sonner'
import 'use-context-menu/styles.css'

import type { RootLayoutProps } from '@/app/layout'
import Sidebar from '@/components/Sidebar'

export const metadata = {
  title: 'Dashboard',
}

const Layout: React.FC<RootLayoutProps> = ({ children }) => {
  return (
    <>
      <Toaster richColors />
      <Sidebar className="absolute z-[100]" />
      <main className="container mx-auto ml-40 min-h-screen">{children}</main>
    </>
  )
}

export default Layout
