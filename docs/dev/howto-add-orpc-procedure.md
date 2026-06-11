# How to add a new oRPC procedure

oRPC is CoreLive's single type-safe HTTP API surface — the web app and the Electron renderer hit the exact same procedures over `POST/GET /api/orpc/*`. This guide walks you end-to-end: Zod schema → procedure → router registration → client hook → optimistic updates → a real-DB test.

This is a recipe, not a tour. For the _why_ behind this layer (the Bearer-token auth model, the one-data-path architecture, query-vs-mutation), see [explanation-architecture.md](./explanation-architecture.md). For a point-to-source index of every existing procedure, see [reference-orpc-api.md](./reference-orpc-api.md).

> **Prerequisites:** You've done [tutorial-getting-started.md](./tutorial-getting-started.md) and can run the local dev + test loop ([howto-local-dev-and-tests.md](./howto-local-dev-and-tests.md)). A local Postgres is running (`docker compose up -d`).

## The shape of every procedure

A procedure is always built from `authMiddleware` (`src/server/middleware/auth.ts:10`):

```typescript
authMiddleware
  .input(InputSchema) // optional — read-only procedures omit it
  .output(OutputSchema) // re-validates the DB result on the way out
  .handler(async ({ input, context }) => {
    /* ... */
  })
```

Two facts that change how you write handlers:

- **Auth is universal — there are no unauthenticated procedures.** Every procedure extends `authMiddleware`, which resolves the caller and injects `context.user` (a full Prisma `User`) into the handler (`src/server/middleware/auth.ts:6-8`, `41-50`). You never receive a `userId` as input — read it from `context.user.id`. Scope every query by it.
- **`query` vs `mutation` is a _client_ convention, not a server tag.** `.handler()` does not mark a procedure as read or write. The distinction lives on the client (`orpc.<ns>.<proc>.queryOptions()` vs `.mutationOptions()`); you choose read=query, write=mutation when you consume it. See [explanation-architecture.md](./explanation-architecture.md).

## Steps

### 1. Define the Zod input/output schemas

Schemas live in `src/server/schemas/<ns>.ts`, one file per namespace. Define an input schema (omit it for read-only procedures) and an output schema. The output schema **re-validates the database result** at the boundary, so it must match what Prisma returns.

From `src/server/schemas/category.ts:50-53`:

```typescript
export const CreateCategorySchema = z.object({
  name: z.string().min(1, 'Category name is required').max(30),
  color: CategoryColorSchema.default('blue'),
})
```

> **Gotcha — `Date` fields need the union+transform, never bare `z.date()`.** After the JSON round-trip the oRPC client hands back ISO **strings**, so a plain `z.date()` output schema fails validation on the wire. Copy the existing pattern for every `Date` field (`src/server/schemas/category.ts:35-40`, mirrored in `src/server/schemas/todo.ts:16-21`):
>
> ```typescript
> createdAt: z
>   .union([z.date(), z.string()])
>   .transform((val) => (typeof val === 'string' ? new Date(val) : val)),
> ```
>
> This is paired with a custom RPC Date serializer (`src/lib/orpc/serializer.ts`) so renderer code always gets real `Date` objects — but you only need the schema transform above.

### 2. Build the procedure

Procedures live in `src/server/procedures/<ns>.ts`. Build from `authMiddleware`, wire up the schemas, and read the user from `context`. Translate Prisma error codes (`P2002` unique, `P2003` FK, `P2025` not-found) into the matching `ORPCError` so the client gets a typed error instead of a 500.

The `category.create` procedure (`src/server/procedures/category.ts:79-114`, comments abridged):

