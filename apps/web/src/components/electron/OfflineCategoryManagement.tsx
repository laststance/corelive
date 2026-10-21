'use client'

import { useUser } from '@clerk/nextjs'
import type {
  OfflineCategoryRequest,
  OfflineSettingsAPI,
} from '@corelive/desktop-contract/offline-editor-api'
import { useQuery } from '@tanstack/react-query'
import { useState } from 'react'
import { toast } from 'sonner'

import {
  CategoryCreateDialog,
  CategoryManageDialog,
} from '@/app/(main)/home/_components/CategoryManageDialog'
import { useIsElectron } from '@/components/auth/ElectronLoginForm'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from '@/components/ui/dialog'
import { useCycleEffect } from '@/hooks/use-cycle-effect'
import { orpc } from '@/lib/orpc/client-query'

/** Reuses existing online dialogs for native category requests, scoped to the verified Settings account.
 * A new category is selected only after main verifies it in the account's refreshed category list.
 * @example <OfflineCategoryManagement />
 */
export function OfflineCategoryManagement() {
  const isElectron = useIsElectron()
  const bridge = isElectron ? window.electronAPI?.offlineSettings : undefined
  if (bridge?.version !== 1) return null
  return <NativeCategoryDialogs bridge={bridge} />
}

/** Mounts authenticated category queries only when the current desktop exposes offline capabilities.
 * @example <NativeCategoryDialogs bridge={bridge} />
 */
function NativeCategoryDialogs({ bridge }: { bridge: OfflineSettingsAPI }) {
  const { user, isLoaded } = useUser()
  const owner = isLoaded ? user?.id : undefined
  const [dialog, setDialog] = useState<{
    owner: string
    request: OfflineCategoryRequest
  } | null>(null)
  const current = dialog?.owner === owner ? dialog?.request : null
  useCycleEffect(() => {
    if (!owner) return
    let stopped = false
    const consume = (): void => {
      void bridge
        .read(owner)
        .then(async (context) => {
          if (!context || stopped) return
          const request = await bridge.consumeCategoryRequest()
          if (request && request.generation === context.generation && !stopped)
            setDialog({ owner, request })
        })
        .catch(() => undefined)
    }
    const unsubscribe = bridge.onManageCategories(consume)
    const unsubscribeReady = bridge.onChanged(consume)
    consume()
    return (): void => {
      stopped = true
      unsubscribe()
      unsubscribeReady()
    }
  }, [bridge, owner])
  if (!owner) return null
  const close = (): void => {
    setDialog(null)
    void bridge.refreshCategories().catch(() => undefined)
  }
  return (
    <>
      <Button
        variant="outline"
        onClick={() =>
          void bridge
            .read(owner)
            .then((context) => {
              if (context)
                setDialog({
                  owner,
                  request: { action: 'manage', generation: context.generation },
                })
            })
            .catch(() => toast.error('Could not open category management'))
        }
      >
        Manage categories
      </Button>
      {current?.action === 'manage' && (
        <CategoryManageDialog
          open
          onOpenChange={(open) => {
            if (!open) close()
          }}
        />
      )}
      {current?.action === 'create' && (
        <CreateRequestedCategory
          request={current}
          owner={owner}
          bridge={bridge}
          onClose={close}
        />
      )}
    </>
  )
}

/** Loads the owned category list before showing the existing creation form.
 * @example <CreateRequestedCategory request={request} owner={owner} bridge={bridge} onClose={close} />
 */
function CreateRequestedCategory({
  request,
  owner,
  bridge,
  onClose,
}: {
  request: OfflineCategoryRequest
  owner: string
  bridge: OfflineSettingsAPI
  onClose: () => void
}) {
  const query = useQuery({
    ...orpc.category.list.queryOptions({}),
    enabled: true,
  })
  return (
    <>
      {' '}
      {!query.data && (
        <Dialog
          open
          onOpenChange={(open) => {
            if (!open) onClose()
          }}
        >
          <DialogContent>
            <DialogTitle>New category</DialogTitle>
            <DialogDescription>
              {query.isError
                ? 'Could not load categories. Reconnect and try again.'
                : 'Loading your categories…'}
            </DialogDescription>
            {query.isError && (
              <Button onClick={() => void query.refetch()}>Retry</Button>
            )}
          </DialogContent>
        </Dialog>
      )}
      {query.data && (
        <CategoryCreateDialog
          open
          categories={query.data?.categories ?? []}
          initialName={request.initialName ?? ''}
          onOpenChange={(open) => {
            if (!open) onClose()
          }}
          onCreated={(category) => {
            void bridge
              .categoryCreated(owner, request.generation, category.id)
              .then((accepted) => {
                if (!accepted)
                  toast.error(
                    'Category created. Select it after reconnecting LiveEditor.',
                  )
              })
              .catch(() =>
                toast.error(
                  'Category created. Select it after reconnecting LiveEditor.',
                ),
              )
            onClose()
          }}
        />
      )}
    </>
  )
}
