# Settings Regrouping + Floating Navigator Shortcut — Design Doc

> Office-hours output (design only — no code yet). Date: 2026-06-24.
> Source request (Raphtalia, voice input): "Web と Electron の Preference 画面の項目がぐちゃぐちゃ → 正しくグルーピング。Brain Dump にショートカット設定がないので BrainDump と同じ仕組みのものを追加。Web の Preference に Electron 専用項目が出ていたら削除。"

## 0. Resolved decisions (asked & answered)

| #   | Decision                                                                  | Choice                                                                                            | Why                                                                                                                                                    |
| --- | ------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| D1  | Where does the "shortcut config like BrainDump's" go?                     | **A — add an inline toggle-shortcut to Floating Navigator, mirroring BrainDump's mechanism**      | BrainDump already has one (`BrainDumpSettings.tsx:326`); the window that genuinely lacks it is Floating. "同じ仕組み" = replicate BrainDump's pattern. |
| D2  | The BrainDump appearance prefs sitting in always-visible web Preferences? | **A — consolidate ALL BrainDump prefs into one Electron-gated card; remove from web Preferences** | `/braindump` is not linked in web nav (effectively an Electron feature); the editor still consumes the prefs, so move-not-delete.                      |

> **D2 consequence, stated explicitly (informed call):** "move-not-delete" means a **web-only** user loses the _ability to configure_ BrainDump font / size / text-color (the editor still reads them, so they keep consuming the stored/default values — nothing breaks, they just can't change them from the web). This is acceptable because `/braindump` is effectively Electron-only (unlinked in web nav), which is exactly why D2=A was chosen — recording it here so the capability loss is a deliberate decision, not an implied side-effect.
>
> **Engineering review (2026-06-24):** this design passed `/plan-eng-review`. All architecture / code-quality / test / scope decisions, the two **build-now scope expansions** (§6d keep-on-top cross-window sync, §6e shortcut conflict-substitution fix), the required-output sections, and the implementation task list are appended in the **ENGINEERING REVIEW** section at the end of this doc. The **GSTACK REVIEW REPORT** (final section) is the authoritative status. Where the review overrides an office-hours lean (notably §6b sub-decision #6), the review wins.

## 1. Problem — why it reads as "ぐちゃぐちゃ"

Current `/settings` composition (`src/app/settings/page.tsx`): `SettingsBackButton` → `PreferencesSettings` (web-common) → `ThemeSelector` → `ElectronSettingsPage` (null on web).

Four concrete mess symptoms:

1. **`PreferencesSettings` crams three unrelated concerns in one card** — the 居残りモード toggle (`retainCompletedInList`), the Sound group, and the BrainDump appearance group. The 居残り toggle **floats with no group header** at all.
2. **BrainDump settings are split across two locations** — appearance (font family/size, text color, clear-on-complete) lives in the web-common `PreferencesSettings`; behavior (opacity, sync mode, toggle shortcut) lives in the Electron `BrainDumpSettings`. BrainDump effectively appears **twice**.
3. **Theme is sandwiched** between web prefs and Electron cards, so "appearance" is scattered.
4. **Three orphaned components** exist — `ShortcutSettings.tsx`, `NotificationSettings.tsx`, `WindowStateSettings.tsx` (see §5).

## 2. Key architectural finding (changes the effort estimate for D1)

The "BrainDump shortcut mechanism" is **not** a standalone `globalShortcut` registration. It is a thin facade over the already-live `ShortcutManager`:

- `ShortcutManager` is **live** — lazy-loaded at `electron/main.ts:833`. It owns the real `globalShortcut` registrations, including **`toggleFloatingNavigator`** (Cmd+3 → `windowManager.toggleFloatingNavigator()`, `main.ts:1142`) and `toggleBrainDump` (`main.ts:1372/1378`).
- BrainDump's "inline shortcut" handler (`main.ts:1470-1491`) does two things: (a) `shortcutManager.updateShortcuts({ toggleBrainDump: accelerator })` with rollback on conflict, and (b) mirrors the value to `configManager.set('braindump.shortcut', accelerator)` for read-back + tray display.
- The tray accelerator provider (`main.ts:844-851`) **already reads `toggleFloatingNavigator`** — so a Floating shortcut shows in the tray with zero new tray wiring.

**Consequence:** D1=A is lighter than "a big cross-stack build." The global accelerator + tray display for Floating **already exist**. We only add a config mirror (`floating.shortcut`), two IPC handlers, two preload methods, the typed-channel/`floatingPanels`-shape additions, and one renderer input. (`floatingPanels` at `preload.ts:366` has **no** `getShortcut/setShortcut` today — confirmed; the `getShortcut/setShortcut` at `preload.ts:1505/1514` belong to the `brainDump` namespace.)

## 3. Target grouping (ask #1) — concern-based sections, web-common first

Use the design system's existing pattern: **Caption-style section labels** (12px, uppercase, `letter-spacing 0.05em` — same as the sidebar), 48px between sections, quiet-companion voice (the "On launch" / Sunrise card is the tonal touchstone). No new primitive needed.

> **Design-review decision D1 (2026-06-24) — Caption is the SOLE per-section heading tier (flatten).** Today each settings card carries its own `CardTitle text-lg` (e.g. "Application" `ElectronSettingsPage.tsx:211`, "Settings Window" `:283`, and the 4 sub-cards). The repo already has a _two-tier_ idiom — `CardTitle` (section) **＞** `text-xs uppercase tracking-wide text-muted-foreground` Caption (in-card sub-group, e.g. "Keep on top" `FloatingWindowSettings.tsx:278`). Adding Caption **section** labels on top of the existing `CardTitle`s would either double-label (Caption "APPLICATION" directly above CardTitle "Application") or flatten the hierarchy against the sub-group Caption. **Resolution: the Caption section label REPLACES each card's `CardTitle`, remapped PER-COMPONENT (§6a title-state table) — most `text-lg` titles collapse into the section `<h2>`, but an inner grouping of a multi-component section instead stays as a sub-caption (concretely `StartupWindowSettings` "On launch" inside APPLICATION, mirroring "Keep on top"); the Caption `<h2>` is the only _section_ heading.** In-card sub-group Captions (e.g. "Keep on top") stay one visual step quieter (they sit _under_ a section's `<h2>`, so the hierarchy reads Section `<h2>` ＞ sub-group caption ＞ row). See §6a for the per-file placement. Visual precedent to mirror: the existing "Keep on top" sub-group block.

```text
/settings  (single scrolling page)
├─ ▸ TASKS                    (web-common)
│   └─ 居残りモード (retainCompletedInList)   ← finally under a header, not floating
├─ ▸ SOUND                    (web-common)
│   └─ All cues · per-moment (create/complete/clear) · timbre · volume
├─ ▸ APPEARANCE               (web-common)
│   └─ ThemeSelector          ← no longer sandwiched
├─ ▸ BRAIN DUMP               (Electron-only — D2=A consolidation)
│   └─ ONE card: font family/size · text color · clear-on-complete · opacity · sync mode · TOGGLE SHORTCUT
├─ ▸ FLOATING NAVIGATOR       (Electron-only — symmetric with Brain Dump; hosts the D1=A NEW shortcut)
│   └─ keep-on-top · TOGGLE SHORTCUT (new) · show-on-all-desktops*
├─ ▸ APPLICATION              (Electron-only)
│   └─ Hide app icon · Show in Menu Bar · Start at Login · On launch (Startup) · Settings-window size reset + resize grip   ← D2: folded in (was its own section)
└─ ▸ UPDATES                  (Electron-only)
    └─ AppUpdateSettings
```

> **Design-review decision D2 (2026-06-24) — fold "Settings Window" into APPLICATION (7 sections, not 8).** Its entire content is one `Restore default size` button + the `aria-hidden` resize grip (`ElectronSettingsPage.tsx:281-314`) — too thin to earn a top-level Caption section. It moves under APPLICATION as the last row. ("If deleting 30% improves it, keep deleting" — the App-UI subtraction default.)

\*`show-on-all-desktops` (`visibleOnAllWorkspaces`) is one OS-level flag shared by both windows. **Decision (eng-review Arch-1 = 1A):** relocate it OUT of the (renamed) Floating Navigator card into the **APPLICATION / Desktop** section — it is not per-window, so it must not live inside a per-window card. See ENGINEERING REVIEW §6a.

Net effect on the four mess symptoms: 居残り gets a home (1), BrainDump becomes single-sourced (2), Theme joins Appearance (3), orphans addressed in §5 (4).

## 4. Alternatives for the grouping _shape_ (office-hours requires options)

|       | Approach                                                                                                                        | Pros                                                                                                                                                                | Cons                                                                                                                    | Verdict         |
| ----- | ------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------- | --------------- |
| **1** | **In-place sectioned single page** (Caption-style headers + Separator over the existing cards)                                  | Lowest risk; faithful to "グルーピング"; reuses existing Card/Separator; preserves each card's version-skew degrade-to-`SettingsStateCard` fallback; DESIGN-aligned | Long scroll as settings grow                                                                                            | **RECOMMENDED** |
| 2     | **Tabbed settings** (`shadcn Tabs`, already in `src/components/ui/tabs.tsx`): General · Sound · Appearance · Windows · Advanced | Scales best; less scroll                                                                                                                                            | Hides content behind clicks; bigger UX change; a whole tab can render empty on web; complicates per-card skew fallbacks | Future option   |
| 3     | **Two-page split** — `/settings` (web-common) + `/settings/desktop` (Electron-only)                                             | Cleanest web/Electron separation (directly serves #3)                                                                                                               | Adds a route + nav; over-engineered for current size                                                                    | Future option   |

Recommendation: **Approach 1**. It is the minimal faithful reading of "group correctly," keeps the proven per-card version-skew safety, and needs no new navigation. Tabs/two-page are revisitable once the section count grows.

## 5. Orphaned components — disposition

- **`ShortcutSettings.tsx` — DO NOT delete (it is functional, just unmounted).** Its backing IPC (`shortcuts.getRegistered/getDefaults/update/...`, `main.ts:1993-2088`) is **live** against the real `ShortcutManager`. It is a complete global-shortcuts batch manager that was never surfaced. Recommend: leave unmounted now; consider surfacing later as an "Advanced → Keyboard shortcuts" section (it also covers `newTask/search/minimize/toggleAlwaysOnTop/focusFloatingNavigator`, which the two inline toggles do not). Flagged, not in this assignment's scope.
- **`NotificationSettings.tsx`, `WindowStateSettings.tsx` — likely dead.** Verify their IPC has no live callers, then delete in a **separate hygiene PR** (out of scope here to keep this change reviewable).

## 6. Implementation spec (for the follow-up build — NOT done in office-hours)

### 6a. Ask #1 — Regrouping (Approach 1)

> **🔴 Orphan-header fix (design-review, load-bearing) — WHERE each section label is rendered is not free.** `src/app/settings/page.tsx` is a **server component** (no `'use client'`; it `export`s `metadata`), and the ONLY `isElectron` gate is inside the **client** `ElectronSettingsPage`, which `return null`s on web (`:201-203`). So a section label placed in `page.tsx` renders on **web too**. If the Electron section labels (BRAIN DUMP / FLOATING NAVIGATOR / APPLICATION / UPDATES) are inserted in `page.tsx`, web shows **4 orphaned headers with no content under them.** Rule: **web-common labels → `page.tsx`; ALL Electron section labels → INSIDE `ElectronSettingsPage`, below its `if (!isElectron) return null`.**

- `src/app/settings/page.tsx`: reorder so web-common sections precede Electron sections; insert **only the 3 web-common** Caption section headers — `TASKS`, `SOUND`, `APPEARANCE` — each co-located with its web content. Do **NOT** place any Electron section label here.
- `src/components/settings/PreferencesSettings.tsx`: split the single card into **Tasks** + **Sound** sections; **remove** the BrainDump appearance block (moves per §6c).
- `src/components/electron/ElectronSettingsPage.tsx`: render **all** Electron section headers (`BRAIN DUMP`, `FLOATING NAVIGATOR`, `APPLICATION`, `UPDATES`) **inside** the component, _after_ the `if (!isElectron) return null` (so they exist only in Electron). Order the cards under them. **D1 flatten (per-component — NOT a blanket delete; see the title-state table below).** Each existing `CardTitle` takes one of three fates: _collapse_ into the section's Caption `<h2>` (the 1:1 cards), _demote_ to an in-card sub-group Caption (a grouping that lives INSIDE a multi-component section — `StartupWindowSettings` "On launch" inside APPLICATION, exactly mirroring "Keep on top"), or _remove_ (a card whose content splits across two sections). The section's Caption `<h2>` is the only _section_ heading; sub-group Captions stay one step quieter under it. **D2 fold:** drop the standalone "Settings Window" `Card` and move its `Restore default size` row to the bottom of the APPLICATION section (the `aria-hidden` resize grip stays put). Split the shared always-on-top so the BrainDump pin lives in the Brain Dump section and the Floating pin in the Floating Navigator section (per Arch-1).
- **Caption header = semantic `<h2>`, not a styled `div`** (the repo's a11y bar is high — cf. `FloatingToggleRow`'s WCAG 2.5.3 `ariaLabel`). Each section is a `<section aria-labelledby={id}>` whose `<h2 id>` is the Caption label, styled with the sidebar token (12px Inter Tight 500, uppercase, `tracking-[0.05em]`, `text-muted-foreground`). This gives screen-reader landmark navigation across the now-headered page for free.

**§6a title-state table (D1 flatten, resolved per-component — design-review).** Every existing `CardTitle` is reconciled explicitly so the flatten never silently drops a grouping or double-labels:

| Component (current title)                                         | Section             | Fate of the existing `CardTitle`                                                                                                                                                                                                                                                                                             |
| ----------------------------------------------------------------- | ------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `PreferencesSettings` — "Preferences" `:236`                      | TASKS + SOUND       | **Remove** — the card splits into two sections; both `<h2>`s come from `page.tsx` (T1).                                                                                                                                                                                                                                      |
| `ThemeSelector` — "Theme" `:65`                                   | APPEARANCE          | **Collapse** → the APPEARANCE `<h2>` in `page.tsx`; delete the `text-lg` title (else "APPEARANCE" ＞ "Theme" double-labels).                                                                                                                                                                                                 |
| `AppUpdateSettings` — "App Updates" `:273` live + `:258` fallback | UPDATES             | **Live title collapses** → the UPDATES `<h2>` (rendered above it in `ElectronSettingsPage`); delete the live `CardTitle`. The **fallback** state-card (degraded/old preload) **keeps its own title** — a self-contained "unavailable" affordance, like the `SettingsStateCard` fallbacks in `FloatingNavigatorSettings`.     |
| inline "Application" Card — `:211`                                | APPLICATION         | **Collapse** → the APPLICATION `<h2>`; delete the `text-lg` title.                                                                                                                                                                                                                                                           |
| `StartupWindowSettings` — "On launch" `:210`                      | inside APPLICATION  | **Demote → sub-group Caption, NOT deleted.** APPLICATION is the one multi-component section (chrome toggles + launch-window choices + the folded size row); "On launch" keeps the launch cluster grouped, mirroring "Keep on top" in FLOATING NAVIGATOR. Restyle to `text-xs uppercase tracking-wide text-muted-foreground`. |
| `FloatingNavigatorSettings` — "Floating windows" `:244`           | FLOATING NAVIGATOR  | **Collapse** → the FLOATING NAVIGATOR `<h2>`; delete the title.                                                                                                                                                                                                                                                              |
| `BrainDumpSettings` — (its `CardTitle`)                           | BRAIN DUMP          | **Collapse** → the BRAIN DUMP `<h2>`; delete the title.                                                                                                                                                                                                                                                                      |
| inline "Settings Window" Card — `:283`                            | DR-D2 → APPLICATION | **Remove** — fold the `Restore default size` row to APPLICATION's last row; no heading (the `aria-hidden` resize grip stays put).                                                                                                                                                                                            |

### 6b. Ask #2 — Floating Navigator inline shortcut (D1=A), mirroring BrainDump exactly

1. **Main** (`electron/main.ts`, mirror `1465-1491`): add `floating-config-get-shortcut` → `configManager.get<string>('floating.shortcut','') ?? ''`; add `floating-config-set-shortcut` → `shortcutManager.updateShortcuts({ toggleFloatingNavigator: accelerator })` (rollback to previous on `!ok`) + `configManager.set('floating.shortcut', accelerator)`. **No new accelerator / no new tray wiring** (both already exist).
2. **Preload** (`electron/preload.ts`, add to `floatingPanels` at `366`, mirror `brainDump` `1505-1519`): `getShortcut` / `setShortcut` → `typedInvoke('floating-config-get-shortcut' | 'floating-config-set-shortcut', ...)`.
3. **Types**: add the two channels to the typed IPC channel union; add `getShortcut/setShortcut` to `floatingPanels` in **both** `electron/types/electron-api.d.ts` and `src/types/electron.d.ts:196`.
4. **Renderer**: add a "Toggle shortcut" row with the existing `KeybindingCaptureInput` to the Floating Navigator card, mirroring `BrainDumpSettings.handleShortcutCapture` (optimistic apply → persist via `floatingPanels.setShortcut` → rollback to `lastGood` + `setError(KEYBINDING_CONFLICT_MESSAGE)` on `ok===false`). Reuse `KEYBINDING_CONFLICT_MESSAGE` from `@/lib/constants/keybinding`.
5. **Version-skew guard** (mandatory, per the repo pattern): gate the row on `typeof window.electronAPI?.floatingPanels?.setShortcut === 'function'`; degrade to `SettingsStateCard` ("update CoreLive…") when the installed preload is older than the web bundle.
6. **RESOLVED (eng-review CQ2 — supersedes the office-hours "mirror exactly" lean) — seed the `floating.shortcut` default.** The original premise ("BrainDump's mirror also defaults to `''`, so exact-mirror just replicates shipped behavior") was **false**: `ConfigManager` seeds `braindump.shortcut: 'Alt+Space'` (`ConfigManager.ts:398`), NOT `''`. There is no BrainDump quirk to faithfully replicate; the empty mirror would be a _new_ asymmetry. Decision: **seed `floating.shortcut` in `ConfigManager.getDefaultConfig()` to the live `toggleFloatingNavigator` default (Cmd+3 equivalent)**, mirroring how braindump seeds `Alt+Space`. One config line fixes BOTH: (a) first-load empty-display — the card now shows the real binding; (b) the **destructive rollback** (review finding #2) — a rollback-to-`previous` can never land on `''`, which `updateShortcuts` (`ShortcutManager.ts:916`) silently skips re-registering, leaving Cmd+3 unbound. Full rationale + the false-premise calibration in the ENGINEERING REVIEW section.

### 6c. Ask #3 — Remove Electron-leaning items from web (D2=A)

- Move the BrainDump appearance selectors (`selectBraindumpFontFamily/FontSize/TextColor/ClearOnComplete`, setters `setBraindumpFontFamily/FontSize/...`) out of web-common `PreferencesSettings` into the Electron-gated Brain Dump card so the web Preferences no longer renders them. (Truly Electron-only items — dock icon, menu bar, opacity, always-on-top, global shortcuts — are **already** `isElectron`-gated via `ElectronSettingsPage` returning `null` on web; no change needed there.)

## 7. Effort sizing (the three asks are NOT equal)

| Ask                  | Nature                                                                                            | Size                              |
| -------------------- | ------------------------------------------------------------------------------------------------- | --------------------------------- |
| #1 Regrouping        | Reorg of existing cards + section labels; no new data flow                                        | **M-small**                       |
| #2 Floating shortcut | The only cross-stack new feature (main+preload+types+renderer), but global accel + tray pre-exist | **M** (lighter than first feared) |
| #3 Web cleanup       | Move selectors out of web-common into the Electron card                                           | **S-M**                           |

## 8. Definition of Done (per CLAUDE.md — non-negotiable)

implement → **QA** → ship. Never call it "smoke."

> **QA split is load-bearing — the packaged app loads PROD web (`corelive.app/home`), so a branch _renderer_ change is NOT in `dist/mac/CoreLive.app` until Vercel deploys the branch.** (Repo gotcha: `qa-dev-electron-floating-csp-eval-blocker` / the sound-palette CDP lesson.) Only the **main-process** half of D1=A is built from branch and packaged-QA-able. Do not "QA the whole shortcut on the packaged app" — the renderer half will silently be the old prod code.

- **(a) E2E** — changed renderer paths (`pnpm e2e:web` proven on CI if it can't boot locally; `pnpm e2e:electron`).
- **(b) Renderer QA — capture (`KeybindingCaptureInput`), optimistic apply, conflict rollback, version-skew degrade.** Run against **dev or a local PROD build** (`pnpm build && pnpm start` on 4991) driven by Playwright `_electron` / CDP at `127.0.0.1` — NOT the packaged app.
- **(c) Main-process native QA — global accelerator actually toggling Floating + tray showing the new accelerator.** This half IS built from branch → packaged app (`pnpm electron:build:dir && open dist/mac/CoreLive.app`), driven via `mcp__computer-use__*` + `mcp__mac-mcp-server__*`.

## 9. Assignment (next concrete step)

This office-hours deliverable is the design above. The single concrete next step, in dependency order, is to **implement §6a → §6c → §6b** (regroup first so the Brain Dump card exists to consolidate into; add the Floating shortcut into the now-clean Floating Navigator card last), then run the §8 QA before any ship. Orphan cleanup (§5) is a separate follow-up PR.

— End of design doc. Implementation is a separate, explicit go-ahead.

---

# ENGINEERING REVIEW (plan-eng-review, 2026-06-24)

> Branch `main` · repo `laststance/corelive` · interactive review · outside voice = Claude general-purpose subagent (Codex timed out, fell back per skill). This section folds in every locked decision and the two build-now scope expansions. The office-hours body above is the design; this is the execution contract.

## ER-0. Locked decisions

| #      | Issue                                                                                                              | Decision                                                                                                                                                                                                                   | Why                                                                                                                                         |
| ------ | ------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| Step 0 | PR packaging                                                                                                       | **SINGLE PR, all 3 asks**                                                                                                                                                                                                  | One coherent settings reorg; split point pre-identified (§6e) if QA/CI gets unwieldy.                                                       |
| Arch-1 | The "Floating Navigator card" does not exist — `FloatingWindowSettings` is a **shared** card                       | **1A: rename → `FloatingNavigatorSettings` (Floating-only).** Move `brainDumpAlwaysOnTop` → Brain Dump card; move shared `visibleOnAllWorkspaces` → APPLICATION/Desktop section                                            | Per-window cards must hold only per-window flags; the one OS-level shared flag moves up a level, not duplicated.                            |
| Arch-2 | Where does the version-skew guard for the new shortcut row live?                                                   | **2A: per-row render-time guard** `typeof window.electronAPI?.floatingPanels?.setShortcut === 'function'`, NOT folded into `hasCompleteFloatingPanelsApi`                                                                  | An older preload that has keep-on-top but not `setShortcut` must still render keep-on-top; a whole-card guard would hide a working control. |
| CQ-1   | DRY the BrainDump↔Floating capture logic                                                                           | **Extract a shared renderer hook `useShortcutCapture({ persist })`** (optimistic apply → `ok===false` rollback + `KEYBINDING_CONFLICT_MESSAGE` → thrown-error rollback). Keep `main.ts` IPC + preload explicit per-channel | Capture/rollback is the duplicated part; IPC plumbing is intentionally explicit. Hook is unit-testable in isolation (DAMP).                 |
| CQ-2   | First-load empty-display / destructive rollback                                                                    | **Seed `floating.shortcut` default in `ConfigManager`** (Cmd+3 equiv), supersedes the earlier "accept empty" lean                                                                                                          | The "BrainDump also defaults to ''" premise was FALSE (it seeds `Alt+Space`). Seeding fixes both #1 and #2 in one line. See §6b#6.          |
| Gap #3 | Missing Zod schema for new channels = **compile error**                                                            | **Add** `'floating-config-get-shortcut': z.tuple([])` + `'floating-config-set-shortcut': z.tuple([z.string()])` to `IPC_ARG_SCHEMAS` in the SAME commit as the channel-union edit                                          | `ipc-schemas.ts` is `Record<IPCChannel, …>`; a channel without a schema breaks `pnpm validate`.                                             |
| Gap #4 | Mirror dropped the tray refresh                                                                                    | **Append `systemTrayManager?.refreshTrayMenu()`** after a successful `floating-config-set-shortcut` (braindump does this at `main.ts:1493`)                                                                                | The tray already reads `toggleFloatingNavigator`; without the refresh the tray shows the stale accelerator until next rebuild.              |
| Gap #6 | `floatingPanels` type lives in two files, already drifted                                                          | **Edit canonical `electron/types/electron-api.d.ts` only**; touch `src/types/electron.d.ts` subset _only if_ typecheck demands it                                                                                          | Canonical file is the SSoT (comment at `electron.d.ts:244`); the subset is "only what settings needs."                                      |
| Gap #7 | Moved BrainDump appearance controls are pure Redux, but the Brain Dump card has a whole-card IPC skew early-return | **Render the moved appearance controls OUTSIDE `BrainDumpSettings`' IPC `SettingsStateCard` early-return**                                                                                                                 | Font/size/color/clear-on-complete are pure Redux (no preload dep); an outdated-preload user must still be able to set them.                 |
| TODO-1 | Keep-on-top cross-window live sync                                                                                 | **Build now (§6d)** — user override of my "defer" recommendation                                                                                                                                                           | User chose to fix the pin-propagation gap in this PR.                                                                                       |
| TODO-2 | `floatingPanels` type-def consolidation                                                                            | **Add to TODOS.md** (Gap #6 covers this PR's surface; full consolidation is a separate hygiene task)                                                                                                                       | Not load-bearing for this PR.                                                                                                               |
| TODO-3 | Silent conflict-substitution (alt accelerator bound, returns `true`)                                               | **Build now (§6e)** — user override; fix for BOTH `toggleBrainDump` (pre-existing) and `toggleFloatingNavigator`                                                                                                           | User chose to fix the display/live-binding lie in this PR. Design B (reject substitution), implemented in the 2 IPC handlers only.          |

## ER-1. NOT in scope (explicit non-goals)

- **Tabbed / two-page settings** (Approach 2/3) — future, only once section count grows.
- **Deleting `NotificationSettings.tsx` / `WindowStateSettings.tsx`** — separate hygiene PR after verifying no live IPC callers (§5).
- **Surfacing `ShortcutSettings.tsx`** as an "Advanced → Keyboard shortcuts" section — functional but out of scope; leave unmounted.
- **Changing `handleShortcutConflict` / `generateAlternativeShortcuts` / startup auto-substitution** — §6e is deliberately confined to the 2 IPC handlers; startup auto-substitution is PRESERVED.
- **`floatingPanels` type-def full consolidation** (TODO-2) — TODOS.md.
- **Reworking the Sound section internals** — only relocating it under a SOUND header; cue logic unchanged.

## ER-2. What already exists (reuse, do NOT rebuild)

- **Global accelerator + tray for Floating** — `toggleFloatingNavigator` (Cmd+3) is live (`ShortcutManager`), and the tray provider already reads it (`main.ts:844-851`). The Floating shortcut feature is a config-mirror + UI, NOT a new accelerator.
- **`KeybindingCaptureInput`** (`src/components/electron/KeybindingCaptureInput.tsx`) + `KEYBINDING_CONFLICT_MESSAGE` (`@/lib/constants/keybinding`) — reuse verbatim.
- **`SettingsStateCard`** version-skew degrade component — reuse for the per-card / per-row skew fallback.
- **`getRegisteredShortcuts(): Record<string,string>`** (`ShortcutManager.ts:964`) — returns the ACTUAL bound accelerator (the alternative when substituted). This is the read-back §6e needs; no new ShortcutManager API required.
- **BrainDump set-shortcut handler** (`main.ts:1470-1495`) — the exact template for the Floating handler, INCLUDING the `refreshTrayMenu()` call (Gap #4) and rollback.
- **`applyPreference` optimistic-with-rollback + per-row `savingKeys`** (in `FloatingWindowSettings.tsx`) — the keep-on-top pattern to preserve across the rename.
- **shadcn `Separator` / `Card` / Caption-label pattern** — already vendored; no new primitive (§3).

## ER-3. Data-flow diagrams

**(A) Floating shortcut set — happy path**

```text
KeybindingCaptureInput ──keys──▶ useShortcutCapture(optimistic setShortcut)
   │                                   │ persist
   │                                   ▼
   │                       floatingPanels.setShortcut(acc)
   │                                   │ typedInvoke('floating-config-set-shortcut',[acc])
   │                                   ▼
   │        main: previous = get('floating.shortcut')
   │              updateShortcuts({ toggleFloatingNavigator: acc })  ──▶ registerShortcut ──▶ globalShortcut.register
   │              bound = getRegisteredShortcuts()['toggleFloatingNavigator']     // read-back
   │              acc!=='' && bound===acc ?  set('floating.shortcut',acc) + refreshTrayMenu() ─▶ return true
   ▼                                                                                              │
hook commits lastGood ◀───────────────────────────────────────────────────────── true ──────────┘
```

**(B) Conflict path (§6e Design B) — requested key held by another app**

```text
updateShortcuts → registerShortcut → globalShortcut.register FAILS → handleShortcutConflict
      binds ALTERNATIVE, stores isAlternative:true, returns TRUE   (← UNTOUCHED, startup still uses this)
main handler:  ok===true  BUT  bound = getRegisteredShortcuts()[id]  →  bound !== requested
      ⇒ silent substitution detected  →  updateShortcuts({ id: previous })  (restore)  →  return FALSE
hook:  ok===false  →  rollback to lastGood  +  setError(KEYBINDING_CONFLICT_MESSAGE)
```

> Edge guard (failure-mode below): the mismatch check MUST be `requested !== '' && bound !== requested`. On unbind (`requested === ''`) `updateShortcuts` skips registration (`:916`) so `bound` is `undefined`; `undefined !== ''` would FALSE-POSITIVE a conflict.

**(C) Keep-on-top cross-window sync (§6d)**

```text
Settings window: pin toggle → floatingPanels.setAlwaysOnTop(target,bool)
   main: 3 layers (the crux — config-only write is a silent no-op after first launch)
     1. config.set('<target>.alwaysOnTop', bool)
     2. window-state persist  (WindowManager upgrade invariant, ~line 588 — sole pin source)
     3. LIVE  targetWindow.setAlwaysOnTop(bool)
   broadcast → the target window's OWN pin control reflects the new state
```

> §6d is the least-specified workstream (a build-now expansion). Implementation MUST start by writing a RED cross-window test that pins the EXACT failing layer before touching code — do not assume the gap, prove it.

## ER-4. Failure modes (per NEW codepath)

| Codepath             | Failure mode                                                                                                               | Mitigation                                                                                                                                                                       |
| -------------------- | -------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| §6b seed default     | Seed value drifts from the real `toggleFloatingNavigator` default if that default ever changes                             | Source the seed from ONE constant shared with the ShortcutManager default (don't hard-code Cmd+3 twice); regression test asserts seed === live default.                          |
| §6e read-back        | **Unbind false-positive** — `requested==='' ` → `bound===undefined` → naïve `bound!==requested` reports a phantom conflict | Guard `requested !== '' && bound !== requested` (diagram B note). Unit test the unbind path explicitly.                                                                          |
| §6e                  | Changes BrainDump's set path → BrainDump regression                                                                        | Confined to the 2 IPC handlers; `handleShortcutConflict` untouched. Regression test: conflict path returns false for **both** toggles AND startup auto-substitution still binds. |
| §6b Zod (#3)         | Forgetting the schema → `pnpm validate` fails (build-breaker)                                                              | Land schema + channel-union in the same commit; IPC-contract test asserts both channels present.                                                                                 |
| §6b tray (#4)        | Tray shows stale accelerator                                                                                               | `refreshTrayMenu()` after successful set; native QA confirms.                                                                                                                    |
| §6a regroup          | Render-loop starving nav (prior incident `web-settings-nav-render-loop-fix`)                                               | `useMemo` category/pending maps; NO fresh array/Map in an effect dep; regression spec CLICKS the sidebar (goto masks it).                                                        |
| Arch-2 per-row guard | Older preload renders shortcut row that 500s on click                                                                      | Render-time `typeof …setShortcut === 'function'`; degrade to inline "update CoreLive" / `SettingsStateCard`.                                                                     |
| §6c moved controls   | Appearance controls hidden behind BrainDump's IPC skew early-return (#7)                                                   | Render them OUTSIDE the early-return (pure Redux).                                                                                                                               |
| §6d pin sync         | Config-only write = silent no-op after first launch (the three-layer crux)                                                 | Write all three layers; RED test first.                                                                                                                                          |

## ER-5. Worktree parallelization strategy

**Recommendation: implement SEQUENTIALLY in a single worktree — do NOT fan out.** The workstreams share high-contention files: `main.ts` (§6b, §6e), `ElectronSettingsPage.tsx` (§6a, §6c, Arch-1), `BrainDumpSettings.tsx` (§6c, §6e, CQ-1), `ipc-schemas.ts` + `electron/types/ipc.ts` + `electron-api.d.ts` (§6b). Parallel worktrees would spend more on merge-conflict resolution than they save. Order: **§6a → §6c → §6b(+seed+Zod+tray) → CQ-1 hook → §6e → §6d**, validate once at the end. Only §6d (mostly `WindowManager`/main + a renderer pin control) is isolated enough to branch off if needed.

## ER-6. Implementation tasks

| T   | Title                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          | Primary files                                                                                                                                                                                   | Depends on |
| --- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------- |
| T1  | §6a Regroup `/settings` — insert **only** the 3 web-common Caption `<h2>` headers (`TASKS`/`SOUND`/`APPEARANCE`) in `page.tsx` (NO Electron labels here — orphan-header fix); each section `<section aria-labelledby>`; split `PreferencesSettings` into Tasks/Sound; remove braindump-appearance block (render-loop guarded)                                                                                                                                                                                                                                                                                                                                                                                  | `src/app/settings/page.tsx`, `src/components/settings/PreferencesSettings.tsx`                                                                                                                  | —          |
| T2  | Arch-1 Rename `FloatingWindowSettings`→`FloatingNavigatorSettings`; move `brainDumpAlwaysOnTop`→Brain Dump section; move `visibleOnAllWorkspaces`→APPLICATION/Desktop. **+ design D1/D2:** render all Electron Caption `<h2>` headers INSIDE `ElectronSettingsPage` after `return null`; apply the **§6a per-component title-state table** (collapse → section `<h2>` / demote → sub-caption / remove — NOT a blanket delete; `StartupWindowSettings` "On launch" stays as an APPLICATION sub-caption, `AppUpdateSettings`' degraded-preload fallback card keeps its own title); **fold "Settings Window" into APPLICATION** (drop the standalone card, move `Restore default size` to APPLICATION's last row) | `src/components/electron/FloatingWindowSettings.tsx`→`FloatingNavigatorSettings.tsx`, `ElectronSettingsPage.tsx`, `AppUpdateSettings.tsx`, `StartupWindowSettings.tsx`, `BrainDumpSettings.tsx` | T1         |
| T3  | §6c + #7 Move braindump appearance selectors into Brain Dump card, rendered OUTSIDE the IPC skew early-return                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  | `BrainDumpSettings.tsx`, `PreferencesSettings.tsx`                                                                                                                                              | T1         |
| T4  | §6b CQ-2 Seed `floating.shortcut` default (shared constant w/ ShortcutManager default) + main IPC `floating-config-get/set-shortcut` (+ `refreshTrayMenu()` #4)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                | `electron/ConfigManager.ts`, `electron/main.ts`                                                                                                                                                 | —          |
| T5  | #3 Add the two channels to `electron/types/ipc.ts` union + Zod schemas in `ipc-schemas.ts` (SAME commit) + IPC-contract test                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   | `electron/types/ipc.ts`, `electron/ipc/ipc-schemas.ts`, `electron/__tests__/ipc-contract.test.ts`                                                                                               | T4         |
| T6  | §6b Preload `getShortcut/setShortcut` on `floatingPanels`; types in canonical `electron-api.d.ts` (#6)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         | `electron/preload.ts`, `electron/types/electron-api.d.ts`                                                                                                                                       | T5         |
| T7  | CQ-1 Extract `useShortcutCapture({persist})`; refactor BrainDump to it; add Floating shortcut row w/ Arch-2 per-row skew guard                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 | `src/hooks/useShortcutCapture.ts` (new), `BrainDumpSettings.tsx`, `FloatingNavigatorSettings.tsx`                                                                                               | T2, T6     |
| T8  | §6e Design B conflict fix in BOTH `braindump-config-set-shortcut` + `floating-config-set-shortcut` (read-back `getRegisteredShortcuts()`, guard `requested!=='' && bound!==requested` → restore previous + return false). ShortcutManager untouched                                                                                                                                                                                                                                                                                                                                                                                                                                                            | `electron/main.ts`                                                                                                                                                                              | T4         |
| T9  | §6d Keep-on-top cross-window live sync — RED test FIRST to pin the failing layer, then fix 3-layer propagation/broadcast                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       | `electron/WindowManager.ts`, `electron/main.ts`, pin renderer control                                                                                                                           | T2         |
| T10 | Tests — `useShortcutCapture` unit; main get/set unit incl. conflict-returns-false for BOTH toggles + startup auto-sub still binds + unbind no-false-positive; PreferencesSettings render-loop + braindump-absence; FloatingNavigatorSettings rename/skew; ElectronSettingsPage composition; pin cross-window sync                                                                                                                                                                                                                                                                                                                                                                                              | `*.test.tsx`, `electron/__tests__/*`                                                                                                                                                            | T7, T8, T9 |
| T11 | QA per §8 (a E2E / b renderer dev-or-local-prod / c packaged native: global accel + tray + pin propagation)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    | —                                                                                                                                                                                               | T10        |

> JSONL task artifact written to `~/.gstack/projects/laststance-corelive/tasks-eng-review-20260624.jsonl`.

## ER-7. Outside-voice (cross-model challenge) — folded in

Codex timed out (143/5m); fell back to a Claude general-purpose subagent. Surfaced 7 findings; the load-bearing ones, all VERIFIED by direct code read:

1. **#1 seed asymmetry** — verified (`ConfigManager.ts:313-325` floating has no `shortcut`; `:398` braindump seeds `Alt+Space`). → CQ-2 seed default.
2. **#2 destructive rollback** — verified (`ShortcutManager.ts:916` skips re-registering `''`). → resolved by the seed (previous never `''`).
3. **#3 Zod build-breaker** — verified (`ipc-schemas.ts:68` `Record<IPCChannel,…>`). → Gap #3.
4. **#4 tray refresh dropped** — verified (`main.ts:1493`). → Gap #4.
5. **#5 silent conflict-substitution** — verified (`registerShortcut:491-525` → `handleShortcutConflict:530-569` binds alternative, returns `true`; `notifyShortcutChange:640-652` only fires a native notification, does NOT sync config/renderer/tray). → §6e build-now.
6. **#6 split type-def drift** / **#7 IPC skew hides pure-Redux controls** — verified. → Gaps #6/#7.

**Calibration event (recorded for learnings):** my CQ-2 recommendation initially rested on the false premise "BrainDump also defaults to `''`." The outside voice + a direct read corrected it (BrainDump seeds `Alt+Space`). The seed-default fix is strictly better than the empty-mirror I'd first leaned toward. Second near-miss: I almost recommended Design A for §6e, which would have silently diverged from the option text the user actually picked ("return false on alternative-bind" = Design B); advisor caught it.

---

# DESIGN REVIEW (plan-design-review, 2026-06-24)

> Branch `main` · repo `laststance/corelive` · HEAD `42e88c3` · interactive review. Runs AFTER the eng-review above; where the two touch the same surface this section refines the **visual/interaction** spec (notably §3 label tier + §6a label placement) and the eng-review's architecture/test contract still governs. Initial design-completeness **6/10 → 8/10** after the two decisions below landed in §3 / §6a / T1 / T2.

## DR-0. Why 6/10 going in

Engineering-complete (eng-review clean, T1–T11) and the keybinding **microcopy is already DESIGN.md-aligned** (`keybinding.ts:187`, 3-state no-shame copy). But two structural/visual decisions were unmade — they would have surfaced as a **visible web bug** (orphaned section headers) and a **double-label** — plus a few safe a11y/token refinements. Resolving them → 8/10 (residual gap = §6d's inherent under-specification, owned by the eng-review).

## DR-1. Decisions added to the plan (2)

| #         | Decision                                                                                                       | Choice                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               | Lands in           |
| --------- | -------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------ |
| **DR-D1** | Section-header tier — Caption section labels vs the existing `CardTitle`(18px) ＞ Caption(12px) two-tier idiom | **Caption is the SOLE section heading; flatten the per-card `CardTitle text-lg` PER-COMPONENT** (collapse → section `<h2>` / demote → sub-caption / remove — see §6a title-state table). In-card sub-group Captions stay quieter under the `<h2>`; concretely `StartupWindowSettings` "On launch" stays as an APPLICATION sub-caption (mirrors "Keep on top"), and `AppUpdateSettings`' degraded-preload fallback card keeps its own title — so the flatten never drops a grouping or double-labels. | §3 note · §6a · T2 |
| **DR-D2** | "Settings Window" (one `Restore default size` button + resize grip) as its own top-level section               | **Fold into APPLICATION** (8 → 7 sections); App-UI subtraction default.                                                                                                                                                                                                                                                                                                                                                                                                                              | §3 tree · §6a · T2 |

## DR-2. Seven passes (before → after fixes)

| Pass                       | Rate  | Finding (→ fix)                                                                                                                                                                                                                                                                                                                         |
| -------------------------- | ----- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1 Information Architecture | 5 → 9 | 🔴 **Orphan headers**: `page.tsx` is a server component; the only `isElectron` gate is `ElectronSettingsPage`'s `return null` (`:201`). Electron labels placed in `page.tsx` orphan on web. → §6a: web labels in `page.tsx`, ALL Electron labels INSIDE `ElectronSettingsPage` after `return null`. Plus DR-D2 (single-button section). |
| 2 Interaction States       | 8 → 9 | Capture empty/recording/conflict already spec'd as code constants; new Floating row reuses them verbatim. Only gap = preload-skew row state → already covered by Arch-2 per-row guard (degrade to `SettingsStateCard`).                                                                                                                 |
| 3 User Journey / Emotional | 7     | Settings = utility surface; reorg preserves the quiet-companion calm. No issue.                                                                                                                                                                                                                                                         |
| 4 AI Slop                  | 6     | Flag only: App-UI rule "layout not stacked cards" vs the page's stacked cards — but that **contradicts the approved Approach 1** (in-place sectioned cards) and is pre-existing; flagged, NOT a TODO. No other slop patterns.                                                                                                           |
| 5 Design System            | 5 → 9 | 🔴 **Label-tier collision** (DR-D1). After flatten + sidebar Caption-token annotation → aligned.                                                                                                                                                                                                                                        |
| 6 Responsive & a11y        | 6 → 9 | New labels must be semantic `<h2>` + `<section aria-labelledby>` (repo a11y bar is high — `FloatingToggleRow` WCAG 2.5.3). → §6a a11y bullet. Web-common sections on mobile are simple (`max-w-2xl`).                                                                                                                                   |
| 7 Unresolved Decisions     | —     | Surfaced DR-D1 + DR-D2; both user-answered, 0 deferred.                                                                                                                                                                                                                                                                                 |

## DR-3. NOT in scope (design — explicit non-goals)

- **AI-generated mockups** — skipped: existing-app reorg, fully-specified design language; gaps were structural/textual, not visual-exploratory. (`$D` available if a future section needs visual exploration.)
- **Design Outside Voices** — skipped for the same reason (no visual fork to cross-check).
- **In-page wayfinding** (sticky/anchor nav for the long scroll) — already captured as the Approach 2/3 "future option" (§4 / ER-1); DR-D2 also trims 8 → 7 sections.
- **Cards → true layout** (Pass 4) — contradicts the approved Approach 1; a flag, not deferred work.

## DR-4. What already exists (design reuse — do NOT rebuild)

- **3-state capture microcopy** — `KEYBINDING_CAPTURE_EMPTY_LABEL` / `_RECORDING_LABEL` / `KEYBINDING_CONFLICT_MESSAGE` (`keybinding.ts:191-199`), explicitly "gentle, no-shame voice per DESIGN.md." The new Floating row + any new label match this voice.
- **Caption sub-group pattern** — the "Keep on top" block (`FloatingWindowSettings.tsx:276-305`): the exact `text-xs uppercase tracking-wide text-muted-foreground` treatment; the section `<h2>` is one step stronger.
- **`FloatingToggleRow` a11y** — `ariaLabel` WCAG 2.5.3 Label-in-Name (`:317-324`): the bar the new `<h2>` / `aria-labelledby` must meet.
- **Sidebar Caption token** — 12px Inter Tight 500, uppercase, `tracking-[0.05em]` — the token for the new section headers.

## DR-5. Design tasks (fold into T1/T2; JSONL `tasks-design-review-20260624-171421.jsonl`)

- **DR1 (P1)** — orphan-header fix: web-common `<h2>` headers in `page.tsx`; ALL Electron headers inside `ElectronSettingsPage` after `return null`. → folds into T1 + T2.
- **DR2 (P1)** — flatten: remove per-card `CardTitle text-lg`; section Caption = semantic `<h2>`; `<section aria-labelledby>`. → folds into T2.
- **DR3 (P2)** — fold "Settings Window" into APPLICATION. → folds into T2.

---

## GSTACK REVIEW REPORT

**Plan:** `plans/2026-06-24-settings-regroup-and-floating-shortcut.md`
**Reviewed:** 2026-06-24 · plan-eng-review + plan-design-review · branch `main` · repo `laststance/corelive` · HEAD `42e88c3`

| Review        | Trigger               | Why                             | Runs | Status      | Findings                                                                                                          |
| ------------- | --------------------- | ------------------------------- | ---- | ----------- | ----------------------------------------------------------------------------------------------------------------- |
| CEO Review    | `/plan-ceo-review`    | Scope & strategy                | 0    | —           | not run (settings reorg — no strategy fork)                                                                       |
| Codex Review  | `/codex review`       | Independent 2nd opinion         | 1    | ⚠️ fallback | Codex timed out 143/5m → Claude subagent; 7 findings, load-bearing verified by code read; 2 → build-now (§6d/§6e) |
| Eng Review    | `/plan-eng-review`    | Architecture & tests (required) | 1    | ✅ clean    | 7 issues, 0 critical gaps, 0 unresolved                                                                           |
| Design Review | `/plan-design-review` | UI/UX gaps                      | 1    | ✅ clean    | score 6/10 → 8/10, 2 decisions (DR-D1 flatten, DR-D2 fold)                                                        |
| DX Review     | `/plan-devex-review`  | Developer-experience gaps       | 0    | —           | not run                                                                                                           |

- **CODEX:** outside voice ran as a Claude general-purpose subagent (Codex `exec` timed out at 143/5m, per skill fallback); 7 findings, every load-bearing one verified by direct code read; #5 → §6e build-now, plus §6d.
- **VERDICT:** **ENG + DESIGN CLEARED — ready to implement.** Single PR; §6e pre-identified as the split point if QA/CI grows unwieldy.

### Eng review summary (2026-06-24, clean — full detail in the ENGINEERING REVIEW section above)

- **Architecture:** Floating shortcut = config-mirror + UI over the ALREADY-LIVE `toggleFloatingNavigator` accelerator + tray (not a new accelerator). `FloatingWindowSettings` → `FloatingNavigatorSettings` (per-window); shared flags relocated (Arch-1). §6e confined to 2 IPC handlers; `handleShortcutConflict` / startup auto-substitution untouched.
- **Code quality:** shared `useShortcutCapture` hook (CQ-1); per-row skew guard (Arch-2); seed `floating.shortcut` default (CQ-2, fixes #1+#2); moved appearance controls outside the IPC skew early-return (#7); canonical type-def only (#6).
- **Build-breaker watch:** the two new IPC channels MUST land with their Zod schemas in the same commit (`ipc-schemas.ts` is `Record<IPCChannel,…>`) or `pnpm validate` fails (#3).
- **Residual uncertainty:** §6d keep-on-top cross-window sync is the least-specified workstream — pin the failing layer with a RED test before coding.

### Design review summary (2026-06-24, 6/10 → 8/10, clean)

- **Decisions added (2):** DR-D1 Caption-flatten (remove per-card `CardTitle`), DR-D2 fold "Settings Window" into APPLICATION.
- **Safe edits folded in:** 🔴 orphan-header fix (§6a — web labels in `page.tsx`, Electron labels inside `ElectronSettingsPage`), semantic `<h2>` + `<section aria-labelledby>` a11y, sidebar Caption token.
- **Confirmed strong (reused, not rebuilt):** 3-state capture microcopy already DESIGN.md-aligned; `FloatingToggleRow` WCAG 2.5.3; "Keep on top" Caption sub-group precedent.

**QA (non-negotiable, per CLAUDE.md):** implement → QA → ship. The split is load-bearing — the packaged app loads PROD web, so the renderer half is QA'd on dev / local-prod-build (Playwright `_electron`/CDP at 127.0.0.1), only the main-process half is packaged-QA-able (global accel + tray + pin propagation via computer-use + mac-mcp-server). Never "smoke."

NO UNRESOLVED DECISIONS
