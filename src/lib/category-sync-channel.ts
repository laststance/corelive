const CATEGORY_SYNC_CHANNEL_NAME = 'corelive-category-sync'
const CATEGORY_SYNC_EVENT_TYPE = 'category-sync'

type CategorySyncMessage = Readonly<{ type: typeof CATEGORY_SYNC_EVENT_TYPE }>

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

  return (data as CategorySyncMessage).type === CATEGORY_SYNC_EVENT_TYPE
}

/**
 * Broadcasts a category sync event to other windows or tabs.
 * @returns true when the event was broadcast
 * @example
 * broadcastCategorySync() // => true
 */
export const broadcastCategorySync = (): boolean => {
  const channel = createCategorySyncChannel()
  if (!channel) {
    return false
  }

  channel.postMessage({
    type: CATEGORY_SYNC_EVENT_TYPE,
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
export const subscribeToCategorySync = (onSync: () => void): (() => void) => {
  const channel = createCategorySyncChannel()
  if (!channel) {
    return () => {}
  }

  const handleMessage = (event: MessageEvent) => {
    if (isCategorySyncMessage(event.data)) {
      onSync()
    }
  }

  channel.addEventListener('message', handleMessage)

  return () => {
    channel.removeEventListener('message', handleMessage)
    channel.close()
  }
}
