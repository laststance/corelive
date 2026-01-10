'use client'

import { SignIn as Login } from '@clerk/nextjs'

import {
  ElectronOAuthButtons,
  useShowElectronOAuth,
} from '@/components/auth/ElectronOAuthButtons'

/**
 * Login Page with Electron OAuth Support
 *
 * In web browsers: Shows Clerk's standard SignIn component
 * In Electron: Shows custom OAuth buttons that open system browser
 *
 * Why special handling for Electron?
 * - Google OAuth blocks WebView authentication (403: disallowed_useragent)
 * - Must use system browser for OAuth in desktop apps
 * - Deep link callback returns user to Electron after auth
 */
export default function Page() {
  const showElectronOAuth = useShowElectronOAuth()

  return (
    <div className="flex min-h-screen items-center justify-center">
      {showElectronOAuth ? (
        <div className="w-full max-w-sm rounded-lg bg-white p-8 shadow-lg">
          <h1 className="mb-6 text-center text-2xl font-semibold text-gray-900">
            Sign in to CoreLive
          </h1>
          <ElectronOAuthButtons />
          <div className="mt-6 border-t pt-4">
            <p className="text-center text-xs text-gray-500">
              Don&apos;t have an account?{' '}
              <a href="/sign-up" className="text-blue-600 hover:underline">
                Sign up
              </a>
            </p>
          </div>
        </div>
      ) : (
        <Login />
      )}
    </div>
  )
}
