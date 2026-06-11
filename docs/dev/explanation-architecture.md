# Architecture: one codebase, two runtimes, one data path

CoreLive is **one product that ships in two runtimes** — a web browser and a native macOS Electron app — built from **one codebase** that reaches its data through **one path**. This document is the hub: it draws the whole-system map, walks the boot flow and the request path, explains the central architectural bet (no embedded server in Electron), and links onward to the subsystem deep-dives.

> Read this first, then follow the links at the end into the subsystem you care about. The siblings explain the _invariants_; this page explains how the pieces fit together.

---

## The one sentence to remember

> **Electron is not a second app. It is the web app, loaded in native windows.**

There is no embedded Next.js server in the desktop build, no separate desktop UI, and no separate desktop API. Each Electron window opens a real `corelive.app` URL in a `BrowserWindow`, and every data read/write — web or desktop — travels the identical `POST/GET /api/orpc/*` route. "Web vs Electron" is a runtime branch (`isElectronEnvironment()`), not a fork in the source tree.

Everything else in this document is a consequence of that decision.

---

## The system map

```
                       ┌──────────────────────────────────────────────┐
   Web browser tab ───▶│  Next.js 16 App Router (corelive.app)        │
                       │                                              │
 Electron BrowserWindows                                             │
   main      ─▶ /home  │  ┌────────────────────────────────────────┐ │
   braindump ─▶ /braindump │  Root layout + provider tree         │ │
   floating  ─▶ /floating-navigator │  (same shell for every URL)  │ │
   settings  ─▶ /settings │  └────────────────────────────────────┘ │
                       │                    │                         │
                       │                    ▼ client → oRPC over HTTP │
                       │     POST/GET /api/orpc/[...path]             │
                       │            │  authMiddleware (Clerk Bearer)  │
                       │            ▼  Prisma                         │
                       │         PostgreSQL                           │
                       └──────────────────────────────────────────────┘

  Electron main process (electron/main.ts) — native shell ONLY:
    windows, dock/menu/tray, deep links, auto-update, window-state.
    Carries NO data IPC. Auth-syncs to the renderer; data never flows here.
```

The Electron main process owns only what a web page _cannot_ own — the native macOS surfaces (windows, dock, menu bar, tray, deep links, auto-update). It deliberately carries **no data IPC**: a todo never travels over an Electron channel. See the diagram and rationale in [`docs/ELECTRON_ARCHITECTURE.md`](../ELECTRON_ARCHITECTURE.md) and the sibling [Electron architecture decisions](./explanation-electron-architecture.md).

---

## The stack, and why each piece is here

| Layer        | Choice                                                            | Why this one                                                                                                                                                                                                 |
| ------------ | ----------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| UI / routing | **Next.js 16 App Router**                                         | One React app that serves both the browser and every Electron window from the same routes; route groups let some screens be chromeless (for dedicated windows) without changing their URLs.                  |
| API          | **oRPC over HTTP**                                                | End-to-end type safety: the router type flows to the client, so a renamed field is a _compile_ error, not a runtime 500. HTTP transport means web and Electron use the exact same client.                    |
| Persistence  | **Prisma + PostgreSQL**                                           | Typed queries and a single migration story; the API layer scopes everything by an internal `User.id`.                                                                                                        |
| Auth         | **Clerk**                                                         | One identity provider for both runtimes; the Clerk `userId` _is_ the API bearer token, so the renderer authenticates the same way everywhere.                                                                |
| Client state | **Redux Toolkit** (device/prefs) + **React Query** (server cache) | A deliberate split — Redux owns the small, persisted, device-local state; React Query owns all server data and its cache. See [Client state ownership & cross-window sync](./explanation-state-and-sync.md). |

The throughline: **every choice is picked so the two runtimes converge instead of diverge.** A type that breaks breaks in both. A query that runs runs the same code in both.

---

## The boot flow: from a URL to a painted page

Every screen — a browser tab _and_ each Electron window — boots through the same sequence:

```
URL  →  src/app/layout.tsx (root layout)  →  provider tree  →  the page
```

The root layout (`src/app/layout.tsx:47`) loads three Google fonts as CSS variables, sets the `%s | CoreLive` metadata template, and assembles the provider tree. Read it directly — `src/app/layout.tsx:49-74` is the single most load-bearing file for understanding boot order. As verified there, the nesting is:

```
ClerkProvider                          (auth context — everyone needs it)
└─ <html> / <body>
   └─ ThemeProvider                    (sets data-theme before paint)
      ├─ CodeInspectorClient           (dev tooling)
      └─ QueryClientProvider           (React Query cache + persistence)
         └─ ReduxProvider              (device/preferences store)
            ├─ ElectronStartupSync     (renderer → main IPC, no-op on web)
            ├─ ElectronAuthProvider    (Clerk ↔ Electron, pass-through on web)
            │  └─ {children}           (the page)
            └─ Toaster
```

