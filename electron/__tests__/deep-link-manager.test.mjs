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
  openExternal: vi.fn(),
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
      },
    }

    // Create mock dependencies
    mockWindowManager = {
      hasMainWindow: vi.fn(() => true),
      getMainWindow: vi.fn(() => mockWindow), // Return the same instance every time
      restoreFromTray: vi.fn(),
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

    it('should handle task focus action', async () => {
      const mockTask = {
        id: '123',
        title: 'Test Task',
        completed: false,
      }

      mockApiBridge.getTodoById.mockResolvedValue(mockTask)

      await deepLinkManager.handleTaskAction('/123', {})

      expect(mockApiBridge.getTodoById).toHaveBeenCalledWith('123')
      expect(
        mockWindowManager.getMainWindow().webContents.send,
      ).toHaveBeenCalledWith('deep-link-focus-task', {
        task: mockTask,
        params: {},
      })
      expect(mockNotificationManager.showNotification).toHaveBeenCalledWith(
        'Task Opened',
        'Opened task: Test Task',
        { type: 'info' },
      )
    })

    it('should handle task not found', async () => {
      mockApiBridge.getTodoById.mockResolvedValue(null)

      await deepLinkManager.handleTaskAction('/123', {})

      expect(mockNotificationManager.showNotification).toHaveBeenCalledWith(
        'Task Not Found',
        'Could not find task with ID: 123',
        { type: 'warning' },
      )
    })

    it('should handle API errors gracefully', async () => {
      mockApiBridge.getTodoById.mockRejectedValue(new Error('API Error'))

      await deepLinkManager.handleTaskAction('/123', {})

      expect(mockNotificationManager.showNotification).toHaveBeenCalledWith(
        'Error',
        'Failed to open task. Please try again.',
        { type: 'error' },
      )
    })
  })

  describe('create actions', () => {
    beforeEach(() => {
      deepLinkManager.initialize()
    })

    it('should create task from deep link', async () => {
      const mockTask = {
        id: '456',
        title: 'New Task',
        description: 'Task description',
        completed: false,
      }

      mockApiBridge.createTodo.mockResolvedValue(mockTask)

      await deepLinkManager.handleCreateAction({
        title: 'New Task',
        description: 'Task description',
      })

      expect(mockApiBridge.createTodo).toHaveBeenCalledWith({
        title: 'New Task',
        description: 'Task description',
      })
      expect(
        mockWindowManager.getMainWindow().webContents.send,
      ).toHaveBeenCalledWith('deep-link-task-created', { task: mockTask })
      expect(mockNotificationManager.showNotification).toHaveBeenCalledWith(
        'Task Created',
        'Created task: New Task',
        { type: 'success' },
      )
    })

    it('should handle create without title', async () => {
      await deepLinkManager.handleCreateAction({})

      expect(
        mockWindowManager.getMainWindow().webContents.send,
      ).toHaveBeenCalledWith('deep-link-create-task', {})
      expect(mockApiBridge.createTodo).not.toHaveBeenCalled()
    })

    it('should fallback to create dialog on API error', async () => {
      mockApiBridge.createTodo.mockRejectedValue(new Error('API Error'))

      await deepLinkManager.handleCreateAction({
        title: 'New Task',
      })

      expect(
        mockWindowManager.getMainWindow().webContents.send,
      ).toHaveBeenCalledWith('deep-link-create-task', {
        title: 'New Task',
        description: '',
        priority: undefined,
        dueDate: undefined,
      })
    })
  })

  describe('view actions', () => {
    beforeEach(() => {
      deepLinkManager.initialize()
    })

    it('should handle view navigation', async () => {
      await deepLinkManager.handleViewAction('/completed', { filter: 'recent' })

      expect(
        mockWindowManager.getMainWindow().webContents.send,
      ).toHaveBeenCalledWith('deep-link-navigate', {
        view: 'completed',
        params: { filter: 'recent' },
      })
      expect(mockNotificationManager.showNotification).toHaveBeenCalledWith(
        'View Opened',
        'Navigated to: completed',
        { type: 'info' },
      )
    })
  })

  describe('search actions', () => {
    beforeEach(() => {
      deepLinkManager.initialize()
    })

    it('should handle search action', async () => {
      await deepLinkManager.handleSearchAction({
        query: 'important',
        filter: 'pending',
      })

      expect(
        mockWindowManager.getMainWindow().webContents.send,
      ).toHaveBeenCalledWith('deep-link-search', {
        query: 'important',
        filter: 'pending',
      })
      expect(mockNotificationManager.showNotification).toHaveBeenCalledWith(
        'Search',
        'Searching for: important',
        { type: 'info' },
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

    it('should ensure window is visible', () => {
      const mockWindow = mockWindowManager.getMainWindow()
      mockWindow.isMinimized.mockReturnValue(true)
      mockWindow.isVisible.mockReturnValue(false)

      deepLinkManager.ensureWindowVisible()

      expect(mockWindow.restore).toHaveBeenCalled()
      expect(mockWindow.show).toHaveBeenCalled()
      expect(mockWindow.focus).toHaveBeenCalled()
    })

    it('should restore from tray when no main window', () => {
      mockWindowManager.hasMainWindow.mockReturnValue(false)

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
