# CoreLive Roadmap

> **Criterion (物差し):** does it make the daily loop — write a line, press Cmd+Enter, it is kept — **faster, more reliable, or show the keep right where you pressed?**
> If it touches neither the loop nor that reward, it is a deletion candidate, not a polish candidate.
> **Never:** streaks, completion rates, grading, social comparison (DESIGN.md North Star).

**Login-wall baseline:** `__ s` until the wall in a private window at corelive.app/live-editor (fill in before any code).
**The one person who gets the no-login link (corelive.app/write):** `________` (fill in; if no name comes, ship anyway and leave Later empty on purpose).

Design record: [docs/design/roadmap-2026-09-no-login-live-editor.md](design/roadmap-2026-09-no-login-live-editor.md) (office-hours 2026-09-02, approved; eng review 2026-09-02, D1–D16 folded; design review 2026-09-04, DR1–DR10 folded, 14 tasks).

## Now

- **PR-1 — public `/write` route + web `LiveEditorAPI` host + local store.** `src/app/write/page.tsx` renders the same `LiveEditor` through a web implementation of the existing preload interface (device-local notes and keeps in `localStorage`, memory fallback when storage is unavailable; clear-on-complete forced ON while signed out). `/live-editor`, `src/proxy.ts` and `electron/` are untouched, so the packaged panel keeps its `/login` contract. Sidebar link → `/write`. Footer: "Kept on this device." + "Sign in" → `/login?redirect_url=/write` (the login page passes `forceRedirectUrl` so the env force URL stops overriding it). Completions flow through one `useCompletionWriter` hook that routes on sign-in state. Page frame (design review): caption row "CoreLive" + "⌘ Enter = kept", placeholder "Write one thing. ⌘ Enter keeps it.", the frame renders at first paint (no spinner), a touch-only "Keep line" button, token slots only (the visitor's theme is inherited, no forced theme).
- **PR-2 — `TodayEmber` + `useTodayKeeps()`.** One cell ABOVE the editor, lit at 1+ (`--hm-4`) and unlit at 0 (`--hm-0`), never a ramp, 400ms radial-sweep on each keep + "N things kept today" (at 0: "Nothing kept yet today" / "Your day starts here."). Signed in = `completed.heatmap(days = 1).total` + unmerged local keeps, bumped ±1 on create / undo before the refetch; signed out = the local store through `useSyncExternalStore`. Offline signed-in reads "Can't reach your keeps right now", never a false 0. Today only, no strip, no week counts.

## Next

- **`completed.importLocal`** — one-time merge of device-local keeps on sign-in inside a single `prisma.$transaction`: `ImportBatch` id as the idempotency key, `completedAt` preserved, default category, repeated titles never deduplicated.

## Later

- Watch one named person use the signed-out page for 15 minutes, silently.
- Signed-out parity inside the packaged Electron LiveEditor panel (needs a main-process release; then point the panel at `/write`).
- skill-tree: keep or delete, decided by the criterion.
- Streak residue sweep: `calculateStreaks`, `useStreakNotifications`, `calc-streak`, the Year-in-Review "longest streak" line, the `AchievementAnimation` streak branch.
- #120 drag a finished task onto Completed.

## Cut (unless the criterion changes)

- #53 paste-import + AI auto-labeling.
- #124 side-distinct modifier chords.

## How this file is used

- **Ideas** land as GitHub Issues with the `idea` label (file them with `/spec`). **Decided** work moves into Now / Next / Later here. **Designs** live in `docs/design/`.
- Vocabulary for sorting an Issue: **Loop** (the write → Cmd+Enter pipe), **Reward** (seeing the keep, immediate first, yearly heatmap long-horizon), **Trace** (the Completed journal as memory).
- Reorder only by the criterion above; the North Star line never moves.
