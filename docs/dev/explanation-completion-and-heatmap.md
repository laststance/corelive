# Why completions are archived, not deleted (the heatmap invariant)

The Activity Heatmap is CoreLive's north star: every warm cell is a day you showed up, and the product's entire reason for existing is that you can look back and feel "今日自分頑張ったな." That makes one promise load-bearing above all others:

> **A day that was once lit must never silently go dark.**

This document explains the invariants that defend that promise. Each section is a specific way a future edit could erase a lit day — a hard delete, an edit-drift, a flag flip, a "tidied up" helper, a consolidated code path — and the guard that stops it. If you are about to touch completion, deletion, the heatmap read model, or the skill tree's XP, read this first. The _what_ and _where_ (field names, line ranges, the full procedure list) live in [`reference-data-model.md`](./reference-data-model.md) and [`reference-orpc-api.md`](./reference-orpc-api.md); this doc is the _why_ and the _what-breaks-if-you-don't_.

---

## The threat model: completions are fragile

A completion is not one row in one table. It arrives through two disjoint paths and is read back through a UNION, and the moment you delete or mutate the wrong thing, the heatmap loses a day with **no error, no failing test, no crash** — it just quietly counts one fewer. Silent data loss on the product's centerpiece is the worst failure mode this codebase has, and almost every invariant below exists to make it impossible.

### Two source tables feed one heatmap

Completion data lives in two tables, written by disjoint paths:

- **`Todo` with `completed = true`** — the live to-do list. `toggleTodo` flips `completed` and stamps `completedAt` (`src/server/procedures/todo.ts:208`).
- **`Completed`** — a separate completion-event stream, written by three paths that never touch the `Todo` lifecycle: BrainDump checkbox-ticks, bulk paste-import, and the archive flow described below.

The heatmap (and the day-detail dialog) read **both**, UNION them for a UTC day window, and bucket by day. The single read model is `fetchCompletedEntries` (`src/server/utils/completedAggregation.ts:61`), consumed by `completed.heatmap` and `completed.dayDetail`.

Because the two surfaces are **disjoint by construction** — BrainDump's tick bypasses the `Todo` lifecycle and writes `Completed` directly, while the `TodoList` complete flow never writes `Completed` — the UNION performs **no row-level dedup**. This is asserted by a unit test (`completedAggregation.test.ts:157`, "UNIONs rows from both tables sorted ascending by completedAt"). Do not add dedup: it would have nothing to deduplicate and would risk collapsing the legitimately-repeated completions that are the entire point (see [no dedup](#no-dedup-repetition-is-the-signal)).

---

## Invariant 1 — Archive before delete (the erasure bug)

**Threat:** the heatmap counts completed `Todo` rows directly. So hard-deleting a completed todo — the obvious implementation of "Clear completed" or a per-item delete — erases that todo's heatmap day. The user finished a task, watched the cell warm, cleared their list to tidy up, and the day went dark. That is the exact bug this invariant exists to kill.

**Guard:** a completed todo is **copied into `Completed` (with `archived: false`) before the `Todo` row is removed**, inside one transaction, so the heatmap day survives as a `Completed` row (which the heatmap also reads). A _pending_ todo carries no heatmap day, so it is still hard-deleted — that is lossless. The shared helper is `archiveCompletedTodos` (`src/server/utils/archiveCompletedTodos.ts`), called by:

- `todo.clearCompleted` — archives **all** completed todos (`todo.ts:262`).
- `todo.delete` — archives a single todo **only if it is completed** (`todo.ts:155`).

The copy is the load-bearing line:

```ts
completedAt: todo.completedAt ?? todo.updatedAt,
```

and `archived` is **omitted on write** so it inherits the schema's `@default(false)`.

This is also documented from the API side as invariant #6 in [`reference-orpc-api.md`](./reference-orpc-api.md).

### Sub-invariant: the archive/delete decision must happen _inside_ the transaction

