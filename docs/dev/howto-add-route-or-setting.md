# How to add a route or a persisted client setting

Two recipes that share a chapter of CoreLive's frontend. **Part A** adds a new
page to the App Router (and decides whether it gets the sidebar or renders
chromeless for its own Electron window). **Part B** adds a persisted Redux
setting (a slice) and wires its cross-window sync. Both assume you have done the
[Getting Started tutorial](./tutorial-getting-started.md) and can run the
[local dev + test loop](./howto-local-dev-and-tests.md).

For the durable "why" behind these mechanics, see
[Architecture: one codebase, two runtimes](./explanation-architecture.md) and
[Client state ownership & cross-window sync](./explanation-state-and-sync.md).
The flat surface map lives in
[the frontend reference](./reference-frontend.md).

---

## Part A — Add a route

### Step 0 — Decide: `(main)` sidebar group, or standalone chromeless route?

Every Electron window loads a **real `corelive.app` route** in a `BrowserWindow`
— there is no embedded UI. So the first decision is which kind of page you are
adding:

| Kind                          | Lives under               | Gets the sidebar/app chrome?                                                     | Use it for                                                                                                |
| ----------------------------- | ------------------------- | -------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| **`(main)` route-group page** | `src/app/(main)/<route>/` | **Yes** — `(main)/layout.tsx` wraps children in `SidebarProvider` + `AppSidebar` | A normal in-app screen (like `/home`, `/skill-tree`)                                                      |
| **Standalone route**          | `src/app/<route>/`        | **No** — renders bare                                                            | A chromeless body for a dedicated Electron window (like `/braindump`, `/floating-navigator`, `/settings`) |

The parentheses in `(main)` are a Next.js **Route Group**: they add **no URL
segment**, they only attach a shared layout. `(main)/layout.tsx:12-23` is that
layout — it renders `<SidebarProvider><AppSidebar /><SidebarInset>{children}` so
`/home` and `/skill-tree` get the sidebar without `(main)` appearing in their
URL. The standalone routes live **outside** `(main)` for exactly the opposite
reason: they must render sidebar-free inside their own native window. Which
window loads which route is wired in `electron/WindowManager.ts` — see
[the Electron reference](./reference-electron.md).

### Step 1 — Create the page file

For an in-app screen with the sidebar:

```
src/app/(main)/<route>/page.tsx
```

For a standalone window body:

```
src/app/<route>/page.tsx
```

A standalone page is typically a `'use client'` component that owns its own
viewport (`h-screen w-full`) and may import its own CSS — see
`src/app/floating-navigator/page.tsx:1-16`, which imports
`floating-navigator.css` and renders a single full-height container.

### Step 2 — Gate any protected client query with `useClerkQueryReady`

If your page fires an oRPC query that needs the signed-in user, you **must not**
let it fire before Clerk hydrates the session — otherwise you get a flaky
`UNAUTHORIZED` request in the gap between mount and Clerk being ready (common
right after an OAuth redirect). The gate is `useClerkQueryReady()`, which returns
`isLoaded && Boolean(user)` (`src/hooks/useClerkQueryReady.ts:18-21`). Feed it
into the query's `enabled` and render a loading state until it is `true`.

This is the pattern `src/app/braindump/page.tsx:19-33` uses:

```tsx
'use client'

import { useQuery } from '@tanstack/react-query'

import { useClerkQueryReady } from '@/hooks/useClerkQueryReady'
import { orpc } from '@/lib/orpc/client-query'

const isClerkReady = useClerkQueryReady()
const { data, isLoading, error } = useQuery({
  ...orpc.category.list.queryOptions({}),
  enabled: isClerkReady, // do not fire until Clerk has a signed-in user
})

if (isLoading || !isClerkReady) {
  return <div className="…">Loading…</div>
}
```

