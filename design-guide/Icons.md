# Icons

_Updated: June 9, 2025 - Added a table of SF Symbols that represent common actions._

An effective icon is a graphic asset that expresses a single concept in ways people instantly understand.

Apps and games use a variety of simple icons to help people understand the items, actions, and modes they can choose. Unlike [app icons](/design/human-interface-guidelines/app-icons), which can use rich visual details like shading, texturing, and highlighting to evoke the app's personality, an _interface icon_ typically uses streamlined shapes and touches of color to communicate a straightforward idea.

You can design interface icons — also called _glyphs_ — or you can choose symbols from the SF Symbols app, using them as-is or customizing them to suit your needs. Both interface icons and symbols use black and clear colors to define their shapes; the system can apply other colors to the black areas in each image. For guidance, see [SF Symbols](/design/human-interface-guidelines/sf-symbols).

## Best practices

**Create a recognizable, highly simplified design.** Too many details can make an interface icon confusing or unreadable. Strive for a simple, universal design that most people will recognize quickly. In general, icons work best when they use familiar visual metaphors that are directly related to the actions they initiate or content they represent.

**Maintain visual consistency across all interface icons in your app.** Whether you use only custom icons or mix custom and system-provided ones, all interface icons in your app need to use a consistent size, level of detail, stroke thickness (or weight), and perspective. Depending on the visual weight of an icon, you may need to adjust its dimensions to ensure that it appears visually consistent with other icons.

**In general, match the weights of interface icons and adjacent text.** Unless you want to emphasize either the icons or the text, using the same weight for both gives your content a consistent appearance and level of emphasis.

**If necessary, add padding to a custom interface icon to achieve optical alignment.** Some icons — especially asymmetric ones — can look unbalanced when you center them geometrically instead of optically. Adjustments for optical centering are typically very small, but they can have a big impact on your app's appearance.

**Provide a selected-state version of an interface icon only if necessary.** You don't need to provide selected and unselected appearances for an icon that's used in standard system components such as toolbars, tab bars, and buttons. The system updates the visual appearance of the selected state automatically.

**Use inclusive images.** Consider how your icons can be understandable and welcoming to everyone. Prefer depicting gender-neutral human figures and avoid images that might be hard to recognize across different cultures or languages. For guidance, see [Inclusion](/design/human-interface-guidelines/inclusion).

**Include text in your design only when it's essential for conveying meaning.** For example, using a character in an interface icon that represents text formatting can be the most direct way to communicate the concept. If you need to display individual characters in your icon, be sure to localize them. If you need to suggest a passage of text, design an abstract representation of it, and include a flipped version of the icon to use when the context is right-to-left. For guidance, see [Right to left](/design/human-interface-guidelines/right-to-left).

**If you create a custom interface icon, use a vector format like PDF or SVG.** The system automatically scales a vector-based interface icon for high-resolution displays, so you don't need to provide high-resolution versions of it. In contrast, PNG — used for app icons and other images that include effects like shading, textures, and highlighting — doesn't support scaling, so you have to supply multiple versions for each PNG-based interface icon. Alternatively, you can create a custom SF Symbol and specify a scale that ensures the symbol's emphasis matches adjacent text.

**Provide alternative text labels for custom interface icons.** Alternative text labels — or accessibility descriptions — aren't visible, but they let VoiceOver audibly describe what's onscreen, simplifying navigation for people with visual disabilities. For guidance, see [VoiceOver](/design/human-interface-guidelines/voiceover).

