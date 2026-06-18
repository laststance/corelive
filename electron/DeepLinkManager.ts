/**
 * @fileoverview Deep Link Manager for Custom URL Protocol Handling
 *
 * Enables the app to respond to custom URLs like:
 * - corelive://open/task/123
 * - corelive://create?text=Buy%20milk
 * - corelive://settings
 *
 * @module electron/DeepLinkManager
 */

import { URL } from 'url'

import type { App } from 'electron'
import { app as electronApp } from 'electron'

import { typedSend } from './ipc/typedSend'
import { log } from './logger'
import type { NotificationManager } from './NotificationManager'
import type { OAuthManager } from './OAuthManager'
import type { IPCEventChannel, IPCEventChannels } from './types/ipc'
import { openWebAppInBrowser } from './utils/openWebAppInBrowser'
import type { WindowManager } from './WindowManager'

// ============================================================================
// Type Definitions
// ============================================================================

/** API Bridge interface for task operations */
interface APIBridge {
  getTodoById(id: string): Promise<unknown>
  createTodo(data: unknown): Promise<unknown>
}

/** Parsed deep link URL */
interface ParsedDeepLink {
  action: string
  path: string
  params: Record<string, string>
  hash: string
  originalUrl: string
}

/** Example URLs structure */
interface ExampleUrls {
  openTask: string
  createTask: string
  searchTasks: string
  openView: string
}

// ============================================================================
// Deep Link Manager Class
// ============================================================================

/**
 * Manages custom URL protocol handling for the application.
 */
export class DeepLinkManager {
  /** Window manager reference */
  private windowManager: WindowManager

  /**
   * API bridge for task operations.
   *
   * VESTIGIAL after T15: main.ts already constructs this manager with `null`
   * (WebView architecture has no in-process task store), and T15 dropped the
   * last `getTodoById`/`createTodo` reads, so this field is now written-only.
   * Kept (with the `APIBridge` interface + constructor param) so T18 can delete
   * the whole apiBridge plumbing in one Phase-2 sweep without touching the
   * constructor call here first.
   */
  private apiBridge: APIBridge | null

  /** Notification manager reference */
  private notificationManager: NotificationManager | null

  /** Electron app reference */
  private app: App

  /** Custom URL scheme */
  private protocol: string

  /** Whether initialized */
  private _isInitialized: boolean

  /** URL received before app ready */
  private pendingUrl: string | null

  /** OAuth manager for OAuth callbacks */
  private oauthManager: OAuthManager | null

  /**
   * Creates a new DeepLinkManager instance.
   */
  constructor(
    windowManager: WindowManager,
    apiBridge: APIBridge | null,
    notificationManager: NotificationManager | null,
    app: App | null = null,
  ) {
    this.windowManager = windowManager
    this.apiBridge = apiBridge
    this.notificationManager = notificationManager
    this.app = app || electronApp
    this.protocol = 'corelive'
    this._isInitialized = false
    this.pendingUrl = null
    this.oauthManager = null

    this.handleDeepLink = this.handleDeepLink.bind(this)
    this.handleSecondInstance = this.handleSecondInstance.bind(this)
  }

  /**
   * Gets the initialization status of the deep link manager.
   *
   * @returns True if initialized, false otherwise
   */
  get isInitialized(): boolean {
    return this._isInitialized
  }

  /**
   * Checks if an OAuth manager is set.
   *
   * @returns True if OAuth manager is set, false otherwise
   */
  get hasOAuthManager(): boolean {
    return this.oauthManager !== null
  }

  /**
   * Sets the OAuth manager for handling OAuth callbacks.
   *
   * @param oauthManager - OAuth manager instance
   */
  setOAuthManager(oauthManager: OAuthManager): void {
    this.oauthManager = oauthManager
  }

  /**
   * Sets the notification manager for showing notifications.
   *
   * @param notificationManager - Notification manager instance
   */
  setNotificationManager(
    notificationManager: NotificationManager | null,
  ): void {
    this.notificationManager = notificationManager
  }

