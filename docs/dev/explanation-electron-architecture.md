# Electron architecture decisions

Why CoreLive's desktop build is a thin native shell around the _live_ web app rather than a bundled server, and why a handful of non-obvious invariants (URL routing, the auth-aware startup, window-state ownership, the typed-IPC contract, preload version skew) are written the way they are. This is a decisions doc — it explains the reasoning and the threat model each choice defends; for the deep internals see the (Japanese) [`docs/ELECTRON_ARCHITECTURE.md`](../ELECTRON_ARCHITECTURE.md), and for the file-by-file surface see [`reference-electron.md`](./reference-electron.md).

> **Audience**: contributors touching `electron/`. If you only ever change web UI, you can ignore this doc — the desktop build runs the same renderer you already work on.

---

## 1. The desktop app loads the remote site — there is no bundled Next.js

The single most load-bearing decision: **the Electron renderer loads `https://corelive.app` directly.** There is no embedded Next.js server in the packaged app, no copied-in `.next` build, no localhost server spun up by the main process in production. If you go looking for "where's the bundled web app inside the `.app`?", the answer is: there isn't one.

The renderer URL is resolved once, at boot, in `electron/main.ts:915-917`:

```ts
const serverUrl =
  process.env.ELECTRON_RENDERER_URL ??
  (isDev ? 'http://localhost:4991' : 'https://corelive.app')
```

Every window then loads a route off that origin — `${serverUrl}/home`, `/floating-navigator`, `/braindump`, `/settings`.

### Why one origin instead of an embedded server

The payoff is **one data path**. The web app and the desktop app run the _same_ renderer bundle and talk to the _same_ backend over plain HTTP oRPC. The main process carries **no data IPC** — it owns only the things a browser tab cannot do for itself (native window chrome, the menu bar, the tray, the dock, deep links, auto-update). There is no second copy of the data layer to keep in sync, no "desktop is a version behind" drift, and no embedded-server attack surface to ship and notarize. A bug fixed on the website is fixed in the desktop app the next time it loads, with no release.

This is the reasoning behind the project's "one codebase, two runtimes, one data path" framing — see [`explanation-architecture.md`](./explanation-architecture.md) for the web side of the same coin.

### The three URLs: dev, prod, and the E2E seam

| Context            | `serverUrl` resolves to                    | Driven by                                    |
| ------------------ | ------------------------------------------ | -------------------------------------------- |
| `pnpm dev` (local) | `http://localhost:4991`                    | `isDev` (`NODE_ENV === 'development'`)       |
| Packaged / shipped | `https://corelive.app`                     | the `??` fallback (`isDev` is false)         |
| Electron E2E       | a local `http://localhost`/`127.0.0.1` URL | `ELECTRON_RENDERER_URL` (highest precedence) |

`ELECTRON_RENDERER_URL` is the **E2E seam**: it lets the Playwright Electron suite point the renderer at a controlled local server _without_ flipping `isDev`, so the test runs with production CSP and the production optimization level — a high-fidelity test rather than a dev-mode one. Because that env var overrides the origin entirely, it is validated up front (`electron/main.ts:142-163`): the value must parse as a `URL`, use the `http:` protocol, and have hostname exactly `localhost` or `127.0.0.1`. The parse-and-compare (rather than a `startsWith` check) is deliberate — it stops subdomain tricks like `http://localhost.attacker.com` from pointing the shipped shell at an arbitrary origin via the environment.

### The `NODE_ENV`-unset trap: gate on `=== 'development'`, never `!== 'production'`

`isDev` is defined as a **positive** equality check (`electron/main.ts:173`):

```ts
const isDev = process.env.NODE_ENV === 'development'
```

This is a correctness property, not a style choice. **A packaged, electron-builder-produced app runs with `NODE_ENV` unset.** Trace the two possible spellings against an unset value:

- `NODE_ENV === 'development'` → `undefined === 'development'` → `false` → loads `https://corelive.app`. **Correct.**
- `NODE_ENV !== 'production'` → `undefined !== 'production'` → `true` → would treat the shipped app as dev and load `http://localhost:4991`, which isn't running. **A blank, broken app.**

