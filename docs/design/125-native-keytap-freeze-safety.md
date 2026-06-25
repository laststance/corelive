# Design Doc — #125 Freeze-safety for the native key-tap (GA gate)

> Design doc for issue **#125**. Follow-up to #111 / PR #126 (merged `eab43fd`).

## Context

PR #126 shipped lone-modifier global shortcuts (Right ⌥ alone, L/R distinct) behind
a userland libuiohook key-tap (`uiohook-napi`). Prove-out passed on a packaged arm64
build with Karabiner: Left ⌥ fired 25× over ~39s, no freeze. But the safety story
has a hole that GA-gates the feature: **the tap degrades to chord ONLY on two
catchable conditions — native module load-fail (`isAvailable()===false`) or
`register()` returning false.** A tap that loads, `start()`s, then _freezes or goes
silent_ is neither. libuiohook issue #23 ("1 event then frozen") is exactly this
mode on some setups. Because a lone-modifier bind re-arms the tap on every launch, a
user who freezes once re-freezes every relaunch — bricked, no in-app recovery.
Blast radius is bounded today only by opt-in (default config binds no lone-modifier).

## Current State (verified)

| Element        | Location                                                                  | Behavior                                                                                                                                                                                                                                                        |
| -------------- | ------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Engine factory | `electron/uiohookEngine.ts`                                               | Lazy `start()` on first bind, `stop()` on last unbind; "pressed alone" press/release state machine; `ensureTapRunning()` returns false if `start()` throws → `register()` rolls back → degrade. **No detection of a tap that started then went silent/wedged.** |
| Loader         | `electron/utils/loadUiohook.ts`                                           | `require('uiohook-napi').uIOhook` (CJS runtime require).                                                                                                                                                                                                        |
| Seam           | `electron/main.ts:838` `loadSystemIntegrationStack`                       | `const nativeShortcutEngine = createUiohookShortcutEngine(loadUiohook)` → `new ShortcutManagerCls(win, notif, config, nativeShortcutEngine)`. **This is the one injection point to wrap.**                                                                      |
| Routing        | `ShortcutManager.registerShortcut` (477) → `registerNativeShortcut` (566) | `isNativeBinding()` routes `lone-modifier:*` to `nativeEngine.register()`; degrades when `isAvailable()` false or `register()` false. `updateShortcuts` (984) re-registers on settings change; `initialize` (207) at startup; `cleanup` (1177) tears down.      |
| Native module  | `uiohook-napi@1.5.5`                                                      | `start()` → `lib.start(handler)`. libuiohook CGEventTap runs on a **native background thread**; events fire back onto the **main JS thread** via `EventEmitter.emit('keydown'/'keyup')`. Singleton `uIOhook`.                                                   |
| Packaging      | `electron-builder.json`                                                   | `asarUnpack` includes `uiohook-napi/**` + `node-gyp-build/**`; `node-gyp-build` is a **direct** dep (asar leaf-drop guarded).                                                                                                                                   |
| Signing        | `build/entitlements.mac.plist`                                            | `hardenedRuntime:true`, `disable-library-validation:true`, `entitlementsInherit` → **a utilityProcess child can load the `.node` prebuild.** TCC (Input-Monitoring) is a runtime grant, NOT an entitlement → see Open Risk.                                     |

## Root cause — why a heartbeat-in-main is insufficient

Two distinct freeze modes, both verified against the threading model:

1. **Tap thread goes silent** (libuiohook #23 / OS disables the tap under load):
   main is NOT blocked; keydown/keyup just stop arriving. A passive event-heartbeat
   **cannot distinguish "frozen tap" from "idle user"** — both produce zero events.
2. **Main JS loop wedges** (dispatch path or a callback blocks the loop): hangs ALL
   windows. A watchdog timer living **on the same main loop cannot detect its own
   freeze** — it's frozen too.

Only an **external observer** (a separate process) closes both holes. This confirms
the issue's stated preference: utilityProcess isolation is the structural fix, not a
nice-to-have.

## Proposed Change — three composed layers (not either/or)

### Layer 1 — utilityProcess isolation (structural; AC#3)

Move the tap into a `utilityProcess.fork`'d child (`electron/uiohookHost.ts`
entrypoint, built by electron-vite). The child owns libuiohook + the "pressed alone"
state machine and posts `{type:'fire', id}` to main over `parentPort`. The main-side
engine becomes a **thin proxy** implementing the SAME `NativeShortcutEngine`
interface (so `ShortcutManager` is untouched): `register/unregister` forward to the
child via `postMessage`; on `'fire'` it invokes the stored callback on the main loop.
A freeze in the child's tap thread OR its whole loop **cannot block main's windows**.

### Layer 2 — watchdog (detection + auto-degrade; AC#1)

Main pings the child every ~1s; child ponds. Miss N consecutive pongs (~3s budget)
OR `child-process-gone` fires → declare the tap dead: auto-degrade affected
lone-modifier binds to chord (or disable), notify renderer. Bounded respawn (e.g. 1
restart); if it re-freezes, stay degraded. The ping/pong is the **active liveness
probe** that mode-1 (silent tap) needs.

