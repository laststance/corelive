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
