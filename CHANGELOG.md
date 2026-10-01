# Changelog

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
