import { ClerkProvider } from '@clerk/nextjs'
import type { Metadata } from 'next'
import '@/styles/globals.css'

import { TooltipProvider } from '@/components/plate-ui/tooltip'
import { cn } from '@/lib/utils'
import { ReduxProvider } from '@/redux/ReduxProvider'

export const metadata: Metadata = {
  title: {
    template: '%s | Unfarely',
    default: 'Unfarely',
  },
  description: 'Unfarely convert your leafy tasks to solid experiences.',
}

export interface RootLayoutProps {
  children: Readonly<React.ReactNode>
}

const RootLayout: React.FC<RootLayoutProps> = ({ children }) => {
  return (
    <ReduxProvider>
      <ClerkProvider>
        <TooltipProvider delayDuration={500} skipDelayDuration={0}>
          <html lang="en" suppressHydrationWarning>
            <body className={cn('min-h-screen overflow-x-hidden antialiased')}>
              {children}
            </body>
          </html>
        </TooltipProvider>
      </ClerkProvider>
    </ReduxProvider>
  )
}

export default RootLayout