**The order is load-bearing, not cosmetic:**

- **Clerk is outermost** because auth context is needed by everything below it — including the React Query sign-out guard that resets the cache when the user changes.
- **Theme wraps before paint** so `data-theme` is set on the document before content renders (no flash). The root `<html>` uses `suppressHydrationWarning` and the layout deliberately does _not_ re-pass `attribute`/`disableTransitionOnChange` — `ThemeProvider` owns those (`src/app/layout.tsx:60-62`).
- **React Query sits above Redux** because the Electron auth provider (inside the Redux subtree) drives the Clerk session and the cache reset.
- **`ElectronStartupSync` sits _inside_ `ReduxProvider`** because it reads persisted Redux settings and pushes them to the Electron main process on startup.

For why the providers split state the way they do, and how that state crosses windows, see [Client state ownership & cross-window sync](./explanation-state-and-sync.md). For the theme layer specifically, see [Why themes are a build-time pipeline](./explanation-theme-system.md).

### Routes, and the standalone-window trick

Most screens live under the `(main)` route group, which adds a sidebar without adding a URL segment. But three routes live _outside_ that group on purpose, so they render chromeless (no sidebar) as the bodies of dedicated Electron windows:

| Route                 | Loaded by                          | Notes                                                                      |
| --------------------- | ---------------------------------- | -------------------------------------------------------------------------- |
| `/home`               | web + Electron **main** window     | Primary screen; inside `(main)`, so it has the sidebar.                    |
| `/braindump`          | Electron **braindump** window      | Chromeless; standalone.                                                    |
| `/floating-navigator` | Electron **floating** window       | Chromeless, always-on-top.                                                 |
| `/settings`           | web + Electron **settings** window | One settings home for both runtimes; self-gates its Electron-only section. |

The link between a route and the native window that loads it lives in `electron/WindowManager.ts` — the main window loads `${serverUrl}/home` (`electron/WindowManager.ts:391-396`), and the panel/settings URLs are built at `electron/WindowManager.ts:931-936` and `electron/WindowManager.ts:1303-1307`. See [Frontend reference](./reference-frontend.md) for the full route/provider map and [How to add a route or a persisted client setting](./howto-add-route-or-setting.md) to add one.

---

## The data path: identical for web and Electron

Once a page is painted, _all_ data flows through one path:

```
client (React Query + oRPC)
   │   POST/GET /api/orpc/<namespace>.<procedure>
   ▼
src/app/api/orpc/[...path]/route.ts   (the single catch-all HTTP entrypoint)
   ▼
authMiddleware                        (Clerk Bearer → Prisma User → context.user)
   ▼
the oRPC procedure (Zod-validated)
   ▼
Prisma → PostgreSQL
```

A few anchors make this concrete:

- **The router** is a plain nested object literal grouping procedures into five namespaces (`category`, `todo`, `completed`, `electronSettings`, `skillTree`); `export type AppRouter = typeof router` at `src/server/router.ts:75` is the type the client is generated from.
- **The HTTP entrypoint** is one file: `new RPCHandler(router)` mounted at `prefix: '/api/orpc'`, exported as `GET`/`POST`/`PUT`/`PATCH`/`DELETE` (`src/app/api/orpc/[...path]/route.ts:7,39-43`). It passes `{ headers: request.headers }` as context — matching what the middleware expects.
- **Auth runs in middleware, for every procedure.** `authMiddleware` (`src/server/middleware/auth.ts:10`) reads the `authorization` header, strips `Bearer `, treats the remainder as the Clerk `userId`, and `upsert`s the `User` row — so a first call auto-provisions the user even before Clerk's webhook syncs them. There are **no** unauthenticated procedures.

### Why the path is _literally_ the same code

The proof is in the client transport. `createLink()` builds the oRPC `RPCLink` with:

```ts
// src/lib/orpc/create-client.ts:18-22
url: () => `${window.location.origin}/api/orpc`
```

In a browser, `window.location.origin` is `https://corelive.app`. In an Electron window — which _also_ loaded a `corelive.app` URL — `window.location.origin` is **the same value**. So the same client code resolves to the same endpoint. The bearer header is resolved the same way too: `window.Clerk.session?.user?.id ?? window.Clerk.user?.id` → `Authorization: Bearer <id>` (`src/lib/orpc/create-client.ts:37,58-59`). Web and Electron run the _identical_ transport; there is no Electron-specific data branch to keep in sync.

Components never touch the link directly. They consume the `orpc` object (`src/lib/orpc/client-query.ts:21`), which wraps the client with `@orpc/tanstack-query` to expose `orpc.<ns>.<proc>.queryOptions()` / `.mutationOptions()` / `.key()`. Read-vs-write (query vs mutation) is a **client convention** — oRPC does not tag a procedure server-side; the consumer picks the right wrapper.

