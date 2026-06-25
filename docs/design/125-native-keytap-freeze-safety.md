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
> **Covered instead** by the most common real silent-death cause being handled
> blind (powerMonitor `resume` re-arm), a manual "re-enable" affordance, and the
> brick-proof latch. **To restore auto-detection, say the word** and I'll scope the
> `uiohook-napi` fork as its own task. Veto point: the PR.

---

## Proposed Change — in-main freeze-safety (3 layers, no child)

The engine **stays in main** behind the existing `NativeShortcutEngine` interface, so
`ShortcutManager` is untouched at the call site. Three additive layers:

### Layer 1 — fire-and-forget dispatch (bound the catastrophic mode; AC#3 exception)

Structural isolation is **out** (Phase 0). The residual catastrophic-wedge surface
(mode #2) is **the `fire` callback on the main loop** — the one place main can block on
tap activity. Harden it:

- The main `keydown`/`keyup` handler does **no heavy synchronous work** — it updates the
  pressed-set and **schedules** the window toggle (e.g. `setImmediate`/microtask), then
  returns. Main cannot wedge _through_ the tap.
- This is cheap and is the entire cost of dropping isolation. **Residual risk is LOW
  and is documented (AC#3 exception):** the tap runs on its **own native thread** and
  dispatches via a **non-blocking** threadsafe function (`addon.c:20`), so a tap-thread
  stall degrades the **feature**, not the app; and the CGEventTap is an **active**
  listen-and-dispatch tap (`kCGEventTapOptionDefault`), so a slow tap is **disabled by
  the OS on its own timeout**, it does not freeze the system. With the fire handler
  non-blocking and the feature opt-in (default binds nothing), the catastrophic mode is
  bounded without a child process.

### Layer 2 — re-arm on the recoverable causes (no silence-detection)

No runtime silence-detector (descoped). Instead, **re-arm the tap on the events that
actually correlate with a tap going dead**, none of which need detection:

- **`powerMonitor` `resume` → re-arm.** CGEventTaps commonly die across sleep/wake. On
  `resume`, if a lone-modifier binding is active, **stop + start** the tap (full
  re-arm). This handles the single most common real-world silent-death cause **blind**,
  with no false-positive risk (re-arming a healthy tap is a no-op cost).
- **Manual re-arm affordance.** A user-facing "shortcut not responding? re-enable"
  control (renderer → IPC → engine) does the same stop+start and re-enables the binding.
  This is the recovery path for the residual silent-tap case the latch doesn't cover.
- **libuiohook's built-in re-enable (free, documented).** `input_hook.c:995` already
  calls `CGEventTapEnable(true)` on `kCGEventTapDisabledByTimeout`, so the **timeout**
  sub-case self-heals inside the native layer. **Gap (documented):**
  `kCGEventTapDisabledByUserInput` is **not** handled — but it fires only transiently
  (secure-input fields) and is covered by the manual re-arm. No code change here; we
  rely on and document existing behavior.

### Layer 3 — brick-proof launch latch (THE core fix; AC#2)

The real GA blocker is the **relaunch brick loop**. Fix it with a process-stability
latch in userData (a **SEPARATE file, NOT `config.json`**):

- **Arm:** before starting the tap, write a `native-tap-arming` marker to userData.
- **Clear:** a short **stability window** after a successful `start()`, if the process
  is still alive and responsive, clear the marker. (Honest semantics — codex finding #2:
  this is a **process-stability latch**, not a tap-liveness latch; it exists to break a
  **wedge/crash brick loop** and is named accordingly. A wedge or crash during/just
  after arming means the clear-timer never runs → marker persists.)
- **Block:** on launch, if the marker is **still set** from last run (armed, never
  confirmed → last launch crashed/wedged during arming), **do NOT re-arm the tap** —
  start with the lone-modifier binding **inactive (chord-only safe mode)** and notify
  the renderer ("native shortcut disabled after a failed start — re-enable?"). The user
  recovers with one click (Layer 2 manual re-arm), which re-arms + clears the latch.
  **Recovery never needs a `config.json` hand-edit.**

"Degrade-to-chord" therefore lives **at the boot/latch layer** (latch trips → start
chord-only), not in a runtime silence-detector. That is the entire degrade mechanism.

### AC#4 — signed re-prove

Rebuild signed+notarized; grant TCC once; verify on the packaged arm64 build: (a) the
in-main tap fires under the existing CoreLive.app grant (#126 baseline re-confirmed);
(b) a simulated unconfirmed prior run (pre-set latch marker) starts chord-only +
notifies, and manual re-enable recovers; (c) `powerMonitor resume` re-arms without a
window hang.

## Acceptance Criteria (v2, testable)

1. **(descoped — see notice)** Silent-tap auto-detection is **not** in scope. The
   silent-tap case is covered by powerMonitor re-arm + manual re-enable + the latch.
2. **A frozen/crashed tap never bricks on relaunch** — an unconfirmed prior arming
   starts chord-only safe mode; recovery is one click, no `config.json` hand-edit.
3. **(documented exception)** The tap runs **in main**, not isolated. Mode #2
   (catastrophic main wedge) is **bounded** by a non-blocking fire handler + the OS
   active-tap timeout + opt-in default, and the residual risk is documented as LOW —
   **not** structurally removed. _Phase 0 proved isolation non-viable on macOS._
4. **`powerMonitor resume` re-arms** the tap when a lone-modifier binding is active,
   with no window hang and no false-degrade.
5. Re-proven on a **SIGNED** build (existing grant honored; latch blocks re-arm after an
   unconfirmed prior run; manual + resume re-arm work).
6. Unit + Electron tests: latch arm/clear/block-on-relaunch; powerMonitor-resume →
   re-arm; manual re-arm IPC → re-arm + re-enable; fire handler is non-blocking
   (schedules, doesn't block). **No regression to the chord path.**

## Testing Plan

| Layer             | What                                                                                                                                                            | Count |
| ----------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----- |
| Unit              | latch arm writes marker; stability-window clears it; marker-present-on-boot → engine NOT armed + binding inactive + notify; manual re-arm path re-arms + clears | +~7   |
| Electron (vitest) | powerMonitor `resume` → engine `stop()`+`start()`; fire handler schedules (no synchronous heavy work); packaged `.node` real-load smoke; cleanup tears down     | +~5   |
| Manual signed QA  | AC#4 a/b/c on packaged arm64 (drive packaged app, computer-use): #126 baseline re-fires; pre-set latch → chord-only + notify; resume re-arm                     | n/a   |

> **TEST IMPLICATION:** every latch/re-arm test drives a **fake engine** (inject the
> state — "marker present", "resume fired") — **never synthetic real keys.** Synthetic
> key injection cannot exercise the live tap on a Karabiner machine (Phase 0 proved 0
> fires), so it is invalid as a test vehicle. Real keys are for the signed manual QA only.

## Build / Packaging

- **No new entry points.** v1's `utilityProcess` child host
  (`electron/uiohookHost.ts`), the `electron.vite.config.ts` `uiohookHost` input, and
  the Phase 0 probe (`electron/utils/tccProbe.ts` + the `main.ts` probe hook) are
  **removed** in implementation — they were Phase 0 scaffolding and their finding
  (TCC PASS) is now durable in this doc.
- The native `.node` stays `asarUnpack`'d and is loaded by the existing in-main loader
  (`loadUiohook.ts`); the packaged real-load smoke test guards the asar-leaf-drop class.

## Sequencing

In-main is **smaller** than v1 (no child, no IPC, no ready-handshake, no gen tokens, no
proxy). Single staged PR: (1) remove Phase 0 scaffolding; (2) fire-and-forget handler +
latch; (3) powerMonitor + manual re-arm; (4) tests. A PR that ships before the signed
AC#4 proof is **risk-reduction, NOT the closed GA gate** — the GA gate closes only on
the signed re-prove. **Do not push a `v*` release tag until #125 lands + signed re-prove.**

## Rollback

Revert the PR. All three layers are additive behind the same `NativeShortcutEngine`
interface; the chord path is untouched. Worst case the lone-modifier feature reverts to
PR #126 behavior (opt-in, no freeze-safety) — no data risk.

## Effort (rough, v2)

Phase 0 ✅ done • remove scaffolding ~0.5h • fire-and-forget handler + latch ~2.5h •
powerMonitor + manual re-arm ~1.5h • tests ~2.5h • signed re-prove ~1.5h = **~8.5h**
(down from v1's ~12h — isolation, IPC, and gen-token machinery are gone).

## Files Reference

| File                               | Change                                                                                                         |
| ---------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| `electron/uiohookEngine.ts`        | fire-and-forget keydown/keyup handler; expose a `reArm()` (stop+start); latch arm/clear around `start()`       |
| `electron/utils/nativeTapLatch.ts` | **NEW** — process-stability launch latch read/arm/clear in userData (separate file, NOT `config.json`)         |
| `electron/ShortcutManager.ts`      | boot: if latch blocks, start lone-modifier inactive + notify; manual-re-arm intake re-enables + clears latch   |
| `electron/main.ts`                 | `powerMonitor.on('resume')` → re-arm; remove the Phase 0 probe hook; wire manual re-arm IPC + degrade→renderer |
| `electron/uiohookHost.ts`          | **DELETE** — v1 utilityProcess child host (Phase 0 scaffolding)                                                |
| `electron/utils/tccProbe.ts`       | **DELETE** — Phase 0 gated probe launcher                                                                      |
| `electron.vite.config.ts`          | **REVERT** — remove the `uiohookHost` main input                                                               |
| `electron/__tests__/*`             | new specs per Testing Plan (fake engine; no synthetic keys)                                                    |

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
