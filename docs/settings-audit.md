# Settings usage audit

Audited 2026-09-06 against CoreLive 0.22.0, including main through `1d546c9e`.
A setting is active only when its value reaches application behavior; saving,
exporting, displaying a toggle, or auditioning an otherwise unused sound does
not establish a task-operation consumer.

## Settings exposed to users

| Setting                                                            | Persistence                                                                       | Behavior consumer                                                                        | Decision                                         |
| ------------------------------------------------------------------ | --------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------- | ------------------------------------------------ |
| Keep finished tasks in the list                                    | Redux `retainCompletedInList`                                                     | None; only its settings control and state plumbing referenced it                         | Remove                                           |
| All cues; Adding a task; Checking one off; Clearing finished tasks | Redux `soundMoments`; legacy `completionSound`                                    | No task operation called the sound engine                                                | Remove all four controls                         |
| Timbre; Volume                                                     | Redux `soundTimbre`, `soundVolume`                                                | Settings-only audition; no task-operation playback                                       | Remove both controls and the four palette assets |
| Show strikethrough on completed tasks                              | Redux `showCompletedTaskStrikethrough`                                            | {@link CompletedJournalRow} in Home's completed history                                  | Keep; add missing cross-window broadcast         |
| Show Today Ember                                                   | Redux `showTodayEmber`                                                            | {@link LiveEditorTodayEmber} and {@link TodayEmber} above web/native editors             | Keep; preserve existing persistence and sync     |
| Theme mode; Palette                                                | `corelive-theme` localStorage                                                     | {@link useThemeAxis}, {@link ThemeProvider}, generated CSS tokens                        | Keep                                             |
| LiveEditor font family; size; text color                           | Redux `liveEditorFontFamily`, `liveEditorFontSize`, `liveEditorTextColor`         | {@link LiveEditor} editor classes and inline styles                                      | Keep                                             |
| Clear finished lines; clear delay                                  | Redux `liveEditorClearOnComplete`, `liveEditorClearDelayMs`                       | {@link LiveEditor} completion/removal flow; signed-out writing has its existing override | Keep                                             |
| Completion toast duration                                          | Redux `liveEditorToastDurationMs`                                                 | {@link LiveEditor} completion/undo feedback                                              | Keep                                             |
| Window opacity                                                     | Native `liveEditor.opacity`                                                       | {@link WindowManager.setLiveEditorOpacity}                                               | Keep                                             |
| Toggle shortcut; Second toggle shortcut                            | Native `shortcuts.toggleLiveEditor`, `shortcuts.toggleLiveEditorSecondary`        | {@link ShortcutManager} native shortcut bindings                                         | Keep                                             |
| Keep on top                                                        | Native `liveEditor.alwaysOnTop`                                                   | {@link WindowManager.setLiveEditorAlwaysOnTop}                                           | Keep                                             |
| Show on all desktops                                               | Native `liveEditor.visibleOnAllWorkspaces`                                        | {@link WindowManager.setLiveEditorVisibleOnAllWorkspaces}                                | Keep                                             |
| Hide App Icon                                                      | Redux `hideAppIcon` and native `behavior.hideAppIcon`                             | Dock activation policy and startup synchronization                                       | Keep                                             |
| Show in Menu Bar                                                   | Redux `showInMenuBar`                                                             | {@link SystemTrayManager.setMenuBarVisible}, {@link ElectronStartupSync}                 | Keep                                             |
| Start at Login                                                     | Redux `startAtLogin`; macOS login item                                            | Electron `app.setLoginItemSettings` IPC handler                                          | Keep                                             |
| Window size / Restore default size                                 | Native `settingsPopover.width`, `settingsPopover.height`                          | {@link WindowManager} settings window sizing                                             | Keep                                             |
| Shortcut opening sound; Opening sound; Preview                     | Native `behavior.shortcutOpenSoundEnabled`, `behavior.shortcutOpenSoundSelection` | {@link ShortcutManager}, {@link ShortcutOpenSoundPlayer}; renderer preview               | Keep with all ten shortcut audio assets          |
| Open config file; Reset LiveEditor defaults                        | Native config bridge                                                              | {@link LiveEditorSettings} handlers and native configuration IPC                         | Keep                                             |
| Check for updates; download/install actions                        | Updater state                                                                     | {@link AppUpdateSettings}, {@link AutoUpdater}                                           | Keep                                             |

The shared settings page now contains Tasks and Appearance. Electron adds Sound,
LiveEditor, Application, and Updates. The strikethrough description names its
actual scope: completed history, rather than all editor/task surfaces.

