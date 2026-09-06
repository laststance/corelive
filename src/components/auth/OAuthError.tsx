/** Shows the browser OAuth failure state shared by start and callback routes.
 * @param props - Flow-specific title and the existing error message.
 * @returns The error message and window-close action.
 * @example <OAuthError title="Authentication Failed" errorMessage="Please retry." />
 */
export function OAuthError({
  title,
  errorMessage,
}: {
  title: string
  errorMessage: string
}) {
  return (
    <>
      <div className="mb-4 flex justify-center">
        <div className="bg-destructive/10 flex h-12 w-12 items-center justify-center rounded-full">
          <svg
            className="h-8 w-8 text-destructive"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M6 18L18 6M6 6l12 12"
            />
          </svg>
        </div>
      </div>
      <h1 className="mb-2 text-center text-xl font-semibold text-foreground">
        {title}
      </h1>
      <p className="mb-4 text-center text-muted-foreground">{errorMessage}</p>
      <div className="flex justify-center">
        <button
          onClick={() => window.close()}
          className="rounded-lg bg-secondary px-4 py-2 text-secondary-foreground transition hover:bg-accent"
        >
          Close this window
        </button>
      </div>
    </>
  )
}
