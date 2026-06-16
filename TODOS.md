# TODOS

Tracked deferrals flagged by `/plan-eng-review` (2026-05-11) during the Heatmap
Cathedral PR1.5 + PR2 finalisation. Each entry links back to the forcing
function that will pull it off the deferred list.

## Heatmap / Completion semantics

- [x] **Migrate Todo heatmap bucket to a stable `completedAt` field.** ✅ 2026-06-04 (feat/completion-feedback-idokori)
      Done in the completion-feedback / 居残りモード work: (a) `Todo.completedAt`
      added in migration `20260603235155_add_todo_completedat`, (b) backfilled
      from `updatedAt`, (c) `toggleTodo` stamps it on false→true, (d)
      `fetchCompletedEntries` filters/buckets by `completedAt ?? updatedAt`.
      Today `getHeatmap` and `getDayDetail` bucket Todo rows by
      `updatedAt`, which mutates on every edit and can shift heatmap dots
      forward in time when a user edits a long-completed Todo. Plan:
      (a) `Todo.completedAt: DateTime?` column,
      (b) backfill `UPDATE Todo SET completedAt = updatedAt WHERE completed = true`,
      (c) populate on the `complete()` mutation path,
      (d) swap `fetchCompletedEntries` to filter/bucket by `completedAt`.
      Forcing function: PR3 (Streak Notifications) needs immutable
      completion timestamps to avoid streak drift on backdated edits.
      Effort: ~half day human / ~30 min CC.