**Avoid using replicas of Apple hardware products.** Hardware designs tend to change frequently and can make your interface icons and other content appear dated. If you must display Apple hardware, use only the images available in [Apple Design Resources](https://developer.apple.com/design/resources/) or the SF Symbols that represent various Apple products.

## Standard icons

For icons to represent common actions in [menus](/design/human-interface-guidelines/menus), [toolbars](/design/human-interface-guidelines/toolbars), [buttons](/design/human-interface-guidelines/buttons), and other places in interfaces across Apple platforms, you can use these [SF Symbols](/design/human-interface-guidelines/sf-symbols).

### Editing

| Action    | SF Symbol               |
| --------- | ----------------------- |
| Cut       | `scissors`              |
| Copy      | `document.on.document`  |
| Paste     | `document.on.clipboard` |
| Done      | `checkmark`             |
| Cancel    | `xmark`                 |
| Delete    | `trash`                 |
| Undo      | `arrow.uturn.backward`  |
| Redo      | `arrow.uturn.forward`   |
| Compose   | `square.and.pencil`     |
| Duplicate | `plus.square.on.square` |
| Rename    | `pencil`                |
| Move to   | `folder`                |
| Attach    | `paperclip`             |
| Add       | `plus`                  |
| More      | `ellipsis`              |

### Selection

| Action   | SF Symbol          |
| -------- | ------------------ |
| Select   | `checkmark.circle` |
| Deselect | `xmark`            |
| Delete   | `trash`            |

### Text formatting

| Action      | SF Symbol                |
| ----------- | ------------------------ |
| Superscript | `textformat.superscript` |
| Subscript   | `textformat.subscript`   |
| Bold        | `bold`                   |
| Italic      | `italic`                 |
| Underline   | `underline`              |
| Align Left  | `text.alignleft`         |
| Center      | `text.aligncenter`       |
| Justified   | `text.justify`           |
| Align Right | `text.alignright`        |

### Search

| Action | SF Symbol                         |
| ------ | --------------------------------- |
| Search | `magnifyingglass`                 |
| Find   | `text.page.badge.magnifyingglass` |
| Filter | `line.3.horizontal.decrease`      |

### Sharing and exporting

| Action | SF Symbol             |
| ------ | --------------------- |
| Share  | `square.and.arrow.up` |
| Print  | `printer`             |

### Users and accounts

| Action  | SF Symbol            |
| ------- | -------------------- |
| Account | `person.crop.circle` |

### Ratings

| Action  | SF Symbol         |
| ------- | ----------------- |
| Dislike | `hand.thumbsdown` |
| Like    | `hand.thumbsup`   |

### Layer ordering

| Action         | SF Symbol                          |
| -------------- | ---------------------------------- |
| Bring to Front | `square.3.layers.3d.top.filled`    |
| Send to Back   | `square.3.layers.3d.bottom.filled` |
| Bring Forward  | `square.2.layers.3d.top.filled`    |
| Send Backward  | `square.2.layers.3d.bottom.filled` |

### Other

| Action   | SF Symbol    |
| -------- | ------------ |
| Alarm    | `alarm`      |
| Archive  | `archivebox` |
| Calendar | `calendar`   |

## Platform considerations

_No additional considerations for iOS, iPadOS, tvOS, visionOS, or watchOS._

### macOS

#### Document icons

If your macOS app can use a custom document type, you can create a document icon to represent it. Traditionally, a document icon looks like a piece of paper with its top-right corner folded down. This distinctive appearance helps people distinguish documents from apps and other content, even when icon sizes are small.

If you don't supply a document icon for a file type you support, macOS creates one for you by compositing your app icon and the file's extension onto the canvas.

In some cases, it can make sense to create a set of document icons to represent a range of file types your app handles. For example, Xcode uses custom document icons to help people distinguish projects, AR objects, and Swift code files.

To create a custom document icon, you can supply any combination of background fill, center image, and text. The system layers, positions, and masks these elements as needed and composites them onto the familiar folded-corner icon shape.

[Apple Design Resources](https://developer.apple.com/design/resources/#macos-apps) provides a template you can use to create a custom background fill and center image for a document icon.

**Design simple images that clearly communicate the document type.** Whether you use a background fill, a center image, or both, prefer uncomplicated shapes and a reduced palette of distinct colors. Your document icon can display as small as 16x16 px, so you want to create designs that remain recognizable at every size.

**Consider reducing complexity in the small versions of your document icon.** Icon details that are clear in large versions can look blurry and be hard to recognize in small versions.

**Avoid placing important content in the top-right corner of your background fill.** The system automatically masks your image to fit the document icon shape and draws the white folded corner on top of the fill.

**Background fill sizes:**

- 512x512 px @1x, 1024x1024 px @2x
- 256x256 px @1x, 512x512 px @2x
- 128x128 px @1x, 256x256 px @2x
- 32x32 px @1x, 64x64 px @2x
- 16x16 px @1x, 32x32 px @2x

**Center image sizes:**

- 256x256 px @1x, 512x512 px @2x
- 128x128 px @1x, 256x256 px @2x
- 32x32 px @1x, 64x64 px @2x
- 16x16 px @1x, 32x32 px @2x

**Define a margin that measures about 10% of the image canvas and keep most of the image within it.** Although parts of the image can extend into this margin for optical alignment, it's best when the image occupies about 80% of the image canvas.

**Specify a succinct term if it helps people understand your document type.** By default, the system displays a document's extension at the bottom edge of the document icon, but if the extension is unfamiliar you can supply a more descriptive term.

## Resources

### Related

- [App icons](/design/human-interface-guidelines/app-icons)
- [SF Symbols](/design/human-interface-guidelines/sf-symbols)

### Videos

- [Designing Glyphs](https://developer.apple.com/videos/play/wwdc2017/823)

## Change log

| Date          | Changes                                                    |
| ------------- | ---------------------------------------------------------- |
| June 9, 2025  | Added a table of SF Symbols that represent common actions. |
| June 21, 2023 | Updated to include guidance for visionOS.                  |

---

_Source: [Apple Human Interface Guidelines - Icons](https://developer.apple.com/design/human-interface-guidelines/icons)_
