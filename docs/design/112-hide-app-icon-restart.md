# Design Doc — #112 Hide App Icon holds across a Mac restart

> Design doc for issue **#112** ("Hide App Icon: CoreLive icon reappears in Dock
> and App Switcher after a Mac restart"). With **Hide App Icon: ON** and **Start
> at Login: ON**, the Dock icon and Cmd+Tab App Switcher entry come back after a
> macOS restart even though the toggle still reads ON — until the user flips it
> off/on again. The fix moves the dock-policy decision from a fragile renderer
> round-trip to a **main-process boot-time read**, so the saved choice is applied
> before any window (or icon) is shown.

## Context

`hideAppIcon` is a macOS-only setting: when ON, CoreLive removes itself from
the **Dock** and the **Cmd+Tab App Switcher** via
`app.setActivationPolicy('accessory')`. Today that setting lives **only on the
renderer side** — in Redux, persisted to `localStorage` via the storage middleware
(`src/lib/redux/slices/electronSettingsSlice.ts`), with a cloud mirror in Postgres
behind an auth-gated oRPC procedure (`src/server/procedures/electronSettings.ts`).
**Neither source is readable by the Electron main process at boot** (no
`localStorage`; the oRPC call needs an authenticated, loaded renderer).

The main process applies the policy only when the renderer tells it to. The wiring:

1. On every launch the macOS activation policy starts at `'regular'` (Dock icon +
   Switcher entry appear).
2. `src/components/electron/ElectronStartupSync.tsx` mounts **after** the renderer
   loads the **remote** `https://corelive.app/home` and Redux hydrates, then calls
   `settings:setHideAppIcon` over IPC.
3. The main handler (`electron/main.ts:1856`) calls
   `app.setActivationPolicy('accessory')` — runtime-only, **never persisted**.

## Root cause

The correction is a renderer→main round-trip gated on a **remote page load**. On a
cold **Start-at-Login** restart this is fragile in two ways the issue names:

- **The renderer may not load in time (or at all).** Right after login the network
  is often not ready; the remote URL is slow or fails, so `ElectronStartupSync`
  is delayed or never runs. The policy stays `'regular'` → the icon stays visible,
  while the toggle (read from the eventually-hydrated Redux) still shows ON.
- **A late `regular → accessory` flip leaves a stale Switcher entry.** Even when the
  sync does fire, flipping the policy _after_ the app has already registered as a
  regular foreground app can leave a stale Cmd+Tab entry on macOS.

The mechanism that was supposed to keep the toggle honest across restarts
(`ElectronStartupSync`) depends on the one thing a cold restart can't guarantee: a
timely remote renderer load.

## Design

Make the **main process** the source of truth at boot. Three small changes; the
existing renderer path stays as a live-toggle + defense-in-depth layer.

### 1. Persist `hideAppIcon` in `ConfigManager` (main-process, disk-backed)

`ConfigManager` already reads `~/Library/Application Support/CoreLive/config.json`
**synchronously** in its constructor and is the boot-time config the main process
trusts. Add one field to the `behavior` section (alongside `startOnLogin`, the
other native-behavior toggle in this same restart scenario):

- `BehaviorConfig.hideAppIcon: boolean`
- default `false` in `getDefaultConfig()` — matches the renderer default
  (`DEFAULT_ELECTRON_SETTINGS.hideAppIcon = false`) so a fresh install never flashes.

`behavior.hideAppIcon` over a new symmetric `electronSettings` section: only
`hideAppIcon` needs main-process persistence. `showInMenuBar` is renderer-only (the
tray is recreated at boot regardless) and `startAtLogin` is an OS login-item, not a
config value — so a mirror section would be one real field plus two dead ones.
(Open to plan-eng-review/codex pushing for the symmetric section; minimal scope is
the default.)

### 2. Persist on the toggle (`settings:setHideAppIcon`, `electron/main.ts:1856`)

After applying the policy, write the value through so the **next** boot can read it:

```ts
app.setActivationPolicy(hide ? 'accessory' : 'regular')
if (configManager) configManager.set('behavior.hideAppIcon', hide)
```

Stays inside the existing `process.platform === 'darwin'` guard (the field is only
meaningful on macOS; the Linux+xvfb E2E path remains a pure no-op). `configManager`
is guarded like the sibling `settings:setStartupConfig` handler.

### 3. Apply at boot, before any window (`createWindow` → `criticalInit`)

Immediately after `configManager = new ConfigManager()` (`electron/main.ts:950`) and
**before** the first `windowManager.openStartupPanel(...)` (`:1001`), read the
persisted value and apply the policy:

