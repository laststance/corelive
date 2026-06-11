# Electron reference: windows, IPC, preload, managers

Information-oriented map of CoreLive's Electron main process: the five window types, the typed-IPC contract, the three preload bridges, and the native-macOS managers. This is **point-to-source** — it names each surface and anchors it to `file:line`, then defers exact channel/field/option shapes to the source, because this subsystem is pre-launch and reshapes its API freely (`README.md:13`). For the _why_ behind these choices read [Electron architecture decisions](./explanation-electron-architecture.md); for the runtime/data-path picture read [Architecture](./explanation-architecture.md) and `docs/ELECTRON_ARCHITECTURE.md`.

All paths are relative to the repo root. `electron/` holds the main-process TypeScript; it is compiled by electron-vite and is **not** part of the renderer bundle.

---

## Cross-cutting invariants (read first)

These rules apply to the whole surface. Violating one is almost always the bug.

| Invariant                                                              | Where enforced                                                                                      | Note                                                                                                                                                                                                                                                                  |
| ---------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Electron loads the **remote** web app, not a bundled server            | `serverUrl` resolution `electron/main.ts:915`                                                       | dev → `http://localhost:4991`; packaged → `https://corelive.app`; E2E override via `ELECTRON_RENDERER_URL`. Data flows over oRPC HTTP exactly like web — the main process carries **no data IPC**.                                                                    |
| Dev detected by `NODE_ENV === 'development'`, never `!== 'production'` | `electron/main.ts:173`, `electron/WindowManager.ts:148`, `electron/AutoUpdater.ts:163`              | Packaged builds run with `NODE_ENV` **unset**; the positive equality reads unset as not-dev (correct). There is **no `app.isPackaged` check** in the window/IPC subsystem. See `MEMORY.md` `packaged-electron-node-env-unset`.                                        |
| Runtime IPC validation happens in exactly one place                    | `typedHandle` parse+throw `electron/ipc/typedHandle.ts:60`                                          | Every inbound invoke payload is `IPC_ARG_SCHEMAS[channel].parse`d before the handler runs; a bad payload throws `IPC validation failed on '<channel>': <detail>`.                                                                                                     |
| The IPC contract is total by construction                              | `electron/ipc/ipc-schemas.ts` (`Record<IPCChannel, z.ZodTypeAny>`)                                  | Omitting a channel's Zod schema is a **compile** error. `electron/__tests__/ipc-contract.test.ts` guards alignment of the three surfaces.                                                                                                                             |
| Visibility is owned by `WindowManager`, never `WindowStateManager`     | `applyWindowState` bounds-only `electron/WindowStateManager.ts:735`                                 | The state layer persists bounds/snap; it deliberately does **not** restore visibility.                                                                                                                                                                                |
| At least one startup window always opens                               | `ensureAtLeastOneStartupWindow` `electron/ConfigManager.ts:597`, forces `showMain = true` at `:633` | Runs on every `set`/`update`/`import`; an all-false startup config is impossible.                                                                                                                                                                                     |
| Renderer must feature-detect preload methods at **method** granularity | consumer `src/components/electron/ElectronStartupSync.tsx`                                          | An installed app ships a frozen preload while the renderer loads the always-current web bundle. Guard `typeof api?.ns?.method === 'function'`, never just the namespace. See `MEMORY.md` `electron-preload-version-skew`; `src/app/error.tsx` is the route-level net. |

> **Native surfaces have no automated coverage.** Menu bar, tray, dock / `setActivationPolicy`, `open-url` deep links, traffic-light controls, and vibrancy are invisible to Playwright and `mcp__electron__*` (those drive the renderer only). Linux + xvfb CI is renderer-only. These must be smoke-tested manually on macOS with `mcp__computer-use__*` — see the project's local `CLAUDE.md` "Electron Native QA" section.

---

## Window types