### Layer 3 — brick-proof launch latch (AC#2)

Before arming the tap on launch, write a small `native-tap-arming` marker to
userData (a SEPARATE file, NOT `config.json`, so a wedge can't corrupt config).
Clear it once the child proves liveness (first pong / first delivered event). On
launch, if the marker is still set from the previous run (= last launch armed and
never confirmed → it froze), **do NOT re-arm**: start the lone-modifier bind
disabled/probationary and surface an in-app notice with one-click re-enable.
Recovery never requires hand-editing `config.json`.

### AC#4 — signed re-prove

Rebuild signed+notarized; grant TCC once; verify (a) the tap fires from the utility
process under the **existing CoreLive.app** grant (no separate-helper re-grant),
(b) freeze injection (kill child / simulate hang) auto-degrades within ~3s with no
window hang, (c) the launch latch blocks re-arm after an unconfirmed prior run.

## Open Risk (for /plan-eng-review + codex to adjudicate)

**TCC attribution of a CGEventTap created inside a utilityProcess.** Entitlements
solve `.node` _loading_ (disable-library-validation + inherit), but Input-Monitoring
is a runtime TCC grant keyed by code-signing identity. If macOS attributes the
helper's tap to a separate helper identity needing its OWN grant, that's a UX
regression (user must re-grant) and breaks AC#4's "no re-grant" goal.

- **Mitigation to test first:** `disclaim:false` (default) keeps the child under the
  main app's responsibility; the helper inherits entitlements. Prove empirically on
  a signed build BEFORE committing to the structural path.
- **Fallback if infeasible:** keep the tap in main, but add (2) active-probe watchdog
  - (3) launch latch — closes AC#1/#2 but NOT structural AC#3 (a main-loop wedge
    stays uncatchable). Would need an explicit documented exception, since Node can't
    hard-kill a wedged thread cleanly.

## Scope / staging question (for codex)

- **(A) Monolith** — utilityProcess + watchdog + latch in one PR + signed re-prove.
  Recommended: #125 is the GA gate and AC#3 is structural.
- **(B) Stage** — PR1 watchdog+latch in-main (AC#1/#2), PR2 utilityProcess (AC#3).
  Lower risk/PR, but AC#3 can't be deferred past the release tag.

## Acceptance Criteria (from #125, made testable)

1. A tap that stops delivering events / becomes unresponsive is detected ≤~3s and the
   affected shortcut auto-degrades to chord (or disabled) — no window hang.
2. A frozen tap never bricks on relaunch; recovery needs no `config.json` hand-edit.
3. uiohook runs in a utilityProcess/worker so a tap freeze cannot block main at all.
4. Re-proven on a SIGNED build (TCC grant held by CoreLive.app, freeze auto-degrades,
   latch blocks re-arm).
5. Unit + Electron tests for: proxy register/unregister/fire, watchdog miss→degrade,
   child-gone→degrade, launch-latch arm/confirm/block. No regression to chord path.

## Testing Plan

| Layer             | What                                                                                                                                 | Count |
| ----------------- | ------------------------------------------------------------------------------------------------------------------------------------ | ----- |
| Unit              | proxy engine forwards register/unregister; 'fire' invokes callback; watchdog miss-count→degrade; latch arm/confirm/block-on-relaunch | +~8   |
| Electron (vitest) | fork host smoke (mocked uiohook), child-process-gone→degrade, updateShortcuts re-arm path, cleanup kills child                       | +~5   |
| Manual signed QA  | AC#4 a/b/c on packaged arm64 (drive packaged app, computer-use)                                                                      | n/a   |

## Rollback

Revert the PR. The engine proxy is additive behind the same `NativeShortcutEngine`
interface; chord path is untouched. Worst case the lone-modifier feature reverts to
PR #126 behavior (opt-in, no freeze-safety) — no data risk.

## Effort (rough)

~3h utilityProcess host + proxy engine • ~2h watchdog • ~1.5h launch latch • ~3h
tests • ~1.5h signed re-prove QA = **~11h**.

## Files Reference

| File                               | Change                                                                                                           |
| ---------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| `electron/uiohookHost.ts`          | NEW — utilityProcess entrypoint: owns uiohook + state machine, parentPort IPC                                    |
| `electron/uiohookEngine.ts`        | becomes/forks into the main-side PROXY engine (or new `uiohookProxyEngine.ts`); add watchdog ping/pong + degrade |
| `electron/utils/nativeTapLatch.ts` | NEW — launch latch read/arm/confirm in userData                                                                  |
| `electron/main.ts:838`             | wire proxy engine + pass a degrade→renderer notifier                                                             |
| `electron-builder.json`            | ensure `uiohookHost` entry packaged + asarUnpack still covers the native dep                                     |
| `electron/__tests__/*`             | new specs per Testing Plan                                                                                       |

## Out of Scope

- #124 side-distinct chords (lands after this).
- Windows/Linux (macOS-only app).
- Reworking the chord/globalShortcut path.

## Related

- #111 / PR #126 (feature, merged) • #124 (side-distinct chords, after) • libuiohook #23.
