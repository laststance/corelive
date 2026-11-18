'use client'

import { SidebarTrigger } from '@/components/ui/sidebar'
import { useInitialEffect } from '@/hooks/use-initial-effect'
import {
  HOME_SSR_HINT_COOKIE_MAX_AGE_SECONDS,
  HOME_TIMEZONE_COOKIE_NAME,
} from '@/lib/constants/home'

import { Dashboard } from './Dashboard'

/** Persists the browser IANA zone when Dashboard opens so the NEXT SSR prefetch builds the exact heatmap key this client reads (first-ever visit falls back to geo/server guessing). @returns Nothing after writing the year-lived cookie. @example `persistViewerTimeZoneCookie() // document.cookie gains "corelive-tz=Asia%2FTokyo"` */
function persistViewerTimeZoneCookie(): void {
  const viewerTimeZone = Intl.DateTimeFormat().resolvedOptions().timeZone
  document.cookie = `${HOME_TIMEZONE_COOKIE_NAME}=${encodeURIComponent(viewerTimeZone)}; path=/; max-age=${HOME_SSR_HINT_COOKIE_MAX_AGE_SECONDS}; samesite=lax`
}

/**
 * Renders the Dashboard heading and its hydrated content. The /home route mounts it
 * inside the shared sidebar layout.
 * @example <DashboardContent />
 */
export const DashboardContent = function DashboardContent() {
  // Persist the viewer's zone so the next server prefetch hydrates the exact
  // heatmap key this browser reads.
  useInitialEffect(persistViewerTimeZoneCookie)

  return (
    <>
      <header className="window-drag-region flex h-16 shrink-0 items-center gap-2 border-b px-4">
        <SidebarTrigger className="no-drag -ml-1" />
        <h1 className="text-lg font-medium">Dashboard</h1>
      </header>
      <div className="flex flex-1 flex-col gap-4 p-4">
        <Dashboard />
      </div>
    </>
  )
}
