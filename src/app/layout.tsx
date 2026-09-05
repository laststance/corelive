import { ClerkProvider } from '@clerk/nextjs'
import type { Metadata } from 'next'
import * as React from 'react'
import '@/globals.css'

import { CodeInspectorClient } from '@/components/code-inspector/CodeInspectorClient'
import { ElectronStartupSync } from '@/components/electron/ElectronStartupSync'
import { LocalKeepMergeSync } from '@/components/live-editor/LocalKeepMergeSync'
import { Toaster } from '@/components/ui/sonner'
import { ElectronAuthProvider } from '@/lib/orpc/electron-auth-provider'
import { ReduxProvider } from '@/lib/redux/providers'
import { QueryClientProvider } from '@/providers/QueryClientProvider'
import { ThemeProvider } from '@/providers/ThemeProvider'

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
      <html lang="en" suppressHydrationWarning>
        {/* No font-family class: the stock shadcn/Tailwind system stacks apply
            (`--font-sans` / `--font-mono` defaults); no web font is loaded. */}
        <body className="mx-auto min-h-screen antialiased">
          {/* attribute + disableTransitionOnChange are owned by ThemeProvider;
              passing them here would override its crossfade config (T8). */}
          <ThemeProvider>
            <CodeInspectorClient />
            <QueryClientProvider>
              <ReduxProvider>
                <ElectronStartupSync />
                <LocalKeepMergeSync />
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
