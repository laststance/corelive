'use client'

import { useClerk, useSignIn, useUser } from '@clerk/nextjs'
import { useEffect, useRef } from 'react'

import { isElectronEnvironment } from '../../../electron/utils/electron-client'
import { log } from '../logger'

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
  const { signIn, fetchStatus: signInFetchStatus } = useSignIn()
  const { client, setActive } = useClerk()
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
    if (!signIn || !client?.signIn) {
      log.debug('[OAuth] Waiting for Clerk signIn to be available...', {
        hasClientSignIn: !!client?.signIn,
        signInFetchStatus,
        hasSignIn: !!signIn,
      })
      return
    }

    log.info('[OAuth] Clerk signIn is ready, registering token listener')

    /**
     * Notify the renderer that OAuth failed and reset the in-flight state.
     *
     * @param message - Human-readable error shown by the Electron login form.
     * @returns Nothing. The function emits a browser event for UI consumers.
     * @example
     * dispatchOAuthError('Google sign-in failed')
     */
    const dispatchOAuthError = (message: string) => {
      isProcessingToken.current = false
      window.dispatchEvent(
        new CustomEvent('electron-oauth-error', { detail: message }),
      )
    }

    /**
     * Complete a successful Clerk sign-in by activating the new session.
     *
     * @param createdSessionId - The Clerk session that was created by ticket exchange.
     * @returns Promise that resolves when finalization either succeeds or emits an error.
     * @example
     * await activateOAuthSession('sess_123')
     */
    const activateOAuthSession = async (createdSessionId: string) => {
      try {
        log.info('[OAuth] Activating Electron session after ticket exchange', {
          createdSessionId,
        })

        await setActive({
          navigate: ({ session, decorateUrl }) => {
            if (session?.currentTask) {
              dispatchOAuthError(
                'Additional sign-in steps are required. Please complete sign-in in the browser.',
              )
              return
            }

            const url = decorateUrl('/home')
            window.location.href = url
          },
          session: createdSessionId,
        })
      } catch (error) {
        log.error('[OAuth] Session activation failed:', error)
        dispatchOAuthError(
          error instanceof Error
            ? error.message
            : 'Failed to complete Google sign-in',
        )
      } finally {
        isProcessingToken.current = false
      }
    }

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

    /**
     * Exchange a sign-in token for a Clerk session.
     *
     * This uses Clerk's documented `create({ strategy: 'ticket' })` flow for
     * backend-created sign-in tokens. The returned attempt exposes the
     * current status and created session immediately, so Electron does not
     * have to wait for a later render to determine whether authentication
     * succeeded.
     *
     * @param token - The sign-in token from browser OAuth
     * @param provider - The OAuth provider name (e.g., 'google')
     * @example
     * // Token arrives via deep link → client.signIn.create({ strategy: 'ticket', ticket })
     * // → complete attempt returns createdSessionId → setActive() activates session
     */
    const processSignInToken = async (token: string, provider: string) => {
      if (isProcessingToken.current) {
        log.debug('[OAuth] Sign-in token already being processed, skipping')
        return
      }

      // If user is already authenticated and visible to React, skip
      if (user) {
        log.info(
          '[OAuth] User already authenticated, skipping token exchange',
          { userId: user.id },
        )
        await window.electronAPI?.oauth?.clearPendingToken()
        return
      }

      isProcessingToken.current = true
      log.info('[OAuth] Processing sign-in token from browser OAuth', {
        provider,
        tokenPrefix: token.slice(0, 10) + '...',
      })

      try {
        // Clear the main-process fallback before consuming the token so a
        // failed exchange does not retry the same one-time ticket again.
        await window.electronAPI?.oauth?.clearPendingToken()

        const signInAttempt = await client.signIn.create({
          strategy: 'ticket',
          ticket: token,
        })

        log.info('[OAuth] Clerk ticket exchange finished', {
          createdSessionId: signInAttempt.createdSessionId,
          provider,
          status: signInAttempt.status,
        })

        if (signInAttempt.status === 'complete') {
          const createdSessionId = signInAttempt.createdSessionId
          if (!createdSessionId) {
            dispatchOAuthError(
              'Google sign-in completed without a session. Please try again.',
            )
            return
          }

          await activateOAuthSession(createdSessionId)
          return
        }

        const statusError = getElectronOAuthStatusError(signInAttempt.status)
        if (statusError) {
          dispatchOAuthError(statusError)
          return
        }

        dispatchOAuthError(
          `Google sign-in did not complete in Electron. Clerk status: ${signInAttempt.status ?? 'unknown'}`,
        )
      } catch (error) {
        log.error('[OAuth] Token exchange failed:', error)
        dispatchOAuthError(
          error instanceof Error ? error.message : 'Token exchange failed',
        )
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
  }, [client, setActive, signIn, signInFetchStatus, user])

  // Store token if it arrives before signIn is ready
  useEffect(() => {
    if (!isElectronEnvironment()) return
    if (signIn) {
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
  }, [signIn])

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
            id: user.id,
            clerkId: user.id,
            email: user.primaryEmailAddress?.emailAddress ?? '',
            firstName: user.firstName ?? null,
            lastName: user.lastName ?? null,
            imageUrl: user.imageUrl ?? null,
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

/**
 * Convert Clerk sign-in statuses into user-facing Electron OAuth errors.
 *
 * @param status - Current Clerk sign-in status.
 * @returns
 * - A human-readable error when the status requires user intervention.
 * - `null` when the status may still resolve on a later render.
 * @example
 * getElectronOAuthStatusError('needs_second_factor') // => 'Multi-factor authentication is required. Please use browser sign-in.'
 * @example
 * getElectronOAuthStatusError('complete') // => null
 */
function getElectronOAuthStatusError(
  status: string | null | undefined,
): string | null {
  switch (status) {
    case 'needs_second_factor':
      return 'Multi-factor authentication is required. Please use browser sign-in.'
    case 'needs_client_trust':
      return 'Device verification is required. Please use browser sign-in.'
    default:
      return null
  }
}
