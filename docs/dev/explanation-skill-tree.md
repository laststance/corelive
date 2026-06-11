# Skill Tree data integrity

The gamified Skill Tree turns completed tasks into earned XP on a graph of skill
nodes. Its correctness lives almost entirely in the database schema, not in
application code — a handful of constraints in `prisma/schema.prisma` defend
against corruption paths that handlers could never reliably catch at runtime.
This document explains the threat each constraint defends and what breaks if a
future engineer relaxes it.

The shape is four models — `SkillTree → SkillNode → NodeEdge`, plus
`NodeAssignment` — defined at `prisma/schema.prisma:130-219`. For the exact
fields and types, read the schema (it is the single source of truth and is
heavily commented); this doc deliberately does not transcribe them, because in
this pre-launch repo the schema is reshaped freely and a field-by-field copy
would rot on the next `db:reset` (see the repo-root [`README.md`](../../README.md)). The four procedures that
read and mutate the tree live in `src/server/procedures/skillTree.ts`; see the
[oRPC API reference](./reference-orpc-api.md) for their signatures and the
[data model reference](./reference-data-model.md) for the model index.

## One tree per user

A `SkillTree` row carries `@@unique([userId])` (`prisma/schema.prisma:142-143`).
Each user has exactly one tree, enforced at the database level rather than by an
application check.

The threat is a race, not a typo. `skillTree.getMyTree`
(`src/server/procedures/skillTree.ts:177`) lazily creates the tree on first
visit: it does a `findUnique` by `userId`, and if there is no tree it imports the
default template. Two requests landing in that window — a double-clicked nav, a
web tab plus the Electron window, a retried request — would both see "no tree"
and both try to create one. Without the unique constraint the user ends up with
two trees; the very next `getMyTree` does a `findUnique` against a `userId` that
now matches two rows and throws. The constraint converts that race into a clean
loser: the second insert fails with Prisma `P2002`, which `getMyTree` catches and
turns into a re-query for the winning tree
(`src/server/procedures/skillTree.ts:188-206`). The user never sees the race.

If you drop `@@unique([userId])`, you reintroduce the duplicate-tree race and
break `getMyTree`'s `findUnique` read for any user unlucky enough to double-create.

## Edges stay inside their own tree

A `NodeEdge` connects two `SkillNode`s. The naive design — single-column foreign
keys `fromNodeId → SkillNode.id` and `toNodeId → SkillNode.id` — lets an edge
reference two nodes that belong to _different_ trees. That is a corruption the
application layer cannot reliably catch: nothing in a normal write path
cross-checks that both endpoints share a tree, and once such an edge exists,
rendering or traversal sees a node that isn't in the tree it's drawing.

The schema closes this at the database level with a **composite foreign key**.
`SkillNode` carries `@@unique([skillTreeId, id])`
(`prisma/schema.prisma:167-172`), and `NodeEdge.fromNode` / `toNode` reference
`SkillNode(skillTreeId, id)` — including the edge's own `skillTreeId` in the key
(`prisma/schema.prisma:189-191`). Postgres then refuses any edge whose endpoints
don't live in the same tree as the edge. The integrity check is structural, not
a runtime assertion that a refactor could forget to run.

This forces two non-obvious choices, each documented inline next to the relevant
field:

- **The composite FKs use `onDelete: NoAction`, not `Cascade`.** Prisma forbids
  two overlapping `Cascade` paths that share a scalar field, and both composite
  FKs share `skillTreeId` with the `skillTree` relation. Trying to make them
  `Cascade` makes Prisma refuse to generate the migration. `NoAction` is not a
  weakness here: deleting a `SkillTree` still removes its edges, because
  `NodeEdge.skillTree` keeps `onDelete: Cascade` (`prisma/schema.prisma:189`).
  Edges vanish with the tree via that relation; the composite FKs only police
  cross-tree references.
- **`SkillNode` keeps a `@default(now())` on `updatedAt`** even though `@updatedAt`
  normally handles it (`prisma/schema.prisma:160-165`). The hardening migration
  added a DB-level `DEFAULT CURRENT_TIMESTAMP`; the explicit `@default(now())`
  keeps Prisma from detecting drift and silently dropping that default on the
  next `prisma migrate dev`. It is a drift-guard, not a runtime behavior.

