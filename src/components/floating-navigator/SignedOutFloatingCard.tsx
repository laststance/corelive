'use client'

import { memo } from 'react'

import {
  ElectronOAuthButtons,
  useShowElectronOAuth,
} from '@/components/auth/ElectronOAuthButtons'

/**
 * Signed-out "front door" for the Electron Floating window — rendered by
 * FloatingNavigatorContainer when Clerk reports no active session.
 *
 * Why it exists: the Electron main window was retired, so the Floating panel is
 * now the visible surface a signed-out user signs in from. It must stay visible
 * + interactive while signed out, else a signed-out launch = zero interactive
 * windows. After a native OAuth sign-in, Clerk re-renders the container in place
 * and this card is swapped for the live navigator — no reload, no navigation.
 *
 * @returns Native-OAuth buttons when the preload exposes the oauth bridge, else
 * a skew-safe fallback (an older frozen preload may lack it entirely).
 * @example
 * if (isLoaded && !isSignedIn) return <SignedOutFloatingCard />
 */
export const SignedOutFloatingCard = memo(function SignedOutFloatingCard() {
  // Render-time skew guard (DT3/F4): decide the affordance by CAPABILITY, not a
  // call-time `?.` — a frozen preload from an older install may not expose the
  // oauth bridge at all, in which case the buttons would be dead.
  const canStartOAuth = useShowElectronOAuth()

  return (
    <div className="flex h-full w-full flex-col items-center justify-center gap-4 bg-background p-5 text-center">
      <div className="space-y-1">
        <h1 className="text-base font-semibold text-foreground">CoreLive</h1>
        <p className="text-sm text-muted-foreground">
          Sign in to pick up today.
        </p>
      </div>

      {canStartOAuth ? (
        <div className="w-full">
          <ElectronOAuthButtons />
        </div>
      ) : (
        <p className="text-xs text-muted-foreground">
          Sign in from the CoreLive web app, then reopen this window.
        </p>
      )}
    </div>
  )
})