Five `BrowserWindow` kinds. Each is created by a `WindowManager` factory and manages its own show/hide/toggle. Constructor options (titleBarStyle, vibrancy, transparency, frame) live in the factory bodies — read them at the anchors rather than trusting a transcription.

| Window                 | URL loaded            | Factory (`electron/WindowManager.ts`)         | Notable traits                                                                                                                                                                                                                  |
| ---------------------- | --------------------- | --------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Main**               | `${serverUrl}/home`   | `createMainWindow(showOnReady = true)` `:343` | `titleBarStyle: 'hiddenInset'`, preload `preload.cjs`; panel-only boots pass `false` to create it hidden.                                                                                                                       |
| **Floating navigator** | `/floating-navigator` | `createFloatingNavigator()` `:457`            | Always-on-top, `skipTaskbar`, traffic lights moved off-screen; frame/resizable from config.                                                                                                                                     |
| **Brain Dump**         | `/braindump`          | `createBrainDumpWindow()` `:591`              | Frameless + transparent, vibrancy `under-window`, opacity clamped `[0.30, 1.00]`.                                                                                                                                               |
| **Settings popover**   | `/settings`           | `createSettingsWindow()` `:1249`              | Frameless, vibrancy `popover`, tray-anchored, auto-hides on blur.                                                                                                                                                               |
| **Startup pill**       | inline `data:` URL    | rendered by `armStartupPill()` `:1125`        | Transparent click-through cold-boot indicator; HTML from `buildStartupPillHtml()` (`electron/startup-pill-html.ts`), loaded inline because electron-builder excludes `electron/` sources and there is no renderer build for it. |

### Window lifecycle helpers (`electron/WindowManager.ts`)

| Concern                         | Symbol(s)                                                                         | Anchor            |
| ------------------------------- | --------------------------------------------------------------------------------- | ----------------- |
| Panel-only launch entry         | `openStartupPanel(kind)`                                                          | `:970`            |
| Auth-aware nav-watch            | `watchStartupPanelLoad(panel, kind)` (private)                                    | `:1005`           |
| Post-login re-show              | `armPostLoginReshow(panel, kind)` (private)                                       | `:1092`           |
| Cold-boot pill arm / identity   | `armStartupPill()` / `isStartupPill(window)`                                      | `:1125` / `:1236` |
| Tray restore / minimize         | `restoreFromTray()` / `minimizeToTray()`                                          | `:847`            |
| Brain Dump visibility / opacity | `toggleBrainDump()` / `setBrainDumpOpacity(value)` (clamps `[0.30,1.00]`, `:761`) | `:760`            |
| Floating visibility             | `toggleFloatingNavigator()` (create-on-demand)                                    | `:801`            |

**Startup nav-watch behavior** (so you never see an empty panel): a startup panel is created hidden; if its final navigated URL is an auth page (`AUTH_PATHNAMES = ['/login','/sign-up']`, `electron/constants.ts:28`) the panel is suppressed and the main window surfaces instead, then `armPostLoginReshow` re-shows the panel after sign-in. `net::ERR_ABORTED` (`-3`, `electron/constants.ts:40`) fires during the redirect chain and is **not** treated as a load failure. Pill timing constants: `STARTUP_PILL_GAP_MS = 400`, `STARTUP_PILL_TIMEOUT_MS = 8000` (`electron/constants.ts:52,59`). The narrative is in [Electron architecture decisions](./explanation-electron-architecture.md).

---

## IPC contract (three synced surfaces)

Channel safety is enforced by three co-located surfaces plus thin wrappers. **`electron/types/ipc.ts` is the single source of truth** — enumerate channels there, do not transcribe.

