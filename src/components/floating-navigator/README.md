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

## Accessibility Features

The Floating Navigator is built with comprehensive accessibility support to ensure it's usable by everyone, following WCAG 2.1 AA guidelines.

### ARIA Labels and Roles

- **Application Role**: Main container uses `role="application"` with descriptive label "Floating Task Navigator"
- **Semantic Structure**: Proper heading hierarchy (h1 for "Quick Tasks", h2 for "Completed") and landmark roles (banner, main, sections)
- **List Structure**: Tasks organized in semantic lists with proper labels indicating count and status
- **Form Controls**: All inputs and buttons have descriptive labels and help text
- **Live Regions**: Screen reader announcements for dynamic content changes via `aria-live="polite"`

### Keyboard Navigation

- **Skip Links**: Quick navigation to main content areas with "Skip to task input"
- **Arrow Keys**: Navigate through tasks (↑/↓) with focus indicators
- **Spacebar**: Toggle task completion when task is focused
- **Enter**: Start editing tasks or create new tasks
- **Delete/Backspace**: Remove tasks when focused
- **Escape**: Cancel editing or return to input
- **Tab**: Standard tab navigation through interactive elements
- **Ctrl/Cmd + /**: Show keyboard shortcuts help

### Enhanced Keyboard Shortcuts

In addition to the basic shortcuts, the component supports:

- **Arrow Up/Down**: Navigate through task list with visual focus indicators
- **Spacebar**: Toggle task completion (when task focused)
- **Enter**: Edit task (when task focused) or create task (when input focused)
- **Delete/Backspace**: Remove focused task
- **Escape**: Return focus to new task input from anywhere

### Screen Reader Support

- **Descriptive Announcements**: Actions are announced with context (e.g., "Task 'Buy groceries' completed")
- **Status Updates**: Task creation, completion, and deletion are announced
- **Progress Information**: Task counts with proper pluralization ("2 pending tasks", "1 completed task")
- **Help Information**: Keyboard shortcuts and usage instructions available via Ctrl+/

### Focus Management

- **Visible Indicators**: High-contrast focus rings (`focus-visible:ring-2`) on all interactive elements
- **Logical Order**: Tab order follows visual layout
- **Focus Restoration**: Focus returns to appropriate elements after actions
- **Skip Navigation**: Skip links for efficient keyboard navigation
- **Focus Trapping**: Proper focus management during editing mode

### Visual Accessibility

- **High Contrast Mode**: Enhanced borders and outlines via `@media (prefers-contrast: high)`
- **Reduced Motion**: Respects user's motion preferences via `@media (prefers-reduced-motion: reduce)`
- **Scalable Text**: Supports browser zoom up to 200%
- **Color Independence**: Information not conveyed by color alone
- **Focus Indicators**: Clear visual indicators for keyboard navigation

### Accessibility Testing

The component includes comprehensive accessibility tests in `FloatingNavigator.accessibility.test.tsx`:

- **Automated Testing**: axe-core integration for WCAG compliance
- **Keyboard Testing**: All keyboard interactions and shortcuts
- **Screen Reader Testing**: ARIA labels, live regions, and announcements
- **Focus Management**: Focus indicators and restoration
- **High Contrast**: Visual accessibility in different modes

Run accessibility tests:

```bash
npm test -- --run src/components/floating-navigator/__tests__/FloatingNavigator.accessibility.test.tsx
```

### Screen Reader Compatibility

Tested and compatible with:

- **Windows**: NVDA, JAWS
- **macOS**: VoiceOver
- **Linux**: ORCA

### Accessibility Guidelines Compliance

- **WCAG 2.1 AA**: Meets all Level AA success criteria
- **Section 508**: Compliant with US federal accessibility standards
- **EN 301 549**: Meets European accessibility standards

### Usage Tips for Screen Reader Users

1. **Navigation**: Use Tab to move through controls, Arrow keys to navigate tasks
2. **Task Management**: Use Spacebar to toggle completion, Enter to edit, Delete to remove
3. **Quick Access**: Use Ctrl+N to quickly add new tasks
4. **Help**: Press Ctrl+/ to hear available keyboard shortcuts
5. **Context**: Each task announces its status and available actions

### Contributing Accessibility

When contributing to the Floating Navigator:

1. **Test with Keyboard**: Verify all functionality works with keyboard only
2. **Screen Reader Testing**: Test with at least one screen reader
3. **High Contrast**: Verify visibility in high contrast mode
4. **Automated Testing**: Run accessibility tests and ensure they pass
5. **Documentation**: Update accessibility documentation for new features

### Accessibility Resources

- [WCAG 2.1 Guidelines](https://www.w3.org/WAI/WCAG21/quickref/)
- [ARIA Authoring Practices](https://www.w3.org/WAI/ARIA/apg/)
- [WebAIM Screen Reader Testing](https://webaim.org/articles/screenreader_testing/)
- [Electron Accessibility](https://www.electronjs.org/docs/latest/tutorial/accessibility)
