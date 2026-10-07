'use client'

import { useUser } from '@clerk/nextjs'
import { isElectronEnvironment } from '@corelive/desktop-contract/client'
import { useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'

import { useCycleEffect } from '@/hooks/use-cycle-effect'
import { invalidateCategoryViews } from '@/lib/category-sync-channel'
import { retireCategoryDraftRescueReceipts } from '@/lib/live-editor/categoryDraftRescueReceipts'
import { isElectronLiveEditorPanel } from '@/lib/live-editor/liveEditorHost'
import {
  createLocalStorageSlot,
  getLocalStorageAvailability,
} from '@/lib/live-editor/localStorageSlot'
import { rescueCategoryDraft } from '@/lib/live-editor/rescueCategoryDraft'
import { orpc } from '@/lib/orpc/client-query'

/** Replays account-owned deletion receipts before refreshing browser/desktop category views.
 * Mounted once by {@link RootLayout}; signed-out pages never poll protected routes.
 * Local drafts never leave their host, and failed rescue keeps the cursor unacknowledged.
 * @example <CategoryChangeSync />
 */
export function CategoryChangeSync() {
  const { user, isLoaded, isSignedIn } = useUser()
  const queryClient = useQueryClient()
  const userId = user?.id
  useCycleEffect(() => {
    if (!isLoaded || !isSignedIn || !userId) return
    // Settings/login share Electron storage but cannot read the panel's native note file.
    if (isElectronEnvironment() && !isElectronLiveEditorPanel()) return
    const slot = createLocalStorageSlot(`corelive.category-changes.${userId}`)
    let stopped = false
    const progress = { running: false }
    const refresh = async () => {
      if (stopped || progress.running || document.visibilityState === 'hidden')
        return
      progress.running = true
      let rescuing = false
      try {
        // Cursor writes occur only after every host-local draft in that page has been preserved.
        for (let page = 0; page < 5 && !stopped; page++) {
          const stored = Number(slot.read() ?? '0')
          const afterId =
            Number.isSafeInteger(stored) && stored >= 0 ? stored : 0
          const response = await queryClient.fetchQuery({
            ...orpc.category.changes.queryOptions({ input: { afterId } }),
            staleTime: 0,
          })
          for (const receipt of response.deletions) {
            if (stopped) return
            rescuing = true
            if (!navigator.locks)
              throw new Error(
                'This browser cannot safely coordinate category replay',
              )
            // Same-profile windows must re-read the cursor inside the replay lock before appending.
            await navigator.locks.request(
              `corelive-category-replay.${userId}`,
              async () => {
                if (Number(slot.read() ?? '0') >= receipt.id || stopped) return
                await rescueCategoryDraft(
                  receipt.sourceId,
                  receipt.destinationId,
                  true,
                )
                if (stopped) return
                await navigator.locks.request(
                  'corelive-category-draft-rescue',
                  () => {
                    if (getLocalStorageAvailability() !== 'ok')
                      throw new Error('Draft cursor could not be saved')
                    const key = `corelive.category-changes.${userId}`
                    // Direct persistence must throw on quota failure; a memory-only cursor is not an acknowledgement.
                    localStorage.setItem(key, String(receipt.id))
                    if (localStorage.getItem(key) !== String(receipt.id))
                      throw new Error('Draft cursor was not durably saved')
                    retireCategoryDraftRescueReceipts(receipt.sourceId)
                  },
                )
              },
            )
          }
          rescuing = false
          if (!response.hasMore) break
        }
        if (!stopped) {
          // An empty deletion page can still contain remote category creates/renames, which also need refreshing.
          await invalidateCategoryViews(queryClient)
          toast.dismiss('category-cross-host-rescue')
        }
      } catch {
        // Transient background network failures retry quietly; storage/rescue failures need an explicit action.
        if (!stopped && rescuing)
          toast.error(
            'Could not refresh moved writing. Your local drafts are kept.',
            {
              id: 'category-cross-host-rescue',
              action: {
                label: 'Retry',
                onClick: (event) => {
                  // Keep Retry available through repeated failures; successful replay dismisses it.
                  event.preventDefault()
                  void refresh()
                },
              },
              duration: Infinity,
            },
          )
      } finally {
        progress.running = false
      }
    }
    const wake = () => {
      void refresh()
    }
    const interval = window.setInterval(wake, 15_000)
    window.addEventListener('focus', wake)
    document.addEventListener('visibilitychange', wake)
    wake()
    return () => {
      stopped = true
      window.clearInterval(interval)
      window.removeEventListener('focus', wake)
      document.removeEventListener('visibilitychange', wake)
    }
  }, [isLoaded, isSignedIn, userId, queryClient])
  return null
}
