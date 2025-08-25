# Typography

_Updated: March 7, 2025 - Expanded guidance for Dynamic Type._

Your typographic choices can help you display legible text, convey an information hierarchy, communicate important content, and express your brand or style.

## Ensuring legibility

**Use font sizes that most people can read easily.** People need to be able to read your content at various viewing distances and under a variety of conditions. Follow the recommended default and minimum text sizes for each platform — for both custom and system fonts — to ensure your text is legible on all devices.

### Platform Font Size Guidelines

| Platform    | Default size | Minimum size |
| ----------- | ------------ | ------------ |
| iOS, iPadOS | 17 pt        | 11 pt        |
| macOS       | 13 pt        | 10 pt        |
| tvOS        | 29 pt        | 23 pt        |
| visionOS    | 17 pt        | 12 pt        |
| watchOS     | 16 pt        | 12 pt        |

**Test legibility in different contexts.** For example, you need to test game text for legibility on each platform on which your game runs. If testing shows that some of your text is difficult to read, consider using a larger type size, increasing contrast by modifying the text or background colors, or using typefaces designed for optimized legibility, like the system fonts.

**In general, avoid light font weights.** For example, if you're using system-provided fonts, prefer Regular, Medium, Semibold, or Bold font weights, and avoid Ultralight, Thin, and Light font weights, which can be difficult to see, especially when text is small.

## Conveying hierarchy

**Adjust font weight, size, and color as needed to emphasize important information and help people visualize hierarchy.** Be sure to maintain the relative hierarchy and visual distinction of text elements when people adjust text sizes.

**Minimize the number of typefaces you use, even in a highly customized interface.** Mixing too many different typefaces can obscure your information hierarchy and hinder readability, in addition to making an interface feel internally inconsistent or poorly designed.

**Prioritize important content when responding to text-size changes.** Not all content is equally important. When someone chooses a larger text size, they typically want to make the content they care about easier to read; they don't always want to increase the size of every word on the screen.

## Using system fonts

Apple provides two typeface families that support an extensive range of weights, sizes, styles, and languages.

### San Francisco (SF)

**San Francisco (SF)** is a sans serif typeface family that includes the SF Pro, SF Compact, SF Arabic, SF Armenian, SF Georgian, SF Hebrew, and SF Mono variants.

The system also offers SF Pro, SF Compact, SF Arabic, SF Armenian, SF Georgian, and SF Hebrew in rounded variants you can use to coordinate text with the appearance of soft or rounded UI elements, or to provide an alternative typographic voice.

### New York (NY)

**New York (NY)** is a serif typeface family designed to work well by itself and alongside the SF fonts.

