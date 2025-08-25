'use client'

import { useUser } from '@clerk/nextjs'
import { useEffect } from 'react'

import { isElectronEnvironment } from './electron-client'

/**
 * Component that synchronizes Clerk authentication state with Electron
 */
export function ElectronAuthProvider({
  children,
}: {
  children: React.ReactNode
}) {
  const { user, isLoaded } = useUser()

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
          await window.electronAPI?.auth.setUser({
            id: user.id,
            email: user.primaryEmailAddress?.emailAddress,
            name: user.fullName || user.firstName || 'User',
          })

          console.log('✅ Authentication synced with Electron')
        } else {
          // User is not authenticated, logout from Electron
          await window.electronAPI?.auth.logout()
          console.log('🔓 Logged out from Electron')
        }
      } catch (error) {
        console.error('Failed to sync authentication with Electron:', error)
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
      return await window.electronAPI?.auth.getUser()
    } catch (error) {
      console.error('Failed to get Electron user:', error)
      return null
    }
  }

  const isElectronAuthenticated = async () => {
    if (!isElectron) return false

    try {
      return await window.electronAPI?.auth.isAuthenticated()
    } catch (error) {
      console.error('Failed to check Electron authentication:', error)
      return false
    }
  }

  return {
    isElectron,
    getElectronUser,
    isElectronAuthenticated,
  }
}
