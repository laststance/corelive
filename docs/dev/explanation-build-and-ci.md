# Why the build & CI topology looks the way it does

CoreLive's build and CI shape is dominated by three constraints that don't show up in any single config file: the web E2E suite shares **one** seeded Clerk user and **one** Postgres database, the desktop app ships as a **notarized native macOS bundle wrapped in a DMG**, and a developer's local `POSTGRES_PRISMA_URL` can point at the **production Neon database**. This page explains the decisions those constraints forced, the threat each invariant defends, and what breaks if a future engineer removes one. It does not list commands — for the authoritative command/workflow index see [`reference-ci-and-commands.md`](./reference-ci-and-commands.md), and `package.json` `"scripts"` is the single source of truth for every script body.

> Scope note: this is the _why_, not the _how_. The release procedure lives in [`howto-cut-a-release.md`](./howto-cut-a-release.md); signing setup and troubleshooting live in [`../BUILD_AND_DEPLOYMENT.md`](../BUILD_AND_DEPLOYMENT.md) (note: that doc is partly stale on the build pipeline — it predates the `electron:build:ts` and DMG-finalize steps documented below, so trust this page for the _rationale_ and the source for the _mechanics_). The theme-CSS generator, icon generator, the test tiers (three vitest configs plus Playwright E2E), and the `compose.yml` naming are adjacent build machinery covered elsewhere — see [`explanation-theme-system.md`](./explanation-theme-system.md) and [`reference-ci-and-commands.md`](./reference-ci-and-commands.md).

---

## Playwright runs `workers: 1` because the test fixtures are shared, not isolated

`playwright.config.ts:36` hard-codes `workers: 1` for both local and CI runs. This is not a performance default — it is a correctness requirement, and the config comment (`playwright.config.ts:16-35`) spells out exactly why.

Every web E2E spec authenticates as the **same** seeded Clerk user (`test@test.com`) against the **same** PostgreSQL database. Many specs mutate global, user-scoped state: the comment's worked example is `qa-fixes.spec.ts`'s "Clear all completed" test, which calls the `clearCompleted` procedure. That procedure archives completions into the `Completed` table and then `deleteMany`s the `Todo` rows for the user (`src/server/utils/archiveCompletedTodos.ts`); `NodeAssignment` is left to the schema's `onDelete: SetNull` (the rows orphan with `todoId → null`, XP preserved via the `todoText` snapshot — `prisma/schema.prisma:213`), so it is **not** cascade-deleted. The race `workers: 1` prevents is the `deleteMany` on `Todo` rows: run concurrently with `skill-tree.spec.ts` on a second worker, it removes completed todos that spec just seeded — a cross-file data race that surfaces as a flaky, confusing failure far from its cause. (The upstream `playwright.config.ts:16-35` comment still describes this as a `NodeAssignment` cascade; that wording is stale — the mechanism is the `Todo`-row delete above.)

The subtle part — and the reason `fullyParallel: false` alone is insufficient — is that `fullyParallel: false` only serializes tests **within** a single file; Playwright still distributes different _files_ across workers. `workers: 1` is the only setting that serializes across files when they share database state.

This is a deliberate, **temporary** trade. The config records an explicit **exit criterion** (`playwright.config.ts:30-35`): single-worker execution halves CI throughput across the whole suite and should not be permanent. The clean fix is **per-worker Clerk users** — each worker owning its own Prisma `User` row would make `clearCompleted` naturally scoped to one worker's data, at which point this flips back to `workers: undefined`. If you are tempted to bump `workers` to recover speed, that exit criterion is the gate: the shared-fixture race must be eliminated first, or the suite goes non-deterministic.

## True parallelism is recovered above Playwright, via a per-spec CI matrix

Because `workers: 1` serializes the suite inside one runner, parallelism is recovered one level up — in GitHub Actions. `e2e.web.yml` does **not** use Playwright's built-in `--shard=N/M`; it fans out **one runner per spec file**, and each runner provisions its own Postgres + Next.js.

The `detect-specs` job (`.github/workflows/e2e.web.yml:38-60`) auto-discovers every `e2e/web/*.spec.ts`, strips it to a bare spec name, and emits a JSON array; the downstream `e2e-web` job consumes that array via `fromJson(...)` as a matrix (`.github/workflows/e2e.web.yml:77-80`). Adding or removing a spec needs **no workflow edit** — the matrix size auto-adjusts on the next run.

