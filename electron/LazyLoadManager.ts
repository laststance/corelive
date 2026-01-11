/**
 * @fileoverview Lazy Loading Manager for Electron Components
 *
 * Manages on-demand loading of non-critical Electron components
 * to dramatically improve startup performance.
 *
 * Why lazy loading matters in Electron:
 * - Electron apps can be slow to start (loading Chromium + Node.js)
 * - Users expect desktop apps to launch quickly
 * - Many features aren't needed immediately at startup
 * - Loading everything upfront wastes memory and time
 *
 * Strategy:
 * - Load only essential components at startup (window, IPC)
 * - Defer heavy modules until actually needed
 * - Cache loaded modules to avoid re-loading
 * - Handle loading errors gracefully
 *
 * Performance impact:
 * - Can reduce startup time by 30-50%
 * - Lower initial memory footprint
 * - Better perceived performance
 *
 * @module electron/LazyLoadManager
 */

import { log } from './logger'
import { performanceOptimizer } from './performance-config'

// ============================================================================
// Type Definitions
// ============================================================================

/** Component factory function */
type ComponentFactory<T = unknown> = () => T

/** Component loading status */
interface ComponentStatus {
  name: string
  loaded: boolean
  loading: boolean
}

/** Loading status for all components */
export interface LoadingStatus {
  total: number
  loaded: number
  loading: number
  components: ComponentStatus[]
}

/** Loading priority levels */
export interface LoadingPriorities {
  /** Components loaded immediately */
  critical: string[]
  /** Components loaded after critical */
  high: string[]
  /** Components loaded in background after startup */
  medium: string[]
  /** Components loaded when needed */
  low: string[]
}

// ============================================================================
// Lazy Load Manager Class
// ============================================================================

/**
 * Orchestrates lazy loading of Electron components.
 *
 * Components are categorized by priority:
 * - Critical: Loaded immediately (WindowManager, API Bridge)
 * - Important: Loaded soon after startup (Menu, Shortcuts)
 * - Optional: Loaded on-demand (Tray, Notifications, Updates)
 *
 * This manager ensures:
 * - Components load only once (singleton pattern)
 * - Concurrent requests share the same loading promise
 * - Failed loads don't crash the app
 * - Loading metrics are tracked
 */
export class LazyLoadManager {
  /** Track loaded modules */
  private loadedComponents: Set<string>

  /** Prevent duplicate loads */
  private loadingPromises: Map<string, Promise<unknown>>

  /** Module loader functions */
  private componentFactories: Map<string, ComponentFactory>

  constructor() {
    this.loadedComponents = new Set()
    this.loadingPromises = new Map()
    this.componentFactories = new Map()

    // Define how to load each component
    this.registerComponentFactories()
  }

  /**
   * Register factories for lazy-loaded components.
   *
   * Note: With preserveModules enabled in electron-vite, each module is built as a separate file.
   * Since we're running from dist-electron/main/index.cjs, we can use relative paths
   * to require the compiled .cjs files in the same directory.
   *
   * Important: require() returns the module exports object, not the class directly.
   * We need to access the named export (e.g., .SystemTrayManager) or .default to get the class.
   */
  private registerComponentFactories(): void {
    // Files are in the same directory as index.cjs (dist-electron/main/)
    // So we can use relative paths like ./SystemIntegrationErrorHandler
    // Note: Each module exports both named and default exports, we use the named export

    // System Tray Manager - not critical for startup
    this.componentFactories.set('SystemTrayManager', () => {
      const mod = require('./SystemTrayManager.cjs')
      return mod.SystemTrayManager || mod.default
    })

    // Notification Manager - can be loaded when first notification is needed
    this.componentFactories.set('NotificationManager', () => {
      const mod = require('./NotificationManager.cjs')
      return mod.NotificationManager || mod.default
    })

    // Shortcut Manager - can be loaded after window is ready
    this.componentFactories.set('ShortcutManager', () => {
      const mod = require('./ShortcutManager.cjs')
      return mod.ShortcutManager || mod.default
    })

    // Auto Updater - not needed immediately
    this.componentFactories.set('AutoUpdater', () => {
      const mod = require('./AutoUpdater.cjs')
      return mod.AutoUpdater || mod.default
    })

    // Menu Manager - needed for application menu
    this.componentFactories.set('MenuManager', () => {
      const mod = require('./MenuManager.cjs')
      return mod.MenuManager || mod.default
    })

    // System Integration Error Handler - can be loaded when needed
    this.componentFactories.set('SystemIntegrationErrorHandler', () => {
      const mod = require('./SystemIntegrationErrorHandler.cjs')
      return mod.SystemIntegrationErrorHandler || mod.default
    })

    // Deep Link Manager - handles URL scheme registration and processing
    this.componentFactories.set('DeepLinkManager', () => {
      const mod = require('./DeepLinkManager.cjs')
      return mod.DeepLinkManager || mod.default
    })
  }

