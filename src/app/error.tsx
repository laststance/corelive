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
import { RotateCcw } from 'lucide-react'
import { memo, type ReactElement } from 'react'

import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { useComponentEffect } from '@/hooks/useComponentEffect'
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
 * @returns A reassuring card with a "Try again" action
 * @example
 * // Rendered automatically by Next.js when a page subtree throws.
 */
const RouteError = memo(function RouteError({
  error,
  reset,
}: RouteErrorProps): ReactElement {
  // Surface the real error to logs/telemetry; the UI stays calm and vague.
  useComponentEffect(() => {
    log.error('Page boundary caught a client error:', error)
  }, [error])

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
        <CardContent>
          <Button onClick={reset} className="gap-2">
            <RotateCcw className="h-4 w-4" />
            Try again
          </Button>
        </CardContent>
      </Card>
    </div>
  )
})

export default RouteError