The choice of _per-file runners_ over _Playwright sharding_ follows directly from `workers: 1` (`.github/workflows/e2e.web.yml:31-37`): with a single worker, `--shard` would split tests across shards but still **serialize within each shard**, so it buys nothing. Separate runners give _true_ parallelism precisely because each gets an **isolated database** — and every spec already calls `test.beforeAll(resetDatabase)`, so an isolated DB per runner is the natural unit of work. The threat model that `workers: 1` defends (the cross-spec `deleteMany` race on `Todo` rows) simply cannot occur across runners that never share a database.

Each runner writes a `blob` report rather than HTML, and a final `merge-reports` job recombines all `blob-report-*` artifacts into one browsable HTML report via `playwright merge-reports` (`.github/workflows/e2e.web.yml:195-227`). This is why `playwright.config.ts:38-46` selects the `blob` reporter on CI but `list` locally — the blob format exists specifically so the fan-out shards can fan back in.

There is one extra subtlety worth preserving: the per-runner reset would otherwise happen _twice_. `e2e/global-setup.ts` already does an up-front reset, and each spec's `test.beforeAll(resetDatabase)` would repeat the same migrate+seed (~5-10s wasted per shard). The matrix step therefore sets `E2E_SKIP_PER_SPEC_RESET: 'true'` (`.github/workflows/e2e.web.yml:145-165`), and `resetDatabase` early-returns when it sees that flag. Each runner runs exactly one spec, so the single global reset is already sufficient.

## The Electron E2E suite stays a single xvfb job — until the math changes

`e2e.electron.yml` is deliberately the opposite shape: **one** `ubuntu-latest` job under `xvfb-run`, not a per-spec matrix. The header comment (`.github/workflows/e2e.electron.yml:1-34`) is the canonical rationale and even names the break-even.

The web matrix wins because it **amortizes** Postgres + Next.js bring-up across many specs; that amortization only pays off past roughly **6 specs**. The Electron suite is **3 specs** at v0, so per-spec runners would spend more time on setup than on the tests. Worse, each Electron shard also pays an extra ~10-20s for `pnpm electron:build:ts` (the electron-vite compile of main + preload). Below the break-even, a single job is simply cheaper. The comment records the trigger to revisit: when the Electron suite grows past ~6 specs, convert it to the `e2e.web.yml`-style matrix + merge-reports flow.

Two further facts shape this job and are easy to break if you don't know them:

- **Why `xvfb` at all.** Electron needs a display to create a `BrowserWindow`; CI runners are headless, so `xvfb` supplies a virtual one (`.github/workflows/e2e.electron.yml:18-22`). The repo's "macOS only" constraint applies to **packaged DMG releases** (signing/notarization), _not_ to running Electron under a virtual display for tests — Electron itself runs fine on Linux.
- **Why a second Playwright config exists.** `pnpm e2e:electron` runs against `playwright.electron.config.ts`, which narrows `projects` to the `electron` project and emits HTML directly. The config comment (`playwright.electron.config.ts:5-24`) explains you _cannot_ express this by toggling the reporter with a `--project` flag in the base config: **Playwright evaluates `reporter` at config-load time, before the CLI's `--project` is parsed.** The web suite needs `blob` → merge fan-in; the 3-spec Electron suite needs HTML directly; that is two different reporter values, so it is two config files.

The most important thing this job does **not** cover is the load-bearing caveat. Linux + xvfb drives the **renderer only** — identical paths to the web app. The native Cocoa chrome (`app.setActivationPolicy`, dock / menu bar / traffic-light buttons, `open-url` deep links, vibrancy, notarized `.app`/asar paths) has **zero automated coverage** (`.github/workflows/e2e.electron.yml:24-29`). That is why a **manual macOS smoke** before every tag push is mandatory, not optional — see [`../BUILD_AND_DEPLOYMENT.md`](../BUILD_AND_DEPLOYMENT.md) and the project's local `CLAUDE.md` "Electron Native QA" section. A future engineer who reads "Electron E2E passed" as "Electron works" will ship a broken tray or dock with green CI.

## There are two notarizations because the `.app` and the `.dmg` are two different artifacts

A macOS release produces a notarized **app bundle** _inside_ a notarized **disk image**, and Gatekeeper checks them independently. electron-builder only notarizes one of them, so the build does the second pass itself. This page is the canonical home for _why_ — `../BUILD_AND_DEPLOYMENT.md` predates this two-phase flow.

