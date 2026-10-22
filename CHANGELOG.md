# Changelog

## [0.26.0] - 2026-10-22

### Added

- Hide LiveEditor's routine save and sync status from Settings while keeping saving, error alerts, Details and Undo available.

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
