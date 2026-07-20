'use client'

import { SidebarTrigger } from '@/components/ui/sidebar'
import { useCycleEffect } from '@/hooks/use-cycle-effect'
import { useInitialEffect } from '@/hooks/use-initial-effect'
import { syncSelectedCategoryCookieFromStorage } from '@/hooks/useSelectedCategory'
import {
  HOME_RETAIN_COMPLETED_COOKIE_NAME,
  HOME_SSR_HINT_COOKIE_MAX_AGE_SECONDS,
  HOME_TIMEZONE_COOKIE_NAME,
} from '@/lib/constants/home'
import { useAppSelector } from '@/lib/redux/hooks'
import { selectRetainCompletedInList } from '@/lib/redux/slices/settingsSlice'

import { TodoList } from './TodoList'

/** Persists the browser IANA zone on Home mount so the NEXT SSR prefetch builds the exact heatmap key this client reads (first-ever visit falls back to geo/server guessing). @returns Nothing after writing the year-lived cookie. @example `persistViewerTimeZoneCookie() // document.cookie gains "corelive-tz=Asia%2FTokyo"` */
function persistViewerTimeZoneCookie(): void {
  const viewerTimeZone = Intl.DateTimeFormat().resolvedOptions().timeZone
  document.cookie = `${HOME_TIMEZONE_COOKIE_NAME}=${encodeURIComponent(viewerTimeZone)}; path=/; max-age=${HOME_SSR_HINT_COOKIE_MAX_AGE_SECONDS}; samesite=lax`
}

/** Mirrors the 居残りモード setting into an SSR-hint cookie so the next Home prefetch builds the retain-aware todo key (retain ON drops the `completed` filter); OFF expires the cookie so the SSR default applies. @param isRetaining - Current 居残りモード setting from Redux. @returns Nothing after writing or expiring the cookie. @example `persistRetainCompletedCookie(true) // document.cookie gains "corelive-retain-completed=true"` */
function persistRetainCompletedCookie(isRetaining: boolean): void {
  const maxAge = isRetaining ? HOME_SSR_HINT_COOKIE_MAX_AGE_SECONDS : 0
  document.cookie = `${HOME_RETAIN_COMPLETED_COOKIE_NAME}=${isRetaining ? 'true' : ''}; path=/; max-age=${maxAge}; samesite=lax`
}

/**
 * Client half of the Home page (header + TodoList), rendered inside the
 * server `page.tsx`'s HydrationBoundary. The sidebar is provided by
 * `(main)/layout.tsx`.
 */
export const HomeContent = function HomeContent() {
  // Persist both SSR-hint cookies (viewer zone + category selection) so the
  // next server prefetch hydrates the exact keys this browser reads.
  useInitialEffect(() => {
    persistViewerTimeZoneCookie()
    syncSelectedCategoryCookieFromStorage()
  })

  // Keep the 居残りモード SSR-hint cookie in lock-step with the Redux setting —
  // this one effect covers both mount-backfill and later toggles, so the next
  // prefetch builds the retain-aware todo key this browser will read.
  const isRetaining = useAppSelector(selectRetainCompletedInList)
  useCycleEffect(() => {
    persistRetainCompletedCookie(isRetaining)
  }, [isRetaining])

  return (
    <>
      <header className="window-drag-region flex h-16 shrink-0 items-center gap-2 border-b px-4">
        <SidebarTrigger className="no-drag -ml-1" />
        <div className="flex items-center gap-2">
          <h2 className="text-lg font-medium">Tasks</h2>
        </div>
      </header>
      <div className="flex flex-1 flex-col gap-4 p-4">
        <TodoList />
      </div>
    </>
  )
}
