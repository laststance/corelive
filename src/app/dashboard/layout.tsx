import React from 'react'

import type { RootLayoutProps } from '@/app/layout'
import Sidebar from '@/components/Sidebar'

const Layout: React.FC<RootLayoutProps> = ({ children }) => {
  return (
    <div>
      <Sidebar className="absolute" />
      <main className="mx-auto container min-h-screen">{children}</main>
    </div>
  )
}

export default Layout
