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
  let mockApiBridge
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

    mockApiBridge = {
      getTodoById: vi.fn(),
      createTodo: vi.fn(),
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
      mockApiBridge,
      mockNotificationManager,
      mockApp, // Pass the mocked app as 4th parameter for dependency injection
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

    it('opens the create form in the browser pre-filled from the deep link', async () => {
      // Arrange: a `corelive://create?title=...&description=...` deep link.

      // Act
      await deepLinkManager.handleCreateAction({
        title: 'New Task',
        description: 'Task description',
      })

      // Assert: the create form opens in the web app, pre-filled. No task is
      // created here — the user confirms in the browser — so a deep link never
      // mutates the database.
      expect(mockShell.openExternal).toHaveBeenCalledWith(
        'https://corelive.app/home?create=true&title=New+Task&description=Task+description',
      )
      expect(mockApiBridge.createTodo).not.toHaveBeenCalled()
    })

    it('opens the empty create form in the browser when no fields are provided', async () => {
      // Arrange: a bare `corelive://create` deep link (no params).

      // Act
      await deepLinkManager.handleCreateAction({})

      // Assert: still opens the create form, just without pre-fill.
      expect(mockShell.openExternal).toHaveBeenCalledWith(
        'https://corelive.app/home?create=true',
      )
      expect(mockApiBridge.createTodo).not.toHaveBeenCalled()
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

    it('surfaces the Floating front door (restoreFromTray) when a deep link arrives', () => {
      // T18: the main window is retired, so every deep-link "show the app" path
      // delegates to restoreFromTray — the Floating navigator is the front door.
      deepLinkManager.ensureWindowVisible()

      expect(mockWindowManager.restoreFromTray).toHaveBeenCalled()
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
