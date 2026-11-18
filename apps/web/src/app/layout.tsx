import { ClerkProvider } from '@clerk/nextjs'
import type { Metadata } from 'next'
import * as React from 'react'

import '@/globals.css'

import { ApplicationProviders } from '@/providers/ApplicationProviders'

export const metadata: Metadata = {
  title: {
    template: '%s | CoreLive Dashboard',
    default: 'CoreLive Dashboard',
  },
  description:
    'Revisit your completed tasks and see how your activity adds up over the year.',
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