  /**
   * Initializes deep linking support for the application.
   */
  initialize(): void {
    if (this._isInitialized) {
      return
    }

    try {
      this.registerProtocol()
      this.setupSecondInstanceHandler()
      this.handleInitialUrl()

      this._isInitialized = true
      log.info('Deep linking initialized')
    } catch (error) {
      log.error('Failed to initialize deep linking:', error)
    }
  }

  /**
   * Registers the custom URL protocol with the operating system.
   */
  registerProtocol(): void {
    if (!this.app.isDefaultProtocolClient(this.protocol)) {
      const success = this.app.setAsDefaultProtocolClient(this.protocol)
      if (!success) {
        log.warn('Failed to register as default protocol client')
      }
    }
  }

  /**
   * Setup handler for second instance (Windows/Linux).
   */
  setupSecondInstanceHandler(): void {
    this.app.on('second-instance', (_event, commandLine, workingDirectory) => {
      this.handleSecondInstance(commandLine, workingDirectory)
    })
  }

  /**
   * Handle initial URL when app is launched.
   */
  handleInitialUrl(): void {
    // macOS uses the 'open-url' event for deep links
    // No command line argument parsing needed
  }

  /**
   * Handle second instance launch.
   */
  handleSecondInstance(commandLine: string[], _workingDirectory: string): void {
    if (this.windowManager && this.windowManager.hasMainWindow()) {
      const mainWindow = this.windowManager.getMainWindow()
      if (mainWindow?.isMinimized()) {
        mainWindow.restore()
      }
      mainWindow?.focus()
    } else {
      if (this.windowManager) {
        this.windowManager.restoreFromTray()
      }
    }

    const urlArg = commandLine.find((arg) =>
      arg.startsWith(`${this.protocol}://`),
    )
    if (urlArg) {
      this.handleDeepLink(urlArg)
    }
  }

  /**
   * Process pending URL after window is ready.
   */
  processPendingUrl(): void {
    if (this.pendingUrl) {
      this.handleDeepLink(this.pendingUrl)
      this.pendingUrl = null
    }
  }

  /**
   * Handle deep link URL.
   *
   * @param url - The deep link URL to process
   */
  async handleDeepLink(url: string): Promise<boolean> {
    try {
      const parsedUrl = this.parseDeepLinkUrl(url)
      if (!parsedUrl) {
        log.warn('Invalid deep link URL format')
        return false
      }

      this.ensureWindowVisible()

      const handled = await this.routeDeepLink(parsedUrl)
      return handled
    } catch (error) {
      log.error('Failed to handle deep link:', error)

      if (this.notificationManager) {
        this.notificationManager.showNotification(
          'Deep Link Error',
          'Failed to process the link. Please try again.',
          { type: 'error' },
        )
      }
      return false
    }
  }

  /**
   * Parse deep link URL into components.
   *
   * @param url - The URL to parse
   * @returns Parsed URL components or null if invalid
   */
  parseDeepLinkUrl(url: string): ParsedDeepLink | null {
    try {
      const parsedUrl = new URL(url)

      if (parsedUrl.protocol !== `${this.protocol}:`) {
        return null
      }

      const action = parsedUrl.hostname
      const path = parsedUrl.pathname
      const params = Object.fromEntries(parsedUrl.searchParams)

      return {
        action,
        path,
        params,
        hash: parsedUrl.hash,
        originalUrl: url,
      }
    } catch (error) {
      log.error('Failed to parse deep link URL:', error)
      return null
    }
  }

  /**
   * Route deep link to appropriate handler.
   *
   * @param parsedUrl - Parsed URL components
   */
  async routeDeepLink(parsedUrl: ParsedDeepLink): Promise<boolean> {
    const { action, path, params, originalUrl } = parsedUrl

    switch (action) {
      case 'oauth':
        await this.handleOAuthCallback(path, params, originalUrl)
        return true

      case 'task':
        await this.handleTaskAction(path, params)
        return true

      case 'create':
        await this.handleCreateAction(params)
        return true

      case 'view':
        await this.handleViewAction(path, params)
        return true

      case 'search':
        await this.handleSearchAction(params)
        return true

      default:
        log.warn(`Unknown deep link action: ${action}`)
        this.ensureWindowVisible()
        return false
    }
  }

