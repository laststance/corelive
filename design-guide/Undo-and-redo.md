# Undo and redo

Undo and redo give people the freedom to explore and create without worrying about making mistakes.

When you support undo and redo in your app, people can easily reverse or restore changes they make. This capability encourages experimentation and helps people learn how to use your app by providing a safety net that lets them recover from mistakes.

## Best practices

**Support undo and redo for most user actions.** People expect to be able to undo and redo most of the actions they take in an app. At a minimum, support undo and redo for actions that change data, such as text edits, object creation, and deletion.

**Avoid supporting undo for actions that are difficult or impossible to reverse.** For example, if an action triggers a network request or a file save, it might be difficult or impossible to undo the action. In such cases, it's better to ask for confirmation before performing the action.

**Provide a clear way to undo and redo.** People expect to find undo and redo commands in the Edit menu, and they expect to be able to use keyboard shortcuts (Command-Z for undo and Command-Shift-Z for redo). On iOS and iPadOS, people also expect to be able to shake their device to undo.

**Make it clear what will be undone or redone.** People need to understand what will happen when they undo or redo an action. Use clear and concise language to describe the action that will be undone or redone.

**Group related actions into a single undoable action when appropriate.** If a single user action results in multiple changes, consider grouping those changes into a single undoable action. For example, if someone replaces a word with another word, the delete and insert actions could be grouped into a single replace action.

**Consider providing multiple levels of undo and redo.** People appreciate being able to undo or redo multiple actions. Consider providing a history of actions that people can navigate through.

## Platform considerations

_No additional considerations for tvOS, visionOS, or watchOS._

### iOS, iPadOS

In iOS and iPadOS, people can shake their device to undo. When they do, the system displays an alert that describes the action that will be undone and provides Undo and Cancel buttons.

**Consider providing an alternative to shake-to-undo.** The shake gesture might be difficult for some people to perform, and it might not be available in all contexts. Consider providing an alternative way to undo, such as a button or a gesture.

**Consider supporting the three-finger swipe gesture for undo and redo.** In iOS 13 and later, people can swipe left with three fingers to undo and swipe right with three fingers to redo. This gesture is especially useful on iPad, where the keyboard might not always be visible.

### macOS

In macOS, people expect to find undo and redo commands in the Edit menu, and they expect to be able to use keyboard shortcuts (Command-Z for undo and Command-Shift-Z for redo).

**Consider providing multiple levels of undo and redo.** In macOS, people expect to be able to undo and redo multiple actions. Consider providing a history of actions that people can navigate through.

**Consider providing a way to view the undo history.** In macOS, some apps provide a way to view the history of actions that can be undone or redone. This can help people understand what will happen when they undo or redo an action.

## Resources

#### Developer documentation

[`UndoManager`](/documentation/foundation/undomanager) — Foundation
[`NSUndoManager`](/documentation/appkit/nsundomanager) — AppKit

#### Videos

[Data Essentials in SwiftUI](https://developer.apple.com/videos/play/wwdc2020/10040)

---

_Source: [Apple Human Interface Guidelines - Undo and redo](https://developer.apple.com/design/human-interface-guidelines/undo-and-redo)_
