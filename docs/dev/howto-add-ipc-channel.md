# How to add an Electron IPC channel (or a window type)

This recipe walks you through wiring a new request/response IPC channel (or a one-way main→renderer event) end to end, then covers the rarer task of adding a whole new window type. CoreLive's typed-IPC contract is split across three compiler-synced surfaces, so the build itself stops you from shipping a channel you forgot to validate. For the _why_ behind that design, see [explanation-electron-architecture.md](./explanation-electron-architecture.md); for a file:line map of the surfaces, see [reference-electron.md](./reference-electron.md) and [docs/ELECTRON_ARCHITECTURE.md](../ELECTRON_ARCHITECTURE.md).

> Reminder: the Electron main process carries **no data IPC** — todos, BrainDump notes, the heatmap all flow over oRPC HTTP, identical to the web app. IPC channels exist only for native-shell concerns (window controls, multi-window orchestration, OS chrome, auth/oauth hand-off, desktop config). If your feature is about _data_, you want [howto-add-orpc-procedure.md](./howto-add-orpc-procedure.md), not this doc.

## The three surfaces you keep in sync

| Surface               | File                                                            | Role                                                                                                                                             |
| --------------------- | --------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| Compile-time contract | `electron/types/ipc.ts`                                         | `IPCChannels` (invoke/handle) and `IPCEventChannels` (one-way events) — the single source of truth for channel names + request/response shapes.  |
| Runtime validation    | `electron/ipc/ipc-schemas.ts`                                   | `IPC_ARG_SCHEMAS`, typed `Record<IPCChannel, z.ZodTypeAny>` (`electron/ipc/ipc-schemas.ts:68`). The **only** place inbound payloads are checked. |
| Wiring                | `electron/ipc/typedHandle.ts`, `typedInvoke.ts`, `typedSend.ts` | Thin wrappers that read those types; `typedHandle` parses against the schema before your handler runs.                                           |

The load-bearing trick: `IPC_ARG_SCHEMAS` is typed as a _total_ `Record<IPCChannel, ...>`. Add a channel to `IPCChannels` in `ipc.ts` and forget its schema, and `ipc-schemas.ts` **fails to compile** — there is no path to a channel with no validation. `electron/__tests__/ipc-contract.test.ts` additionally asserts a schema exists for every channel and that the shapes parse. This is what makes "forgot to validate a channel" impossible rather than merely discouraged.

---

## Add a request/response channel

A request/response channel is one the renderer calls with `invoke` and awaits a result. Steps 1–4 below are mandatory; skip any one and you get either a compile error (steps 1–2) or a missing/broken method at runtime (steps 3–4).

### 1. Declare the channel in `IPCChannels`

Add an entry to the `IPCChannels` interface in `electron/types/ipc.ts` (the interface opens at `electron/types/ipc.ts:248`). Each entry is `{ request; response }`. The `request` shape drives the argument tuple your handler and preload caller see, via `ArgsOf<C>` (`electron/ipc/types.ts:16`):

- `request: void` → no args (`[]`)
- `request: T` → one arg (`[T]`)
- `request: [A, B]` (a tuple) → multiple positional args (`[A, B]`)

```typescript
// electron/types/ipc.ts — inside interface IPCChannels
'braindump-config-set-last-category': {
  request: number
  response: boolean
}
```

Reuse existing shared types (`ManagedWindowKind`, `WindowState`, `AuthUserPayload`, …) rather than inlining new shapes — they live in the same file and the renderer-side `.d.ts` re-imports them.

### 2. Add its Zod schema to `IPC_ARG_SCHEMAS`

In `electron/ipc/ipc-schemas.ts`, add a schema keyed by the same channel name. The schema validates the **argument tuple** (always a `z.tuple([...])`), not the response:

```typescript
// electron/ipc/ipc-schemas.ts — inside IPC_ARG_SCHEMAS
'braindump-config-set-last-category': z.tuple([z.number().int().positive()]),
```

