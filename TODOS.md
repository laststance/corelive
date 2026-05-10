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
