'use client'

import { useUser } from '@clerk/nextjs'

import { useMounted } from '@/hooks/use-mounted'

import { SignedOutFloatingCard } from './SignedOutFloatingCard'

/**
 * Auth shell for the Electron floating window (`Cmd+3`). Its todo list was
 * retired along with the rest of the Todo write paths, but this window is still
 * the desktop app's only sign-in surface (the main window went away in v0.14.0),
 * so the signed-out branch stays load-bearing. Signed-in it holds a placeholder
 * until the window gets its new job.
 *
 * @returns The signed-out OAuth front door, or a placeholder once signed in.
 * @example
 * <FloatingNavigatorContainer />
 */
export const FloatingNavigatorContainer =
  function FloatingNavigatorContainer() {
    const isMounted = useMounted()
    // Preload wiring is what makes this a real floating window; without it the
    // page is being viewed in a plain browser tab.
    const isFloatingNavigator =
      isMounted && typeof window !== 'undefined' && window.floatingNavigatorAPI
    // Clerk auth gate: drives the signed-out front door vs the signed-in body.
    const { isLoaded: isAuthLoaded, isSignedIn } = useUser()

    if (!isFloatingNavigator) {
      return (
        <div className="flex h-full w-full items-center justify-center bg-background">
          <p className="text-sm text-muted-foreground">
            Floating navigator only available in desktop app
          </p>
        </div>
      )
    }

    // Hold a calm loading state until Clerk resolves. A native OAuth sign-in
    // re-renders this in place — no reload.
    if (!isAuthLoaded) {
      return (
        <div className="flex h-full w-full items-center justify-center bg-background">
          <p className="text-sm text-muted-foreground">Loading…</p>
        </div>
      )
    }

    if (!isSignedIn) {
      return <SignedOutFloatingCard />
    }

    return (
      <div className="flex h-full w-full items-center justify-center bg-background p-4">
        <p className="text-center text-sm text-muted-foreground">
          Signed in. Open LiveEditor to log your wins.
        </p>
      </div>
    )
  }
