import { ClerkProvider } from '@clerk/nextjs'
import type { Metadata } from 'next'
import { Geist_Mono, Inter_Tight, Newsreader } from 'next/font/google'
import * as React from 'react'
import '@/globals.css'

import { CodeInspectorClient } from '@/components/code-inspector/CodeInspectorClient'
import { ElectronStartupSync } from '@/components/electron/ElectronStartupSync'
import { Toaster } from '@/components/ui/sonner'
import { ElectronAuthProvider } from '@/lib/orpc/electron-auth-provider'
import { ReduxProvider } from '@/lib/redux/providers'
import { cn } from '@/lib/utils'
import { QueryClientProvider } from '@/providers/QueryClientProvider'
import { ThemeProvider } from '@/providers/ThemeProvider'

const newsreader = Newsreader({
  subsets: ['latin'],
  style: ['normal', 'italic'],
  display: 'swap',
  variable: '--font-newsreader',
})

const interTight = Inter_Tight({
  subsets: ['latin'],
  display: 'swap',
  variable: '--font-inter-tight',
})

const geistMono = Geist_Mono({
  subsets: ['latin'],
  display: 'swap',
  variable: '--font-geist-mono',
})

export const metadata: Metadata = {
  title: {
    template: '%s | CoreLive',
    default: 'CoreLive',
  },
  description: 'CoreLive convert your leafy tasks to solid engagement.',
}

interface RootLayoutProps {
  children: Readonly<React.ReactNode>
}

const RootLayout: React.FC<RootLayoutProps> = ({ children }) => {
  return (
    <ClerkProvider>
      <html
        lang="en"
        suppressHydrationWarning
        className={cn(
          newsreader.variable,
          interTight.variable,
          geistMono.variable,
        )}
      >
        <body className={cn('mx-auto min-h-screen font-sans antialiased')}>
          {/* attribute + disableTransitionOnChange are owned by ThemeProvider;
              passing them here would override its crossfade config (T8). */}
          <ThemeProvider>
            <CodeInspectorClient />
            <QueryClientProvider>
              <ReduxProvider>
                <ElectronStartupSync />
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
