# Floating Navigator Component

The Floating Navigator is a compact, always-on-top window component designed for quick task management in the Electron desktop application.

## Features

- **Compact UI**: Optimized for small window sizes (300x400px default)
- **Always on Top**: Stays visible above other windows
- **Drag Support**: Window can be dragged by the header
- **Quick Actions**: Create, edit, complete, and delete tasks inline
- **Window Controls**: Minimize, close, toggle always-on-top, and focus main window
- **Keyboard Shortcuts**: Ctrl/Cmd+N to focus new task input
- **Real-time Updates**: Syncs with main application via IPC

## Components

### FloatingNavigator

The main UI component that renders the task list and controls.

**Props:**

- `todos: FloatingTodo[]` - Array of todo items
- `onTaskToggle: (id: string) => void` - Handler for task completion toggle
- `onTaskCreate: (title: string) => void` - Handler for new task creation
- `onTaskEdit: (id: string, title: string) => void` - Handler for task editing
- `onTaskDelete: (id: string) => void` - Handler for task deletion

### FloatingNavigatorContainer

Container component that handles data fetching and Electron API integration.

**Features:**

- Connects to Electron IPC via `floatingNavigatorAPI`
- Manages local state with optimistic updates
- Handles error states and loading
- Sets up event listeners for real-time updates

## Usage

### In Electron Main Process

The floating navigator window is created and managed by the `WindowManager`:

```javascript
// Create floating navigator window
windowManager.createFloatingNavigator()

// Toggle visibility
windowManager.toggleFloatingNavigator()
```

### In React Application

```tsx
import { FloatingNavigatorContainer } from '@/components/floating-navigator'

export default function FloatingNavigatorPage() {
  return (
    <div className="h-screen w-full overflow-hidden">
      <FloatingNavigatorContainer />
    </div>
  )
}
```

## Styling

The component uses:

- Tailwind CSS for styling
- Custom CSS for drag functionality (`floating-navigator.css`)
- Responsive design for small window sizes
- Custom scrollbar styling

## Keyboard Shortcuts

- **Ctrl/Cmd + N**: Focus new task input
- **Enter**: Save task (when creating or editing)
- **Escape**: Cancel editing

## Window Controls

- **External Link**: Focus main application window
- **Pin/Unpin**: Toggle always-on-top behavior
- **Minimize**: Minimize floating navigator
- **Close**: Hide floating navigator

## API Integration

The component integrates with Electron via the `floatingNavigatorAPI` exposed in the preload script:

```typescript
window.floatingNavigatorAPI.todos.getTodos()
window.floatingNavigatorAPI.todos.quickCreate(title)
window.floatingNavigatorAPI.todos.updateTodo(id, updates)
window.floatingNavigatorAPI.todos.deleteTodo(id)
window.floatingNavigatorAPI.window.minimize()
window.floatingNavigatorAPI.window.close()
```

## Testing

Tests are located in `__tests__/FloatingNavigator.test.tsx` and cover:

- Component rendering
- Task operations (create, edit, delete, toggle)
- Window controls
- Keyboard interactions
- Empty states

Run tests with:

```bash
npm test -- --run src/components/floating-navigator/__tests__/
```
