import { ClerkProvider } from '@clerk/nextjs'
import type { Metadata } from 'next'
import '@/styles/globals.css'

import { TooltipProvider } from '@/components/plate-ui/tooltip'
import { cn } from '@/lib/utils'
export const metadata: Metadata = {
  title: '%s | Unfarely',
  description: 'Unfarely convert your leafy tasks to solid experiences.',
}

export interface RootLayoutProps {
  children: Readonly<React.ReactNode>
}

const RootLayout: React.FC<RootLayoutProps> = ({ children }) => {
  return (
    <ClerkProvider>
      <TooltipProvider delayDuration={500} skipDelayDuration={0}>
        <html lang="en" suppressHydrationWarning>
          <body className={cn('min-h-screen antialiased')}>{children}</body>
        </html>
      </TooltipProvider>
    </ClerkProvider>
  )
}

export default RootLayout