You can download the San Francisco and New York fonts [here](https://developer.apple.com/fonts/).

### Variable Font Format

The system provides the SF and NY fonts in the _variable_ font format, which combines different font styles together in one file, and supports interpolation between styles to create intermediate ones.

> **Note**
>
> Variable fonts support _optical sizing_, which refers to the adjustment of different typographic designs to fit different sizes. On all platforms, the system fonts support _dynamic optical sizes_, which merge discrete optical sizes (like Text and Display) and weights into a single, continuous design, letting the system interpolate each glyph or letterform to produce a structure that's precisely adapted to the point size.

### Text Styles

The system defines a set of typographic attributes — called text styles — that work with both typeface families. A _text style_ specifies a combination of font weight, point size, and leading values for each text size. Text styles form a typographic hierarchy you can use to express the different levels of importance in your content.

**Consider using the built-in text styles.** The system-defined text styles give you a convenient and consistent way to convey your information hierarchy through font size and weight. Using text styles with the system fonts also ensures support for Dynamic Type and larger accessibility type sizes.

**Modify the built-in text styles if necessary.** System APIs define font adjustments — called _symbolic traits_ — that let you modify some aspects of a text style. For example, the bold trait adds weight to text, letting you create another level of hierarchy.

> **Developer note**
>
> You can use the constants defined in [`Font.Design`](https://developer.apple.com/documentation/SwiftUI/Font/Design) to access all system fonts — don't embed system fonts in your app or game. Use [`Font.Design.default`](https://developer.apple.com/documentation/SwiftUI/Font/Design/default) to get the system font on all platforms; use [`Font.Design.serif`](https://developer.apple.com/documentation/SwiftUI/Font/Design/serif) to get the New York font.

## Using custom fonts

**Make sure custom fonts are legible.** People need to be able to read your custom font easily at various viewing distances and under a variety of conditions. While using a custom font, be guided by the recommended minimum font sizes for various styles and weights.

**Implement accessibility features for custom fonts.** System fonts automatically support Dynamic Type (where available) and respond when people turn on accessibility features, such as Bold Text. If you use a custom font, make sure it implements the same behaviors. For developer guidance, see [Applying custom fonts to text](https://developer.apple.com/documentation/SwiftUI/Applying-Custom-Fonts-to-Text). In a Unity-based game, you can use [Apple's Unity plug-ins](https://github.com/apple/unityplugins) to support Dynamic Type.

## Supporting Dynamic Type

Dynamic Type is a system-level feature in iOS, iPadOS, tvOS, visionOS, and watchOS that lets people adjust the size of visible text on their device to ensure readability and comfort.

**Make sure your app's layout adapts to all font sizes.** Verify that your design scales, and that text and glyphs are legible at all font sizes. On iPhone or iPad, turn on Larger Accessibility Text Sizes in Settings > Accessibility > Display & Text Size > Larger Text, and confirm that your app remains comfortably readable.

**Increase the size of meaningful interface icons as font size increases.** If you use interface icons to communicate important information, make sure they're easy to view at larger font sizes too. When you use [SF Symbols](https://developer.apple.com/design/human-interface-guidelines/sf-symbols), you get icons that scale automatically with Dynamic Type size changes.

**Keep text truncation to a minimum as font size increases.** In general, aim to display as much useful text at the largest accessibility font size as you do at the largest standard font size.

**Consider adjusting your layout at large font sizes.** When font size increases in a horizontally constrained context, inline items and container boundaries can crowd text and cause truncation or overlapping. Consider using a stacked layout where text appears above secondary items.

**Maintain a consistent information hierarchy regardless of the current font size.** Keep primary elements toward the top of a view even when the font size is very large, so that people don't lose track of these elements.

## Platform considerations

### iOS, iPadOS

SF Pro is the system font in iOS and iPadOS. iOS and iPadOS apps can also use NY.

### macOS

SF Pro is the system font in macOS. NY is available for Mac apps built with Mac Catalyst. macOS doesn't support Dynamic Type.

**When necessary, use dynamic system font variants to match the text in standard controls.** Dynamic system font variants give your text the same look and feel of the text that appears in system-provided controls.

### tvOS

SF Pro is the system font in tvOS, and apps can also use NY.

### visionOS

SF Pro is the system font in visionOS. If you use NY, you need to specify the type styles you want.

visionOS uses bolder versions of the Dynamic Type body and title styles and it introduces Extra Large Title 1 and Extra Large Title 2 for wide, editorial-style layouts.

**In general, prefer 2D text.** The more visual depth text characters have, the more difficult they can be to read. Although a small amount of 3D text can provide a fun visual element, if you're going to display content that people need to read and understand, prefer using text that has little or no visual depth.

**Make sure text looks good and remains legible when people scale it.** Use a text style that makes the text look good at full scale, then test it for legibility at different scales.

**Maximize the contrast between text and the background of its container.** By default, the system displays text in white, because this color tends to provide a strong contrast with the default system background material.

**If you need to display text that's not on a background, consider making it bold to improve legibility.** In this situation, you generally want to avoid adding shadows to increase text contrast.

**Keep text facing people as much as possible.** If you display text that's associated with a point in space, such as a label for a 3D object, you generally want to use _billboarding_ — that is, you want the text to face the wearer regardless of how they or the object move.

### watchOS

SF Compact is the system font in watchOS, and apps can also use NY. In complications, watchOS uses SF Compact Rounded.

## Specifications

### Dynamic Type Sizes (Examples)

#### iOS/iPadOS Large (Default)

| Style       | Weight   | Size (points) | Leading (points) |
| ----------- | -------- | ------------- | ---------------- |
| Large Title | Regular  | 34            | 41               |
| Title 1     | Regular  | 28            | 34               |
| Title 2     | Regular  | 22            | 28               |
| Title 3     | Regular  | 20            | 25               |
| Headline    | Semibold | 17            | 22               |
| Body        | Regular  | 17            | 22               |
| Callout     | Regular  | 16            | 21               |
| Subhead     | Regular  | 15            | 20               |
| Footnote    | Regular  | 13            | 18               |
| Caption 1   | Regular  | 12            | 16               |
| Caption 2   | Regular  | 11            | 13               |

#### macOS Built-in Text Styles

| Text style  | Weight  | Size (points) | Line height (points) | Emphasized weight |
| ----------- | ------- | ------------- | -------------------- | ----------------- |
| Large Title | Regular | 26            | 32                   | Bold              |
| Title 1     | Regular | 22            | 26                   | Bold              |
| Title 2     | Regular | 17            | 22                   | Bold              |
| Title 3     | Regular | 15            | 20                   | Semibold          |
| Headline    | Bold    | 13            | 16                   | Heavy             |
| Body        | Regular | 13            | 16                   | Semibold          |
| Callout     | Regular | 12            | 15                   | Semibold          |
| Subheadline | Regular | 11            | 14                   | Semibold          |
| Footnote    | Regular | 10            | 13                   | Semibold          |
| Caption 1   | Regular | 10            | 13                   | Medium            |
| Caption 2   | Medium  | 10            | 13                   | Semibold          |

#### tvOS Built-in Text Styles

| Text style | Weight  | Size (points) | Leading (points) | Emphasized weight |
| ---------- | ------- | ------------- | ---------------- | ----------------- |
| Title 1    | Medium  | 76            | 96               | Bold              |
| Title 2    | Medium  | 57            | 66               | Bold              |
| Title 3    | Medium  | 48            | 56               | Bold              |
| Headline   | Medium  | 38            | 46               | Bold              |
| Subtitle 1 | Regular | 38            | 46               | Medium            |
| Callout    | Medium  | 31            | 38               | Bold              |
| Body       | Medium  | 29            | 36               | Bold              |
| Caption 1  | Medium  | 25            | 32               | Bold              |
| Caption 2  | Medium  | 23            | 30               | Bold              |

_Complete Dynamic Type size tables and tracking values are available in the [Apple Design Resources](https://developer.apple.com/design/resources/) for each platform._

## Resources

### Related

- [Fonts for Apple platforms](https://developer.apple.com/fonts/)
- [SF Symbols](https://developer.apple.com/design/human-interface-guidelines/sf-symbols)

### Developer documentation

- [Text input and output](https://developer.apple.com/documentation/SwiftUI/Text-input-and-output) — SwiftUI
- [Text display and fonts](https://developer.apple.com/documentation/UIKit/text-display-and-fonts) — UIKit
- [Fonts](https://developer.apple.com/documentation/AppKit/fonts) — AppKit

### Videos

- [Get started with Dynamic Type](https://developer.apple.com/videos/play/wwdc2024/10074)
- [Meet the expanded San Francisco font family](https://developer.apple.com/videos/play/wwdc2022/110381)
- [The details of UI typography](https://developer.apple.com/videos/play/wwdc2020/10175)

## Change log

| Date               | Changes                                                                                                                                                        |
| ------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| March 7, 2025      | Expanded guidance for Dynamic Type.                                                                                                                            |
| June 10, 2024      | Added guidance for using Apple's Unity plug-ins to support Dynamic Type in a Unity-based game and enhanced guidance on billboarding in a visionOS app or game. |
| September 12, 2023 | Added artwork illustrating system font weights, and clarified tvOS specification table descriptions.                                                           |
| June 21, 2023      | Updated to include guidance for visionOS.                                                                                                                      |

---

_Source: [Apple Human Interface Guidelines - Typography](https://developer.apple.com/design/human-interface-guidelines/typography)_
