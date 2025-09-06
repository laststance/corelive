import { ClerkProvider } from '@clerk/nextjs'
import type { Metadata } from 'next'
import '@/globals.css'

import { ElectronAuthProvider } from '@/lib/orpc/electron-auth-provider'
import { ORPCProvider } from '@/lib/orpc/react-query'
import { cn } from '@/lib/utils'

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
            <ElectronAuthProvider>{children}</ElectronAuthProvider>
          </ORPCProvider>
        </body>
      </html>
    </ClerkProvider>
  )
}

export default RootLayout
