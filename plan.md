# Desktop Settings section navigation

The owner selected the section menu after comparing five working layouts at the desktop popover's default size. Settings opens on Application, with Hide App Icon first. The pinned menu names the current section and makes all seven destinations directly accessible.

## Implementation

The desktop renderer owns the section menu in `apps/desktop/renderer/settings/SettingsNavigation.tsx`. The existing section components retain their state while hidden. Sync details returns to the Account heading. The account completion notice is acknowledged when its section is shown.

## Comparison

| Layout                  | Decision |
| ----------------------- | -------- |
| Pinned headings         | Archived |
| Section menu            | Selected |
| Horizontal tabs         | Archived |
| Expandable sections     | Archived |
| Section list and detail | Archived |

The local comparison is in `_trials/COMPARISON.md`. Each alternative under `_trials/_archived/` includes a standalone HTML preview, a screenshot, and a recording. Its HTML embeds the styles, renderer and sample data.

## References

The separate settings pages in Firefox informed the section menu. Other trials drew on VS Code settings groups, Safari panes, Chrome's progressive disclosure and the macOS settings sidebar.

- [Firefox settings](https://support.mozilla.org/en-US/kb/firefox-options-preferences-and-settings)
- [VS Code settings groups](https://code.visualstudio.com/docs/configure/settings#_settings-groups)
- [Safari settings panes](https://support.apple.com/guide/safari/ibrwcd8bc28e/mac)
- [Chrome site settings](https://support.google.com/chrome/answer/14114868)
- [macOS Desktop and Dock settings](https://support.apple.com/guide/mac-help/mchlp1119/mac)
