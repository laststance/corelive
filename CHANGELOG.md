# Changelog

## [0.30.1] - 2026-11-03

### Fixed

- On a Mac that never ran an earlier version, Sync details ▸ History now says "Nothing here yet." instead of showing an import summary where every count is zero.
- "Open recovery copies" appears in History whenever a recovery copy is waiting to be restored, including copies kept from an earlier version, and no longer appears when there is nothing to open.

## [0.30.0] - 2026-11-03

### Added

- The desktop LiveEditor works without an account. Open the app and start writing, even offline; your writing and the lines you check off are saved on this Mac.
- Settings is now part of the desktop app, so it opens without a connection. Its new Account section, at the end, is where you sign in, connect this Mac to your account and sign out.
- After you connect a Mac, the lines you finished on it go to your dashboard, and Account tells you how many are there. Lines you check off while offline wait and go up when you are back online.
- Category changes you make in the desktop app work offline and reach the dashboard after you connect this Mac. When the dashboard disagrees with a change, Sync details lists it under "Needs a look" so you can keep the Mac's version or the dashboard's.

### Changed

- Signing out of the desktop app keeps your writing on this Mac, and the editor stays open for writing. If some sign-in data can't be cleared, Account says so and offers Clear again.
- The first time you open this version, your existing desktop writing moves into the new on-Mac workspace by itself. The old files stay as backups, and Sync details lists them.
- Category names on corelive.app follow the same rules as the desktop app: names that differ only in how their characters are encoded count as the same name.
- Settings on corelive.app now holds only Appearance. Desktop app preferences are in the desktop app's own Settings window.

## [0.29.0] - 2026-11-03

### Changed

- In the desktop app, ⌘N, File ▸ New Task and `corelive://create` now open the LiveEditor panel instead of a browser tab. If the panel is already open, it stays open and comes to the front.
- Home refreshes itself every 15 seconds while it is visible, and again when you come back to the tab, so lines you check off in the desktop app appear without reloading.
- Before you have logged anything, Home says "Your year starts here" and links to the Mac app download.
- Settings reads the LiveEditor preferences again each time its window comes back into focus, so a change made elsewhere shows up there.
- About CoreLive now reads "Write tasks in LiveEditor, check them off, and see every finished line on your Activity Heatmap."

### Fixed

- When a category you delete is already gone (for example, a retry after a lost response), the delete dialog now closes without an error. When the category you chose to move its entries into is gone, the dialog stays open, says so, and selects your default category again.
- If refreshing your history in the background fails, Home keeps showing the entries it already loaded instead of replacing them with an error.

### Removed

- The web LiveEditor is gone. Write and check off tasks in the CoreLive desktop app; corelive.app shows what you finished. Links to `/write`, `/live-editor` and `/braindump` now open Home, and the sidebar no longer has a LiveEditor item.
- Writing kept only in a browser by the web LiveEditor, including completions it had not uploaded yet, is not carried over.

## [0.28.1] - 2026-11-03

### Removed

- `pnpm lint` and `pnpm validate` no longer build and run the in-repo design-token ESLint plugin (`eslint-plugin-dslint`), so linting starts right away. Tailwind class names are no longer checked for arbitrary values or non-token classes; keep following `DESIGN.md` for tokens. In an existing checkout, run `rm -rf packages/eslint-plugin-dslint && pnpm install` once after pulling.

### Fixed

- The README now names the Node.js version the project pins, 26.12.1.

## [0.28.0] - 2026-11-02

### Added

- When a palette without a System mode is active, Settings explains how to follow your device's light or dark setting. Choose the Default palette, then select System.

### Changed

- CoreLive now starts in the neutral shadcn Default palette and follows your Mac's light or dark setting. Warm Cathedral, the amber palette, is still available in Settings under Appearance and Palette.
- If you used Warm Cathedral before this update, CoreLive moves you to Default once. To bring it back, choose Warm Cathedral in Settings. Stored theme names change too: Default is now `light` and `dark` (the old `default-light` and `default-dark` still work), and Warm Cathedral is `cathedral-light` and `cathedral-dark`.
- The sign-in window and its ribbon follow the active theme, so a dark Mac no longer shows a white window before sign-in.
- The LiveEditor text color preset "Amber" is now "Accent" and uses your palette's accent color.

### Fixed

- Switching themes in the desktop LiveEditor now fades smoothly instead of snapping. With Reduce Motion on, it switches instantly.
- The screen shown when CoreLive cannot load now uses neutral colors that match the default theme.

## [0.27.0] - 2026-11-02

### Added

- See what you finished at a glance. With Clear finished lines off, LiveEditor keeps each finished line in place with a thin strike through its words. The strike follows your theme and stays on the text when lines wrap, the note scrolls, or you zoom or change the font size. Delete a finished line whenever you like, and its completion stays recorded.

### Changed

- With Clear finished lines off, Cmd+Enter on a finished line does nothing, so a task is never recorded twice. The Settings description now says that Off keeps finished lines in place until you delete them.

## [0.26.1] - 2026-10-26

### Fixed

- Move LiveEditor by dragging the empty space in its header while keeping Details, Follow Spaces and Close clickable.

## [0.26.0] - 2026-10-22

### Added

