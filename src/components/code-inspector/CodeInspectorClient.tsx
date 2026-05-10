'use client'

/**
 * Stable client-side mount point for `code-inspector-plugin`.
 *
 * The plugin injects its browser click handler into this module via
 * `next.config.js`, which keeps Alt-click inspection available on every route
 * that renders the root layout.
 *
 * @returns Nothing visible; the plugin adds its own runtime side effect.
 * @example
 * <CodeInspectorClient />
 */
export function CodeInspectorClient(): null {
  // The component is intentionally empty because the inspector runtime is
  // injected by the dev bundler, not authored in application code.
  return null
}