```typescript
export const createCategory = authMiddleware
  .input(CreateCategorySchema)
  .output(CategorySchema)
  .handler(async ({ input, context }) => {
    try {
      const { user } = context

      const category = await prisma.category.create({
        data: {
          name: input.name,
          color: input.color,
          userId: user.id, // scope to the authed user — never an input
        },
      })

      return category as Category
    } catch (error) {
      // Prisma P2002 = unique constraint violation (@@unique([name, userId]))
      if (
        error instanceof Error &&
        'code' in error &&
        (error as { code: string }).code === 'P2002'
      ) {
        throw new ORPCError('CONFLICT', {
          message: `Category "${input.name}" already exists`,
        })
      }
      if (error instanceof ORPCError) throw error
      log.error({ error }, 'Error in createCategory')
      throw new ORPCError('INTERNAL_SERVER_ERROR', {
        message: 'Failed to create category',
        cause: error,
      })
    }
  })
```

Notes:

- **No-input form:** procedures that take no input drop `.input()` entirely and start at `.output(...)` — whether a read like `listCategories` (`src/server/procedures/category.ts:43-45`) or a destructive write like `clearCompleted` (`src/server/procedures/todo.ts:262-264`), which archives-and-removes all completed todos. "No input" is independent of read-vs-write.
- **Ownership checks:** for update/delete, `findFirst({ where: { id, userId: user.id } })` first and throw `ORPCError('NOT_FOUND')` if absent — that's how the codebase enforces per-user access (`src/server/procedures/category.ts:138-146`).
- **Use the module logger**, not `console` — `const log = createModuleLogger('<ns>')` (`src/server/procedures/category.ts:32`).

### 3. Register it in the router

The router (`src/server/router.ts:37-73`) is a plain nested object literal grouping procedures into namespaces (`category`, `todo`, `completed`, `electronSettings`, `skillTree`). Import your procedure and add it to its namespace:

```typescript
export const router = {
  category: {
    list: listCategories,
    create: createCategory, // ← your procedure
    update: updateCategory,
    delete: deleteCategory,
  },
  // ...
}

export type AppRouter = typeof router // the type the client is generated from
```

> **This is the only wiring step.** The catch-all route handler `src/app/api/orpc/[...path]/route.ts:7` mounts `new RPCHandler(router)` and re-exports it as `GET/POST/PUT/PATCH/DELETE` (route.ts:39-43), so adding the procedure to the router exposes it over HTTP automatically. There is no per-procedure route to write. The handler passes `{ headers: request.headers }` as context (route.ts:15-20), which is exactly what `authMiddleware` reads.

### 4. Consume it on the client

`src/lib/orpc/client-query.ts:21` wraps the typed client with `@orpc/tanstack-query` into a single `orpc` object. Every component reaches the API through it. The call shapes are exact:

```typescript
import { orpc } from '@/lib/orpc/client-query'
import { useQuery, useMutation } from '@tanstack/react-query'

// READ → queryOptions. Input NESTS under an `input` key:
const { data } = useQuery(orpc.category.list.queryOptions())
const todos = useQuery(
  orpc.todo.list.queryOptions({ input: { completed: false } }),
)

// WRITE → mutationOptions (pass {} when you add no extra options):
const create = useMutation(orpc.category.create.mutationOptions({}))
create.mutate({ name: 'Work', color: 'blue' })

// INVALIDATION key → .key() (partial) or .queryKey (exact, from queryOptions):
queryClient.invalidateQueries({ queryKey: orpc.category.list.key() })
```

> **Gate protected queries on Clerk readiness.** A query that fires before Clerk hydrates sends no Bearer token and 401s. Use `useClerkQueryReady()` (`src/hooks/useClerkQueryReady.ts`) to set `enabled`. See [explanation-architecture.md](./explanation-architecture.md) for the auth handshake.

### 5. Wire optimistic updates + invalidation (mutations)

The canonical consumer is `useTodoMutations.ts`. Mutations follow the TanStack Query optimistic pattern: **`onMutate`** (cancel in-flight queries → snapshot → apply optimistic change), **`onError`** (roll back from the snapshot), **`onSettled`** (always invalidate to reconcile with the server).

The `createMutation` (`src/hooks/useTodoMutations.ts:86-133`, comments abridged):

