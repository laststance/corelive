import type { QueryClient } from '@tanstack/react-query'

import type { CategoryDraftRescue } from '@/lib/live-editor/appendCategoryDraft'
import { orpc } from '@/lib/orpc/client-query'

const CATEGORY_SYNC_CHANNEL_NAME = 'corelive-category-sync'
const CATEGORY_SYNC_EVENT_TYPE = 'category-sync'
const CATEGORY_SYNC_SENDER_ID = crypto.randomUUID()

type CategorySyncMessage = Readonly<{
  type: typeof CATEGORY_SYNC_EVENT_TYPE
  draftCategoryId?: number
  draftRescue?: CategoryDraftRescue
  senderId?: string
}>

/**
 * Checks whether the runtime supports BroadcastChannel-based sync.
 * @returns true when BroadcastChannel is available in a browser context
 */
const isCategorySyncSupported = (): boolean => {
  return (
    typeof window !== 'undefined' && typeof BroadcastChannel !== 'undefined'
  )
}

/**
 * Creates a BroadcastChannel for cross-window category synchronization.
 * @returns A BroadcastChannel instance when supported, null otherwise
 */
const createCategorySyncChannel = (): BroadcastChannel | null => {
  if (!isCategorySyncSupported()) {
    return null
  }

  return new BroadcastChannel(CATEGORY_SYNC_CHANNEL_NAME)
}

/**
 * Determines whether an incoming message is a category sync event.
 * @param data - Unknown payload received from BroadcastChannel
 * @returns true when the payload matches a category sync message
 */
const isCategorySyncMessage = (data: unknown): data is CategorySyncMessage => {
  if (typeof data !== 'object' || data === null) {
    return false
  }

  return (
    'type' in data &&
    data.type === CATEGORY_SYNC_EVENT_TYPE &&
    (!('draftRescue' in data) || isCategoryDraftRescue(data.draftRescue)) &&
    (!('senderId' in data) || typeof data.senderId === 'string') &&
    (!('draftCategoryId' in data) ||
      (typeof data.draftCategoryId === 'number' &&
        Number.isInteger(data.draftCategoryId) &&
        data.draftCategoryId > 0))
  )
}

/** Validates local peer rescue evidence before {@link subscribeToCategorySync} forwards it.
 * @param value - Unknown BroadcastChannel payload.
 * @returns Whether immutable rescue fields are strings.
 * @example isCategoryDraftRescue({ receipt: 'source:1', baseText: 'existing', text: 'rescued' })
 */
function isCategoryDraftRescue(value: unknown): value is CategoryDraftRescue {
  return (
    typeof value === 'object' &&
    value !== null &&
    'receipt' in value &&
    typeof value.receipt === 'string' &&
    'baseText' in value &&
    typeof value.baseText === 'string' &&
    'text' in value &&
    typeof value.text === 'string'
  )
}

/**
 * Broadcasts a category sync event to other windows or tabs.
 * @returns true when the event was broadcast
 * @example
 * broadcastCategorySync() // => true
 */
export const broadcastCategorySync = (
  draftCategoryId?: number,
  draftRescue?: CategoryDraftRescue,
): boolean => {
  const channel = createCategorySyncChannel()
  if (!channel) {
    return false
  }

  channel.postMessage({
    type: CATEGORY_SYNC_EVENT_TYPE,
    senderId: CATEGORY_SYNC_SENDER_ID,
    ...(draftCategoryId === undefined ? {} : { draftCategoryId }),
    ...(draftRescue === undefined ? {} : { draftRescue }),
  } satisfies CategorySyncMessage)
  channel.close()
  return true
}

/**
 * Subscribes to category sync events from other windows or tabs.
 * @param onSync - Callback invoked when a category sync message is received
 * @returns Cleanup function that removes the listener and closes the channel
 * @example
 * const cleanup = subscribeToCategorySync(() => queryClient.invalidateQueries())
 * cleanup()
 */
export const subscribeToCategorySync = (
  onSync: (draftCategoryId?: number, draftRescue?: CategoryDraftRescue) => void,
): (() => void) => {
  const channel = createCategorySyncChannel()
  if (!channel) {
    return () => {}
  }

  const handleMessage = (event: MessageEvent) => {
    if (isCategorySyncMessage(event.data)) {
      // The deleting window already applied its append; only peers reconcile the payload.
      onSync(
        event.data.senderId === CATEGORY_SYNC_SENDER_ID
          ? undefined
          : event.data.draftCategoryId,
        event.data.senderId === CATEGORY_SYNC_SENDER_ID
          ? undefined
          : event.data.draftRescue,
      )
    }
  }

  channel.addEventListener('message', handleMessage)

  return () => {
    channel.removeEventListener('message', handleMessage)
    channel.close()
  }
}

/**
 * Refreshes every category-derived view after local mutations or same-context peer events.
 *
 * @returns Resolves after active category, completion and bootstrap queries reconcile.
 * @example
 * await invalidateCategoryViews(queryClient)
 */
export async function invalidateCategoryViews(
  queryClient: QueryClient,
): Promise<void> {
  await Promise.all([
    queryClient.invalidateQueries({ queryKey: orpc.category.list.key() }),
    queryClient.invalidateQueries({ queryKey: orpc.completed.key() }),
    queryClient.invalidateQueries({ queryKey: orpc.home.bootstrap.key() }),
  ])
}
