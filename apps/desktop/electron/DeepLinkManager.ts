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

import {
  COMPLETED_JOURNAL_SEARCH_MAX_LENGTH,
  DEEP_LINK_PROTOCOL,
} from '@corelive/desktop-contract/constants'
import {
  CompletedJournalSearchSchema,
  isCompletedJournalFilterSupported,
} from '@corelive/desktop-contract/journal-search'
import type { App, MessageBoxOptions } from 'electron'
import { app as electronApp, dialog } from 'electron'

import { log } from './logger'
import { MCP_BACKGROUND_SWITCH } from './mcp/protocol'
import type { NotificationManager } from './NotificationManager'
import type { OAuthManager } from './OAuthManager'
import { claimDefaultProtocolClient } from './utils/claimDefaultProtocolClient'
import { openDashboardInBrowser } from './utils/openDashboardInBrowser'
import type { WindowManager } from './WindowManager'

// ============================================================================
// Type Definitions
// ============================================================================

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

/**
 * Resolves a decoded search link to a journal path or an explanation for the caller.
 * {@link DeepLinkManager.handleSearchAction} uses it before opening the browser.
 * @example resolveDashboardSearch({ query: 'notes' }) // => { path: '/home?search=notes&filter=completed#journal' }
 */
function resolveDashboardSearch(
  params: Record<string, string>,
): { path: string } | { message: string } {
  const parsed = CompletedJournalSearchSchema.safeParse(params.query ?? '')
  if (!parsed.success) {
    const message = parsed.error.issues.some(
      (issue) => issue.code === 'too_big',
    )
      ? `Shorten your search to ${COMPLETED_JOURNAL_SEARCH_MAX_LENGTH} characters or fewer.`
      : 'Use plain text without null characters.'
    return { message }
  }
  const { filter } = params
  if (!isCompletedJournalFilterSupported(filter)) {
    const message =
      filter === 'pending'
        ? 'Dashboard searches completed tasks. Open LiveEditor on your Mac for pending tasks.'
        : 'Choose the completed or all filter to search the Dashboard journal.'
    return { message }
  }
  const search = new URLSearchParams()
  if (parsed.data) search.set('search', parsed.data)
  // The query survives a sign-in redirect even when the browser omits the fragment.
  search.set('filter', filter ?? 'completed')
  return { path: `/home?${search}#journal` }
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
    notificationManager: NotificationManager | null,
    app: App | null = null,
  ) {
    this.windowManager = windowManager
    this.notificationManager = notificationManager
    this.app = app || electronApp
    this.protocol = DEEP_LINK_PROTOCOL
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
   * Registers the custom URL protocol with the operating system at boot. The
   * same claim is repeated by {@link OAuthManager.startOAuthFlow} right before
   * each browser handoff, since a dev Electron can steal the scheme mid-session.
   */
  registerProtocol(): void {
    claimDefaultProtocolClient(this.app, this.protocol)
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
    // A helper waking the lock holder must keep the agent's keyboard focus.
    if (commandLine.includes(MCP_BACKGROUND_SWITCH)) return
    const urlArg = commandLine.find((arg) =>
      arg.startsWith(`${this.protocol}://`),
    )
    // A deep link decides its own visibility in {@link handleDeepLink} (an OAuth
    // callback must not pre-surface LiveEditor); a plain relaunch just surfaces
    // LiveEditor, or the login window while signed out.
    if (urlArg) {
      this.handleDeepLink(urlArg)
      return
    }
    if (this.windowManager) {
      this.windowManager.restoreFromTray()
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

      // An OAuth callback must not pre-surface LiveEditor: that would load the
      // protected route with the pre-login session. OAuthManager shows the
      // initiating login window once the ticket validates, and LiveEditor only
      // loads after completeLogin.
      if (parsedUrl.action !== 'oauth') {
        this.ensureWindowVisible()
      }

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
        return this.handleSearchAction(params)

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

    // No ensureWindowVisible() on this path either: see the `oauth` gate in
    // {@link handleDeepLink}.
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
    await this.openInBrowser(`/home?focus=${encodeURIComponent(taskId)}`)
  }

  /**
   * Handle create task action — surfaces the desktop LiveEditor panel, the only
   * task-writing surface. It adds NO reveal of its own: {@link DeepLinkManager.handleDeepLink}
   * already calls {@link DeepLinkManager.ensureWindowVisible} once for every non-OAuth link, which
   * shows the panel (or the login window while signed out). NO task is created
   * (the user types it in LiveEditor). The link's `title`/`description`/
   * `priority`/`dueDate` params are intentionally dropped: LiveEditor is a
   * free-text editor with no fields to seed.
   *
   * @param _params - Pre-decoded URL parameters; unused, see above.
   */
  async handleCreateAction(_params: Record<string, string>): Promise<void> {
    log.debug('Create link: LiveEditor surfaced by ensureWindowVisible')
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

    await this.openInBrowser(`/${view}${query ? `?${query}` : ''}`)
  }

  /**
   * Opens a Dashboard journal search when the app receives a search deep link.
   * @param params - Decoded query text and optional completion filter.
   * @returns True after opening the search or explaining an unsupported request, false if the browser failed to open.
   * @example
   * await manager.handleSearchAction({ query: 'reading', filter: 'completed' })
   */
  async handleSearchAction(params: Record<string, string>): Promise<boolean> {
    const result = resolveDashboardSearch(params)
    // Guidance responds directly to the opened link, even with OS notifications disabled.
    if ('message' in result) {
      await this.showSearchGuidance(result.message)
      return true
    }
    const opened = await this.openInBrowser(result.path)
    if (!opened) {
      await this.showSearchGuidance(
        'The Dashboard could not open in your default browser. Open your browser and try the search link again.',
      )
    }
    return opened
  }

  /**
   * Explains a rejected search or browser launch failure, using the visible editor when available.
   * @example await this.showSearchGuidance('Choose the completed or all filter.')
   */
  private async showSearchGuidance(message: string): Promise<void> {
    const options: MessageBoxOptions = {
      type: 'info',
      title: 'Dashboard search',
      message,
      buttons: ['OK'],
    }
    const editor = this.windowManager.getLiveEditorWindow()
    // The LiveEditor can still be opening, or sign-in can be showing in its place.
    if (editor && !editor.isDestroyed() && editor.isVisible()) {
      await dialog.showMessageBox(editor, options)
    } else {
      await dialog.showMessageBox(options)
    }
  }

  /**
   * Opens Dashboard when a `corelive://` link targets a task, view or search.
   * @param dashboardPath - Leading-slash Dashboard path validated by
   *   {@link openDashboardInBrowser}.
   * @returns Whether {@link openDashboardInBrowser} handed the URL to the default browser.
   * @example
   * this.openInBrowser('/home?focus=42') // opens https://corelive.app/home?focus=42
   */
  private async openInBrowser(dashboardPath: string): Promise<boolean> {
    return openDashboardInBrowser(
      this.windowManager.getDashboardOrigin(),
      dashboardPath,
    )
  }

  /**
   * Surface the app for a non-OAuth deep link: LiveEditor, or the login window while signed out ({@link WindowManager.restoreFromTray} decides).
   * @returns Nothing; a no-op until the WindowManager exists.
   * @example
   * this.ensureWindowVisible()
   */
  ensureWindowVisible(): void {
    if (!this.windowManager) {
      return
    }

    // Main window retired (T18): surface LiveEditor, or the login window while
    // signed out (WindowManager decides).
    this.windowManager.restoreFromTray()
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
        filter: 'completed',
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
