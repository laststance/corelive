# Data model reference

Point-to-source reference for CoreLive's persistence layer: the 10 Prisma models, their relations, the load-bearing data-integrity rules, and the Prisma client. `prisma/schema.prisma` is the single source of truth and is heavily commented with WHY-design-notes; this doc anchors each surface to a line range and defers exact field shapes to the schema.

> **Volatility warning (pre-launch).** Per [`README.md`](../../README.md) (the "Pre-launch" banner): the schema, APIs, and data may be reshaped freely and abruptly — **no migrations are preserved, no backward compatibility is maintained**. When the schema changes you just run `pnpm db:reset`. Do not treat field-by-field details copied out of this doc as durable. Always re-read `prisma/schema.prisma` for the current shape.

## Cross-cutting invariants

These rules apply across the whole schema and are the highest-value thing to know before touching any model. Each is enforced in column nullability, defaults, unique constraints, or `onDelete` — not in application code.

| Invariant                                                                                                                                                                         | Where enforced                                                                                                     | Why it matters                                                                                                                                                                                                      |
| --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Two completion surfaces feed one heatmap.** `Todo` (live list) and `Completed` (archive/import/BrainDump stream) are disjoint tables that the heatmap UNIONs.                   | Consumed in `src/server/utils/completedAggregation.ts:61-153`                                                      | Disjoint by construction, so **no row-level dedup** is performed — repetition is an intended habit/XP signal, never collapsed.                                                                                      |
| **Heatmap day = a stable semantic timestamp.** `Completed.completedAt` (`schema.prisma:30`) and `Todo.completedAt` (`schema.prisma:101`) are `DateTime?` with **no `@default`**.  | `completedAggregation.ts:130` (Todo → `completedAt ?? updatedAt`), `:141` (Completed → `completedAt ?? createdAt`) | Decouples the heatmap day from `updatedAt`, which drifts on every text/notes edit. See [why](#design-notes-load-bearing) below.                                                                                     |
| **`Completed.archived: false` is load-bearing.** The archive flow must always write `archived:false`.                                                                             | `schema.prisma:18`; `src/server/utils/archiveCompletedTodos.ts:13-21`; filtered at `completedAggregation.ts:99`    | An `archived:true` row silently drops from the heatmap and reintroduces the erasure bug the archive helper exists to fix.                                                                                           |
| **Paste-import is undoable by batch id, never by content.** `ImportBatch.id` is a client-supplied unique key; `Completed.importBatchId` / `Todo.importBatchId` tag inserted rows. | `schema.prisma:73-87`, `:34`, `:110` (both indexed: `:39`, `:116`)                                                 | A bulk undo `deleteMany`s by batch id (`createMany` returns only `{count}`). Uniqueness is on the **batch id only**, never task title.                                                                              |
| **The Prisma client is unscoped.** No per-user filtering happens at the client level.                                                                                             | `src/lib/prisma.ts:10` (no auth, no middleware)                                                                    | Per-user scoping is the **caller's** responsibility — every query passes `userId` in its where-clause.                                                                                                              |
| **No `userId` index on `Completed` / `Todo` is deliberate.**                                                                                                                      | `completedAggregation.ts:66-68`                                                                                    | Each heatmap query is bounded by `userId`, so the planner uses the primary `userId` access path; an extra index was judged unnecessary. (Contrast: `ImportBatch` **does** `@@index([userId])`, `schema.prisma:86`.) |

### onDelete / referential-action matrix

Deletion behavior is asymmetric and is the easiest thing to break in a refactor. Anchored to the relation lines in `schema.prisma` (where no `onDelete` is written, Prisma's default for a **required** relation is `Restrict` on PostgreSQL — confirmed in the DDL, e.g. `Completed_userId_fkey ... ON DELETE RESTRICT`).

| Relation                                    | `onDelete`           | `schema.prisma` | Effect                                                                                                                                                                                        |
| ------------------------------------------- | -------------------- | --------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `ImportBatch.user` → User                   | `Cascade`            | `:82`           | Deleting a user wipes their import batches.                                                                                                                                                   |
| `SkillTree.user` → User                     | `Cascade`            | `:136`          | Deleting a user wipes their tree (and transitively nodes/edges/assignments).                                                                                                                  |
| `Completed.user` → User                     | _default_ `Restrict` | `:20`           | **Blocks** user deletion if any Completed row exists.                                                                                                                                         |
| `Category.user` → User                      | _default_ `Restrict` | `:47`           | **Blocks** user deletion if any Category exists.                                                                                                                                              |
| `Todo.user` → User                          | _default_ `Restrict` | `:104`          | **Blocks** user deletion if any Todo exists.                                                                                                                                                  |
| `ElectronSettings.user` → User              | _default_ `Restrict` | `:122`          | **Blocks** user deletion while settings exist.                                                                                                                                                |
| `Completed.category` → Category             | `Restrict`           | `:22`           | A category in use by a Completed row cannot be deleted.                                                                                                                                       |
| `Todo.category` → Category                  | `Restrict`           | `:106`          | A category in use by a Todo cannot be deleted.                                                                                                                                                |
| `SkillNode.skillTree` → SkillTree           | `Cascade`            | `:155`          | Deleting a tree removes its nodes.                                                                                                                                                            |
| `NodeEdge.skillTree` → SkillTree            | `Cascade`            | `:189`          | Deleting a tree removes its edges (the end-to-end cascade path).                                                                                                                              |
| `NodeEdge.fromNode` / `.toNode` → SkillNode | `NoAction`           | `:190-191`      | Composite FK on `(skillTreeId, id)` — forces both endpoints into the edge's own tree. `NoAction` (not Cascade) because Prisma forbids overlapping Cascade on the shared `skillTreeId` scalar. |
| `NodeAssignment.node` → SkillNode           | `Cascade`            | `:212`          | Deleting a node removes its XP assignments.                                                                                                                                                   |
| `NodeAssignment.todo` → Todo                | `SetNull`            | `:213`          | **XP survives task deletion** — the row orphans with `todoId=null` and reads the `todoText` snapshot.                                                                                         |

> **Net effect:** deleting a `User` is asymmetric — `ImportBatch` + `SkillTree` (and the skill-tree subgraph) cascade away, but a user holding any `Todo`, `Completed`, `Category`, or `ElectronSettings` row **cannot be deleted at all** without first clearing those rows.

## Models

One-line purpose + line anchor per model. Open `prisma/schema.prisma` at the cited range for the authoritative field list, types, and inline design comments.

| Model              | `schema.prisma` | Purpose                                                                                                                                                                                                          |
| ------------------ | --------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `Completed`        | `16-40`         | Separate completion-event stream: BrainDump checkbox-ticks, paste-import, and archived Todos. `archived` gates heatmap visibility; `completedAt` nullable-no-default; indexed on `categoryId` + `importBatchId`. |
| `Category`         | `42-55`         | User-scoped task category. Name unique per user (`@@unique([name, userId])`). Referenced by both `Completed` and `Todo` with `onDelete: Restrict`.                                                               |
| `User`             | `57-71`         | Account record. `clerkId` (`@unique`) bridges to Clerk auth (synced by the Clerk webhook); internal `id` (Int) is the FK target for every other model.                                                           |
| `ImportBatch`      | `80-87`         | Paste-import idempotency guard + bulk-undo anchor. `id` is client-supplied and globally unique; a duplicate insert throws Prisma `P2002`, caught as an idempotent no-op. Doc-comment at `:73-79`.                |
| `Todo`             | `89-117`        | Live to-do item (the TodoList `complete()` flow). `completedAt` nullable-no-default (heatmap day); `order` nullable for drag-reorder back-compat; indexed on `categoryId` + `importBatchId`.                     |
| `ElectronSettings` | `119-128`       | 1:1 per-user desktop preferences (`userId @unique` ⇒ `User.electronSettings` is an optional 1:1). Booleans: `hideAppIcon`, `showInMenuBar`, `startAtLogin`.                                                      |
| `SkillTree`        | `130-144`       | One skill tree per user (`@@unique([userId])` prevents a duplicate-tree race on concurrent first-load).                                                                                                          |
| `SkillNode`        | `146-174`       | Tree node with normalized `x`/`y` coords (0.0–1.0). `@@unique([skillTreeId, id])` is the composite-FK target that lets `NodeEdge` enforce same-tree endpoints.                                                   |
| `NodeEdge`         | `176-196`       | Directed edge between two nodes via a composite FK on `(skillTreeId, fromNodeId/toNodeId)` → `SkillNode(skillTreeId, id)`, so both endpoints must share the edge's tree.                                         |
| `NodeAssignment`   | `198-219`       | XP record linking a `Todo` to a node. `todoId` nullable + `SetNull` + a `todoText` snapshot so XP survives Todo deletion; `@@unique([todoId])` blocks a multi-node XP-inflation exploit.                         |

## Design notes (load-bearing)

The schema comments are the richest documentation; these are summarized here, not transcribed. For the full narrative, see [`./explanation-completion-and-heatmap.md`](./explanation-completion-and-heatmap.md) and [`./explanation-skill-tree.md`](./explanation-skill-tree.md).

- **`completedAt` nullable with no `@default`** (`schema.prisma:24-30` Completed, `93-101` Todo). A non-null default would stamp every historical row with the migration timestamp, jumping all old rows to migration-day on the heatmap. Keeping it nullable + backfilling each row to its real day, then coalescing `completedAt ?? createdAt` / `?? updatedAt` in JS, keeps each completion on its true day and decouples it from `updatedAt` (which drifts on edits).
- **`Completed.archived` defaults false; the archive helper must never write `true`** (`schema.prisma:18`; `archiveCompletedTodos.ts:13-21`). `archiveCompletedTodos` copies a cleared/deleted Todo's completion **into** `Completed` so its heatmap day survives the Todo's deletion; an `archived:true` row would silently drop from the heatmap (`completedAggregation.ts:99` filters `archived: false`).
- **`ImportBatch.id` client-supplied + unique; uniqueness on batch id only** (`schema.prisma:73-87`). `createMany` returns only `{count}`, never inserted ids, so an undo needs the batch tag. Title is intentionally **not** unique so intentional repetition is never collapsed.
- **`NodeAssignment.todoId` nullable + `SetNull`, with a `todoText` VARCHAR snapshot** (`schema.prisma:200-213`). Earned XP must persist after the source Todo is deleted; the row survives with `todoId=null` and the read path prefers the `todoText` snapshot.
- **`NodeAssignment @@unique([todoId])`** (`schema.prisma:215-217`). One assignment per todo, ever — blocks a multi-node XP-inflation exploit. PostgreSQL treats NULLs as distinct, so many orphaned (`todoId=null`) rows coexist while still blocking two assignments for one real `todoId`.
- **`NodeEdge` composite FK + `SkillNode @@unique([skillTreeId, id])`** (`schema.prisma:167-172`, `184-191`). Single-column FKs would let an edge reference endpoints in different trees — a corruption path app code can't catch. The composite FK makes Postgres enforce same-tree endpoints. `NoAction` is required because Prisma forbids overlapping Cascade on the shared `skillTreeId` scalar; the cascade still works end-to-end via `NodeEdge.skillTree`.
- **`SkillNode.updatedAt @default(now())`** (`schema.prisma:161-165`). Matches the DB-level `DEFAULT CURRENT_TIMESTAMP` added by the hardening migration, so the next `prisma migrate dev` does not detect drift and drop it.

### Accepted limitations

- **Concurrent clears are not idempotent** (`archiveCompletedTodos.ts:23-32`). Two parallel `clearCompleted` calls can each read the same completed Todo before either deletes it, inserting two `Completed` rows and inflating that day's heatmap **count**. Display-only; no data or XP loss. Accepted to avoid touching the load-bearing archive invariants for a count-only edge case.
- **Individual `SkillNode` deletion is blocked** by `NodeEdge`'s composite `NoAction` FKs unless the node's edges are removed first. Accepted because normal operation only deletes whole trees (Cascade via the `skillTree` relation).
- **Heatmap buckets by UTC date string** (`completedAt.toISOString()` first 10 chars); bounds are UTC-anchored to avoid mis-bucketing on non-UTC hosts (masked on Vercel, which runs UTC, but explicit in the day-detail/heatmap procedures).

## Prisma client

- **Singleton:** `export const prisma` in `src/lib/prisma.ts:10` — the shared client used by all server code.
- **Driver adapter:** constructed with `@prisma/adapter-pg` (`PrismaPg`) reading `POSTGRES_PRISMA_URL` (`src/lib/prisma.ts:6-10`), **not** the default query engine. The `datasource db` block in `schema.prisma:12-14` declares `provider` only and **no `url`** — the adapter supplies the connection.
- **Minimal instance:** a plain module-level `new PrismaClient({ adapter })` with **no `globalThis` HMR guard**. `import 'dotenv/config'` at the top (`:1`) loads env for non-Next.js entrypoints (scripts, tests).
- **Generated client location:** `node_modules/.prisma/client` (`generator client.output`, `schema.prisma:9`).
- **Env var:** `POSTGRES_PRISMA_URL` is validated by `src/env.mjs`; the app fails to start if it is missing. See the environment-variable table in [`README.md`](../../README.md).

## Migrations & reset policy

**Policy first:** this is a pre-launch repo. The canonical way to apply a schema change locally is to **reset**, not to evolve a preserved migration chain — see [`README.md`](../../README.md) ("no need to write or preserve migrations… just reset the database with `pnpm db:reset`").

| Command (see `package.json` `scripts`) | Effect                                                           |
| -------------------------------------- | ---------------------------------------------------------------- |
| `pnpm prisma:migrate`                  | `prisma migrate dev` (guarded by `scripts/assert-local-db.cjs`). |
| `pnpm db:reset`                        | `prisma migrate reset --force` **then** `pnpm prisma:seed`.      |
| `pnpm db:truncate`                     | `prisma migrate reset --force` with **no** seed.                 |
| `pnpm prisma:seed`                     | Runs `prisma/seed.ts`.                                           |
| `pnpm prisma:studio`                   | Opens Prisma Studio.                                             |

For the local DB bring-up sequence (`docker compose up -d` → migrate → seed), see [`./howto-local-dev-and-tests.md`](./howto-local-dev-and-tests.md) and [`./tutorial-getting-started.md`](./tutorial-getting-started.md).

**The migration files still exist** under `prisma/migrations/` and several encode design rationale verbatim in their SQL comments — treat them as **historical/illustrative artifacts**, not a maintained chain. The highest-value ones to read:

| Migration directory                                   | What it documents                                                                                                                              |
| ----------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| `20260529164052_paste_import_completedat_importbatch` | Adds `Completed.completedAt` + `ImportBatch`; backfills `completedAt = createdAt`.                                                             |
| `20260603235155_add_todo_completedat`                 | Adds `Todo.completedAt`; backfills from `updatedAt`.                                                                                           |
| `20260409000000_skill_tree_v1_hardening`              | One-tree-per-user, `NodeAssignment.todoId` SetNull, `todoText` snapshot, `@@unique([todoId])` XP-exploit guard, `SkillNode.updatedAt` default. |
| `20260409080000_skill_tree_v1_edge_composite_fk`      | `NodeEdge` composite FK enforcing same-tree endpoints.                                                                                         |

For the Prisma v7 / driver-adapter migration background, see [`../PRISMA_V7_MIGRATION.md`](../PRISMA_V7_MIGRATION.md).

### Seed

`prisma/seed.ts` is **idempotent**. It upserts the Clerk-dev test `User` and a default `"General"` `Category`, then inserts 10 deterministic fixture Todos. The delete-then-insert is wrapped in a single `$transaction` (`seed.ts:67-83`) so a standalone re-run does not duplicate fixtures. Autoincrement IDs are `1..N` only right after `migrate reset --force` (`seed.ts:45-46`), which is what `pnpm db:reset` chains.

## Consumers (separate subsystems)

This schema is read/written by code outside this reference. See:

- oRPC procedures in `src/server/procedures/*` (heatmap, day-detail, todo, skill-tree) — [`./reference-orpc-api.md`](./reference-orpc-api.md).
- `src/server/utils/completedAggregation.ts` (the heatmap UNION reader) and `src/server/utils/archiveCompletedTodos.ts` (the archive helper).
- The Clerk webhook, which writes `User` rows — [`./reference-auth.md`](./reference-auth.md).
