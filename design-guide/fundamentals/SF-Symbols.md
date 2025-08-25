# SF Symbols

_Updated: July 28, 2025 - Updated with guidance for Draw animations and gradient rendering in SF Symbols 7._

SF Symbols provides thousands of consistent, highly configurable symbols that integrate seamlessly with the San Francisco system font, automatically aligning with text in all weights and sizes.

You can use a symbol to convey an object or concept wherever interface icons can appear, such as in toolbars, tab bars, context menus, and within text.

Availability of individual symbols and features varies based on the version of the system you're targeting. Symbols and symbol features introduced in a given year aren't available in earlier operating systems.

Visit [SF Symbols](https://developer.apple.com/sf-symbols/) to download the app and browse the full set of symbols. Be sure to understand the terms and conditions for using SF Symbols, including the prohibition against using symbols — or images that are confusingly similar — in app icons, logos, or any other trademarked use. For developer guidance, see [Configuring and displaying symbol images in your UI](https://developer.apple.com/documentation/UIKit/configuring-and-displaying-symbol-images-in-your-ui).

## Rendering modes

SF Symbols provides four rendering modes — monochrome, hierarchical, palette, and multicolor — that give you multiple options when applying color to symbols. For example, you might want to use multiple opacities of your app's accent color to give symbols depth and emphasis, or specify a palette of contrasting colors to display symbols that coordinate with various color schemes.

To support the rendering modes, SF Symbols organizes a symbol's paths into distinct layers. For example, the `cloud.sun.rain.fill` symbol consists of three layers: the primary layer contains the cloud paths, the secondary layer contains the paths that define the sun and its rays, and the tertiary layer contains the raindrop paths.

Depending on the rendering mode you choose, a symbol can produce various appearances. For example, Hierarchical rendering mode assigns a different opacity of a single color to each layer, creating a visual hierarchy that gives depth to the symbol.

SF Symbols supports the following rendering modes:

### Monochrome

Applies one color to all layers in a symbol. Within a symbol, paths render in the color you specify or as a transparent shape within a color-filled path.

### Hierarchical

Applies one color to all layers in a symbol, varying the color's opacity according to each layer's hierarchical level.

### Palette

Applies two or more colors to a symbol, using one color per layer. Specifying only two colors for a symbol that defines three levels of hierarchy means the secondary and tertiary layers use the same color.

### Multicolor

Applies intrinsic colors to some symbols to enhance meaning. For example, the `leaf` symbol uses green to reflect the appearance of leaves in the physical world, whereas the `trash.slash` symbol uses red to signal data loss. Some multicolor symbols include layers that can receive other colors.

Regardless of rendering mode, using system-provided colors ensures that symbols automatically adapt to accessibility accommodations and appearance modes like vibrancy and Dark Mode. For developer guidance, see [`renderingMode(_:)`](<https://developer.apple.com/documentation/swiftui/image/renderingmode(_:)>).

**Confirm that a symbol's rendering mode works well in every context.** Depending on factors like the size of a symbol and its contrast with the current background color, different rendering modes can affect how well people can discern the symbol's details. You can use the automatic setting to get a symbol's preferred rendering mode, but it's still a good idea to check the results for places where a different rendering mode might improve a symbol's legibility.

## Gradients

In SF Symbols 7 and later, gradient rendering generates a smooth linear gradient from a single source color. You can use gradients across all rendering modes for both system and custom colors and for custom symbols. Gradients render for symbols of any size, but look best at larger sizes.

## Variable color

With variable color, you can represent a characteristic that can change over time — like capacity or strength — regardless of rendering mode. To visually communicate such a change, variable color applies color to different layers of a symbol as a value reaches different thresholds between zero and 100 percent.

For example, you could use variable color with the `speaker.wave.3` symbol to communicate three different ranges of sound — plus the state where there's no sound — by mapping the layers that represent the curved wave paths to different ranges of decibel values.

**Use variable color to communicate change — don't use it to communicate depth.** To convey depth and visual hierarchy, use Hierarchical rendering mode to elevate certain layers and distinguish foreground and background elements in a symbol.

## Weights and scales

SF Symbols provides symbols in a wide range of weights and scales to help you create adaptable designs.

Each of the nine symbol weights — from ultralight to black — corresponds to a weight of the San Francisco system font, helping you achieve precise weight matching between symbols and adjacent text, while supporting flexibility for different sizes and contexts.

Each symbol is also available in three scales: small, medium (the default), and large. The scales are defined relative to the cap height of the San Francisco system font.

Specifying a scale lets you adjust a symbol's emphasis compared to adjacent text, without disrupting the weight matching with text that uses the same point size. For developer guidance, see [`imageScale(_:)`](<https://developer.apple.com/documentation/SwiftUI/View/imageScale(_:)>) (SwiftUI), [`UIImage.SymbolScale`](https://developer.apple.com/documentation/UIKit/UIImage/SymbolScale) (UIKit), and [`NSImage.SymbolConfiguration`](https://developer.apple.com/documentation/AppKit/NSImage/SymbolConfiguration-swift.class) (AppKit).

## Design variants

SF Symbols defines several design variants — such as fill, slash, and enclosed — that can help you communicate precise states and actions while maintaining visual consistency and simplicity in your UI. For example, you could use the slash variant of a symbol to show that an item or action is unavailable, or use the fill variant to indicate selection.

### Common Variants

- **Outline** - The most common variant in SF Symbols. An outlined symbol has no solid areas, resembling the appearance of text.
- **Fill** - Available for most symbols, where areas within some shapes are solid.
- **Slash** - Indicates unavailability or negation
- **Enclosed** - Symbols within shapes like circles, squares, or rectangles

SF Symbols provides many variants for specific languages and writing systems, including Latin, Arabic, Hebrew, Hindi, Thai, Chinese, Japanese, Korean, Cyrillic, Devanagari, and several Indic numeral systems. Language- and script-specific variants adapt automatically when the device language changes.

### Usage Guidelines

- The outline variant works well in toolbars, lists, and other places where you display a symbol alongside text.
- Symbols that use an enclosing shape can improve legibility at small sizes.
- The solid areas in a fill variant tend to give a symbol more visual emphasis, making it a good choice for iOS tab bars and swipe actions.

## Animations

SF Symbols provides a collection of expressive, configurable animations that enhance your interface and add vitality to your app. Symbol animations help communicate ideas, provide feedback in response to people's actions, and signal changes in status or ongoing activities.

Animations work on all SF Symbols in the library, in all rendering modes, weights, and scales, and on custom symbols. You can control the playback of an animation, whether you want the animation to run from start to finish, or run indefinitely, repeating its effect until a condition is met.

### Animation Types

1. **Appear** — Causes a symbol to gradually emerge into view.

2. **Disappear** — Causes a symbol to gradually recede out of view.

3. **Bounce** — Briefly scales a symbol with an elastic-like movement that goes either up or down and then returns to the symbol's initial state.

4. **Scale** — Changes the size of a symbol, increasing or decreasing its scale. Unlike bounce, the scale animation persists until you set a new scale or remove the effect.

5. **Pulse** — Varies the opacity of a symbol over time. This animation automatically pulses only the layers within a symbol that are annotated to pulse.

6. **Variable color** — Incrementally varies the opacity of layers within a symbol. This animation can be cumulative or iterative.

7. **Replace** — Replaces one symbol with another. Features three configurations:
   - Down-up: outgoing symbol scales down, incoming symbol scales up
   - Up-up: both symbols scale up
   - Off-up: outgoing symbol hides, incoming symbol scales up

8. **Magic Replace** — Performs a smart transition between two symbols with related shapes. Slashes can draw on/off, badges can appear/disappear.

9. **Wiggle** — Moves the symbol back and forth along a directional axis.

10. **Breathe** — Smoothly increases and decreases the presence of a symbol, giving it a living quality.

11. **Rotate** — Rotates the symbol to act as a visual indicator or imitate an object's behavior in the real world.

12. **Draw On / Draw Off** — In SF Symbols 7 and later, draws the symbol along a path through a set of guide points.

### Animation Guidelines

**Apply symbol animations judiciously.** While there's no limit to how many animations you can add to a view, too many animations can overwhelm an interface and distract people.

**Make sure that animations serve a clear purpose in communicating a symbol's intent.** Each type of animation has a discrete movement that communicates a certain type of action or elicits a certain response.

**Use symbol animations to communicate information more efficiently.** Animations provide visual feedback, reinforcing that something happened in your interface.

**Consider your app's tone when adding animations.** When animating a symbol, think about what the animation can convey and how that might align with your brand identity.

## Custom symbols

If you need a symbol that SF Symbols doesn't provide, you can create your own. To create a custom symbol, first export the template for a symbol that's similar to the design you want, then use a vector-editing tool to modify it. For developer guidance, see [Creating custom symbol images for your app](https://developer.apple.com/documentation/UIKit/creating-custom-symbol-images-for-your-app).

> **Important**
>
> SF Symbols includes copyrighted symbols that depict Apple products and features. You can display these symbols in your app, but you can't customize them. To help you identify a noncustomizable symbol, the SF Symbols app badges it with an Info icon.

Using a process called _annotating_, you can assign a specific color — or a specific hierarchical level, such as primary, secondary, or tertiary — to each layer in a custom symbol.

### Custom Symbol Guidelines

**Use the template as a guide.** Create a custom symbol that's consistent with the ones the system provides in level of detail, optical weight, alignment, position, and perspective. Strive to design a symbol that is:

- Simple
- Recognizable
- Inclusive
- Directly related to the action or content it represents

**Assign negative side margins to your custom symbol if necessary.** SF Symbols supports negative side margins to aid optical horizontal alignment when a symbol contains a badge or other elements that increase its width.

**Optimize layers to use animations with custom symbols.** If you want to animate your symbol by layer, make sure to annotate the layers in the SF Symbols app.

**Test animations for custom symbols.** It's important to test your custom symbols with all of the animation presets because the shapes and paths might not appear how you expect when the layers are in motion.

**Avoid making custom symbols that include common variants.** The SF Symbols app offers a component library for creating variants of your custom symbol.

**Provide alternative text labels for custom symbols.** Alternative text labels let VoiceOver describe visible UI and content, making navigation easier for people with visual disabilities.

**Don't design replicas of Apple products.** Apple products are copyrighted and you can't reproduce them in your custom symbols.

## Platform considerations

_No additional considerations for iOS, iPadOS, macOS, tvOS, visionOS, or watchOS._

## Resources

### Related

- [Download SF Symbols](https://developer.apple.com/sf-symbols/)
- [Typography](/design/human-interface-guidelines/typography)
- [Icons](/design/human-interface-guidelines/icons)

### Developer documentation

- [Symbols](https://developer.apple.com/documentation/Symbols) — Symbols framework
- [Configuring and displaying symbol images in your UI](https://developer.apple.com/documentation/UIKit/configuring-and-displaying-symbol-images-in-your-ui) — UIKit
- [Creating custom symbol images for your app](https://developer.apple.com/documentation/UIKit/creating-custom-symbol-images-for-your-app) — UIKit

### Videos

- [What's new in SF Symbols 7](https://developer.apple.com/videos/play/wwdc2025/337)

## Change log

| Date               | Changes                                                                            |
| ------------------ | ---------------------------------------------------------------------------------- |
| July 28, 2025      | Updated with guidance for Draw animations and gradient rendering in SF Symbols 7.  |
| June 10, 2024      | Updated with guidance for new animations and features of SF Symbols 6.             |
| June 5, 2023       | Added a new section on animations. Included animation guidance for custom symbols. |
| September 14, 2022 | Added a new section on variable color.                                             |

---

_Source: [Apple Human Interface Guidelines - SF Symbols](https://developer.apple.com/design/human-interface-guidelines/sf-symbols)_
