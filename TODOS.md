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

- [ ] **archiveCompletedTodos is not idempotent — a rapid double-clear inflates the heatmap COUNT.**
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

- [ ] **User-TZ bucketing.** Heatmap currently uses UTC midnight buckets.
      JST 8:00 completion lands on previous UTC day. Defer until PR3
      requires it (streak calcs need user TZ per CEO §11.4).

## URL / Deep-link

- [ ] **Bidirectional `?date=` URL sync.** PR2 introduces inbound deep-link
      handling (`/home?date=YYYY-MM-DD` opens the day dialog). Promote day-nav
      (`←` / `→`) to call `router.replace('?date=…')` so the URL stays in
      sync with the dialog. Pairs cleanly with PR6 share image (URL
      pre-populated in clipboard). Forcing function: PR6 share flow.

## Heatmap visual

- [ ] **Per-month tie-break for max mark.** When multiple days in a month
      tie for the max contribution, the "month max" marker currently picks
      the earliest. Revisit if users surface complaints about "missed" tied
      days. Forcing function: user feedback on PR1.5.

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
- [ ] **a11y: `--primary` + `--primary-foreground` contrast is 3.75:1 (below WCAG AA 4.5:1 for normal text).**
      Pre-existing — surfaced by the codex design-voice review during the golden-hour
      warm-up ship (2026-06-03); NOT introduced by that diff (the amber `--primary`
      tokens were untouched). Left as a follow-up because fixing it darkens the brand
      amber — a taste call that needs the user's eye and a fresh screenshot pass, not a
      drive-by token tweak. Affects primary CTA / button label text on the amber fill.
- [ ] **a11y: empty/unchecked `<Checkbox>` border is ~1.22:1 on the ivory bg (fails WCAG 1.4.11 — 3:1 for UI-component boundaries).**
      Surfaced in `/plan-design-review` (2026-06-04, D12). The unchecked shadcn
      `<Checkbox>` uses `border-input` (`--input` = oklch(0.908 0.022 76)); against the
      warm-ivory `--background` (oklch(0.975 0.016 80)) that is only ~1.22:1 — well below
      the 3:1 bar for non-text UI-component boundaries. Pre-existing and app-wide (NOT
      introduced by the completion-feedback / 居残りモード work), but that feature centers
      the pending checkbox as the actionable foreground, so it raises the stakes.
      Tracked HIGH priority (D12). Proper fix = a thin, "papery" warm stroke that still
      reaches ≥3:1, applied to the GLOBAL `<Checkbox>` (NOT a per-surface override — that
      would make checkboxes inconsistent across the app). Needs the user's eye (the stroke
      must stay quiet/papery per DESIGN.md while passing AA). DISTINCT from the
      `--primary`/`--primary-foreground` 3.75:1 entry above (that is the amber CTA label;
      this is the unchecked checkbox border).
      Forcing function: a focused checkbox-component a11y pass, or the next time the
      pending checkbox is touched (e.g. the 居残りモード build).
      Effort: ~1h human / ~15 min CC.

## Tooling / Safety

- [ ] **Extend the local-DB guard to per-user write paths.** PR #58 added
      `scripts/assert-local-db.cjs` as a fail-closed chokepoint on the destructive
      reset paths (`db:reset` / `db:truncate` / `prisma:migrate`). Still ungated:
      `pnpm prisma:seed` and the `*.createMany.test.ts` integration suites run a
      per-user-scoped `deleteMany` against whatever `POSTGRES_PRISMA_URL` points at.
      Blast radius is bounded (one test user's named fixture rows, not a wipe), so
      this is LOW — but a misconfigured prod URL would still mutate prod data.
      Plan: chain the guard onto `prisma:seed` (mind the double-run via `db:reset`)
      and assert local in the integration-test setup (extend `describeIfDb`).
      Forcing function: any incident, or the next time dev→Neon is revisited.
      Effort: ~30 min CC.

## Completion feedback / affirmation

- [ ] **Clear-moment affirmation — a quiet acknowledgment when the user clears the completed list.**
      Surfaced in `/plan-design-review` (2026-06-04, D9). With Part 0 (archive-on-clear),
      clearing now safely archives completed tasks — but there is no moment of closure;
      the rows just leave. A quiet, NON-gamified acknowledgment at the clear moment (e.g.
      a soft "8 things done — good day" / 「今日は8個 — お疲れさま」 microcopy, NOT a
      celebration, NOT a streak) could honor the north star
      「些細でも経験値、今日自分頑張ったなと自分を肯定できる感覚」. DEFERRED as a fast-follow
      (D9: "record, don't build now") to respect the CEO-review HOLD SCOPE — the current
      feature set (completion feedback + 居残りモード) ships first. Voice must follow
      DESIGN.md "quiet companion" (no KPI %, no scoreboard).
      Depends on: Part 0 (archive-on-clear) landing first.
      Forcing function: post-ship polish pass on the completion-feedback feature.
      Effort: ~1-2h human / ~20 min CC.

- [ ] **居残りモード切替時の fade トランジション (D8) — enter-half SHIPPED + runtime-verified; only the fade-OUT remains.**
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
      opacity 0 on the very first frame (the Loading-flash full-remount resolves
      the fade-ids before paint, so rows never paint without the class). The
      pending control row stays opacity 1 / `anim:none` (selectivity holds, D7).
      Reduced-motion run: opacity flat at 1, `enter` never runs → instant (a11y
      honored). The advisor-flagged "fade class lands one commit after mount"
      blink does NOT materialize in practice — no layout-effect fix needed. Side
      note (pre-existing, NOT this work): toggling retain briefly blanks the list
      ~100ms (TanStack query-key change, no `keepPreviousData`); the fade plays
      cleanly right after. A `placeholderData: keepPreviousData` pass could smooth
      that flash — separate follow-up.
      STILL DEFERRED: the symmetric fade-OUT (ON→OFF) needs an unmount animation
      (framer-motion `AnimatePresence`, not yet wired for this list), so OFF is
      enter-only / instant for now (TODOS.md-sanctioned fallback). Feature works
      without it: rows disappear instantly on toggle-OFF.
      Forcing function: whenever `AnimatePresence` lands for any list.
      Effort remaining: the fade-OUT waits on `AnimatePresence` (~30 min CC then).

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

- [ ] **error.tsx / global-error.tsx want a design sign-off + a reset() escape hatch.**
      The two new error boundaries above ship with placeholder copy/styling ("Give
      that another try" + a plain card) pending Raphtalia's design eye — `global-error.tsx`
      is intentionally inline-styled (no design tokens) for robustness, so it especially
      wants a later pass once the failure mode is confirmed rare. Separately, both
      boundaries' only affordance is `reset()`, which DEAD-ENDS on a deterministic error
      (e.g. the version-skew case before the app is updated): reset re-renders the same
      crashing tree. Add a secondary escape (a full `window.location.reload()` / "reload"
      / "go home" action) in the same pass. Deferred review findings folded here:
      degradation-copy consistency across the non-crashing components (R6) and a shared
      `SettingsStateCard` extraction (M-series dedup) are separate-branch refactors, not
      blockers.
      Forcing function: a design polish pass on the error screens, or the next report of
      a stuck recovery screen.
      Effort: ~1h human / ~20 min CC.
