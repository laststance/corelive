'use client'

import { useUser } from '@clerk/nextjs'
import { Heart } from 'lucide-react'

import {
  ElectronOAuthButtons,
  useShowElectronOAuth,
} from '@/components/auth/ElectronOAuthButtons'
import { isElectronEnvironment } from '@/electron/utils/electron-client'
import { useMounted } from '@/hooks/use-mounted'
import { HEATMAP_LEVEL_TOKENS } from '@/lib/heatmap-intensity'

/**
 * Decorative heatmap "ribbon" — a warming ramp (rest → cathedral-lit) of the
 * north-star temperature gradient, the year the returning user is picking back
 * up. Each `level` indexes HEATMAP_LEVEL_TOKENS (the heatmap source-of-truth),
 * so it resolves per active theme + light/dark mode via the `--hm-*` tokens with
 * zero extra wiring. Stable ids keep it from ever reordering; it is purely
 * decorative, so the row is `aria-hidden`.
 */
const HEATMAP_RIBBON_CELLS = [
  { id: 'dawn-a', level: 0 },
  { id: 'dawn-b', level: 1 },
  { id: 'morning-a', level: 1 },
  { id: 'morning-b', level: 2 },
  { id: 'midday-a', level: 2 },
  { id: 'midday-b', level: 3 },
  { id: 'afternoon-a', level: 3 },
  { id: 'afternoon-b', level: 4 },
  { id: 'dusk-a', level: 4 },
  { id: 'dusk-b', level: 3 },
] as const

/**
 * The Electron login window's whole UI: a Clerk gate in front of the signed-out native-OAuth
 * front door. After sign-in the current main process closes the window
 * ({@link WindowManager.completeLogin}); older installs keep showing the signed-in placeholder.
 * @returns
 * - A desktop-only notice in a plain browser tab
 * - "Loading…" until Clerk resolves
 * - The "Warm Cathedral" front door: native OAuth buttons, or a web-app fallback when a frozen preload lacks the oauth bridge
 * - A signed-in placeholder
 * @example
 * <LoginShell />
 */
export const LoginShell = function LoginShell() {
  const isMounted = useMounted()
  // Clerk auth gate: drives the signed-out front door vs the signed-in placeholder.
  const { isLoaded: isAuthLoaded, isSignedIn } = useUser()
  // Render-time skew guard (DT3/F4): decide the affordance by CAPABILITY, not a
  // call-time `?.` — a frozen preload from an older install may not expose the
  // oauth bridge at all, in which case the buttons would be dead.
  const canStartOAuth = useShowElectronOAuth()
  // Preload wiring is what makes this the login window; without it the page is
  // being viewed in a plain browser tab.
  const isLoginWindow = isMounted && isElectronEnvironment()

  if (!isLoginWindow) {
    return (
      <div className="flex h-full w-full items-center justify-center bg-background">
        <p className="text-sm text-muted-foreground">
          Only available in the desktop app
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

  // Signed in: the current main process closes this window right away; an
  // older install (no handoff) keeps it open, so say what to do next.
  if (isSignedIn) {
    return (
      <div className="flex h-full w-full items-center justify-center bg-background p-4">
        <p className="text-center text-sm text-muted-foreground">
          Signed in. Open LiveEditor to log your wins.
        </p>
      </div>
    )
  }

  // The approved "Warm Cathedral" front door (Variant A): an editorial headline
  // over the accumulated-warmth heatmap motif, carrying the north star — "your
  // year is waiting", never a KPI gate. `pt-10` clears the native traffic lights
  // that overlay the top edge of the hidden-title-bar window.
  return (
    <div className="flex h-full w-full flex-col bg-background p-6 pt-10">
      {/* Quiet brand wordmark — the headline below is the hero, not this. */}
      <p className="text-xs font-semibold tracking-wide text-muted-foreground">
        CoreLive
      </p>

      {/* Editorial hero: the north-star invitation in the stock sans stack per DESIGN.md. */}
      <div className="mt-5 space-y-2">
        <h1 className="text-3xl font-semibold leading-tight text-foreground">
          Your year is waiting
        </h1>
        <p className="text-sm text-muted-foreground">
          Pick up where you left off.
        </p>
      </div>

      {/* Sign-in affordance, capability-gated for preload skew (DT3). */}
      <div className="mt-6">
        {canStartOAuth ? (
          <ElectronOAuthButtons />
        ) : (
          <p className="text-sm text-muted-foreground">
            Sign in from the CoreLive web app, then reopen this window.
          </p>
        )}
      </div>

      {/* Push the motif + footer to the bottom edge of the window. */}
      <div className="mt-auto space-y-3 pt-6">
        {/* Accumulated-warmth heatmap ribbon — decorative north-star motif. */}
        <div className="flex gap-1" aria-hidden="true">
          {HEATMAP_RIBBON_CELLS.map((cell) => (
            <span
              key={cell.id}
              className="h-2.5 flex-1 rounded-sm"
              style={{ backgroundColor: HEATMAP_LEVEL_TOKENS[cell.level] }}
            />
          ))}
        </div>
        {/* Quiet-companion footer — affirmation, never a metric. */}
        <p className="flex items-center justify-center gap-1.5 text-xs text-muted-foreground">
          <Heart className="h-3 w-3" aria-hidden="true" />
          Small steps, meaningful change.
        </p>
      </div>
    </div>
  )
}
