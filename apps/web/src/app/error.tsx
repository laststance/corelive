'use client'

/**
 * @fileoverview Route-level error boundary for the App Router.
 *
 * Replaces Next.js's stark default screen ("This page couldn't load") with a
 * quiet, on-brand recovery card so any client-side render or effect throw
 * degrades gracefully instead of blanking the whole app. React renders this in
 * place of a crashed page subtree (e.g. an outdated Electron preload missing a
 * method); without it, the nearest boundary is the scary built-in global-error.
 *
 * @module app/error
 */
import { House, RotateCcw } from 'lucide-react'
import { type ReactElement } from 'react'

import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { useCycleEffect } from '@/hooks/use-cycle-effect'
import { log } from '@/lib/logger'

interface RouteErrorProps {
  /** The error React caught while rendering the page subtree. */
  error: Error & { digest?: string }
  /** Re-renders the crashed segment to retry after a transient failure. */
  reset: () => void
}

/**
 * Gentle recovery card shown when a page throws, with a one-tap retry — keeps
 * the quiet-companion voice (reassure, never alarm) so a crash never reads as
 * the user's failure. Rendered automatically by Next.js as the route boundary.
 *
 * @param props - Next.js error-boundary props
 * @param props.error - The caught error (digest is set for server errors)
 * @param props.reset - Retries rendering the crashed segment
 * @returns A reassuring card with a "Try again" retry plus a "Back to home"
 *   hard-navigation escape (reset() alone dead-ends on deterministic throws —
 *   e.g. a stale preload — so the secondary action leaves the broken route and
 *   reloads a fresh bundle)
 * @example
 * // Rendered automatically by Next.js when a page subtree throws.
 */
const RouteError = function RouteError({
  error,
  reset,
}: RouteErrorProps): ReactElement {
  // Surface the real error to logs/telemetry; the UI stays calm and vague.
  useCycleEffect(() => {
    log.error('Page boundary caught a client error:', error)
  }, [error])

  // Hard nav to home — stable ref so the memo'd Button never re-renders for it.
  const goHome = () => {
    window.location.assign('/')
  }

  return (
    <div className="flex min-h-screen items-center justify-center p-6">
      <Card className="max-w-md">
        <CardHeader>
          <CardTitle>Give that another try</CardTitle>
          <CardDescription>
            Something hiccuped while loading this view. Your data is safe — give
            it another go.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-2">
          <Button onClick={reset} className="gap-2">
            <RotateCcw className="h-4 w-4" />
            Try again
          </Button>
          {/* Secondary escape: reset() re-renders the SAME crashed segment, so a
               deterministic throw just re-throws. A hard nav to "/" leaves the
               broken route entirely and reloads a fresh bundle (fixes a stale
               Electron preload that reset() never could). */}
          <Button variant="outline" onClick={goHome} className="gap-2">
            <House className="h-4 w-4" />
            Back to home
          </Button>
        </CardContent>
      </Card>
    </div>
  )
}

export default RouteError
