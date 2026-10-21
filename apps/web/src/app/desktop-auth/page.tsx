'use client'

import { useSession } from '@clerk/nextjs'
import type { OfflineAuthRequest } from '@corelive/desktop-contract/offline-auth'

import { useCycleEffect } from '@/hooks/use-cycle-effect'

/**
 * Answers main-issued token challenges using the existing Clerk session cookie.
 * Only the dedicated hidden broker preload supplies this capability. The route
 * has no editor/settings state and exposes no credentials to a normal browser.
 * Session expiry returns signed-out without invoking explicit native logout.
 * @example <DesktopAuthPage />
 */
export default function DesktopAuthPage(): null {
  const { isLoaded, session } = useSession()
  useCycleEffect(() => {
    const bridge = window.coreliveOfflineAuth
    if (!isLoaded || !bridge) return
    let disposed = false
    const running = new Set<string>()
    const respond = async (request: OfflineAuthRequest): Promise<void> => {
      if (running.has(request.requestId)) return
      running.add(request.requestId)
      try {
        if (
          !session ||
          (request.expectedAccountId &&
            session.user.id !== request.expectedAccountId)
        ) {
          if (!disposed)
            await bridge.respond({ ...request, status: 'signed-out' })
          return
        }
        // Force refresh at the narrow broker boundary; the sync worker batches requests.
        const token = await session.getToken({ skipCache: true })
        if (disposed) return
        await bridge.respond(
          token
            ? { ...request, status: 'ready', accountId: session.user.id, token }
            : { ...request, status: 'signed-out' },
        )
      } catch {
        // SDK errors may contain credentials; never log them or treat transport loss as logout.
        if (!disposed)
          await bridge
            .respond({ ...request, status: 'unavailable' })
            .catch(() => undefined)
      } finally {
        running.delete(request.requestId)
      }
    }
    const unsubscribe = bridge.onRequest((request) => {
      void respond(request)
    })
    void bridge
      .ready()
      .then((request) => {
        if (request && !disposed) void respond(request)
      })
      .catch(() => undefined)
    return (): void => {
      disposed = true
      unsubscribe()
    }
  }, [isLoaded, session])
  return null
}
