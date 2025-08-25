# Navigation

Navigation enables people to move through your app or game and find content or features they care about.

A logical, easy-to-follow navigation structure is essential to help people explore your app or game and find what they need. In many cases, it's a good idea to use a navigation pattern that people already understand, such as a tab bar, sidebar, or split view.

## Navigation styles

There are three main styles of navigation, each of which encourages different types of exploration.

### Hierarchical navigation

In hierarchical navigation, people navigate by making one choice per screen until they reach their destination. To navigate to another destination, they must retrace some of their steps — or start over from the beginning — and make different choices.

Settings and Mail use hierarchical navigation. In Settings, people can tap Accessibility to navigate to the Accessibility screen, and then tap Display & Text Size to navigate to the settings for display and text size. To get to Spoken Content settings, people need to return to the Accessibility screen and tap Spoken Content.

### Flat navigation

In flat navigation, people can switch between multiple content categories. Music and App Store use flat navigation to enable movement between categories like albums, artists, playlists, and radio.

### Content-driven or experience-driven navigation

In content-driven navigation, people navigate freely through content, or the experience defines the navigation. Books is content-driven, letting people move between bookmarks, notes, and pages. Games often use experience-driven navigation, such as moving through levels or worlds.

## Navigation patterns

Here are some common navigation patterns:

### Tab bar

A tab bar appears at the bottom of the screen in iOS, iPadOS, and watchOS, and provides access to different sections of an app. In macOS, a tab bar appears at the top of a window, and lets people switch between different views in the same window.

### Sidebar

A sidebar is a common navigation pattern in iPadOS and macOS. A sidebar can include multiple levels of hierarchy, and is often combined with a split view.

### Split view

A split view is a common navigation pattern in iPadOS and macOS. A split view presents two or more columns of content, with the leading column typically used for navigation.

### Page control

A page control is a common navigation pattern in iOS. A page control shows which page is currently being viewed, and can be tapped to navigate to a different page.

### Navigation bar

A navigation bar appears at the top of the screen in iOS and iPadOS, and provides a way to navigate back through a hierarchy of screens.

## Best practices

**Use a navigation pattern that matches the information structure of your app or game.** For example, if your app has multiple categories of content, a tab bar or sidebar might be a good choice. If your app has a hierarchical structure, a navigation bar might be a good choice.

**Make it easy for people to navigate to the main parts of your app.** People should be able to get to the main parts of your app from anywhere in the app.

**Make it easy for people to navigate back.** People should be able to get back to where they came from, without having to start over.

**Use standard navigation components.** Standard navigation components, like tab bars, sidebars, and navigation bars, are familiar to people and make it easy for them to navigate your app.

**Make sure your navigation is consistent.** Use the same navigation pattern throughout your app or game, so people don't have to learn different ways to navigate.

**Make sure your navigation is predictable.** People should be able to predict what will happen when they tap a navigation element.

**Make sure your navigation is discoverable.** People should be able to see how to navigate your app or game without having to search for navigation elements.

## Platform considerations

_No additional considerations for tvOS or watchOS._

### iOS, iPadOS

iOS and iPadOS apps often use a combination of navigation patterns, such as a tab bar for the main sections of the app, and a navigation bar for hierarchical navigation within each section.

### macOS

macOS apps often use a sidebar for navigation, with a split view to display content. The sidebar can include multiple levels of hierarchy, and can be collapsed to provide more space for content.

### visionOS

In visionOS, people expect to navigate between apps and content using familiar patterns, such as tapping and swiping. They also expect to be able to use eye tracking and hand gestures to interact with content.

## Resources

#### Related

[Tab bars](/design/human-interface-guidelines/tab-bars)
[Navigation bars](/design/human-interface-guidelines/navigation-bars)
[Sidebars](/design/human-interface-guidelines/sidebars)

#### Developer documentation

[`NavigationStack`](/documentation/SwiftUI/NavigationStack) — SwiftUI
[`NavigationSplitView`](/documentation/SwiftUI/NavigationSplitView) — SwiftUI
[`UINavigationController`](/documentation/UIKit/UINavigationController) — UIKit
[`UISplitViewController`](/documentation/UIKit/UISplitViewController) — UIKit

#### Videos

[Design app navigation](https://developer.apple.com/videos/play/wwdc2022/10001)
[The details of UI navigation](https://developer.apple.com/videos/play/wwdc2022/10001)

---

_Source: [Apple Human Interface Guidelines - Navigation](https://developer.apple.com/design/human-interface-guidelines/navigation)_