For the procedure index and the cross-cutting rules (all-authenticated, idempotent imports, the 60s undo window), see the [oRPC API reference](./reference-orpc-api.md). To add a procedure end to end, see [How to add a new oRPC procedure](./howto-add-orpc-procedure.md).

### Why no embedded server in Electron

The desktop build could have bundled a Next.js server and run the UI locally. It deliberately does **not**. The dev/prod URL split is one line:

```ts
// electron/main.ts:915-917
const serverUrl =
  process.env.ELECTRON_RENDERER_URL ??
  (isDev ? 'http://localhost:3011' : 'https://corelive.app')
```

The payoff of loading the remote site instead:

- **One data path, by construction.** With no second server, there is no second API to drift, no embedded-server surface to maintain or ship. The desktop app _is_ the web app's renderer.
- **Instant parity.** A web deploy updates the desktop app's content on next launch — no separate desktop release needed for a UI or API change. (The native shell still ships on its own cadence; see [How to cut a macOS release](./howto-cut-a-release.md).)
- **The main process stays thin.** It becomes a native shell with no data responsibilities — easier to reason about and to test.

One subtlety worth flagging, because it has bitten releases before: `isDev` is written as the _positive_ check `process.env.NODE_ENV === 'development'` (`electron/main.ts:173`), never `!== 'production'`. A packaged build runs with `NODE_ENV` **unset**, so `=== 'development'` correctly resolves to `false` and loads the remote URL; a negated check would have read unset-as-dev and loaded `localhost` in a shipped app. That trap, the auth-aware startup sequence, and the window-ownership split are explained in [Electron architecture decisions](./explanation-electron-architecture.md).

---

## Identity: one user, two runtimes, one row

Because both runtimes hit the same API with the same bearer scheme, they also resolve to the same database user. The Clerk `userId` string is the bearer token; the middleware maps it to a `User` row via `User.clerkId` and injects the full Prisma `User` as `context.user`. Handlers scope every query by the internal `User.id` — the Clerk string is never used past the middleware.

This is why a task completed in the browser lights up the same heatmap in the desktop app: same identity, same row, same data. The full identity story (token resolution, upsert provisioning, route protection in `src/proxy.ts`) is in [How authentication works](./explanation-authentication.md) and the [Authentication surface reference](./reference-auth.md).

---

## The pre-launch volatility stance (read this before you "preserve" anything)

CoreLive has no users yet, and the repo says so loudly: the root `README.md:13` declares that breaking changes are fine _anywhere_ — reshape the database, the Prisma schema, or the APIs freely, with **no migrations to keep and no backward compatibility to maintain**. When the schema changes, you just reset: `pnpm db:reset`.

What this means for you as a contributor, and why this documentation is written the way it is:

- **Reference docs point at source, they don't transcribe it.** A field-by-field API or schema reference would rot on the next `db:reset` and then _mislead_. The reference docs name the surface and anchor to `file:line`, deferring exact shapes to the Zod schemas and Prisma model. Trust the source over any prose here.
- **The durable knowledge is the _why_.** Field names churn; the reasons behind an invariant (why completions are archived instead of deleted, why auth is a bearer-token upsert, why the startup panel hides until login) survive. That is what the `explanation-*` docs capture, and what you should read before changing a subsystem — so you don't "fix" a deliberate decision back into a bug.
- **Don't reach for migrations or compatibility shims.** If a change is cleaner with a schema reshape, do the reshape and reset. The toolchain has guardrails — destructive DB commands are gated to local databases — so a reset can't touch production.

For how the build, test, and release topology supports this stance, see [Why the build & CI topology looks the way it does](./explanation-build-and-ci.md) and the [CI workflows & command index](./reference-ci-and-commands.md).

---

## Where to go next

This page is the map. The reasoning lives in the siblings:

- **[Why completions are archived, not deleted](./explanation-completion-and-heatmap.md)** — the heatmap invariant: the deepest, least-obvious data rule in the system, and the one a future edit is most likely to break.
- **[Client state ownership & cross-window sync](./explanation-state-and-sync.md)** — Redux (device/prefs) vs React Query (server), and how state crosses windows (BroadcastChannel between renderers, IPC to the main process).
- **[Electron architecture decisions](./explanation-electron-architecture.md)** — the native shell, the auth-aware startup nav-watch, window-vs-state ownership, and the `NODE_ENV`-unset trap.
- **[How authentication works](./explanation-authentication.md)** — one identity, two runtimes, one user row.
- **[Why themes are a build-time pipeline](./explanation-theme-system.md)** — the registry → generator → static CSS path.

And for tasks: start at the docs hub index, [`./README.md`](./README.md), which links the tutorials, how-tos, and references.