- [x] **archiveCompletedTodos is not idempotent — a rapid double-clear inflates the heatmap COUNT.** ✅ 2026-06-12 (CLOSED — accepted as a known limitation, NOT code-fixed; the forcing function below still reopens it if a wrong count is reported)
      Surfaced by CodeRabbit on PR #60 (#3). Two clears (or clear + per-item
      delete) firing in parallel can each archive the same completed Todo before
      either deletes it, inserting two Completed rows for one completion, so that
      day's heatmap count is over-stated. NO data or XP loss (the Todo is still
      removed, NodeAssignment SetNull, the archived:false invariant holds).
      ACCEPTED as a known limitation (PR #60, user call): it needs a deliberate
      double-action (and Clear is already confirm-gated) and only affects a
      display count. Full-fix options when revisited: (a) add `Completed.todoId` + a unique constraint + `skipDuplicates` on the archive insert, or (b) run
      the archive tx at `Serializable` isolation with P2034 retry. Both touch the
      LOAD-BEARING archive path (archived:false / SetNull / completedAt ??
      updatedAt) so they need care + a re-run of the heatmap-survives integration
      tests.
      Forcing function: a report of a wrong heatmap count, or the next change to the archive path.
      Effort: ~1-2h human / ~30 min CC.

- [x] **User-TZ bucketing.** ✅ 2026-06-11 (feat/deferred-a11y-polish-and-tz)
      Heatmap + day-detail now bucket each completion by the user's LOCAL
      calendar day, not UTC midnight (a JST 20:00 completion stays on "today"
      instead of yesterday's UTC cell). Done: a pure `toLocalDayKey(instant, tz)`
      util (`Intl.formatToParts`, per-zone formatter cache, UTC fallback on a
      null/garbage zone) is the single "which local day?" source of truth; the
      client passes its IANA zone, the server over-fetches a UTC window
      (`getHeatmap`: startLocalKey−1 UTC day → now; `getDayDetail`: ±1 UTC day)
      then filters/buckets by the local-day key. Streaks stay correct:
      `calculateStreaks` is pure UTC-midnight string math fed the local
      today/yesterday keys (DST-safe). Locked with `toLocalDayKey.test.ts`
      (JST / +14 / −12 / DST / null / garbage edges) and `calculateStreaks.test.ts`
      (today/yesterday grace boundary). Unblocks PR3 streak notifications (CEO §11.4).

## URL / Deep-link

- [x] **Bidirectional `?date=` URL sync.** ✅ 2026-06-11 (feat/deferred-a11y-polish-and-tz)
      The inbound deep-link (`/home?date=YYYY-MM-DD` opens the dialog) now has an
      outbound mirror: opening a cell, day-nav (`←`/`→`/`j`/`k`), and closing all
      write `?date=` via `window.history.replaceState` (Next 16 syncs it to
      `useSearchParams` with NO RSC refetch — avoids the "thrash" the old one-way
      design feared). `useUpdateEffect` skips mount so it can't clobber an inbound
      deep-link; a `nextUrl !== current` guard makes the inbound→outbound feedback
      a no-op (and `setSelectedDate` to the same value bails — no loop). URL build
      extracted to a pure, unit-tested `buildDateSyncUrl` (preserves other params);
      outbound behavior locked with two new `heatmap-day-detail.spec.ts` E2E cases.
      Chose replaceState uniformly (per the `router.replace` intent) so holding
      `→` doesn't spam history. Pairs cleanly with PR6 share image.

## Heatmap visual

- [x] **Per-month tie-break for max mark.** ✅ 2026-06-11 (feat/deferred-a11y-polish-and-tz)
      Ratified earliest-wins as the deliberate final rule (was an
      earliest-by-default placeholder pending feedback). Weighed + rejected
      _all-tied-marked_ (scatters ◎ as wallpaper in low-uniform months,
      breaks DESIGN.md sparsity) and _latest-wins_ (the glyph jumps / strips
      an earlier earned mark — anti-affirmation). Earliest = exactly one quiet
      anchor per month AND stable (pins to the first high-water-mark day,
      never moves). Locked in `calcMonthlyMaxDates.ts` doc + a stability spec
      test; code already implemented this behavior.

## Design system

- [x] **App-wide warm-up — push the whole UI toward the golden-hour mood.** ✅ 2026-06-03
      Surfaced in `/plan-design-review` (2026-05-30, Issue #53). When choosing the
      paste-import mockup, the user picked the warmest/most-atmospheric variant (C)
      and confirmed (D3) the real intent: the app still feels too cold, they want
      the whole thing warmer — toward C's golden-hour light. This is a design-system
      change, NOT paste-import: revise `globals.css` OKLCH tokens (warmer neutrals /
      light) + `DESIGN.md`. Needs the user's eye (subjective feel). paste-import uses
      tokens only, so it inherits this automatically once landed — no rework.
      **Done via `/design-consultation`:** captured the live authenticated `/home`
      at 3 warmth tiers × light/dark (runtime token injection, no rebuild), user
      picked the **golden-hour** tier. Raised OKLCH chroma on the cold neutral
      surfaces only (bg/card/muted/border/muted-fg) — light 0.016–0.026, dark
      0.026–0.028 — accent/text/heatmap untouched. WCAG AA re-verified before
      write (text/bg 17:1, muted-fg/card 5.6:1 light / 7.3:1 dark). Branch
      `feat/golden-hour-warmup`.
- [x] **a11y: `--primary` + `--primary-foreground` contrast.** ✅ 2026-06-11 (feat/deferred-a11y-polish-and-tz)
      Was 3.75:1 (below WCAG AA 4.5:1 for normal text) on the primary CTA / button
      label over the amber fill. Darkened the cathedral `--primary` amber (light +
      dark) in `src/globals.css` + the theme generator just enough to clear AA on
      `--primary-foreground` label text while keeping the brand warmth per DESIGN.md
      (DESIGN.md note updated). Pre-existing (NOT from the golden-hour diff); the
      taste call was resolved in PR #77 with the user delegating design calls to
      DESIGN.md. Locked with `cathedral-contrast.test.ts` so a future token tweak
      that drops the pair below AA fails CI.
- [x] **a11y: empty/unchecked `<Checkbox>` border.** ✅ 2026-06-11 (feat/deferred-a11y-polish-and-tz)
      Was ~1.22:1 on the ivory bg (failed WCAG 1.4.11 — 3:1 for UI-component
      boundaries). Fixed GLOBALLY (not per-surface) with a derived token
      `--control-border: color-mix(in oklch, var(--input), var(--foreground) 40%)`
      in `src/globals.css` (exposed as `--color-control-border`); the shadcn
      `<Checkbox>` now uses `border-control-border` instead of `border-input`. The
      40% foreground mix lifts the stroke to ≥3:1 on EVERY theme while staying quiet
      and "papery" per DESIGN.md (it tracks each theme's own `--input`/`--foreground`,
      so it stays consistent app-wide). Locked with `control-border-contrast.test.ts`
      (replicates the color-mix incl. dark-theme translucent `--input`, asserts ≥3:1
      on every theme — a neutral-token tweak that drops it below fails CI).

## Tooling / Safety

- [x] **Extend the local-DB guard to per-user write paths.** ✅ 2026-06-11 (feat/deferred-a11y-polish-and-tz)
      PR #58 added `scripts/assert-local-db.cjs` as a fail-closed chokepoint on
      the destructive reset paths (`db:reset` / `db:truncate` / `prisma:migrate`).
      Previously ungated: `pnpm prisma:seed` and the `*.createMany.test.ts` /
      `todo.archive.test.ts` integration suites run a per-user-scoped `deleteMany`
      against whatever `POSTGRES_PRISMA_URL` points at. Done: (a) chained the gate
      onto `prisma:seed` (benign double-run via `db:reset` accepted — the gate is
      idempotent and read-only); (b) extracted the three suites' duplicated
      `describeIfDb` into a shared `src/server/procedures/describeIfDb.ts` that —
      when `RUN_DB_INTEGRATION_TESTS=1` — shells out to the SAME gate at import and
      throws (fail-closed) before any suite/teardown runs, so a remote URL aborts
      the run instead of mutating prod. Reuses the gate verbatim (one source of
      truth — no URL parsing duplicated). Locked with `assertLocalDbGate.test.ts`
      (the gate had zero tests; covers localhost-allow, neon-block, the
      `?host=` parser-fail-open, backslash, and unparseable cases).
      Effort: ~30 min CC.

## Completion feedback / affirmation

- [x] **Clear-moment affirmation — a quiet acknowledgment when the user clears the completed list.** ✅ 2026-06-11 (feat/deferred-a11y-polish-and-tz)
      Surfaced in `/plan-design-review` (2026-06-04, D9). With Part 0 (archive-on-clear),
      clearing safely archives completed tasks but there was no moment of closure; the
      rows just left. Added a quiet, NON-gamified acknowledgment at the clear moment —
      "quiet companion" voice per DESIGN.md (no KPI %, no scoreboard, no streak), honoring
      the north star 「些細でも経験値、今日自分頑張ったなと自分を肯定できる感覚」. Fires only
      on a real clear (archives ≥1) and stays a soft microcopy beat, not a celebration.
      Part 0 (archive-on-clear) already landed, so the dependency was satisfied.

- [x] **居残りモード切替時の fade トランジション (D8) — enter SHIPPED + video-verified; fade-OUT intentionally instant (DESIGN-defensible).** ✅ 2026-06-12 (closed — user call; fade-OUT stays instant by design)
      Surfaced in `/plan-design-review` (2026-06-04, D8); built as plan task T10
      (P2). Toggling 居残りモード ON should make todos completed since the last
      clear RETROACTIVELY fade INTO the active list (DESIGN.md enter easing,
      `motion-safe:` gated); toggling OFF should fade them OUT symmetrically, so
      the "watch your day accumulate" reveal feels gentle, not a jarring pop.
      STATUS (branch `feat/d8-fade-and-agents-md`, PR #75): the ENTER half is
      IMPLEMENTED + RUNTIME-VERIFIED. `retroactivePopulateFade.ts` tells a
      mode-toggle populate apart from an in-place check by diffing the visible
      row-id set against the previous render (armed on the OFF→ON transition via
      `useUpdateEffect`), so D7 stays quiet; matching rows get a `motion-safe:`
      `tw-animate-css` fade-in. Verified on a live `pnpm dev` via Playwright (rAF
      opacity time-series + recorded video frames; OFF→ON toggle driven over the
      preferences BroadcastChannel): the completed rows fade opacity 0→1 over
      ~200ms (`animationName: enter`) with **NO leading blink** — they paint at
      opacity 0 on the very first frame. The pending control row stays opacity 1 /
      `anim:none` (selectivity holds, D7). Reduced-motion run: opacity flat at 1,
      `enter` never runs → instant (a11y honored).
      L1 UPDATE (2026-06-11, PR #77, merged): the pre-existing ~100ms blank-flash on toggle
      (TanStack query-key change) is now smoothed by `placeholderData: keepPreviousData`
      on the todo.list query (TodoList + FloatingNavigatorContainer). That removed the
      blank-flash the enter diff used to lean on ("first non-empty render is the settled
      one"), so the fade machinery was RE-ARCHITECTED to diff `pendingTodosFromQuery`
      (lockstep with `isPlaceholderData`) instead of the one-render-lagged
      `localPendingTodos`, gating the disarm on `!isPlaceholderData` so the kept-previous
      placeholder render can't swallow the fade. Net visual: pending rows stay rock-stable
      (no blank), only the completed rows fade in. ✅ VIDEO RE-VERIFIED 2026-06-12 (post-#77
      merge), live `pnpm dev` + Playwright, OFF→ON driven over the preferences BroadcastChannel,
      both motion AND reduced-motion. Precondition was DB-seeded (`UPDATE Todo SET completed`):
      UI completion clicks do NOT persist under the synthetic Clerk-test token — a HARNESS
      artifact, NOT a product issue (the fade only needs rows completed + newly-surfaced, not
      HOW). rAF opacity time-series + extracted `.webm` frames:
      — Pending control row rock-stable: opacity flat 1.0, `anim:none`, 0 frames unmounted, 0
      "No pending tasks" frames across the toggle (the keepPreviousData blank-flash fix holds;
      D7 selectivity holds).
      — Completed rows (motion): fade opacity 0→1, firstOp=0, monotonic ramp ≈175ms,
      `animationName: enter`, NO leading blink (frames go absent→faint→full, never bright-then-dim).
      — Completed rows (reduced-motion): firstOp=1, flat `[1,1,1,1,1]`, `anim:none`, `enter` never
      runs → instant snap (frames: clean absent→full in one frame, no ghost).
      Matches DESIGN.md Motion (short-tier fade 150–250ms, enter `ease-out`, `motion-safe:` gated,
      subordinate to the heatmap hero); the NEW look is MORE aligned with the "watch your day
      accumulate" reveal than the old blank-flash-then-fade-all.
      Scope: verified the toggle-while-TodoList-mounted path — exactly the in-place query refetch
      L1 touched. The navigate-to-Settings-then-back path is by-design fade-less (`useUpdateEffect`
      skips the mount run, so the arm never sets — no fade when the user wasn't watching); correct,
      untouched by L1, out of scope. **Enter half DONE + re-verified.**
      CLOSED 2026-06-12 (user call) — the symmetric fade-OUT (ON→OFF) ships INSTANT by design. Spiked 2026-06-11: it is NOT a
      simple "wire AnimatePresence" task. An in-place exit needs each leaving completed
      row to hold its INTERLEAVED list position while it fades (TodoList renders pending +
      completed-since-clear in ONE sortable `.map`, ~line 533), but those rows are
      `@dnd-kit/react@0.4` sortables registered by positional `index` (SortableTodoItem) —
      keeping a leaving row mounted to fade desyncs that index from the data array for the
      animation window. None of the clean paths escape it: a CSS "ghost" row pollutes the
      counts / SortableContext / sync (a background refetch in the 200ms window cuts the
      fade); Radix Presence keeps `useSortable` mounted → same index drift; a non-sortable
      overlay would need a two-index-space (visual vs sortable) rewrite because the leaving
      rows are interleaved, not a trailing block. Plus a design read: ON→OFF is a deliberate
      "hide my completed" action where instant removal reads correctly — the enter fade is
      the affirmation-bearing half and it ships. So OFF stays instant (DESIGN-defensible).
      Forcing function: a presence-capable sortable exit (dnd-kit exposes exit hooks, or the
      list moves off positional-index sortables), OR a product decision that the exit fade is
      worth a non-sortable-overlay rewrite. Effort: ~1-2h CC for the overlay rewrite + video
      verify; closed out as disproportionate to polish on a deliberate hide.

## Electron resilience

- [x] **Harden the remote-web / frozen-preload version-skew crash class in Settings.** ✅ 2026-06-04 (fix/electron-preload-version-skew-settings)
      Installed CoreLive loads remote prod web over its OWN frozen preload, so a
      newly-deployed component can call a preload METHOD an older app lacks →
      `undefined()` throws synchronously inside a bare effect → bubbles past the
      (previously absent) error boundary → blank app. Root-caused via /investigate:
      app v0.5.0 + web v0.8.0; `StartupWindowSettings` guarded the `settings`
      namespace but called `getStartupConfig` (landed later in commit 774cb55 / v0.6.0).
      Fix: (a) all Electron settings cards (Startup / Floating / BrainDump) **and**
      `ElectronStartupSync` now guard on the METHOD (`typeof api?.method === 'function'`),
      not just the namespace, rendering a calm "Update CoreLive…" card instead of
      throwing; (b) added `src/app/error.tsx` (route boundary) + `src/app/global-error.tsx`
      (the root-layout boundary `error.tsx` cannot cover — it only catches the page
      subtree, not the layout itself or its children like `ElectronStartupSync`) as
      systemic nets. `global-error.tsx` is dependency-free (own `<html>/<body>`, inline
      styles, no shadcn/logger/globals.css) so the last line of defense never re-enters
      a possibly-failed import graph. `ElectronStartupSync`'s guard is DEFENSIVE only
      (`settings` + `setHideAppIcon` shipped together in 9b800ba/4d2728d — no published
      gap), unlike the proven-live `getStartupConfig` crash. A web deploy protects old
      apps once live; users still must update the app to USE the startup settings.

## Electron floating windows

- [ ] **Cross-window live sync for the Keep-on-top toggles.** (deferred — feat/keep-on-top-preference)
      Surfaced by `/ship` adversarial review (F1). When BOTH the Settings "Keep on
      top" card AND a floating panel's in-window pin button are open at the same
      time, toggling one does NOT live-update the other's displayed state (the
      Settings switch / the pin glyph) until that surface is reopened. PERSISTENCE
      is always correct — all three layers (config, WindowStateManager.isAlwaysOnTop,
      live window) are written synchronously on every toggle; only the OTHER open
      surface's LABEL is stale. Accepted as T2-minimal (plan-approved): the realistic
      flow opens one surface at a time, and a cross-window broadcast is disproportionate
      to a label refresh. Full fix: echo each pin write over the existing preferences
      BroadcastChannel (or a main→renderer push) so every open surface re-reads.
      Forcing function: a user report of a stale toggle, or the next feature needing
      main→all-renderers preference mirroring. Effort: ~1-2h CC + a multi-window E2E.

- [x] **error.tsx / global-error.tsx design sign-off + reset() escape hatch.** ✅ 2026-06-11 (feat/deferred-a11y-polish-and-tz)
      The two error boundaries shipped with placeholder copy/styling and only a
      `reset()` affordance, which DEAD-ENDS on a deterministic error (e.g. the
      version-skew case before the app is updated) — reset just re-renders the same
      crashing tree. Done: (a) added a secondary escape hatch (a full reload / "go
      home" path) so a stuck recovery screen can always break the loop; (b) a warm
      palette pass on `error.tsx` toward the golden-hour mood (DESIGN.md). `global-error.tsx`
      stays intentionally inline-styled / token-free for robustness (last line of defense
      must not re-enter a possibly-failed import graph).
      STILL OPEN (separate-branch refactors, were only folded here — NOT blockers, NOT
      done in PR #77): degradation-copy consistency across the non-crashing components
      (R6) and a shared `SettingsStateCard` extraction (M-series dedup).
      Forcing function: the next touch of the Settings degradation cards.
      Effort: ~30 min CC.