  /**
   * Handle OAuth callback deep link.
   *
   * @param path - URL path
   * @param params - URL parameters
   * @param originalUrl - Original deep link URL
   */
  async handleOAuthCallback(
    path: string,
    params: Record<string, string>,
    originalUrl: string,
  ): Promise<void> {
    log.info('Received OAuth callback deep link', {
      path,
      hasCode: !!params.code,
      hasState: !!params.state,
    })

    this.ensureWindowVisible()

    if (!this.oauthManager) {
      log.error('OAuth manager not initialized')
      if (this.notificationManager) {
        this.notificationManager.showNotification(
          'Sign In Error',
          'OAuth handler not ready. Please try again.',
          { type: 'error' },
        )
      }
      return
    }

    if (path !== '/callback' && path !== 'callback') {
      log.warn(`Unknown OAuth path: ${path}`)
      return
    }

    try {
      const url = new URL(originalUrl)
      await this.oauthManager.handleOAuthCallback(url)
    } catch (error) {
      log.error('Failed to handle OAuth callback:', error)
      if (this.notificationManager) {
        this.notificationManager.showNotification(
          'Sign In Error',
          'Failed to complete sign-in. Please try again.',
          { type: 'error' },
        )
      }
    }
  }

  /**
   * Handle task-related actions.
   *
   * @param path - URL path
   * @param params - URL parameters
   */
  async handleTaskAction(
    path: string,
    params: Record<string, string>,
  ): Promise<void> {
    const taskId = path.replace('/', '') || params.id

    if (!taskId) {
      log.warn('Task action requires task ID')
      return
    }

    // Open the task in the browser — mirrors the renderer's default
    // `deep-link-focus-task` route (`/home?focus=<id>`). `taskId` is
    // percent-encoded because it arrives from the (untrusted) deep-link path,
    // unlike the renderer's trusted DB id.
    this.openInBrowser(`/home?focus=${encodeURIComponent(taskId)}`)
  }

  /**
   * Handle create task action.
   *
   * @param params - URL parameters
   */
  async handleCreateAction(params: Record<string, string>): Promise<void> {
    // Open the create form in the browser, pre-filled from the deep link —
    // mirrors the renderer's default `deep-link-create-task` route
    // (`/home?create=true&<prefill>`). NO task is created here (the user
    // confirms in the browser), so this stays a navigation, not a mutation;
    // `apiBridge.createTodo` was already a null no-op before T15. `params` are
    // pre-decoded by `parseDeepLinkUrl`, and `URLSearchParams` re-encodes them.
    const { title, description, priority, dueDate } = params

    const search = new URLSearchParams({ create: 'true' })
    if (title) search.set('title', title)
    if (description) search.set('description', description)
    if (priority) search.set('priority', priority)
    if (dueDate) search.set('dueDate', dueDate)

    this.openInBrowser(`/home?${search.toString()}`)
  }

  /**
   * Handle view action.
   *
   * @param path - URL path
   * @param params - URL parameters
   */
  async handleViewAction(
    path: string,
    params: Record<string, string>,
  ): Promise<void> {
    // Open the view in the browser — mirrors the renderer's default
    // `deep-link-navigate` route (`/<view>?<params>`). The leading slash keeps
    // the URL on-origin even for an attacker-crafted `view` segment.
    const view = path.replace('/', '') || params.view || 'home'
    const query = new URLSearchParams(params).toString()

    this.openInBrowser(`/${view}${query ? `?${query}` : ''}`)
  }