```typescript
const createMutation = useMutation({
  ...orpc.todo.create.mutationOptions({}),
  onMutate: async (newTodo) => {
    // 1. Cancel outgoing refetches so they don't clobber the optimistic write
    await queryClient.cancelQueries({ queryKey: pendingKey })

    // 2. Snapshot previous value for rollback
    const previousPending = queryClient.getQueryData<TodoResponse>(pendingKey)

    // 3. Optimistically add a temp row
    const optimisticTodo: Todo = {
      id: -Date.now(), // Negative temp ID to avoid collision with real IDs
      text: newTodo.text,
      notes: newTodo.notes ?? null,
      categoryId: newTodo.categoryId,
      completed: false,
      userId: 0,
      createdAt: new Date(),
      updatedAt: new Date(),
    }
    queryClient.setQueryData<TodoResponse>(pendingKey, (old) => {
      if (!old) return old
      return {
        ...old,
        todos: [optimisticTodo, ...old.todos],
        total: old.total + 1,
      }
    })

    // 4. Return context for rollback
    return { previousPending }
  },
  onError: (_err, _newTodo, context) => {
    if (context?.previousPending) {
      queryClient.setQueryData(pendingKey, context.previousPending)
    }
  },
  onSettled: () => {
    // Always refetch to reconcile the temp row with the real server row
    queryClient.invalidateQueries({ queryKey: pendingKey })
    queryClient.invalidateQueries({ queryKey: orpc.category.list.key() })
    broadcastTodoSync() // cross-window sync — see explanation-state-and-sync.md
    broadcastCategorySync()
  },
})
```

> **The negative temp-id convention (`id: -Date.now()`)** is load-bearing and matches the server. `todo.update`, `todo.delete`, and `todo.toggle` accept `z.number().int()` (not `.positive()`) and **silently no-op for `id < 0`** (`src/server/procedures/todo.ts:130-132`, `164-166`, `217-219`), because a mutation can fire against an optimistic row before its real row exists. The `onSettled` invalidation then reconciles to real server state.

**Invalidate every query the write touches.** A mutation often ripples across namespaces. `toggleMutation` is the richest example — its `onSettled` fans invalidations across `category.list`, `skillTree.getMyTree`, `skillTree.getUnassignedPool`, `completed.heatmap`, and `completed.dayDetail` because toggling a todo changes category counts, the skill-tree pool, and the heatmap (`src/hooks/useTodoMutations.ts:291-316`). When you add a mutation, ask which read models its write affects and invalidate each. Why completions ripple into the heatmap is covered in [explanation-completion-and-heatmap.md](./explanation-completion-and-heatmap.md).

### 6. Write a real-DB integration test

**Mocking auth or the DB is forbidden** (project rule — it hides exactly the TOCTOU / idempotency / archive bugs these tests catch). Instead, invoke the procedure with `@orpc/server`'s `call()` and a real `Headers`-bearing context so the **real `authMiddleware` runs** against live Postgres. Tests live next to the procedure as `src/server/procedures/<ns>.<topic>.test.ts` and are gated by `RUN_DB_INTEGRATION_TESTS=1`.

The harness (from `src/server/procedures/completed.createMany.test.ts:14-55`):

```typescript
// @vitest-environment node

// Runs only when RUN_DB_INTEGRATION_TESTS=1 (CI sets it once Postgres is up;
// locally: `docker compose up`). Skips cleanly in DB-less contexts.
const describeIfDb =
  process.env.RUN_DB_INTEGRATION_TESTS === '1' ? describe : describe.skip

// call() passes a Bearer token; the REAL authMiddleware upserts the user by it.
function authContext(clerkId: string) {
  return {
    context: { headers: new Headers({ Authorization: `Bearer ${clerkId}` }) },
  }
}

// A unique clerkId per test → a fresh user, so rows never collide across runs.
const createdClerkIds = new Set<string>()
function freshClerkId(): string {
  const clerkId = `test_import_${randomUUID()}`
  createdClerkIds.add(clerkId)
  return clerkId
}

// FK-safe teardown: child rows before the user (User has NO onDelete cascade
// from Completed/Todo/Category; only ImportBatch/SkillTree cascade).
afterEach(async () => {
  for (const clerkId of createdClerkIds) {
    const user = await prisma.user.findUnique({ where: { clerkId } })
    if (!user) continue
    await prisma.completed.deleteMany({ where: { userId: user.id } })
    await prisma.todo.deleteMany({ where: { userId: user.id } })
    await prisma.importBatch.deleteMany({ where: { userId: user.id } })
    await prisma.category.deleteMany({ where: { userId: user.id } })
    await prisma.user.delete({ where: { id: user.id } })
  }
  createdClerkIds.clear()
})
```