This is your one chance to bound untrusted input from a remotely-loaded web bundle — cap string lengths and number ranges here, do not just `z.unknown()` everything. See the existing entries for the conventions: `braindump-window-set-opacity` clamps to `z.number().min(0).max(1)` (`electron/ipc/ipc-schemas.ts:344`), `braindump-note-set` caps text length (`:366`), and the window-state channels constrain the target to `z.enum(['main', 'floating', 'braindump'])`.

> If you skip this step the file will not type-check — that is the safety net working, not a bug.

### 3. Register a `typedHandle` in `main.ts`

All ~100 handler registrations live in **one** place: `setupIPCHandlers()` in `electron/main.ts` (the function opens at `electron/main.ts:1099`, guarded against a second run by `ipcHandlersInitialized` at `electron/main.ts:1103`). Do **not** add a `registerIpcHandlers()` method to a manager — some manager docstrings imply per-manager registration, but that is not how it actually works; managers are pure logic called _by_ these handlers.

```typescript
// electron/main.ts — inside setupIPCHandlers()
typedHandle('braindump-config-set-last-category', (_event, categoryId) => {
  if (!configManager) return false
  configManager.set('braindump.lastCategoryId', categoryId)
  return true
})
```

`typedHandle` (`electron/ipc/typedHandle.ts:40`) runs `IPC_ARG_SCHEMAS[channel].parse(rawArgs)` before invoking your callback. A payload that fails the schema throws `IPC validation failed on '<channel>': <detail>` (`electron/ipc/typedHandle.ts:60`) and never reaches your handler — so inside the handler you may treat `categoryId` as already-validated.

### 4. Expose a guarded method in the right preload

There are **three** preload scripts, each exposing one isolated API object over `contextBridge` (the renderer never sees `ipcRenderer` or Node). Add your method to the one whose window needs the channel:

| Preload                         | Exposed as                                                 | Window              |
| ------------------------------- | ---------------------------------------------------------- | ------------------- |
| `electron/preload.ts`           | `window.electronAPI` (full surface) + `window.electronEnv` | Main `/home` window |
| `electron/preload-floating.ts`  | `window.floatingNavigatorAPI`                              | Floating navigator  |
| `electron/preload-braindump.ts` | `window.brainDumpAPI`                                      | BrainDump panel     |

Wrap the call in `typedInvoke` and a `try/catch` that returns a safe default (this matches every existing method):

```typescript
// electron/preload-braindump.ts — inside contextBridge.exposeInMainWorld('brainDumpAPI', { ... })
category: {
  setLast: async (categoryId: number): Promise<void> => {
    try {
      await typedInvoke('braindump-config-set-last-category', categoryId)
    } catch (error) {
      log.error('BrainDump: Failed to set last category:', error)
    }
  },
},
```

`typedInvoke` (`electron/ipc/typedInvoke.ts:32`) is the renderer-side typed wrapper over `ipcRenderer.invoke`; it returns `Promise<IPCChannels[C]['response']>`.

#### Gotcha: renderer code must feature-detect by METHOD, not namespace

The installed desktop app ships a **frozen** preload, but the renderer loads the always-current remote web bundle from `https://corelive.app`. So a freshly deployed web build can call a preload method that an older _installed_ app does not expose — a version skew. Renderer code must therefore feature-detect at **method granularity**, never just check that the namespace exists. The real consumer does exactly this:

```typescript
// src/components/electron/StartupWindowSettings.tsx:187
typeof window.electronAPI?.settings?.getStartupConfig !== 'function'
```

Both global `Window.electronAPI` augmentations (`electron/types/electron-api.d.ts`, `src/types/electron.d.ts`) mark namespaces optional (`?.`) to _force_ this style at the type level. `src/app/error.tsx` is the route-level net if a guard is ever missed. Background: [explanation-electron-architecture.md](./explanation-electron-architecture.md) and the project's local `CLAUDE.md` Electron sections.

### 5. (If shared types changed) keep the renderer `.d.ts` honest