## Stored-data compatibility

- Keep localStorage key `corelive-redux-state`; increment schema version 3 to 4.
- Remove only `retainCompletedInList`, `completionSound`, `soundMoments`,
  `soundTimbre`, and `soundVolume` from migrated user settings.
- Preserve the legacy `preferences` root migration and all six `braindump*` to
  `liveEditor*` renames. Canonical current values win over legacy duplicates.
- Keep the production deep merge so a malformed retained preference cannot
  discard every other saved choice. Theme, notes, native settings, and unrelated
  root values are outside the removed key set.
- Preserve BroadcastChannel `corelive-preferences-sync` and event
  `preferences-sync`. Incoming old extra keys are stripped; retained settings
  still validate. Applying a received snapshot does not rebroadcast it.
- Add {@link setShowCompletedTaskStrikethrough} to local broadcast actions.

## Internal config candidates: reported, not removed

The storage location for every row below is `config.json` in Electron's
`app.getPath('userData')` directory. These fields remain unchanged. The audit
distinguishes a value reaching behavior from a section merely being loaded,
validated, or exported. Removing internal config fields is outside this change.

| Candidate                                                                                                                                                | Finding                                                                                                                                                                                                                               |
| -------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `appearance.fontSize`, `appearance.compactMode`                                                                                                          | No renderer/native appearance application; real editor appearance is Redux-backed                                                                                                                                                     |
| `behavior.startOnLogin`                                                                                                                                  | Actual login toggle calls the OS API and uses Redux `startAtLogin`                                                                                                                                                                    |
| `behavior.checkForUpdates`                                                                                                                               | Updater has its own checks; this config preference is not consulted                                                                                                                                                                   |
| `behavior.autoSave`, `behavior.autoSaveInterval`                                                                                                         | No save scheduler reads these fields                                                                                                                                                                                                  |
| `behavior.confirmOnDelete`, `behavior.confirmOnQuit`                                                                                                     | No confirmation flow reads these fields                                                                                                                                                                                               |
| `advanced.enableLogging`, `advanced.logLevel`, `advanced.maxLogFiles`                                                                                    | Logger settings/options with similar names are independent of these config fields                                                                                                                                                     |
| `advanced.hardwareAcceleration`, `advanced.experimentalFeatures`                                                                                         | No behavior consumer found                                                                                                                                                                                                            |
| `notifications.taskCreated`, `notifications.taskCompleted`, `notifications.taskUpdated`, `notifications.taskDeleted`                                     | Loaded by {@link NotificationManager.loadSettings}; no task-specific notification gate reads these choices                                                                                                                            |
| `notifications.sound`                                                                                                                                    | Loaded, but {@link NotificationManager.showNotification} uses its call's `options.silent`; unrelated to the active shortcut cue                                                                                                       |
| `notifications.showInTray`, `notifications.autoHide`, `notifications.autoHideDelay`, `notifications.position`                                            | Loaded as notification settings; no display, timeout, or placement behavior reads them                                                                                                                                                |
| `shortcuts.quit`                                                                                                                                         | Loaded into the shortcut dictionary, but {@link ShortcutManager.getHandlerForShortcut} has no quit handler; the app menu owns native quit                                                                                             |
| `liveEditor.shortcut`                                                                                                                                    | Deprecated validation-compatible mirror; the two `shortcuts.toggleLiveEditor*` fields own actual bindings                                                                                                                             |
| `window.main.rememberSize`, `window.main.centerOnStart`                                                                                                  | Defaults and validation data only; no window behavior reads them                                                                                                                                                                      |
| `window.main.width`, `window.main.height`, `window.main.minWidth`, `window.main.minHeight`, `window.main.rememberPosition`, `window.main.startMaximized` | {@link WindowStateManager} still reads these for legacy main-window state; current {@link WindowManager} creates no main window and requests options only for LiveEditor. Keep as legacy state, not an active settings-screen control |

The following internal fields have consumers and are excluded from unused
candidates: `notifications.enabled` gates native notification delivery;
`shortcuts.enabled`, `shortcuts.newTask`, and `shortcuts.minimize` control actual
registrations; `advanced.enableDevTools` controls renderer DevTools availability;
`liveEditor.width`, `liveEditor.height`, and `liveEditor.notes` supply panel bounds
and per-category drafts. `version` drives config migrations. The remaining active
LiveEditor, sound, Dock, and popover fields are covered in the user-facing table.

The existing `behavior.startup` retention is deliberate: an older desktop build
can still need it after downgrade. No native config keys are pruned by this change.
