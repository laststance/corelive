# Activity views

An activity view presents a range of services that people can use to perform tasks on the current content.

The system provides a standard `UIActivityViewController` that you can use to offer system-provided and custom services from your app. When you use the system-provided view, you give people a familiar experience and you don't have to design your own.

## Best practices

**Use an activity view when the Share icon is present.** The Share icon implies the presence of an activity view, so people are generally expecting one to appear when they tap or click it. For guidance, see [SF Symbols](/design/human-interface-guidelines/sf-symbols).

**Configure an activity view with only the services that make sense in the current context.** Although you can offer a wide range of services, it's essential to offer only the ones that are relevant to the content people are focused on. For example, if people select text in your app, it doesn't make sense to offer a service that saves the text as an image. You can also customize an activity view to exclude services that aren't relevant to your app. For example, if your app helps people manage their contacts, you might exclude services like "Save to Files."

**Write a succinct, descriptive title for a custom service.** When you define a custom service, you create a title that appears with its icon in the activity view. For each custom title, use verbs that describe the action your service performs, like "Edit with Filters" or "Send with App." Use title-style capitalization.

**Provide a template image for the icon that represents your custom service.** When you use a template image, the system can automatically adjust the icon's appearance to match the current context. For example, the system can render a custom icon in full color, as a stencil, or in a circle to help it coordinate with the other icons in the activity view. Use a PNG file for the template image and make sure it's legible at small sizes. For guidance on creating a custom interface icon, see [Icons](/design/human-interface-guidelines/icons).

## Platform considerations

_No additional considerations for macOS, tvOS, visionOS, or watchOS._

### iOS, iPadOS

By default, an activity view appears as a sheet at the bottom of the screen on iPhone and in a popover on iPad.

## Resources

#### Related

[Action sheets](/design/human-interface-guidelines/action-sheets)

#### Developer documentation

[`UIActivityViewController`](/documentation/uikit/uiactivityviewcontroller) — UIKit

## Change log

| Date          | Changes                                                         |
| ------------- | --------------------------------------------------------------- |
| June 10, 2024 | Added guidance on customizing and configuring an activity view. |

---

_Source: [Apple Human Interface Guidelines - Activity views](https://developer.apple.com/design/human-interface-guidelines/activity-views)_
