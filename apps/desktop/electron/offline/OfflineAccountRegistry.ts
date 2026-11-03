import { randomUUID } from 'node:crypto'
import { join } from 'node:path'

import {
  DEVICE_REGISTRY_FILE_NAME,
  DeviceRegistrySchema,
  type DeviceRegistry,
} from '@corelive/desktop-contract/offline-workspace-v2'
import { z } from 'zod'

import { AtomicWorkspaceFile, WorkspaceFileError } from './AtomicWorkspaceFile'

/** Owner id of the v1 registry envelope; it also decides the v1 file name (read by the migration only). */
export const REGISTRY_OWNER_ID = 'corelive-account-registry-v1'

export const registrySchema = z.object({
  version: z.literal(1),
  deviceId: z.uuid(),
  activeAccountId: z.string().nullable(),
  lastAccountId: z.string().nullable(),
  preparedAccounts: z.array(z.string()),
})

/**
 * Reads and updates the v2 device registry: the attachment pointer (D2), the sign-out
 * journal (EA1) and the pending Connect prompt (EA2b).
 *
 * The registry is created by the v1 migration ({@link migrateWorkspaceV1}) before the first
 * controller start. A damaged registry file is surfaced as an error and never silently
 * replaced, because the attachment pointer decides which account may send.
 * @example const registry = new OfflineAccountRegistry(join(userData, 'offline'))
 */
export class OfflineAccountRegistry {
  private readonly file: AtomicWorkspaceFile<DeviceRegistry>

  constructor(directory: string) {
    this.file = new AtomicWorkspaceFile({
      directory: join(directory, 'registry'),
      ownerId: 'corelive-device-registry',
      fileName: DEVICE_REGISTRY_FILE_NAME,
      parse: DeviceRegistrySchema.parse,
    })
  }

  /** Reads startup authority; a missing registry is created, corruption is thrown.
   * @example const state = await registry.read()
   */
  async read(): Promise<DeviceRegistry> {
    try {
      return await this.file.read()
    } catch (error) {
      if (!(error instanceof WorkspaceFileError) || error.reason !== 'missing')
        throw error
      return this.file.initialize({
        version: 2,
        deviceId: randomUUID(),
        attachedAccountId: null,
        signOutPending: false,
        pendingConnect: null,
      })
    }
  }

  /** Durably applies a partial change; every attach, detach and journal write goes through here.
   * @param patch - Fields to overwrite.
   * @returns The registry as committed.
   * @example await registry.update({ attachedAccountId: null, signOutPending: true })
   */
  async update(patch: Partial<Omit<DeviceRegistry, 'version' | 'deviceId'>>) {
    return this.file.update((state) => ({ ...state, ...patch }))
  }
}