> **Why the gate, not just `isLoading`?** React Query's `isLoading` is only
> meaningful once the query is _enabled_. Gating on `enabled: isClerkReady`
> keeps the request from being constructed (with an empty `Authorization`
> header) during hydration. See
> [the authentication explanation](./explanation-authentication.md) for how the
> `Authorization: Bearer <clerk user id>` header is assembled and why it can be
> empty before Clerk loads.

A standalone page can also be **browser-tolerant** for dev: `/braindump` renders
a placeholder when opened in a plain tab without the Electron `brainDumpAPI`, so
you can iterate from a regular `pnpm dev` server without launching Electron
(`src/app/braindump/page.tsx:11-18`).

### Step 3 — Add the route prefix to `isProtectedRoute`

Route protection is **centralized** in `src/proxy.ts` (Next.js 16 renamed
`middleware.ts` → `proxy.ts`). It runs `clerkMiddleware` and redirects
unauthenticated requests for protected prefixes to `/login?redirect_url=…`. Add
your new route's path prefix to the `isProtectedRoute` matcher at
`src/proxy.ts:4-15`:

```ts
const isProtectedRoute = createRouteMatcher([
  '/home(.*)',
  '/skill-tree(.*)',
  '/braindump(.*)',
  '/settings(.*)',
  '/floating-navigator(.*)',
  // '/<your-route>(.*)',  ← add here if the page requires a signed-in user
])
```

The `(.*)` suffix protects the prefix and everything beneath it. If your page is
genuinely public (like the marketing landing at `src/app/page.tsx`), do **not**
add it — the default is public.

> **Gotcha — a redirect can be load-bearing.** `/floating-navigator` is
> protected on purpose so an unauthenticated Electron **cold boot** redirects to
> `/login`; the main-process nav-watch detects that redirect and surfaces the
> main window instead of leaving an empty floating panel
> (`src/proxy.ts:11-14`). If you add a standalone Electron-window route, decide
> deliberately whether an unauthenticated load should redirect (usually yes) so
> the native side can react.

You do **not** normally touch the `config.matcher` at `src/proxy.ts:33-40` — it
already covers every non-static path and all `/api` routes.

---

## Part B — Add a persisted client setting (a Redux slice)

Client/device state lives in **Redux** (two small persisted slices); all server
data lives in **React Query**. Keep that split — do not put server data in Redux.
The full rationale (and why each sync path is the way it is) is in
[Client state ownership & cross-window sync](./explanation-state-and-sync.md).

Before adding a _new_ slice, ask whether your setting belongs in an existing one:

- `preferencesSlice` — core todo-experience prefs (`completionSound`,
  `retainCompletedInList`), synced **between renderer windows** via
  BroadcastChannel.
- `electronSettingsSlice` — window-chrome settings (`hideAppIcon`,
  `showInMenuBar`, `startAtLogin`), synced **to the Electron main process** via
  IPC.

If it fits one of those, just add a field + action + selector to that slice and
follow Steps 3–5 below. The steps that follow assume a brand-new slice.

### Step 1 — Write the slice with a defaults constant

Put the slice at `src/lib/redux/slices/<name>Slice.ts`. Model it on
`src/lib/redux/slices/preferencesSlice.ts`. Two non-negotiable conventions:

1. **Defaults live in a shared constant**, not inline. `preferencesSlice.ts:44-46`
   spreads `DEFAULT_PREFERENCES` from `src/lib/constants/preferences.ts` for its
   `initialState`. This keeps the initial state and the selector fallbacks
   (Step 2) reading from one source of truth.
2. **Provide a `hydrate*` action** that replaces the whole slice from a payload
   _without_ re-broadcasting — only if you intend cross-window sync (Step 4).
   `preferencesSlice.ts:79-81` is the template; it is deliberately a separate
   action from the user-facing `set*` ones.

### Step 2 — Write selectors with `?? DEFAULT` fallbacks

This is the single most important and least obvious rule. The persistence
middleware's default `shallowMerge` **drops any field you ADD to a slice later**
for a user who already persisted an older blob to `localStorage` — pre-launch,
slices gain fields often. If a selector returned `state.x.newField` directly,
that user would see `undefined` leak into the UI.