| Surface                    | File                          | What it declares                                                                                                                                                                                                      |
| -------------------------- | ----------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Compile-time channel types | `electron/types/ipc.ts`       | `IPCChannels` (request/response per invoke channel, interface at `:248`) and `IPCEventChannels` (one-way main→renderer, interface at `:781`). `IPCChannel`/`IPCEventChannel` are the `keyof` aliases (`:874`/`:877`). |
| Runtime Zod validation     | `electron/ipc/ipc-schemas.ts` | `IPC_ARG_SCHEMAS: Record<IPCChannel, z.ZodTypeAny>` — exhaustive by construction; the **only** runtime check of inbound IPC. Carries the Electron security-checklist #17 comment.                                     |
| Typed wrappers             | `electron/ipc/*`              | bridge the two type sources at call sites (table below).                                                                                                                                                              |

### Channel families (registered, not transcribed)

All ~100 invoke handlers are registered centrally in **`setupIPCHandlers()` (`electron/main.ts:1099`)**, guarded against double-run by `ipcHandlersInitialized` (`electron/main.ts:1106`). Despite manager docstrings implying per-manager `registerIpcHandlers()`, **managers do not register their own IPC** — they are logic classes called by these handlers. The channel-name prefixes you will find there:

`window-*`, `floating-window-*`, `braindump-window-*`, `braindump-note-*`, `braindump-config-*`, `tray-*`, `notification-*`, `config-*`, `window-state-*`, `auth-*`, `oauth-*`, `settings:*`, `performance-*`, `shortcuts-*`, `deep-link-*`, `updater-*`, `display-*`, `app-*`, `menu-*`, `test-*`.

Two `settings:*` handlers worth naming directly:

| Handler                     | Anchor                  | Effect                                                                                                         |
| --------------------------- | ----------------------- | -------------------------------------------------------------------------------------------------------------- |
| `settings:setHideAppIcon`   | `electron/main.ts:1760` | macOS dock toggle via `app.setActivationPolicy('accessory'\|'regular')` (`:1770`), darwin-guarded.             |
| `settings:setStartupConfig` | `electron/main.ts:1847` | Persists which windows open at launch through `configManager.update`, so the ≥1-startup-window invariant runs. |

### Typed wrappers

| Wrapper                                  | File:line                                         | Role                                                                                                                                                           |
| ---------------------------------------- | ------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `typedHandle(channel, handler)`          | `electron/ipc/typedHandle.ts:40` (throw at `:60`) | Main-side `ipcMain.handle`; runs the channel's Zod schema, throws on `ZodError`.                                                                               |
| `typedInvoke(channel, ...args)`          | `electron/ipc/typedInvoke.ts`                     | Renderer-side `ipcRenderer.invoke`; used inside preload methods.                                                                                               |
| `typedSend(sender, channel, ...payload)` | `electron/ipc/typedSend.ts:33`                    | Main→renderer event emit; **no-ops if `sender.isDestroyed()`** (`:38`).                                                                                        |
| `ArgsOf<C>`                              | `electron/ipc/types.ts`                           | Conditional type mapping a request type to its arg tuple (`void`→`[]`, `T[]`→`T[]`, else `[T]`).                                                               |
| `createTypedListener(channel)`           | `electron/ipc/typedListener.ts:36`                | **Vestigial** — zero call sites. The live inbound pattern is raw `ipcRenderer.on` + a channel whitelist (see preloads). Do not document this as "the pattern". |

Notable shared payload types in `electron/types/ipc.ts` (defer field shapes to source): `ElectronUser` (`:25`), `AuthUserPayload` (`:46`), `WindowState` (`:62`), `StartupWindowConfig` + `DEFAULT_STARTUP_WINDOW_CONFIG` (`:80`/`:99`, default `{ showMain: true, showBraindump: false, showFloating: false }`), `AuxWindowVisibility` (`:113`), `ManagedWindowKind = 'main' | 'floating' | 'braindump'` (`:210`).

To add a channel safely, follow [How to add an Electron IPC channel](./howto-add-ipc-channel.md).

---

## Preload bridges

