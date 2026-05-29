# Plan: Paste-to-import + AI auto-labeling (Issue #53)

|            |                                                                                                            |
| ---------- | ---------------------------------------------------------------------------------------------------------- |
| **Status** | Planned (architecture resolved; awaiting eng-review before implementation)                                 |
| **Issue**  | [#53](https://github.com/laststance/corelive/issues/53)                                                    |
| **Date**   | 2026-05-29 (office-hours + CEO review) · revised 2026-05-30 after an independent (cross-model) plan review |
| **Origin** | office-hours design session → CEO strategy/scope review → Codex outside-voice review                       |

## Vision

The platonic "import mouth": dump tasks from anywhere — paste, .txt/.md file drag-drop,
or another app's export — and Corelive parses, previews, and lands them into the right zone.
Past achievements → Completed → **the heatmap lights up** (the dogfood moment). Active work →
Todo list (bulk task entry — see the Todo caveat below). Repetition is preserved on purpose
(no dedup) — showing up twice counts twice. The shared parse+preview engine becomes
infrastructure every future intake builds on.

North Star: migration cost drops to zero, so the user can dogfood immediately and feel
「自分、ちゃんとやってきたじゃん」 the moment the heatmap fills.

> **Heatmap caveat:** Only the **Completed-zone** import lights the heatmap. Active-Todo-zone
> import creates _incomplete_ todos (`completed=false`), and the heatmap counts only
> `Todo.completed=true` + `Completed` rows. So the Todo-zone import's value is **bulk task
> entry**, NOT the "heatmap fills" moment. Do not conflate the two in copy or UX.

### Existing leverage

- `braindumpUtils.ts`: markdown **checkbox-only** grammar (`- [ ]`/`- [x]`) + `normalizeCompletedTitle`
  (trim + 255 clamp). Pure functions, no Electron deps — **safely shareable**.
  ⚠️ It does NOT strip URLs/headers and returns `null` for plain (non-checkbox) lines, so it
  cannot be reused verbatim for paste-import (see Parser spec).
- `completed.create` / `todo.create`: single-row ownership-verified creates — pattern reuse.
- `deleteCompleted`: atomic conditional `deleteMany` with `createdAt >= now()-COMPLETED_UNDO_WINDOW_MS`
  (60s) window — pattern reuse for batch undo.
- Heatmap = `Todo(completed=true)` + `Completed` UNION, count-based coloring (levels 0-4) — only
  the Completed bucket field changes (see migration).
- BrainDump (Electron-only) already does line-by-line `[x]`→Completed — sibling, not rebuilt.

## Architecture: separate "when it happened" from "when the row was inserted"

Add `Completed.completedAt` now. This dissolves an interlocking cluster of problems that the
naive "overload `createdAt`, no migration" approach created (surfaced by the cross-model review).

### Migration (one Prisma migration, this work)

- **`Completed.completedAt DateTime?`** — add as **nullable**, then **backfill `completedAt = createdAt`**
  for existing rows via an `UPDATE` step in the same migration. New rows write `completedAt` on
  insert (default `now()`).
  - ⚠️ **Do NOT add it as `@default(now())` non-null.** A non-null default would stamp every
    _existing_ row with the migration timestamp → all historical Completed rows would jump to
    migration-day on the heatmap. Nullable column + explicit backfill avoids this.
- **`Completed.importBatchId String?`** (indexed) — tags a paste batch for idempotent bulk undo + history.
- **`Todo.importBatchId String?`** (indexed) — same, for Todo-zone bulk undo.
- **NOT in this migration:** `Todo.completedAt` (tracked separately in `TODOS.md`). It blocks only
  the **Todo-zone date-override**; nothing in PR1/PR2 depends on it.

### Heatmap

Completed bucket switches from `createdAt` → **`completedAt ?? createdAt`** (the `??` is a defensive
fallback for any row missed by backfill). Update `completedAggregation.ts`. Verify existing rows do
not shift days.

### Undo (no longer keyed off the semantic date — that was the bug)

- Bulk undo deletes by **`importBatchId`**, guarded by **`createdAt >= now()-COMPLETED_UNDO_WINDOW_MS`**.
  Because `createdAt` is the real insert time (never overridden — `completedAt` holds the semantic
  date), the 60s window works even when `completedAt` is a past date.
- Undo no longer depends on `createMany` returning ids. Prisma `createMany` returns only `{count}`;
  `importBatchId` sidesteps the need for returned ids entirely.

### Bulk API shape (forward-compatible)

- `completed.createMany({ items: Array<{ title; categoryId?; completedAt? }>, importBatchId })`, `items.max(1000)`.
- `todo.createMany({ items: Array<{ title; categoryId? }>, importBatchId })`, `items.max(1000)`
  (no `completedAt` until the `Todo.completedAt` migration).
- Category verification handles a **set** of categoryIds (per-line override ready), not a single id.
- `createMany` itself returns `{count}`; use `createManyAndReturn` **or** rely on `importBatchId` for
  the undo set (order is irrelevant — undo deletes the whole batch).

## Idempotency vs dedup (these are different problems)

- **No-dedup governs _semantic_ repetition** — "English study" 3× is 3 real habit signals; never collapse.
- **Idempotency via `importBatchId` prevents _accidental_ duplication** — network retry, React
  double-fire/StrictMode, double-click, or a second tab resubmitting the **same** batch. The client
  generates one `importBatchId` per paste-confirm; a resubmit of that id is a no-op.
- Idempotency closes the accidental-dup vector **without** collapsing intentional repeats. The
  double-submit button guard stays as a UX nicety; the batch id is the real guard.

> **Product principle:** No deduplication, ever. Repeating a task is the point — habit formation
> and skill-tree XP. The heatmap and skill tree reward repetition, not collapse it.

## Scope

| #   | Proposal                              | Decision     | Reasoning                                                               |
| --- | ------------------------------------- | ------------ | ----------------------------------------------------------------------- |
| 1   | Duplicate detection in preview        | **REJECTED** | Repetition is intentional (habit + skill-tree XP). Dedup erases signal. |
| 2   | Bulk Undo (one toast → delete batch)  | ACCEPTED     | Batch-id-based + window-guarded (see Undo)                              |
| 3   | Per-line category override in preview | ACCEPTED     | `items[]` schema + multi-id verification make it cheap                  |
| 4   | File/MD drag-drop import              | ACCEPTED     | Platform step toward the "import mouth"; same parser                    |

## PR Split (layer axis)

**PR1 — Server + tests (no UI):**

- Prisma migration: `Completed.completedAt?` (+ backfill = `createdAt`), `Completed.importBatchId?`
  (+ index), `Todo.importBatchId?` (+ index).
- Heatmap aggregation → `completedAt ?? createdAt` (`completedAggregation.ts`).
- Shared **paste parser util** (line-oriented — see Parser spec). Pure, web/Electron-safe. Unit tests.
- `completed.createMany` (items[], importBatchId, get-or-create category, `completedAt` default now()).
- `completed.deleteMany({ importBatchId })` (ownership + window guard, atomic, idempotent).
- `todo.createMany` (items[], importBatchId) + `todo.deleteMany({ importBatchId })`.
- Zod schemas (`items[]`, `importBatchId`, `.max(1000)`), router wiring, constants
  (`MAX_IMPORT_LINES_PER_BATCH = 1000`, undo-window reuse/define).
- Procedure + parser tests: override-`completedAt` path, idempotent-resubmit, window-expiry,
  invalid-line filtering, existing-row heatmap stability.

**PR2 — UI + Undo + power-import:**

- Shared `PasteImport` component: textarea + Vercel-env-style preview + shared category Select
  (context default → server get-or-create) + confirm (double-submit guard + per-paste `importBatchId`).
- Completed-zone entry point (`/home`) + Bulk Undo toast (`deleteMany` by `importBatchId`).
- Active-Todo entry points (TodoList + FloatingNav — note the single-line-input constraint) + Todo undo.
- Per-line category override; file/MD drag-drop.
- Empty states; offline / `createMany` failure (preserve preview, allow retry); `DESIGN.md` voice.
- **Run a design review before building** (real UI surface).
- ⚠️ PR2 is large. Keep it reviewable with commit ordering server-contract → Completed-UI → Todo-UI
  → power; split a PR3 if it grows past review comfort.

## Parser spec

The existing `braindumpUtils` parser is **checkbox-only** and strips nothing; reusing it verbatim
would parse plain pasted text to **zero** tasks. The paste-import parser is **new and line-oriented**:

- Every **non-blank** line → one task. Blank lines skipped.
- Strip **only** a leading list/checkbox prefix (`- [ ] `, `- [x] `, `- `, `* `, `+ `, `1. `, `2) `, …)
  to derive the title; a `[x]` prefix may flag "already done."
- **Preserve** URLs, header text (`# ...`), and bullet body as the title — a task name that _is_ a
  URL or a heading is legitimate.
- Reuse `normalizeCompletedTitle` (trim + 255 clamp). Reuse the checkbox regex for prefix detection only.
- **Client preview and server normalization run the SAME pure util** so preview count == inserted count.

## Validation / partial-batch behavior

- Invalid lines (empty after normalize) are **excluded in the preview** (shown as "N skipped"), and
  only valid lines are sent. Insert is atomic over the **already-filtered valid set**, so "one bad
  line fails all 1000" cannot occur — bad lines never reach the insert.
- Overflow cap = **1000** lines/batch, enforced on **both** client (preview) and server (Zod
  `.max(1000)`). Overflow is shown, not silently dropped: "N lines exceeded — importing the first 1000."
  Precedent: `BRAINDUMP_NOTE_LINES_PER_CAP = 200` (import is bulkier → 1000).

## Category fallback

Drop the "'General' always exists via seed" assumption (breaks for existing users, deletion, manual
DB edits). Server-side **get-or-create** the user's default category if missing; never crash on a
deleted/missing categoryId.

## Confirmed premises

- Date: paste lands **today-fixed** in Slice 1 (`completedAt` = now()); manual/AI date editing is
  Slice 2 (Completed zone ready immediately via `completedAt`; Todo zone waits for `Todo.completedAt`).
- categoryId: shared picker, context-default (get-or-create fallback). Per-line override added (PR2).
- Routing: by paste-destination (location-based). Completed zone → Completed; active surfaces → Todo.
- Heatmap colors by COUNT (level 0-4), not category. Null/unset category still lights the cell.

## Success copy

"N more days you showed up" is **wrong** for bulk same-day imports (50 items today = 1 day, not 50).
Copy must honor repetition-as-habit-count without implying "days" (e.g. "N more wins logged" / warm
temperature, never "N tasks (+12%)"). Exact wording → design review.

## Slice 2 — AI auto-labeling (open design)

Dynamic category enum (built from the user's real `category.list`) is necessary but **not sufficient**.
Slice 2 needs its own design pass for: confidence threshold, low-confidence fallback,
user-confirmation step, cost/rate-limit, and **privacy** (what pasted text leaves the device, where
the model runs). Stack: Vercel AI SDK + OpenRouter + `generateObject` + Zod, **server-side only**.

## Dependencies & deferred

- **This work owns** the `Completed.completedAt` + `importBatchId` migration (above).
- `Todo.completedAt` migration (`TODOS.md`) — blocks **only** the Todo-zone _date-override_ (a Slice 2
  Todo concern). Shared forcing function with the Streak feature.
- user-TZ bucketing — pre-existing deferred item (`TODOS.md`).
