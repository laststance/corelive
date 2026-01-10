'use client'

import { AuthenticateWithRedirectCallback } from '@clerk/nextjs'
import { useSearchParams } from 'next/navigation'
import { Suspense } from 'react'

/**
 * SSO Callback Page - Clerk OAuth Callback Handler
 *
 * This page handles the callback from Clerk after OAuth authentication.
 * Clerk's AuthenticateWithRedirectCallback component processes the OAuth
 * response and then redirects to the redirectUrlComplete specified in
 * authenticateWithRedirect().
 *
 * Flow:
 * 1. User completes OAuth on Google/GitHub
 * 2. Provider redirects to Clerk
 * 3. Clerk processes auth and redirects here
 * 4. This page uses AuthenticateWithRedirectCallback to complete the flow
 * 5. Clerk redirects to /oauth/callback (redirectUrlComplete)
 */

function SSOCallbackContent() {
  const searchParams = useSearchParams()
  const state = searchParams.get('state')

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-gradient-to-b from-gray-50 to-gray-100 p-4">
      <div className="w-full max-w-md rounded-lg bg-white p-8 shadow-lg">
        <div className="mb-4 flex justify-center">
          <div className="h-12 w-12 animate-spin rounded-full border-4 border-gray-200 border-t-blue-500" />
        </div>
        <h1 className="mb-2 text-center text-xl font-semibold text-gray-900">
          Completing Authentication
        </h1>
        <p className="text-center text-gray-600">
          Please wait while we finish signing you in...
        </p>
      </div>

      {/* Clerk's callback handler - this will redirect to /oauth/callback */}
      <AuthenticateWithRedirectCallback
        signInForceRedirectUrl={`/oauth/callback?state=${encodeURIComponent(state || '')}`}
        signUpForceRedirectUrl={`/oauth/callback?state=${encodeURIComponent(state || '')}`}
      />

      <p className="mt-4 text-center text-xs text-gray-400">
        CoreLive - Task Management for Productivity
      </p>
    </div>
  )
}

/**
 * SSO Callback Page with Suspense wrapper.
 */
export default function SSOCallbackPage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-screen items-center justify-center">
          <div className="h-12 w-12 animate-spin rounded-full border-4 border-gray-200 border-t-blue-500" />
        </div>
      }
    >
      <SSOCallbackContent />
    </Suspense>
  )
}