`electron/preload.ts` is the **only** source of truth for what is actually on `window.electronAPI`. The two `.d.ts` files already disagree with each other and with runtime (e.g. `electron/types/electron-api.d.ts` declares a `performance` namespace that `preload.ts` does not expose). If you added a new namespace or method that renderer code consumes, update `src/types/electron.d.ts` to match what you actually exposed — and only that.

---

## Add a one-way event (main → renderer)

When the main process needs to _push_ something (e.g. broadcast a state change), use an event channel instead of request/response.

1. **Declare it in `IPCEventChannels`** in `electron/types/ipc.ts` (the interface opens at `electron/types/ipc.ts:781`). The value is the payload type directly (or `void` for no payload):

   ```typescript
   // electron/types/ipc.ts — inside interface IPCEventChannels
   'braindump-category-changed': { categoryId: number }
   ```

2. **Emit it with `typedSend`** from `main.ts` or a manager. `typedSend` (`electron/ipc/typedSend.ts:33`) no-ops if `sender.isDestroyed()` (`electron/ipc/typedSend.ts:38`), so emitting to a window that just closed is a safe no-op, not a crash:

   ```typescript
   // electron/main.ts — e.g. inside the set-last-category handler
   const brainDumpWin = windowManager?.getBrainDumpWindow()
   if (brainDumpWin && !brainDumpWin.isDestroyed()) {
     typedSend(brainDumpWin.webContents, 'braindump-category-changed', {
       categoryId,
     })
   }
   ```

3. **Whitelist it on the inbound side of the preload.** Each preload gates its generic `on()` subscription behind a hard-coded allow-list of event-channel names and runs every payload through `sanitizeData` (strips `__proto__`/`constructor`/`prototype` keys — prototype-pollution defense — and trims strings). In `electron/preload-braindump.ts`, `braindump-category-changed` is the **only** inbound channel accepted (`ALLOWED_CHANNELS` at `electron/preload-braindump.ts:56`, gated by `validateChannel` at `:70`). The main preload uses the equivalent `validateChannel` + `sanitizeData` (`electron/preload.ts:162` / `:172`). Add your channel to the relevant allow-list or `on()` silently refuses it.

   > Do **not** reach for `createTypedListener` (`electron/ipc/typedListener.ts`) — it is vestigial with zero call sites. The live inbound pattern is the guarded raw `ipcRenderer.on` shown above.

### Worked example: `braindump-config-set-last-category`

The BrainDump "remember my last category" feature exercises _both_ halves at once and is the cleanest end-to-end reference in the tree:

- **Channel** declared in `IPCChannels` and validated by `z.tuple([z.number().int().positive()])` (`electron/ipc/ipc-schemas.ts:378`).
- **Handler** at `electron/main.ts:1487` persists `braindump.lastCategoryId` via `configManager.set(...)`, then — in the same handler — broadcasts the change with `typedSend(..., 'braindump-category-changed', { categoryId })` (`electron/main.ts:1495`).
- **Renderer side** is exposed as `brainDumpAPI.category.setLast` / `.getLast` (`electron/preload-braindump.ts:239`), and the BrainDump window subscribes to the event via the whitelisted `on('braindump-category-changed', …)`.

Read those three spans together for the canonical shape.

---

## Add a new window type

Rarer, and a bigger ritual — a window type touches the factory, two `'main'|'floating'|'braindump'` unions, config defaults, and the persistence layer. CoreLive currently ships five window kinds (main, floating navigator, BrainDump, settings popover, cold-boot startup pill); see [reference-electron.md](./reference-electron.md) for the factory line anchors and [explanation-electron-architecture.md](./explanation-electron-architecture.md) for the visibility-ownership model. The persisted-window types specifically are the `'main' | 'floating' | 'braindump'` set; the settings popover and startup pill are transient and not persisted.

To add a new **persisted** window type:

1. **Add a factory method** to `WindowManager` alongside the existing ones — `createMainWindow` (`electron/WindowManager.ts:343`), `createFloatingNavigator` (`:457`), `createBrainDumpWindow` (`:591`), `createSettingsWindow` (`:1249`). It returns a `BrowserWindow` and loads `'${serverUrl}/<your-route>'`. Note the visibility split: **`WindowManager` owns show/hide/toggle**, not `WindowStateManager`.