A test body then `call(procedure, input, authContext(clerkId))` and asserts against `prisma` directly. Note the **three identical titles** — they prove the no-dedup invariant: each item inserts its own row (`completed.createMany.test.ts:58-85`).

```typescript
const clerkId = freshClerkId()
const importBatchId = randomUUID()

const result = await call(
  createManyCompleted,
  {
    items: [
      { title: 'English study' },
      { title: 'English study' },
      { title: 'English study' },
    ],
    importBatchId,
  },
  authContext(clerkId),
)

expect(result).toEqual({ count: 3, idempotent: false })
const user = await prisma.user.findUniqueOrThrow({ where: { clerkId } })
const rows = await prisma.completed.findMany({
  where: { userId: user.id, importBatchId },
})
expect(rows).toHaveLength(3)
```

Run it with the gate on:

```bash
RUN_DB_INTEGRATION_TESTS=1 pnpm test
```

Notes:

- The teardown order is **not optional** — deleting the `User` first throws on the restricted FKs. If your namespace touches the skill tree, delete `skillTree` first (it cascades nodes + assignments), as `src/server/procedures/todo.archive.test.ts:64-78` does.
- These suites make several sequential round-trips per case; bump the timeout (`vi.setConfig({ testTimeout: 30_000 })`, `todo.archive.test.ts:16`) so they don't flake on DB latency.

## Bulk procedures: importBatchId idempotency

If your procedure does a **bulk insert** (paste-import style), make it idempotent on a client-supplied `importBatchId`. The pattern (`src/server/procedures/todo.ts:351-432`, mirrored in `src/server/procedures/completed.ts:399-478`):

1. Insert an `ImportBatch` guard row **in the same `$transaction`** as the `createMany`, keyed on `importBatchId`.
2. A duplicate batch id throws Prisma `P2002` — **caught _outside_ the `$transaction`** (a failed statement aborts the entire PG transaction, so you cannot catch-and-continue on the `tx` client). On `P2002`, re-query the prior count and return `{ count, idempotent: true }`.

The matching bulk-undo (`*.deleteMany`) deletes by `importBatchId`, guarded by a 60s window on `createdAt` (`COMPLETED_UNDO_WINDOW_MS`, `src/lib/constants/import.ts:21`). And there is **no dedup** — repeated titles are an intentional habit/XP signal, so uniqueness is on the batch id only, never on task text.

## Pre-launch reminder

This repo is pre-launch and volatile — schemas, fields, and APIs are reshaped freely with no migrations kept (`README.md` line 13; reset with `pnpm db:reset`). When this guide and the source disagree, **the source wins**. The _steps_ above are stable; for exact field shapes always read the Zod schema in `src/server/schemas/<ns>.ts` rather than trusting a transcription.

## See also

- [reference-orpc-api.md](./reference-orpc-api.md) — point-to-source index of all procedures by namespace + `file:line`.
- [explanation-architecture.md](./explanation-architecture.md) — one codebase, two runtimes, one data path; the auth + query-vs-mutation model.
- [explanation-completion-and-heatmap.md](./explanation-completion-and-heatmap.md) — why completions are archived (not deleted) and how the Todo ∪ Completed union feeds the heatmap.
- [howto-local-dev-and-tests.md](./howto-local-dev-and-tests.md) — the dev + test loop, including the Postgres-up step the integration gate needs.