So every selector coalesces through the default. `preferencesSlice.ts:109-119`:

```ts
export const selectCompletionSound = (state: RootState): boolean =>
  state.preferences.completionSound ?? DEFAULT_PREFERENCES.completionSound
```

The rationale is documented at `src/lib/constants/preferences.ts:5-11`. Write
yours the same way.

> **Note the asymmetry.** `electronSettingsSlice.ts:115-144` selectors read the
> field **directly** (no `?? DEFAULT`). That is fine _there_ because those values
> are re-pushed to the main process on every launch (Step 4) and the slice has
> been stable — but for any **new** slice, default-coalescing selectors are the
> safe choice. When in doubt, coalesce.

### Step 3 — Register the slice in the store (TWO places)

Both registrations live in `src/lib/redux/store.ts` and **both are required** —
miss the second and your slice will work in-memory but silently fail to persist:

1. Add the reducer to `combineReducers` (`store.ts:28-31`):

   ```ts
   const rootReducer = combineReducers({
     electronSettings: electronSettingsReducer,
     preferences: preferencesReducer,
     // <name>: <name>Reducer,   ← add the reducer
   })
   ```

2. Add the slice **name** to the persisted-`slices` list passed to
   `createStorageMiddleware` (`store.ts:48-53`):

   ```ts
   createStorageMiddleware({
     rootReducer,
     key: STORAGE_KEY, // 'corelive-redux-state'
     slices: ['electronSettings', 'preferences'], // ← add '<name>' here to persist it
   })
   ```

Components read/write the slice through the **pre-typed hooks** (`useAppSelector`
/ `useAppDispatch`), re-exported from the barrel `src/lib/redux/index.ts:19-20`.
Never import bare `useSelector` / `useDispatch`.

### Step 4 — Choose the sync mechanism

Each window has its **own** Redux store and its **own** `localStorage`, so a
toggle in one window will not reach another (or the OS) without an explicit sync
path. Pick based on _who needs to hear about the change_:

| Destination                                             | Mechanism                                                                   | Reference implementation                          |
| ------------------------------------------------------- | --------------------------------------------------------------------------- | ------------------------------------------------- |
| **Other renderer windows** (web tab ↔ Electron windows) | `BroadcastChannel` Redux middleware                                         | `src/lib/preferences-sync-channel.ts`             |
| **The Electron main process** (OS-facing chrome)        | renderer→main **IPC** in a `useCycleEffect`, mounted inside `ReduxProvider` | `src/components/electron/ElectronStartupSync.tsx` |

**For BroadcastChannel sync**, model it on
`createPreferencesSyncMiddleware` and concat it into the store's middleware chain
(`store.ts:67-78`). Two correctness rules it encodes:

- **Echo-loop guard** — only the user-initiated `set*` action types are in
  `BROADCASTABLE_ACTION_TYPES` (`preferences-sync-channel.ts:19-22`); an inbound
  snapshot is applied via `hydratePreferences`, which is _excluded_ from that
  set, so an applied broadcast never re-broadcasts.
- **Validate inbound payloads field-by-field** before dispatching
  (`preferences-sync-channel.ts:38-55`): the selectors only coalesce
  `null`/`undefined`, so non-boolean channel junk would otherwise be hydrated and
  persisted. The middleware also no-ops on SSR / where `BroadcastChannel` is
  unavailable (`preferences-sync-channel.ts:76-80`).

If you only need cross-window sync (no new sync rules), the cheapest path is to
add a channel that follows the same shape — see
[How to add a cross-window sync channel](./howto-add-sync-channel.md).

**For IPC-to-main sync**, model it on `ElectronStartupSync.tsx:91-123`. The
load-bearing rules there:

- Mount the syncing component **inside `<ReduxProvider>`** so it can read the
  hydrated slice — it sits at `src/app/layout.tsx:65-66`, right after
  `ReduxProvider` opens.
