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
 * are hand-matched to the shadcn Default light palette (the applied default
 * theme) so the backstop matches a fresh install without importing a token.
 *
 * @module app/global-error
 */

import { type ReactElement, useEffect } from 'react'

interface GlobalErrorProps {
  /** The error React caught while rendering the root layout subtree. */
  error: Error & { digest?: string }
  /** Re-renders the whole app shell to retry after a transient failure. */
  reset: () => void
}

// Inline, token-free styles: global-error must not depend on globals.css, which
// may be exactly what failed to load. Plain values keep the backstop standing.
// The hex values are hand-matched to the shadcn Default light palette (the
// registry's oklch tokens converted to sRGB), the applied default theme, without
// importing a single design token.
const pageStyle = {
  minHeight: '100vh',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  padding: '24px',
  backgroundColor: '#ffffff', // Default --background, oklch(1 0 0)
  color: '#0a0a0a', // Default --foreground, oklch(0.145 0 0)
  fontFamily:
    'ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif',
}

const cardStyle = {
  maxWidth: '28rem',
  width: '100%',
  border: '1px solid #e5e5e5', // Default --border, oklch(0.922 0 0)
  borderRadius: '12px',
  backgroundColor: '#ffffff', // Default --card, oklch(1 0 0); the border lifts it
  padding: '24px',
  boxShadow: '0 1px 2px rgba(10, 10, 10, 0.05)',
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
  color: '#737373', // Default --muted-foreground, oklch(0.556 0 0); AA on white (4.7:1)
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
  border: '1px solid #171717',
  borderRadius: '8px',
  backgroundColor: '#171717', // Default --primary, oklch(0.205 0 0)
  color: '#fafafa', // Default --primary-foreground, oklch(0.985 0 0)
  fontSize: '0.875rem',
  fontWeight: 500,
  padding: '8px 16px',
}

// Quieter outline twin for the secondary "Reload the app" escape.
const secondaryButtonStyle = {
  ...buttonStyle,
  backgroundColor: 'transparent',
  color: '#171717',
  border: '1px solid #e5e5e5', // Default --border hairline, calmer than the filled retry
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
const GlobalError = function GlobalError({
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
}

export default GlobalError
