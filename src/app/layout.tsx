import { ClerkProvider } from '@clerk/nextjs'
import type { Metadata } from 'next'
import '@/styles/globals.css'

import { cn } from '@/lib/utils'
export const metadata: Metadata = {
  title: 'Unfarely',
  description: 'Unfarely convert your leafy tasks to solid experiences.',
}

export interface LayoutProps {
  children: Readonly<React.ReactNode>
}

const RootLayout: React.FC<LayoutProps> = ({ children }) => {
  return (
    <ClerkProvider>
      <html lang="en" suppressHydrationWarning>
        <body className={cn('min-h-screen antialiased')}>{children}</body>
      </html>
    </ClerkProvider>
  )
}

export default RootLayout
