# CoreLive Roadmap

> **Criterion (物差し):** does it make the daily loop — write a line, press Cmd+Enter, it is kept — **faster, more reliable, or show the keep right where you pressed?**
> If it touches neither the loop nor that reward, it is a deletion candidate, not a polish candidate.
> **Never:** streaks, completion rates, grading, social comparison (DESIGN.md North Star).

**Web role (since #215, 2026-11-03):** sign-in, the read-only Home dashboard and Settings. All writing happens in the desktop app; `/write`, `/live-editor` and `/braindump` redirect to `/home`.

Design record: [docs/design/roadmap-2026-09-no-login-live-editor.md](design/roadmap-2026-09-no-login-live-editor.md) (office-hours 2026-09-02, approved; eng review 2026-09-02, D1–D16 folded; design review 2026-09-04, DR1–DR10 folded, 14 tasks). Superseded by #215: the web LiveEditor it planned was removed.

## Now

- **Removed by #215 (2026-11-03):** the public `/write` route, the web `LiveEditorAPI` host and local store (PR-1), and `completed.importLocal` + `LocalKeepMergeSync` (PR-3). The desktop app is the only writing surface; Home shows each line checked off there.
- **PR-2 — `TodayEmber` + `useTodayKeeps()` — shipped and removed 2026-09-05.** The one cell above the editor ("N things kept today" / "Nothing kept yet today") was cut as unnecessary the day it shipped. Nothing replaces it: no count sits above the editor, at 0 or at N. Keeps still land in the device store / the account exactly as PR-1 and PR-3 describe.

## Next

- Nothing decided. The next thing comes from the Later list, in that order.

## Later

- skill-tree: keep or delete, decided by the criterion.

## Completed maintenance — 2026-10-05

- Device keeps and notes use independent record keys, preserving sibling-tab additions and edits to different categories. Legacy values remain readable; edits to the same note retain last-write-wins semantics.
- Account-owned deletion receipts let every browser or native editor rescue its own local writing into the selected destination. Visible signed-in editors refresh on focus and every 15 seconds, with durable per-account cursors, retained source backups, retry evidence, and no uploaded draft text. Electron Settings and login windows cannot acknowledge the native editor's note file.

## Cut (unless the criterion changes)

- #53 paste-import + AI auto-labeling.
- #124 side-distinct modifier chords.
- #120 drag a finished task onto Completed. Closed 2026-09-07: the Floating Navigator (retired v0.22.0) and the `todo.*` vertical (deleted v0.21.0) it targeted are both gone.

## How this file is used

- **Ideas** land as GitHub Issues with the `idea` label (file them with `/spec`). **Decided** work moves into Now / Next / Later here. **Designs** live in `docs/design/`.
- Vocabulary for sorting an Issue: **Loop** (the write → Cmd+Enter pipe), **Reward** (seeing the keep, immediate first, yearly heatmap long-horizon), **Trace** (the Completed journal as memory).
- Reorder only by the criterion above; the North Star line never moves.