Three preload scripts, each exposing one isolated API object via `contextBridge` (the renderer never sees `ipcRenderer` or Node). Each window kind gets only the channels it needs — least privilege. Inbound events are gated by a hard-coded channel allow-list and payloads pass through `sanitizeData` (strips `__proto__`/`constructor`/`prototype`, trims strings).

| Window namespace                            | Preload file                        | `exposeInMainWorld` anchors | Surface                                                                                                                                                      |
| ------------------------------------------- | ----------------------------------- | --------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `window.electronAPI` + `window.electronEnv` | `electron/preload.ts` (~1968 lines) | `:232` / `:1960`            | The full app bridge — **18 namespaces** (see below) plus top-level `on`/`removeListener`/`removeAllListeners`.                                               |
| `window.floatingNavigatorAPI` + `…Env`      | `electron/preload-floating.ts`      | `:126` / `:297`             | Narrow: window controls + `brainDump.toggle` + menu-action events.                                                                                           |
| `window.brainDumpAPI` + `…Env`              | `electron/preload-braindump.ts`     | `:121` / `:319`             | Window controls + `note.get/set`, `sync.getEnabled/setEnabled`, `category.getLast/setLast`; **only inbound channel** `'braindump-category-changed'` (`:57`). |

The 18 `electronAPI` namespaces (each a `key: { ... }` block in `electron/preload.ts`): `window` `:240`, `floatingPanels` `:389`, `system` `:419`, `notifications` `:519`, `shortcuts` `:641`, `auth` `:806`, `oauth` `:909`, `menu` `:1088`, `config` `:1109`, `windowState` `:1337`, `app` `:1458`, `deepLink` `:1484`, `settings` `:1543`, `brainDump` `:1673`, `updater` `:1847`, `tray` `:1886`, `display` `:1900`, `test` `:1915`. Each method is `try/catch`-wrapped to return a safe default or re-throw. `removeListener` is a deprecated no-op.

> **No runtime `performance` namespace.** `window.electronAPI` exposes no `performance` object, even though `electron/types/electron-api.d.ts:355` declares one. **`electron/preload.ts` is the only source of truth for what is actually exposed.**

---

## Native managers

Each is a logic/side-effect class constructed in the main process (most lazily, via `LazyLoadManager`) and _called by_ the central IPC handlers; they emit events back via `typedSend`. One file each:

| Manager               | File                              | Responsibility (one line)                                                                                                                                                                                            |
| --------------------- | --------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `MenuManager`         | `electron/MenuManager.ts`         | macOS application menu bar; emits `menu-action` events.                                                                                                                                                              |
| `SystemTrayManager`   | `electron/SystemTrayManager.ts`   | macOS menu-bar (tray) icon; `setMenuBarVisible` toggles tray vs window-minimize fallback with idempotency + an in-flight-promise guard (`createTray` `:85`) so two interleaved creates build only one native `Tray`. |
| `DeepLinkManager`     | `electron/DeepLinkManager.ts`     | Parses `corelive://` URLs (`this.protocol = 'corelive'` `:104`) into focus-task / create-task / navigate / search events; returns `null` for any other scheme.                                                       |
| `AutoUpdater`         | `electron/AutoUpdater.ts`         | `electron-updater` wrapper (`checkForUpdatesAndNotify`); skips in dev via `NODE_ENV === 'development'` (`:163`).                                                                                                     |
| `NotificationManager` | `electron/NotificationManager.ts` | Native OS notifications + preferences.                                                                                                                                                                               |
| `ShortcutManager`     | `electron/ShortcutManager.ts`     | Global shortcut registration; exposes `getStats`.                                                                                                                                                                    |
| `ConfigManager`       | `electron/ConfigManager.ts`       | Persists `config.json` (userData); dot-notation `get`/`set`/`update`/`import`/`export`; owns the ≥1-startup-window invariant (`:597`).                                                                               |

