/**
 * Renderer-side error sink for the bundled Settings window.
 *
 * The web app used pino; the sandboxed renderer only has the console. Moved settings components
 * call `log.error` exactly as before, so their behavior and tests are unchanged.
 */
export const log = {
  /** Reports a recoverable failure to the devtools console. */
  error: (...args: unknown[]): void => console.error(...args),
}