2. **Extend the window-kind union — there are two, and one is the source of truth.** Add your kind to `WindowType` in `electron/WindowStateManager.ts:64` (`'main' | 'floating' | 'braindump'`). `WindowManager` derives `StartupPanelKind = Exclude<WindowType, 'main'>` from it (`electron/WindowManager.ts:62`), so a new panel type flows through automatically. Separately, the **IPC** window-state channels use `ManagedWindowKind` (`electron/types/ipc.ts:210`, also `'main' | 'floating' | 'braindump'`) — extend it too if your window participates in `window-state-*` IPC, and update the matching `z.enum([...])` schemas in `ipc-schemas.ts` (e.g. `electron/ipc/ipc-schemas.ts:293`).

3. **Add `ConfigManager` defaults** so the window has persisted config and (if it should open at launch) a startup flag. Startup flags live under `behavior.startup` as `StartupWindowConfig` (`electron/types/ipc.ts:80`).

4. **Respect the ≥1-startup-window invariant.** `ConfigManager.ensureAtLeastOneStartupWindow()` (`electron/ConfigManager.ts:597`) runs on every `set`/`update`/`import` and force-sets `showMain = true` if every startup flag is false (`electron/ConfigManager.ts:632-633`), so a persisted config can never launch zero windows and soft-brick the app. If you add a new startup flag, make sure the invariant still considers a valid "main shows" fallback — do not write a code path that could persist an all-false startup config. The invariant is pinned by `electron/__tests__/ConfigManager.startup.test.ts`.

5. **Add `WindowStateManager` defaults** for the new kind (bounds, snap, the `isVisible` default derived from its startup flag). Remember the deliberate boundary: `applyWindowState` restores **bounds only, not visibility** (`electron/WindowStateManager.ts:735`), and `floating.isVisible` is re-pinned to the configured startup default on load (`electron/WindowStateManager.ts:305`) so stale persisted state can't override the user's startup choice. Mirror that pattern for your window.

---

## Verify and test

```bash
pnpm typecheck      # catches a missing schema (step 2) or a request/response mismatch (step 1)
pnpm test:electron  # runs ipc-contract.test.ts + the manager specs
pnpm validate       # the full gate (test + lint + build + typecheck) — run before commit
```

(Canonical command list: `package.json` "scripts"; see also [howto-local-dev-and-tests.md](./howto-local-dev-and-tests.md) and [reference-ci-and-commands.md](./reference-ci-and-commands.md).)

### Native surfaces have NO automated coverage

Menu bar, system tray, dock / activation policy, `open-url` deep links, traffic-light controls, vibrancy, and the multi-window flows are **invisible** to Playwright and the `mcp__electron__*` suite — those drive the renderer (web content) only, and the Linux + `xvfb` CI is renderer coverage. A new window type, a tray-affecting channel, or anything touching Cocoa chrome has **zero automated tests**. Smoke-test it manually on macOS with the `mcp__computer-use__*` MCP before any tag push:

```bash
pnpm electron:build:dir && open dist/mac/CoreLive.app
```

See the project's local `CLAUDE.md` "Electron Native QA (macOS, computer-use)" section for the full checklist, and verify any window/menu motion via **video frames, not screenshots**.

## See also

- [reference-electron.md](./reference-electron.md) — windows, IPC, preload, managers (file:line index).
- [explanation-electron-architecture.md](./explanation-electron-architecture.md) — why three preloads, why version-skew-safe, why the remote-URL WebView.
- [howto-add-sync-channel.md](./howto-add-sync-channel.md) — the higher-level cross-window sync layer that rides on top of these IPC events.
- [docs/ELECTRON_ARCHITECTURE.md](../ELECTRON_ARCHITECTURE.md) — the deep architecture reference.
- Hub index: [README.md](./README.md).