If you revert the composite FK to a single-column FK, an edge can once again span
two trees, and you lose the only guard against it. If you change the composite
FKs from `NoAction` to `Cascade`, Prisma refuses to migrate — so do not read
`NoAction` as a bug to "fix."

A side effect worth knowing: deleting a single `SkillNode` is blocked by the
`NoAction` edge FKs unless its edges are removed first. This is accepted, because
normal operation only ever deletes whole trees (which cascades cleanly via the
`skillTree` relation), never individual nodes.

## XP that survives task deletion

This is the subsystem's most load-bearing — and most easily broken — invariant.
A `NodeAssignment` is an XP receipt: it records that a completed Todo was
assigned to a node. The product promise is that **earned XP is permanent** — once
you've claimed a task on a node, deleting that task later must not erase the XP
or its label.

Two schema choices make that work (`prisma/schema.prisma:198-219`):

- `NodeAssignment.todoId` is nullable with `onDelete: SetNull`
  (`prisma/schema.prisma:203,213`). When the source Todo is deleted, the
  assignment row is **not** deleted — its `todoId` is set to `null` and the row
  survives as an orphaned receipt.
- `NodeAssignment.todoText` is a `VARCHAR(255)` snapshot of the Todo's text
  taken at assignment time (`prisma/schema.prisma:204-209`). `assignTask` always
  writes the live text into it (`src/server/procedures/skillTree.ts:285`). After
  the Todo is gone the read path has no live `Todo.text` to join to, so it shows
  the snapshot instead — the receipt still reads sensibly.

The read side completes the contract. `getMyTree`'s include filters node
assignments to `OR: [{ todoId: null }, { todo: { completed: true } }]`
(`src/server/procedures/skillTree.ts:36-38`). That surfaces exactly the receipts
that should still count: the orphaned ones (frozen XP from deleted tasks) and the
ones whose source Todo is still completed — while hiding any whose Todo went back
to incomplete. The `SetNull` write and this read filter are two halves of the
same "XP survives" mechanism.

If you change `NodeAssignment.todo` from `SetNull` to `Cascade`, deleting a
completed Todo destroys its XP receipt — directly breaking the permanence
promise. Note the asymmetry: the `node` relation IS `Cascade`
(`prisma/schema.prisma:212`), because an assignment is meaningless without its
node, but the `todo` relation must not be.

### NodeAssignment has three exit paths with three opposite intents

The single most important thing to understand before touching this code: a
`NodeAssignment` row can leave in three different ways, and two of them call the
same `deleteMany` while meaning opposite things. Conflating them is how a
refactor silently destroys XP.

| Trigger                                                  | What happens to the row                                                                        | Intent                           |
| -------------------------------------------------------- | ---------------------------------------------------------------------------------------------- | -------------------------------- |
| Source Todo is deleted (`clearCompleted` / `deleteTodo`) | `todoId` → `null`, **row survives** (`onDelete: SetNull`)                                      | **Preserve** XP — frozen receipt |
| `toggleTodo` un-completes the Todo (true→false)          | Row **deleted** via `deleteMany` (`src/server/procedures/todo.ts:241-242`)                     | **Revoke** XP — exploit guard    |
| `assignTask` moves a Todo to another node                | Row **deleted then re-created** on the new node (`src/server/procedures/skillTree.ts:278-287`) | **Relocate** XP                  |

The first path _preserves_ the receipt; the other two _destroy_ it. They are not
the same operation. The archive helper makes this explicit: when a completed
Todo is deleted, `archiveCompletedTodos`
(`src/server/utils/archiveCompletedTodos.ts:17-20`) **deliberately does not**
`deleteMany` its `NodeAssignment` rows — it relies on the schema's `SetNull`
instead. The inline comment warns directly: mirroring `toggleTodo`'s `deleteMany`
in the archive helper "would destroy XP," because the un-complete exploit guard
and the task-teardown path look identical but mean the opposite.

### Why un-completing revokes XP (the double-XP guard)

