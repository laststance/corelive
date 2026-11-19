'use client'

import { useAuth } from '@clerk/nextjs'
import type { DashboardTheme } from '@corelive/desktop-contract/dashboard-appearance'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useTheme } from 'next-themes'
import {
  createContext,
  useContext,
  useEffect,
  useEffectEvent,
  type ReactNode,
} from 'react'
import { toast } from 'sonner'

import { createClient } from '@/lib/orpc/create-client'
import { normalizeThemePreference } from '@/lib/themes/registry'

const appearance = createClient().dashboardAppearance
const browserOwnerKey = 'corelive-dashboard-theme-owner'
const AccountThemeWriter = createContext<((value: string) => void) | undefined>(
  undefined,
)

/** Supplies the account writer to the sidebar and Settings when the dashboard has a verified user.
 * @example const saveAccountTheme=useDashboardThemeWriter()
 */
export function useDashboardThemeWriter() {
  return useContext(AccountThemeWriter)
}

/** Imports a browser's previous preference when this account has no saved theme.
 * A previous account's color selection must not initialize the next person's account.
 * @example const firstTheme=legacyBrowserTheme(userId)
 */
function legacyBrowserTheme(userId: string): DashboardTheme {
  try {
    const prior = window.localStorage.getItem(browserOwnerKey)
    return prior && prior !== userId
      ? 'system'
      : normalizeThemePreference(
          window.localStorage.getItem('corelive-theme') ?? 'system',
        )
  } catch {
    return 'system'
  }
}

/** Loads one signed-in user's theme and orders rapid picker changes for that account.
 * @example <BoundAppearance userId={userId}>{children}</BoundAppearance>
 */
function BoundAppearance({
  userId,
  children,
}: {
  userId: string
  children: ReactNode
}) {
  const { theme, setTheme } = useTheme()
  const queryClient = useQueryClient()
  const key = ['dashboardAppearance', userId] as const
  const saved = useQuery({
    queryKey: key,
    queryFn: async ({ signal }) => {
      const previous = await appearance.get(
        { expectedAccountId: userId },
        { signal },
      )
      if (previous.theme !== null) return previous
      // The server inserts only if unset. Another browser or agent may already have picked a theme.
      return appearance.set(
        {
          theme: legacyBrowserTheme(userId),
          initializeOnly: true,
          expectedAccountId: userId,
        },
        { signal },
      )
    },
    staleTime: 0,
    refetchOnWindowFocus: 'always',
    refetchOnMount: 'always',
  })
  const choice = useMutation({
    scope: { id: 'dashboardAppearance-' + userId },
    mutationFn: async (newTheme: DashboardTheme) =>
      appearance.set({ theme: newTheme, expectedAccountId: userId }),
    onSuccess: (result) => queryClient.setQueryData(key, result),
    onError: () => {
      toast.error(
        'Could not save the dashboard appearance. Choose the theme again to retry.',
      )
    },
    onSettled: async () => {
      await queryClient.invalidateQueries({ queryKey: key, exact: true })
    },
  })
  const visibleTheme = choice.isPending ? choice.variables : saved.data?.theme
  const applyAccountTheme = useEffectEvent((value: DashboardTheme) => {
    if (value !== theme) setTheme(value)
  })
  useEffect(() => {
    if (!visibleTheme) return
    // Storage can be disabled in a browser; the authenticated account still owns the preference.
    try {
      window.localStorage.setItem(browserOwnerKey, userId)
    } catch {
      /* Browser storage is optional. */
    }
    // next-themes handles storage events. Apply changes to the account or its selected theme here.
    applyAccountTheme(visibleTheme)
  }, [userId, visibleTheme])

  return (
    <AccountThemeWriter.Provider
      value={(value) => {
        const selected = normalizeThemePreference(value)
        if (selected !== theme) setTheme(selected)
        choice.mutate(selected)
      }}
    >
      {children}
    </AccountThemeWriter.Provider>
  )
}

/** Binds the ordinary dashboard theme picker to the signed-in account, preserving signed-out appearance.
 * @example <DashboardAppearanceProvider>{children}</DashboardAppearanceProvider>
 */
export function DashboardAppearanceProvider({
  children,
}: {
  children: ReactNode
}) {
  const { userId, isLoaded } = useAuth()
  return isLoaded && userId ? (
    <BoundAppearance key={userId} userId={userId}>
      {children}
    </BoundAppearance>
  ) : (
    <>{children}</>
  )
}
