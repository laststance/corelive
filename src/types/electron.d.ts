// Electron API type definitions
export interface TodoTask {
  id: string
  title: string
  completed: boolean
  createdAt: string
  updatedAt: string
  userId: string
}

export interface CreateTodoInput {
  title: string
}

export interface UpdateTodoInput {
  title?: string
  completed?: boolean
}

export interface NotificationPreferences {
  enabled: boolean
  taskCreated: boolean
  taskCompleted: boolean
  taskUpdated: boolean
  taskDeleted: boolean
  sound: boolean
}

export interface ShortcutStats {
  totalRegistered: number
  isEnabled: boolean
  platform: string
  shortcuts: Record<string, string>
}

export interface User {
  id: string
  email?: string
  name?: string
}

export interface AuthData {
  userId: string
  email?: string
  name?: string
  sessionId?: string
}

export interface ElectronAPI {
  // Todo operations
  todos: {
    getTodos(): Promise<TodoTask[]>
    createTodo(todo: CreateTodoInput): Promise<TodoTask>
    updateTodo(id: string, updates: UpdateTodoInput): Promise<TodoTask>
    deleteTodo(id: string): Promise<void>
  }

  // Authentication operations
  auth: {
    getUser(): Promise<User | null>
    setUser(user: User): Promise<User>
    logout(): Promise<{ success: boolean }>
    isAuthenticated(): Promise<boolean>
    syncFromWeb(authData: AuthData): Promise<{ success: boolean }>
  }

  // Window operations
  window: {
    minimize(): void
    close(): void
    toggleFloatingNavigator(): void
    setAlwaysOnTop(flag: boolean): void
  }

  // System integration
  system: {
    showNotification(title: string, body: string): void
    setTrayTooltip(text: string): void
  }

  // Notification management
  notifications: {
    show(title: string, body: string, options?: any): Promise<void>
    getPreferences(): Promise<NotificationPreferences | null>
    updatePreferences(
      preferences: Partial<NotificationPreferences>,
    ): Promise<NotificationPreferences | null>
    clearAll(): Promise<void>
    clear(tag: string): Promise<void>
    isEnabled(): Promise<boolean>
    getActiveCount(): Promise<number>
  }

  // Keyboard shortcut management
  shortcuts: {
    getRegistered(): Promise<Record<string, string>>
    getDefaults(): Promise<Record<string, string>>
    update(shortcuts: Record<string, string>): Promise<boolean>
    register(accelerator: string, id: string): Promise<boolean>
    unregister(id: string): Promise<boolean>
    isRegistered(accelerator: string): Promise<boolean>
    enable(): Promise<boolean>
    disable(): Promise<boolean>
    getStats(): Promise<ShortcutStats | null>
  }

  // Event listeners
  on(channel: string, callback: Function): void
  removeListener(channel: string, callback: Function): void
}

declare global {
  interface Window {
    electronAPI?: ElectronAPI
    Clerk?: any // Keep existing Clerk types
  }
}

export {}
