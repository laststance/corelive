# CI workflows & command index

A point-to-source map of CoreLive's command surface (`package.json` scripts), GitHub Actions workflows, the shared CI setup action, the `validate` parallel gate, and the four test tiers with their four configs. This is an index — the authoritative command strings live in `package.json` "scripts" and the env tables in [`README.md`](../../README.md); follow the `file:line` anchors rather than trusting any value transcribed here (this repo is pre-launch and reshaped freely — see [`README.md`](../../README.md)).

For the _why_ behind the CI topology, see [explanation: Why the build & CI topology looks the way it does](./explanation-build-and-ci.md). For the release procedure, see [how-to: How to cut a macOS release](./howto-cut-a-release.md). For the local loop, see [how-to: How to run the local dev + test loop](./howto-local-dev-and-tests.md). Signing/notarization setup and troubleshooting live in [`docs/BUILD_AND_DEPLOYMENT.md`](../BUILD_AND_DEPLOYMENT.md) (note: that doc's pinned Node/pnpm versions have drifted — trust `package.json:10-12` and `.github/actions/prepare/action.yml:13`).

## Cross-cutting invariants

These rules hold across the whole command/CI surface:

- **`package.json` "scripts" is the single source of truth for every command.** Do not re-document command strings elsewhere; cite `package.json:<line>`. The env-var tables are owned by [`README.md`](../../README.md).
- **One shared setup action.** Every workflow installs Node + pnpm via `./.github/actions/prepare` (`.github/actions/prepare/action.yml`) — Node `24.13.0`, pnpm via `pnpm/action-setup`, `pnpm install --frozen-lockfile`. Bump the toolchain in one place there.
- **The Compose file is `compose.yml`, NOT `docker-compose.yml`.** `docker compose up -d` finds it by Compose's default filename resolution; CI passes `-f compose.yml -p corelive` explicitly (e.g. `.github/workflows/test.yml:47`). A doc or command saying `docker-compose.yml` is wrong.
- **`validate` is the _local_ pre-commit gate; CI splits the same checks into separate workflows.** `pnpm validate` (`package.json:40`) runs six checks in parallel locally; CI fans them out (`build.yml`, `lint.yml`, `typecheck.yml`, `test.yml`, …) so a single check's failure is isolated per workflow.
- **Destructive Prisma commands route through a fail-closed safety gate.** `db:reset`, `db:truncate`, `prisma:migrate` (`package.json:50,51,43`) are each prefixed with `node scripts/assert-local-db.cjs && …`. See [Safety & guard scripts](#safety--guard-scripts).
- **macOS releases are tag-driven; never `pnpm electron:publish`.** Pushing a lightweight `v*` tag fires `build-and-release.yml`. The `electron:publish` script exists but is intentionally never invoked (it would double-publish and bypass the DMG finalize step). See [how-to: How to cut a macOS release](./howto-cut-a-release.md).
- **The packaged Electron app bundles no Next.js output.** `electron-builder.json:22` excludes `src/**`; the renderer is omitted from the electron-vite build (`electron.vite.config.ts:85-86`). The `.app` loads `https://corelive.app/` remotely. So `electron:build:mac`/`:dir` do **not** run `pnpm build`; `next build` matters for the web deploy, for E2E (which serve the app locally), and as a build-check step in the release workflow's macOS `build` job (`build-and-release.yml:73`), whose output the package does not consume. See [explanation: Electron architecture decisions](./explanation-electron-architecture.md).

## Command index (point to `package.json`)

The canonical list is `package.json:20-63` ("scripts"). The most load-bearing entries and their anchors:

| Command                                       | `package.json`        | What it is                                                                                                                         |
| --------------------------------------------- | --------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| `pnpm validate`                               | `:40`                 | Local pre-commit gate — six checks in parallel via `concurrently --kill-others-on-fail`. See [below](#the-validate-parallel-gate). |
| `pnpm dev`                                    | `:22`                 | Next.js dev server on port 3011 (web only).                                                                                        |
| `pnpm build`                                  | `:23`                 | Production Next.js build, `--webpack` (not Turbopack); `prebuild` (`:25`) regenerates icons first.                                 |
| `pnpm typecheck`                              | `:39`                 | `tsc --noEmit`.                                                                                                                    |
| `pnpm lint` / `lint:fix`                      | `:27` / `:28`         | ESLint, zero-warning policy, 8 GB heap; `validate` uses `lint:fix`.                                                                |
| `pnpm test`                                   | `:29`                 | Unit tier (vitest). See [test tiers](#four-test-tiers-four-configs).                                                               |
| `pnpm test:electron`                          | `:30`                 | Electron main/preload unit tier.                                                                                                   |
| `pnpm test:storybook`                         | `:32`                 | Storybook story tier (real Chromium).                                                                                              |
| `pnpm test:packages`                          | `:35`                 | In-repo `eslint-plugin-dslint` workspace package's own tests (part of `validate`).                                                 |
| `pnpm theme:generate` / `theme:check`         | `:36` / `:37`         | Regenerate / drift-check `src/lib/themes/generated.css`. See [reference: Theme system](./reference-theme-system.md).               |
| `pnpm build:icons`                            | `:24`                 | Regenerate app/tray/favicon assets via `sharp`; wired as `prebuild` (`:25`).                                                       |
| `pnpm e2e:web`                                | `:54`                 | Web E2E (`--project=web`). Boots the app via the Playwright `webServer` block (`pnpm start`).                                      |
| `pnpm e2e:electron`                           | `:55`                 | Electron E2E — compiles main/preload then launches via `_electron.launch`; prefix with `xvfb-run -a` on Linux.                     |
| `pnpm electron:dev`                           | `:57`                 | Dev orchestrator (`scripts/dev.js`): build electron → start Next → poll `:3011` → launch.                                          |
| `pnpm electron:build:ts`                      | `:58`                 | `electron-vite build` — compiles `electron/` main + preload to CJS into `dist-electron/`.                                          |
| `pnpm electron:build:dir`                     | `:60`                 | Unpacked `.app` for local prod testing (no DMG, no signing).                                                                       |
| `pnpm electron:build:mac`                     | `:59`                 | Full signed+notarized release build, then DMG finalize. See [release builds](#release-build-pipeline).                             |
| `pnpm electron:publish`                       | `:61`                 | **DO NOT USE** — auto-publishing path; releases go via tag instead.                                                                |
| `pnpm prisma:migrate` / `:deploy` / `:status` | `:43` / `:45` / `:44` | Local migrate (gated) / prod deploy / status.                                                                                      |
| `pnpm db:reset` / `db:truncate`               | `:50` / `:51`         | Destructive local reset (+seed) / reset (no seed); both gated.                                                                     |
| `pnpm storybook` / `build-storybook`          | `:52` / `:53`         | Storybook dev server (port 6006) / static build.                                                                                   |

Ports and the env-var tables are documented in [`README.md`](../../README.md), not here.

## The `validate` parallel gate

`pnpm validate` (`package.json:40`) runs **six** checks concurrently via `concurrently … --kill-others-on-fail` — the first failure aborts the rest:

| Label   | Underlying script                                       | `package.json` |
| ------- | ------------------------------------------------------- | -------------- |
| `test`  | `pnpm test` (unit vitest)                               | `:29`          |
| `pkg`   | `pnpm test:packages` (`eslint-plugin-dslint` workspace) | `:35`          |
| `lint`  | `pnpm lint:fix`                                         | `:28`          |
| `build` | `pnpm build` (`next build --webpack`)                   | `:23`          |
| `type`  | `pnpm typecheck` (`tsc --noEmit`)                       | `:39`          |
| `theme` | `pnpm theme:check` (generated-CSS drift)                | `:37`          |

CI does **not** run `validate`; it runs the equivalent checks as separate workflows (see the table below) so each surfaces independently.

## GitHub Actions workflows

All workflow files live in `.github/workflows/`. Most jobs begin with `uses: ./.github/actions/prepare`; the lean jobs that need no Node skip it — they only checkout, then enumerate specs (`detect-specs` in `e2e.web.yml`) / run `gh release` (`release` in `build-and-release.yml`) / run Trivy (`security-scan` in `build-and-release.yml`).

| File                    | Trigger                                                                                                    | Job(s) → purpose                                                                                                                                                                                                                                           |
| ----------------------- | ---------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `build.yml`             | PR + push `main`                                                                                           | `build` (ubuntu) → `pnpm build` (Next.js webpack build check).                                                                                                                                                                                             |
| `lint.yml`              | PR + push `main`                                                                                           | `lint` (ubuntu) → build the `eslint-plugin-dslint` workspace (`:22`), run `pnpm lint` (`:24`), then lint the workspace package (`:26`).                                                                                                                    |
| `typecheck.yml`         | PR + push `main`                                                                                           | `typecheck` (ubuntu) → `pnpm typecheck`.                                                                                                                                                                                                                   |
| `test.yml`              | PR + push `main`                                                                                           | `test` (ubuntu, `TZ=Asia/Tokyo` at `:19`) → provision Postgres via Compose, migrate, run unit tests with `RUN_DB_INTEGRATION_TESTS=1` (`:66`), `theme:check` (`:71`), electron unit tests (`:73`), upload coverage to Codecov.                             |
| `storybook-test.yml`    | PR + push `main`/`develop`, manual                                                                         | `storybook-test` (ubuntu) → install Chromium, build Storybook, `pnpm test:storybook` in headless Chromium.                                                                                                                                                 |
| `e2e.web.yml`           | PR (skips `**/*.md`, `docs/**`) + push `main`                                                              | `detect-specs` (enumerate `e2e/web/*.spec.ts` → JSON array) → `e2e-web` **per-spec matrix** (own Postgres + Next.js each, blob report each) → `merge-reports` (combine blobs into one HTML report).                                                        |
| `e2e.electron.yml`      | PR (skips docs) + push `main`                                                                              | `e2e-electron-linux` — **single** ubuntu job under `xvfb-run`; renderer paths only, no Cocoa chrome (`:1-34` rationale, `:146` the xvfb run).                                                                                                              |
| `build-and-release.yml` | push tag `v*` (`:4-6`), PR `main`, manual                                                                  | `test` (ubuntu) → `build` (macOS: `pnpm build` + signed `electron:build:mac` on tag / unsigned `electron:build:dir` on PR, `:82-95`) → `release` (ubuntu, tag-only: `gh release` upload/create, `:109-146`) + `security-scan` (Trivy → SARIF, `:148-171`). |
| `db-migrate.yml`        | manual (type `DEPLOY`, `:24`) + push `main` on `prisma/migrations/**` or `prisma/schema.prisma` (`:37-39`) | `migrate` (ubuntu, GitHub `production` environment for an approval gate, `:55`) → `pnpm prisma:deploy`; supports `dry_run` (`:80,89`).                                                                                                                     |

### Shared composite action

`.github/actions/prepare/action.yml` is the single setup step reused by every workflow: `pnpm/action-setup` (`:8`) + `actions/setup-node` pinned to `24.13.0` with pnpm cache (`:10-17`) + `pnpm install --frozen-lockfile` (`:19-21`). Bump the Node/pnpm toolchain here, not per-workflow.

### CI Postgres

`test.yml`, `e2e.web.yml`, and `e2e.electron.yml` start the database with `docker compose -f compose.yml -p corelive up -d postgres --wait` — note this starts **only** the `postgres` service. The `network-delay` sidecar in `compose.yml:31-47` (a `netem` latency simulator) is opt-in locally and is **not** started in CI. The healthcheck and a follow-up `psql` poll both wait until the `corelive` database exists before migrations run.

## Four test tiers, four configs

Each tier has its own config so environments don't collide. Tier names below are the vitest `test.name` values.

| Tier                       | Config file                                              | Environment         | Scope                                                                               | Notable                                                                                                                    |
| -------------------------- | -------------------------------------------------------- | ------------------- | ----------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| Unit (`unit`)              | `vitest.config.ts`                                       | `happy-dom`         | `src/**/*.{spec,test}` + `src/**/__tests__`                                         | `setupTests.ts`; `@/electron` alias listed **before** `@` so prefix-matching resolves it first (`vitest.config.ts:25-28`). |
| Electron unit (`electron`) | `vitest.config.electron.ts`                              | `node`              | `electron/**`                                                                       | `testTimeout: 10000`; `esbuild.target: 'node18'`.                                                                          |
| Storybook (`storybook`)    | `vitest.config.storybook.ts`                             | real Chromium       | Stories via `@storybook/addon-vitest`                                               | Browser mode through `@vitest/browser-playwright`, `headless: true`.                                                       |
| E2E (web + electron)       | `playwright.config.ts` + `playwright.electron.config.ts` | Chromium / Electron | `e2e/web/*.spec.ts` (`web` project) / `e2e/electron/*.spec.ts` (`electron` project) | See below.                                                                                                                 |

The Playwright base config (`playwright.config.ts`) defines three projects — `setup`, `web`, `electron` — forces `workers: 1` (`:36`, shared Clerk user + single DB), uses the `blob` reporter on CI / `list` locally (`:38-46`), and boots Next.js via the `webServer` block running `pnpm start` (`:102-107`). `playwright.electron.config.ts` reuses that base but narrows `projects` to the `electron` project and swaps to an HTML reporter (`:25-33`) — a separate file is required because Playwright evaluates `reporter` at config-load time, before `--project` is parsed (`playwright.electron.config.ts:5-24`). The rationale for `workers: 1`, the per-spec web matrix, and the single xvfb electron job is in [explanation: Why the build & CI topology looks the way it does](./explanation-build-and-ci.md).

`setupTests.ts` (unit tier setup) installs `@testing-library/jest-dom` matchers and force-installs happy-dom `Storage` onto `window`/`globalThis` to defeat Node 24+'s experimental `localStorage` global that would otherwise shadow the browser-like one — run unit tests under Node `24.13.0` to match CI.

## Release build pipeline

`pnpm electron:build:mac` (`package.json:59`) chains three steps:

1. `pnpm electron:build:ts` — `electron-vite build` compiles `electron/` main (index + 8 lazily-loaded managers) and 3 preloads to CJS into `dist-electron/` (`electron.vite.config.ts:17-84`). The renderer is omitted (`:85-86`).
2. `electron-builder --mac --publish never` — packages DMG + ZIP for x64 and arm64, hardened runtime, `notarize: true` (`electron-builder.json:64-84`). `--publish never` means it does **not** upload. During packaging the `afterSign` hook (`electron-builder.json:106` → `scripts/notarize.js`) notarizes the `.app` via `@electron/notarize` (no-op when Apple creds are missing or off-darwin, `scripts/notarize.js:7,18`).
3. `node scripts/finalize-mac-release-artifacts.js` — separately notarizes + staples each **DMG** via `xcrun notarytool`/`stapler` (the DMG wrapper isn't covered by `afterSign`), deletes now-stale `.dmg.blockmap`s, and rewrites `latest-mac.yml` + `checksums.json` from the post-staple bytes (functions `finalizeDmg:138`, `removeDmgBlockmaps:172`, `rewriteLatestMacYaml:187`, `rewriteChecksumsJson:221`; darwin-only guard at `:252`). Stapling mutates DMG bytes, so the manifests must be regenerated afterward or auto-update hash checks fail.

Artifact upload to a GitHub Release is a **separate** CI job (`build-and-release.yml:109-146`, `gh release`), not part of the build script. The `electron:publish` script (`package.json:61`) uses `electron-builder --publish=always` and is intentionally never used. Output naming, signing-cert setup, and the auto-updater are documented in [`docs/BUILD_AND_DEPLOYMENT.md`](../BUILD_AND_DEPLOYMENT.md); the full release procedure is [how-to: How to cut a macOS release](./howto-cut-a-release.md).

## Build-time generators

| Generator | Script                          | Wiring                                                                                                                                                              | Output                                                                                                                                                                                                                   |
| --------- | ------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Theme CSS | `scripts/generate-theme-css.ts` | `pnpm theme:generate` (`package.json:36`); pinned by `theme:check` (`:37`) in `validate` and `test.yml:71`                                                          | `src/lib/themes/generated.css` (derived/colored themes only; Warm Cathedral is hand-authored in `globals.css` and skipped). Build-time only — `culori` never ships to the client (`scripts/generate-theme-css.ts:1-18`). |
| Icons     | `scripts/generate-icons.js`     | `pnpm build:icons` (`package.json:24`), wired as `prebuild` (`:25`); CI runs it explicitly before electron tests/builds (`test.yml:63`, `build-and-release.yml:35`) | `build/icons/` — app icon (`sharp`), tray-icon states, favicons. See [`docs/ICON_SYSTEM_IMPLEMENTATION_SUMMARY.md`](../ICON_SYSTEM_IMPLEMENTATION_SUMMARY.md).                                                           |

## Safety & guard scripts

`scripts/assert-local-db.cjs` is a fail-**closed** gate that runs before every destructive Prisma command (`db:reset`/`db:truncate`/`prisma:migrate`, `package.json:50,51,43`). It proceeds only when the connection target is _provably_ local: it checks an allowlist of local hosts (`localhost`, `127.0.0.1`, `::1`, `postgres`, `corelive-postgres`, …; `:24-31`), validates both the WHATWG `.hostname` **and** the libpq `?host=`/`?hostname=` query params (which override the URL authority — a naive hostname check is fail-open; `:80-95`), and aborts on backslash URLs or an empty host (`:64-68`, `:101-103`). This is what prevents `pnpm db:reset` from wiping production Neon. The reasoning is captured in [explanation: Why the build & CI topology looks the way it does](./explanation-build-and-ci.md) (which covers the DB-gate rationale) and the script's own header comment (`scripts/assert-local-db.cjs:1-17`).

## See also

- [explanation: Why the build & CI topology looks the way it does](./explanation-build-and-ci.md)
- [how-to: How to cut a macOS release](./howto-cut-a-release.md)
- [how-to: How to run the local dev + test loop](./howto-local-dev-and-tests.md)
- [reference: Theme system reference](./reference-theme-system.md)
- [reference: Data model reference](./reference-data-model.md)
- [`docs/BUILD_AND_DEPLOYMENT.md`](../BUILD_AND_DEPLOYMENT.md) — signing, auto-updater, troubleshooting (version pins drifted)
- [`README.md`](../../README.md) — env-var tables, ports, getting started
