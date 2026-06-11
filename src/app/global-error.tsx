'use client'

/**
 * @fileoverview Root-layout (global) error boundary for the App Router.
 *
 * `src/app/error.tsx` only catches throws inside the page subtree; it cannot
 * catch a throw from the root layout itself or its direct children (the Redux
 * provider, `<ElectronStartupSync />`, the toaster). Those escalate here. With
 * no `global-error.tsx`, they fall through to Next.js's stark built-in crash
 * screen — the exact outcome the Electron version-skew fix set out to prevent.
 *
 * Because `global-error` REPLACES the root layout, it renders its own
 * `<html>`/`<body>` and is intentionally dependency-free: no shadcn UI, no
 * design tokens, no logger, no global stylesheet. Every such import is a way
 * for the last line of defense to fail in precisely the situation it exists to
 * catch (a root-layout / provider / CSS failure re-triggering through the same
 * import graph). Styling is inline and deliberately plain, but the hex values
 * are hand-matched to the Warm Cathedral light palette so the backstop stays
 * on-brand (warm paper / ink / taupe) without importing a single token.
 *
 * @module app/global-error
 */

import { memo, type ReactElement, useEffect } from 'react'

interface GlobalErrorProps {
  /** The error React caught while rendering the root layout subtree. */
  error: Error & { digest?: string }
  /** Re-renders the whole app shell to retry after a transient failure. */
  reset: () => void
}

// Inline, token-free styles: global-error must not depend on globals.css, which
// may be exactly what failed to load. Plain values keep the backstop standing.
// The hex values are hand-matched to the Warm Cathedral light palette (the
// oklch tokens converted to sRGB) so the backstop still feels on-brand without
// importing a single design token — warm paper, warm ink, warm taupe.
const pageStyle = {
  minHeight: '100vh',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  padding: '24px',
  backgroundColor: '#faf4ea', // warm paper (≈ --background)
  color: '#1f1611', // warm ink (≈ --foreground)
  fontFamily:
    'ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif',
}

const cardStyle = {
  maxWidth: '28rem',
  width: '100%',
  border: '1px solid #ece3d4', // warm dawn (≈ --border)
  borderRadius: '12px',
  backgroundColor: '#fffdf8', // warm white, lifts off the page (≈ --card)
  padding: '24px',
  boxShadow: '0 1px 2px rgba(31, 22, 17, 0.05)',
}

const titleStyle = {
  margin: '0 0 8px',
  fontSize: '1.125rem',
  fontWeight: 600,
}

const descriptionStyle = {
  margin: '0 0 20px',
  fontSize: '0.875rem',
  lineHeight: 1.6,
  color: '#6c6158', // warm taupe (≈ --muted-foreground), AA on the card (5.9:1)
}

// Row holding the retry + reload escape side by side.
const actionsStyle = {
  display: 'flex',
  flexWrap: 'wrap' as const,
  gap: '8px',
}

const buttonStyle = {
  appearance: 'none' as const,
  cursor: 'pointer',
  border: '1px solid #1f1611',
  borderRadius: '8px',
  backgroundColor: '#1f1611', // warm-ink fill, paper text (16:1)
  color: '#faf4ea',
  fontSize: '0.875rem',
  fontWeight: 500,
  padding: '8px 16px',
}

// Quieter outline twin for the secondary "Reload the app" escape.
const secondaryButtonStyle = {
  ...buttonStyle,
  backgroundColor: 'transparent',
  color: '#1f1611',
  border: '1px solid #d8ccba', // warm hairline, calmer than the filled retry
}

/**
 * Logs the root-level boundary error once per error to the console — the only
 * sink global-error trusts at this layer. A deliberately LOCAL hook rather than
 * the app's `useCycleEffect`: the last line of defense must not re-enter the
 * app's effect/logging import graph, which may be exactly what failed. The
 * console call is guarded so a logging failure can never crash the recovery UI.
 *
 * @param error - The error the root layout boundary caught
 * @returns Nothing; fires a guarded console.error on mount and on error change
 * @example
 * useReportRootError(new Error('boom')) // logs '[global-error] Root layout boundary caught:'
 */
function useReportRootError(error: Error & { digest?: string }): void {
  useEffect(() => {
    try {
      console.error('[global-error] Root layout boundary caught:', error)
    } catch {
      // Intentionally empty: logging must never break the last line of defense.
    }
  }, [error])
}

/**
 * Last-resort recovery screen shown when the root layout itself throws; renders
 * its own document shell and stays calm in the quiet-companion voice. Rendered
 * automatically by Next.js as the global error boundary.
 *
 * @param props - Next.js error-boundary props
 * @param props.error - The caught error (its `digest` is set for server errors)
 * @param props.reset - Retries rendering the app shell
 * @returns A standalone, reassuring page with a "Try again" retry plus a
 *   "Reload the app" full-reload escape (reset() re-renders the same universal
 *   root layout, so a deterministic throw needs a fresh-bundle reload to clear)
 * @example
 * // Rendered automatically by Next.js when the root layout subtree throws.
 */
const GlobalError = memo(function GlobalError({
  error,
  reset,
}: GlobalErrorProps): ReactElement {
  useReportRootError(error)

  return (
    <html lang="en">
      <body style={pageStyle}>
        <div style={cardStyle} role="alert">
          <h1 style={titleStyle}>Give that another try</h1>
          <p style={descriptionStyle}>
            Something hiccuped while loading CoreLive. Your data is safe — give
            it another go.
          </p>
          <div style={actionsStyle}>
            <button type="button" onClick={reset} style={buttonStyle}>
              Try again
            </button>
            {/* Secondary escape: reset() re-renders the SAME root layout, so a
                deterministic throw just re-throws — and going "home" can't help
                either, since every route shares this layout. A full reload is
                the one move that fetches a fresh bundle (the stale-preload fix). */}
            <button
              type="button"
              onClick={() => window.location.reload()}
              style={secondaryButtonStyle}
            >
              Reload the app
            </button>
          </div>
        </div>
      </body>
    </html>
  )
})

export default GlobalError