```ts
// Apply the persisted dock-icon policy BEFORE any window shows, so a hidden icon
// stays hidden across a cold Start-at-Login restart without waiting on the
// renderer's ElectronStartupSync round-trip (a REMOTE load that can be slow or
// never complete at login). Setting 'accessory' before the app activates a window
// also avoids the stale Cmd+Tab entry a later regular→accessory flip leaves. (#112)
if (process.platform === 'darwin' && resolveHideAppIcon(configManager)) {
  app.setActivationPolicy('accessory')
}
```

`resolveHideAppIcon(configManager)` is a tiny pure helper (one util, one
responsibility): `configManager.get('behavior.hideAppIcon') === true`. The **strict
`=== true`** matters (codex MAJOR) — `ConfigManager.get<boolean>` casts the raw JSON
value without validating it and `mergeWithDefaults` copies scalars verbatim
(`ConfigManager.ts:513,773`), so a hand-edited/corrupt `config.json` carrying the
string `"false"` (or `1`) would be truthy and wrongly hide the app. `=== true`
accepts only a real boolean true; everything else (missing, `"false"`, `0`, `1`)
resolves to "show". Extracted so the boot decision is unit-testable without Cocoa.

**Timing is post-ready, and the flash-vs-no-flash is empirical (codex CRITICAL).**
This placement is provably before the first `BrowserWindow` (the `open-url` early
handler only queues — `main.ts:326`; the first window is `openStartupPanel` →
`WindowManager.ts:1133`). What it is NOT provably before is macOS registering the
process as a `regular` app at/around `whenReady`: if AppKit already put the icon in
the Dock by the time `criticalInit` runs, a sub-second **flash** before `accessory`
takes effect is possible (and the still-`regular` window registration is the source
of the stale-Switcher symptom). The **persistent** reappearance the issue actually
reports is fixed regardless of this — main always converges to `accessory` at boot.
The flash/stale-entry is a Cocoa-timing question only the packaged-app native QA can
answer; if QA shows a flash, the escalation (a separate change) is to hoist the
config read **pre-`whenReady`** (top-level, `app.getPath('userData')` is available
before ready) and call `setActivationPolicy` there. Not pre-committing to that
complexity before QA evidence says it's needed — right-sized diff.

### API & timing (verified via context7 — Electron docs)

- `setActivationPolicy('accessory')` = "doesn't appear in the **Dock** and doesn't
  have a **menu bar**, but it may be activated … by clicking one of its windows."
  macOS's `NSApplicationActivationPolicyAccessory` is also what removes an app from
  the **Cmd+Tab Switcher** (only `regular`-policy apps appear there) — so a single
  call covers **both** symptoms the issue names. The existing handler already chose
  this API (more complete than `app.dock.hide()`); we only move _when_ it runs.
- Dock/activation APIs require the **ready** event. `criticalInit` runs inside
  `app.whenReady().then(...)`, so the placement is valid; it cannot move before
  `whenReady`.

## Known limitation — the seed is inherently renderer-driven (document, don't fix)

Main **cannot self-seed**: it can't read `localStorage`/the DB, so the only thing
that ever writes `behavior.hideAppIcon` into `config.json` is the IPC handler — which
fires from the renderer. Consequence for an **existing user upgrading** with
`hideAppIcon=ON` (value only in localStorage, not yet in config):

- First boot on the new build: `config.json` has no key → merge fills `false` → main
  does nothing → icon appears (unchanged from today).
- The first normal session with the network up runs `ElectronStartupSync` → the
  handler seeds `config.json` → **every restart after that is fixed**.

So the fix is **self-healing after one good session**, not retroactive on the very
first post-upgrade boot. This is architectural (no localStorage in main), narrow,
and does not block shipping — but it **dictates QA sequencing**: seed config first,
then test the cold-boot path, or you'll misread the unseeded first-boot as a failure.

## Renderer ⇄ main precedence — the hydration race (codex MAJOR)

`ElectronStartupSync` re-pushes the renderer's value over IPC after the page loads
(`setHideAppIcon`), so the question is: can a stale **pre-hydration default `false`**
push fight main's boot `accessory` and flip the icon back on? Tracing the actual
machinery says no in practice:

- **Designed precedence:** main is the authority at boot (it applies config before
  any window); the renderer push is idempotent re-confirmation (`setActivationPolicy`
  is a no-op when re-applying the same policy) and the live-toggle path. They agree
  in steady state because the IPC handler writes **both** config and (already) Redux.
