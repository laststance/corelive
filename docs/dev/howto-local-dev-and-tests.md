# How to run the local dev + test loop

A task-oriented recipe for the day-to-day inner loop: bring up the database, run the dev server (web or Electron), and drive the four test tiers plus the `pnpm validate` gate. Assumes you've already done [the getting-started tutorial](./tutorial-getting-started.md) (cloned the repo, copied `.env.example` to `.env`, filled in Clerk + DB values). The canonical, always-current command list lives in `package.json` `"scripts"` — this doc shows you _which_ command does _what_ and the gotchas around each.

## Cold start (the worked example)

From a clean checkout with `.env` in place, this is the whole loop:

```bash
# 1. Start the local Postgres container (background)
docker compose up -d postgres

# 2. Apply migrations + generate the Prisma client
pnpm prisma:migrate
#    …or, to wipe + re-migrate + reseed in one shot (the pre-launch habit):
pnpm db:reset

# 3. Run the web dev server on http://localhost:3011
pnpm dev

# 4. In another terminal, run the unit tests
pnpm test
```

Everything below expands each step.

## 1. Start the database

The local Postgres 17 instance is defined in `compose.yml` (note: `compose.yml`, **not** `docker-compose.yml` — Compose resolves it by default).

```bash
docker compose up -d postgres
```

> **Pitfall — name the service.** Run `docker compose up -d postgres`, not a bare `docker compose up -d`. The compose file also defines a `network-delay` sidecar (`compose.yml:31-47`) that injects 100 ms of `netem` latency to simulate production — you do **not** want that locally. Naming the `postgres` service starts only the database.

The working local connection string is (note: `.env.example:3` ships placeholders — `postgresql://username:password@localhost:5432/database_name?schema=public` — so after copying it to `.env` you must replace `username`/`database_name` with `postgres`/`corelive` to match the container below):

```
POSTGRES_PRISMA_URL="postgresql://postgres:password@localhost:5432/corelive?schema=public"
```

Container name `corelive-postgres`, db `corelive`, port `5432` (`compose.yml:2-12`). Common controls:

| Command                                                     | Purpose                       |
| ----------------------------------------------------------- | ----------------------------- |
| `docker compose up -d postgres`                             | Start the DB (background)     |
| `docker compose down`                                       | Stop and remove the container |
| `docker compose logs postgres`                              | View DB logs                  |
| `docker compose exec postgres psql -U postgres -d corelive` | Open a `psql` shell           |

### Reset / migrate / reseed

This repo is **pre-launch**: per `README.md:13`, there are no users and no need to preserve migrations or data — when the schema changes, just reset. The destructive commands:

```bash
pnpm prisma:migrate   # apply pending migrations (prisma migrate dev) + generate client
pnpm db:reset         # migrate reset --force, then reseed (prisma/seed.ts)
pnpm db:truncate      # migrate reset --force, NO reseed
```

The seed is idempotent (`prisma/seed.ts` wraps delete+insert in a transaction), so re-running `pnpm prisma:seed` standalone won't duplicate fixtures.

> **Safety gate.** `prisma:migrate`, `db:reset`, and `db:truncate` are each prefixed with `node scripts/assert-local-db.cjs` (`package.json:43,50,51`). That gate is **fail-closed**: it only lets the destructive command proceed if it can _prove_ the target host is local (allowlist in `scripts/assert-local-db.cjs:24-31`), and it also inspects libpq `?host=`/`?hostname=` query params — so a URL like `postgresql://localhost/db?host=prod.neon.tech` is correctly **blocked**, not waved through. If your `POSTGRES_PRISMA_URL` points at a remote DB, these commands abort with `🛑 [assert-local-db]`. That's the gate working. See [the data-model reset how-to](./reference-data-model.md) for the schema side.

## 2. Run the dev server

### Web

```bash
pnpm dev
```

`next dev -p 3011` (`package.json:22`) — the web app on `http://localhost:3011`. Hot-reloads `src/**`. This is what you want most of the time; both the web app and the Electron renderer load the same Next.js app.

### Electron (desktop wrapper)

```bash
pnpm electron:dev
```