**Phase 1 — the `.app`, during packaging.** `electron-builder.json:106` registers an `afterSign` hook pointing at `scripts/notarize.js`. That hook calls `@electron/notarize` on the `.app` bundle (`scripts/notarize.js:26-32`, bundle ID `com.corelive.app`). It is a no-op on non-darwin platforms and when Apple credentials are absent (`scripts/notarize.js:7-23`), so PR builds and Linux jobs skip it harmlessly.

**Phase 2 — the `.dmg`, after packaging.** The `afterSign` hook does **not** cover the DMG _wrapper_ — electron-builder builds the DMG after that hook runs. So `electron:build:mac` chains a third command after electron-builder: `node scripts/finalize-mac-release-artifacts.js` (`package.json:59`). That script notarizes and staples **each** DMG (x64 + arm64) via `xcrun notarytool submit --wait` and `xcrun stapler staple` (`scripts/finalize-mac-release-artifacts.js:138-164`), and it is idempotent — it skips a DMG that already has a stapled ticket (`scripts/finalize-mac-release-artifacts.js:84-93, 139-144`), so a retried release doesn't double-submit.

The non-obvious part — and the reason this can't be left to electron-builder — is **ordering**. Stapling **mutates the DMG's bytes** _after_ electron-builder has already written its blockmaps, `latest-mac.yml`, and `checksums.json` from the _pre-staple_ bytes. If those were published as-is, every integrity check downstream would compare against the wrong hash. So Phase 2 finishes by undoing and redoing that metadata from the **post-staple** bytes:

1. Delete the now-stale `.dmg.blockmap` files, because stapling invalidated them (`scripts/finalize-mac-release-artifacts.js:172-179`).
2. Rewrite `latest-mac.yml` (the auto-update manifest) with fresh SHA-512 + sizes computed from the stapled files (`scripts/finalize-mac-release-artifacts.js:187-214`).
3. Rewrite `checksums.json` (manual-download integrity) with fresh SHA-256 + sizes (`scripts/finalize-mac-release-artifacts.js:221-244`).

