# Client state ownership & cross-window sync

CoreLive splits client state deliberately — Redux owns device/preference state, React Query owns the server cache — and then has to reconcile that state across **separate browser windows** that cannot see each other's memory. This document explains the split, the cross-window problem the Electron design creates, and the four sync mechanisms (three stateless `BroadcastChannel` pings plus one stateful preferences middleware) that solve it. It also covers two patterns that fall out of the same thinking: deriving every stat from a single heatmap `Map`, and the two-tier error boundary that survives Electron preload version skew.

> Prerequisite: read [explanation-architecture.md](./explanation-architecture.md) first for the provider-tree boot order and the central bet that **Electron loads real `corelive.app` routes in native windows**. That bet is what makes cross-window sync necessary at all — this page picks up where it leaves off.

---

## The one sentence to remember

> **Each window is its own world** — its own React Query cache, its own Redux store, its own `localStorage` — so a change in one is invisible to the others until you broadcast it.

Everything below is a consequence of that fact plus one design rule: **Redux holds client/device state, React Query holds server state, and the two never overlap.**

---

## Part 1 — The deliberate state split

Two state systems coexist, with a hard ownership boundary:

| Owner             | What it holds                                                                                                             | Persistence                                                 | Verified at                                   |
| ----------------- | ------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------- | --------------------------------------------- |
| **Redux Toolkit** | Client/device state only — two small slices: `electronSettings` (window chrome) + `preferences` (todo-experience toggles) | `localStorage` key `corelive-redux-state`, selective slices | `src/lib/redux/store.ts:71-79`                |
| **React Query**   | All server data, via oRPC over HTTP                                                                                       | `localStorage`, `gcTime` 1 week                             | `src/providers/QueryClientProvider.tsx:36-37` |

### Why the split

Server data already has an owner — the database, reached through oRPC. Duplicating it into Redux would mean two copies that drift, two invalidation stories, and a fat persisted `localStorage` blob. So Redux is kept tiny on purpose: it persists only what the _client_ owns and the server never will (window-chrome preferences, sound/retention toggles). The store's `rootReducer` (`src/lib/redux/store.ts:35-38`) combines exactly two reducers, and the persistence list at `src/lib/redux/store.ts:75` names exactly those two slices.

