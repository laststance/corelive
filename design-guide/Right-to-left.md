# Right to left

Support right-to-left languages like Arabic and Hebrew by reversing your interface as needed to match the reading direction of the related scripts.

When people choose a language for their device — or just your app or game — they expect the interface to adapt in various ways (to learn more, see [Localization](https://developer.apple.com/localization/)).

System-provided UI frameworks support right-to-left (RTL) by default, allowing system-provided UI components to flip automatically in the RTL context. If you use system-provided elements and standard layouts, you might not need to make any changes to your app's automatically reversed interface.

If you want to fine-tune your layout or enhance specific localizations to adapt to different currencies, numerals, or mathematical symbols that can occur in various locales in countries that use RTL languages, follow these guidelines.

## Text alignment

**Adjust text alignment to match the interface direction, if the system doesn't do so automatically.** For example, if you left-align text with content in the left-to-right (LTR) context, right-align the text to match the content's mirrored position in the RTL context.

**Align a paragraph based on its language, not on the current context.** When the alignment of a paragraph — defined as three or more lines of text — doesn't match its language, it can be difficult to read. For example, right-aligning a paragraph that consists of LTR text can make the beginning of each line difficult to see. To improve readability, continue aligning one- and two-line text blocks to match the reading direction of the current context, but align a paragraph to match its language.

**Use a consistent alignment for all text items in a list.** To ensure a comfortable reading and scanning experience, reverse the alignment of all items in a list, including items that are displayed in a different script.

## Numbers and characters

Different RTL languages can use different number systems. For example, Hebrew text uses Western Arabic numerals, whereas Arabic text might use either Western or Eastern Arabic numerals. The use of Western and Eastern Arabic numerals varies among countries and regions and even among areas within the same country or region.

If your app covers mathematical concepts or other number-centric topics, it's a good idea to identify the appropriate way to display such information in each locale you support. In contrast, apps that don't address number-related topics can generally rely on system-provided number representations.

### Number Systems

| System                  | Example (1, 2, 3) | Usage                             |
| ----------------------- | ----------------- | --------------------------------- |
| Western Arabic numerals | 1, 2, 3           | Hebrew text, some Arabic contexts |
| Eastern Arabic numerals | ١, ٢, ٣           | Arabic text in certain regions    |

**Don't reverse the order of numerals in a specific number.** Regardless of the current language or the surrounding content, the digits in a specific number — such as "541," a phone number, or a credit card number — always appear in the same order.

**Reverse the order of numerals that show progress or a counting direction; never flip the numerals themselves.** Controls like progress bars, sliders, and rating controls often include numerals to clarify their meaning. If you use numerals in this way, be sure to reverse the order of the numerals to match the direction of the flipped control. Also reverse a sequence of numerals if you use the sequence to communicate a specific order.

## Controls

**Flip controls that show progress from one value to another.** Because people tend to view forward progress as moving in the same direction as the language they read, it makes sense to flip controls like sliders and progress indicators in the RTL context. When you do this, also be sure to reverse the positions of the accompanying glyphs or images that depict the beginning and ending values of the control.

**Flip controls that help people navigate or access items in a fixed order.** For example, in the RTL context, a back button must point to the right so the flow of screens matches the reading order of the RTL language. Similarly, next or previous buttons that let people access items in an ordered list need to flip in the RTL context to match the reading order.

**Preserve the direction of a control that refers to an actual direction or points to an onscreen area.** For example, if you provide a control that means "to the right," it must always point right, regardless of the current context.

**Visually balance adjacent Latin and RTL scripts when necessary.** In buttons, labels, and titles, Arabic or Hebrew text can appear too small when next to uppercased Latin text, because Arabic and Hebrew don't include uppercase letters. To visually balance Arabic or Hebrew text with Latin text that uses all capitals, it often works well to increase the RTL font size by about 2 points.

## Images

**Avoid flipping images like photographs, illustrations, and general artwork.** Flipping an image often changes the image's meaning; flipping a copyrighted image could be a violation. If an image's content is strongly connected to reading direction, consider creating a new version of the image instead of flipping the original.

**Reverse the positions of images when their order is meaningful.** For example, if you display multiple images in a specific order like chronological, alphabetical, or favorite, reverse their positions to preserve the order's meaning in the RTL context.

## Interface icons

When you use [SF Symbols](/design/human-interface-guidelines/sf-symbols) to supply interface icons for your app, you get variants for the RTL context and localized symbols for Arabic and Hebrew, among other languages. If you create custom symbols, you can specify their directionality. For developer guidance, see [Creating custom symbol images for your app](https://developer.apple.com/documentation/UIKit/creating-custom-symbol-images-for-your-app).

### Icon Guidelines

**Flip interface icons that represent text or reading direction.** For example, if an interface icon uses left-aligned bars to represent text in the LTR context, right-align the bars in the RTL context.

**Consider creating a localized version of an interface icon that displays text.** Some interface icons include letters or words to help communicate a script-related concept, like font-size choice or a signature. If you have a custom interface icon that needs to display actual text, consider creating a localized version. For example, SF Symbols offers different versions of the signature, rich-text, and I-beam pointer symbols for use with Latin, Hebrew, and Arabic text, among others.

**Flip an interface icon that shows forward or backward motion.** When something moves in the same direction that people read, they typically interpret that direction as forward; when something moves in the opposite direction, people tend to interpret the direction as backward. An interface icon that depicts an object moving forward or backward needs to flip in the RTL context to preserve the meaning of the motion.

**Don't flip logos or universal signs and marks.** Displaying a flipped logo confuses people and can have legal repercussions. Always display a logo in its original form, even if it includes text. People expect universal symbols and marks like the checkmark to have a consistent appearance, so avoid flipping them.

**In general, avoid flipping interface icons that depict real-world objects.** Unless you use the object to indicate directionality, it's best to avoid flipping an icon that represents a familiar item. For example, clocks work the same everywhere, so a traditional clock interface icon needs to look the same regardless of language direction.

**Before merely flipping a complex custom interface icon, consider its individual components and the overall visual balance.** In some cases, a component — like a badge, slash, or magnifying glass — needs to adhere to a visual design language regardless of localization. For example, SF Symbols maintains visual consistency by using the same backslash to represent the prohibition or negation of a symbol's meaning in both LTR and RTL versions.

### Example Icon Types

| Icon Type               | LTR → RTL Action           | Example                                                        |
| ----------------------- | -------------------------- | -------------------------------------------------------------- |
| Text representation     | Flip alignment             | Left-aligned text bars → Right-aligned text bars               |
| Forward/backward motion | Flip direction             | Speaker with sound waves right → Speaker with sound waves left |
| Navigation (back/next)  | Flip to match reading flow | Back arrow left → Back arrow right                             |
| Real-world objects      | Don't flip                 | Clock, pencil, game controller                                 |
| Logos/universal symbols | Don't flip                 | Brand logos, checkmark, warning signs                          |

## Platform considerations

_No additional considerations for iOS, iPadOS, macOS, tvOS, visionOS, or watchOS._

## Resources

### Related

- [Layout](/design/human-interface-guidelines/layout)
- [Inclusion](/design/human-interface-guidelines/inclusion)
- [SF Symbols](/design/human-interface-guidelines/sf-symbols)

### Developer documentation

- [Localization](https://developer.apple.com/localization/)
- [Preparing views for localization](https://developer.apple.com/documentation/SwiftUI/Preparing-views-for-localization) — SwiftUI

### Videos

- [Enhance your app's multilingual experience](https://developer.apple.com/videos/play/wwdc2025/222)
- [Design for Arabic](https://developer.apple.com/videos/play/wwdc2022/10034)

---

_Source: [Apple Human Interface Guidelines - Right to left](https://developer.apple.com/design/human-interface-guidelines/right-to-left)_
