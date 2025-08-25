# Alerts

An alert is a modal view that communicates urgent or important information, and can optionally provide choices for what to do next.

You can use an alert to:

- Tell people about a critical problem, and if possible, tell them how to fix it.
- Warn people about a destructive action and give them a chance to confirm their choice.
- Ask for permission to do something that affects their device or data.

An alert consists of a title, an optional message, one or more buttons, and an optional text field or secure text field. The title needs to concisely describe the situation; the message, if needed, provides more detail and may suggest a course of action. Buttons let people respond to the situation, and text fields let them provide information.

In general, it's best to minimize the number of alerts people see. Good design provides the information people need when they need it, in context. Poor design can lead to an app that people find annoying, or to an alert they dismiss without reading.

## Alternatives to alerts

Because an alert interrupts the current context and requires people to stop what they're doing to respond, it's a component you want to use sparingly. An alert is effective when it delivers essential information and offers relevant choices, but it can be a negative experience when it appears unexpectedly or too frequently, or when it communicates something that's neither urgent nor important.

As you consider how to communicate with people, weigh the importance and urgency of the information against the level of interruption an alert causes. In particular, look for situations where a less intrusive type of communication is a better choice.

For example, if you just need to provide information, it's often better to use a banner or a view that appears as a noninterruptive overlay. A noninterruptive overlay can disappear on its own after a few moments so people don't have to dismiss it.

If people need to confirm that they want to perform an action — especially a destructive one — an [action sheet](/design/human-interface-guidelines/action-sheets) is often a better choice than an alert. An action sheet lets you provide a set of choices that directly relate to the action, including a cancel button.

## Best practices

**Minimize alerts.** Alerts disrupt the user experience and should only be used for important situations. Fill the screen with content instead of dialogs. Don't present an alert just to provide information.

**Avoid displaying alerts for common, undoable actions, even if they're destructive.** For example, when people delete an email or a file, they don't need to see an alert that asks for confirmation. Instead, provide a simple way to undo the action, like a "recently deleted" folder. In cases where an undo option is too difficult to implement, you might use an action sheet to get confirmation for a destructive action.

**Reserve alerts for critical information.** Use an alert to deliver information that is essential for people to continue their task. For example, when a connectivity problem prevents an app from saving a new document, an alert is an appropriate way to communicate the problem and offer ways to resolve it.

## Alert anatomy

**Write a title that's a short, complete sentence or a question.** The title needs to summarize a situation that people can understand at a glance. When the title is a question, use a question mark at the end. Use sentence-style capitalization.

**Write a message that helps people understand the situation, if necessary.** A message can also explain the different choices people can make. Use sentence-style capitalization, and include a period at the end of the last sentence.

**Keep titles and messages short.** Long text can be difficult to read in an alert and it can be truncated or require scrolling. If you need to provide a lot of information, use a modal view instead of an alert.

**Avoid using a title that's a question if the alert has only one button.** For example, it's confusing to display a title like "Erase the disk?" when the only button is "OK." In this situation, use a title that states the situation, like "Disk Erased."

**Avoid explaining the alert's buttons.** If the alert's title and message are clear, there's no need to explain what the buttons do. For example, there's no need to add a sentence like "Tap OK to continue."

**Make alert buttons easy to understand.** The best button titles consist of one or two words that describe the result of selecting the button. As with all button titles, use title-style capitalization and no punctuation.

**In general, use two-button alerts.** A two-button alert provides an easy choice between two alternatives. Alerts with three or more buttons can be confusing and increase cognitive load. In a three-button alert, the button in the middle is hard to tap. If you need to offer more than two choices, consider using an action sheet instead.

**Place buttons where people expect.** In general, people expect to find the button they're most likely to tap on the trailing side of an alert.

- The button that confirms or agrees with the alert's title and message is the _preferred_ button.
- A _destructive_ button tells people that selecting it will result in data loss or some other negative outcome.
- A _Cancel_ button lets people leave the alert without taking any action.

The preferred button is on the trailing side of a two-button alert. The Cancel button is on the leading side of a two-button alert. The destructive button is on the trailing side of a two-button alert.

**Label cancellation buttons appropriately.** A button that cancels an alert's action needs a title that helps people understand what they're canceling. When the alert's action is destructive, the cancellation button needs a title like "Cancel." When the alert asks people a question, the cancellation button's title can be a term that makes sense in the context of the question, like "Not Now," or "Don't Allow."

**Identify destructive buttons.** If an alert button results in a destructive action, such as deleting content, identify it as a destructive button. When you do this, the system displays the button's text using a style that helps people recognize it.

**Allow people to cancel a destructive action.** Create a Cancel button for every destructive action, and make it the alert's preferred button if possible.

**Enable the Return key for the preferred button.** When you identify a preferred button, the system enables the Return key for it, which lets people quickly accept the preferred action by pressing Return on an attached keyboard. In a three-button alert that includes a Cancel button, don't make a button the preferred one. In this scenario, all buttons have equal weight and the keyboard shortcuts are unavailable.

**Include a text field in an alert only when you need a small amount of information from people.** You can use a single text field to let people enter a user name or a single line of text. A secure text field is appropriate for a password. If you need more than a single line of text from people, use a modal view instead of an alert.

## Platform considerations

_No additional considerations for tvOS or watchOS._

### iOS, iPadOS

**Avoid creating alerts that scroll.** The appearance of a scroll bar in an alert is a sign that the title or message is too long.

### macOS

In addition to using a standard alert, you can also present a _critical_ alert or use a _sheet_.

A **critical alert** is a special type of alert that appears on top of other app windows, and even on top of the full-screen display. Use a critical alert only when an app is in a modal state that requires an immediate response to prevent data loss or other serious problems. Because a critical alert can dominate a person's experience, it's essential to use it only in rare situations.

A **sheet** is a type of modal dialog that's attached to a particular document or window, and prevents people from interacting with the window until they dismiss the dialog. In addition to text and buttons, a sheet can contain other interface elements, such as text fields and pop-up menus. For guidance, see [Sheets](/design/human-interface-guidelines/sheets).

## Resources

#### Related

[Action sheets](/design/human-interface-guidelines/action-sheets)
[Modality](/design/human-interface-guidelines/modality)

#### Developer documentation

[`Alert`](/documentation/SwiftUI/Alert) — SwiftUI
[`UIAlertController`](/documentation/UIKit/UIAlertController) — UIKit
[`NSAlert`](/documentation/AppKit/NSAlert) — AppKit

## Change log

| Date               | Changes                                                                   |
| ------------------ | ------------------------------------------------------------------------- |
| September 12, 2023 | Clarified guidance on alert titles and messages.                          |
| March 13, 2023     | Updated guidance for alert anatomy and added information on macOS sheets. |

---

_Source: [Apple Human Interface Guidelines - Alerts](https://developer.apple.com/design/human-interface-guidelines/alerts)_
