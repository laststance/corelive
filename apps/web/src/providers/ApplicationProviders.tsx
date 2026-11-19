'use client'

import { usePathname } from 'next/navigation'
import type { ReactNode } from 'react'

import { CodeInspectorClient } from '@/components/code-inspector/CodeInspectorClient'
import { Toaster } from '@/components/ui/sonner'
import { ElectronAuthProvider } from '@/lib/orpc/electron-auth-provider'
import { DashboardAppearanceProvider } from '@/providers/DashboardAppearanceProvider'
import { QueryClientProvider } from '@/providers/QueryClientProvider'
import { ThemeProvider } from '@/providers/ThemeProvider'

/**
 * Mounts normal application state outside the credential-only broker route.
 * The root layout keeps Clerk available to both. The desktop Settings window is bundled
 * (#216 D5), so the Dashboard keeps its own theme preference.
 * @example <ApplicationProviders>{children}</ApplicationProviders>
 */
export function ApplicationProviders({ children }: { children: ReactNode }) {
  const pathname = usePathname()
  if (pathname === '/desktop-auth') return <>{children}</>
  // A desktop sign-in window has a separate browser store. Only a dashboard screen may import a legacy theme.
  const dashboard = ['/home', '/skill-tree', '/settings'].includes(pathname)
  const content = <ElectronAuthProvider>{children}</ElectronAuthProvider>
  return (
    <ThemeProvider>
      <CodeInspectorClient />
      <QueryClientProvider>
        {dashboard ? (
          <DashboardAppearanceProvider>{content}</DashboardAppearanceProvider>
        ) : (
          content
        )}
        <Toaster />
      </QueryClientProvider>
    </ThemeProvider>
  )
}
