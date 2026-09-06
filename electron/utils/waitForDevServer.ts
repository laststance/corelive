import {
  DEV_SERVER_MAX_ATTEMPTS,
  DEV_SERVER_REQUEST_TIMEOUT_MS,
  DEV_SERVER_RETRY_INTERVAL_MS,
} from '../constants'

/**
 * Waits for an HTTP 200 before the development runner opens Electron, bounding each request and retry.
 * @param url - Next.js development server URL.
 * @returns Resolves when ready; rejects after the final failed attempt.
 * @example await waitForDevServer('http://localhost:4991')
 */
export async function waitForDevServer(url: string): Promise<void> {
  let lastError: unknown

  // Retry transient compilation and connection failures without leaving requests hanging.
  for (let attempt = 1; attempt <= DEV_SERVER_MAX_ATTEMPTS; attempt++) {
    try {
      const response = await fetch(url, {
        signal: AbortSignal.timeout(DEV_SERVER_REQUEST_TIMEOUT_MS),
      })
      await response.body?.cancel()
      if (response.status === 200) return
      lastError = new Error(
        `Server returned non-200 status: ${response.status}`,
      )
    } catch (error) {
      lastError = error
    }

    // Stop immediately after the last attempt instead of scheduling another delay.
    if (attempt < DEV_SERVER_MAX_ATTEMPTS) {
      await new Promise((resolve) =>
        setTimeout(resolve, DEV_SERVER_RETRY_INTERVAL_MS),
      )
    }
  }

  throw new Error('Next.js dev server failed to start after maximum retries', {
    cause: lastError,
  })
}
