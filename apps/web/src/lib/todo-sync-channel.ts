const TODO_SYNC_CHANNEL_NAME = 'corelive-todo-sync'
const TODO_SYNC_EVENT_TYPE = 'todo-sync'

type TodoSyncMessage = Readonly<{ type: typeof TODO_SYNC_EVENT_TYPE }>

/**
 * Checks whether the runtime supports BroadcastChannel-based sync.
 * @returns
 * - `true` when BroadcastChannel is available in a browser context
 * - `false` when BroadcastChannel is unavailable
 * @example
 * isTodoSyncSupported() // => true
 */
const isTodoSyncSupported = (): boolean => {
  return (
    typeof window !== 'undefined' && typeof BroadcastChannel !== 'undefined'
  )
}

/**
 * Creates a BroadcastChannel for cross-window todo synchronization.
 * @returns
 * - A BroadcastChannel instance when supported
 * - `null` when BroadcastChannel is unavailable
 * @example
 * const channel = createTodoSyncChannel()
 * channel?.postMessage({ type: 'todo-sync' })
 */
const createTodoSyncChannel = (): BroadcastChannel | null => {
  if (!isTodoSyncSupported()) {
    return null
  }

  return new BroadcastChannel(TODO_SYNC_CHANNEL_NAME)
}

/**
 * Determines whether an incoming message is a todo sync event.
 * @param data - Unknown payload received from BroadcastChannel.
 * @returns
 * - `true` when the payload matches a todo sync message
 * - `false` when the payload is unrelated or malformed
 * @example
 * isTodoSyncMessage({ type: 'todo-sync' }) // => true
 */
const isTodoSyncMessage = (data: unknown): data is TodoSyncMessage => {
  if (typeof data !== 'object' || data === null) {
    return false
  }

  return (data as TodoSyncMessage).type === TODO_SYNC_EVENT_TYPE
}

/**
 * Broadcasts a todo sync event to other windows or tabs.
 * @returns
 * - `true` when the event was broadcast
 * - `false` when BroadcastChannel is unavailable
 * @example
 * broadcastTodoSync() // => true
 */
export const broadcastTodoSync = (): boolean => {
  const channel = createTodoSyncChannel()
  if (!channel) {
    return false
  }

  channel.postMessage({ type: TODO_SYNC_EVENT_TYPE } satisfies TodoSyncMessage)
  channel.close()
  return true
}

/**
 * Subscribes to todo sync events from other windows or tabs.
 * @param onSync - Callback invoked when a todo sync message is received.
 * @returns
 * - Cleanup function that removes the listener and closes the channel
 * @example
 * const cleanup = subscribeToTodoSync(() => console.log('sync'))
 * cleanup()
 */
export const subscribeToTodoSync = (onSync: () => void): (() => void) => {
  const channel = createTodoSyncChannel()
  if (!channel) {
    return () => {}
  }

  const handleMessage = (event: MessageEvent) => {
    if (isTodoSyncMessage(event.data)) {
      onSync()
    }
  }

  channel.addEventListener('message', handleMessage)

  return () => {
    channel.removeEventListener('message', handleMessage)
    channel.close()
  }
}