`todo.delete` does **not** read `completed` outside the transaction and branch on it. That was a real time-of-check/time-of-use race (CodeRabbit #4): if a todo flipped `false → true` between the read and the delete, the "pending" branch would hard-delete a now-completed todo and erase its day. Instead `archiveCompletedTodos` (which filters `completed: true`) runs first _inside_ the tx and returns a count; the hard-delete fallback fires **only** when that count is `0`, i.e. the row was genuinely pending at tx time (`todo.ts:168-201`). If you refactor this procedure, keep the decision atomic with the delete.

### What this invariant does _not_ promise

`archiveCompletedTodos` is **not idempotent** (CodeRabbit #3, accepted). Two `clearCompleted` calls firing in parallel can each read the same completed todo before either deletes it and insert two `Completed` rows for one completion, inflating that day's count. There is **no data or XP loss** — the todo is still removed, `NodeAssignment` still orphans correctly, `archived:false` still holds — only a display count can over-count, and it requires a deliberate double-action that the confirm dialog already guards. The reasoning and the deferred-fix options are in the docblock at `archiveCompletedTodos.ts:23-32`. Stating the boundary matters: "lit days never vanish" is the guarantee; "the count is exact under concurrent clears" is not.

---

## Invariant 2 — `archived: false` is load-bearing

**Threat:** `Completed.archived` looks like a soft-delete flag, and a well-meaning contributor "cleaning up" the archive helper might think a row copied out of a deleted todo _is_ archived and set `archived: true`. The build stays green. Every test passes. And those days silently vanish from every user's heatmap — reintroducing the exact erasure bug Invariant 1 exists to fix.

**Guard:** `fetchCompletedEntries` filters `archived: false` on the `Completed` read (`completedAggregation.ts:99`). An `archived: true` row is invisible to the heatmap. Therefore the archive flow **must never write `true`**, and it doesn't — it omits the field so the row inherits `@default(false)` (`archiveCompletedTodos.ts:13-21`, the explicit LOAD-BEARING docblock). The flag exists for a _future_ hide-from-heatmap feature, not as a byproduct of archiving. If you ever wire something to set `archived: true`, that is a deliberate "remove this day from the heatmap" action — never a teardown step.

---

## Invariant 3 — `completedAt` is nullable with no default

**Threat (and the subtler one):** the heatmap needs to put each completion on the right _day_. The naive choice is `updatedAt` — but `Todo.updatedAt` mutates on every text/notes edit, so a task you finished on Monday and edited a typo in on Friday would jump to Friday on the heatmap. History would drift under the user every time they touched an old row. The `Completed` half has the same hazard with imported rows. And the "obvious" fix — add a `completedAt` column with a non-null default — is itself a trap: a `@default(now())` would stamp **every historical row** with the migration's timestamp, jumping all of your past completions onto migration-day in one jarring spike.

**Guard:** both `Completed.completedAt` (`prisma/schema.prisma:30`) and `Todo.completedAt` (`schema.prisma:101`) are `DateTime?` with **no `@default`**. The migrations backfilled existing rows explicitly (Completed ← `createdAt`, Todo ← `updatedAt`), so old rows kept their real days instead of all snapping to migration-day. New completions get a stamp at the moment they happen: `toggleTodo` writes `completedAt = new Date()` on every `false → true` transition (`todo.ts:251-254`). The heatmap then **filters and buckets by `completedAt`** — the same stable field for both the query window and the day assignment — so a completed-then-edited todo stays on its real day. The schema design notes spell this out verbatim at `schema.prisma:24-30` (Completed) and `:93-101` (Todo); the read-side rationale is in the `fetchCompletedEntries` docblock (`completedAggregation.ts:27-43`). The `居残りモード` (retain-completed-in-list) feature was the forcing function for the `Todo.completedAt` migration, because retaining a completed task in the editable list made edit-drift trivially reproducible.

### The fallback is asymmetric — and deliberately so

For any row whose `completedAt` is still null (an unconverted write path, or a pre-backfill row), the read coalesces to a fallback — but **a different fallback per table**:

```ts
// Todo half:
completedAt: row.completedAt ?? row.updatedAt // completedAggregation.ts:130
// Completed half:
completedAt: row.completedAt ?? row.createdAt // completedAggregation.ts:141
```

This is not an inconsistency to "clean up." Each table falls back to _its own_ best approximation of the completion day: a `Todo` has no insert-time notion of completion, so `updatedAt` (when it was last touched, which for a freshly-completed row is the completion) is the closest signal; a `Completed` row _is_ the completion event, so `createdAt` (when the event was recorded) is correct, and notably keeps a **dated import** — a row with a past `completedAt` and a today `createdAt` — on its real past day. Flattening both to one field would mis-bucket one of the two surfaces. The backfill means nulls are not expected in practice; the coalesce is defensive depth so a missed write path still lands on _a_ day rather than vanishing.

> **UTC bounds are part of this contract.** The heatmap buckets via `entry.completedAt.toISOString().split('T')[0]` — a UTC date string. So the query window is anchored to UTC midnight (`${todayIso}T00:00:00.000Z`), not local midnight. Anchoring to local midnight mis-buckets boundary-hour rows on any non-UTC host; Vercel runs UTC by default, which _masked_ the bug rather than preventing it (`completed.ts:51-69`). The window is `days - 1` past dates **plus today** via inclusive `gte`/`lte` = exactly `days` calendar dates (subtracting the full `days` would include one extra day at the lower edge — CodeRabbit on PR #38).

---

## Invariant 4 — completion flows only through `toggleTodo`

**Threat:** if more than one code path could set `completed = true`, each would have to remember to stamp `completedAt` and maintain the XP guard below. One that forgot would create completions with a null `completedAt` and a stale skill-tree assignment.

**Guard:** completion state changes **only** via `toggleTodo`. `updateTodo`'s input schema deliberately **omits `completed`** (`UpdateTodoSchema`), so the general-purpose update procedure _cannot_ flip completion even if a caller tries. `toggleTodo` is the single seam, and it is where both `completedAt` stamping (Invariant 3) and the XP guard (Invariant 5) live. Keep it that way: a new "mark done" path should call toggle, not write `completed` directly.

---

## Invariant 5 — the double-XP guard, and why archive must NOT mirror it

This is the single most error-prone area in the subsystem, because two code paths look like they should do the same teardown and **must do the opposite**. A future engineer "consolidating" them is exactly the reader this section exists to stop.

The skill tree lets a user drag a _completed_ todo onto a node to bank XP, recorded as a `NodeAssignment`. Two completion-path operations touch that assignment, in opposite directions:

**`toggleTodo` un-complete (`true → false`) DELETES the assignment** (`todo.ts:232-243`):

```ts
if (existingTodo.completed && !nextCompleted) {
  await tx.nodeAssignment.deleteMany({ where: { todoId: id } })
}
```

Without this, a user could complete a task → assign it for XP → un-complete it → re-complete it → assign it to a _different_ node, banking XP twice for one task. The `assignTask` completed-check alone is not enough, because the stale assignment would survive the un-complete and keep granting XP. **If you drop this deleteMany, you reopen the double-XP exploit.**

**`archiveCompletedTodos` deliberately does NOT delete the assignment** (`archiveCompletedTodos.ts:17-19`). When a completed todo is archived-and-deleted, its `NodeAssignment` is left to the schema's `onDelete: SetNull`: the row orphans with `todoId = null` and survives, and the popover keeps reading the `todoText` snapshot taken at assignment time. The user _earned_ that XP by finishing the task; clearing their completed list must not confiscate it. **If you "mirror" the toggle's deleteMany into the archive path for symmetry, you destroy earned XP every time a user clears their list.**

So the rule is directional and must stay that way:

| Path                     | NodeAssignment                     | If you change it                           |
| ------------------------ | ---------------------------------- | ------------------------------------------ |
| `toggleTodo` un-complete | **delete** it (exploit guard)      | Drop it → double-XP exploit reopens        |
| `archiveCompletedTodos`  | **keep** it (orphan via `SetNull`) | Mirror the delete → earned XP is destroyed |

The full XP-integrity model — the composite FK that forces same-tree edges, the `@@unique([todoId])` that blocks multi-node inflation, the `todoText` snapshot — is the subject of [`explanation-skill-tree.md`](./explanation-skill-tree.md). This doc covers only how the _completion_ paths interact with XP.

---

## No dedup: repetition is the signal

CoreLive **never deduplicates tasks**, anywhere — not in the todo list, not in import, not in the heatmap UNION. Logging the same task twice is two completions and warms the day twice. This is intentional: repetition is the habit/XP signal the product is built to celebrate (「些細でも経験値」), not noise to collapse. It is enforced structurally — paste-import's idempotency key is the `ImportBatch.id` (a per-batch client UUID), **never** task title or content (`schema.prisma:73-79`) — and the UNION read does no row-level merge (above). If you ever feel the urge to "clean up duplicates," that urge is the bug.

## Temperature = pride: the raw count is what blooms

These invariants converge on one synthesis: the heatmap buckets the **raw** completion count, repeats included, and that count is mapped to _warmth_, never to a green productivity grade. The count→intensity mapping is the single source of truth in `src/lib/heatmap-intensity.ts` (`getHeatmapIntensityFromCount`, bands at 1–3 / 4–9 / 10–19 / 20+), shared by both the heatmap cells and the day-detail band so a cell color and its dialog copy can never drift. The mapping never weights by recency, streak, or category — more completions, hotter day, full stop. A day reads as "you showed up this much," which is why the apex is amber/terracotta and **deliberately never GitHub-green**: green reads as work compliance; warmth reads as self-affirmation.

The canonical statement of this is the **Heatmap Invariance Rule** in [`DESIGN.md`](../../DESIGN.md) (the "temperature = pride … hot end blooms warm on every theme, forever" rule, line 147). The _mechanics_ of how that warmth is enforced across all 12 themes — the OKLCH seeds, the CI gate asserting the two hottest stops sit at hue ∈ [20, 70], the generated CSS pipeline — belong to [`explanation-theme-system.md`](./explanation-theme-system.md). What this doc owns is the _data_ half: the number that drives the color is the honest, un-deduplicated count of times you showed up.

---

## If you are about to change something here

| You're changing…                           | Re-read first        | The trap                                                                                                                         |
| ------------------------------------------ | -------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| "Clear completed" / delete a todo          | Invariant 1          | Hard-deleting a completed todo erases its heatmap day — archive first.                                                           |
| The `archived` flag / the archive helper   | Invariant 2          | Writing `archived: true` silently drops days; the build stays green.                                                             |
| `completedAt` / a completion timestamp     | Invariant 3          | A non-null default stamps history to migration-day; `updatedAt` drifts on edit; the per-table fallback is asymmetric on purpose. |
| Any path that sets `completed = true`      | Invariant 4          | Bypassing `toggleTodo` skips `completedAt` + the XP guard — route through toggle.                                                |
| `NodeAssignment` cleanup in toggle/archive | Invariant 5          | The two paths are _opposite_ by design — never consolidate them.                                                                 |
| The heatmap read / aggregation             | Two-tables, No-dedup | Both tables must surface; never add dedup or count-weighting.                                                                    |

**Related docs:** [`reference-data-model.md`](./reference-data-model.md) (the schema surface + invariants matrix) · [`reference-orpc-api.md`](./reference-orpc-api.md) (the procedure index; invariant #6 is archive-on-delete) · [`explanation-skill-tree.md`](./explanation-skill-tree.md) (the full XP-integrity model) · [`explanation-theme-system.md`](./explanation-theme-system.md) (how temperature=pride is enforced in color) · [`DESIGN.md`](../../DESIGN.md) (the Heatmap Invariance Rule) · the doc hub [`README.md`](./README.md).