Supporting infrastructure (not per-window managers): `WindowStateManager` (`electron/WindowStateManager.ts`, bounds/snap persistence + multi-monitor re-home), `LazyLoadManager` (`electron/LazyLoadManager.ts`, deferred manager construction), `PerformanceOptimizer` (`electron/performance-config.ts`). The authoritative behavioral spec for the tray is `electron/__tests__/SystemTrayManager.menu-bar.test.ts`. Deep-link details are in `docs/DEEP_LINKING_IMPLEMENTATION_SUMMARY.md`.

---

## Standing caveats (dead / dormant / drifted code)

Record these so you don't document non-functional code as live, or trust a stale `.d.ts`:

| Item                               | File:line                          | Status                                                                                                                                                                                                                            |
| ---------------------------------- | ---------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `IPCErrorHandler` retry/wrap/stats | `electron/IPCErrorHandler.ts`      | **Dormant.** Constructed (`electron/main.ts:898`) and `.cleanup()`'d (`:2327`), but `executeWithRetry`/`wrapHandler`/`getStats` are never called — no handler is actually wrapped. Do not document "automatic IPC retry" as live. |
| `createTypedListener`              | `electron/ipc/typedListener.ts:36` | **Vestigial.** Zero call sites; the only other mention is a comment (`electron/preload.ts:113`). Inbound events use raw `ipcRenderer.on` + channel whitelist.                                                                     |
| `auth-manager.ts`                  | `electron/auth-manager.ts:150`     | **Dead code.** Raw `ipcMain.handle('auth-*')`, never imported; superseded by the `auth-*` `typedHandle` blocks in `main.ts`. If it ever loaded it would double-register and throw — proof it doesn't.                             |
| `electron/types/electron-api.d.ts` | `:355`                             | **Drifted.** Declares a `performance` namespace `preload.ts` does not expose; namespaces marked optional to encode the version-skew guard.                                                                                        |
| `src/types/electron.d.ts`          | renderer-side augmentation         | **Drifted.** Omits `performance` but adds `settings`/`brainDump`; disagrees with the other `.d.ts`.                                                                                                                               |

For both `.d.ts` files: **`electron/preload.ts` is the source of truth** for what is actually exposed at runtime.

---

## Build & packaging gotchas (cited, not re-derived)

These bite only in a packaged build (`pnpm electron:build:dir` → `open dist/mac/CoreLive.app`), never `electron:dev`. Full write-ups live in `MEMORY.md`:

- **`NODE_ENV` unset in packaged builds** → gate on `=== 'development'` (or `!app.isPackaged`), never `!== 'production'`. (`packaged-electron-node-env-unset`)
- **electron-builder + pnpm drops leaf transitive deps from `app.asar`** → a missing `ms` once silently broke `electron-updater`. `ms` and `wrappy` are kept as **direct** deps (`package.json:120`, `:140`); `electron/__tests__/packaged-runtime-deps.test.ts` is the regression guard. (`electron-builder-pnpm-drops-asar-leaf-deps`)
- **Frozen preload vs live web bundle** → method-granular feature detection in the renderer. (`electron-preload-version-skew`)

Build/release flow: `docs/BUILD_AND_DEPLOYMENT.md` and [How to cut a macOS release](./howto-cut-a-release.md). Command list: `package.json` `scripts`.

---

## Related docs

- [Electron architecture decisions](./explanation-electron-architecture.md) — _why_ the windows / startup / ownership split look this way.
- [Architecture: one codebase, two runtimes, one data path](./explanation-architecture.md)
- [How to add an Electron IPC channel](./howto-add-ipc-channel.md) · [How to add a cross-window sync channel](./howto-add-sync-channel.md)
- `docs/ELECTRON_ARCHITECTURE.md` · `docs/DEEP_LINKING_IMPLEMENTATION_SUMMARY.md` · `docs/BUILD_AND_DEPLOYMENT.md`
- Hub index: [docs/dev](./README.md)