This runs `node scripts/dev.js`, an orchestrator that (1) compiles the Electron main + preload via `electron-vite build`, (2) starts `pnpm dev` on `:3011`, (3) polls until the server answers `200`, then (4) launches `electron/dev-runner.ts` with `NODE_ENV=development` and `PLAYWRIGHT_REMOTE_DEBUGGING_PORT=9222` so MCP / Playwright tooling can attach (`scripts/dev.js:93-180`; step 3's poll-until-`200` loop is `checkServer`, `scripts/dev.js:55-91`). It loads the **local** dev server in a `BrowserWindow`, not the production site. For the architecture of the desktop wrapper, see [the Electron reference](./reference-electron.md).

> **Clerk webhook in local dev.** New Postgres `User` rows are provisioned by a Clerk `user.created` webhook (`src/app/api/webhooks/route.ts`), which Clerk delivers over HTTP — so Clerk needs a public URL to reach your machine. Tunnel `:3011` with ngrok and point the Clerk Dashboard webhook at it (`README.md:130-133`):
>
> ```bash
> ngrok http --domain=foo.bar-ngrok.app 3011
> ```
>
> The webhook is Svix-HMAC-verified against `WEBHOOK_SECRET`. You don't strictly need this for the dev backdoor login (below), but you do need it to test the real "sign up → row appears in Postgres" path.

## 3. Authenticate locally

There are two distinct auth paths; don't conflate them. Full detail in [the authentication reference](./reference-auth.md) and [explanation](./explanation-authentication.md).

| Context                         | How you authenticate                                                            |
| ------------------------------- | ------------------------------------------------------------------------------- |
| **Local dev** (manual clicking) | Real Clerk Dev session via the UI, **or** the oRPC dev backdoor (below)         |
| **E2E tests**                   | Real Clerk Dev instance — **never mocked** — using the `E2E_CLERK_*` test creds |

**The dev backdoor.** When `NODE_ENV === 'development'`, the oRPC auth middleware treats the literal Bearer token `user_mock_user_id` as a fixed test user and upserts `test@example.com` (`src/server/middleware/auth.ts:18-32`). So a request carrying `Authorization: Bearer user_mock_user_id` resolves to that user with no real Clerk session. This is how non-Clerk tooling and some local flows hit authed oRPC procedures. It is gated on `NODE_ENV === 'development'` and is unreachable in production builds.

**E2E auth is real.** The Playwright web suite logs into the actual Clerk **Dev** instance using `E2E_CLERK_USER_USERNAME` / `_PASSWORD` / `_EMAIL`. Those credentials must be registered in the Clerk Dashboard (`README.md:67-75`); there is no mocking. Env-var details live in `README.md` — don't duplicate them here.

## 4. The four test tiers

Each tier has its own config so environments don't collide. **Four tiers, five commands** — three Vitest configs plus one E2E tier that has two Playwright projects (web and Electron):

| Tier           | Command               | Runner / env                                                    | What it covers                                   |
| -------------- | --------------------- | --------------------------------------------------------------- | ------------------------------------------------ |
| Unit           | `pnpm test`           | Vitest, `happy-dom` (`vitest.config.ts`)                        | `src/**` units (components, hooks, server utils) |
| Electron unit  | `pnpm test:electron`  | Vitest, `node` env (`vitest.config.electron.ts`)                | `electron/**` main + preload logic               |
| Storybook      | `pnpm test:storybook` | Vitest in real headless Chromium (`vitest.config.storybook.ts`) | Story render/interaction tests                   |
| E2E (web)      | `pnpm e2e:web`        | Playwright `web` project (`playwright.config.ts`)               | Full browser flows against a served build        |
| E2E (Electron) | `pnpm e2e:electron`   | Playwright `electron` project (`playwright.electron.config.ts`) | Renderer paths via `_electron.launch`            |

> **Run tests under Node 24.13.0 to match CI.** CI pins Node `24.13.0` (`package.json:11-12`, and the shared `.github/actions/prepare` action). A newer local Node can break the unit suite. If `pnpm test` fails locally but passes in CI, check your Node version first (e.g. via `volta`/`mise`) before chasing a phantom regression.

### `pnpm e2e:web` — two preconditions

```bash
pnpm e2e:web
```

This runs `playwright test --project=web` (`package.json:54`). Two things must hold:

1. **It needs a production build.** The Playwright `webServer` block runs `pnpm start` = `next start -p 3011` (`playwright.config.ts:103`, `package.json:26`), which serves the **built** app — so run `pnpm build` first (or have a build present). `next start` will not serve un-built sources.
2. **The webServer may not boot locally on macOS.** On the maintainer's Mac the Playwright `webServer` fails to come up due to an IPv6/loopback mismatch (the server itself is healthy; Playwright's health-poll can't reach it). If `pnpm e2e:web` hangs at "waiting for server" locally, that's the known issue — **verify web E2E on CI** (the `E2E Tests (Web)` workflow) rather than fighting it locally.

The web suite forces `workers: 1` (`playwright.config.ts:36`) because every spec shares one seeded Clerk user and one Postgres DB; parallel workers cause cross-file data races. True parallelism comes from the CI per-spec matrix, not Playwright workers — the _why_ is in [the build & CI explanation](./explanation-build-and-ci.md).

### `pnpm e2e:electron` — native on macOS, xvfb on Linux

```bash
pnpm e2e:electron
```

This compiles the Electron main/preload (`pnpm electron:build:ts`) then runs the `electron` Playwright config (`package.json:55`). On **macOS, run it directly** — Electron uses the native display. On **Linux/CI it needs a virtual display**:

```bash
xvfb-run -a pnpm e2e:electron   # Linux / CI only
```

> **Coverage limit.** The Electron E2E suite drives the **renderer only** — the same web content the browser tests see. Native Cocoa chrome (menu bar, tray, dock, traffic-light controls, `open-url` deep links, vibrancy) has **no** automated coverage and requires a manual macOS smoke before releases (see [the Electron reference](./reference-electron.md)).

## 5. `pnpm validate` — the pre-commit gate

```bash
pnpm validate
```

Run this before committing. It executes **six** tasks in parallel via `concurrently --kill-others-on-fail` (`package.json:40`) — the first failure aborts the rest:

| Slot    | Command              | Checks                                             |
| ------- | -------------------- | -------------------------------------------------- |
| `test`  | `pnpm test`          | Unit suite                                         |
| `pkg`   | `pnpm test:packages` | The in-repo `eslint-plugin-dslint` workspace tests |
| `lint`  | `pnpm lint:fix`      | ESLint, zero-warnings, auto-fix                    |
| `build` | `pnpm build`         | `next build --webpack` (production build)          |
| `type`  | `pnpm typecheck`     | `tsc --noEmit`                                     |
| `theme` | `pnpm theme:check`   | Fails if `src/lib/themes/generated.css` is stale   |

> The E2E tiers (`e2e:web` / `e2e:electron`) and Storybook are **not** part of `validate` — they run as separate CI workflows. `validate` is the fast local gate; CI splits these out. For the full workflow/command map, see [the CI & commands reference](./reference-ci-and-commands.md).

> **`build` uses `--webpack`, not Turbopack** (`package.json:23`) — this is deliberate. If you swap it for Turbopack you risk dropped CSS `@import`s; keep it as-is.

## Debugging a packaged Electron build

`pnpm electron:dev` runs the unbundled dev app — but some bugs only reproduce in a **packaged** build (e.g. `NODE_ENV` is unset in packaged apps, and electron-builder can drop transitive deps). To reproduce those, build and open the real `.app`:

```bash
pnpm electron:build:dir          # unpacked .app, no DMG, no signing
open dist/mac*/CoreLive.app      # mac* glob: --dir builds your host arch
```

DevTools and the Chrome DevTools Protocol (CDP) port are **off by default** in packaged builds. Two opt-ins (`electron/utils/debugMode.ts:83-87` for the DevTools gate, `:133-158` for the CDP-port resolver):

- `CORELIVE_DEBUG=1` — turns DevTools on for all windows and opens the default CDP port `9222` (override with `CORELIVE_REMOTE_DEBUGGING_PORT`).
- `PLAYWRIGHT_REMOTE_DEBUGGING_PORT=<port>` — the E2E lever (highest precedence); the dev-runner sets it to `9222` automatically.

```bash
CORELIVE_DEBUG=1 open dist/mac*/CoreLive.app
```

For native-chrome QA (menu bar, tray, dock, deep links) you must drive the real desktop — the DOM/Playwright tools can't reach Cocoa surfaces. See [the Electron reference](./reference-electron.md) and the project's local `CLAUDE.md` Electron Native QA section.

## See also

- [Tutorial: Getting started](./tutorial-getting-started.md) — first-time `.env` + Clerk setup
- [Reference: CI workflows & command index](./reference-ci-and-commands.md) — every workflow + the authoritative `package.json` script map
- [Explanation: build & CI topology](./explanation-build-and-ci.md) — _why_ `workers: 1`, the per-spec web matrix, the single xvfb Electron job
- [How to cut a macOS release](./howto-cut-a-release.md)
- [Reference: Authentication surface](./reference-auth.md) · [Explanation: how auth works](./explanation-authentication.md)
- The hub index: [docs/dev](./README.md)
