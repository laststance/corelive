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
- Heatmap colors by COUNT (level 0-4), not category. **Every imported row gets a real `categoryId`** —
  `categoryId` is NOT NULL with `onDelete: Restrict`, so there is no null-category row; get-or-create the
  default category before insert (see Eng fold-ins).

## Success copy

"N more days you showed up" is **wrong** for bulk same-day imports (50 items today = 1 day, not 50).
Copy must honor repetition-as-habit-count without implying "days" and never use a KPI/percentage.

**Resolved (`/plan-design-review` D6 — "quiet accumulation", let the heatmap perform):**

| Moment                       | English                                           | 日本語                            |
| ---------------------------- | ------------------------------------------------- | --------------------------------- |
| Completed import success     | `50 added — today's lit`                          | `50個、今日に。`                  |
| Active-Todo import success   | `50 added to your list`                           | `50個、リストに。`                |
| Active-Todo expectation note | `they'll light the heatmap as you complete them`  | `終えるとヒートマップが灯る`      |
| Paste textarea placeholder   | `paste your wins — one per line`                  | `やったこと、1行ずつ貼って`       |
| Empty preview (all blank)    | `nothing to import yet — paste a few lines above` | `まだ何も無いよ — 上に数行貼って` |

The heatmap fill animation is the celebration; copy stays one quiet line. No "days", no `(+12%)`, no
streak-shame. Honors no-dedup (50 logged = 50, same day or not).

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
- **Design-system warm-up (Track 1, separate from #53):** make the whole app feel warmer — toward the
  golden-hour mood of approved mockup variant C. Touches `globals.css` OKLCH tokens + `DESIGN.md`. Pursue
  via `/design-consultation`; paste-import uses tokens only, so it inherits this automatically. See `TODOS.md`.

## Design decisions (`/plan-design-review` · 2026-05-30 · score 5/10 → 9/10)

Visual reference: approved mockup variant **C** (see Approved mockup). C's _structure_ is locked; its
literal candle / cathedral-window / vignette are **not shipped** (mockup atmosphere only — the real
backdrop is `/home`). Warmth comes from approved OKLCH tokens, so paste-import inherits the future
system warm-up (Track 1) automatically. No hardcoded decoration.

### Entry points (D4 — explicit button per zone)

- Each zone gets a quiet **"Import"** affordance (text button + paste icon) that opens the shared
  `PasteImport` dialog. No paste-hijacking of single-line inputs.
- `/home` Completed zone: Import near `CompletedTodos` (by the existing "Clear all").
- `/home` Active-Todo zone: Import next to `AddTodoForm`'s "Add".
- FloatingNav (D7): Import **activates the main window** and opens the dialog there (no cramped dialog in
  the narrow Electron window). Needs a transition cue so the window-switch isn't jarring.

### PasteImport dialog — hierarchy & tokens (variant C + DESIGN.md)

Read order: serif title → textarea → shared category + count → preview list → confirm.

- Container: Radix `Dialog`, `lg` radius (12px), warm `--card` surface, single soft modal elevation.
- Title: Newsreader (H2 24px), e.g. `Add to Completed` / `Add to your list` (warm — not the cold "Archive").
- Textarea: Inter Tight 15px, `md` radius (8px), placeholder in the quiet voice (see copy table).
- Count: Geist Mono 13px tabular — `N tasks · M skipped` (and the over-cap line below).
- Shared category: one Select (default = `useSelectedCategory()`); per-row override (T11) shown as a
  quiet **inherited chip at rest**, revealing a small Select only on hover/focus — **no always-on per-row
  dropdowns** (the calm that made C beat B).
- Footer: ghost `Cancel` + ONE amber `--primary` confirm `Add N to Completed`. Amber appears nowhere else.

### Interaction states (Pass 2)

| State                    | What the user sees                                                                                                                                              |
| ------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Idle / empty             | Placeholder `paste your wins — one per line`; confirm disabled; preview shows the empty line below                                                              |
| Typing / parsing         | Live preview per non-blank line; count updates (`12 tasks`); parse is synchronous/instant                                                                       |
| Preview (valid)          | Rows listed; `12 tasks · 2 skipped`; confirm enabled `Add 12 to Completed`                                                                                      |
| Over cap (>1000)         | `1,200 lines · importing the first 1,000` (Geist Mono); confirm `Add 1,000`; nothing silently dropped                                                           |
| Submitting               | Confirm spinner + `Adding…`; textarea/rows locked; double-submit guarded (+ per-paste `importBatchId`)                                                          |
| Success                  | Dialog closes; **Completed** → heatmap fill + toast `50 added — today's lit` (~10s) + 60s inline `Undo import`; **Todo** → toast `50 added to your list` + note |
| Partial                  | N/A by design — invalid lines are filtered in preview before insert, so "1 bad line fails 1000" cannot occur                                                    |
| Error / offline          | Toast `Couldn't reach the server — your paste is safe`; dialog stays open, textarea + rows preserved, `Try again` re-submits the **same** `importBatchId`       |
| Empty preview (no valid) | `nothing to import yet — paste a few lines above` (warm, never "No items found.")                                                                               |

### Bulk Undo (D5)

~10s toast `Undo` **plus** the freshly-imported batch rendered as a group in the Completed list —
`Imported just now · Undo import` — for the full 60s `COMPLETED_UNDO_WINDOW_MS`. Undo deletes by
`importBatchId`. Discoverable and forgiving for a 50-item action; does not depend on the transient toast.

### Emotional arc & copy (D6 = quiet accumulation)

See the resolved copy table under **Success copy**. The heatmap fill is the payoff; words stay one quiet
line. Active-Todo import explicitly sets the expectation that it does **not** light the heatmap (bulk
entry; completing lights it) — preventing the "imported 50, nothing lit" let-down.

### Responsive (Pass 6)

- Mobile web (<640px): dialog becomes a near-full-width sheet (`Dialog` is already `sm:max-w-lg`);
  textarea + preview stack; touch targets ≥44px; per-row override via tap (no hover dependency).
- Desktop / main window: `max-w-xl`/`2xl` to give the preview room (wider than the default `lg`).
- FloatingNav: opens in the main window (D7).

### Accessibility (Pass 6)

- Radix `Dialog` gives focus-trap, ESC, focus-restore, labelled title/description.
- `aria-live="polite"` announces `12 parsed, 2 skipped` as the textarea changes (debounced).
- Preview rows keyboard-navigable; per-row category Select Tab-reachable; remove-row control labelled.
- Contrast ≥4.5:1 on body (warm charcoal on paper passes); amber confirm uses `--primary-foreground`.
- Toast `Undo` and inline `Undo import` are real buttons (not hover-only); SR announces the success line.

### AI-slop guardrails (Pass 4)

Preview rows are a quiet **dense list, not a card grid** (App UI rule: cards only when the card IS the
interaction). No decorative blobs/orbs/vignette/candle. One amber accent. Serif title. Themed Sonner toast.

### Deferred (design)

- Honoring a `[x]` paste prefix to route a line to Completed even from the Active-Todo zone — v1 keeps
  routing purely by destination (`[x]` is stripped, not honored for routing) to keep the model simple.
- Decoration-free regeneration of the C mockup (optional — `approved.json` records that candle/vignette
  are not shipped).

## Approved mockup

| Screen                              | Path                                                                                 | Direction                                                                                      | Notes                                                                                                                                                                                                  |
| ----------------------------------- | ------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| PasteImport dialog (Completed-zone) | `~/.gstack/projects/laststance-corelive/designs/paste-import-20260530/variant-C.png` | Calm, warm "Archive to Completed" dialog; one shared category pill; preview list as the anchor | Structure locked. Literal candle/window/vignette **not shipped** — warmth via OKLCH tokens. User chose C (D2) for calm + warmth; D3=B → whole-app warm-up tracked as Track 1 / `/design-consultation`. |

## Eng + DevEx review fold-ins (2026-05-30, autonomous auto-decide)

Both plan reviews ran in autonomous mode (recommended options, no blocking questions); criticals
resolved before implementation.

### Engineering (plan-eng-review)

- **Idempotency mechanism** (was a hand-wave; `importBatchId` is non-unique, so existence-checks race).
  New **`ImportBatch { id String @id; userId Int; createdAt DateTime @default(now()) }`** table
  (`id` = client batchId). `createMany` runs inside a `$transaction` that **first inserts the
  `ImportBatch` row**; a duplicate id throws Prisma **P2002** → caught → no-op that re-queries and returns
  the existing batch count. Same-txn ⇒ a failed `createMany` rolls back the guard, so a genuine retry
  still inserts. Uniqueness is on the **batch id only**, never task content → respects no-dedup.
- **Migration:** `Completed.completedAt DateTime?` with **NO `@default`** (a non-null default stamps
  historical rows + causes Prisma drift). `prisma migrate dev` won't generate the backfill —
  **hand-edit the migration SQL** to append `UPDATE "Completed" SET "completedAt" = "createdAt" WHERE "completedAt" IS NULL;`.
  Add `ImportBatch` table, `Completed.importBatchId String? @@index`, `Todo.importBatchId String? @@index`.
  Import path sets `completedAt: new Date()`; `createCompleted` unchanged (null → coalesce).
- **Category is NOT NULL (`onDelete: Restrict`).** Get-or-create the default category (`findFirst`
  `isDefault`, else create + catch P2002 + re-query) is mandatory before `createMany`.
- **`todo.deleteMany({ importBatchId })`** includes the same `createdAt >= now()-COMPLETED_UNDO_WINDOW_MS`
  window guard as `completed.deleteMany` (parity, atomic).
- **Promote `COMPLETED_UNDO_WINDOW_MS`** from a private const in `completed.ts` to a shared constants
  module (batch undo + UI 60s window both consume it).
- **Todo bulk `order`:** imports land last (documented); no per-item position fidelity in Slice 1.
- **Heatmap:** coalesce in **JS** (`row.completedAt ?? row.createdAt`); select `completedAt`; date-range
  **filter stays on `createdAt`** for Slice 1 (latent Slice-2 bug → TODOS note + test stub).
- **Parser** lives in `src/lib/` (pure, type-only schema import), reusing `braindumpUtils`
  `normalizeCompletedTitle` + checkbox regex.
- **Tests add:** resubmit-returns-prior-count under concurrency (P2002 path); undo isolation across users
  AND batches; other-user `categoryId` rejected; server-side post-normalize empty-line drop; over-cap at
  exactly 1001; existing-row heatmap stability.

### DevEx (plan-devex-review)

- **Wrong-zone defense pre-confirm:** the Todo dialog shows the expectation note **at preview**, not only
  on success: `these stay open — they'll light the heatmap as you complete them` / `終えるとヒートマップが灯る`.
- **Wrong-zone recovery:** the imported Todo batch group offers **`Move to Completed`** (re-routes the
  `importBatchId` set) within the 60s window.
- **Slice-1 copy honesty:** Slice 1 lands everything on **today's** cell (`completedAt = now()`), so
  Completed success copy → `50 added — today's lit` / `50個、今日に。`. D6's `added to your year` framing
  returns in **Slice 2** (dated import). Reversible if the aspirational framing is preferred.
- **Day-one discoverability:** the empty Heatmap / empty Completed state surfaces the Import affordance inline.
- **Dialog title** `Archive to Completed` → `Add to Completed` (warmer).

## GSTACK REVIEW REPORT

| Review        | Trigger               | Why                             | Runs | Status                | Findings                                                                                                  |
| ------------- | --------------------- | ------------------------------- | ---- | --------------------- | --------------------------------------------------------------------------------------------------------- |
| CEO Review    | `/plan-ceo-review`    | Scope & strategy                | 1    | clean (prior session) | 4 proposals · 3 accepted · 1 rejected (dedup); D7=A architecture                                          |
| Outside Voice | `/codex review`       | Independent 2nd opinion         | 1    | revised (prior)       | 23 findings · 2 critical fixed (createMany ids, undo window)                                              |
| Eng Review    | `/plan-eng-review`    | Architecture & tests (required) | 1    | issues folded         | 2 CRITICAL (idempotency → ImportBatch/P2002; migration backfill) + NOT-NULL-category + 6 more, all folded |
| Design Review | `/plan-design-review` | UI/UX gaps                      | 1    | CLEAR (FULL)          | score 5/10 → 9/10 · 7 decisions · 0 unresolved · mockup C approved                                        |
| DX Review     | `/plan-devex-review`  | Developer experience gaps       | 1    | issues folded         | wrong-zone pre-confirm + Move-to-Completed recovery; Slice-1 copy honesty; empty-state discoverability    |

- **CROSS-MODEL:** Design cross-model gate (GPT-4o vision) flagged variant C (over-decoration); user overrode on taste (D2/D3) and the literal decoration is dropped — warmth via tokens. Recorded as Track 1.
- **UNRESOLVED:** 0 design decisions unresolved. Entry points (D4), bulk undo (D5), success copy (D6), FloatingNav (D7), states, responsive, a11y all specced into the plan.
- **VERDICT:** DESIGN + ENG + DEVEX CLEARED — all fold-ins applied, implementation-ready. Eng gate (`skip_eng_review=false`) satisfied at plan stage; re-validated by CI on the PRs.
