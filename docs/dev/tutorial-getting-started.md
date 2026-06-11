# Getting Started: from clone to your first lit heatmap cell

A hand-held, linear walkthrough that takes a brand-new contributor from a fresh
clone all the way to the product's north-star moment: completing a task and
watching that day light up on the Activity Heatmap. Follow every step in order
— this is one happy path designed to succeed on the first try.

> **You will run the web app only.** The macOS Electron wrapper loads the same
> web app remotely and is **not** needed to reach the heatmap. Skip it for now;
> see [the Electron architecture doc](../ELECTRON_ARCHITECTURE.md) when you are
> ready.

---

## Prerequisites

Install these before you start. The pinned versions are what CI uses — match
them to avoid surprises.

| Tool                                                                                                       | Version / note                              | Why                                                                                                                                                   |
| ---------------------------------------------------------------------------------------------------------- | ------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| [Docker](https://docs.docker.com/get-docker/) + [Docker Compose](https://docs.docker.com/compose/install/) | any recent                                  | Runs the local PostgreSQL 17 database                                                                                                                 |
| [Node.js](https://nodejs.org/)                                                                             | **24.13.0** (pinned — `package.json:11-12`) | Toolchain. Node 26 makes the unit-test tier fail (a `happy-dom` / `localStorage` gotcha), so the final `pnpm validate` step needs 24.13.0 to go green |
| [pnpm](https://pnpm.io/)                                                                                   | `10.33.4` (pinned — `package.json:10`)      | The only supported package manager here                                                                                                               |
| [Clerk](https://clerk.com/) account                                                                        | a free **Development** instance             | Authentication — there is no mock-auth path; you sign in for real                                                                                     |
| [ngrok](https://ngrok.com/)                                                                                | optional for this tutorial                  | Only needed to deliver Clerk webhooks locally; this tutorial sidesteps that, so you can skip ngrok                                                    |

> **Node version managers:** the repo pins Node via Volta (`package.json:11-12`).
> If you use [Volta](https://volta.sh/) it will auto-switch to `24.13.0` inside
> the repo. Otherwise install `24.13.0` yourself (e.g. `nvm install 24.13.0 &&
nvm use 24.13.0`) and confirm with `node --version`.

---

## Step 1 — Clone the repository

```bash
git clone https://github.com/laststance/corelive.git
cd corelive
```

**Expected:** a `corelive/` directory containing `package.json`, `compose.yml`,
`prisma/`, and `src/`.

---

## Step 2 — Install dependencies

```bash
pnpm install
```

**Expected:** pnpm installs all packages, then a `postinstall` hook runs
`pnpm prisma generate` (`package.json:21`) to generate the Prisma client. The
run ends with no errors.

---

## Step 3 — Create your `.env` file

Copy the example file:

```bash
cp .env.example .env
```

**Expected:** a new `.env` file in the repo root. Now open it and edit two
groups of values (leave the rest as their placeholders for this tutorial).

### 3a — Set the database URL

`.env.example` ships a generic placeholder for `POSTGRES_PRISMA_URL`. Replace it
with the exact connection string for the local database you will start in
Step 4. The user, password, and database name come straight from
`compose.yml:7-9`; the host and port (`localhost:5432`) come from the published
port mapping (`compose.yml:11-12`):

```dotenv
POSTGRES_PRISMA_URL="postgresql://postgres:password@localhost:5432/corelive?schema=public"
```

The `localhost` host matters: every destructive Prisma command is guarded by
`scripts/assert-local-db.cjs`, which only proceeds when the host is provably
local. `localhost` passes the gate, so migrations will run.

### 3b — Fill in your Clerk keys

From your Clerk **Development** instance dashboard
(<https://dashboard.clerk.com/>), copy your two API keys into `.env`:

```dotenv
CLERK_SECRET_KEY=sk_test_...your key...
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=pk_test_...your key...
```

Leave the three `NEXT_PUBLIC_CLERK_*` URL values at their `.env.example`
defaults (`/login`, `/sign-up`, `/home`) — they already match this app's routes.

> **Where the variables are documented:** the full required-variable table
> (names, which side they run on, descriptions) lives in
> [`README.md`](../../README.md#environment-variables). All Next.js env vars are
> validated at startup by `src/env.mjs`, so the app refuses to boot if a
> required one is missing. Do **not** invent variable names — use exactly the
> keys present in `.env.example`.

---

## Step 4 — Start the local database

CoreLive uses PostgreSQL 17 in a Docker container. The Compose file is named
`compose.yml` (not `docker-compose.yml`); `docker compose` finds it
automatically. Start **only** the `postgres` service:

```bash
docker compose up -d postgres
```

**Expected:** Docker pulls `postgres:17` (first run only) and starts a
background container named `corelive-postgres` on port `5432`.

> **Why name the service explicitly?** `compose.yml` also defines a
> `network-delay` sidecar that simulates production latency — it is Linux-only
> (`compose.yml:31-47`) and should not start on a Mac. Naming `postgres` keeps
> it out.

Wait until the container reports healthy before migrating (the health check has
a 30s start period — `compose.yml:25`):

```bash
docker compose ps
```

**Expected:** the `corelive-postgres` row shows status `Up ... (healthy)`.
If it still says `health: starting`, wait a few seconds and run it again.

---

## Step 5 — Apply database migrations

```bash
pnpm prisma:migrate
```

**Expected:** `scripts/assert-local-db.cjs` confirms the target host is local,
then Prisma applies every migration in `prisma/migrations/` and regenerates the
client. You will see a list of applied migrations ending with something like
`Your database is now in sync with your schema`.

This creates all the tables behind the app — `User`, `Category`, `Todo`,
`Completed`, and the rest. The full schema lives in `prisma/schema.prisma`.

---

## Step 6 — Seed initial data (optional)

```bash
pnpm prisma:seed
```

**Expected:** `prisma/seed.ts` upserts a test user, a default `General`
category, and 10 sample to-dos. The seed is idempotent — running it twice does
not duplicate rows (`prisma/seed.ts:60-83`).

> **Note:** the seed user is tied to a specific Clerk test account
> (`prisma/seed.ts:22-32`). Unless you sign in as that exact account, you
> **won't** see the seeded to-dos under your own login — and that is fine. This
> tutorial has you create your own category and task in Step 9, so seeding is
> just a convenience here, not a requirement.

---

## Step 7 — Start the dev server

```bash
pnpm dev
```

**Expected:** Next.js starts on port **3011** (`package.json:22`) and prints a
ready message. Leave this running.

Open <http://localhost:3011> in your browser.

**Expected:** the app loads. Because the home routes are protected by Clerk
(`src/proxy.ts`), an unauthenticated visit redirects you to the `/login` page.

---

## Step 8 — Sign in with Clerk

On the `/login` page, sign up or sign in using your Clerk Development instance
(email/password or any social provider you enabled in Clerk).

**Expected:** after authenticating, Clerk redirects you to `/home`
(the `NEXT_PUBLIC_CLERK_SIGN_IN_FORCE_REDIRECT_URL` you left as `/home`). You
land on the home page: a **pending** column on the left and a **completed**
column (with the Activity Heatmap) on the right.

> **First-login note:** the very first time _your_ Clerk identity hits an
> authenticated API call, the server lazily creates your `User` row from your
> Clerk id (`src/server/middleware/auth.ts`). A brand-new account starts with
> **no categories**, which is exactly why the next step has you create one.

---

## Step 9 — Create your first category

A task must belong to a category, so create one first. In the left sidebar, find
the **Categories** section and click the **+** (Add) button to open the
Add-category popover (`src/app/(main)/home/_components/Category.tsx`).

1. Type a name in the **Category name** field, e.g. `Focus`.
2. (Optional) pick a color dot.
3. Click **Create** (or press **Enter**) to save it.

**Expected:** the new category appears in the sidebar and becomes the selected
category. (Creating it also finalizes your `User` row server-side.)

---

## Step 10 — Add a task

With your new category selected, use the new-todo input (placeholder
`Enter a new todo...`) at the top of the pending column. The form lives in
`src/app/(main)/home/_components/AddTodoForm.tsx` (its placeholder is on line 68)
and is rendered by `src/app/(main)/home/_components/TodoList.tsx`. Type a task,
e.g. `Write the getting-started doc`, and submit.

**Expected:** the task appears instantly at the top of the pending list (the UI
updates optimistically, then reconciles with the server).

---

## Step 11 — Check it off and watch the motion

Click the checkbox to the left of your task
(`src/app/(main)/home/_components/TodoItem.tsx`).

**Expected:**

- The checkbox plays a brief **amber fill** completion motion
  (`src/hooks/useCompletionFeedback.ts`) — this affirms "you did something."
- By default the task moves into the **Completed** column.

> **Sound is off by default.** A soft completion tone exists but is **opt-in**
> (default OFF). Don't expect a sound unless you enable "Completion sound" in
> Settings. To verify the _motion_ properly, record it — per the project's
> motion-review rule, screenshots can't reveal how an animation actually feels.

---

## Step 12 — Open that day on the Activity Heatmap (the north-star moment)

In the completed column, look at the **Activity Heatmap**
(`src/app/(main)/home/_components/ContributionGraph.tsx:184`). Today's cell is
now warm — a single completion lights the first ("started") intensity band
(`src/lib/heatmap-intensity.ts:19` — a day needs 4 completions for "good day",
so one task is band 1, not a full cell).

Click today's cell.

**Expected:** the **Day Detail** dialog opens
(`src/app/(main)/home/_components/DayDetailDialog.tsx`), showing the task you
just completed plus affirming, on-voice copy for the day. You did it — your
first lit heatmap cell.

> Want it warmer? Add and complete a few more tasks. At 4 completions the day
> reaches the "good day" band; the warmth is **pride, not a KPI** — the palette
> is intentionally warm amber, never GitHub-green. See
> [`DESIGN.md`](../../DESIGN.md) for the why.

---

## Step 13 — Confirm the project is healthy

Stop the dev server (`Ctrl-C` in its terminal), then run the full local gate:

```bash
pnpm validate
```

**Expected:** `concurrently` runs six checks in parallel — unit tests, the
in-repo ESLint plugin's tests, lint (auto-fix), the Next.js build, `tsc`
type-check, and the theme-CSS drift check (`package.json:40`). Any single
failure aborts the rest. A green run means your environment is set up correctly
and matches what CI expects.

> **If a unit test fails about `localStorage`/`window`,** you are almost
> certainly not on Node `24.13.0` — re-check the Prerequisites section (the Node
> `24.13.0` row) and re-run.

> **Pre-launch volatility:** this repo has no users yet, so the schema and APIs
> are reshaped freely and old data is not preserved
> ([`README.md`](../../README.md) line 13). Whenever the schema changes under
> you, just reset your local database with `pnpm db:reset` (drops, re-migrates,
> and re-seeds — guarded by the same local-DB safety check).

---

## What you just learned: the data path

You drove one completion end to end. Here is the path that lit your heatmap
cell:

1. **Browser (web)** — you clicked the checkbox in `TodoItem`. The mutation hook
   (`src/hooks/useTodoMutations.ts`) updated the UI optimistically and sent the
   change.
2. **oRPC over HTTP** — the client posts to `/api/orpc/*`
   (`src/app/api/orpc/[...path]/route.ts`), carrying your Clerk identity so the
   server knows it's you (`src/server/middleware/auth.ts`). The heatmap itself
   reads the `completed.heatmap` procedure (`src/server/procedures/completed.ts`).
3. **Prisma → PostgreSQL** — procedures talk to Postgres through the shared
   Prisma client (`src/lib/prisma.ts`). Checking off a task stamps the to-do's
   `completedAt`.
4. **Heatmap aggregation** — `fetchCompletedEntries`
   (`src/server/utils/completedAggregation.ts`) unions completed `Todo` rows
   with the separate `Completed` stream and buckets them by day. With the
   default settings, checking off a normal task lights the heatmap via its
   **`Todo` row** (it does **not** write a `Completed`-table row — that table is
   the archive / BrainDump / paste-import stream). `useHeatmapData`
   (`src/hooks/useHeatmapData.ts`) feeds the result to `ContributionGraph`.

The Electron desktop app uses this **exact same** web → oRPC → Prisma path; it
just renders the web app inside a macOS window.

---

## Next steps

You've seen the core loop. The rest of the developer docs are organized by the
[Diátaxis](https://diataxis.fr/) framework — browse the
**[documentation hub](./README.md)**, or jump straight to:

- **Understand the design** — [Architecture: one codebase, two runtimes, one data
  path](./explanation-architecture.md), then [why a finished day stays
  lit](./explanation-completion-and-heatmap.md) (the heatmap invariant you just saw
  in action).
- **Do more** — [run the local dev + test loop](./howto-local-dev-and-tests.md),
  [add a new oRPC procedure](./howto-add-orpc-procedure.md), or [add a colored theme
  family](./howto-add-theme-family.md).
- **Look things up** — the [oRPC API](./reference-orpc-api.md) and [data
  model](./reference-data-model.md) references, or the deeper [Electron
  internals](../ELECTRON_ARCHITECTURE.md).

The authoritative command list is always the `scripts` block in
[`package.json`](../../package.json); environment variables are in
[`README.md`](../../README.md#environment-variables).
