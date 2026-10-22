import { randomUUID } from 'node:crypto'
import { join } from 'node:path'

import { z } from 'zod'

import { AtomicWorkspaceFile, WorkspaceFileError } from './AtomicWorkspaceFile'

const registrySchema = z.object({
  version: z.literal(1),
  deviceId: z.uuid(),
  activeAccountId: z.string().nullable(),
  lastAccountId: z.string().nullable(),
  preparedAccounts: z.array(z.string()),
})
export type OfflineAccountRegistryState = z.infer<typeof registrySchema>

/**
 * Remembers only a durably prepared, explicitly active account for offline startup.
 * Logout clears the active pointer before Clerk sign-out proceeds. Workspace data
 * remains partitioned; switching to any unselected account requires online proof.
 * @example const registry = new OfflineAccountRegistry(userDataDirectory)
 */
export class OfflineAccountRegistry {
  private readonly file: AtomicWorkspaceFile<OfflineAccountRegistryState>

  constructor(directory: string) {
    this.file = new AtomicWorkspaceFile({
      directory: join(directory, 'registry'),
      ownerId: 'corelive-account-registry-v1',
      parse: registrySchema.parse,
    })
  }

  /** Reads startup authority; corruption is never interpreted as an unlocked empty registry.
   * @example const state = await registry.read()
   */
  async read(): Promise<OfflineAccountRegistryState> {
    try {
      return await this.file.read()
    } catch (error) {
      if (!(error instanceof WorkspaceFileError) || error.reason !== 'missing')
        throw error
      return this.file.initialize({
        version: 1,
        deviceId: randomUUID(),
        activeAccountId: null,
        lastAccountId: null,
        preparedAccounts: [],
      })
    }
  }

  /** Publishes offline readiness only after the verified account's workspace transaction committed.
   * @example await registry.activateVerified(accountId)
   */
  async activateVerified(
    accountId: string,
  ): Promise<OfflineAccountRegistryState> {
    try {
      return await this.file.update((state) => ({
        ...state,
        activeAccountId: accountId,
        lastAccountId: accountId,
        preparedAccounts: [...new Set([...state.preparedAccounts, accountId])],
      }))
    } catch (error) {
      if (
        !(error instanceof WorkspaceFileError) ||
        !['missing', 'invalid'].includes(error.reason)
      )
        throw error
      return this.file.recoverVerified({
        version: 1,
        deviceId: randomUUID(),
        activeAccountId: accountId,
        lastAccountId: accountId,
        preparedAccounts: [accountId],
      })
    }
  }

  /** Locks local startup before an explicit logout or account transition is acknowledged.
   * @example await registry.lock()
   */
  async lock(): Promise<OfflineAccountRegistryState> {
    return this.file.update((state) => ({ ...state, activeAccountId: null }))
  }
}
