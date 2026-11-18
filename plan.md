# Desktop Settings section navigation

The owner selected the section menu after comparing five working layouts at the desktop popover's default size. Settings opens on Application, with Hide App Icon first. The pinned menu names the current section and makes all seven destinations directly accessible.

## Implementation

Switching sections preserves pending edits. Back from Sync details returns focus to the Account heading. When the native Settings window hides, the renderer receives a `window.settingsAPI.onHidden` notification and resets to the top of Application for the next visit.

If another window covers Settings, the selected section stays selected. Account acknowledges the first-upload notice and restores pending focus only when both the Account pane and the document are visible.

## Comparison

| Layout                  | At the default 360 × 380 window size                       | Decision |
| ----------------------- | ---------------------------------------------------------- | -------- |
| Pinned headings         | Reaching a distant section takes a long scroll.            | Archived |
| Section menu            | Shows the current section and opens all seven in one menu. | Selected |
| Horizontal tabs         | The last tab names require horizontal scrolling.           | Archived |
| Expandable sections     | Expanded controls push later sections below the fold.      | Archived |
| Section list and detail | Switching sections takes a trip back to the list.          | Archived |

The owner saved the five interactive previews and screenshots in their local Product Inspiration archive. Each HTML preview includes its styles, renderer and sample data.

## References

The separate settings pages in Firefox informed the section menu. Other trials drew on VS Code settings groups, Safari panes, Chrome's progressive disclosure and the macOS settings sidebar.

- [Firefox settings](https://support.mozilla.org/en-US/kb/firefox-options-preferences-and-settings)
- [VS Code settings groups](https://code.visualstudio.com/docs/configure/settings#_settings-groups)
- [Safari settings panes](https://support.apple.com/guide/safari/ibrwcd8bc28e/mac)
- [Chrome site settings](https://support.google.com/chrome/answer/14114868)
- [macOS Desktop and Dock settings](https://support.apple.com/guide/mac-help/mchlp1119/mac)
