'use client'

import { usePathname } from 'next/navigation'
import type { ReactNode } from 'react'

import { CategoryChangeSync } from '@/components/CategoryChangeSync'
import { CodeInspectorClient } from '@/components/code-inspector/CodeInspectorClient'
import { ElectronStartupSync } from '@/components/electron/ElectronStartupSync'
import { OfflineSettingsSync } from '@/components/electron/OfflineSettingsSync'
import { LocalKeepMergeSync } from '@/components/live-editor/LocalKeepMergeSync'
import { Toaster } from '@/components/ui/sonner'
import { ElectronAuthProvider } from '@/lib/orpc/electron-auth-provider'
import { ReduxProvider } from '@/lib/redux/providers'
import { QueryClientProvider } from '@/providers/QueryClientProvider'
import { ThemeProvider } from '@/providers/ThemeProvider'

/**
 * Mounts normal application state outside the credential-only broker route.
 * The root layout keeps Clerk available to both. Hidden refreshes must never
 * import guest completions, hydrate editor preferences or publish category events.
 * @example <ApplicationProviders>{children}</ApplicationProviders>
 */
export function ApplicationProviders({ children }: { children: ReactNode }) {
  const pathname = usePathname()
  if (pathname === '/desktop-auth') return <>{children}</>
  return (
    <ThemeProvider>
      <CodeInspectorClient />
      <QueryClientProvider>
        <ReduxProvider>
          <ElectronStartupSync />
          <OfflineSettingsSync />
          <LocalKeepMergeSync />
          <ElectronAuthProvider>
            <CategoryChangeSync />
            {children}
          </ElectronAuthProvider>
          <Toaster />
        </ReduxProvider>
      </QueryClientProvider>
    </ThemeProvider>
  )
}
