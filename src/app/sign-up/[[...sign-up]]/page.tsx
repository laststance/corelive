'use client'

import { SignUp } from '@clerk/nextjs'

import { useIsElectron } from '@/components/auth/ElectronLoginForm'
import { ElectronSignUpForm } from '@/components/auth/ElectronSignUpForm'

/**
 * Sign Up Page with Electron Email/Password Support
 *
 * In web browsers: Shows Clerk's standard SignUp component
 * In Electron: Shows email/password form with Google OAuth fallback
 *
 * Why special handling for Electron?
 * - Email/password works directly in Electron WebView (no browser needed)
 * - Google OAuth requires system browser (blocks WebView)
 * - GitHub removed: email/password provides simpler desktop experience
 */
export default function Page() {
  const isElectron = useIsElectron()

  return (
    <div className="grid h-screen place-items-center">
      {isElectron ? (
        <div className="w-full max-w-sm rounded-lg bg-card p-8 shadow-lg">
          <h1 className="mb-6 text-center text-2xl font-semibold text-card-foreground">
            Create your account
          </h1>
          <ElectronSignUpForm />
          <div className="mt-6 border-t border-border pt-4">
            <p className="text-center text-xs text-muted-foreground">
              Already have an account?{' '}
              <a href="/login" className="text-primary hover:underline">
                Sign in
              </a>
            </p>
          </div>
        </div>
      ) : (
        <SignUp path="/sign-up" forceRedirectUrl="/home" />
      )}
    </div>
  )
}
