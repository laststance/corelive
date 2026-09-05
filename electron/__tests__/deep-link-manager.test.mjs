import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'

// Create mock objects that will be reused
const mockLog = {
  error: vi.fn((...args) => {
    // Console log to see what errors are happening
    if (args[1] instanceof Error) {
      console.error('[TEST]', args[0], args[1].message, args[1].stack)
    }
  }),
  warn: vi.fn(),
  info: vi.fn(),
  debug: vi.fn(),
}

const mockApp = {
  isDefaultProtocolClient: vi.fn(() => false),
  setAsDefaultProtocolClient: vi.fn(() => true),
  removeAsDefaultProtocolClient: vi.fn(() => true),
  on: vi.fn((_event, _callback) => {
    // Simulate proper event listener registration
    return undefined
  }),
  requestSingleInstanceLock: vi.fn(() => true),
}

const mockShell = {
  // openWebAppInBrowser awaits `.catch` on the result, so the mock must be thenable.
  openExternal: vi.fn(async () => Promise.resolve()),
}

// Mock modules using vi.doMock for better CommonJS support
vi.doMock('../logger.ts', () => ({
  log: mockLog,
}))

vi.doMock('electron', () => ({
  app: mockApp,
  shell: mockShell,
}))

describe('DeepLinkManager', () => {
  let DeepLinkManager
  let deepLinkManager
  let mockWindowManager
  let mockNotificationManager

  beforeEach(async () => {
    // Reset all mocks
    vi.clearAllMocks()

    // Create a consistent mock window instance that gets reused
    const mockWindow = {
      isMinimized: vi.fn(() => false),
      isVisible: vi.fn(() => true),
      restore: vi.fn(),
      show: vi.fn(),
      focus: vi.fn(),
      webContents: {
        send: vi.fn(),
        isDestroyed: vi.fn(() => false),
      },
    }

    // Create mock dependencies
    mockWindowManager = {
      hasMainWindow: vi.fn(() => true),
      getMainWindow: vi.fn(() => mockWindow), // Return the same instance every time
      restoreFromTray: vi.fn(),
      // Post-retirement deep links open the web app in the browser (T15).
      getWebAppOrigin: vi.fn(() => 'https://corelive.app'),
    }

    mockNotificationManager = {
      showNotification: vi.fn(),
    }

    // Clear module cache and reimport to get fresh mocked instance
    vi.resetModules()

    // Import DeepLinkManager using dynamic ESM import (works with CommonJS modules)
    // CommonJS module.exports becomes .default in ESM
    const module = await import('../DeepLinkManager.ts?t=' + Date.now())
    DeepLinkManager = module.default
    deepLinkManager = new DeepLinkManager(
      mockWindowManager,
      mockNotificationManager,
      mockApp, // Pass the mocked app as 3rd parameter for dependency injection
    )
  })

  afterEach(() => {
    if (deepLinkManager) {
      deepLinkManager.cleanup()
    }
  })

  describe('initialization', () => {
    it('should initialize deep linking correctly', () => {
      deepLinkManager.initialize()

      expect(mockApp.setAsDefaultProtocolClient).toHaveBeenCalledWith(
        'corelive',
      )
      // Note: 'open-url' listener is registered in main.cjs BEFORE app.whenReady()
      // for macOS early event handling. Only 'second-instance' is registered here.
      expect(mockApp.on).toHaveBeenCalledWith(
        'second-instance',
        expect.any(Function),
      )
      expect(deepLinkManager.isInitialized).toBe(true)
    })

    it('should not initialize twice', () => {
      deepLinkManager.initialize()
      deepLinkManager.initialize()

      expect(mockApp.setAsDefaultProtocolClient).toHaveBeenCalledTimes(1)
    })
  })

  describe('URL parsing', () => {
    beforeEach(() => {
      deepLinkManager.initialize()
    })

    it('should parse valid deep link URLs', () => {
      const url = 'corelive://task/123?priority=high'
      const parsed = deepLinkManager.parseDeepLinkUrl(url)

      expect(parsed).toEqual({
        action: 'task',
        path: '/123',
        params: { priority: 'high' },
        hash: '',
        originalUrl: 'corelive://task/123?priority=high',
      })
    })

    it('should return null for invalid URLs', () => {
      const url = 'https://example.com/task/123'
      const parsed = deepLinkManager.parseDeepLinkUrl(url)

      expect(parsed).toBeNull()
    })

    it('should handle URLs without parameters', () => {
      const url = 'corelive://view/completed'
      const parsed = deepLinkManager.parseDeepLinkUrl(url)

      expect(parsed).toEqual({
        action: 'view',
        path: '/completed',
        params: {},
        hash: '',
        originalUrl: 'corelive://view/completed',
      })
    })
  })

  describe('task actions', () => {
    beforeEach(() => {
      deepLinkManager.initialize()
    })

    it('opens the task in the browser at /home?focus=<id>', async () => {
      // Arrange: a `corelive://task/123` deep link (path `/123`, no params).

      // Act
      await deepLinkManager.handleTaskAction('/123', {})

      // Assert: the task surfaces in the web app, not a (now-gone) main renderer.
      expect(mockShell.openExternal).toHaveBeenCalledWith(
        'https://corelive.app/home?focus=123',
      )
    })

    it('percent-encodes an untrusted task id before opening the browser', async () => {
      // Arrange: a deep-link path id carrying URL-significant characters.

      // Act
      await deepLinkManager.handleTaskAction('/a b&c', {})

      // Assert: the id is encoded so it cannot break out of the query value.
      expect(mockShell.openExternal).toHaveBeenCalledWith(
        'https://corelive.app/home?focus=a%20b%26c',
      )
    })

    it('does nothing when the deep link carries no task id', async () => {
      // Arrange: empty path and no `id` param.

      // Act
      await deepLinkManager.handleTaskAction('/', {})

      // Assert: no browser is opened for an unaddressable task link.
      expect(mockShell.openExternal).not.toHaveBeenCalled()
    })
  })

  describe('create actions', () => {
    beforeEach(() => {
      deepLinkManager.initialize()
    })

    it('opens LiveEditor in the browser, never a Home page that cannot create tasks', async () => {
      // Arrange: a `corelive://create?title=...&description=...` deep link.

      // Act
      await deepLinkManager.handleCreateAction({
        title: 'New Task',
        description: 'Task description',
      })

      // Assert: LiveEditor opens — Home is a read-only dashboard, so routing
      // there would dead-end the user. Prefill fields are dropped because
      // LiveEditor is free text; the deep link never touches a database
      // (DeepLinkManager has no database bridge to call).
      expect(mockShell.openExternal).toHaveBeenCalledWith(
        'https://corelive.app/live-editor',
      )
    })

    it('opens LiveEditor in the browser when the deep link carries no fields', async () => {
      // Arrange: a bare `corelive://create` deep link (no params).

      // Act
      await deepLinkManager.handleCreateAction({})

      // Assert: same destination as the pre-filled case.
      expect(mockShell.openExternal).toHaveBeenCalledWith(
        'https://corelive.app/live-editor',
      )
    })
  })

  describe('view actions', () => {
    beforeEach(() => {
      deepLinkManager.initialize()
    })

    it('opens the view in the browser at /<view> with its params', async () => {
      // Arrange: a `corelive://view/completed?filter=recent` deep link.

      // Act
      await deepLinkManager.handleViewAction('/completed', { filter: 'recent' })

      // Assert: the view opens in the web app at the matching route.
      expect(mockShell.openExternal).toHaveBeenCalledWith(
        'https://corelive.app/completed?filter=recent',
      )
    })
  })

  describe('search actions', () => {
    beforeEach(() => {
      deepLinkManager.initialize()
    })

    it('opens search results in the browser at /home?search=<query>', async () => {
      // Arrange: a `corelive://search?query=important&filter=pending` deep link.

      // Act
      await deepLinkManager.handleSearchAction({
        query: 'important',
        filter: 'pending',
      })

      // Assert: search runs in the web app, not a (now-gone) main renderer.
      expect(mockShell.openExternal).toHaveBeenCalledWith(
        'https://corelive.app/home?search=important&filter=pending',
      )
    })
  })

  describe('URL generation', () => {
    beforeEach(() => {
      deepLinkManager.initialize()
    })

    it('should generate deep link URLs', () => {
      const url = deepLinkManager.generateDeepLink('task', { id: '123' })
      expect(url).toBe('corelive://task?id=123')
    })

    it('should handle URL encoding', () => {
      const url = deepLinkManager.generateDeepLink('create', {
        title: 'Task with spaces',
        description: 'Description & symbols',
      })
      expect(url).toBe(
        'corelive://create?title=Task+with+spaces&description=Description+%26+symbols',
      )
    })

    it('should provide example URLs', () => {
      const examples = deepLinkManager.getExampleUrls()

      expect(examples).toHaveProperty('openTask')
      expect(examples).toHaveProperty('createTask')
      expect(examples).toHaveProperty('searchTasks')
      expect(examples).toHaveProperty('openView')

      expect(examples.openTask).toMatch(/^corelive:\/\/task\//)
      expect(examples.createTask).toMatch(/^corelive:\/\/create\?/)
      expect(examples.searchTasks).toMatch(/^corelive:\/\/search\?/)
      expect(examples.openView).toMatch(/^corelive:\/\/view\//)
    })
  })

  describe('window management', () => {
    beforeEach(() => {
      deepLinkManager.initialize()
    })

    it('surfaces LiveEditor (restoreFromTray) when a view deep link arrives', async () => {
      // Arrange: the main window is retired, so every deep-link "show the app"
      // path delegates to restoreFromTray — LiveEditor (or the login window
      // while signed out) is the front door.

      // Act: the real open-url path.
      const handled = await deepLinkManager.handleDeepLink(
        'corelive://view/home',
      )

      // Assert
      expect(handled).toBe(true)
      expect(mockWindowManager.restoreFromTray).toHaveBeenCalledTimes(1)
    })

    it('does not surface LiveEditor before the OAuth callback ticket is delivered', async () => {
      // Arrange: the OAuth deep link arrives while the app is still signed out.
      // Surfacing LiveEditor first would load the protected route with the
      // pre-login session; OAuthManager shows the initiating login window
      // itself once the ticket validates.
      const mockOAuthManager = {
        handleOAuthCallback: vi.fn(async () => undefined),
      }
      deepLinkManager.setOAuthManager(mockOAuthManager)

      // Act: the real open-url path, not the handler in isolation.
      const handled = await deepLinkManager.handleDeepLink(
        'corelive://oauth/callback?code=abc&state=xyz',
      )

      // Assert: the ticket reached OAuthManager and nothing pre-surfaced LiveEditor.
      expect(handled).toBe(true)
      expect(mockOAuthManager.handleOAuthCallback).toHaveBeenCalledTimes(1)
      expect(mockWindowManager.restoreFromTray).not.toHaveBeenCalled()
    })

    it('surfaces the app on a plain second launch', () => {
      // Act: the user opens the app again while it is already running.
      deepLinkManager.handleSecondInstance(['/Applications/CoreLive.app'], '/')

      // Assert
      expect(mockWindowManager.restoreFromTray).toHaveBeenCalledTimes(1)
    })

    it('keeps LiveEditor hidden when a second launch carries the OAuth callback', async () => {
      // Arrange
      const mockOAuthManager = {
        handleOAuthCallback: vi.fn(async () => undefined),
      }
      deepLinkManager.setOAuthManager(mockOAuthManager)

      // Act: a protocol launch routed through the single-instance lock.
      deepLinkManager.handleSecondInstance(
        [
          '/Applications/CoreLive.app',
          'corelive://oauth/callback?code=abc&state=xyz',
        ],
        '/',
      )
      await vi.waitFor(() => {
        expect(mockOAuthManager.handleOAuthCallback).toHaveBeenCalledTimes(1)
      })

      // Assert: the ticket was delivered without a pre-login LiveEditor load.
      expect(mockWindowManager.restoreFromTray).not.toHaveBeenCalled()
    })
  })

  describe('cleanup', () => {
    it('should cleanup properly', () => {
      deepLinkManager.initialize()
      deepLinkManager.cleanup()

      expect(mockApp.removeAsDefaultProtocolClient).toHaveBeenCalledWith(
        'corelive',
      )
      expect(deepLinkManager.isInitialized).toBe(false)
    })
  })
})