- Add a Settings option to hide LiveEditor's routine save and sync status. Saving, error alerts, Details and Undo stay available.

### Changed

- Group Settings by LiveEditor, Appearance, Shortcuts & Sound, Application and Updates, with more readable spacing, larger control targets and equal-sized theme cards.

### Fixed

- Keep writing in place when save, sync and completion status changes, including narrow windows and enlarged text.
- Preserve newer preference edits during recovery, retry uncertain saves with their original identity, and keep recovery controls available on older desktop versions.

## [0.25.1] - 2026-10-22

### Changed

- Refresh the web and desktop dependencies, including Next.js 16.4, React 19.3, and Electron 45.

### Fixed

- Keep development validation reliable with TypeScript 7, updated API mocks, and independent caches for concurrent test suites.

## [0.25.0] - 2026-10-22

### Added

- Reopen LiveEditor without a connection after one online preparation on the upgraded Mac app. Write, complete lines, and use eligible Undo across restarts with writing saved locally first.
- Send completed records and their updates after reconnection while preserving their original time, category, and identity. Drafts stay on the Mac; see the [offline LiveEditor guide](docs/offline-liveeditor.md) for preparation and recovery.
- Inspect pending records in Details, move writing from removed categories, correct completion times, and resolve conflicting updates without replacing newer writing.
- Export local writing and preview validated recovery copies when a workspace cannot be opened. Preserve damaged files for recovery instead of silently resetting the editor.

### Fixed

- Wait for writing to save before hiding, closing, signing out, quitting, or installing an update. Failed saves keep writing available with Retry and Copy writing actions.
- Preserve large merged or recovered drafts through later edits, category moves, and restarts without shrinking their retained editing capacity.
- Keep completion identities distinct through retries and cleanup, and preserve keyboard focus when opening LiveEditor or returning from Details and repair dialogs.

## [0.24.2] - 2026-10-18

### Fixed

- Restore Right Option and other single-modifier shortcuts after a failed start by selecting the shortcut again in Settings. Automatic startup keeps the crash guard.
- Align workspace test packages and use TypeScript 6 so tests and lint checks run with supported tools.

## [0.24.1] - 2026-10-07

### Fixed

- Update vulnerable build/runtime dependencies and patch excessive numeric precision in the desktop build logger's formatter.
- Expose native preload capabilities only on the configured CoreLive origin, including canonical redirects; allow the bounded Clerk handshake without exposing a desktop bridge.
- Keep update checks responsive, show live download progress in Settings, and preserve a prepared update when checks fail or run from the native menu. Downloads wait for consent without stacking prompts.
- Reopen LiveEditor from a signed-in login window, and retry a failed browser return without repeating authentication. Return tickets account for clock skew and network time.
- Stop shortcut retries from restoring disabled or replaced bindings, while preserving native input-freeze safeguards.
- Preserve simultaneous keeps and drafts in different categories across browser tabs with independent record writes.
- Rescue each host's local writing after account category deletions, retry failed storage acknowledgements, and preserve chained deletions without duplicating or losing identical draft lines.
- Verify Clerk session credentials at the HTTP API boundary instead of trusting a caller-supplied user identifier.

### Changed

- Add the eight named design typography tiers and affirmative heatmap tooltips for completed work and rest days.
- Develop Web and desktop in separate pnpm workspaces with shared preload contracts and canonical assets. Root commands still work; clean app builds generate their own resources, and Vercel builds Web from `apps/web`.
- Remove the year-in-review longest-streak statistic and unused native-tap recovery APIs; retain the live server streak and import-idempotency paths.
- Retire the one-time database baseline writer and bound the serverless database pool, preserving read-only deployment guards.
- Add [isolated headless development and macOS VM QA](docs/headless-development.md) so routine verification does not take over the owner's desktop. No login E2E suite is added.
- Delete the deferred-work file and document agent rules requiring discovered TODOs to be resolved in the current PR, including work outside its original scope.

## [0.24.0] - 2026-10-02

### Changed

- Move the shared web and desktop API to oRPC v2 while preserving categories, completion history, settings, and Skill Tree actions.
- Refresh older query caches once after the upgrade while keeping local writing and settings.

### Fixed

- Reuse the same Home cache entry when equivalent query inputs have different property ordering, while keeping dates and strings distinct.

## [0.23.0] - 2026-10-01

### Added

- Organize categories into main categories and subcategories, such as Work / CoreLive and Work / Client work.
- Find writing destinations by either name in LiveEditor, see their full paths, and create or manage categories directly from the picker.
- Review entries by main category with an optional subcategory breakdown across history, weekly summaries, daily detail, and year in review.

### Changed

- Show an expanded category hierarchy in the sidebar and choose a parent when creating or moving categories.
- Preserve entries and their dates when moving or deleting categories; deleting a main category promotes its subcategories.

### Fixed

- Keep explicit sidebar color choices and confirmed writing selections when another tab has an older category list.
- Retain local writing during deletion, failed saves, retries, and peer updates without repeating rescued text or restoring removed lines.
- Allow deletion when a main category and its subcategory share a name, while preserving sibling-conflict checks and transaction rollback.
- Clarify deletion destinations and retained-writing errors, connect form labels, and improve destructive-button hover feedback.
