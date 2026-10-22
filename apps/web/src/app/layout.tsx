import { ClerkProvider } from '@clerk/nextjs'
import type { Metadata } from 'next'
import * as React from 'react'

import '@/globals.css'

import { ApplicationProviders } from '@/providers/ApplicationProviders'

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
          <ApplicationProviders>{children}</ApplicationProviders>
        </body>
      </html>
    </ClerkProvider>
  )
}

export default RootLayout
