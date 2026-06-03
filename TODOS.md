# TODOS

Tracked deferrals flagged by `/plan-eng-review` (2026-05-11) during the Heatmap
Cathedral PR1.5 + PR2 finalisation. Each entry links back to the forcing
function that will pull it off the deferred list.

## Heatmap / Completion semantics

- [ ] **Migrate Todo heatmap bucket to a stable `completedAt` field.**
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
