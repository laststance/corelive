# CoreLive Roadmap

> **Criterion (物差し):** does it make the daily loop — write a line, press Cmd+Enter, it is kept — **faster, more reliable, or show the keep right where you pressed?**
> If it touches neither the loop nor that reward, it is a deletion candidate, not a polish candidate.
> **Never:** streaks, completion rates, grading, social comparison (DESIGN.md North Star).

**Login-wall baseline:** `__ s` until the wall in a private window at corelive.app/live-editor (fill in before any code).
**The one person who gets the no-login link:** `________` (fill in; if no name comes, ship anyway and leave Later empty on purpose).

Design record: [docs/design/roadmap-2026-09-no-login-live-editor.md](design/roadmap-2026-09-no-login-live-editor.md) (office-hours, 2026-09-02, approved).

## Now

- **PR-1 — `LiveEditorHost` adapter + signed-out web editor.** Extract the preload surface into a host interface with `electronPreloadHost` (byte-for-byte today) and `webLocalHost` (device-local notes + completions, clear-on-complete ON while signed out, focus on ready). `src/proxy.ts` keeps `/live-editor` protected only for `Electron/` user agents, so the packaged panel is unchanged. Footer: "Kept on this device. Sign in to keep it everywhere." → `/login?redirect_url=/live-editor`.
- **PR-2 — `TodayEmber` + `useTodayKeeps()`.** One warm cell under the editor + "N things kept today". Today only, no strip, no week counts. Signed in reads `completed.heatmap(days = 1).total`; signed out reads `localStorage` through `useSyncExternalStore`.

## Next

- **`completed.importLocal`** — one-time merge of device-local keeps on sign-in: `ImportBatch` id as the idempotency key, `completedAt` preserved, default category, repeated titles never deduplicated.

## Later

- Watch one named person use the signed-out page for 15 minutes, silently.
- Signed-out parity inside the packaged Electron LiveEditor panel (needs a main-process release).
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
