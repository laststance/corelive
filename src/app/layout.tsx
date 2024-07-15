import { ClerkProvider } from '@clerk/nextjs'
import type { Metadata } from 'next'
import dynamic from 'next/dynamic'
import '@/styles/globals.css'

import { cn } from '@/lib/utils'
const ReduxProvider = dynamic(async () => import('../redux/ReduxProvider'), {
  ssr: false,
})

export const metadata: Metadata = {
  title: {
    template: '%s | Unfarely',
    default: 'Unfarely',
  },
  description: 'Unfarely convert your leafy tasks to solid engagement.',
}

export interface RootLayoutProps {
  children: Readonly<React.ReactNode>
}

const RootLayout: React.FC<RootLayoutProps> = ({ children }) => {
  return (
    <ClerkProvider>
      <html lang="en" suppressHydrationWarning>
        <body className={cn('min-h-screen overflow-x-hidden antialiased')}>
          <ReduxProvider>{children}</ReduxProvider>
        </body>
      </html>
    </ClerkProvider>
  )
}

export default RootLayout
