# Changelog

## [0.24.1] - 2026-10-02

### Fixed

- Keep update checks responsive, show live download progress in Settings, and preserve a prepared update when checks fail or run from the native menu. Downloads wait for consent without stacking prompts.
- Reopen LiveEditor from a signed-in login window, and retry a failed browser return without repeating authentication. Return tickets account for clock skew and network time.
- Stop shortcut retries from restoring disabled or replaced bindings, while preserving native input-freeze safeguards.

### Changed

- Remove the year-in-review longest-streak statistic and unused native-tap recovery APIs; retain the live server streak and import-idempotency paths.
- Retire the one-time database baseline writer and bound the serverless database pool, preserving read-only deployment guards.
- Add [isolated headless development and macOS VM QA](docs/headless-development.md) so routine verification does not take over the owner's desktop. No login E2E suite is added.

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
