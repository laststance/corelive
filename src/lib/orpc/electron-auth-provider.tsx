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
  const { signIn, setActive, isLoaded: isSignInLoaded } = useSignIn()
  const isProcessingToken = useRef(false)
  const pendingToken = useRef<{ token: string; provider: string } | null>(null)

  // Handle sign-in token from browser OAuth
  useEffect(() => {
    // Only run in Electron environment
    if (!isElectronEnvironment()) {
      return
    }

    // Wait for Clerk signIn to be available before registering callback
    // This prevents race condition where callback runs before signIn is ready
    if (!isSignInLoaded || !signIn || !setActive) {
      log.debug('[OAuth] Waiting for Clerk signIn to be available...', {
        isSignInLoaded,
        hasSignIn: !!signIn,
        hasSetActive: !!setActive,
      })
      return
    }

    log.info('[OAuth] Clerk signIn is ready, registering token listener')

    // Process any pending token that arrived before signIn was ready
    const processPendingToken = async () => {
      log.debug('[OAuth] Checking for pending token (local ref)', {
        hasPending: !!pendingToken.current,
        isProcessing: isProcessingToken.current,
      })

      // First, check local ref
      if (pendingToken.current && !isProcessingToken.current) {
        const { token, provider } = pendingToken.current
        pendingToken.current = null
        log.info('[OAuth] Processing pending token from local ref')
        await processSignInToken(token, provider)
        return
      }

      // Then, check main process for any pending token (race condition handling)
      log.debug('[OAuth] Checking main process for pending token')
      try {
        const mainProcessToken =
          await window.electronAPI?.oauth?.getPendingToken()
        if (mainProcessToken && !isProcessingToken.current) {
          log.info('[OAuth] Found pending token in main process', {
            provider: mainProcessToken.provider,
            tokenPrefix: mainProcessToken.token.slice(0, 10) + '...',
          })
          await processSignInToken(
            mainProcessToken.token,
            mainProcessToken.provider,
          )
        }
      } catch (error) {
        log.error(
          '[OAuth] Failed to get pending token from main process',
          error,
        )
      }
    }

    const processSignInToken = async (token: string, provider: string) => {
      if (isProcessingToken.current) {
        log.debug('[OAuth] Sign-in token already being processed, skipping')
        return
      }

      isProcessingToken.current = true
      log.info('[OAuth] Processing sign-in token from browser OAuth', {
        provider,
        tokenPrefix: token.slice(0, 10) + '...',
      })

      try {
        log.debug('[OAuth] Calling signIn.create with ticket strategy')
        // Use the ticket strategy to create a session from the sign-in token
        const result = await signIn.create({
          strategy: 'ticket',
          ticket: token,
        })

        log.debug('[OAuth] signIn.create result', {
          status: result.status,
          hasSessionId: !!result.createdSessionId,
        })

        if (result.status === 'complete' && result.createdSessionId) {
          // Set the new session as active
          log.debug('[OAuth] Setting active session', {
            sessionId: result.createdSessionId,
          })
          await setActive({ session: result.createdSessionId })
          log.info('[OAuth] Successfully signed in via browser OAuth token')

          // Clear any pending token in main process
          await window.electronAPI?.oauth?.clearPendingToken()

          // Notify ElectronOAuthButtons that auth succeeded (resets loading state)
          // This is done via the Clerk session change which triggers useUser() update
        } else {
          log.warn('Sign-in token exchange did not complete', {
            status: result.status,
          })
          // Dispatch error event to reset OAuth button loading state
          window.dispatchEvent(
            new CustomEvent('electron-oauth-error', {
              detail: `Sign-in incomplete: ${result.status}`,
            }),
          )
        }
      } catch (error) {
        log.error('Failed to exchange sign-in token for session:', error)
        // Dispatch error event to reset OAuth button loading state
        const errorMessage =
          error instanceof Error ? error.message : 'Token exchange failed'
        window.dispatchEvent(
          new CustomEvent('electron-oauth-error', { detail: errorMessage }),
        )
      } finally {
        isProcessingToken.current = false
      }
    }

    // Register callback for sign-in token from browser OAuth
    log.debug('[OAuth] Registering main onSignInToken listener')
    const cleanup = window.electronAPI?.oauth?.onSignInToken(
      async (data: { token: string; provider: string }) => {
        log.info('[OAuth] Main listener received token', {
          provider: data.provider,
          tokenPrefix: data.token.slice(0, 10) + '...',
        })
        await processSignInToken(data.token, data.provider)
      },
    )

    // Process any pending token
    log.debug('[OAuth] About to process pending token (if any)')
    void processPendingToken()

    return () => {
      log.debug('[OAuth] Cleaning up main listener')
      cleanup?.()
    }
  }, [signIn, setActive, isSignInLoaded])

  // Store token if it arrives before signIn is ready
  useEffect(() => {
    if (!isElectronEnvironment()) return
    if (isSignInLoaded && signIn) {
      log.debug('[OAuth] Temp effect: signIn ready, skipping temp listener')
      return // Already ready, main effect will handle
    }

    // Register temporary listener to capture token before signIn is ready
    log.debug('[OAuth] Registering temporary listener (signIn not ready yet)')
    const tempCleanup = window.electronAPI?.oauth?.onSignInToken(
      (data: { token: string; provider: string }) => {
        log.info('[OAuth] Temp listener received token, storing for later', {
          provider: data.provider,
          tokenPrefix: data.token.slice(0, 10) + '...',
        })
        pendingToken.current = data
      },
    )

    return () => {
      log.debug('[OAuth] Cleaning up temporary listener')
      tempCleanup?.()
    }
  }, [isSignInLoaded, signIn])

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
