# Collections

A collection is a view that manages an ordered set of content, presenting it in a customizable layout.

Collections are a great way to present content that's organized into a grid of items, like a set of photos or the products in a store. You can also use a collection to present items in a list or a table.

The system provides several types of collection views that you can use to display your data.

- [`UICollectionView`](/documentation/uikit/uicollectionview) is a view that manages an ordered collection of items and presents them in a customizable layout.
- [`UITableView`](/documentation/uikit/uitableview) is a view that presents data in a single column of rows.
- [`UIListContentView`](/documentation/uikit/uilistcontentview) is a view that presents data in a list format.

## Best practices

**Choose a layout that's appropriate for your content.** A grid layout is a good choice for displaying a large number of items that are all of the same type. A list or table layout is a good choice for displaying items that have different types of content, or for displaying items that need to be presented in a specific order.

**Use a consistent size for items in a grid.** When all the items in a grid have the same size, it's easier for people to scan the content and find what they're looking for.

**Use a consistent layout for items in a list or table.** When all the items in a list or table have the same layout, it's easier for people to scan the content and understand the relationship between the items.

**Provide a way for people to sort and filter the content in a collection.** When a collection has a lot of content, it can be difficult for people to find what they're looking for. Providing a way to sort and filter the content can make it easier for people to find what they need.

**Use a placeholder when a collection is empty.** When a collection is empty, it can be helpful to display a placeholder that tells people what they can do to add content to the collection.

## Platform considerations

_No additional considerations for tvOS, visionOS, or watchOS._

### iOS, iPadOS

In iOS and iPadOS, you can use a collection view to display a grid of items, a list of items, or a table of items.

### macOS

In a Mac app, you can use a collection view to display a grid of items, a list of items, or a table of items.

## Resources

#### Developer documentation

[`UICollectionView`](/documentation/uikit/uicollectionview) — UIKit
[`UITableView`](/documentation/uikit/uitableview) — UIKit
[`UIListContentView`](/documentation/uikit/uilistcontentview) — UIKit
[Lists](https://developer.apple.com/documentation/SwiftUI/List) — SwiftUI
[Grids](https://developer.apple.com/documentation/SwiftUI/Grid) — SwiftUI

#### Videos

[Modern collection views](https://developer.apple.com/videos/play/wwdc2020/10097)
[Lists in UICollectionView](https://developer.apple.com/videos/play/wwdc2020/10026)

---

_Source: [Apple Human Interface Guidelines - Collections](https://developer.apple.com/design/human-interface-guidelines/collections)_