- **Why a stale pre-hydration push doesn't bite in practice.** The store's
  `initialState` is `hideAppIcon: false`; localStorage is applied by
  `@laststance/redux-storage-middleware`, which schedules its rehydrate as a
  **microtask** at store init (`Promise.resolve().then(() => api.rehydrate())`,
  `dist/index.mjs:633`) merging with the synchronously-imported `deepMerge`
  (`store.ts:78`). In production the store is created at **module-load**, far before
  React's first commit, so that microtask resolves before `ElectronStartupSync`'s
  mount effect runs — its first run reads the hydrated value and pushes the correct
  one. This is **pre-existing renderer behavior, unchanged by this PR** (the
  renderer-only code already pushed on mount), and no launch flash has been reported.

`useCycleEffect` is kept deliberately (NOT swapped to `useUpdateEffect`): the
mount-run is what **seeds** `config.json` for an unseeded existing user (the §Known-
limitation path); `useUpdateEffect` would skip it whenever hydration beats mount and
re-open the seed gap. And even if the microtask ordering ever inverted (mount effect
before rehydrate — reproducible only in a same-tick unit harness, not in the
module-load production bootstrap), the result is a transient `hidden → visible →
hidden` that converges to `accessory`, **identical to today's accepted launch
behavior** (today the icon starts `regular`/visible and the renderer hides it
post-load). What this PR adds on top is the guarantee that the **pre-renderer boot
state** is already correct — which is the actual #112 failure. A faithful unit test
of the microtask-vs-mount ordering isn't possible (a co-located
`configureStore()`+`render()` has no microtask checkpoint between them, so it can't
reproduce the module-load gap without becoming tautological); the existing
`ElectronStartupSync.test.tsx` instead locks that the component pushes the persisted
value once hydrated, and the boot guarantee is proven main-side by the ConfigManager
round-trip test.

## Scope

- **In:** `hideAppIcon` (Dock + Switcher) only.
- **Out / latent:** `showInMenuBar` has the same renderer-round-trip shape but the
  issue doesn't report it failing (the tray is cheap to recreate at boot); left as a
  known-latent follow-up, not expanded here.
- **Kept:** `ElectronStartupSync` stays — it's the live in-session toggle path and a
  redundant re-confirm once the renderer loads. Its module doc gets a one-line note
  that main now bootstraps `hideAppIcon` at boot.
- The DB oRPC mirror (`electronSettings.ts`) is **orthogonal**: another renderer-side
  source, equally unavailable during the bug condition; main's config is independent
  of it.

## Testing

Automated (runs in CI — Linux+xvfb, no Cocoa):

- **ConfigManager round-trip** (electron vitest): `behavior.hideAppIcon` defaults to
  `false`; `set('behavior.hideAppIcon', true)` persists and a fresh `ConfigManager`
  reads it back `true` (proves boot-time read works across process restarts); an
  existing config WITHOUT the key merges to `false` (no migration needed —
  `mergeWithDefaults` fills it).
- **`resolveHideAppIcon` unit** (codex MAJOR — full truth table): `true` when config
  is real boolean `true`; `false` for **missing**, `false`, the string `"false"`,
  `0`, and `1` (proves the strict `=== true` guard against corrupt scalars).
- **Persist round-trip = the handler's contract** (electron vitest): the handler
  writes via `configManager.set('behavior.hideAppIcon', hide)`, so the ConfigManager
  round-trip above (set `true` → reload → reads `true`; set `false` → reads `false`)
  is the meaningful coverage of "the toggle persists for the next boot". Matches the
  codebase convention of testing the unit (`SystemTrayManager.setMenuBarVisible`),
  not the thin IPC wrapper.
- The existing **`ElectronStartupSync.test.tsx`** already locks that the renderer
  pushes the persisted `hideAppIcon`/`showInMenuBar` once hydrated and re-syncs on a
  runtime toggle — the renderer half of the precedence stays covered.

> **Honest coverage gaps** (no harness, closed by native QA): (a) the boot **ordering**
> (apply-before-`openStartupPanel`) is structural in `main.ts` — the existing main
> tests are manager-level (`main-process.test.mjs` reimplements managers, never drives
> real `createWindow`), so building a real-boot harness is disproportionate; the
> network-blocked relaunch QA confirms the icon is hidden at boot. (b) the **Cocoa**
> Dock/Switcher visibility and any launch **flash** are not reachable on Linux+xvfb.
> Both are covered by the native macOS QA below, per the issue's QA note.

Native macOS QA (packaged app, driven locally — see CLAUDE.md "Electron Native QA"):

1. `pnpm electron:build:dir && open dist/mac/CoreLive.app`.
2. **Seed** the setting: Settings → Hide App Icon **ON**; confirm
   `behavior.hideAppIcon: true` in `~/Library/Application Support/CoreLive/config.json`.