- **Guard on the METHOD existing**, not just the namespace —
  `typeof settings?.setHideAppIcon === 'function'`
  (`ElectronStartupSync.tsx:106`). An installed desktop app loads the live remote
  web bundle against its own **frozen preload**; calling `undefined()` would
  throw a synchronous `TypeError` out of the effect (past `.catch`) and, from the
  root layout, escape `error.tsx` entirely. (See
  [the Electron architecture explanation](./explanation-electron-architecture.md)
  and [How to add an Electron IPC channel](./howto-add-ipc-channel.md).)
- **One effect per setting**, each with its own guard
  (`ElectronStartupSync.tsx:103-120`), so a preload missing one method never
  suppresses the others.

### Step 5 — Surface the toggle in the UI

The single settings home is `src/app/settings/page.tsx:32-43` (web + Electron,
"D15"). It renders `PreferencesSettings` for everyone and `ElectronSettingsPage`
(which self-returns `null` on web) for desktop-only chrome. Add your control to
the matching component — preferences-style toggles go in `PreferencesSettings`,
window-chrome ones in `ElectronSettingsPage`.

---

## Worked example — the `居残りモード` preference (end to end)

`retainCompletedInList` ("keep completed todos in the active list") is a complete
real example of a BroadcastChannel-synced preference. Trace it across the files:

| Step                | File:line                                        | What it does                                              |
| ------------------- | ------------------------------------------------ | --------------------------------------------------------- |
| Default constant    | `src/lib/constants/preferences.ts:12-20`         | `retainCompletedInList: false` (default OFF)              |
| State field         | `src/lib/redux/slices/preferencesSlice.ts:35-38` | typed `boolean` on `PreferencesState`                     |
| `set*` action       | `preferencesSlice.ts:69-71`                      | `setRetainCompletedInList` mutates the field              |
| Defensive selector  | `preferencesSlice.ts:117-119`                    | reads `?? DEFAULT_PREFERENCES.retainCompletedInList`      |
| Persisted           | `src/lib/redux/store.ts:48-53`                   | `'preferences'` in the `slices` list                      |
| Broadcast on change | `src/lib/preferences-sync-channel.ts:19-22`      | `'preferences/setRetainCompletedInList'` is broadcastable |
| Applied inbound     | `preferences-sync-channel.ts:85-91`              | dispatched via `hydratePreferences` (no echo)             |

A component toggles it through the typed hooks:

```tsx
import { useAppDispatch, useAppSelector } from '@/lib/redux/hooks'
import {
  selectRetainCompletedInList,
  setRetainCompletedInList,
} from '@/lib/redux/slices/preferencesSlice'

const retain = useAppSelector(selectRetainCompletedInList)
const dispatch = useAppDispatch()
dispatch(setRetainCompletedInList(!retain)) // persists + broadcasts to other windows
```

---

## Pitfalls checklist

- **Put a standalone Electron-window page OUTSIDE `(main)`** — placing it inside
  the group silently gives it a sidebar in its dedicated window.
- **Gate protected client queries on `useClerkQueryReady`**, not on `isLoading`
  alone — otherwise an `UNAUTHORIZED` request fires during Clerk hydration.
- **Add the route to `isProtectedRoute`** (`src/proxy.ts:4-15`) — forgetting it
  leaves a "logged-in" page reachable while signed out.
- **Register a new slice in BOTH places** (`combineReducers` _and_ the persisted
  `slices` list, `store.ts:28-53`) — miss the second and it won't survive a
  reload.
- **Write `?? DEFAULT` selectors** — `shallowMerge` drops newly-added fields for
  users with an older persisted blob (`preferences.ts:5-11`).
- **Guard IPC calls on the method, not the namespace**
  (`ElectronStartupSync.tsx:106`) — a frozen preload makes a missing method
  throw past `error.tsx`.
- **Validate inbound BroadcastChannel payloads** field-by-field
  (`preferences-sync-channel.ts:38-55`) — the selectors don't reject non-boolean
  junk.
