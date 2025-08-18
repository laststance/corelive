import { ClerkProvider } from '@clerk/nextjs'
import type { Metadata } from 'next'
import '@/globals.css'

import { env } from '@/env.mjs'
import { ORPCProvider } from '@/lib/orpc/react-query'
import { cn } from '@/lib/utils'

import { MSWProvider } from './MSWProvider'

// Initialize MSW for Node.js (server-side) when mocking is enabled
if (
  process.env.NEXT_RUNTIME === 'nodejs' &&
  env.NEXT_PUBLIC_ENABLE_MSW_MOCK === 'true'
) {
  const { server } = require('../../mocks/node')
  server.listen()
  console.log(
    '[MSW] Server-side mocking enabled via NEXT_PUBLIC_ENABLE_MSW_MOCK',
  )
}

export const metadata: Metadata = {
  title: {
    template: '%s | Corelive',
    default: 'Corelive',
  },
  description: 'Corelive convert your leafy tasks to solid engagement.',
}

export interface RootLayoutProps {
  children: Readonly<React.ReactNode>
}

const RootLayout: React.FC<RootLayoutProps> = ({ children }) => {
  return (
    <ClerkProvider>
      <html lang="en" suppressHydrationWarning>
        <body className={cn('mx-auto min-h-screen antialiased')}>
          <ORPCProvider>
            <MSWProvider>{children}</MSWProvider>
          </ORPCProvider>
        </body>
      </html>
    </ClerkProvider>
  )
}

export default RootLayout
