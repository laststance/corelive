'use client'

import { SignIn as Login, useUser } from '@clerk/nextjs'

import {
  ElectronLoginForm,
  useIsElectron,
} from '@/components/auth/ElectronLoginForm'
import { useCycleEffect } from '@/hooks/use-cycle-effect'

/** Default post-auth destination when no same-origin redirect_url is present. */
const POST_LOGIN_HOME_PATH = '/home'

/**
 * Resolves the post-login navigation target from the proxy-provided redirect_url
 * query param, falling back to home. Only same-origin absolute URLs or relative
 * paths are accepted so open redirects cannot leave the app.
 *
 * @param search - `window.location.search` (or equivalent query string)
 * @param origin - Current page origin used for same-origin checks
 * @returns Safe in-app path or absolute same-origin URL
 * @example
 * resolvePostLoginPath('?redirect_url=http://localhost:4991/settings', 'http://localhost:4991')
 * // => 'http://localhost:4991/settings'
 * resolvePostLoginPath('', 'http://localhost:4991') // => '/home'
 */
function resolvePostLoginPath(search: string, origin: string): string {
  const redirectUrlParam = new URLSearchParams(search).get('redirect_url')
  if (!redirectUrlParam) {
    return POST_LOGIN_HOME_PATH
  }

  try {
    const redirectUrl = new URL(redirectUrlParam, origin)
    if (redirectUrl.origin !== origin) {
      return POST_LOGIN_HOME_PATH
    }

    return `${redirectUrl.pathname}${redirectUrl.search}${redirectUrl.hash}`
  } catch {
    return POST_LOGIN_HOME_PATH
  }
}

/**
 * Login Page with Electron Email/Password Support
 *
 * In web browsers: Shows Clerk's standard SignIn component
 * In Electron: Shows email/password form with Google OAuth fallback
 *
 * Why special handling for Electron?
 * - Email/password works directly in Electron WebView (no browser needed)
 * - Google OAuth requires system browser (blocks WebView)
 * - GitHub removed: email/password provides simpler desktop experience
 *
 * Authenticated users hard-navigate (not soft router.replace) so the full
 * document request re-runs Clerk middleware with session cookies. Soft
 * navigation can leave this page spinning when middleware previously failed
 * the handshake and bounced a protected route back to /login?redirect_url=...
 */
const Page = function Page() {
  const isElectron = useIsElectron()
  const { user, isLoaded } = useUser()

  // Hard redirect once Clerk client reports an active user
  useCycleEffect(() => {
    if (isLoaded && user) {
      window.location.replace(
        resolvePostLoginPath(window.location.search, window.location.origin),
      )
    }
  }, [user, isLoaded])

  // Show loading while checking auth or redirecting
  if (!isLoaded || user) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-muted border-t-primary" />
      </div>
    )
  }

  return (
    <div className="flex min-h-screen items-center justify-center">
      {isElectron ? (
        <div className="w-full max-w-sm rounded-lg bg-card p-8 shadow-lg">
          <h1 className="mb-6 text-center text-2xl font-semibold text-card-foreground">
            Sign in to CoreLive
          </h1>
          <ElectronLoginForm />
          <div className="mt-6 border-t border-border pt-4">
            <p className="text-center text-xs text-muted-foreground">
              Don&apos;t have an account?{' '}
              <a href="/sign-up" className="text-primary hover:underline">
                Sign up
              </a>
            </p>
          </div>
        </div>
      ) : (
        <Login fallbackRedirectUrl={POST_LOGIN_HOME_PATH} />
      )}
    </div>
  )
}

export default Page
