'use client'

import { SignIn as Login, useUser } from '@clerk/nextjs'
import { useRouter } from 'next/navigation'
import { useEffect } from 'react'

import {
  ElectronLoginForm,
  useIsElectron,
} from '@/components/auth/ElectronLoginForm'

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
 */
export default function Page() {
  const isElectron = useIsElectron()
  const { user, isLoaded } = useUser()
  const router = useRouter()

  // Redirect to home if user is already authenticated
  useEffect(() => {
    if (isLoaded && user) {
      router.replace('/home')
    }
  }, [user, isLoaded, router])

  // Show loading while checking auth or redirecting
  if (!isLoaded || user) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-gray-200 border-t-blue-500" />
      </div>
    )
  }

  return (
    <div className="flex min-h-screen items-center justify-center">
      {isElectron ? (
        <div className="w-full max-w-sm rounded-lg bg-white p-8 shadow-lg">
          <h1 className="mb-6 text-center text-2xl font-semibold text-gray-900">
            Sign in to CoreLive
          </h1>
          <ElectronLoginForm />
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
