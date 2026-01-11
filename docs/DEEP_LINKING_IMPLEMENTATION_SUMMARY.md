# Deep Linking Implementation Summary

## Overview

Successfully implemented deep linking and URL scheme support for the CoreLive TODO Electron application. The implementation allows users to open specific tasks, create new tasks, navigate to views, and perform searches directly from external applications using the custom `corelive://` URL scheme.

## Features Implemented

### 1. Custom URL Scheme Registration

- **Protocol**: `corelive://`
- **Platform**: macOS only
- **Automatic registration**: App registers as default handler for the protocol

### 2. URL Scheme Patterns

The following URL patterns are supported:

#### Task Operations

- `corelive://task/123` - Open specific task by ID
- `corelive://task?id=123&priority=high` - Open task with parameters

#### Task Creation

- `corelive://create` - Open create task dialog
- `corelive://create?title=New%20Task&description=Description` - Create task with pre-filled data

#### Navigation

- `corelive://view/completed` - Navigate to completed tasks view
- `corelive://view/home?filter=recent` - Navigate with parameters

#### Search

- `corelive://search?query=important&filter=pending` - Search tasks

### 3. macOS Configuration

- Info.plist configuration for URL scheme handling
- Proper app bundle association
- Uses `open-url` event for handling deep links

> **Note:** This app only supports macOS.

### 4. Single Instance Handling

- Prevents multiple app instances
- Focuses existing window when opened via URL
- Proper command-line argument processing

### 5. Security Features

- URL validation and sanitization
- Parameter encoding/decoding
- Error handling for malformed URLs
- Secure IPC communication

## Implementation Details

### Core Components

#### 1. DeepLinkManager (`electron/DeepLinkManager.cjs`)

- Main deep linking logic
- URL parsing and routing
- Platform-specific protocol registration
- Event handling for second instance

#### 2. Main Process Integration (`electron/main.cjs`)

- Single instance lock
- Deep link manager initialization
- IPC handler setup
- Event listener registration

#### 3. Preload Script Updates (`electron/preload.cjs`)

- Secure API exposure to renderer
- Deep linking IPC channels
- Event listener management

#### 4. React Hook (`src/hooks/useElectronDeepLink.ts`)

- React integration for deep link events
- Event handling utilities
- URL generation helpers

#### 5. TypeScript Definitions (`src/types/electron.d.ts`)

- Type definitions for deep linking APIs
- IntelliSense support

### Configuration Files

#### 1. Electron Builder (`electron-builder.json`)

- Protocol registration for macOS
- macOS-specific configurations (Info.plist, app bundle)

### API Interface

#### Renderer Process APIs

```typescript
window.electronAPI.deepLink = {
  generateUrl(action: string, params?: Record<string, any>): Promise<string | null>
  getExamples(): Promise<Record<string, string>>
  handleUrl(url: string): Promise<boolean>
}
```

#### Event Listeners

- `deep-link-focus-task` - Task focus events
- `deep-link-create-task` - Task creation events
- `deep-link-task-created` - Task created confirmation
- `deep-link-navigate` - Navigation events
- `deep-link-search` - Search events

## Testing

### 1. Unit Tests (`electron/__tests__/deep-link-manager.test.mjs`)

- URL parsing validation
- Action routing tests
- Error handling verification
- Mock-based testing

### 2. Integration Tests (`e2e/deep-linking.spec.ts`)

- End-to-end deep linking functionality
- Protocol registration verification
- URL generation and handling
- Event listener setup

### 3. Manual Testing

- Cross-platform URL scheme registration
- External application integration
- Browser-to-app navigation

## Usage Examples

### From External Applications

#### Command Line

```bash
# Open specific task
open "corelive://task/123"

# Create new task
open "corelive://create?title=Meeting%20Notes&priority=high"

# Search tasks
open "corelive://search?query=urgent"
```

#### From Web Applications

```javascript
// Create deep link
const deepLink = 'corelive://create?title=' + encodeURIComponent('New Task')
window.location.href = deepLink
```

#### From Other Desktop Apps

```javascript
// Electron app integration
const { shell } = require('electron')
shell.openExternal('corelive://task/123')
```

### From Within the App

#### Generate URLs

```typescript
const taskUrl = await window.electronAPI.deepLink.generateUrl('task', {
  id: '123',
})
// Returns: "corelive://task?id=123"
```

#### Handle Events

```typescript
useElectronDeepLink({
  onTaskFocus: (task, params) => {
    // log suppressed
  },
  onTaskCreate: (data) => {
    // log suppressed
  },
})
```

## Error Handling

### 1. URL Validation

- Protocol verification
- Parameter sanitization
- Malformed URL handling

### 2. API Error Recovery

- Graceful degradation when API calls fail
- Fallback to UI dialogs
- User notification of errors

### 3. System Integration Errors

- Protocol registration failures
- Permission denied scenarios
- Multiple instance handling

## Security Considerations

### 1. Input Validation

- All URL parameters are validated and sanitized
- XSS prevention through proper encoding
- SQL injection prevention in database queries

### 2. IPC Security

- Whitelisted channels only
- Parameter validation on all IPC calls
- Context isolation maintained

### 3. Protocol Security

- Custom protocol prevents external website abuse
- Local-only URL handling
- No sensitive data in URLs

## Performance Optimizations

### 1. Lazy Loading

- Deep link manager loaded when needed
- Minimal startup impact
- Background initialization

### 2. Efficient URL Parsing

- Native URL API usage
- Cached parsing results
- Minimal memory footprint

### 3. Event Handling

- Debounced event processing
- Efficient listener management
- Proper cleanup on app exit

## Future Enhancements

### 1. Advanced URL Patterns

- Nested task hierarchies
- Project-specific URLs
- Time-based task URLs

### 2. Integration Features

- Calendar app integration
- Email client deep links
- Browser extension support

### 3. Analytics

- Deep link usage tracking
- Popular URL patterns
- User behavior insights

## Conclusion

The deep linking implementation provides a robust foundation for external application integration while maintaining security and performance standards. The modular design allows for easy extension and maintenance, and comprehensive testing ensures reliability across all supported platforms.

The implementation successfully fulfills all requirements from task 12.3:

- ✅ Register custom URL scheme (corelive://)
- ✅ Implement URL parsing to open specific tasks or views
- ✅ Add support for creating tasks from external applications
- ✅ Handle multiple instances and focus existing window when opened via URL
- ✅ Meet requirements 1.1 and 4.1 from the specification
