# Design Document

## Overview

This design outlines the architecture for integrating Electron desktop functionality into the existing Next.js TODO application. The solution leverages modern Electron security practices with contextBridge and preload scripts, while maintaining compatibility with the existing ORPC API and Prisma database infrastructure. The design emphasizes security, performance, and user experience through a dual-window architecture with system tray integration.

## Architecture

### High-Level Architecture

The desktop application follows Electron's secure two-process architecture:

```
┌─────────────────────────────────────────────────────────────┐
│                    Main Process (Node.js)                   │
│  ┌─────────────────┐  ┌──────────────────┐  ┌─────────────┐ │
│  │ Window Manager  │  │  System Tray     │  │ IPC Handler │ │
│  │                 │  │  Integration     │  │             │ │
│  └─────────────────┘  └──────────────────┘  └─────────────┘ │
└─────────────────────────────────────────────────────────────┘
                              │
                    ┌─────────┴─────────┐
                    │                   │
┌───────────────────▼─────┐   ┌─────────▼──────────────┐
│   Main Window           │   │  Floating Navigator    │
│  (Renderer Process)     │   │  (Renderer Process)    │
│                         │   │                        │
│  ┌─────────────────────┐│   │ ┌────────────────────┐ │
│  │   Next.js App       ││   │ │  Compact TODO UI   │ │
│  │   (Full Interface)  ││   │ │  (Quick Actions)   │ │
│  └─────────────────────┘│   │ └────────────────────┘ │
│                         │   │                        │
│  ┌─────────────────────┐│   │ ┌────────────────────┐ │
│  │   Preload Script    ││   │ │   Preload Script   │ │
│  │   (Security Bridge)││   │ │   (Security Bridge)│ │
│  └─────────────────────┘│   │ └────────────────────┘ │
└─────────────────────────┘   └────────────────────────┘
```

### Process Communication

- **Main Process**: Manages application lifecycle, window creation, system tray, and native OS integration
- **Renderer Processes**: Run the Next.js application and floating navigator UI
- **Preload Scripts**: Provide secure communication bridges using contextBridge API
- **IPC Channels**: Handle secure message passing between processes

## Components and Interfaces

### 1. Main Process Components

#### Window Manager

```typescript
interface WindowManager {
  createMainWindow(): BrowserWindow
  createFloatingNavigator(): BrowserWindow
  toggleFloatingNavigator(): void
  restoreFromTray(): void
  minimizeToTray(): void
}
```

#### System Tray Manager

```typescript
interface SystemTrayManager {
  createTray(): Tray
  updateTrayMenu(tasks: TodoTask[]): void
  showNotification(message: string): void
  handleTrayClick(): void
}
```

#### IPC Handler

```typescript
interface IPCHandler {
  setupMainWindowChannels(): void
  setupFloatingNavigatorChannels(): void
  handleTodoOperations(operation: string, data: any): Promise<any>
  handleWindowOperations(operation: string, data: any): void
}
```

### 2. Preload Script Interface

#### Secure API Bridge

```typescript
interface ElectronAPI {
  // Todo operations
  todos: {
    getTodos(): Promise<TodoTask[]>
    createTodo(todo: CreateTodoInput): Promise<TodoTask>
    updateTodo(id: string, updates: UpdateTodoInput): Promise<TodoTask>
    deleteTodo(id: string): Promise<void>
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
```

### 3. Floating Navigator Component

#### Compact UI Interface

```typescript
interface FloatingNavigatorProps {
  tasks: TodoTask[]
  onTaskToggle: (id: string) => void
  onTaskCreate: (title: string) => void
  onTaskEdit: (id: string, title: string) => void
  onTaskDelete: (id: string) => void
}

interface FloatingNavigatorState {
  isVisible: boolean
  position: { x: number; y: number }
  isAlwaysOnTop: boolean
  isCompactMode: boolean
}
```

## Data Models

### Configuration Model

