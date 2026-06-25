# Design Doc — #125 Freeze-safety for the native key-tap (GA gate)

> Design doc for issue **#125**. Follow-up to #111 / PR #126 (merged `eab43fd`).
> **v2 — rewritten after the Phase 0 probe.** v1 proposed isolating the tap in a
> `utilityProcess` child; **Phase 0 proved that path non-viable on macOS** (TCC gate
> PASSED, but a CGEventTap in a faceless helper delivers exactly one event then goes
> silent — a known macOS run-loop limitation). The plan now takes the **pre-authorized
> in-main FAIL branch**: keep the tap in main (the proven #126 baseline), and buy
> freeze-safety with a **brick-proof launch latch + powerMonitor/manual re-arm**, with
> structural isolation (AC#3) recorded as a **documented exception**. The Phase 0
> evidence and the v1/codex history are preserved below.
>
> **codex v2 review (gpt-5.x, high effort): `ready-with-changes`.** Its 9 findings —
> `setImmediate` (not microtask) + AC#3 "reduced not removed", **fsync** latch (file+dir,
> fail-safe), `reArm()` **attach-listeners-once**, **inactive** (not "chord") safe mode,
> `suspend`/`lock-screen` state-clear, **typed** re-arm IPC, scaffold-already-gone — are
> folded throughout and tagged `(codex #N)`.

## Context

PR #126 shipped lone-modifier global shortcuts (Right ⌥ alone, L/R distinct) behind
a userland libuiohook key-tap (`uiohook-napi`). Prove-out passed on a packaged arm64
build with Karabiner: Left ⌥ fired 25× over ~39s, no freeze. But the safety story
has a hole that GA-gates the feature: **the tap degrades to chord ONLY on two
catchable conditions — native module load-fail (`isAvailable()===false`) or
`register()` returning false.** A tap that loads, `start()`s, then _freezes or goes
silent_ is neither. libuiohook issue #23 ("1 event then frozen") is exactly this
mode on some setups. Because a lone-modifier bind re-arms the tap on every launch, a
user who freezes once re-freezes every relaunch — **bricked, no in-app recovery.**
That brick loop is the real GA blocker. Blast radius is bounded today only by opt-in
(default config binds no lone-modifier).

## What the codex review changed (v1 — preserved)

codex (gpt-5.5, high) pressure-tested the v1 draft and returned **needs-rethink**.
The load-bearing corrections, each **verified against source** before adoption, still
hold and shaped v2:

1. **Ping/pong does NOT detect a silent tap (P1).** A main→child ping/pong proves the
   **child process** is alive, not the **tap**. Verified in
   `node_modules/uiohook-napi/dist/index.js`: the `EventType` enum forwarded to JS is
   **only** key/mouse (4–11). libuiohook's `EVENT_HOOK_ENABLED`(1)/`DISABLED`(2) are
   **not** surfaced to JS, and `kCGEventTapDisabledByTimeout` is re-enabled+logged
   inside libuiohook, never delivered up. **There is no clean typed signal for "tap
   went silent."** This is _why_ silent-tap auto-detection is descoped (below), and it
   applies identically whether the tap runs in a child or in main.
2. **TCC attribution is a GATE, not a footnote (P1).** Whether the tap process rides
   CoreLive.app's existing Input-Monitoring grant decided whether the utilityProcess
   path was viable → it became **Phase 0**, blocking. **Result below.**
3. **`register()` is synchronous (P1).** In-main this is a non-issue — the engine is
   already synchronous (no child handshake to reconcile). The async-bridge complexity
   v1 carried is **deleted** in v2.
4. **There is no runtime degrade-to-chord path today (P1).** Still true; v2 defines an
   explicit degrade — but at the **boot/latch layer**, not a runtime silence-detector.
5. **Smaller (P2/P3):** main can still wedge via the `fire` callback (kept as a real
   hardening — fire-and-forget handler); watchdog false-positives; build wiring;
   prove-out must be redone on a signed build. Folded below.

## Current State (verified)

| Element        | Location                                                                  | Behavior                                                                                                                                                                                                                                                                           |
| -------------- | ------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Engine factory | `electron/uiohookEngine.ts`                                               | Lazy `start()` on first bind, `stop()` on last unbind; "pressed alone" press/release state machine; `ensureTapRunning()` returns false if `start()` throws → `register()` rolls back → degrade. **No detection of a tap that started then went silent/wedged.**                    |
| Loader         | `electron/utils/loadUiohook.ts`                                           | `require('uiohook-napi').uIOhook` (CJS runtime require).                                                                                                                                                                                                                           |
| Seam           | `electron/main.ts:838` `loadSystemIntegrationStack`                       | `const nativeShortcutEngine = createUiohookShortcutEngine(loadUiohook)` → `new ShortcutManagerCls(win, notif, config, nativeShortcutEngine)`. **This is the one injection point to wrap.**                                                                                         |
| Routing        | `ShortcutManager.registerShortcut` (477) → `registerNativeShortcut` (566) | `isNativeBinding()` routes `lone-modifier:*` to `nativeEngine.register()` (sync `boolean`); degrades only when `isAvailable()` false or `register()` false. `updateShortcuts` (984) re-registers; `initialize` (207) at startup; `cleanup` (1177) tears down.                      |
| Native module  | `uiohook-napi@1.5.5`                                                      | `start()` → `lib.start(handler)`. CGEventTap on a **native bg thread**; events cross to the **main JS thread** via a **non-blocking** napi_threadsafe_function (`src/lib/addon.c:20`, `napi_tsfn_nonblocking`). Singleton `uIOhook`. **No hook-disabled signal to JS** (verified). |
| Packaging      | `electron-builder.json`                                                   | `asarUnpack` includes `uiohook-napi/**` + `node-gyp-build/**`; `node-gyp-build` is a **direct** dep (asar leaf-drop guarded).                                                                                                                                                      |
| Signing        | `build/entitlements.mac.plist`                                            | `hardenedRuntime:true`, `disable-library-validation:true`. TCC (Input-Monitoring) is a runtime grant, NOT an entitlement → was **Phase 0**.                                                                                                                                        |

## Root cause — why a heartbeat-in-main is insufficient (verified)

Two distinct freeze modes, both verified against the threading model:

1. **Tap thread goes silent** (libuiohook #23 / OS disables the tap under load):
   main is NOT blocked; keydown/keyup just stop arriving. A passive event-heartbeat
   **cannot distinguish "frozen tap" from "idle user"** — both produce zero events,
   and (verified) uiohook-napi exposes no hook-disabled signal. This is the
   **degraded-feature** mode (shortcut stops; the app is otherwise fine).
2. **Main JS loop wedges** (a `fire` callback blocks the loop): hangs ALL windows. A
   watchdog timer living **on the same main loop cannot detect its own freeze**. This
   is the **catastrophic** mode.

v1 proposed `utilityProcess` isolation to structurally remove mode #2. **Phase 0
proved that path non-viable** (below), so v2 _bounds_ mode #2 instead of removing it —
honestly scoped as **low residual risk** (see AC#3 exception), and _bounds_ mode #1
with brick-proofing + recovery rather than claiming to auto-detect it.

---

## ✅ Phase 0 RESULT — TCC: PASS · utilityProcess isolation: NOT VIABLE (decided)

A gated (`CORELIVE_TCC_PROBE=1`) probe forked a `uiohook-napi` tap into a
`utilityProcess` child on a **signed, packaged arm64 build** and answered the two
open questions:

**(a) TCC attribution — ✅ PASS.** The child's CGEventTap rode **CoreLive.app's
existing Input-Monitoring grant**. System Settings → Privacy & Security → Input
Monitoring listed **only `CoreLive.app`** (toggle ON); **no** `CoreLive Helper` /
`corelive-uiohook` / `Electron` entry appeared, and no new TCC prompt fired. The child
runs as a standard NodeService helper under the app bundle and inherits its TCC
responsibility. The native `.node` prebuild loaded in the child (no `load-error`).
**The make-or-break gate passed** — TCC was never the blocker.

**(b) Delivery reliability — ❌ NOT VIABLE.** The child's tap delivered **exactly ONE
key event, then went permanently silent** (child stayed alive at ~0% CPU; real
physical keypresses produced zero further fires). This is **not** a fixable bug — it
is a **known macOS limitation**: a `CGEventTap` in a **faceless helper / utilityProcess
with no `NSApplication`/Cocoa main run loop** stops delivering events beyond the
initial setup (confirmed via deepwiki against the libuiohook/CGEventTap model).
libuiohook runs its own `CFRunLoopRun()` on a worker pthread, but that is **insufficient
in a non-GUI helper**. Synthetic key injection is an unreliable delivery vehicle on this
machine (Karabiner's virtual-HID layer transforms synthetic CGEvents), so it cannot prove
delivery _works_ — but it reproduces the same **1-then-silent ceiling**, which is the
point. The verdict that delivery FAILS holds for **real physical keys** too.

**Re-confirmed (2026-06-26, fresh signed re-run).** Relaunched the same signed
`com.corelive.app` build (`codesign`: `Developer ID Application: Ryota Murakami
(895TNMSCMH)`, hardened runtime; `app.asar` built 00:55, no builder running). The probe
forked the `utilityProcess` child, which loaded the native `.node` and posted
`{type:'started'}`. **15 key events (10×Right, 5×Escape) → exactly ONE `fire`
(keycode 57421), then silence for the remaining 14** — the 1-then-silent signature
reproduced. System Settings → Input Monitoring again listed **only `CoreLive.app`**
(enabled), **no new helper entry** (full list: CoreLive, Cursor, Discord, three Karabiner
items, KeyCue). So **TCC attribution = PASS** (independently re-verified) and **delivery =
NOT VIABLE** both hold across two independent runs (original real-key run + this signed
re-run). The pivot's foundation is solid.

**Decision (FAIL branch, pre-authorized in v1):** abandon `utilityProcess` isolation;
**keep the tap in main** (the proven #126 baseline) and deliver freeze-safety via the
launch latch + powerMonitor/manual re-arm. **AC#3 (structural isolation) becomes a
documented exception** — see below. This pivot is well-supported: empirical
(one-then-silent on a signed build) + deepwiki (known limitation) + the FFI/run-loop
mechanism is understood, not a mystery to chase.

---

> ## 🔻 DESCOPE NOTICE — AC#1 silent-tap auto-detection (decided, reversible)
>
> **Original AC#1** ("a tap that stops delivering events is auto-detected ≤3s and
> degrades to chord") is **descoped**. There is no clean signal for "tap went silent"
> (codex finding #1, verified), and the two ways to synthesize one are both dead:
> a **synthetic self-probe** injects fake keystrokes into the user's focused app
> (dangerous UX) **and** is unreliable on a Karabiner machine (Phase 0 proved synthetic
> injection gives 0 fires); a **silence timer** cannot tell "frozen tap" from "idle
> user." Cleanly detecting a silent tap would require **forking `uiohook-napi`** to
> surface `CGEventTapIsEnabled` + maintaining arm64/x64 prebuilds — heavy maintenance
> for a personal app, guarding the **least severe** mode (feature degrades; app fine).
>
> **Covered instead** by the most common real silent-death cause being handled blind
> (`powerMonitor` `resume`/`unlock-screen` re-arm) plus a manual "re-enable" affordance.
> The brick-proof latch does **NOT** cover silent-tap (codex #3 — it guards the
> arming-time brick loop only). **To restore auto-detection, say the word** and I'll scope
> the `uiohook-napi` fork as its own task. Veto point: the PR.

---

## Proposed Change — in-main freeze-safety (3 layers, no child)

The engine **stays in main** behind the existing `NativeShortcutEngine` interface, so
`ShortcutManager` is untouched at the call site. Three additive layers:

### Layer 1 — fire-and-forget dispatch (bound the catastrophic mode; AC#3 exception)

Structural isolation is **out** (Phase 0). The residual catastrophic-wedge surface
(mode #2) is **the `fire` callback on the main loop** — the one place main can block on
tap activity. Harden it:

- The main `keydown`/`keyup` handler does **no heavy synchronous work** — it updates the
  pressed-set and **schedules** the window toggle via **`setImmediate`** (NOT a microtask —
  a microtask still drains on the same tick), then returns. This **shrinks**, but does
  **not eliminate**, the main-thread wedge surface.
- **Honest scope (codex #1) — AC#3 is RISK-REDUCED, NOT REMOVED.** `setImmediate` only
  moves the toggle to the next main-loop tick; if `toggleBrainDump()` / window work itself
  hangs, the app still freezes. We do **not** claim "main cannot wedge through the tap."
  What IS true and bounds the risk: the tap runs on its **own native thread** dispatching
  via a **non-blocking** threadsafe function (`addon.c:20`), so a tap-thread stall degrades
  the **feature**, not the app; the CGEventTap is **active** (`kCGEventTapOptionDefault`),
  so a slow tap is **disabled by the OS on its own timeout**; the toggle work is light and
  the feature is opt-in (default binds nothing). The latch (Layer 3) catches an
  **arming-time** crash/wedge, **not** a later runtime freeze after the marker cleared.
  Net: the catastrophic mode is **reduced** to a small, opt-in surface without a child
  process — the documented exception, not a structural fix.

### Layer 2 — re-arm on the recoverable causes (no silence-detection)

No runtime silence-detector (descoped). Instead, **re-arm the tap on the events that
actually correlate with a tap going dead**, none of which need detection:

- **`reArm()` must attach listeners ONCE (codex #4 — critical).** Today
  `ensureTapRunning()` re-attaches `keydown`/`keyup` on **every** `start()`; a naive
  stop→start re-arm would **duplicate listeners → duplicate fires**. So the engine gains a
  `listenersAttached` guard (attach exactly once, ever) and a `reArm()` that **resets
  `pressedKeycodes` + `armedKeycode` before AND after** the `stop()`+`start()` cycle. A
  unit test asserts **10 reArms still fire exactly once**.
- **`powerMonitor` events (codex #5).** CGEventTaps commonly die across sleep/wake, and a
  modifier **held across sleep/lock** can leave a stale pressed-set. So: on **`suspend`**
  and **`lock-screen`** → clear the pressed-set state; on **`resume`** and
  **`unlock-screen`** → `reArm()` if a lone-modifier binding is active. (Skip
  display-change unless QA shows it matters.) Re-arming a healthy tap is a cheap no-op, so
  no false-positive risk.
- **Manual re-arm affordance (typed IPC — codex #7).** A user-facing "shortcut not
  responding? re-enable" control **reuses the existing typed shortcut IPC stack**
  (`ipc-schemas.ts` + `types/ipc.ts` + `typedHandle` + `preload.ts`), adding
  `shortcuts-reenable-native-tap` + `shortcuts-get-native-tap-status` — **not** ad-hoc
  `ipcMain.handle`. It calls the same `reArm()` and re-enables the binding — the recovery
  path for the residual silent-tap case (NOT covered by the latch; see Layer 3).
- **libuiohook's built-in re-enable (free, documented).** `input_hook.c:995` already
  calls `CGEventTapEnable(true)` on `kCGEventTapDisabledByTimeout`, so the **timeout**
  sub-case self-heals inside the native layer. **Gap (documented):**
  `kCGEventTapDisabledByUserInput` is **not** handled — but it fires only transiently
  (secure-input fields) and is covered by the manual re-arm. No code change here.

### Layer 3 — brick-proof launch latch (THE core fix; AC#2)

The real GA blocker is the **relaunch brick loop**. Fix it with a process-stability
latch in userData (a **SEPARATE file, NOT `config.json`**):

This is a **process-stability latch** (codex #2), **not** a tap-liveness latch: it breaks
a **wedge/crash brick loop**, and protects **only** against an arming-time crash/wedge — it
does **NOT** cover a `start()`-succeeds-but-tap-silent case (codex #3; that is accepted
degradation, recovered via Layer 2 re-arm). It is its **own** util (`nativeTapLatch.ts`),
**not** `ConfigManager.saveConfig()` — that uses temp+rename **without fsync**, too weak
for a launch-safety gate. Durable ordering (codex #2):

- **Read** the marker **before any tap start**. A **present or corrupt** marker ⇒ **block**
  (fail-safe).
- **Arm:** before `start()`, write temp JSON → **`fsync` the file** → `rename` → **`fsync`
  the userData dir**. If the arming write fails, **refuse to start** (never arm a tap whose
  brick-guard didn't persist).
- **Clear:** a **stability window** after a healthy `start()`, `unlink` the marker (`fsync`
  the dir so a stale marker can't false-block next launch). A wedge/crash before then ⇒ the
  clear-timer never runs ⇒ marker persists ⇒ next launch blocks.
- **Block path:** marker still set ⇒ **do NOT re-arm**; start the lone-modifier in
  **native-shortcut-inactive safe mode** (codex #6 — a lone modifier has **no chord
  equivalent**, so this is _inactive_, NOT "degrade to chord"; `registerNativeShortcut()`
  returning false already leaves it unregistered) + notify the renderer ("native shortcut
  disabled after a failed start — re-enable?"). One click (Layer 2 manual re-arm) re-arms +
  clears the latch. **Recovery never needs a `config.json` hand-edit.**

The degrade therefore lives **at the boot/latch layer** (latch trips → start the
lone-modifier **inactive**), not in a runtime silence-detector.

### AC#4 — signed re-prove

Rebuild signed+notarized; grant TCC once; verify on the packaged arm64 build: (a) the
in-main tap fires under the existing CoreLive.app grant (#126 baseline re-confirmed);
(b) a simulated unconfirmed prior run (pre-set latch marker) starts the lone-modifier in
**inactive safe mode** + notifies, and manual re-enable recovers; (c) `powerMonitor`
`resume`/`unlock-screen` re-arms (and `suspend`/`lock-screen` clears state) without a
window hang.

## Acceptance Criteria (v2, testable)

1. **(descoped — see notice)** Silent-tap auto-detection is **not** in scope. The
   silent-tap case (`start()` succeeds, tap goes dead) is **accepted degradation**,
   recovered via `powerMonitor` re-arm + manual re-enable **only** — the latch does NOT
   cover it (codex #3).
2. **A frozen/crashed tap never bricks on relaunch** — an unconfirmed prior arming starts
   the lone-modifier in **native-shortcut-inactive safe mode** (NOT a chord — codex #6);
   recovery is one click, no `config.json` hand-edit. Latch writes are fsync-durable and
   fail-safe (corrupt/missing-on-arm ⇒ block).
3. **(documented exception — RISK-REDUCED, not removed; codex #1)** The tap runs **in
   main**, not isolated. Mode #2 (catastrophic main wedge) is **reduced** by a
   `setImmediate` fire handler + the OS active-tap timeout + opt-in default, but is **not**
   structurally removed — a hang inside the toggle work itself still freezes main, and the
   latch only catches an arming-time wedge. _Phase 0 proved isolation non-viable on macOS._
4. **`reArm()` is listener-safe** (attach-once guard; 10 reArms fire once — codex #4) and
   fires on `resume`/`unlock-screen`; `suspend`/`lock-screen` clears the pressed-set — no
   window hang, no false-degrade (codex #5).
5. Re-proven on a **SIGNED** build (existing grant honored; latch blocks re-arm after an
   unconfirmed prior run; manual + power-event re-arm work).
6. Unit + Electron tests: latch arm/clear/block-on-relaunch + **corrupt-marker-blocks**;
   **reArm-attaches-listeners-once (10× → 1 fire)**; power-event re-arm/clear; manual
   re-arm IPC → re-arm + re-enable; fire handler schedules via `setImmediate` (no
   synchronous heavy work). **No regression to the chord path.**

## Testing Plan

| Layer                       | What                                                                                                                                                                                                                                                             | Count |
| --------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----- |
| Unit                        | latch arm(fsync)/clear/block-on-relaunch + **corrupt/missing marker ⇒ block**; **reArm attaches listeners ONCE → 10 reArms fire exactly once**; pressed-set reset on reArm; manual re-arm re-arms + clears                                                       | +~9   |
| Electron (vitest)           | `resume`/`unlock-screen` → `reArm()`; `suspend`/`lock-screen` → clear state; fire handler schedules via `setImmediate`; packaged `.node` real-load smoke; cleanup tears down                                                                                     | +~6   |
| Manual signed QA (codex #8) | packaged arm64 (drive app + computer-use, **real physical keys**): #126 baseline re-fires; **20 manual reArms → still fires once, no dup**; **sleep/wake + lock/unlock** re-arm; **latch-preseed boot → inactive safe mode + notify**, manual re-enable recovers | n/a   |

> **TEST IMPLICATION:** every unit/electron latch/re-arm test drives a **fake engine**
> (inject the state — "marker present", "resume fired", "10× reArm") — **never synthetic
> keys.** Synthetic injection cannot exercise the live tap on a Karabiner machine (Phase 0:
> at most 1-then-silent), so it is invalid as a unit vehicle. **Real physical keys are for
> the signed manual QA only** — and fake tests alone are insufficient (codex #8): they
> can't prove real `uiohook-napi` start→stop→start, listener duplication, TSFN cleanup, or
> wake/unlock, hence the signed-QA row.

## Build / Packaging

- **No new entry points.** v1's Phase 0 scaffolding (`electron/uiohookHost.ts`,
  `electron/utils/tccProbe.ts`, the `electron.vite.config.ts` `uiohookHost` input, the
  `main.ts` probe hook) was **already reverted** before this doc's commit (codex #9) — so
  the implementation step is just **verify no scaffold remains** (`git grep -i 'tccProbe\|uiohookHost'`
  ⇒ empty). Its finding (TCC PASS) is durable in this doc.
- The native `.node` stays `asarUnpack`'d and is loaded by the existing in-main loader
  (`loadUiohook.ts`); the packaged real-load smoke test guards the asar-leaf-drop class.

## Sequencing

In-main is **smaller** than v1 (no child, no IPC ready-handshake, no gen tokens, no
proxy). Single staged PR: (1) verify Phase 0 scaffold gone (already reverted); (2)
`setImmediate` fire handler + `listenersAttached` guard + `reArm()` + fsync latch; (3)
`powerMonitor` suspend/lock/resume/unlock + typed manual-re-arm IPC; (4) tests. A PR that
ships before the signed AC#4 proof is **risk-reduction, NOT the closed GA gate** — the GA
gate closes only on the signed re-prove. \*_Do not push a `v_` release tag until #125 lands

- signed re-prove.\*\*

## Rollback

Revert the PR. All three layers are additive behind the same `NativeShortcutEngine`
interface; the chord path is untouched. Worst case the lone-modifier feature reverts to
PR #126 behavior (opt-in, no freeze-safety) — no data risk.

## Effort (rough, v2)

Phase 0 ✅ done • remove scaffolding ~0.5h • fire-and-forget handler + latch ~2.5h •
powerMonitor + manual re-arm ~1.5h • tests ~2.5h • signed re-prove ~1.5h = **~8.5h**
(down from v1's ~12h — isolation, IPC, and gen-token machinery are gone).

## Files Reference

| File                                                           | Change                                                                                                                                                                                |
| -------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `electron/uiohookEngine.ts`                                    | `setImmediate` fire-and-forget keydown/keyup; **`listenersAttached` attach-once guard**; `reArm()` (stop+start, **reset pressed-set before+after**); latch arm/clear around `start()` |
| `electron/utils/nativeTapLatch.ts`                             | **NEW** — process-stability latch (separate userData file, NOT `config.json`); **fsync file + dir**, fail-safe (corrupt/missing ⇒ block)                                              |
| `electron/ShortcutManager.ts`                                  | boot: if latch blocks, start lone-modifier **inactive** + notify; manual-re-arm intake re-enables + clears latch                                                                      |
| `electron/main.ts`                                             | `powerMonitor`: `suspend`/`lock-screen` → clear state, `resume`/`unlock-screen` → `reArm()`; wire manual re-arm IPC + degrade→renderer                                                |
| `ipc-schemas.ts` · `types/ipc.ts` · `preload.ts`               | **typed IPC** (codex #7): `shortcuts-reenable-native-tap` + `shortcuts-get-native-tap-status` (reuse `typedHandle`, not ad-hoc `ipcMain`)                                             |
| Phase 0 scaffold (`uiohookHost.ts`, `tccProbe.ts`, vite input) | **already reverted** (codex #9) — implementation just verifies none remains                                                                                                           |
| `electron/__tests__/*`                                         | new specs per Testing Plan (fake engine; no synthetic keys)                                                                                                                           |

## Out of Scope

- **Structural utilityProcess isolation** (Phase 0 proved non-viable on macOS).
- **Silent-tap auto-detection via a `uiohook-napi` fork** (descoped; restorable on request).
- #124 side-distinct chords (lands after this).
- Windows/Linux (macOS-only app).
- Reworking the chord/globalShortcut path.

## Related

- #111 / PR #126 (feature, merged `eab43fd`) • #124 (side-distinct chords, after) •
  libuiohook #23 (1-event-then-frozen) • deepwiki: CGEventTap needs an active run loop
  (the Phase 0 (b) limitation).
