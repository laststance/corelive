# TODOS

## QA

### Playwright web E2E for the signed-out LiveEditor loop (when a second person actually uses it)

**What:** One Clerk-free Playwright spec: land on the public LiveEditor page in a fresh profile → editor focused → write → Cmd+Enter → the line clears and the Kept toast offers Undo → reload keeps the device-local record (`localStorage`).

**Why:** The recorded QA gate (eng review D11, 2026-09-02) only catches regressions at the next QA run. Once a named second person uses the page, their entry point deserves a per-PR guard.

**Context:** Playwright was removed on purpose in PR #167 (`2558b90f`): slow, flaky, non-deterministic fixture IDs. The signed-out loop needs neither Clerk nor the database, so it does not bring that flakiness back. Trigger = the "one person who gets the no-login link" in `docs/ROADMAP.md` has actually used it (same as the design's ceiling upgrade trigger). Start from the `playwright-cli` steps used for the recorded QA.

**Effort:** M
**Priority:** P3
**Depends on:** PR-1 merged; a named second user.

## Post-Floating-Navigator cleanup residue (plan eng review, 2026-09-05)

Four items found while auditing the codebase for Floating-Navigator residue (PR #178).
None belong in that deletion PR; all four are verified against `86ef29e1`.

### "Checking…" spins forever on the Updates settings screen

**What:** `handleCheckForUpdates` in `src/components/electron/AppUpdateSettings.tsx:220` sets `isChecking` true and clears it only in the `catch`. On the success path nothing clears it, so the button stays disabled with a spinning icon until the page unmounts.

**Why:** It is the one user-visible bug in the whole updater surface. Clearing `isChecking` used to be the job of the `updater-message` event, which has had no live listener since the main window was retired (T18) and loses its last sender in PR #178.

**Context:** `electron/main.ts:1654` compounds it: the `updater-check-for-updates` handler calls `autoUpdater.manualCheckForUpdates()` without awaiting and returns `true` immediately, so the renderer cannot infer completion from the resolve either. A fix needs the handler to report a real terminal state, or the renderer to poll `updater-get-status` until it settles.

**Effort:** S
**Priority:** P2
**Depends on:** PR #178 merged.

### Dead `ImportBatch` schema still costs index maintenance

**What:** Prisma `model ImportBatch`, plus `Completed.importBatchId` / `Todo.importBatchId` and their two `@@index` entries, have zero production writers since paste-import was deleted in v0.21.0 (PR #168). Seeds and tests are the only writers.

**Why:** Unlike the other v0.21.0 residue, this is not a free dead switch. Every insert into `Completed` and `Todo` still pays index maintenance for a column nothing reads.

**Context:** Deliberately kept out of the PR #178 cleanup because dropping it needs a migration, which makes it a maintainer call rather than a mechanical sweep. See the `core-only-rebuild-todo-vertical-deleted` note distinguishing dead switches from dead schema.

**Effort:** M
**Priority:** P3
**Depends on:** a migration window.

### Updater status text has no surface after PR #178

**What:** PR #178 removes the last `updater-message` / `updater-download-progress` senders, and with them `AppUpdateSettings`'s two live subscriptions. The native progress window (`AutoUpdater.showUpdateProgressWindow`) survives and still shows download progress. In Settings, the status line goes permanently blank, and worse: if `getStatus()` seeds a stale in-progress snapshot on mount, the Settings progress bar can no longer clear itself once the download finishes, errors, or turns out unnecessary — only closing and reopening Settings (a fresh mount) re-polls `getStatus()` and corrects it.

**Why:** Restoring it means wiring the updater events to the Settings window, which is a feature, not a deletion. Doing it inside the cleanup PR would hide a behavior addition inside a diff reviewers expect to be subtractive.

**Context:** The mount-time `updater-get-status` poll still populates the progress bar when Settings opens mid-download, so the bar is not dead, only no longer self-updating without a remount.

**Effort:** M
**Priority:** P3
**Depends on:** PR #178 merged.

### Streak residue in the animation and year-in-review surfaces

**What:** `src/components/animations/AchievementAnimation.tsx` keeps a streak branch and `YearInReviewModal` keeps a "longest streak" line. The `useStreakNotifications` hook is deleted by PR #178; these two are not.

**Why:** `DESIGN.md`'s north star rules out streaks, completion rates, grading, and social comparison. A visible streak counter contradicts it directly.

**Context:** `calculateStreaks` (`src/server/procedures/completed.ts:26`) and `src/lib/calc-streak.ts` are both still LIVE and feed the journal and year-in-review aggregation, so this is not a straight delete. Already listed in `docs/ROADMAP.md:28`; this entry records that the hook half is now swept and the UI half is not.

**Effort:** M
**Priority:** P3
**Depends on:** a call on whether the year-in-review line counts as celebratory copy.

### `ShortcutManager.reenableNativeTap()` has no caller left after the IPC contract narrowing

**What:** `electron/ShortcutManager.ts`'s `reenableNativeTap()` had exactly one caller: the `shortcuts-reenable-native-tap` IPC handler in `main.ts`, which was deleted (along with the rest of the unwired `shortcuts-*` invoke namespace — the plan's own W3 audit never flagged these two methods). `getNativeTapStatus()` stays alive as `reenableNativeTap()`'s own internal call, but `reenableNativeTap()` itself is now only exercised by `ShortcutManager.nativeRouting.test.ts` calling the method directly, never through a real trigger path.

**Why:** Found incidentally while narrowing the IPC contract (PR #178, W2) — fixing the two JSDoc comments that wrongly claimed IPC exposure surfaced the orphan. Deleting a public method of the #125 native-key-tap freeze-safety class is a more consequential, safety-adjacent change than IPC plumbing cleanup, so it was deliberately left out of that PR rather than folded in.

**Context:** The renderer-side re-enable control this fed was already gone (unwired `useElectronShortcuts.ts`, deleted earlier in the same sweep). If a real re-enable UI never returns, this method and its test should go together; if one is planned, the IPC channel needs re-wiring instead.

**Effort:** S
**Priority:** P3
**Depends on:** a call on whether the native-tap re-enable control ships.