```typescript
interface ElectronConfig {
  window: {
    main: {
      width: number
      height: number
      minWidth: number
      minHeight: number
      rememberPosition: boolean
    }
    floating: {
      width: number
      height: number
      alwaysOnTop: boolean
      resizable: boolean
      frame: boolean
    }
  }

  tray: {
    enabled: boolean
    minimizeToTray: boolean
    startMinimized: boolean
  }

  shortcuts: {
    toggleFloating: string
    newTask: string
    focusSearch: string
  }

  notifications: {
    enabled: boolean
    taskCreated: boolean
    taskCompleted: boolean
  }
}
```

### Window State Model

```typescript
interface WindowState {
  bounds: {
    x: number
    y: number
    width: number
    height: number
  }
  isMaximized: boolean
  isFullScreen: boolean
  displayId: number
}
```

## Error Handling

### 1. Process Communication Errors

- **IPC Channel Failures**: Implement retry logic with exponential backoff
- **Preload Script Errors**: Graceful degradation to basic functionality
- **Window Creation Failures**: Fallback to default window configurations

### 2. API Integration Errors

- **ORPC Connection Issues**: Show offline mode with local caching
- **Authentication Failures**: Redirect to login with error messaging
- **Database Connection Problems**: Queue operations for retry when connection restored

### 3. System Integration Errors

- **Tray Icon Failures**: Continue without tray functionality
- **Notification Permission Denied**: Disable notifications gracefully
- **Shortcut Registration Conflicts**: Use alternative key combinations

### Error Recovery Strategy

```typescript
interface ErrorRecoveryStrategy {
  retryAttempts: number
  backoffMultiplier: number
  fallbackBehavior: 'graceful' | 'restart' | 'notify'
  userNotification: boolean
}
```

## Testing Strategy

### 1. Unit Testing

- **Main Process Logic**: Test window management, tray operations, IPC handlers
- **Preload Scripts**: Test API exposure and security boundaries
- **Renderer Components**: Test floating navigator UI components

### 2. Integration Testing

- **Process Communication**: Test IPC message flow between main and renderer
- **API Integration**: Test ORPC client functionality within Electron context
- **System Integration**: Test tray, notifications, and shortcuts

### 3. End-to-End Testing

- **User Workflows**: Test complete task management flows
- **Window Management**: Test minimize/restore, floating navigator toggle
- **Cross-Platform**: Test on Windows, macOS, and Linux

### 4. Security Testing

- **Context Isolation**: Verify renderer processes cannot access Node.js directly
- **Preload Script Validation**: Test that only whitelisted APIs are exposed
- **IPC Channel Security**: Verify channel validation and sanitization

### Testing Tools

- **Spectron**: For Electron-specific E2E testing
- **Vitest**: For unit testing main process and preload scripts (already configured in project)
- **React Testing Library**: For floating navigator component testing
- **Playwright**: For testing the Next.js application within Electron

## Security Considerations

### 1. Process Isolation

- Enable context isolation in all renderer processes
- Disable node integration in renderer processes
- Use preload scripts with contextBridge for secure API exposure

### 2. IPC Security

- Implement channel whitelisting in preload scripts
- Validate all IPC message data
- Use structured data validation for API calls

### 3. Content Security Policy

```typescript
const cspPolicy = {
  'default-src': "'self'",
  'script-src': "'self' 'unsafe-inline'",
  'style-src': "'self' 'unsafe-inline'",
  'img-src': "'self' data: https:",
  'connect-src': "'self' http://localhost:* ws://localhost:*",
}
```

### 4. Update Security

- Implement secure auto-updater with signature verification
- Use HTTPS for all update communications
- Validate update packages before installation

## Performance Optimizations

### 1. Window Management

- Implement lazy loading for floating navigator
- Use window hiding instead of destruction for better performance
- Implement window state persistence to reduce startup time

### 2. Memory Management

- Implement proper cleanup for IPC listeners
- Use weak references where appropriate
- Monitor and limit renderer process memory usage

### 3. Startup Optimization

- Defer non-critical initialization
- Use background loading for heavy resources
- Implement splash screen for perceived performance

### 4. Resource Optimization

- Bundle optimization for Electron distribution
- Asset compression and caching
- Minimize main process blocking operations