  /**
   * Load a component lazily.
   *
   * @param componentName - Name of the component to load
   * @returns The loaded component
   */
  async loadComponent<T = unknown>(componentName: string): Promise<T> {
    // Return immediately if already loaded
    if (this.loadedComponents.has(componentName)) {
      return this.getLoadedComponent<T>(componentName) as T
    }

    // Return existing promise if already loading
    if (this.loadingPromises.has(componentName)) {
      return this.loadingPromises.get(componentName) as Promise<T>
    }

    // Create loading promise
    const loadingPromise = this.createLoadingPromise<T>(componentName)
    this.loadingPromises.set(componentName, loadingPromise)

    try {
      const component = await loadingPromise
      this.loadedComponents.add(componentName)
      this.loadingPromises.delete(componentName)
      return component
    } catch (error) {
      this.loadingPromises.delete(componentName)
      throw error
    }
  }

  /**
   * Create a loading promise for a component.
   *
   * @param componentName - Name of the component
   * @returns Loading promise
   */
  private async createLoadingPromise<T>(componentName: string): Promise<T> {
    const factory = this.componentFactories.get(componentName)

    if (!factory) {
      throw new Error(`Unknown component: ${componentName}`)
    }

    return performanceOptimizer.lazyLoad<T>(
      componentName,
      factory as ComponentFactory<T>,
    )
  }

  /**
   * Get a loaded component (synchronous).
   *
   * @param componentName - Name of the component
   * @returns The loaded component or null
   */
  getLoadedComponent<T = unknown>(componentName: string): T | null {
    if (!this.loadedComponents.has(componentName)) {
      return null
    }

    // Access the lazyModules from performance optimizer
    // Note: This is accessing a private property for compatibility
    const optimizer = performanceOptimizer as unknown as {
      lazyModules: Map<string, unknown>
    }
    return (optimizer.lazyModules?.get(componentName) as T) ?? null
  }

  /**
   * Preload critical components.
   *
   * @param componentNames - Names of components to preload
   */
  async preloadCriticalComponents(componentNames: string[]): Promise<void> {
    const preloadPromises = componentNames.map(async (componentName) => {
      try {
        await this.loadComponent(componentName)
      } catch (error) {
        const errorMessage =
          error instanceof Error ? error.message : String(error)
        log.warn(`⚠️ Failed to preload ${componentName}:`, errorMessage)
      }
    })

    await Promise.allSettled(preloadPromises)
  }

  /**
   * Load components in background after startup.
   *
   * @param componentNames - Names of components to load
   */
  loadInBackground(componentNames: string[]): void {
    setImmediate(async () => {
      for (const componentName of componentNames) {
        try {
          await this.loadComponent(componentName)

          // Small delay between loads to prevent blocking
          await new Promise((resolve) => setTimeout(resolve, 100))
        } catch (error) {
          const errorMessage =
            error instanceof Error ? error.message : String(error)
          log.warn(
            `⚠️ Background load failed for ${componentName}:`,
            errorMessage,
          )
        }
      }
    })
  }

  /**
   * Check if a component is loaded.
   *
   * @param componentName - Name of the component
   * @returns True if loaded
   */
  isLoaded(componentName: string): boolean {
    return this.loadedComponents.has(componentName)
  }

  /**
   * Check if a component is currently loading.
   *
   * @param componentName - Name of the component
   * @returns True if loading
   */
  isLoading(componentName: string): boolean {
    return this.loadingPromises.has(componentName)
  }

  /**
   * Get loading status for all components.
   *
   * @returns Status object
   */
  getStatus(): LoadingStatus {
    const allComponents = Array.from(this.componentFactories.keys())

    return {
      total: allComponents.length,
      loaded: this.loadedComponents.size,
      loading: this.loadingPromises.size,
      components: allComponents.map((name) => ({
        name,
        loaded: this.isLoaded(name),
        loading: this.isLoading(name),
      })),
    }
  }

  /**
   * Cleanup all loaded components.
   */
  cleanup(): void {
    this.loadingPromises.clear()
    this.loadedComponents.clear()
  }
}

// ============================================================================
// Loading Priorities
// ============================================================================

/**
 * Component loading priorities.
 *
 * Note: Only components registered in LazyLoadManager are included here.
 * Critical components (WindowManager, ConfigManager, etc.) are loaded
 * eagerly in main.ts and are not lazily loaded.
 */
export const LOADING_PRIORITIES: LoadingPriorities = {
  // Critical components - loaded eagerly in main.ts, not via lazy loading
  critical: [],

  // High priority - load after app ready
  high: ['MenuManager'],

  // Medium priority - load in background after startup
  medium: ['SystemTrayManager', 'NotificationManager', 'ShortcutManager'],

  // Low priority - load when needed
  low: ['AutoUpdater', 'SystemIntegrationErrorHandler', 'DeepLinkManager'],
}

// ============================================================================
// Exports
// ============================================================================

/** Singleton instance */
export const lazyLoadManager = new LazyLoadManager()
