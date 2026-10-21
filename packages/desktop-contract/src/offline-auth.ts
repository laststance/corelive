/** A single main-issued challenge; generation invalidates replies after account changes. */
export interface OfflineAuthRequest {
  requestId: string
  generation: number
  expectedAccountId: string | null
}

/** Credentials travel only through the broker IPC response and main-process memory. */
export type OfflineAuthResult = OfflineAuthRequest &
  (
    | { status: 'ready'; accountId: string; token: string }
    | { status: 'signed-out' | 'unavailable' }
  )

/** Deliberately excludes notes, settings, filesystem, navigation and arbitrary networking. */
export interface OfflineAuthBridge {
  ready: () => Promise<OfflineAuthRequest | null>
  respond: (result: OfflineAuthResult) => Promise<boolean>
  onRequest: (callback: (request: OfflineAuthRequest) => void) => () => void
}

declare global {
  interface Window {
    coreliveOfflineAuth?: OfflineAuthBridge
  }
}