This also lines up with a Next.js 16 caching rule the project follows: Redux/Zustand state must **never** trigger `revalidatePath`/`revalidateTag`. Those are for cached `fetch` data; the oRPC + Prisma path does not use the Next.js fetch cache, and client state changes are not a server-cache concern. (See the project's TypeScript/Next.js rules; the canonical command list is `package.json` `"scripts"`.)

For the exact slice fields, actions, and selectors, see [reference-frontend.md](./reference-frontend.md) and the slice sources `src/lib/redux/slices/electronSettingsSlice.ts` / `preferencesSlice.ts` — they are pre-launch and reshape freely, so this doc points at them rather than transcribing them.

### The sign-out cache-isolation reset

The split forces one non-obvious safety measure. Because React Query persists to `localStorage` on a potentially **shared device**, signing out must not leave user A's data reachable by user B. The obvious move — `queryClient.clear()` — is **not enough**, and the code says so at `src/providers/QueryClientProvider.tsx:98-143`:

> `queryClient.clear()` cancels in-flight query _fetches_ (via their `AbortController`) but does **not** cancel in-flight _mutations_. A mutation user A submitted that resolves _after_ sign-out would fire its `onSuccess`/`onSettled` and write stale data back into the cache via `setQueryData`/`invalidateQueries` — leaking A's data into B's session.

So on the signed-in → signed-out transition, `handleSessionReset` (`QueryClientProvider.tsx:128-143`) does three things in order: removes the persisted entry, clears the old client, then **rebuilds the entire `QueryClient` + persister and remounts the provider** via `key={resetKey}`. Stale mutation callbacks captured the _previous_ client by closure, so any late writes land on an orphaned instance nobody renders from, and the new session starts from an empty, isolated cache. The transition itself is detected by `PersisterSignOutGuard` (`QueryClientProvider.tsx:79-96`), which uses a ref so it fires only on the real transition, not on first mount.

This is the threat model to keep in mind if you ever "simplify" sign-out back to a bare `clear()`: you would reopen a cross-user data leak on shared machines.

---

## Part 2 — The cross-window problem

In the desktop build, CoreLive runs **multiple `BrowserWindow`s at once** — the always-on-top **Floating Navigator** (`/floating-navigator`), the **BrainDump** (`/braindump`), and **Settings** (`/settings`) — alongside the full task app on `/home`, which since v0.14.0 runs **browser-only** (the dedicated Electron main window was retired; the desktop app keeps just the floating/braindump/settings panels — see [explanation-electron-architecture.md](./explanation-electron-architecture.md)). Each renderer — Electron window or `/home` browser tab — is full and independent. That means each has:

- its **own** React Query cache (a fresh `QueryClient` per window),
- its **own** Redux store + `localStorage`,
- its **own** copy of every component's state.

So if you complete a todo in the Floating Navigator, a browser tab open on `/home` knows nothing about it — its `TodoList` query cache is a separate world. If you rename a category on `/home`, the Floating Navigator still shows the old name. **A mutation in one window is invisible to the others** until something tells them to refetch.

This is not an Electron-only edge case, either — the same is true of two browser tabs. Electron just makes the multi-window case the _normal_ case, because the floating and braindump windows are core product surfaces, not afterthoughts.

### Why `BroadcastChannel`, not custom IPC

The natural Electron instinct is to route cross-window messages through the main process with `ipcMain`/`ipcRenderer`. CoreLive does **not** do that for data sync. It uses the web-standard `BroadcastChannel` API, for one decisive reason: **`BroadcastChannel` crosses Electron `BrowserWindow`s natively** (every renderer in the app shares the channel namespace), _and_ it works identically in two plain browser tabs. One mechanism covers both runtimes with zero Electron-specific plumbing — exactly the "one codebase, two runtimes" bet from the architecture doc. Adding IPC would mean a main-process relay that has no web equivalent, defeating the point.

The `paste-import-channel.ts` docstring (`src/lib/paste-import-channel.ts:1-11`) states this directly: it mirrors the todo channel "(BroadcastChannel crosses Electron windows in this app) — no new Electron IPC plumbing."

> IPC _is_ still used — but for a different job. `electronSettings` (dock policy, tray) syncs renderer → **main process** via IPC, because those settings drive the OS, not other windows. See Part 4 and [explanation-electron-architecture.md](./explanation-electron-architecture.md). Cross-_window_ sync is `BroadcastChannel`; renderer-to-_OS_ is IPC.

---

## Part 3 — The four sync mechanisms

CoreLive has **four** cross-window channels. Three are nearly identical stateless "pings"; the fourth is the odd one out.

| Channel             | Name                           | Message                             | Stateful?                  | Source                                |
| ------------------- | ------------------------------ | ----------------------------------- | -------------------------- | ------------------------------------- |
| Todo                | `corelive-todo-sync`           | `{ type: 'todo-sync' }`             | No (ping)                  | `src/lib/todo-sync-channel.ts`        |
| Category            | `corelive-category-sync`       | `{ type: 'category-sync' }`         | No (ping)                  | `src/lib/category-sync-channel.ts`    |
| Paste-import intent | `corelive-paste-import-intent` | `{ type: 'open-completed-import' }` | No (intent)                | `src/lib/paste-import-channel.ts`     |
| Preferences         | `corelive-preferences-sync`    | snapshot payload                    | **Yes** (Redux middleware) | `src/lib/preferences-sync-channel.ts` |

### The three stateless pings

`todo-sync-channel.ts` is the canonical shape; category and paste-import are copies of it. Each module exposes the same contract (`src/lib/todo-sync-channel.ts:62-100`):

- An **SSR guard** — `typeof window !== 'undefined' && typeof BroadcastChannel !== 'undefined'` — so it is a no-op on the server.
- A **broadcast** function that opens a channel, posts a single typeless message, then **immediately `close()`s it** (fire-and-forget). It returns `false` when `BroadcastChannel` is unavailable.
- A **subscribe** function that returns a **cleanup** which both `removeEventListener`s _and_ `close()`s the channel.

The producer→subscriber contract is intentionally dumb: the message carries **no data**, only "something in this domain changed." The receiver's job is simply to **invalidate the relevant queries** so React Query refetches the truth from the server. There is no attempt to ship the changed rows across the channel — that would re-introduce the duplicate-state problem the Redux/React-Query split exists to avoid. The channel says _"refetch"_, not _"here's the new value."_

Real wiring, verified in the tree:

- **Todo** — broadcast by `useTodoMutations`, `BrainDumpEditor`, `TodoImportEntry`, `CompletedImportEntry`; subscribed (→ invalidate) by `TodoList` and `FloatingNavigatorContainer`.
- **Category** — broadcast by `useCategoryMutations`, `useTodoMutations`, `TodoImportEntry`; subscribed by `Category` and `FloatingNavigatorContainer`.

(File list confirmed via the importers of `broadcastTodoSync`/`subscribeToTodoSync` and the category equivalents.)

### The paste-import **intent** channel (a ping with a different verb)

`paste-import-channel.ts` shares the ping shape but is semantically different: it is an **intent**, not a data-refresh. The Floating Navigator's Import button lives in its own window and _cannot reach into the `/home` window to open a dialog_. So it does two things together (`src/lib/paste-import-channel.ts:1-11`): calls the preload `focusMainWindow()` IPC to surface the primary `/home` task surface, **and** broadcasts `open-completed-import`. `/home`'s `CompletedImportEntry` subscribes and opens its paste-import dialog. Producer: `FloatingNavigator`. Subscriber: `CompletedImportEntry`. This is why it gets its own channel rather than overloading `todo-sync` — "refetch your todos" and "please open a dialog over there" are different verbs.

### Preferences — the stateful exception

`preferences-sync-channel.ts` breaks the ping pattern on purpose: it is **Redux middleware** that carries a **full `PreferencesState` snapshot**, wired into the store at `src/lib/redux/store.ts:104-105`. The reason for the difference is in the design itself: the ping channels only need _"something changed → invalidate"_, but preferences must apply an **exact copy** of the toggle state in every window. You cannot "invalidate and refetch" a `localStorage` preference — there is no server round-trip to refetch from — so the value must travel on the wire.

Carrying state across windows introduces two hazards a stateless ping never faces, and the middleware defends against both:

1. **The echo loop.** If applying an inbound preference re-broadcast it, two windows would ping-pong forever. The guard (`src/lib/preferences-sync-channel.ts:40-51, 107-156`): only **user-initiated `set*` actions** are in `BROADCASTABLE_ACTION_TYPES` — the sound, retention, and braindump toggles (`preferences/setCompletionSound`, `preferences/setSoundMoment`, `preferences/setRetainCompletedInList`, the braindump-font setters, … 10 in all). Inbound snapshots are applied via `hydratePreferences`, which is **deliberately excluded** from the broadcastable set — so applying a received value never echoes back out. Cross-window propagation and loop prevention live in the _same_ decision: which actions broadcast.

2. **Malformed payloads.** A snapshot from the wire is untrusted input, and it clears **two** gates before it can touch the store. First `isPreferencesSyncEnvelope` (`src/lib/preferences-sync-channel.ts:69-79`) confirms only the **wrapper** — the right type tag plus a `state` field — deliberately _not_ the inner values. Then the inner snapshot is validated and coalesced through the Zod SSoT, `PreferencesStateSchema.safeParse` (`:117`): a legacy payload is accepted with new fields **defaulted**, an out-of-range `soundVolume` is **clamped**, and wrong-typed junk (e.g. `completionSound: 'yes'`) is **rejected wholesale** so it never reaches `localStorage`. Only **after** a successful parse does a legacy-only payload (carrying `completionSound` but no `soundMoments`) get folded: `foldLegacyCompletionSoundIntoMoments` (`:124-130`) materializes the moment map from the raw legacy flag and **overrides** `soundMoments` on the parsed snapshot, mirroring the persisted `migratePersistedState` path (Part 4) so inbound and on-disk legacy data agree. Only that snapshot is dispatched via `hydratePreferences`. Zod (reject wrong types) guards the untrusted **wire**; deepMerge (preserve-and-fill) guards the trusted **persisted** blob — different tactics for different trust levels (see Part 4).

Like the pings, the middleware is SSR-safe: when `BroadcastChannel` is unavailable it returns a transparent pass-through (`preferences-sync-channel.ts:101-103`).

> **Adding a channel?** This page is the _why_. For the step-by-step recipe — copy the template, name the channel/event, broadcast at the mutation site, subscribe-and-clean-up in an effect, SSR-guard, and (for stateful channels) add the loop guard — follow [howto-add-sync-channel.md](./howto-add-sync-channel.md). The two easy-to-forget mistakes it guards against are skipping `channel.close()` and omitting the loop guard on a stateful channel.

---

## Part 4 — Two sync paths, two destinations (and how persisted state survives a version-up)

It is worth stating plainly that the two Redux slices sync **differently**, because they have different destinations:

| Slice              | Syncs to                   | Mechanism                              | Why                                        |
| ------------------ | -------------------------- | -------------------------------------- | ------------------------------------------ |
| `preferences`      | other **renderer windows** | `BroadcastChannel` (Part 3)            | toggles must match live across windows     |
| `electronSettings` | the **main process**       | IPC at startup (`ElectronStartupSync`) | dock/tray are OS state, reset every launch |

`ElectronStartupSync` (`src/components/electron/ElectronStartupSync.tsx`) pushes the persisted `hideAppIcon` / `showInMenuBar` values to the main process after Redux hydrates, so a toggle saved as ON doesn't "lie" after a restart (the dock policy and tray are runtime-only and reset at boot). Both slices still persist to the **same** `localStorage` blob; only their _sync targets_ differ. The Electron-facing detail lives in [explanation-electron-architecture.md](./explanation-electron-architecture.md) and [reference-electron.md](./reference-electron.md); what matters here is the shape of the rule — **renderer↔renderer is `BroadcastChannel`, renderer→OS is IPC.**

### How persisted preferences survive a version-up (deepMerge, migrate, defensive selectors)

Persisting Redux to `localStorage` in a **pre-launch repo where slices keep gaining fields** raises one hazard: a user who persisted an _older_ blob is missing whatever fields shipped since. Three layers handle it, and they must be kept distinct — they are not the same defense:

1. **`merge: deepMerge` (`store.ts:78`) — the version-up firewall.** On every rehydrate the reconciler recursively fills _missing_ nested fields from the current defaults while preserving every user-set value. So a field added after a user last persisted reads back its **default**, not `undefined` — an update never silently "reverts" a preference. The authoritative why is the source comment at `store.ts:47-67`; it also explains why deepMerge beats re-parsing the slice through Zod: deepMerge **preserves** the user's own data, where Zod would **reject the whole slice** (resetting everything) on a single wrong-typed field — the wrong trade-off for trusted on-disk data.
2. **`version` + `migrate` (`store.ts:76-77`) — one-time shape transforms.** Bumping `STORAGE_SCHEMA_VERSION` runs `migratePersistedState` **once** on the next rehydrate to transform _incompatible_ shapes (today: folding a legacy `completionSound` boolean into the `soundMoments` map). It **must stay total** — if `migrate` throws, the middleware wipes **all** persisted state.
3. **`?? DEFAULT` selectors (`preferencesSlice.ts:251-346`) — read-time backstop.** The preference selectors still coalesce `undefined` to a default, but with deepMerge filling fields upstream this is now **defense-in-depth**, not the primary field-drop guard it once was (in the older shallow-merge design it was the _only_ guard). It still covers a corrupt blob, a not-yet-deep-merged path, or a `| undefined` type seam, and it carries the legacy `completionSound`→`complete`-moment read migration.

Note the division of labor with the cross-window validator (Part 3): **deepMerge preserves-and-fills** trusted on-disk data, while **Zod rejects** untrusted wire data. Same goal — never surface `undefined` or junk into the UI — but opposite tactics, because persisted data is the user's own and a wire snapshot is not.

---

## Part 5 — Derive everything from one heatmap `Map`

A pattern that keeps the state surface small enough to be sync-able in the first place: **CoreLive does not fetch separate endpoints for streaks, weekly rollups, category trends, the monthly peak markers, or the heatmap colors.** All of them are **pure functions over the single `Map<string, HeatmapDay>`** the home page already loads through `useHeatmapData()` (`src/hooks/useHeatmapData.ts:46`).

The derived-stat functions, all in `src/lib`:

| Function                       | Returns                                           | Source                                 |
| ------------------------------ | ------------------------------------------------- | -------------------------------------- |
| `calcStreak`                   | current/longest streak, tier, shown-up-this-month | `src/lib/calc-streak.ts:120`           |
| `aggregateLastSevenDays`       | weekly totals + week-over-week trend              | `src/lib/aggregate-last-seven-days.ts` |
| `aggregateCategoryTrends`      | per-category WoW rollup                           | `src/lib/aggregate-category-trends.ts` |
| `aggregateYearInReview`        | year-scoped recap                                 | `src/lib/aggregate-year-in-review.ts`  |
| `calcMonthlyMaxDates`          | `Set` of per-month peak-day dates (the ◎ marker)  | `src/lib/calcMonthlyMaxDates.ts:47`    |
| `getHeatmapIntensityFromCount` | 0–4 temperature band for a cell                   | `src/lib/heatmap-intensity.ts:56`      |

Three conventions make this pattern hold together:

1. **No extra oRPC calls.** These are client-side math over data already in the cache, so adding a stat does not add a request, a loading state, or a thing to keep in sync across windows. The cache is the single source; the stats are views of it. `useHeatmapData` **memoizes** `dataByDate` on `data` identity (`useHeatmapData.ts:69-81`) specifically so each consumer doesn't get a fresh `Map` per render and bust the downstream `useMemo` dep keys (this referential-stability discipline is load-bearing — see the next subsection).

2. **Caller-supplied `today` for determinism.** Every date function takes `today: Date` as an explicit argument instead of reading the wall clock, and operates purely on `YYYY-MM-DD` **UTC** keys (`calc-streak.ts:120`, `shiftIsoDate.ts:24`). This makes them deterministic for tests and SSR, and **DST-safe by construction** — UTC has no DST. The keys deliberately match the heatmap's bucketing (`completedAt.toISOString().split('T')[0]`), so a function's output is always a valid `dataByDate` lookup key. The Year-in-Review tests use fake timers precisely to prove the auto-open gate ignores the wall clock and reads only its argument.

3. **A shared trend vocabulary.** Both the weekly and per-category aggregators classify a trend as one of `firstWeek` / `flat` / `new` / `percent` — `firstWeek` for a genuinely empty heatmap, `flat` for older-only activity, `new` to avoid a `+Infinity%` when the prior window was zero, `percent` otherwise. The vocabulary is **duplicated** across the two modules rather than shared, on purpose, so each can be unit-tested standalone (the comment in `aggregate-category-trends.ts` explains this).

### Referential stability is load-bearing — memoize derived collections

Deriving state cheaply (above) only stays cheap if each derivation is **referentially stable** across renders. A fresh `Map`/array built every render is correct by _value_ but a new reference by _identity_ — and the moment that identity feeds a `useEffect` dep or a downstream `useMemo` key, the dep churns every render. When the effect also calls `setState` with a not-`Object.is`-equal value, that churn becomes a **self-sustaining re-render loop**.

This is not hypothetical: it shipped and reached production. `TodoList` built `pendingTodosFromQuery = mapTodos(...)` — a new array each render — and fed it to a sync effect `useCycleEffect(() => setLocalPendingTodos(pendingTodosFromQuery), [pendingTodosFromQuery])`. New ref every render → dep always differs → `setState` → re-render → repeat (~4196 DOM mutations / 2 s on an _idle_ `/home`). The thread never pegged (the effect yields between passes), so it surfaced not as a freeze but as something subtler: the continuous concurrent re-render **starved App Router's low-priority navigation transition**, so clicking the sidebar fetched the destination RSC but **never committed** — the user-visible "Settings button does nothing / can't leave `/home`" bug (PR #105, 2026-06-24).

Three things worth carrying forward:

- **Memoize the derived collection at its source.** The fix `useMemo`s `pendingTodosFromQuery` and `categoryMap`, and hoists `mapTodos` to module scope so it isn't itself an effect dependency. `useHeatmapData` memoizes its `{ heatmapValues, dataByDate }` on `[data]` for exactly this reason (point 1 above) — TanStack Query's structural sharing keeps `data` referentially stable across refetches, so the memo holds.
- **Do not rely on the React Compiler for referential stability.** `reactCompiler: true` was enabled, yet the loop reproduced **identically** compiler-ON and compiler-OFF — the compiler _bailed_ on this component. Treat compiler memoization as an optimization, never a correctness guarantee; the origin regression was PR #102 dropping manual memos to "let the compiler handle it," and here it didn't.
- **The firebreak is the `setState` value, not the dep.** An unstable effect dep only _loops_ when the effect sets a fresh, non-equal value each pass. `setState(boolean)` / setState-to-the-same-primitive can't loop (React bails on `Object.is`) — which is why the heatmap consumers that key effects on `dataByDate` but only call `setOpen(boolean)` re-fire without self-sustaining. Regression-guarded by `e2e/web/sidebar-navigation.spec.ts`, which **clicks** the sidebar (not `goto`) and asserts the URL leaves `/home`.

### These functions encode product philosophy — don't "improve" the math

The thresholds here are **product decisions, not arbitrary constants**, and they are load-bearing. `heatmap-intensity.ts:1-13` states the invariant in the source: intensity is a pure function of the raw completion **count** — "temperature = pride", and pride scales with count. The count already includes **repetition** (doing the same task twice counts as two; repeats are XP and are **never deduplicated**), so the module only buckets a number; it must not add recency, streak, or category weighting. A separate CI invariant forbids the apex color from being GitHub-green, because this heatmap measures self-affirmation, not a contribution graph.

The authoritative "why" for all of these lives in [DESIGN.md](../../DESIGN.md) (Warm Cathedral, temperature = pride, no-dedup repetition-as-XP, the Year-in-Review fireside framing) and the related [explanation-completion-and-heatmap.md](./explanation-completion-and-heatmap.md) — which also explains _why completions are archived, not deleted_, the invariant that keeps the heatmap from being retroactively erased. The exact band boundaries and streak tiers are best read from the `*.test.ts` files next to each function, which hard-code the contract; this doc points there rather than transcribing volatile numbers.

---

## Part 6 — Two-tier error boundaries & Electron version-skew resilience

The last piece of cross-cutting client state is failure handling, and it has the same shape of reasoning: **a defense whose failure mode would defeat its own purpose.**

CoreLive has **two** App Router error boundaries:

| Boundary           | Catches                                                                                   | Self-contained?                         | Source                     |
| ------------------ | ----------------------------------------------------------------------------------------- | --------------------------------------- | -------------------------- |
| `error.tsx`        | throws **inside a page subtree**; keeps the shell                                         | No — uses shadcn `Card`, the app logger | `src/app/error.tsx`        |
| `global-error.tsx` | throws from the **root layout itself** / its providers; renders its own `<html>`/`<body>` | **Yes — deliberately dependency-free**  | `src/app/global-error.tsx` |

The reason there are two is stated in the `global-error.tsx` docstring (`src/app/global-error.tsx:3-21`): `error.tsx` **cannot** catch a throw from the root layout or its direct children (the Redux provider, `<ElectronStartupSync />`, the toaster) — those escalate past it. Without a `global-error.tsx`, they fall through to Next.js's stark built-in crash screen.

And `global-error.tsx` is **intentionally import-free** — no shadcn UI, no design tokens, no app logger, no `globals.css`. Every such import is a way for the **last line of defense to fail in exactly the situation it exists to catch**: a root-layout / provider / CSS failure re-triggering through the same import graph. So it uses inline token-free styles and a _local_, guarded `console.error` (`global-error.tsx:32-33, 93-101`) instead of the app's `useCycleEffect` + `log`. If you ever reach for a shared component or the design tokens in `global-error.tsx`, you are coupling the backstop to the thing it backstops.

### The Electron version-skew threat

A primary motivation for this two-tier design is **Electron preload version skew**, and it connects directly to `ElectronStartupSync`. The installed desktop app ships a **frozen preload bundle**, but it loads the **remote** `corelive.app` web bundle — which updates independently. So the running web code can call a preload method that the _installed_ app's preload doesn't have yet.

`ElectronStartupSync` defends against this by guarding on **method existence**, not just the namespace (`src/components/electron/ElectronStartupSync.tsx:95-120`):

```ts
// Guard on the METHOD, not just the `settings` namespace.
const settings = window.electronAPI?.settings
if (typeof settings?.setHideAppIcon !== 'function') return
reportSyncFailure(settings.setHideAppIcon(hideAppIcon), 'hideAppIcon')
```

The comment spells out the threat: calling `undefined()` on an older preload would throw a **synchronous `TypeError` out of the effect, past its own `.catch`** — and because this component lives in the **root layout**, that throw escapes `error.tsx` entirely and would hit the bare Next.js crash screen if `global-error.tsx` weren't there. Two further details make it robust: each setting syncs in its **own effect with its own guard**, so a missing `setShowInMenuBar` never suppresses the `setHideAppIcon` sync; and the guard is on the function, so a preload _reshuffle_ (not just an addition) is handled too.

This is the same lesson as the sign-out reset and the preferences validator: the dangerous case is the one where the safety net is the thing that breaks. The method-existence guard keeps a frozen preload from throwing, and `global-error.tsx` stays dependency-free so it can still render if something upstream of it does throw.

> This overlaps the project's "Electron preload version skew" memory note (guard on method existence; `error.tsx` is the route net). The durable takeaway: **never call a preload method behind only a namespace check** — `window.electronAPI?.settings.foo()` can throw a synchronous `TypeError` from a frozen preload; check `typeof settings?.foo === 'function'` first.

---

## What breaks if you violate these invariants

A quick map of "if a future engineer does X, Y regresses" — the most durable thing this page can leave you with:

- **Put server data in Redux** → two sources of truth, a fat persisted blob, and the cross-window sync story doubles (you'd have to broadcast the data, not just "refetch").
- **Replace the sign-out reset with `clear()`** → in-flight mutations leak user A's data into user B's cache on a shared device (`QueryClientProvider.tsx:98-143`).
- **Make a ping channel carry data** → you re-create duplicate state; the pings exist _because_ the receiver should refetch the server truth, not trust the wire.
- **Add a stateful channel without the loop guard** → infinite echo between windows; only `set*` actions may broadcast, and the apply action (`hydratePreferences`) must be excluded (`preferences-sync-channel.ts:40-51`).
- **Drop the channel's Zod validation** → wrong-typed wire junk gets hydrated and persisted; the inbound snapshot is gated by `PreferencesStateSchema.safeParse` (defaults / clamps / rejects), not the envelope shape-check alone (`preferences-sync-channel.ts:117`).
- **Feed an un-memoized derived `Map`/array into an effect dep or `useMemo` key** → an unstable dep drives a concurrent re-render loop that starves App Router navigation (the "Settings does nothing" bug); memoize derived collections at their source and don't trust the React Compiler for referential stability (`TodoList.tsx`, `useHeatmapData.ts:69-81`; regression guard `e2e/web/sidebar-navigation.spec.ts`).
- **Add recency/streak weighting to `heatmap-intensity`** → breaks "temperature = pride" and the no-dedup invariant ([DESIGN.md](../../DESIGN.md), `heatmap-intensity.ts:1-13`).
- **Import a UI component into `global-error.tsx`** → the last line of defense can fail through the same import graph it exists to catch (`global-error.tsx:3-21`).
- **Call a preload method behind only a namespace check** → a frozen preload throws a synchronous `TypeError` from the root layout, escaping `error.tsx` (`ElectronStartupSync.tsx:95-120`).

---

## See also

- [explanation-architecture.md](./explanation-architecture.md) — the provider tree, boot order, and the "Electron loads real routes" bet this page builds on.
- [explanation-electron-architecture.md](./explanation-electron-architecture.md) — the renderer→main-process IPC side (`electronSettings`, `focusMainWindow`).
- [explanation-completion-and-heatmap.md](./explanation-completion-and-heatmap.md) — why completions are archived not deleted; the heatmap invariant.
- [reference-frontend.md](./reference-frontend.md) — exact routes, providers, store hooks, slice fields, and component surface (point-to-source).
- [howto-add-sync-channel.md](./howto-add-sync-channel.md) — the step-by-step recipe for adding a cross-window channel.
- [DESIGN.md](../../DESIGN.md) — the product invariants the derived-stat functions encode.
