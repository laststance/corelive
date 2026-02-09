import { ClerkProvider } from '@clerk/nextjs'
import type { Metadata } from 'next'
import '@/globals.css'

import { Toaster } from '@/components/ui/sonner'
import { ElectronAuthProvider } from '@/lib/orpc/electron-auth-provider'
import { ReduxProvider } from '@/lib/redux/providers'
import { cn } from '@/lib/utils'
import { QueryClientProvider } from '@/providers/QueryClientProvider'
import { ThemeProvider } from '@/providers/ThemeProvider'

export const metadata: Metadata = {
  title: {
    template: '%s | Corelive',
    default: 'Corelive',
  },
  description: 'Corelive convert your leafy tasks to solid engagement.',
}

interface RootLayoutProps {
  children: Readonly<React.ReactNode>
}

const RootLayout: React.FC<RootLayoutProps> = ({ children }) => {
  return (
    <ClerkProvider>
      <html lang="en" suppressHydrationWarning>
        <body className={cn('mx-auto min-h-screen antialiased')}>
          <ThemeProvider
            attribute="data-theme"
            defaultTheme="light"
            disableTransitionOnChange
          >
            <QueryClientProvider>
              <ReduxProvider>
                <ElectronAuthProvider>{children}</ElectronAuthProvider>
                <Toaster />
              </ReduxProvider>
            </QueryClientProvider>
          </ThemeProvider>
        </body>
      </html>
    </ClerkProvider>
  )
}

export default RootLayout
