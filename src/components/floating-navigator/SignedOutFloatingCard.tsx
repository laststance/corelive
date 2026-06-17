'use client'

import { Heart } from 'lucide-react'
import { memo } from 'react'

import {
  ElectronOAuthButtons,
  useShowElectronOAuth,
} from '@/components/auth/ElectronOAuthButtons'
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
 * Signed-out "front door" for the Electron Floating window — rendered by
 * FloatingNavigatorContainer when Clerk reports no active session.
 *
 * Why it exists: the Electron main window is being retired, so the Floating
 * panel is now the visible surface a signed-out user signs in from. It must stay
 * visible + interactive while signed out, else a signed-out launch = zero
 * interactive windows. After a native OAuth sign-in, Clerk re-renders the
 * container in place and this card is swapped for the live navigator — no
 * reload, no navigation (Clerk's `setActive` is called with a no-op `navigate`).
 *
 * The design is the approved "Warm Cathedral" front door (Variant A): a serif
 * editorial headline over the accumulated-warmth heatmap motif, carrying the
 * north star — "your year is waiting", never a KPI gate.
 *
 * @returns The amber native-OAuth front door when the preload exposes the oauth
 * bridge, else a skew-safe fallback (an older frozen preload may lack it).
 * @example
 * if (isLoaded && !isSignedIn) return <SignedOutFloatingCard />
 */
export const SignedOutFloatingCard = memo(function SignedOutFloatingCard() {
  // Render-time skew guard (DT3/F4): decide the affordance by CAPABILITY, not a
  // call-time `?.` — a frozen preload from an older install may not expose the
  // oauth bridge at all, in which case the buttons would be dead.
  const canStartOAuth = useShowElectronOAuth()

  return (
    <div className="flex h-full w-full flex-col bg-background p-6">
      {/* Quiet brand wordmark — the headline below is the hero, not this. */}
      <p className="text-xs font-semibold tracking-wide text-muted-foreground">
        CoreLive
      </p>

      {/* Editorial hero: the north-star invitation, serif display per DESIGN.md. */}
      <div className="mt-5 space-y-2">
        <h1 className="font-serif text-3xl font-semibold leading-tight text-foreground">
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

      {/* Push the motif + footer to the bottom edge of the panel. */}
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
})
