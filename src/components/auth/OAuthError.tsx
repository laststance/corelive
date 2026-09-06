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
        <div className="flex h-12 w-12 items-center justify-center rounded-full bg-red-100">
          <svg
            className="h-8 w-8 text-red-500"
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
      <h1 className="mb-2 text-center text-xl font-semibold text-gray-900">
        {title}
      </h1>
      <p className="mb-4 text-center text-gray-600">{errorMessage}</p>
      <div className="flex justify-center">
        <button
          onClick={() => window.close()}
          className="rounded-lg bg-gray-100 px-4 py-2 text-gray-700 transition hover:bg-gray-200"
        >
          Close this window
        </button>
      </div>
    </>
  )
}
