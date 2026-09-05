# CoreLive Roadmap

> **Criterion (物差し):** does it make the daily loop — write a line, press Cmd+Enter, it is kept — **faster, more reliable, or show the keep right where you pressed?**
> If it touches neither the loop nor that reward, it is a deletion candidate, not a polish candidate.
> **Never:** streaks, completion rates, grading, social comparison (DESIGN.md North Star).

**Login-wall baseline:** `__ s` until the wall in a private window at corelive.app/live-editor (fill in before any code).
**The one person who gets the no-login link (corelive.app/write):** `________` (fill in; if no name comes, ship anyway and leave Later empty on purpose).

Design record: [docs/design/roadmap-2026-09-no-login-live-editor.md](design/roadmap-2026-09-no-login-live-editor.md) (office-hours 2026-09-02, approved; eng review 2026-09-02, D1–D16 folded; design review 2026-09-04, DR1–DR10 folded, 14 tasks).

## Now

- **PR-1 — public `/write` route + web `LiveEditorAPI` host + local store.** `src/app/write/page.tsx` renders the same `LiveEditor` through a web implementation of the existing preload interface (device-local notes and keeps in `localStorage`, memory fallback when storage is unavailable; clear-on-complete forced ON while signed out). `/live-editor`, `src/proxy.ts` and `electron/` are untouched, so the packaged panel keeps its `/login` contract. Sidebar link → `/write`. Footer: "Kept on this device." + "Sign in" → `/login?redirect_url=/write` (the login page passes `forceRedirectUrl` so the env force URL stops overriding it). Completions flow through one `useCompletionWriter` hook that routes on sign-in state. Page frame (design review): caption row "CoreLive" + "⌘ Enter = kept", placeholder "Write one thing. ⌘ Enter keeps it.", the frame renders at first paint (no spinner), a touch-only "Keep line" button, token slots only (the visitor's theme is inherited, no forced theme).
- **PR-2 — `TodayEmber` + `useTodayKeeps()` — shipped and removed 2026-09-05.** The one cell above the editor ("N things kept today" / "Nothing kept yet today") was cut as unnecessary the day it shipped. Nothing replaces it: no count sits above the editor, at 0 or at N. Keeps still land in the device store / the account exactly as PR-1 and PR-3 describe.
- **PR-3 — `completed.importLocal` + `LocalKeepMergeSync`.** One-time merge of a device's signed-out keeps into the account, fired once per session from a root-level component (not the page: sign-up force-redirects to `/home`, so a page-scoped trigger would miss the exact visitor whose keeps are waiting). Server: one `prisma.$transaction` writing `ImportBatch` under a per-user-namespaced id plus a `createMany` that preserves each `completedAt` and files everything in the account's default category, seeding "General" when the account has none; repeated titles are never deduplicated. Idempotency is the batch id, claimed and persisted in `localStorage` BEFORE the request, so a lost response retries the same batch with the same items instead of importing them twice — and keeps added since the claim wait for the next batch. On success the local items are tagged `mergedBatchId` and every completed-derived query is invalidated.

## Next

- Nothing decided. The next thing comes from the Later list, in that order.

## Later

- Watch one named person use the signed-out page for 15 minutes, silently.
- Signed-out parity inside the packaged Electron LiveEditor panel (needs a main-process release; then point the panel at `/write`).
- Per-record keys for `localCompletionStore` / `localNoteStore` (PR #171 review, accepted-and-deferred 2026-09-05). Two tabs writing simultaneously read the same slot and one entry is lost; the spread narrows the window to sub-milliseconds but does not make read-modify-write atomic. Deferred because `completed.importLocal` retires `localStorage` as the record, and the rewrite is a heavy lift for a single-user app. Revisit if `/write` ever grows real multi-tab use.
- skill-tree: keep or delete, decided by the criterion.
- Streak residue sweep: the Year-in-Review "longest streak" line and the `AchievementAnimation` streak branch. `useStreakNotifications` was deleted in v0.22.0. `calculateStreaks` and `calc-streak` are still LIVE (the journal and the year-in-review aggregation read them), so sweeping them means changing what those surfaces show, not deleting dead code.
- #120 drag a finished task onto Completed.

## Cut (unless the criterion changes)

- #53 paste-import + AI auto-labeling.
- #124 side-distinct modifier chords.

## How this file is used

- **Ideas** land as GitHub Issues with the `idea` label (file them with `/spec`). **Decided** work moves into Now / Next / Later here. **Designs** live in `docs/design/`.
- Vocabulary for sorting an Issue: **Loop** (the write → Cmd+Enter pipe), **Reward** (seeing the keep, immediate first, yearly heatmap long-horizon), **Trace** (the Completed journal as memory).
- Reorder only by the criterion above; the North Star line never moves.
