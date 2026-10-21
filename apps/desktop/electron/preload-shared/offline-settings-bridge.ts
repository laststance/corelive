import type { OfflineSettingsAPI } from '@corelive/desktop-contract/offline-editor-api'

import { subscribeToMain } from '../ipc/subscribeToMain'
import { typedInvoke } from '../ipc/typedInvoke'

/** Creates the versioned preference capability; main restricts it to the Settings main frame.
 * @example const offlineSettings = createOfflineSettingsBridge()
 */
export function createOfflineSettingsBridge(): OfflineSettingsAPI {
  return {
    version: 1,
    read: async (accountId) => typedInvoke('offline-settings-read', accountId),
    prepare: async (accountId, generation, preferences) =>
      typedInvoke(
        'offline-settings-prepare',
        accountId,
        generation,
        preferences,
      ),
    patch: async (accountId, generation, command) =>
      typedInvoke('offline-settings-patch', accountId, generation, command),
    onChanged: (listener) =>
      subscribeToMain('offline-settings-changed', listener),
    onManageCategories: (listener) =>
      subscribeToMain('offline-settings-manage-categories', listener),
    consumeCategoryRequest: async () =>
      typedInvoke('offline-settings-category-request'),
    categoryCreated: async (accountId, generation, categoryId) =>
      typedInvoke(
        'offline-settings-category-created',
        accountId,
        generation,
        categoryId,
      ),
    refreshCategories: async (): Promise<void> =>
      typedInvoke('offline-settings-refresh-categories'),
  }
}