The script is darwin-only (`scripts/finalize-mac-release-artifacts.js:251-257`). If a future engineer collapses this back into the `afterSign` hook, or reorders the manifest rewrite before stapling, the symptom is an **auto-updater that refuses to install** (the `latest-mac.yml` hash won't match the downloaded DMG) — a silent, post-ship failure that no CI step catches.

Two adjacent invariants make this pipeline coherent and are worth stating because they have bitten releases before:

- `electron:build:mac` passes `electron-builder --mac --publish never` (`package.json:59`). It signs and notarizes but **does not upload**. Uploading is a _separate_ `release` GitHub Actions job that runs `gh release` on tag pushes only (`.github/workflows/build-and-release.yml:109-146`). The `electron:publish` script (`electron-builder --publish=always`, `package.json:61`) exists but is **never** used — it would double-publish and bypass the DMG-finalize step entirely. Releases go through a `v*` tag, not through that script.
- The renderer is **not** packaged. `electron-builder.json:22` excludes `src/**` (and `.ts`/`.tsx` throughout `files`), because the app loads `https://corelive.app/` remotely — it is a WebView, with no embedded Next.js bundle. This is why the `electron:build:mac` script (`package.json:59`) runs `electron:build:ts` (compile main + preload) but **does not** invoke `next build` — the packaged `.app` ships no Next.js output. The release _workflow_ still runs `pnpm build` unconditionally (`build-and-release.yml:72-73`, no `if:` gate, so on `v*` tag pushes too), but that build's output is not bundled into the `.app`. See [`explanation-electron-architecture.md`](./explanation-electron-architecture.md) for the WebView decision.

## Destructive DB commands are gated fail-closed, because dev and prod share a URL shape

`scripts/assert-local-db.cjs` runs _before_ every destructive Prisma command — it is prefixed onto `db:reset`, `db:truncate`, and `prisma:migrate` as `node scripts/assert-local-db.cjs && ...` (`package.json:43, 50, 51`). It is the single choke point that every path — E2E `global-setup`/`global-teardown`, `resetDatabase`, and a human typing `pnpm db:reset` — must pass through.

The threat is concrete and high-stakes (`scripts/assert-local-db.cjs:4-5`): a developer's `POSTGRES_PRISMA_URL` can point at production Neon, and `prisma migrate reset --force` wipes whatever it connects to. A command meant to reset the local Docker database, inheriting a production URL, would erase production in one shot.

The design is an **allowlist, fail-closed** — "proceed only when provably local," never "stop if it looks like prod" (`scripts/assert-local-db.cjs:9-11`). If the production URL format changes tomorrow, an unrecognized host still fails closed: the gate `exit(1)`s on anything it cannot positively prove is local (`localhost`, `127.0.0.1`, `::1`, the Docker service name `postgres`, the container name `corelive-postgres`, or a Unix-socket path — `scripts/assert-local-db.cjs:24-31, 54-58`).

The subtle, easy-to-reintroduce vulnerability the gate defends against is a **parser divergence** between two URL parsers (`scripts/assert-local-db.cjs:12-16, 80-95`):

- The host check uses the WHATWG `new URL().hostname`.
- But Prisma/libpq **honor a `?host=` / `?hostname=` connection parameter** and actually connect _there_, while WHATWG does **not** reflect that into `.hostname`.

So a naive hostname-only check is **fail-open**: `postgresql://localhost/db?host=prod.neon.tech` reads as "localhost, allowed" under WHATWG, yet Prisma connects to — and would wipe — `prod.neon.tech`. The gate closes this by validating the query-string hosts too, including libpq's comma-separated multi-host form (one non-local entry aborts), and by aborting on backslash-containing URLs where the two parsers disagree on the authority boundary (`scripts/assert-local-db.cjs:62-68, 86-95`). An empty host with no query host also aborts — "cannot prove local" means stop (`scripts/assert-local-db.cjs:100-108`).

If a future engineer "simplifies" this to a plain `hostname === 'localhost'` check, they reopen exactly the fail-open hole this script was written to close. The allowlist and the `?host=` validation are not redundant belt-and-suspenders — each blocks a distinct way to reach production.

## Production migrations run behind a human approval gate

Resetting the _local_ DB is guarded by the script above; migrating the _production_ DB is guarded by GitHub itself. `db-migrate.yml` pins the migrate job to the GitHub `production` environment (`.github/workflows/db-migrate.yml:54-55`), which — when configured with required reviewers — forces a human approval before any migration runs against production.

The workflow is defensive in depth (`.github/workflows/db-migrate.yml:19-39`):

- It triggers on `workflow_dispatch` with a typed-confirmation input — you must literally type `DEPLOY`, or a guard step fails the run (`.github/workflows/db-migrate.yml:58-62`) — and also auto-triggers when migration files land on `main` (`paths: prisma/migrations/**`, `prisma/schema.prisma`).
- It supports a `dry_run` that only checks status and applies nothing (`.github/workflows/db-migrate.yml:79-92`).
- A `concurrency` group with `cancel-in-progress: false` prevents two migrations from racing (`.github/workflows/db-migrate.yml:44-47`) — unlike most workflows here, an in-flight migration must **not** be cancelled mid-run.

This is the production counterpart to `assert-local-db.cjs`: the local gate proves a destructive command is _not_ touching production; the production workflow ensures the deliberate production change is _gated behind a human_. Together they mean neither an accidental local command nor an unreviewed migration can silently mutate production data.

## `pnpm validate` runs everything in parallel and aborts on the first failure

The local pre-commit gate, `pnpm validate` (`package.json:40`), runs **six** checks concurrently via `concurrently ... --kill-others-on-fail`: unit tests, the in-repo ESLint-plugin workspace package tests, lint-with-fix, the Next.js build, the TypeScript typecheck, and the theme-CSS drift check.

The composition is the point. Running these in parallel means the slowest task (the build) does not block the fast ones (lint, typecheck, test) from surfacing failures first, so you get the earliest possible feedback; and `--kill-others-on-fail` aborts the remaining tasks the moment any one fails, so you don't wait on a full build to learn that a typecheck already broke.

CI deliberately does **not** mirror this single command — it **splits** these checks across separate workflows (`test.yml` for unit + electron + theme drift, `e2e.web.yml`, `e2e.electron.yml`, `build-and-release.yml`) so each gets its own runner, its own logs, and independent pass/fail status. `validate` is the _developer's_ one-shot local gate; the workflows are the _enforced_ CI gates. They check overlapping things on purpose, at different granularities. For the workflow-by-workflow breakdown and the exact script bodies, see [`reference-ci-and-commands.md`](./reference-ci-and-commands.md) and `package.json` `"scripts"`.
