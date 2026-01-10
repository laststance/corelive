'use client'

import { useSignIn, useUser } from '@clerk/nextjs'
import { useEffect, useRef } from 'react'

import { log } from '../logger'

import { isElectronEnvironment } from './electron-client'

/**
 * Component that synchronizes Clerk authentication state with Electron.
 *
 * When running inside Electron we forward the minimal user payload required by
 * the main process: the Clerk user identifier (`clerkId`) plus optional
 * denormalised profile fields that help the native shell display context.
 *
 * Also handles sign-in tokens from browser OAuth flow. When the user completes
 * OAuth in the system browser, a sign-in token is passed back via deep link
 * and this component uses it to create a Clerk session in the WebView.
 */
export function ElectronAuthProvider({
  children,
}: {
  children: React.ReactNode
}) {
  const { user, isLoaded } = useUser()
  const { signIn, setActive } = useSignIn()
  const isProcessingToken = useRef(false)

  // Handle sign-in token from browser OAuth
  useEffect(() => {
    // Only run in Electron environment
    if (!isElectronEnvironment()) {
      return
    }

    // Register callback for sign-in token from browser OAuth
    const cleanup = window.electronAPI?.oauth?.onSignInToken(
      async (data: { token: string; provider: string }) => {
        // Prevent duplicate processing
        if (isProcessingToken.current) {
          log.debug('Sign-in token already being processed, skipping')
          return
        }

        isProcessingToken.current = true
        log.info('Received sign-in token from browser OAuth', {
          provider: data.provider,
        })

        try {
          if (!signIn) {
            throw new Error('Clerk signIn not available')
          }

          // Use the ticket strategy to create a session from the sign-in token
          const result = await signIn.create({
            strategy: 'ticket',
            ticket: data.token,
          })

          if (result.status === 'complete' && result.createdSessionId) {
            // Set the new session as active
            await setActive({ session: result.createdSessionId })
            log.info('Successfully signed in via browser OAuth token')
          } else {
            log.warn('Sign-in token exchange did not complete', {
              status: result.status,
            })
          }
        } catch (error) {
          log.error('Failed to exchange sign-in token for session:', error)
        } finally {
          isProcessingToken.current = false
        }
      },
    )

    return cleanup
  }, [signIn, setActive])

  // Sync auth state with Electron main process
  useEffect(() => {
    // Only run in Electron environment
    if (!isElectronEnvironment()) {
      return
    }

    // Wait for Clerk to load
    if (!isLoaded) {
      return
    }

    const syncAuthState = async () => {
      try {
        if (user) {
          // User is authenticated, sync with Electron
          await window.electronAPI?.auth?.setUser({
            clerkId: user.id,
            email: user.primaryEmailAddress?.emailAddress ?? null,
            name: user.fullName ?? user.firstName ?? null,
          })
        } else {
          // User is not authenticated, logout from Electron
          await window.electronAPI?.auth?.logout()
        }
      } catch (error) {
        log.error('Failed to sync authentication with Electron:', error)
      }
    }

    syncAuthState()
  }, [user, isLoaded])

  return <>{children}</>
}

/**
 * Hook to check if running in Electron and get Electron-specific auth state
 */
export function useElectronAuth() {
  const isElectron = isElectronEnvironment()

  const getElectronUser = async () => {
    if (!isElectron) return null

    try {
      return await window.electronAPI?.auth?.getUser()
    } catch (error) {
      log.error('Failed to get Electron user:', error)
      return null
    }
  }

  const isElectronAuthenticated = async () => {
    if (!isElectron) return false

    try {
      return await window.electronAPI?.auth?.isAuthenticated()
    } catch (error) {
      log.error('Failed to check Electron authentication:', error)
      return false
    }
  }

  return {
    isElectron,
    getElectronUser,
    isElectronAuthenticated,
  }
}
