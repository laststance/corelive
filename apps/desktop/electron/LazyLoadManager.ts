import type * as AutoUpdaterModule from './AutoUpdater'
import type * as MenuManagerModule from './MenuManager'
import type * as NotificationManagerModule from './NotificationManager'
import type * as ShortcutManagerModule from './ShortcutManager'
import type * as SystemIntegrationErrorHandlerModule from './SystemIntegrationErrorHandler'
import type * as SystemTrayManagerModule from './SystemTrayManager'

// These paths match the separate CommonJS entries emitted by electron-vite.
const componentFactories = {
  SystemTrayManager: () => {
    const module: typeof SystemTrayManagerModule = require('./SystemTrayManager.cjs')
    return module.SystemTrayManager
  },
  NotificationManager: () => {
    const module: typeof NotificationManagerModule = require('./NotificationManager.cjs')
    return module.NotificationManager
  },
  ShortcutManager: () => {
    const module: typeof ShortcutManagerModule = require('./ShortcutManager.cjs')
    return module.ShortcutManager
  },
  AutoUpdater: () => {
    const module: typeof AutoUpdaterModule = require('./AutoUpdater.cjs')
    return module.AutoUpdater
  },
  MenuManager: () => {
    const module: typeof MenuManagerModule = require('./MenuManager.cjs')
    return module.MenuManager
  },
  SystemIntegrationErrorHandler: () => {
    const module: typeof SystemIntegrationErrorHandlerModule = require('./SystemIntegrationErrorHandler.cjs')
    return module.SystemIntegrationErrorHandler
  },
}

type ComponentName = keyof typeof componentFactories
type ComponentConstructor<Name extends ComponentName> = ReturnType<
  (typeof componentFactories)[Name]
>

// Keep constructor identity even when {@link MemoryProfiler} clears require.cache.
const loadedComponents = new Map<
  ComponentName,
  ComponentConstructor<ComponentName>
>()

export const lazyLoadManager = {
  /**
   * Reuses deferred manager constructors when the main process initializes native integrations.
   * @param componentName - Manager to load from the compiled Electron bundle.
   * @returns The manager constructor associated with the requested name.
   * @example await lazyLoadManager.loadComponent('MenuManager')
   */
  async loadComponent<Name extends ComponentName>(
    componentName: Name,
  ): Promise<ComponentConstructor<Name>> {
    let component = loadedComponents.get(componentName)
    if (!component) {
      // A failed require is never cached, so a later initialization can retry.
      component = componentFactories[componentName]()
      loadedComponents.set(componentName, component)
    }
    // Map cannot express the name-to-constructor relationship enforced above.
    return component as ComponentConstructor<Name>
  },

  /**
   * Releases constructor references when the main process shuts down.
   * @returns Nothing.
   * @example lazyLoadManager.cleanup()
   */
  cleanup(): void {
    loadedComponents.clear()
  },
}