  /**
   * Handle search action.
   *
   * @param params - URL parameters
   */
  async handleSearchAction(params: Record<string, string>): Promise<void> {
    // Open search results in the browser — mirrors the renderer's default
    // `deep-link-search` route (`/home?search=<q>&filter=<f>`). `params` are
    // pre-decoded by `parseDeepLinkUrl`; `URLSearchParams` re-encodes them.
    const { query, filter } = params

    const search = new URLSearchParams()
    if (query) search.set('search', query)
    if (filter) search.set('filter', filter)

    this.openInBrowser(`/home?${search.toString()}`)
  }

  /**
   * Open a task-app path in the user's browser (T15). Deep links now route to
   * the web app — the full task UI is web-only after main retirement, so a
   * `corelive://` link surfaces the task / create / view / search there instead
   * of pushing IPC at a main renderer that no longer exists.
   * @param appPath - Leading-slash task-app path; the leading slash plus the
   *   fixed origin in `openWebAppInBrowser` keep the URL on-origin, so an
   *   attacker-crafted deep link cannot redirect off corelive.app.
   * @returns Nothing; `openWebAppInBrowser` logs and swallows browser failures.
   * @example
   * this.openInBrowser('/home?focus=42') // opens https://corelive.app/home?focus=42
   */
  private openInBrowser(appPath: string): void {
    openWebAppInBrowser(this.windowManager.getWebAppOrigin(), appPath)
  }

  /**
   * Ensure main window is visible and focused.
   */
  ensureWindowVisible(): void {
    if (!this.windowManager) {
      return
    }

    if (this.windowManager.hasMainWindow()) {
      const mainWindow = this.windowManager.getMainWindow()

      if (mainWindow?.isMinimized()) {
        mainWindow.restore()
      }

      if (mainWindow && !mainWindow.isVisible()) {
        mainWindow.show()
      }

      mainWindow?.focus()
    } else {
      this.windowManager.restoreFromTray()
    }
  }

  /**
   * Dispatch a typed event to the main renderer window.
   *
   * ORPHANED after T15: every deep-link handler now opens the browser
   * (`openInBrowser`) instead of sending to a renderer, so this method has no
   * callers. It is kept — together with its `deep-link-*` channel definitions
   * in `types/ipc` and the (already-unmounted) `useElectronDeepLink` renderer
   * hook — so T18/T19 can delete the whole main-renderer deep-link bridge in
   * one Phase-2 sweep rather than half-removing it here.
   *
   * @example
   *   this.sendToRenderer('deep-link-focus-task', { task, params })
   */
  sendToRenderer<C extends IPCEventChannel>(
    channel: C,
    ...payload: IPCEventChannels[C] extends void ? [] : [IPCEventChannels[C]]
  ): void {
    if (this.windowManager && this.windowManager.hasMainWindow()) {
      const mainWindow = this.windowManager.getMainWindow()
      if (mainWindow) {
        typedSend(mainWindow.webContents, channel, ...payload)
      }
    }
  }

  /**
   * Generate deep link URL.
   *
   * @param action - Action type
   * @param params - Parameters
   * @returns Deep link URL
   */
  generateDeepLink(
    action: string,
    params: Record<string, unknown> = {},
  ): string {
    const url = new URL(`${this.protocol}://${action}`)

    Object.entries(params).forEach(([key, value]) => {
      if (value !== undefined && value !== null) {
        url.searchParams.set(key, String(value))
      }
    })

    return url.toString()
  }

  /**
   * Get example deep link URLs.
   *
   * @returns Example URLs
   */
  getExampleUrls(): ExampleUrls {
    return {
      openTask: this.generateDeepLink('task/123'),
      createTask: this.generateDeepLink('create', {
        title: 'New Task',
        description: 'Task description',
      }),
      searchTasks: this.generateDeepLink('search', {
        query: 'important',
        filter: 'pending',
      }),
      openView: this.generateDeepLink('view/completed'),
    }
  }

  /**
   * Cleanup deep linking.
   */
  cleanup(): void {
    if (this._isInitialized) {
      this.app.removeAsDefaultProtocolClient(this.protocol)
      this._isInitialized = false
    }
  }
}

export default DeepLinkManager