The revocation path exists to close an exploit. `assignTask` requires the Todo to
be completed (`assertOwnership` with `requireCompleted: true`,
`src/server/procedures/skillTree.ts:266-271`) — XP should only be granted for
finished work. But that check at assignment time isn't enough on its own. As the
`toggleTodo` comment spells out (`src/server/procedures/todo.ts:232-238`): once a
Todo is assigned and then un-completed, the stale assignment would **survive the
un-complete and keep granting XP until the todo is re-assigned**. A user could
complete → assign → un-complete → re-complete → assign to a _different_ node, and
the original receipt would still be there. So `toggleTodo`, on the true→false
transition, `deleteMany`s the Todo's `NodeAssignment` rows in the same
transaction (`src/server/procedures/todo.ts:240-243`), wrapped in a transaction
so an orphan can't linger if the toggle succeeds but the cleanup fails.

This is also why completion state changes flow through **only** `toggleTodo`.
`updateTodo`'s schema deliberately omits `completed`, so there is no other seam
that can flip completion and bypass this cleanup. If a future edit let
`updateTodo` change `completed`, it would route around the double-XP guard.

### One assignment per Todo, ever

`NodeAssignment` carries `@@unique([todoId])` (`prisma/schema.prisma:215-217`).
A single Todo can be the source of at most one assignment, which blocks an
XP-inflation exploit: assigning the same completed Todo across several nodes to
multiply its XP. `assignTask` supports _moving_ an assignment between nodes by
`deleteMany`-then-`create` inside one transaction
(`src/server/procedures/skillTree.ts:278-287`) precisely because this constraint
would otherwise reject a second `create` for the same `todoId`.

The subtle part — and the reason both XP invariants can live on the same column —
is Postgres's treatment of `NULL` as **distinct**. After a Todo is deleted, its
receipt's `todoId` becomes `null`; many such orphaned receipts can coexist
(each `null` is distinct, so `@@unique([todoId])` doesn't collapse them), while
the constraint still blocks two assignments for the same _real_ `todoId`. You get
XP-survival (many `null` receipts) and the inflation guard (one row per concrete
todo) from one unique index only because of NULL-distinctness. If a future
database or column change made `NULL`s non-distinct, the two invariants would
collide — a second deletion would violate the unique index.

If you drop `@@unique([todoId])`, a single Todo can be assigned to many nodes and
XP inflates without bound.

## The four procedures

All Skill Tree access goes through four procedures in
`src/server/procedures/skillTree.ts`, every one authenticated by the shared
`authMiddleware` (see the [oRPC API reference](./reference-orpc-api.md) and the
[authentication surface reference](./reference-auth.md)). In integrity terms:

- **`getMyTree`** (`src/server/procedures/skillTree.ts:177`) — reads the tree,
  lazily importing the default template on first visit and surviving the
  concurrent-create race via the `P2002`→re-query path. Its include filter is the
  read-side half of the "XP survives" contract.
- **`getUnassignedPool`** (`src/server/procedures/skillTree.ts:227`) — lists
  completed Todos not yet assigned to any node (`assignments: { none: {} }`). It
  returns a deliberately narrow `{ id, text }` shape so the rest of the Todo
  (notes, category, timestamps) is never dragged into the client's
  `localStorage` cache, which would leak PII across sessions.
- **`assignTask`** (`src/server/procedures/skillTree.ts:262`) — assigns a
  completed Todo to a node (move-supported). It translates `P2002`, `P2003`, and
  `P2025` races to `NOT_FOUND` so the loser of a harmless concurrent assign
  converges on a consistent final state instead of surfacing a 500.
- **`unassignTask`** (`src/server/procedures/skillTree.ts:335`) — removes a
  live assignment. It looks the row up by the globally-unique `todoId`
  (`findUnique`) and returns `null` if the row is absent or points at a different
  node, so a client whose mental model is stale reconciles via query
  invalidation instead of erroring. Orphaned receipts (`todoId = null`) are
  unreachable here by design — the input schema requires a positive `todoId`, so
  frozen XP cannot be unassigned away.

## Provenance

The constraints above were introduced by two hardening migrations whose SQL
encodes this rationale directly:
`prisma/migrations/20260409000000_skill_tree_v1_hardening` (one-tree-per-user,
`SetNull`, `todoText` snapshot, `@@unique([todoId])`) and
`prisma/migrations/20260409080000_skill_tree_v1_edge_composite_fk` (the
composite-FK same-tree enforcement). The original design discussion — node
layout, the XP model, and the threat analysis — lives in
[`docs/superpowers/specs/2026-04-08-skill-tree-design.md`](../superpowers/specs/2026-04-08-skill-tree-design.md).
