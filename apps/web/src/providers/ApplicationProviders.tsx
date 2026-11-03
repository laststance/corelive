'use client'

import { usePathname } from 'next/navigation'
import type { ReactNode } from 'react'

import { CodeInspectorClient } from '@/components/code-inspector/CodeInspectorClient'
import { Toaster } from '@/components/ui/sonner'
import { ElectronAuthProvider } from '@/lib/orpc/electron-auth-provider'
import { QueryClientProvider } from '@/providers/QueryClientProvider'
import { ThemeProvider } from '@/providers/ThemeProvider'

/**
 * Mounts normal application state outside the credential-only broker route.
 * The root layout keeps Clerk available to both. The desktop Settings window is bundled
 * (#216 D5), so the web app owns no native preference state.
 * @example <ApplicationProviders>{children}</ApplicationProviders>
 */
export function ApplicationProviders({ children }: { children: ReactNode }) {
  const pathname = usePathname()
  if (pathname === '/desktop-auth') return <>{children}</>
  return (
    <ThemeProvider>
      <CodeInspectorClient />
      <QueryClientProvider>
        <ElectronAuthProvider>{children}</ElectronAuthProvider>
        <Toaster />
      </QueryClientProvider>
    </ThemeProvider>
  )
}
