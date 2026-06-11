# CoreLive Developer Documentation

Developer-facing documentation for CoreLive, organized by the
[Diátaxis](https://diataxis.fr/) framework — four kinds of docs, each answering a
different need:

| Quadrant                        | Answers                           | When you reach for it              |
| ------------------------------- | --------------------------------- | ---------------------------------- |
| **[Tutorial](#tutorial)**       | "Get me started."                 | First day on the codebase.         |
| **[How-to](#how-to-guides)**    | "How do I do _X_?"                | You have a specific task.          |
| **[Reference](#reference)**     | "What exactly is _X_, and where?" | You need to look something up.     |
| **[Explanation](#explanation)** | "Why is it built this way?"       | You want to understand a decision. |

> **A note on the reference docs.** CoreLive is pre-launch and intentionally
> volatile — the schema, APIs, and IPC channels are reshaped freely and the
> database is reset rather than migrated (see [`README.md`](../../README.md) line
> 13). So the reference docs are **point-to-source**: they name a surface and
> anchor it to a `file:line`, then defer the exact field/type shapes to the source,
> which never goes stale. When a reference and the code disagree, the code wins.

---

## Tutorial

_Learning-oriented. One hand-held happy path._

- **[Getting Started](./tutorial-getting-started.md)** — from a fresh clone to a
  running dev server and your first completed task lighting the Activity Heatmap.

## How-to guides

_Task-oriented recipes. Assume you've done the tutorial._

- **[Run the local dev + test loop](./howto-local-dev-and-tests.md)** — the
  day-to-day inner loop: database up, dev server (web or Electron), the four test
  tiers, and the `pnpm validate` gate.
- **[Add a new oRPC procedure](./howto-add-orpc-procedure.md)** — a type-safe API
  endpoint end to end: Zod schema → procedure → router → client hook → real-DB test.
- **[Add a route or a persisted setting](./howto-add-route-or-setting.md)** — a new
  App Router route (sidebar group vs standalone Electron-window route), or a Redux
  slice that persists and syncs.
- **[Add an Electron IPC channel](./howto-add-ipc-channel.md)** — wire a new
  request/response channel (or a whole new window type) through the typed-IPC
  contract.
- **[Add a new colored theme family](./howto-add-theme-family.md)** — one registry
  edit, regenerate the CSS, and pass the WCAG-AA + heatmap-temperature gates.
- **[Add a cross-window sync channel](./howto-add-sync-channel.md)** — a
  BroadcastChannel so a mutation in one window reaches the others.
- **[Cut a macOS release](./howto-cut-a-release.md)** — ship a signed + notarized
  build by pushing a `v*` tag, then verify the GitHub Release.

## Reference

_Information-oriented, point-to-source. Look things up here._

- **[oRPC API](./reference-orpc-api.md)** — every procedure across the five
  namespaces, with router path, file anchor, and auth requirement.
- **[Data model](./reference-data-model.md)** — the 10 Prisma models, their
  relations, and the load-bearing data-integrity rules.
- **[Frontend](./reference-frontend.md)** — routes (and which Electron window loads
  each), the provider tree, the Redux store, feature components, and the
  lifecycle-effect hooks.
- **[Electron](./reference-electron.md)** — the five window types, the typed-IPC
  channels, the three preload bridges, and the native-macOS managers.
- **[Theme system](./reference-theme-system.md)** — the theme registry, the CSS
  generator, the public helpers, and the heatmap-intensity source of truth.
- **[Authentication](./reference-auth.md)** — every auth surface: route protection,
  the Clerk webhook, the oRPC middleware/header, and the Electron OAuth bridge.
- **[CI & commands](./reference-ci-and-commands.md)** — the `package.json` scripts,
  the GitHub Actions workflows, the `validate` gate, and the four test configs.

## Explanation

_Understanding-oriented. The "why" behind the design._

- **[Architecture](./explanation-architecture.md)** — one codebase, two runtimes
  (web + Electron WebView), one oRPC-over-HTTP data path. **Start here.**
- **[Why completions are archived, not deleted](./explanation-completion-and-heatmap.md)**
  — the heatmap invariant, and how a finished day stays lit forever. The single
  most load-bearing rule in the codebase.
- **[Client state & cross-window sync](./explanation-state-and-sync.md)** — Redux vs
  React Query, and why separate windows reconcile over BroadcastChannel.
- **[Electron architecture decisions](./explanation-electron-architecture.md)** — why
  Electron loads the live site, the startup auth gate, and the typed-IPC /
  version-skew safety.
- **[How authentication works](./explanation-authentication.md)** — one Clerk
  identity across two runtimes, the trust boundary, and the system-browser OAuth
  bridge.
- **[Skill Tree data integrity](./explanation-skill-tree.md)** — how earned XP
  survives deleting the task that earned it.
- **[Why themes are a build-time pipeline](./explanation-theme-system.md)** — why a
  TypeScript registry compiles to static CSS at build time, and the CI guards that
  keep the brand and the heatmap from silently drifting.
- **[Why the build & CI topology looks the way it does](./explanation-build-and-ci.md)**
  — single-worker Playwright, two notarizations, and the fail-closed DB guard.

---

## Related documentation

Deeper or product-level material that lives elsewhere in the repo:

- **[`../ELECTRON_ARCHITECTURE.md`](../ELECTRON_ARCHITECTURE.md)** — exhaustive
  Electron main-process internals (file responsibilities, startup sequences, IPC,
  security/CSP, lazy-loading; Japanese).
- **[`../BUILD_AND_DEPLOYMENT.md`](../BUILD_AND_DEPLOYMENT.md)** — build, code
  signing, notarization, and auto-updater setup + troubleshooting.
- **[`../DEEP_LINKING_IMPLEMENTATION_SUMMARY.md`](../DEEP_LINKING_IMPLEMENTATION_SUMMARY.md)**
  — the `corelive://` deep-link scheme and `DeepLinkManager`.
- **[`../ICON_SYSTEM_IMPLEMENTATION_SUMMARY.md`](../ICON_SYSTEM_IMPLEMENTATION_SUMMARY.md)**
  — the icon-generation pipeline and tray icon states.
- **[`../PRISMA_V7_MIGRATION.md`](../PRISMA_V7_MIGRATION.md)** — the Prisma v6 → v7
  migration notes.
- **[`../PRD.md`](../PRD.md)** — the product requirements document (Japanese).
- **[`../../DESIGN.md`](../../DESIGN.md)** — the design system: typography, color
  tokens, motion, microcopy voice, and the self-affirmation north star. **Read this
  before any UI change.**
- **[`../../README.md`](../../README.md)** — project setup, prerequisites, and the
  environment-variable reference.
