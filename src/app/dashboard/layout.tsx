import React from 'react'

import type { RootLayoutProps } from '@/app/layout'
import Sidebar from '@/components/Sidebar'

export const metadata = {
  title: 'Dashboard',
}

const Layout: React.FC<RootLayoutProps> = ({ children }) => {
  return (
    <>
      <Sidebar className="absolute z-[100]" />
      <main className="container mx-auto ml-40 min-h-screen">{children}</main>
    </>
  )
}

export default Layout
