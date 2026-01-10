// Comprehensive Electron API type definitions

interface ElectronAuthUser {
  /**
   * Clerk user identifier. Required by the Electron main process to hydrate the
   * Prisma-backed user session.
   */
  clerkId: string
  /** Optional denormalised email address for UI-only display */
  email?: string | null
  /** Optional denormalised name for UI-only display */
  name?: string | null
}

interface ElectronAPI {
  // Event handling
  on: (
    channel: string,
    callback: (event: any, ...args: any[]) => void,
  ) => () => void
  removeListener: (channel: string, callback: Function) => void
  removeAllListeners: (channel: string) => void

  // Todo operations
  todos?: {
    getTodos: (options?: any) => Promise<any>
    getTodoById: (id: string | number) => Promise<any>
    createTodo: (todoData: any) => Promise<any>
    updateTodo: (id: string | number, updates: any) => Promise<any>
    deleteTodo: (id: string | number) => Promise<void>
    toggleTodo: (id: string | number) => Promise<any>
    clearCompleted: () => Promise<{ deletedCount: number }>
  }

  // Window operations
  window?: {
    minimize: () => Promise<void>
    close: () => Promise<void>
    toggleFloatingNavigator: () => Promise<void>
    showFloatingNavigator: () => Promise<void>
    hideFloatingNavigator: () => Promise<void>
    getBounds?: () => any
    setBounds?: (bounds: any) => void
    isMinimized?: () => boolean
    isMaximized?: () => boolean
    isFullScreen?: () => boolean
    isVisible?: () => boolean
    isAlwaysOnTop?: () => boolean
    focus?: () => void
    show?: () => void
    hide?: () => void
    restore?: () => void
    maximize?: () => void
    unmaximize?: () => void
    setFullScreen?: (flag: boolean) => void
    setAlwaysOnTop?: (flag: boolean) => void
    moveToDisplay?: (displayIndex: number) => void
  }

  // System integration
  system?: {
    showNotification: (
      title: string,
      body: string,
      options?: any,
    ) => Promise<void>
    updateTrayMenu: (tasks: any[]) => Promise<void>
    setTrayTooltip: (text: string) => Promise<void>
    setTrayIconState: (state: string) => Promise<boolean>
  }

  // Menu management
  menu?: {
    triggerAction: (action: string) => Promise<void>
  }

  // Notifications
  notifications?: {
    show: (title: string, body: string, options?: any) => Promise<void>
    getPreferences: () => Promise<any>
    updatePreferences: (preferences: any) => Promise<any>
    clearAll: () => Promise<void>
    clear: (tag: string) => Promise<void>
    isEnabled: () => Promise<boolean>
    getActiveCount: () => Promise<number>
  }

  // Keyboard shortcuts
  shortcuts?: {
    getRegistered: () => Promise<any>
    getDefaults: () => Promise<any>
    update: (shortcuts: any) => Promise<any>
    register: (accelerator: string, id: string) => Promise<boolean>
    unregister: (id: string) => Promise<boolean>
    isRegistered: (accelerator: string) => Promise<boolean>
    enable: () => Promise<boolean>
    disable: () => Promise<boolean>
    getStats: () => Promise<any>
  }

  // Authentication
  auth?: {
    getUser: () => Promise<any>
    setUser: (user: ElectronAuthUser) => Promise<any>
    logout: () => Promise<boolean>
    isAuthenticated: () => Promise<boolean>
    syncFromWeb: (authData: any) => Promise<boolean>
  }

  // OAuth (browser-based OAuth for providers that block WebView)
  oauth?: {
    /**
     * Start OAuth flow in system browser.
     * Used for providers like Google that block WebView authentication.
     */
    start: (
      provider: 'google' | 'github' | 'apple',
    ) => Promise<{ success: boolean; state?: string; error?: string }>
    /** Get list of supported OAuth providers */
    getSupportedProviders: () => Promise<string[]>
    /** Cancel pending OAuth flow */
    cancel: (state?: string | null) => Promise<boolean>
    /** Register callback for OAuth success */
    onSuccess: (callback: (data: { user?: any }) => void) => () => void
    /** Register callback for OAuth error */
    onError: (callback: (data: { error: string }) => void) => () => void
    /** Register callback for OAuth code exchange (used by web app) */
    onCompleteExchange: (
      callback: (data: {
        code: string
        verifier: string
        provider: string
      }) => void,
    ) => () => void
    /**
     * Register callback for Clerk sign-in token from browser OAuth.
     * This token allows the WebView to create its own Clerk session
     * using signIn.create({ strategy: 'ticket', ticket: token }).
     */
    onSignInToken: (
      callback: (data: { token: string; provider: string }) => void,
    ) => () => void
  }

  // Configuration
  config?: {
    get: (path: string, defaultValue?: any) => Promise<any>
    set: (path: string, value: any) => Promise<boolean>
    getAll: () => Promise<any>
    getSection: (section: string) => Promise<any>
    update: (updates: any) => Promise<boolean>
    reset: () => Promise<boolean>
    resetSection: (section: string) => Promise<boolean>
    validate: () => Promise<{ isValid: boolean; errors: string[] }>
    export: (filePath: string) => Promise<boolean>
    import: (filePath: string) => Promise<boolean>
    backup: () => Promise<string | null>
    getPaths: () => Promise<any>
    save: () => boolean
    load: () => any
  }

  // Window state
  windowState?: {
    get: (windowType: string) => Promise<any>
    set: (windowType: string, properties: any) => Promise<boolean>
    reset: (windowType: string) => Promise<boolean>
    getStats: () => Promise<any>
    moveToDisplay: (windowType: string, displayId: number) => Promise<boolean>
    snapToEdge: (windowType: string, edge: string) => Promise<boolean>
    getDisplay: (windowType: string) => Promise<any>
    getAllDisplays: () => Promise<any[]>
  }

  // App information
  app?: {
    getVersion: () => Promise<string>
    quit: () => Promise<void>
  }

  // Deep linking
  deepLink?: {
    generateUrl: (
      action: string,
      params?: Record<string, any>,
    ) => Promise<string | null>
    getExamples: () => Promise<Record<string, string>>
    handleUrl: (url: string) => Promise<boolean>
  }

  // Error handling
  errorHandling?: {
    getStats: () => Promise<any>
    performHealthCheck: () => Promise<any>
    resetStats: () => Promise<boolean>
  }

  // Display management
  display?: {
    getAllDisplays?: () => any[]
    getPrimaryDisplay?: () => any
    getDisplayMatching?: (rect: any) => any
  }

  // Test utilities (for testing only)
  tray?: {
    click?: () => void
  }
  test?: {
    simulateError?: (type: string) => void
    getTestData?: () => any
    resetTestState?: () => void
    clearErrors?: () => void
  }
}

declare global {
  interface Window {
    electronAPI?: ElectronAPI
    electronEnv?: {
      isElectron: boolean
      platform: string
      arch: string
      versions: {
        electron: string
        node: string
        chrome: string
      }
    }
  }
}

export type { ElectronAPI }
export type { ElectronAuthUser }