So any code in `electron/` whose behavior must differ between dev and a shipped build gates on the explicit `'development'` value — the same reasoning governs the auto-updater's dev-skip (`electron/AutoUpdater.ts:163-165`, `if (process.env.NODE_ENV === 'development') return`). The companion failure mode (a `!== 'production'` check that crashed a packaged build via a dev-only logger path) is recorded in the project's local memory under `packaged-electron-node-env-unset`; that note's `app.isPackaged` advice is about the _logger_ — in this subsystem the gate is `NODE_ENV`, and there is intentionally no `app.isPackaged` check in the window/URL path.

**If you violate this:** it will pass every test you run locally with `pnpm electron:dev` (where `NODE_ENV` _is_ set), and only break once it's packaged. Reproduce packaged-only behavior with `pnpm electron:build:dir` and `open dist/mac/CoreLive.app`, never `electron:dev`.

---

## 2. The auth-aware startup: why you never see an empty panel

CoreLive can boot straight into an auxiliary panel — the always-on-top floating navigator or the braindump quick-capture window — without ever showing the main window, if the user configured it that way. That creates a problem the web app never has: a tiny floating panel is a terrible place to land a signed-out user, because Clerk's `proxy.ts` will redirect them to `/login` and they'd be staring at a login form crammed into a 300px floating chrome with no obvious way out.

The startup sequence solves this with a **navigation watcher** rather than an auth check:

1. **Create the panel hidden.** A panel-only launch creates its window but does not show it on `ready-to-show`.
2. **Watch where it lands.** `watchStartupPanelLoad` (`electron/WindowManager.ts:1005-1078`) subscribes to `did-navigate` / `did-finish-load` / `did-fail-load` and makes a single show-or-suppress decision (guarded by a `decided` flag so the two events can't both fire).
3. **Divert to main if it's an auth page.** If the final URL is one of `AUTH_PATHNAMES` (`/login`, `/sign-up` — `electron/constants.ts:28-31`), `proxy.ts` redirected an unauthenticated user. The watcher keeps the panel hidden and calls `restoreFromTray()` to surface the full main window instead, where login fits.
4. **Re-show after sign-in.** `armPostLoginReshow` (`electron/WindowManager.ts:1092-1112`) arms a one-shot listener on the main window; once it navigates _away_ from the auth pages (the user signed in), it reloads the original panel route and reveals the panel the user asked for.

If the panel lands on a real (non-auth) route, it's authenticated — the panel just shows.

### Why `ERR_ABORTED` is explicitly ignored

During the normal `/floating-navigator` → `/login` redirect chain, Chromium fires `did-fail-load` with `net::ERR_ABORTED` (`-3`, `electron/constants.ts:40`) because the first navigation was _intentionally cancelled_ by the redirect. If the watcher treated that as a load failure it would misfire its fallback on every signed-out boot. So `watchStartupPanelLoad` ignores both `ERR_ABORTED` and any non-main-frame (subresource) failure (`WindowManager.ts:1066`) — those are not "the boot failed," they're "a redirect happened."

### The cold-boot pill, and why it's an inlined `data:` URL

A panel-only boot has no main window painting to reassure the user during a slow start. `armStartupPill` (`electron/WindowManager.ts:1125`) handles that with a tiny click-through always-on-top "Opening CoreLive…" pill, governed by two timers in `constants.ts`:

- It appears only _after_ `STARTUP_PILL_GAP_MS` (400ms, `constants.ts:52`) — a fast boot dismisses it before that, so it never flashes.
- If the boot is still wedged at `STARTUP_PILL_TIMEOUT_MS` (8000ms, `constants.ts:59`) — offline, a 5xx, a hung load — it dismisses and surfaces the main window as a backstop, so the app is never stuck behind an invisible failed panel.

The pill's markup is built by `buildStartupPillHtml` (`electron/startup-pill-html.ts`) and loaded as a **self-contained `data:` URL**, not a renderer route or a bundled HTML file. Two constraints force this: the pill must paint _before_ any web content loads (so it cannot depend on `corelive.app`), and electron-builder excludes the `electron/` TS sources from the packaged app, so a file path would be missing at runtime. A `data:` URL ships the markup inline and sidesteps the renderer CSP. (Its visual tokens — serif, oklch, breathing dot — are inlined from `DESIGN.md`.)

**If you violate this:** a future contributor "simplifying" the pill into a `/startup-pill` route or an external HTML file will produce a pill that works in `electron:dev` and silently 404s / blank-renders in the packaged app — another packaged-only bug.

---

## 3. Window-state vs config vs runtime visibility: three layers, one rule

Three managers persist or control window behavior, and the boundaries between them are deliberate. Getting them confused is the most likely way to "fix" a non-bug into a real one.

| Layer                | Owns                                                              | Persists to              | Anchor                           |
| -------------------- | ----------------------------------------------------------------- | ------------------------ | -------------------------------- |
| `WindowStateManager` | **bounds, snap, maximize/fullscreen** — geometry only             | `window-state.json`      | `electron/WindowStateManager.ts` |
| `ConfigManager`      | **startup config** (which windows open) + the ≥1-window invariant | `config.json`            | `electron/ConfigManager.ts`      |
| `WindowManager`      | **runtime visibility** — every `show`/`hide`/`toggle`             | (none — it's live state) | `electron/WindowManager.ts`      |

**The rule: `WindowManager` is the _only_ owner of visibility.** `WindowStateManager.applyWindowState` restores maximize/fullscreen (main) and always-on-top (floating) but **deliberately does not restore visibility** (`WindowStateManager.ts:761-763`):

```ts
// Visibility is owned by WindowManager's explicit show paths. Restoring
// it here would let stale window-state.json bypass startup config and the
// signed-out auth gate for auxiliary panels.
```

(Window bounds are applied at construction via `getWindowOptions`, and snap via `snapWindowToEdge` — neither runs in `applyWindowState`.)

### Why the split exists

If two layers both toggled show/hide, they'd race — producing flicker, or a window that reappears against the user's startup choice. Worse, restoring visibility from persisted state would let a stale `window-state.json` _bypass the auth gate from §2_: a panel persisted as `isVisible: true` would pop open before the nav-watch could decide it should be suppressed for a signed-out user.

The floating navigator makes this concrete. Its startup visibility has a **single source of truth** — `behavior.startup.showFloating` — and `validateWindowStates` re-pins `floating.isVisible` back to that configured default on _every_ state load (`WindowStateManager.ts:299-305`). So if a user turns the floating window off in settings, a stale `isVisible: true` left in `window-state.json` can't resurrect it. The persisted _geometry_ (width/height) is still honored — the pin is narrow, touching only visibility.

### Why the ≥1-window invariant lives in `ConfigManager`, not the IPC handler

A startup config where `showMain`, `showBraindump`, and `showFloating` are _all_ false would launch a windowless app the user cannot interact with or recover — a soft-brick. `ensureAtLeastOneStartupWindow` (`electron/ConfigManager.ts:597-635`) prevents that by forcing `showMain = true` whenever a write would leave all three false.

It lives on the **persistence layer**, called from `set`/`update` _and_ `importConfig` — so **every** write path is protected: the `settings:setStartupConfig` IPC handler, a config import, a future migration. Putting the guard in the IPC handler instead would leave import and migration paths able to persist an all-false config. The check also hardens against malformed input: it uses `isPlainObject` guards (because `typeof [] === 'object'`, a bare `typeof` would let `behavior: []` through) and strict `=== true` boolean coercion (because `Boolean("false") === true` — a hand-edited string `"false"` would otherwise wrongly arm a window). See `ConfigManager.ts:605-633`.

**If you violate this:** moving the invariant "up" into a handler, or relaxing the coercion, re-opens the windowless-launch failure for the paths you didn't cover. The behavior is pinned by `ConfigManager.startup.test.ts` and `WindowStateManager.startup.test.ts` — if you change it, those tests should fail loudly.

> Note: `WindowStateManager` and `WindowManager` also re-home a window whose persisted bounds fell entirely off all connected monitors (multi-monitor recovery). For the dock-icon hide/show (`app.setActivationPolicy`), the secure-by-default DevTools/CDP gate, and the critical-vs-deferred boot split, see [`reference-electron.md`](./reference-electron.md).

---

## 4. The typed-IPC contract: why an unvalidated channel is impossible

The renderer is _remote web content_. The main process has filesystem, native-OS, and (indirectly) DB reach via the same web app. So every byte the renderer sends over IPC is **untrusted input** — exactly the case Electron's official security checklist item #17 ("validate the sender and arguments of all IPC messages") exists for. CoreLive enforces that with **three surfaces that the TypeScript compiler keeps in sync**, so that "I added a channel but forgot to validate it" is a _compile error_, not a runtime hole.

| Surface                           | What it is                                                                                              | File                          |
| --------------------------------- | ------------------------------------------------------------------------------------------------------- | ----------------------------- |
| **1. Compile-time contract**      | `IPCChannels` (request/response per invoke channel) + `IPCEventChannels` (one-way main→renderer events) | `electron/types/ipc.ts`       |
| **2. Exhaustive runtime schemas** | `IPC_ARG_SCHEMAS: Record<IPCChannel, z.ZodTypeAny>` — one Zod schema per channel                        | `electron/ipc/ipc-schemas.ts` |
| **3. Typed wrappers**             | `typedHandle` / `typedInvoke` / `typedSend` read those types                                            | `electron/ipc/`               |

### Why exhaustiveness is the trick

The schema map is typed `Record<IPCChannel, z.ZodTypeAny>`. Because `IPCChannel` is the union of _every_ channel name in the contract, the `Record` is **total** — if you add a channel to `types/ipc.ts` and don't add its schema to `ipc-schemas.ts`, the file fails to compile (`ipc-schemas.ts:21-23` spells this out). There is no path to "shipped a channel with no schema."

`typedHandle` (`electron/ipc/typedHandle.ts:47-71`) is the single runtime chokepoint: before any handler runs, it looks up the channel's schema and calls `schema.parse(rawArgs)`. A payload that fails validation never reaches the handler — instead `typedHandle` throws `IPC validation failed on '<channel>': <detail>` (`typedHandle.ts:60`). `ipc-contract.test.ts` is the de-facto spec for all this: it asserts the schema map is exhaustive (`Object.keys(IPC_ARG_SCHEMAS)` covers every channel) and that representative channels reject bad input.

> **Docstring caveat — registration is centralized, not per-manager.** Several docstrings (e.g. `typedHandle.ts:17`) say handlers are registered by "each domain's `registerIpcHandlers()`." That is **stale**: _every_ `typedHandle` registration actually lives in one place — `main.ts setupIPCHandlers()` (`electron/main.ts:1099`, idempotent via the `ipcHandlersInitialized` guard at `:1103-1106`). The managers are pure logic classes the handlers _call_; they don't register their own IPC. If you're adding a channel, add the handler there — see [`howto-add-ipc-channel.md`](./howto-add-ipc-channel.md).

### Least-privilege preloads

There are **three** preload scripts, each exposing exactly one isolated API object via `contextBridge` — the renderer never sees `ipcRenderer` or Node:

- `electron/preload.ts` → `window.electronAPI` (the full ~18-namespace surface, `:232`)
- `electron/preload-floating.ts` → `window.floatingNavigatorAPI` (narrow: window controls + `brainDump.toggle` + menu-action events, `:126`)
- `electron/preload-braindump.ts` → `window.brainDumpAPI` (note/sync/category get-set; its inbound whitelist is the single channel `braindump-category-changed`, `:121`)

Each window kind gets only the channels it needs. Inbound events are double-guarded at the bridge: a hard-coded channel allow-list (`validateChannel` / `ALLOWED_CHANNELS`, `preload.ts:122,162-163`) and a `sanitizeData` pass that strips prototype-pollution keys (`['__proto__', 'constructor', 'prototype']`, `preload.ts:172-201`) and trims strings before the payload reaches renderer code.

The one-way event emitter `typedSend` (`electron/ipc/typedSend.ts:38`) no-ops when `sender.isDestroyed()` — emitting to a window that closed mid-flight is a safe lost event, not a main-process crash.

**Standing caveats (don't be misled by dead/vestigial code):** `createTypedListener` (`electron/ipc/typedListener.ts`) has **zero call sites** — the live inbound pattern is the guarded raw `ipcRenderer.on` above, not this factory. `IPCErrorHandler` is constructed and cleaned up but its retry/wrap methods are never invoked, so there is **no automatic IPC retry** in effect. `electron/auth-manager.ts` is **dead code** (raw `ipcMain.handle('auth-*')`, never imported; it would double-register and throw if it loaded — proof it doesn't). Treat `preload.ts` as the single source of truth for what is actually exposed.

---

## 5. Preload version skew: feature-detect at _method_ granularity

This hazard follows directly from §1. The installed `.app` ships a **frozen preload** — the `electronAPI` bridge is baked in at build time. But the renderer loads the **always-current remote web bundle**. So a freshly-deployed web build can call a preload method that an _older installed app_ never exposed. The namespace might be there; the method might not.

The rule for renderer code: **feature-detect at method granularity, never just the namespace.** The canonical guard is in `ElectronStartupSync.tsx` (`src/components/electron/ElectronStartupSync.tsx:105-106`):

```ts
const settings = window.electronAPI?.settings
if (typeof settings?.setHideAppIcon !== 'function') return
```

Checking `window.electronAPI?.settings` alone is not enough — an older preload could expose `settings` with a different method set. The same `typeof ...?.method !== 'function'` pattern guards the other Electron-aware components (`BrainDumpSettings.tsx:240-242`, `StartupWindowSettings.tsx:187`, `FloatingWindowSettings.tsx:145`). The two hand-written global `Window.electronAPI` type augmentations encode this by marking namespaces **optional** (`?`), forcing callers to narrow.

> **The `.d.ts` files have drifted — trust the preload, not the types.** Two augmentations exist and disagree with each other _and_ with runtime: `electron/types/electron-api.d.ts:355` declares a `performance` namespace that `preload.ts` does **not** expose, while `src/types/electron.d.ts` has zero mention of `performance`. The optionality is load-bearing (it enforces method-granular guards); the specific declared members are not authoritative. `preload.ts` is the only source of truth for what's actually bridged.

**If you violate this:** a renderer that assumes a method exists because the namespace does will throw on older installed apps right after you deploy a web build that uses a new method. `src/app/error.tsx` is the route-level net that catches a missed guard, but it's a backstop, not a substitute. This is recorded in local memory under `electron-preload-version-skew`.

---

## 6. The native-macOS coverage gap: green CI is not green Cocoa

A standing caveat that prevents a false sense of safety. The automated suites — Playwright and the `mcp__electron__*` tools — **drive the renderer (web content) only**. They exercise the same DOM as the web app. The CI Electron E2E runs on Linux under `xvfb`, which is _also_ renderer coverage.

What that leaves with **no automated coverage at all**: the menu bar (`MenuManager`), the system tray (`SystemTrayManager`), the dock + `app.setActivationPolicy` hide/show, `open-url` deep links (`DeepLinkManager`), the traffic-light window controls, window vibrancy, and the multi-window flows (main ↔ floating ↔ braindump, the startup pill). These are native Cocoa surfaces that live _outside_ the web content, so DOM-driving tools cannot reach them, and `xvfb` does not cover Cocoa-specific paths.

The only coverage for those surfaces is a **manual macOS smoke** before any tag push or release — and after touching any main-process or native-integration code. Drive the real desktop with the `mcp__computer-use__*` MCP (which screenshots and clicks the actual screen, so it _can_ reach the menu bar / tray / dock / traffic lights) against a real packaged build:

```bash
pnpm electron:build:dir && open dist/mac/CoreLive.app
```

Verify motion (window/menu transitions) by recording video and inspecting frames, not by stills — screenshots can't reveal jank or flashes. The full procedure lives in the project's local `CLAUDE.md` ("Electron Native QA"); the takeaway here is the _reasoning_: a passing CI run tells you the renderer works, and tells you **nothing** about whether the native chrome works.

---

## See also

- [`docs/ELECTRON_ARCHITECTURE.md`](../ELECTRON_ARCHITECTURE.md) — the deep, file-by-file internals (Japanese).
- [`reference-electron.md`](./reference-electron.md) — the windows / IPC / preload / managers surface, point-to-source.
- [`howto-add-ipc-channel.md`](./howto-add-ipc-channel.md) — the repeatable ritual for adding a channel or a window type.
- [`explanation-architecture.md`](./explanation-architecture.md) — one codebase, two runtimes, one data path (the web side of §1).
- [`README.md`](./README.md) — the dev-docs hub index.