3. **Decisive test (no Mac restart needed):** quit CoreLive, **block the network**
   (so the remote renderer can't load — the bug's real failure condition), relaunch
   the packaged app. Confirm the Dock icon is **absent at boot** _and_ CoreLive is
   **absent from Cmd+Tab** — proving main applied the policy independent of the
   renderer. Verify motion/no-flash by video frames if a launch flash is suspected.
4. Toggle OFF → relaunch → icon and Switcher entry **return** (no over-correction).
5. **Flash check (codex CRITICAL):** record the relaunch with video and extract
   frames (global rule — stills/`getComputedStyle` can't show a flash); confirm the
   Dock icon never appears, even for one frame. If a flash IS present, that's the
   signal to escalate to the pre-`whenReady` hoist noted in §Design.3.
6. **Login-item path (codex MAJOR):** enable Start-at-Login, quit, and relaunch via
   the login item (`open -g` / the LaunchServices login-item launch, not a Finder
   double-click) to exercise the real Start-at-Login timing as closely as possible
   without a full reboot.
7. **Real Mac restart** (literal repro) is deferred to the user — a full restart is
   disruptive to the live session and is the user's machine to reboot; steps 3–6
   exercise the identical main-process boot path (fresh process → policy reset to
   `regular` → main reads config → `accessory`).

## Files touched

- `electron/ConfigManager.ts` — `BehaviorConfig.hideAppIcon` + default.
- `electron/main.ts` — boot-time apply in `criticalInit`; persist in
  `settings:setHideAppIcon`.
- `electron/utils/resolveHideAppIcon.ts` (new) — pure `=== true` boot-decision helper.
- `src/components/electron/ElectronStartupSync.tsx` — one-line doc note (no behavior
  change; `useCycleEffect` kept, see §Renderer ⇄ main precedence).
- Tests: `electron/__tests__/ConfigManager.hide-app-icon.test.ts` (default + persist
  round-trip + merge-without-key) and `electron/__tests__/resolveHideAppIcon.test.ts`
  (strict `=== true` truth table).

## GSTACK REVIEW REPORT

| Run                             | Status   | Findings                                                                                                                                                                                           |
| ------------------------------- | -------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| advisor (pre-design)            | absorbed | seeding gap must be documented + dictates QA sequencing; network-block is the decisive QA; verify `setActivationPolicy` semantics via context7; rule out the DB oRPC procedure as a competing seed |
| context7 (`/electron/electron`) | absorbed | `accessory` removes Dock + menu bar; `NSApplicationActivationPolicyAccessory` also drops the Cmd+Tab entry; dock/activation APIs need `whenReady`                                                  |
| codex (`codex exec`, read-only) | absorbed | 1 CRITICAL + 4 MAJOR (below)                                                                                                                                                                       |

**codex findings → resolution:**

- **CRITICAL — post-ready may be after macOS Dock/Switcher registration.** Accepted
  as an EMPIRICAL question. The persistent reappearance (the issue) is fixed
  regardless; the flash/stale-entry is gated by native QA (video frames + login-item
  path), with a documented pre-`whenReady` escalation if QA shows a flash. No
  pre-commit to that complexity without evidence (right-sized diff).
- **MAJOR — renderer/main flip-flop winner undesigned.** Designed precedence
  documented: main is authoritative at boot, the renderer push is idempotent. The
  stale-pre-hydration-push doesn't bite because the production store is created at
  module-load (rehydrate microtask resolves before the mount effect); it's
  pre-existing renderer behavior this PR doesn't change, and even an inverted ordering
  converges to `accessory` (identical to today's launch). `useCycleEffect` kept (it
  seeds config). A faithful unit test of the ordering isn't possible (same-tick
  `configureStore()`+`render()` has no microtask gap → tautological); existing
  `ElectronStartupSync.test.tsx` covers the once-hydrated push, boot is proven
  main-side.
- **MAJOR — `resolveHideAppIcon` weak to corrupt config.** Adopted strict `=== true`;
  unit truth table covers missing/`"false"`/`0`/`1`.
- **MAJOR — tests/QA don't close the boot-ordering + login-item risk.** Persist is
  covered by the ConfigManager round-trip (the handler's real contract); boot
  **ordering** + Cocoa visibility have no unit harness (main tests are manager-level)
  so they're closed by native QA, which gains a **video flash check** and a
  **login-item launch** step.
- **NIT — helper should strict-boolean.** Folded into the strict `=== true` above.

**VERDICT: design APPROVED with codex findings absorbed.** Scope held to `hideAppIcon`
(Dock + Switcher); `showInMenuBar` left as documented latent. Implementation may
proceed on `feat/112-hide-app-icon-restart`.

NO UNRESOLVED DECISIONS
