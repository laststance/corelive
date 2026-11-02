<!-- /autoplan restore point: "/Users/ryotamurakami/laststance/corelive/.gstack/tmp/autoplan/fix-214-update-window-theme-autoplan-restore-20261103-013314.md" -->

# Theme the update-download window (#214)

## URGENT, outside this plan

None.

## Implementation plan

Branch: fix/214-update-window-theme · Base: main (ca76c4bf, after #220 / v0.28.1)

## Problem

The Electron update-download window (the passive progress HUD shown while an app update
downloads) always paints Warm Cathedral amber, whatever theme the user picked.
`apps/desktop/electron/update-progress-window-html.ts:32-51` hard-codes Warm Cathedral
`oklch` values for `--surface`, `--foreground`, `--muted`, `--border`, `--track` and
`--fill` (hue 30-75), in both the light block and the `prefers-color-scheme: dark` block.
The HTML is built in the main process by `buildUpdateProgressWindowHtml(progress)` and
loaded as a `data:` URL from `apps/desktop/electron/AutoUpdater.ts:430-437`, so it never
sees the renderer's `data-theme`. Since #213 (v0.28.0) the applied default is the stock
shadcn Default (neutral) theme, so for most users this window is the only amber surface
left. `apps/web/src/lib/themes/no-hardcoded-amber.test.ts:56-60` carries an allowlist
entry for this file with `reason: '#214 themes this window'`.

## Facts this plan relies on

- Stored theme preference = `'system'` or a registered `ThemeId`
  (`packages/live-editor/src/themes/registry.ts`): `normalizeThemePreference` maps
  legacy aliases (`default-light` / `default-dark`) and unknown values; `'system'` means
  the Default pair following the OS (only the Default family owns System,
  `apps/web/src/hooks/useThemeAxis.ts`).
- Token values live in three places: static themes (Default `light` / `dark`) carry
  literal `tokens` in the registry; derived families (harbor, grove, rose-tea, iris,
  graphite) are computed at build time by `deriveThemeTokens` in
  `apps/web/scripts/generate-theme-css.ts`, which needs culori (a web devDependency) for
  the computed foregrounds; Warm Cathedral is hand-authored in
  `packages/live-editor/src/styles/base.css`, mirrored by the generator's exported
  `CATHEDRAL` map (pinned to base.css by the cathedral snapshot test). The Electron main
  process therefore cannot derive tokens at runtime.
- The main process holds the active account's cached theme: `offlineEditor.controller.getSnapshot()`
  (`apps/desktop/electron/offline/OfflineEditorController.ts:159`) returns
  `{ phase: 'ready', workspace: { preferences: { theme } } }` for a prepared account. The
  bundled editor already applies that value with `normalizeThemePreference` and an OS
  media query (`apps/desktop/renderer/NativeEditor.tsx:53-70`).
- `main.ts:675-713` creates `offlineEditor` before the deferred `AutoUpdater`, which is
  constructed only in packaged builds (`new AutoUpdaterCls(prepareForQuit)`).
- No code sets `nativeTheme.themeSource` [measured: grep over `apps/desktop` and
  `apps/web/src`], so `prefers-color-scheme` inside the HUD follows the OS appearance (N-2).

## Steps

1. Generated token map (single source = the theme generator).
   - Extend `apps/web/scripts/generate-theme-css.ts` with `generateThemeTokensModule(themes)`
     that resolves every registry theme to its full `ThemeToken -> value` map: static →
     `tokens`; derived → `deriveThemeTokens(seed, id)`; preserved (cathedral) →
     `CATHEDRAL[mode]`. It returns the source of a new generated module
     `packages/live-editor/src/themes/themeTokens.generated.ts` exporting
     `THEME_TOKENS: Readonly<Record<ThemeId, Readonly<Record<ThemeToken, string>>>>`, declared
     with that annotation (no `as` cast) so `pnpm typecheck` rejects a missing or extra key;
     the generator also throws `THEME_TOKEN_SET_MISMATCH <themeId> missing=<keys>
extra=<keys>` before writing anything when a resolved map's keys differ from the
     `ThemeToken` set (E-5)
     (header: AUTO-GENERATED, run `pnpm theme:generate`). Each entry is classified with the
     registry guards (`isStaticTheme` / `isDerivedTheme`, else `preserve: true`;
     `registry.ts:156-171`) and keyed by its `id`; the mode comes from the entry's `mode`
     field, and the Default dark pair member is `THEME_TOKENS.dark`. The module is committed,
     like generated.css, so a fresh checkout builds from it; `theme:check` catches staleness.
   - The script's direct-run block generates and validates both outputs before writing
     either, then writes generated.css and the token module. `--check` compares the raw
     generator output with each committed file (DX-1 error contract, thrown as an Error so
     `tsx` exits non-zero with the message on stderr):
     - stale: `THEME_ARTIFACT_STALE <repo-relative path>`, the first differing line with the
       existing 200-character excerpts, and the existing fix line (`pnpm theme:generate`,
       review both diffs, rerun `pnpm theme:check`); `describeThemeCssDrift` gains the path
       parameter and the code;
     - missing: `THEME_ARTIFACT_MISSING <repo-relative path>` with the same fix line,
       instead of a raw `ENOENT`;
     - a write failure names the file that failed and which file, if any, was already
       written, so the message never claims "nothing was written" after a partial write.
       Diagnostics carry only paths and the bounded color excerpts, no environment or config.
       The check and write logic moves out of the direct-run block into exported
       `checkThemeArtifacts(artifacts)` and `writeThemeArtifacts(artifacts)` over
       `{ absolutePath, repoPath, content }[]`, using the real `node:fs`; the direct-run block
       only builds the two-artifact list and calls them (E-6). Every existing
       `describeThemeCssDrift` caller and test moves to the new signature.
   - Export it from `packages/live-editor/package.json` as `./theme-tokens`. electron-vite
     bundles `@corelive/live-editor` into main (`apps/desktop/electron.vite.config.ts:8-11`;
     main already imports `@corelive/live-editor/draft-edits`), so there is no new external.
     The module joins `.prettierignore` next to generated.css (`.prettierignore:32-33`) and
     `.fallowrc.jsonc` `duplicates.ignore` (only that list, so dead-code analysis still sees
     `THEME_TOKENS` used; E-2), and is
     emitted lint-clean (`--check` compares raw generator output, so a local prettier version
     never causes false drift); its header says AUTO-GENERATED, names `pnpm theme:generate`,
     and explains that it carries every token so later native surfaces can reuse it (DX-6);
     the desktop main bundle consumes `THEME_TOKENS`, so Fallow sees it
     used. The `theme:check` script itself is unchanged.
2. Theme-aware HTML builder.
   - `buildUpdateProgressWindowHtml(progress, themePreference?: string)`; normalize with
     `normalizeThemePreference` (imported with `THEME_IDS` and the `ThemeId` type from
     `@corelive/live-editor/themes`, the dependency-free `registry.ts`; `THEME_TOKENS` from
     `@corelive/live-editor/theme-tokens`; N-3). Invariant (E-4): only the normalized
     `ThemeId | 'system'` selects a `THEME_TOKENS` entry; the raw preference string is never
     written into the HTML (`isThemeId` uses `Object.hasOwn`, so `'__proto__'` and
     `'constructor'` normalize to System).
   - `'system'` (also no value / unknown): `:root` gets the Default `light` tokens and
     `@media (prefers-color-scheme: dark) { :root { … } }` the Default `dark` tokens, plus
     matching `color-scheme`.
   - A concrete id: `:root` gets only that theme's tokens and `color-scheme: <mode>`; no OS
     media block (an explicit pick is not OS-managed).
   - The token CSS comes from one module-private helper `buildUpdateProgressThemeCss(preference)`
     (not exported: its only caller is the builder, so tests assert its output through
     `buildUpdateProgressWindowHtml`; E-3)
     that emits only the five tokens the HUD reads (`--popover`, `--popover-foreground`,
     `--muted-foreground`, `--border`, `--primary`) plus `color-scheme`. It is total by type:
     `normalizeThemePreference` returns `ThemeId | 'system'` and `THEME_TOKENS` is a
     `Record<ThemeId, …>`, so no lookup can miss; a table test over `THEME_IDS` backs it.
     `color-mix(in oklch, …)` needs Chromium 111+; the packaged Electron 45 Chromium has it,
     and the native capture confirms it.
   - Window variables map onto shadcn semantics: panel `background: var(--popover)`, fully
     opaque, and the `backdrop-filter` blur goes (D-1: at 96% over a dark desktop the Default
     light muted text falls to about 4.33:1, below AA), label `--popover-foreground`,
     percent and hint `--muted-foreground`, border `--border`, track
     `color-mix(in oklch, var(--primary) 20%, transparent)` (shadcn Progress), fill
     `--primary`, shadow a neutral per-mode value (`oklch(0 0 0 / 18%)` light,
     `oklch(0 0 0 / 45%)` dark). No literal hue values remain in the builder.
   - Keep everything else unchanged: markup and copy, typography (sizes, weights, the
     existing system font stacks), spacing, the 320 px panel, 12 px radius, 8 px track,
     click-through, reduced motion and the update script. Only color declarations and the
     panel's opacity change (D-6). Variant B of the approved mockup
     (`~/.gstack/projects/laststance-corelive/designs/update-progress-hud-20261103/variant-B.png`)
     is the Default light visual reference.
3. Theme source for the window.
   - `AutoUpdater` takes an optional second constructor argument
     `readThemePreference: () => OfflinePreferences['theme'] | undefined` (default
     `() => undefined`; type-only import from `@corelive/desktop-contract/offline-workspace`,
     since the package root does not re-export it; C-5), so the existing
     one-argument call keeps working (DX-5). Its JSDoc (`@param` + `@example`) states the
     contract: synchronous, called once when a HUD is created, called again for the next
     HUD, and any throw falls back to System (DX-3).
     `main.ts` passes `() => readUpdateHudThemePreference(offlineEditor?.controller.getSnapshot())`;
     the new util `apps/desktop/electron/utils/readUpdateHudThemePreference.ts` (E-1) returns
     `snapshot.workspace.preferences.theme` when the snapshot is `ready`, else `undefined`
     (also for a missing snapshot); its return type is `OfflinePreferences['theme'] | undefined`
     (indexed from `packages/desktop-contract/src/offline-workspace.ts:135-139`), so a schema
     change breaks the build. A throwing reader counts as no preference and logs one
     `log.warn` with `UPDATE_HUD_THEME_READ_FAILED`, `phase=create-window`,
     `fallback=system`, the error message and "the next HUD reads again"; no theme value or
     account data (DX-2). A normal `undefined` is not an error. A raw value that normalizes
     to System without being `'system'` is logged at debug (`unknown theme preference,
using System`).
     A theme picked in the desktop Settings window reaches the snapshot through
     `apps/web/src/lib/offline-settings-sync.ts:494-501` →
     `OfflineEditorController.ts:345` → `WorkspaceService.ts:951`.
   - The reader runs once, when the window is created. Contract: the saved theme choice is
     fixed when the HUD is created; a System choice keeps following the OS appearance live
     through its media query, while an explicit theme ignores the OS, as in the app (D-4). Later progress events only run the existing update
     script; a theme changed during a download keeps the HUD palette until the HUD closes on
     `update-downloaded` (`AutoUpdater.ts:205-214`) or the next download opens a new HUD
     (documented limit; the same holds for a HUD created while the account is not `ready`,
     for example during startup or while locked: it stays on System until the next HUD,
     because a per-tick re-read would be the dropped CEO-3 reload; N-1). Dismissed
     alternatives: Default-only following the OS (fails issue
     acceptance 1 for a non-Default pick) and a live in-place swap on each tick (CEO-3,
     dropped after both CEO voices judged it over-scoped for a rare, short-lived surface).
   - HUD states (existing behavior, unchanged; D-3):
     | State                       | What the user sees                                                                                                  |
     | --------------------------- | ------------------------------------------------------------------------------------------------------------------- |
     | before Download Now         | no HUD                                                                                                              |
     | Download Now clicked        | the HUD opens at 0% before `downloadUpdate()` starts (`AutoUpdater.ts:307-312`); the theme reader runs here (C-1)   |
     | 0-99%                       | label, percent, bar, hint                                                                                           |
     | `update-downloaded`         | a 100% update is requested, then the HUD closes (`AutoUpdater.ts:205-214`); the 100% frame may never paint          |
     | error or cancelled download | `clearDownloadProgress` closes the HUD (`AutoUpdater.ts:470-472`); the updater status carries the error to Settings |
     | stalled download            | the last percent stays; no timeout                                                                                  |
4. Guards and docs.
   - Remove the `#214` allowlist entry for `update-progress-window-html.ts` from
     `apps/web/src/lib/themes/no-hardcoded-amber.test.ts`, and add the generated token module to
     `THEME_DEFINITION_PATHS` (it legitimately contains Cathedral amber). The existing
     assertion that the `issue: 214` entry points at the builder
     (`no-hardcoded-amber.test.ts:282-284`) becomes a regression check that the builder is no
     longer allowlisted, so the scan covers it (C-4).
   - DESIGN.md (DX-4): :161 names both generator outputs and the main-process consumer; :154
     regenerates when the registry or the Warm Cathedral blocks (`base.css` / `CATHEDRAL`)
     change; :363 says the generator rewrites both files; a short "Theme tokens in code"
     note shows, from the repository root, `pnpm theme:generate` → both files change →
     `pnpm theme:check` passes, and a copy-paste import
     (`import { THEME_TOKENS } from '@corelive/live-editor/theme-tokens'`;
     `THEME_TOKENS.dark['--primary']`), noting that the map has no `'system'` or legacy
     keys, so callers run `normalizeThemePreference` first. No other doc lists the outputs
     [measured: `git grep -n -e generated.css -e generate-theme-css -e theme:generate --
'*.md'`, excluding CHANGELOG and dated docs/designs; :363 does name generated.css].

## Tests / verification

- `apps/desktop/electron/__tests__/update-progress-window-html.test.ts`:
  - No stored theme / `'system'` / unknown value → Default light tokens in `:root`
    and Default dark tokens in the dark media block (hard-coded expected values, e.g.
    `--primary: oklch(0.205 0 0)` light, `--primary: oklch(0.922 0 0)` dark);
    no Warm Cathedral amber literal in the output.
  - `'cathedral-light'` → `--primary: oklch(0.56 0.16 50)`, `color-scheme: light`, no
    OS media token block; `'cathedral-dark'` → its dark values.
  - A derived family (`'harbor-dark'`) → its generated values (hard-coded from
    generated.css).
  - Legacy alias `'default-dark'` → Default dark.
  - Table test over `THEME_IDS`: each concrete id emits its own `--primary` and
    `--popover` from `THEME_TOKENS`.
  - The builder's token blocks (`:root` and the dark media block) declare only the five HUD
    tokens and `color-scheme`, asserted on `buildUpdateProgressWindowHtml` output (E-3).
  - Hostile or prototype-named values (`'</style><script>alert(1)</script>'`, `'__proto__'`,
    `'constructor'`) produce output byte-identical to `'system'` (E-4).
  - Existing markup/a11y/click-through/reduced-motion tests keep passing.
- `AutoUpdater.test.ts`: clicking Download Now (mocked message box response 0) opens the
  0% HUD with a data URL built with the reader's theme (C-1); the reader is called once per window, and later progress events (even
  after the reader would return another theme) run only the update script with no second
  `loadURL`; a throwing reader builds the System/Default HUD and logs one
  `UPDATE_HUD_THEME_READ_FAILED` warning; the one-argument constructor still works; after an
  error clears the HUD, the next Download Now calls the reader again and builds a new HUD
  with the current theme (C-1, N-7).
- `apps/desktop/electron/utils/readUpdateHudThemePreference.test.ts` (new, E-1): a `ready`
  snapshot returns its stored theme; each non-ready phase (`opening`, `preparing`,
  `needs-preparation`, `locked`, `recovery`) and a missing snapshot return `undefined`.
- `apps/web/src/lib/themes/generate-theme-css.test.ts`: the token module covers every
  `ThemeId`; derived entries equal `deriveThemeTokens`; cathedral equals `CATHEDRAL`;
  static equals registry `tokens`; `--check` reports `THEME_ARTIFACT_STALE` with the first
  differing line and `pnpm theme:generate` for a stale module, and `THEME_ARTIFACT_MISSING`
  with the same command for a missing one, both as thrown errors. Counts come from
  `THEME_IDS` and the `ThemeToken` keys, never hard-coded.
- `apps/web/src/lib/themes/update-hud-contrast.test.ts` (new; culori is available there): for
  every `THEME_TOKENS` entry, `--popover-foreground` and `--muted-foreground` on `--popover`
  are at least 4.5:1, `--primary` on `--popover` is at least 3:1, and `--primary` on the track
  (`--primary` at 20% alpha composited over `--popover` in sRGB, as the browser paints
  `color-mix(in oklch, var(--primary) 20%, transparent)`) is at least 3:1 (WCAG 1.4.11 for the
  fill against what touches it) (D-2, N-4, C-2). Measured on 2026-11-03 over all 14 themes:
  minimum muted/popover 4.73 (Default light), primary/popover 4.38 and primary/track 3.40
  (harbor-light) [measured: Eng review culori run over `THEME_REGISTRY`]. This covers all 14 themes quantitatively; screenshots cover representatives.
- `pnpm theme:check` (both artifacts), `pnpm --filter @corelive/live-editor lint` (the
  generated module is emitted lint-clean, so commit-time `eslint --fix` never rewrites it),
  `pnpm fallow:dupes`, `pnpm fallow:dead-code`, `pnpm electron:build:ts`, `pnpm validate`.
- QA, headless (isolated browser, no host input), at the real window size
  (`UPDATE_PROGRESS_WINDOW_WIDTH_PX` × `UPDATE_PROGRESS_WINDOW_HEIGHT_PX` = 360 × 118):
  render the exact builder output for System light, System dark (emulated), `cathedral-light`
  and `harbor-dark` at 0%, 42%, 75% (after the update script) and 100%, over light and dark
  page backdrops; flip the emulated color scheme while a System HUD is shown; record a video
  of the Default light 42% → 75% transition, extract its frames and confirm the fill moves
  smoothly; confirm reduced motion jumps instantly (D-5). Inspect every screenshot and frame.
- QA, native (issue acceptance 3; CLAUDE.md "Electron Native QA" names auto-update; a merge
  gate unless the owner approves User Challenge UC1 at the final gate): in the
  isolated Tart VM `corelive-qa` (`--no-graphics`, guest agent only, no host input), run an
  unsigned build of this branch (`pnpm electron:build:dir`) with the preserved QA-only
  synthetic update transport (`~/.local/share/corelive-qa/monorepo/prepare-native.mjs`
  prepends a harness to the extracted app.asar without editing repo sources; a small driver
  modeled on `native-updater.py` sends `download-progress` events through `tart exec`), and
  capture the real transparent HUD at first paint and after one progress update in guest
  light and dark appearance (System/Default). If the VM cannot run it, stop before merging
  and report it to the owner (CLAUDE.md "get the user's explicit OK before merging").

## Not in scope

- Theming other native surfaces (dialogs are OS-drawn).
- Reading the web app's localStorage theme for accounts without a prepared desktop
  workspace (they get the Default theme following the OS, per the issue's fallback); the PR
  body states this as a known limitation (D-7).
- The Electron release itself (the queued same-day `/electron-release` ships it).

<!-- autoplan-accepted:ceo -->

- CEO-1 (approach A): `pnpm theme:generate` writes `packages/live-editor/src/themes/themeTokens.generated.ts` exporting `THEME_TOKENS` with every `ThemeToken` value for every `ThemeId` (14 ids × 36 tokens on 2026-11-03, informational; tests derive the counts) — classified with `isStaticTheme` / `isDerivedTheme` / `preserve` (static → registry `tokens`, derived → `deriveThemeTokens(seed, id)`, cathedral → `CATHEDRAL[mode]`); the module is committed, prettier-ignored and lint-clean; `pnpm theme:check` fails, naming the stale file, when either generated.css or the token module differs from a fresh generation; exported as `@corelive/live-editor/theme-tokens`. Tests: generator unit tests for coverage of every id, per-kind equality, the stale-module check, counts derived from `THEME_IDS` and the `ThemeToken` keys.
- CEO-2 (issue acceptance 1-2): `buildUpdateProgressWindowHtml(progress, themePreference)` renders the normalized preference: `'system'`, missing, unknown → Default `light` tokens in `:root` plus Default `dark` tokens under `@media (prefers-color-scheme: dark)`; a concrete id or legacy alias → that theme's tokens only with its `color-scheme`; the token CSS comes from `buildUpdateProgressThemeCss(preference)`, which emits only `--popover`, `--popover-foreground`, `--muted-foreground`, `--border`, `--primary` and `color-scheme` and is total by type; the builder contains no literal hue values and never emits Warm Cathedral amber unless a cathedral theme is selected. Tests: system/missing/unknown, cathedral-light, cathedral-dark, harbor-dark, legacy `default-dark`, table over `THEME_IDS`, the five-token CSS.
- CEO-2b: the main process reads the preference from `offlineEditor.controller.getSnapshot()` when `phase === 'ready'` (`workspace.preferences.theme`, typed `OfflinePreferences['theme'] | undefined`), else no preference (Default following the OS); `AutoUpdater` receives it as an injected reader called once per window; a throwing reader counts as no preference. Contract: the HUD shows the saved desktop theme as of its start; a mid-download theme change keeps the HUD palette until it closes (documented limit). Tests: AutoUpdater builds the first window from the reader's value; later progress events never call the reader or `loadURL` again; a throwing reader builds the System/Default HUD.
- Guard: the `#214` allowlist entry leaves `no-hardcoded-amber.test.ts` and the generated token module joins `THEME_DEFINITION_PATHS`; the amber guard passes on the new builder. DESIGN.md:161 names the token module. `pnpm lint`, `pnpm fallow:dead-code`, `pnpm electron:build:ts` and `pnpm validate` pass.
- QA headless (isolated browser, no host input): screenshots of the exact builder HTML for System light, System dark (emulated), cathedral-light and harbor-dark at 42% and after the update script moves it to 75%, with System over light and dark page backdrops; each frame inspected.
- QA native (issue acceptance 3): an unsigned build of this branch in the isolated Tart VM `corelive-qa` (`--no-graphics`, guest agent only, no host input) with the preserved synthetic update transport; the real transparent HUD captured at first paint and after one progress update in guest light and dark appearance; frames inspected. If the VM cannot run it, stop before merging and report to the owner.

<!-- /autoplan-accepted:ceo -->

<!-- autoplan-accepted:design -->

- D-1: the HUD panel background is opaque `var(--popover)` and the `backdrop-filter` blur is removed. Test: builder output contains `background: var(--popover)` and no `backdrop-filter`.
- D-2: `apps/web/src/lib/themes/update-hud-contrast.test.ts` asserts, for every `THEME_TOKENS` entry, `--popover-foreground` and `--muted-foreground` on `--popover` ≥ 4.5:1 and `--primary` on `--popover` ≥ 3:1.
- D-3: the plan's HUD state table (none before the first progress event; 0-99% normal; final 100% tick then close on `update-downloaded`; error/cancel closes via `clearDownloadProgress`; stalled keeps the last percent) holds unchanged; Eng verifies each reference.
- D-4: contract — the saved theme choice is fixed at HUD creation; a System choice keeps following the OS appearance live; an explicit theme ignores the OS. Test: the System HTML contains the dark media block; QA flips the emulated color scheme on a shown System HUD.
- D-5: headless QA at 360 × 118 for System light/dark, cathedral-light, harbor-dark at 0/42/75/100% over light and dark backdrops, a recorded 42→75 transition with inspected frames, and an instant reduced-motion update.
- D-6: only color declarations and panel opacity change; markup, copy, typography, spacing, radius, track size, click-through, reduced motion and the update script stay as they are. Variant B is the Default light visual reference.
- D-7: the PR body states that a theme picked only in a browser (no prepared desktop workspace) leaves the HUD on Default following the OS.

<!-- /autoplan-accepted:design -->

<!-- autoplan-accepted:dx -->

- DX-1: the generator validates and generates both outputs before writing either; `--check` throws `THEME_ARTIFACT_STALE <path>` (first differing line, bounded excerpts, existing fix line) or `THEME_ARTIFACT_MISSING <path>` (fix line) so `tsx` exits non-zero on stderr; a write failure names the failed file and any already-written file; diagnostics carry only paths and bounded color excerpts. Tests: stale and missing module messages include the code and `pnpm theme:generate`.
- DX-2: a throwing HUD theme reader logs one `log.warn` with `UPDATE_HUD_THEME_READ_FAILED`, `phase=create-window`, `fallback=system`, the error message and the next-HUD re-read note, without theme values or account data; a raw value that normalizes to System without being `'system'` logs at debug. Test: the throwing-reader AutoUpdater test asserts the warn call.
- DX-3: the `AutoUpdater` constructor JSDoc documents the reader contract (synchronous, once per HUD, re-read for the next HUD, System fallback) with `@param` and `@example`.
- DX-4: DESIGN.md :161 names both outputs and the main-process consumer, :154 regenerates on registry or Warm Cathedral block changes, :363 names both regenerated files, and a "Theme tokens in code" note gives the root command, the expected two-file diff, `pnpm theme:check`, a copy-paste `THEME_TOKENS` import, and the normalize-first rule (no `'system'` or legacy keys).
- DX-5: the reader is an optional second argument typed `() => OfflinePreferences['theme'] | undefined` (type-only import); the one-argument constructor keeps working. Test: the existing one-argument construction still passes.
- DX-6: the generated module header says AUTO-GENERATED, names `pnpm theme:generate`, and explains why it carries every token; `--check` compares raw generator output (prettier-ignored file).

<!-- /autoplan-accepted:dx -->

<!-- autoplan-accepted:eng -->

- E-1: `apps/desktop/electron/utils/readUpdateHudThemePreference.ts` exports `readUpdateHudThemePreference(snapshot: OfflineEditorSnapshot | undefined): OfflinePreferences['theme'] | undefined` (ready → `workspace.preferences.theme`; any other phase or a missing snapshot → `undefined`); `main.ts` passes `() => readUpdateHudThemePreference(offlineEditor?.controller.getSnapshot())` as the `AutoUpdater` reader. Test: colocated `readUpdateHudThemePreference.test.ts` covers ready, `opening`, `preparing`, `needs-preparation`, `locked`, `recovery` and `undefined`.
- E-2: `packages/live-editor/src/themes/themeTokens.generated.ts` is added to `.fallowrc.jsonc` `duplicates.ignore` only (not `ignorePatterns`). Verify: `pnpm fallow:dupes` and `pnpm fallow:dead-code` pass.
- E-3: `buildUpdateProgressThemeCss` stays module-private; tests assert the five-token + `color-scheme` contract on `buildUpdateProgressWindowHtml` output.
- E-4: the raw theme preference is never written into the HUD HTML; only the normalized `ThemeId | 'system'` selects a `THEME_TOKENS` entry. Test: `'</style><script>alert(1)</script>'`, `'__proto__'` and `'constructor'` produce output byte-identical to `'system'`.
- E-5: the generated module declares `THEME_TOKENS: Readonly<Record<ThemeId, Readonly<Record<ThemeToken, string>>>>` by annotation (no `as` cast); the generator throws `THEME_TOKEN_SET_MISMATCH <themeId> missing=<keys> extra=<keys>` before writing when a resolved map's keys differ from `ThemeToken`. Test: a seed/map with a missing and an extra key throws that code.
- E-6: `checkThemeArtifacts(artifacts)` and `writeThemeArtifacts(artifacts)` are exported from `apps/web/scripts/generate-theme-css.ts` over `{ absolutePath, repoPath, content }[]` with the real `node:fs`; the direct-run block only builds the two-artifact list and calls them; every `describeThemeCssDrift` caller/test uses the new signature. Tests in a `mkdtempSync` directory: stale → `THEME_ARTIFACT_STALE` + first differing line + `pnpm theme:generate`; missing → `THEME_ARTIFACT_MISSING` + `pnpm theme:generate`; a second target inside a nonexistent directory → the message names the failed file and the already-written file.
- C-1: the HUD state table says the HUD opens at 0% on Download Now (`AutoUpdater.ts:307-312`) and that the 100% frame may never paint before close. Tests: Download Now (message box response 0) builds the HUD from the reader's theme with one reader call; after an error clears the HUD, the next Download Now calls the reader again and builds a new HUD with the current theme.
- C-2: `update-hud-contrast.test.ts` also asserts `--primary` against the track (`--primary` at 20% alpha composited over `--popover` in sRGB) ≥ 3:1 for every `THEME_TOKENS` entry, besides primary/popover ≥ 3:1 and the two text pairs ≥ 4.5:1.
- C-4: the `issue === 214` allowlist assertion in `no-hardcoded-amber.test.ts` is replaced by an assertion that `apps/desktop/electron/update-progress-window-html.ts` is not in `ALLOWLIST`; the scan passes on the new builder.
- C-5 / N-3: `OfflinePreferences` / `OfflineEditorSnapshot` are type-only imports from `@corelive/desktop-contract/offline-workspace`; `normalizeThemePreference`, `THEME_IDS` and `ThemeId` come from `@corelive/live-editor/themes`; `THEME_TOKENS` from `@corelive/live-editor/theme-tokens`. Verify: `pnpm typecheck`, `pnpm electron:build:ts`.
- N-1: Step 3's documented limit also covers a HUD created while the account is not `ready` (it stays on System until the next HUD); no per-tick re-read (binding CEO-7). The PR body lists it with D-7.
- N-7: the Default dark expectation is the literal `--primary: oklch(0.922 0 0)`.
- Gates: `pnpm --filter @corelive/live-editor lint` on the generated module, `pnpm fallow:dupes`, `pnpm fallow:dead-code`, `pnpm electron:build:ts` and `pnpm validate` pass. The native VM capture stays a merge gate unless the owner approves UC1.

<!-- /autoplan-accepted:eng -->

## Review record

### CEO Step 0 (autoplan Phase 1, SELECTIVE EXPANSION)

Run: fix-214-update-window-theme-20261103-013314 · base ca76c4bf · owner auto-decide
standing instruction (2026-11-02 「全て選択肢はrecommend」), headless QA only
(「仕事中なので動作確認は/agent-desktop-macosで画面と操作を奪わずに行うこと」).

#### Pre-review system audit

- `git log -12`: #219 (default theme = shadcn Default, v0.28.0) and #220 (dslint
  removal, v0.28.1) are the last two merges; this is the third of the day's queue
  (#213 → #218 → #214 → #215 → #216 → /electron-release).
- No diff on the branch yet. One stash `stash@{0}: On main: wip flex` belongs to the owner;
  untouched. No TODO/FIXME/HACK in the touched files [measured: grep over the 6 files].
- TODOS.md does not exist and must not be recreated (CLAUDE.md "Resolve discovered TODOs").
- Retrospective: #213 (`docs/designs/default-theme-shadcn.md`) filed this as a follow-up and
  left the `#214` allowlist entry in `no-hardcoded-amber.test.ts:56-60`; the owner has
  corrected "amber as the default" more than once (memory: default theme is shadcn).
- UI scope: yes (a rendered native HUD). DX scope: yes by term threshold (generator,
  package export).
- Taste calibration — good references: `apps/desktop/renderer/NativeEditor.tsx:53-70`
  (normalize + OS media, one place), `packages/live-editor/src/themes/registry.ts`
  helpers with `@example`s, `apps/web/src/lib/themes/preview.ts` (hand-copy guarded by a
  cross-check test). Pattern to avoid: the current hard-coded CSS in
  `update-progress-window-html.ts:32-51` (a second, untested palette).
- Landscape (WebSearch; Aside excluded by the owner's QA constraint): Layer 1 = Electron
  `nativeTheme` + `prefers-color-scheme` for light/dark and IPC for app state; Layer 2 =
  no standard for sharing design tokens with a `data:` window, one public example keeps
  three stylesheets in sync by hand; Layer 3 = one generated source plus a drift check
  beats any hand copy. No eureka.
- Brain context: cold (no product/goals digests).

#### 0A. Premise challenge

| premise | claim                                                                             | file:line receipt                                                                                                            | verdict                                                      |
| ------- | --------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------ |
| P1      | The HUD always paints Warm Cathedral amber                                        | `apps/desktop/electron/update-progress-window-html.ts:32-51`                                                                 | verified                                                     |
| P2      | Main cannot derive tokens at runtime (culori is build/test only)                  | `apps/web/scripts/generate-theme-css.ts:27`, `apps/web/src/lib/themes/contrast.ts:6-10`                                      | verified                                                     |
| P3      | Main holds the active account's cached theme                                      | `apps/desktop/electron/offline/OfflineEditorController.ts:159`, `packages/desktop-contract/src/offline-workspace.ts:135-139` | verified                                                     |
| P4      | Stored value is `'system'` or a `ThemeId`; System = Default pair following the OS | `packages/live-editor/src/themes/registry.ts:487-496`, `apps/web/src/hooks/useThemeAxis.ts` (System rule JSDoc)              | verified                                                     |
| P5      | The HUD exists only in packaged builds during a download                          | `apps/desktop/electron/main.ts:707-720`                                                                                      | verified                                                     |
| P6      | Users without a prepared desktop workspace should get Default following the OS    | issue #214 acceptance criterion 2; `registry.ts:496`                                                                         | verified (owner is the only user and has a prepared account) |
| P7      | A theme change during a download should show without restarting the download      | assumption from the issue's "uses the current theme"                                                                         | unverified (accepted as cheap polish, see CEO-3)             |

unverified=1. Real problem: after #213 the HUD is the last amber surface for a Default
user, which contradicts the owner's repeated "default is shadcn, not amber" direction.
Do-nothing cost: every update shows the wrong palette. The plan fixes the cause (no
token source in main), not a proxy.

#### 0B. Existing code leverage

| Sub-problem        | Existing code                                                                               | Plan                                           |
| ------------------ | ------------------------------------------------------------------------------------------- | ---------------------------------------------- |
| Token values       | registry static `tokens`, `deriveThemeTokens`, `CATHEDRAL` (`generate-theme-css.ts:59-273`) | reuse inside the generator; no runtime copy    |
| Preference meaning | `normalizeThemePreference`, `getThemeMode` (`registry.ts:550-579`)                          | reuse                                          |
| Theme source       | `controller.getSnapshot()`; same expression in `NativeEditor.tsx:86-91`                     | reuse                                          |
| Drift guard        | `pnpm theme:check` (`apps/web/package.json:127`)                                            | extend to the new artifact                     |
| Amber guard        | `no-hardcoded-amber.test.ts`                                                                | drop the #214 entry, list the generated module |

#### 0C. Dream state

```
  CURRENT STATE                  THIS PLAN                       12-MONTH IDEAL
  web + bundled editor read  ->  generator also emits a typed  -> every native surface (HUDs,
  one CSS source; the native     token map; the update HUD       future toasts/notifications)
  HUD carries its own amber      reads it with the cached        renders from the same generated
  palette                        preference, live                tokens and follows theme changes
```

#### 0D. Alternatives (CEO-1)

| Commitment            | Source | A (plan)                      | B (raw CSS)                                                        | C (renderer entry)                  |
| --------------------- | ------ | ----------------------------- | ------------------------------------------------------------------ | ----------------------------------- |
| Token source          | P2     | generated TS map              | `generated.css?raw` + `base.css?raw` in the data URL               | real Tailwind CSS in a bundled page |
| Explicitness          | P5     | typed, unit-testable          | relies on the browser ignoring `@custom-variant`/`@apply`/`@theme` | explicit, but new window kind       |
| Diff                  | —      | ~12 files, generator + module | ~6 files, no generator change                                      | ~15 files, new entry/protocol/CSP   |
| Later native surfaces | 0C     | reusable map                  | copy the same hack                                                 | reusable page                       |
| Completeness          | —      | 10                            | 7                                                                  | 8                                   |

Auto-decided A (P1 + P5; CEO phase P1/P2 dominate). B is the smaller diff and stays a
TASTE note: it reuses the exact CSS, but a future `@import` in base.css would silently
fail inside a `data:` page.

#### 0E. Mode

SELECTIVE EXPANSION (autoplan override). Planned changed files ≈12-14 [estimated], below
the 15-file reduction threshold.

#### 0F/0G. HOLD checks and cherry-picks

HOLD checks: (1) ~11 code files, no new classes, one new generated module — the module is
the minimum for P2; (2) minimum change = steps 1-2 plus the theme reader; (3) keep the
issue's three acceptance criteria. Defer/keep: the mid-download theme follow-up (step 3,
second bullet) — keep (CEO-3, completeness, a few lines).

Delight scan (in the same file unless noted):

| #   | Proposal                                                                                                               | Effort | Decision         | Reasoning                                                                              |
| --- | ---------------------------------------------------------------------------------------------------------------------- | ------ | ---------------- | -------------------------------------------------------------------------------------- |
| E1  | Swap tokens in place (replace one `<style>` via `executeJavaScript`) instead of reloading the window on a theme change | S      | ACCEPTED (CEO-3) | no flash, keeps progress state; serves the issue's goal                                |
| E2  | Show transferred/total size and speed in the HUD                                                                       | S      | SKIPPED          | a different feature; owner prefers one request per pipeline                            |
| E3  | Opaque surface under macOS "Reduce transparency" (`prefers-reduced-transparency`)                                      | S      | SKIPPED          | a11y polish outside #214; TASTE note                                                   |
| E4  | Make `apps/web/src/lib/themes/preview.ts` read the generated map instead of its hand copy                              | S      | SKIPPED          | not a defect, already cross-checked by `preview.test.ts`; widens the web client bundle |
| E5  | Align the HUD font stack to Tailwind `font-sans` (`ui-sans-serif, system-ui, sans-serif`)                              | S      | ACCEPTED (CEO-4) | DESIGN.md:39-42 names the stock stacks; same file, two lines                           |

#### 0H. CEO plan, baseline edits and accepted obligations

CEO_STEP0_CHECKPOINT: `.gstack/tmp/autoplan/autoplan-ceo-zSTurZ/ceo-implementation.md`
(sha 0f39a90d). Baseline edits (CEO-3 in-place token swap, CEO-4 font stacks):

<!-- autoplan-baseline-edits:ceo {"sourceSha256":"0f39a90dc40f8047c1afcfcf7b70e7ee114219b9296e43240065ff2d3a407de3","replacements":[{"oldText":"     (header: AUTO-GENERATED, run `pnpm theme:generate`).","newText":"     (header: AUTO-GENERATED, run `pnpm theme:generate`). Each entry is classified with the\n     registry guards (`isStaticTheme` / `isDerivedTheme`, else `preserve: true`;\n     `registry.ts:156-171`) and keyed by its `id`; the mode comes from the entry's `mode`\n     field, and the Default dark pair member is `THEME_TOKENS.dark`. The module is committed,\n     like generated.css, so a fresh checkout builds from it; `theme:check` catches staleness."},{"oldText":"   - Export it from `packages/live-editor/package.json` as `./theme-tokens`.","newText":"   - Export it from `packages/live-editor/package.json` as `./theme-tokens`. electron-vite\n     bundles `@corelive/live-editor` into main (`apps/desktop/electron.vite.config.ts:8-11`;\n     main already imports `@corelive/live-editor/draft-edits`), so there is no new external.\n     The module joins `.prettierignore` next to generated.css (`.prettierignore:32-33`) and is\n     emitted lint-clean; the desktop main bundle consumes `THEME_TOKENS`, so Fallow sees it\n     used. The `theme:check` script itself is unchanged."},{"oldText":"   - A concrete id: `:root` gets only that theme's tokens and `color-scheme: <mode>`; no OS\n     media block (an explicit pick is not OS-managed).","newText":"   - A concrete id: `:root` gets only that theme's tokens and `color-scheme: <mode>`; no OS\n     media block (an explicit pick is not OS-managed).\n   - The token CSS comes from one exported helper `buildUpdateProgressThemeCss(preference)`\n     that emits only the five tokens the HUD reads (`--popover`, `--popover-foreground`,\n     `--muted-foreground`, `--border`, `--primary`) plus `color-scheme`. It is total by type:\n     `normalizeThemePreference` returns `ThemeId | 'system'` and `THEME_TOKENS` is a\n     `Record<ThemeId, …>`, so no lookup can miss; a table test over `THEME_IDS` backs it.\n     `color-mix(in oklch, …)` needs Chromium 111+; the packaged Electron 44 Chromium has it,\n     and the native capture confirms it."},{"oldText":"     is `ready`, else `undefined`.","newText":"     is `ready`, else `undefined`; its return type is `OfflinePreferences['theme'] | undefined`\n     (indexed from `packages/desktop-contract/src/offline-workspace.ts:135-139`), so a schema\n     change breaks the build. A throwing reader counts as no preference (logged at debug).\n     A theme picked in the desktop Settings window reaches the snapshot through\n     `apps/web/src/lib/offline-settings-sync.ts:494-501` →\n     `OfflineEditorController.ts:345` → `WorkspaceService.ts:951`."},{"oldText":"   - The window remembers the normalized preference it was built with. On each progress\n     update, if the current normalized preference differs, reload the window HTML with the\n     new theme instead of running the update script (a theme changed in Settings mid-download\n     shows on the next tick).","newText":"   - The reader runs once, when the window is created. Contract: the HUD shows the saved\n     desktop theme as of its start. Later progress events only run the existing update\n     script; a theme changed during a download keeps the HUD palette until the HUD closes on\n     `update-downloaded` (`AutoUpdater.ts:205-214`) or the next download opens a new HUD\n     (documented limit). Dismissed alternatives: Default-only following the OS (fails issue\n     acceptance 1 for a non-Default pick) and a live in-place swap on each tick (CEO-3,\n     dropped after both CEO voices judged it over-scoped for a rare, short-lived surface)."},{"oldText":"   - Update generator/theme docs that list generated outputs (wherever `generated.css` is\n     documented as the generator's only output).","newText":"   - DESIGN.md:161 (the generator paragraph) also names the token module and its main-process\n     consumer. DESIGN.md:154 and :363 mention the generator but not its outputs list; no\n     other doc does [measured: `git grep -n -e generated.css -e generate-theme-css -e\n     theme:generate -- '*.md'`, excluding CHANGELOG and dated docs/designs]."},{"oldText":"  - Existing markup/a11y/click-through/reduced-motion tests keep passing.","newText":"  - `buildUpdateProgressThemeCss(preference)` declares only the five HUD tokens and\n    `color-scheme`, and the builder embeds exactly that CSS.\n  - Existing markup/a11y/click-through/reduced-motion tests keep passing."},{"oldText":"  reader's theme; a changed preference on a later progress event reloads instead of\n  running the update script; an unchanged one runs the update script.","newText":"  reader's theme; the reader is called once per window, and later progress events (even\n  after the reader would return another theme) run only the update script with no second\n  `loadURL`; a throwing reader builds the System/Default HUD."},{"oldText":"  static equals registry `tokens`; `--check` reports a stale token module.","newText":"  static equals registry `tokens`; `--check` reports a stale token module. Counts come from\n  `THEME_IDS` and the `ThemeToken` keys, never hard-coded."},{"oldText":"- QA (headless, no host input): render the exact builder output in an isolated headless\n  browser for System (light + dark emulated), `cathedral-light`, `cathedral-dark`,\n  `harbor-dark` and `graphite-light` at 42% and after the update script moves it to 75%;\n  inspect screenshots. The BrowserWindow options and native behavior are unchanged, so no\n  native VM run (taste decision, see review).","newText":"- QA, headless (isolated browser, no host input): render the exact builder output for\n  System light, System dark (emulated), `cathedral-light` and `harbor-dark` at 42% and after\n  the update script moves it to 75%; System over light and dark page backdrops (the 96%\n  panel on a transparent window); inspect every screenshot.\n- QA, native (issue acceptance 3; CLAUDE.md \"Electron Native QA\" names auto-update): in the\n  isolated Tart VM `corelive-qa` (`--no-graphics`, guest agent only, no host input), run an\n  unsigned build of this branch (`pnpm electron:build:dir`) with the preserved QA-only\n  synthetic update transport (`~/.local/share/corelive-qa/monorepo/prepare-native.mjs`\n  prepends a harness to the extracted app.asar without editing repo sources; a small driver\n  modeled on `native-updater.py` sends `download-progress` events through `tart exec`), and\n  capture the real transparent HUD at first paint and after one progress update in guest\n  light and dark appearance (System/Default). If the VM cannot run it, stop before merging\n  and report it to the owner (CLAUDE.md \"get the user's explicit OK before merging\")."}]} -->

<!-- autoplan-accepted:ceo -->

- CEO-1 (approach A): `pnpm theme:generate` writes `packages/live-editor/src/themes/themeTokens.generated.ts` exporting `THEME_TOKENS` with every `ThemeToken` value for every `ThemeId` (14 ids × 36 tokens on 2026-11-03, informational; tests derive the counts) — classified with `isStaticTheme` / `isDerivedTheme` / `preserve` (static → registry `tokens`, derived → `deriveThemeTokens(seed, id)`, cathedral → `CATHEDRAL[mode]`); the module is committed, prettier-ignored and lint-clean; `pnpm theme:check` fails, naming the stale file, when either generated.css or the token module differs from a fresh generation; exported as `@corelive/live-editor/theme-tokens`. Tests: generator unit tests for coverage of every id, per-kind equality, the stale-module check, counts derived from `THEME_IDS` and the `ThemeToken` keys.
- CEO-2 (issue acceptance 1-2): `buildUpdateProgressWindowHtml(progress, themePreference)` renders the normalized preference: `'system'`, missing, unknown → Default `light` tokens in `:root` plus Default `dark` tokens under `@media (prefers-color-scheme: dark)`; a concrete id or legacy alias → that theme's tokens only with its `color-scheme`; the token CSS comes from `buildUpdateProgressThemeCss(preference)`, which emits only `--popover`, `--popover-foreground`, `--muted-foreground`, `--border`, `--primary` and `color-scheme` and is total by type; the builder contains no literal hue values and never emits Warm Cathedral amber unless a cathedral theme is selected. Tests: system/missing/unknown, cathedral-light, cathedral-dark, harbor-dark, legacy `default-dark`, table over `THEME_IDS`, the five-token CSS.
- CEO-2b: the main process reads the preference from `offlineEditor.controller.getSnapshot()` when `phase === 'ready'` (`workspace.preferences.theme`, typed `OfflinePreferences['theme'] | undefined`), else no preference (Default following the OS); `AutoUpdater` receives it as an injected reader called once per window; a throwing reader counts as no preference. Contract: the HUD shows the saved desktop theme as of its start; a mid-download theme change keeps the HUD palette until it closes (documented limit). Tests: AutoUpdater builds the first window from the reader's value; later progress events never call the reader or `loadURL` again; a throwing reader builds the System/Default HUD.
- Guard: the `#214` allowlist entry leaves `no-hardcoded-amber.test.ts` and the generated token module joins `THEME_DEFINITION_PATHS`; the amber guard passes on the new builder. DESIGN.md:161 names the token module. `pnpm lint`, `pnpm fallow:dead-code`, `pnpm electron:build:ts` and `pnpm validate` pass.
- QA headless (isolated browser, no host input): screenshots of the exact builder HTML for System light, System dark (emulated), cathedral-light and harbor-dark at 42% and after the update script moves it to 75%, with System over light and dark page backdrops; each frame inspected.
- QA native (issue acceptance 3): an unsigned build of this branch in the isolated Tart VM `corelive-qa` (`--no-graphics`, guest agent only, no host input) with the preserved synthetic update transport; the real transparent HUD captured at first paint and after one progress update in guest light and dark appearance; frames inspected. If the VM cannot run it, stop before merging and report to the owner.

<!-- /autoplan-accepted:ceo -->

#### 0H. Spec Review Loop and document approval

CEO summary: `~/.gstack/projects/laststance-corelive/ceo-plans/2026-11-03-update-window-theme.md`.
Spec Review Loop: 3 launches (cap). R1 7/10, 15 issues → CEO-5 (incl. the reversal of the
"no VM" taste call to native QA in the Tart VM). R2 7/10, 19 issues → CEO-6 and the reversal
of CEO-4 (HUD already uses a system stack; a node_modules-layout test is churn). R3 7/10:
Completeness, Consistency and Scope PASS; the 4 remaining gaps (theme classification,
committed module, synthetic update transport, final 100% tick) were applied as baseline
edits and verified against export `autoplan-ceo-DBEDdE` lines 50-54, 110-112 and 160-163
(issues verified: 4 of 4; spec not re-verified by a reviewer). Metrics appended to
`analytics/spec-review.jsonl` (iterations 3, found 38, fixed 34, remaining 4, score 7).
Document approval: auto-decided **A) Approve these documents and continue to 0I**
(owner standing instruction; both documents carry the same decisions).

#### 0I. Temporal interrogation

```
  HOUR 1 (foundations):  generator: classify static/derived/preserved, emit THEME_TOKENS module,
                         --check both files; package export; .prettierignore entry
  HOUR 2-3 (core logic): buildUpdateProgressThemeCss (5 tokens + color-scheme, System media pair),
                         builder with <style id="theme-tokens">, swap script string
  HOUR 4-5 (integration): AutoUpdater reader injection, remembered preference, swap-on-tick with
                         advance-on-true, main.ts reader from the ready snapshot
  HOUR 6+ (polish/tests): builder/AutoUpdater/generator tests, amber guard, DESIGN.md:161,
                         headless renders, unsigned build + Tart VM capture
```

Surprises to expect: the generated module must be formatted exactly as the generator writes it
(prettierignore) and must satisfy ESLint as emitted; `executeJavaScript` on a still-loading window
(handled by `Boolean(style)` + retry); the VM harness (`prepare-native.mjs`) prepends to the
built `index.cjs`, so the unsigned build must exist first. Effort: human ~1.5 days / CC ~1.5 h
[estimated]. No feasibility blocker; no pending CEO choice.

#### CEO decision ledger

| ID and owner         | Contract and evidence               | Current                                              | Proposed                     | Status   | Exact approval and scope                                                          |
| -------------------- | ----------------------------------- | ---------------------------------------------------- | ---------------------------- | -------- | --------------------------------------------------------------------------------- |
| CEO-1 (CEO)          | token source for main               | generated THEME_TOKENS module (A)                    | B raw CSS / C renderer entry | approved | autoplan auto-decide (P1+P5), owner standing instruction 2026-11-02; TASTE note B |
| CEO-2 / CEO-2b (CEO) | issue acceptance 1-2                | normalized-preference builder; ready-snapshot reader | —                            | approved | baseline scope of #214                                                            |
| CEO-3 (CEO)          | live theme follow during download   | in-place swap, advance on `true`                     | reload / next-window only    | approved | auto-decide P1 (same file, S); TASTE note (YAGNI pushback by spec R2)             |
| CEO-4 (CEO)          | DESIGN.md font stacks               | not changed (system stack kept)                      | Tailwind stacks verbatim     | declined | reversed in spec R2 (P3/P5)                                                       |
| CEO-5, CEO-6 (CEO)   | spec-review fixes                   | applied                                              | —                            | approved | auto-decide P1                                                                    |
| QA-native (CEO)      | CLAUDE.md native QA for auto-update | Tart VM gates merge                                  | headless only                | approved | CLAUDE.md rule + issue acceptance 3 (reversal of my taste call)                   |
| E2, E3, E4 (CEO)     | delight scan                        | skipped                                              | add                          | declined | outside #214; owner one-request-per-pipeline preference                           |

Approval readiness: PASS — rows CEO-1, CEO-2/2b, CEO-3, CEO-5/6 and QA-native cite the
owner's standing auto-decide instruction (2026-11-02 「全て選択肢はrecommend」) as the
preamble-authorized per-issue auto-decision; CEO-4 and E2-E4 are declined and stay out of
accepted work.

### CEO dual voices (autoplan Phase 1, Step 0.5)

Input bound to both voices: `autoplan-ceo-JQdaDc/ceo-implementation.md` (sha 2c5038ec).

- **Claude CEO subagent (in-host, completed, INPUT hash matched):** HIGH over-engineering —
  the live swap (CEO-3) with retry state is disproportionate for a seconds-to-minutes HUD;
  HIGH the full 36-token module is wider than the five tokens the HUD reads; MEDIUM the cheap
  "neutral Default following the OS" option is not named as dismissed; MEDIUM 6-month risk of
  preference-source drift (type the reader from the controller); MEDIUM VM-gated merge is
  disproportionate, keep one native light/dark capture and shrink the headless matrix; LOW
  competitive risk N/A. Recommended: build once, drop the swap.
- **Codex CEO voice (gpt-6-astra, OUTSIDE_STATUS: completed, VERDICT findings P1):** High —
  a single-user fix grown into unvalidated feature investment; compare Default-only,
  apply-once and full-follow; High — the HUD is always-on-top and not dismissable, so "should
  it stay up" is the bigger product question (`AutoUpdater.ts:394`, Settings already shows
  progress at `AppUpdateSettings.tsx:272`); High — the VM-gated merge conflicts with
  `AGENTS.md:16-24` / `docs/headless-development.md:8` (VM not required since 2026-10-07)
  and the no-flash claim had no video plan; Medium — the theme contract covers only prepared
  desktop workspaces while optimizing rare mid-download changes. Recommendation: limit this
  fix to applying the theme at HUD start plus QA that follows current policy.

```
CEO DUAL VOICES — CONSENSUS TABLE:
  Dimension                             Claude   Codex    Consensus
  1. Premises valid?                     partly   partly   CONFIRMED (amber fix valid; scope premise weak)
  2. Right problem to solve?             yes      yes*     CONFIRMED (*Codex adds HUD-existence question)
  3. Scope calibration correct?          no       no       CONFIRMED: drop live swap
  4. Alternatives sufficiently explored? no       no       CONFIRMED: add Default-only / apply-once
  5. Competitive/market risks covered?   N/A      partly   DISAGREE (opportunity cost only; low)
  6. 6-month trajectory sound?           concern  concern  CONFIRMED (rare-case spec = debt)
```

Integration (Outside Voice Integration Rule; auto-decided, P3/P5 eng-style tiebreak):

- Drop CEO-3 and the swap parts of CEO-5/CEO-6 (both voices; CEO-3 was my own expansion, not
  the owner's direction) → the reader runs once at window creation; contract "saved desktop
  theme as of HUD start"; mid-download change = documented limit. Applied as CEO-7.
- Name dismissed alternatives (Default-only fails acceptance 1; live swap over-scoped). Applied.
- Reader typed `OfflinePreferences['theme'] | undefined` (Claude #4). Applied.
- Shrink the headless matrix to System light/dark, cathedral-light, harbor-dark; no swap video
  needed because no dynamic claim remains (Claude #5, Codex #3 video point). Applied.
- **TASTE T1:** keep the full 36-token map (Claude #2 wanted a five-token module; Codex did
  not object). Generic map = one artifact per concept, reusable by later native surfaces.
- **USER CHALLENGE UC1 (both voices):** remove the native-VM merge gate. The issue's
  acceptance criterion 3 asks for VM screenshots of a running download; both voices recommend
  sizing QA to risk and following `AGENTS.md:16-24` (headless + contract tests + packaging).
  The owner's direction stands until approved: native VM capture stays (minimal: System
  light/dark first paint + one progress update), and a VM that cannot run stops the merge.
- Declined: Codex #2 (HUD existence/dismissal) — the HUD is click-through
  (`setIgnoreMouseEvents(true)`, `pointer-events: none`) by an earlier design; not a defect and
  outside #214. Recorded in NOT in scope.

### Current scope (before Section 1)

Mode SELECTIVE EXPANSION (autoplan override). Accepted: CEO-1, CEO-2, CEO-2b (with CEO-7
apply-once contract), guards, headless QA, native VM QA. Declined: CEO-3 live swap (after
voices), CEO-4 font stacks, E2-E4. Pending for the final gate: UC1 (VM gate), T1 (token map
width). Section 1: Architecture Review.

#### Section 1: Architecture Review

```
  build time                                   run time (packaged Electron main)
  ┌──────────────────────────────┐            ┌─────────────────────────────────────────┐
  │ registry.ts (THEME_REGISTRY) │            │ main.ts                                 │
  │   │                          │            │  offlineEditor.controller.getSnapshot() │
  │   ▼                          │            │   │ ready? preferences.theme : undefined│
  │ generate-theme-css.ts        │            │   ▼                                     │
  │  ├─ generated.css (existing) │            │ AutoUpdater(prepareForQuit, readTheme)  │
  │  └─ themeTokens.generated.ts │──import──▶ │  download-progress (first)              │
  │      THEME_TOKENS (NEW)      │            │   ├─ readTheme() once (try/catch)       │
  │ theme:check (both files)     │            │   ├─ buildUpdateProgressWindowHtml(p,t) │
  └──────────────────────────────┘            │   │    └─ buildUpdateProgressThemeCss   │
                                              │   └─ BrowserWindow.loadURL(data:...)    │
                                              │  download-progress (later) → update JS  │
                                              │  update-downloaded → close HUD          │
                                              └─────────────────────────────────────────┘
```

Data flow (theme preference): happy = ready snapshot `'cathedral-dark'` → normalize → that
theme's 5 tokens; nil = no snapshot / not ready → `undefined` → `'system'` → Default pair by
OS; empty = `''` cannot occur (Zod `min(1)`, `offline-workspace.ts:137`), and would normalize to
`'system'` anyway; error = reader throws → caught → `'system'`, debug log.

State (HUD lifecycle, unchanged except the theme read):

```
  [no HUD] --first download-progress--> [HUD shown, theme fixed]
  [HUD shown] --download-progress--> [HUD shown] (update script only; theme never re-read)
  [HUD shown] --update-downloaded | error | cleanup--> [no HUD]
  invalid: theme change while shown → no transition (documented limit)
```

Coupling: new build-time edge generator → live-editor module (same as generated.css today);
new runtime edge desktop main → `@corelive/live-editor/theme-tokens` (bundled, like
`draft-edits`); AutoUpdater gains an injected reader (no import of the controller). Justified.
Scaling: N/A (one window per download). SPOF: none new. Security: no new endpoint, no new
input surface (see §3). Rollback: revert the PR and cut a patch release; the old HUD returns.
Value test: the token module is consumed by product code (the HUD), not a process artifact.
Findings: the swap path (removed by CEO-7). No other issues.

#### Section 2: Error & Rescue Map

```
  METHOD/CODEPATH                      | WHAT CAN GO WRONG                 | EXCEPTION CLASS
  -------------------------------------|-----------------------------------|----------------------
  generateThemeTokensModule            | invalid registry color/alias      | Error THEME_INVALID_COLOR / THEME_ALIAS_TARGET (existing asserts)
  generate-theme-css --check           | token module or CSS stale         | Error (describeThemeCssDrift, names the file)
  readThemePreference (main.ts)        | controller missing / getSnapshot throws | any Error
  buildUpdateProgressThemeCss/Html     | none (total by type)              | —
  BrowserWindow.loadURL (existing)     | load fails                        | Error (existing .catch)
  executeJavaScript update (existing)  | window gone / loading             | Error (existing .catch)

  EXCEPTION CLASS          | RESCUED? | RESCUE ACTION                        | USER SEES
  -------------------------|----------|--------------------------------------|-------------------------
  THEME_INVALID_COLOR etc. | N (fatal)| generation aborts, nothing written    | developer: actionable error
  drift Error              | N (fatal)| CI / validate fails with fix command  | developer: stale file named
  reader Error             | Y        | treat as no preference, log.debug     | Default HUD following OS
  loadURL Error            | Y        | log.debug (existing)                  | no HUD (download continues)
  update-script Error      | Y        | log.debug (existing)                  | percent may lag one tick
```

No GAP rows.

#### Section 3: Security & Threat Model

No new endpoint, IPC channel, file path or job. The only new input is the stored theme string
(Zod `min(1).max(50)`, `offline-workspace.ts:137`), which is normalized against the registry
before use; the HTML only ever contains token values from the generated constant, never the raw
string, so CSS/HTML injection into the `data:` page is impossible (likelihood Low, impact Low,
mitigated by normalization + constants). No secrets, no new dependency (culori stays build-time),
no PII. No issues found.

#### Section 4: Data Flow & Interaction Edge Cases

```
  INPUT (snapshot.theme) -> VALIDATION (Zod at write, normalize at read) -> TRANSFORM (5 tokens CSS)
    -> PERSIST (none) -> OUTPUT (data: URL HTML)
  shadow: nil → system; ''/unknown/legacy → system or alias id; throw → system;
          stale generated module → theme:check fails before release; non-ready phase → system
```

Async ordering: the reader runs synchronously inside the first `download-progress` handler;
no await between read and build, so no interleaving can mix themes. Interaction edge cases:

| INTERACTION                        | EDGE CASE             | HANDLED?               | HOW?                          |
| ---------------------------------- | --------------------- | ---------------------- | ----------------------------- |
| theme change mid-download          | HUD keeps old palette | yes (documented limit) | next HUD uses new theme       |
| sign-out mid-download              | snapshot not ready    | yes                    | palette unchanged until close |
| second download after cancel/error | new HUD               | yes                    | reader runs again             |
| OS appearance flips on System      | media query           | yes                    | Default pair repaints live    |
| No unhandled gap.                  |

#### Section 5: Code Quality Review

New code fits existing patterns: generator gains a sibling emitter next to `generateThemesCss`;
the builder keeps its pure-function shape; DI of the reader mirrors `beforeInstall`. Duplication:
`main.ts` reader repeats `NativeEditor.tsx:86-91`'s ready-check expression in another process
(renderer vs main); extracting a shared helper into desktop-contract would couple a contract
package to a two-line expression — not worth it (no finding). Naming is intent-based. No method
branches >5 times. No issues found.

#### Section 6: Test Review

```
  NEW THING                        | TYPE | HAPPY                    | FAILURE                 | EDGE
  ---------------------------------|------|--------------------------|-------------------------|---------------------------
  THEME_TOKENS module (generator)  | unit | every id, per-kind equal | stale module → --check  | counts from THEME_IDS
  buildUpdateProgressThemeCss      | unit | cathedral-dark 5 tokens  | —                       | unknown/legacy/system
  buildUpdateProgressWindowHtml    | unit | System pair + media      | —                       | table over THEME_IDS
  AutoUpdater reader injection     | unit | first window themed      | reader throws → System  | later ticks: no re-read/loadURL
  amber guard                      | unit | builder passes guard     | —                       | generated module allowlisted
  HUD rendering                    | QA   | headless 4 states        | —                       | backdrops light/dark
  real window                      | QA   | VM light/dark capture    | VM unavailable → stop   | —
```

Assertion check: "no amber unless cathedral selected" rejects a regression to the hard-coded
palette (no_claim = real Cocoa compositing; covered by VM capture). "Reader once per window"
rejects a re-read that could mix themes (no_claim = Settings→snapshot sync, covered by existing
offline-settings-sync tests). Friday-2am test: System + cathedral-dark + unknown-value builder
tests plus the AutoUpdater first-window test. Flakiness: none (pure strings, mocked windows).

#### Section 7: Performance Review

The data URL grows by roughly 0.6 KB [estimated: 5 tokens × 2 modes]; the generated module adds
~14×36 strings to the main bundle (~20 KB [estimated]), loaded lazily with AutoUpdater's chunk
via `lazyLoadManager`. One synchronous snapshot read per download. No issues found.

#### Section 8: Observability & Debuggability Review

Existing logs cover window load/update failures (`log.debug`). New: reader failure is logged
at debug. Gap (non-blocking, owner = Eng phase): log the normalized preference used to build the
HUD at debug level so a "wrong colors" report three weeks later can be reconstructed from logs.
No metrics/alerts warranted for a cosmetic local surface.

#### Section 9: Deployment & Rollout Review

No DB migration, no feature flag needed. Rollout: merge → Vercel redeploys web (the web bundle is
unaffected; only the build-time generator and a new committed module change) → the queued
same-day `/electron-release` ships the desktop main change. Rollback: revert the PR + patch
release; installed apps keep the old HUD until updated. Post-deploy: the HUD appears only during
the next update download, so verification is the VM capture before merge, not a prod canary.

#### Section 10: Long-Term Trajectory Review

Debt: one more generated artifact (bounded by `theme:check`). Path dependency: positive — later
native surfaces can read `THEME_TOKENS`. Reversibility 5/5. Ecosystem fit: matches the
generator + registry pattern. A new engineer reads DESIGN.md:161 and finds both outputs.
Retrospective on cherry-picks: dropping CEO-3 and CEO-4 left the accepted scope load-bearing.

#### Section 11: Design & UX Review

The HUD shows one thing: label, percent, bar, hint. States: LOADING (progress) only; success
closes it; errors close it (Settings carries the error state). Emotional arc: a quiet,
on-theme notice instead of a foreign amber card. DESIGN.md alignment: tokens from the user's
theme, no hard-coded amber (the #213 direction). Accessibility unchanged (role=progressbar,
aria-live, reduced motion); contrast follows each theme's popover/foreground pair. Phase 2
(/plan-design-review) runs next because UI scope was detected.

```
  [download starts] → [HUD fades in at bottom center, user's theme] → [percent ticks] → [closes]
```

#### NOT in scope

- Live theme follow during a download (CEO-3) — dropped after both CEO voices (over-scoped).
- HUD font stacks (CEO-4) — the HUD already uses a system stack.
- Download size/speed in the HUD (E2), opaque surface under Reduce transparency (E3),
  `preview.ts` reading the generated map (E4) — outside #214.
- HUD existence/dismissal (Codex CEO #2) — click-through by design; not a defect.
- Web-only theme for accounts without a prepared desktop workspace — Default following the OS.
- Deferred to TODOS.md: none (no TODOS.md by repository rule).

#### What already exists

Registry + guards (`registry.ts`), `deriveThemeTokens` and `CATHEDRAL` (generator),
`normalizeThemePreference`, `controller.getSnapshot()`, the existing builder/update script,
`theme:check`, the amber guard, the preserved Tart VM harness. The plan reuses all of them.

#### Dream state delta

After this plan, main-process surfaces can theme from one generated, drift-checked source; the
HUD follows the saved theme at start. Remaining gap to the 12-month ideal: live follow and
other native surfaces (none exist today).

#### Error & Rescue Registry

See Section 2 (6 codepaths, 0 CRITICAL GAPS).

#### Failure Modes Registry

```
  CODEPATH                    | FAILURE MODE               | RESCUED? | TEST? | USER SEES?            | LOGGED?
  ----------------------------|----------------------------|----------|-------|-----------------------|--------
  generator                   | invalid registry           | N(fatal) | Y     | dev error             | Y
  theme:check                 | stale token module         | N(fatal) | Y     | CI failure            | Y
  reader                      | throws                     | Y        | Y     | Default HUD           | Y(debug)
  reader                      | snapshot not ready         | Y        | Y     | Default HUD           | N (expected)
  builder                     | unknown/legacy value       | Y        | Y     | System / alias theme  | N (expected)
  HUD                         | theme changed mid-download | Y(limit) | Y     | old palette till close| N
  loadURL (existing)          | load fails                 | Y        | Y     | no HUD                | Y(debug)
```

0 CRITICAL GAPS.

#### Reality rows

REALITY: premise-table pass 7 premises, unverified=1 apps/desktop/electron/update-progress-window-html.ts:32
REALITY: already-done pass no origin/main commit implements #214 (git log since 2026-11-01, -S THEME_TOKENS empty) apps/desktop/electron/update-progress-window-html.ts:21
REALITY: surface-check pass theme:generate, theme:check, electron:build:ts, electron:build:dir, qa:browser, fallow:dead-code exist package.json:71
REALITY: binding-decisions pass no branch decisions; AGENTS.md QA rule weighed in UC1 AGENTS.md:16
REALITY: numbers pass 14 ids and 36 tokens [measured: THEME_REGISTRY entries and the ThemeToken union] packages/live-editor/src/themes/registry.ts:94
REALITY: deferred-asks pass issue #214 acceptance 1-3 all kept (3 stays under UC1) apps/web/src/lib/themes/no-hardcoded-amber.test.ts:56
REALITY: pr-count pass no pr_count in ship policy, one PR .gstack/ship-policy.json:2

#### Implementation Tasks

- [ ] **T1 (P1, human: ~3h / CC: ~15min)** — generator — emit and check `themeTokens.generated.ts`
  - Surfaced by: 0D CEO-1
  - Files: apps/web/scripts/generate-theme-css.ts, packages/live-editor/src/themes/themeTokens.generated.ts, packages/live-editor/package.json, .prettierignore, apps/web/src/lib/themes/generate-theme-css.test.ts
  - Verify: `mise exec -- pnpm theme:check && mise exec -- pnpm --filter @corelive/web test -- generate-theme-css`
- [ ] **T2 (P1, human: ~2h / CC: ~10min)** — desktop — theme-aware builder
  - Surfaced by: CEO-2
  - Files: apps/desktop/electron/update-progress-window-html.ts, apps/desktop/electron/**tests**/update-progress-window-html.test.ts
  - Verify: `mise exec -- pnpm test:electron -- update-progress-window-html`
- [ ] **T3 (P1, human: ~2h / CC: ~10min)** — desktop — reader injection, apply once
  - Surfaced by: CEO-2b / CEO-7
  - Files: apps/desktop/electron/AutoUpdater.ts, apps/desktop/electron/main.ts, apps/desktop/electron/**tests**/AutoUpdater.test.ts
  - Verify: `mise exec -- pnpm test:electron -- AutoUpdater`
- [ ] **T4 (P1, human: ~30min / CC: ~5min)** — guards/docs — amber guard + DESIGN.md:161
  - Surfaced by: Guard
  - Files: apps/web/src/lib/themes/no-hardcoded-amber.test.ts, DESIGN.md
  - Verify: `mise exec -- pnpm test -- no-hardcoded-amber`
- [ ] **T5 (P1, human: ~3h / CC: ~30min)** — QA — headless renders + Tart VM capture
  - Surfaced by: QA rows / UC1
  - Files: none in repo (QA artifacts under .gstack/)
  - Verify: inspected screenshots; VM frames light/dark
- [ ] **T6 (P2, human: ~10min / CC: ~2min)** — observability — debug-log the normalized preference used for the HUD
  - Surfaced by: Section 8
  - Files: apps/desktop/electron/AutoUpdater.ts
  - Verify: AutoUpdater test asserts the debug call

#### Completion Summary

```
  +====================================================================+
  |            MEGA PLAN REVIEW — COMPLETION SUMMARY                   |
  +====================================================================+
  | Mode selected        | SELECTIVE EXPANSION                         |
  | System Audit         | HUD is the last amber surface after #213    |
  | Step 0               | approach A; CEO-3 dropped; VM QA kept (UC1) |
  | Section 1  (Arch)    | 1 issue (swap path, removed)                |
  | Section 2  (Errors)  | 6 error paths mapped, 0 GAPS                |
  | Section 3  (Security)| 0 issues found, 0 High severity             |
  | Section 4  (Data/UX) | 4 edge cases mapped, 0 unhandled            |
  | Section 5  (Quality) | 0 issues found                              |
  | Section 6  (Tests)   | Diagram produced, 0 gaps                    |
  | Section 7  (Perf)    | 0 issues found                              |
  | Section 8  (Observ)  | 1 gap found (T6)                            |
  | Section 9  (Deploy)  | 1 risk flagged (desktop needs release)      |
  | Section 10 (Future)  | Reversibility: 5/5, debt items: 1           |
  | Section 11 (Design)  | 0 issues (Phase 2 follows)                  |
  +--------------------------------------------------------------------+
  | NOT in scope         | written (6 items)                           |
  | What already exists  | written                                     |
  | Dream state delta    | written                                     |
  | Error/rescue registry| 6 rows, 0 CRITICAL GAPS                     |
  | Failure modes        | 7 total, 0 CRITICAL GAPS                    |
  | TODOS.md updates     | 0 items proposed (repository keeps none)    |
  | Scope proposals      | 6 proposed, 1 accepted (CEO-3 later dropped)|
  | CEO plan             | written                                     |
  | Outside voice        | codex completed (findings)                  |
  | Lake Score           | 2/2                                         |
  | Diagrams produced    | 4 (architecture, data flow, state, user flow)|
  | Stale diagrams found | 0                                           |
  | Unresolved decisions | 1 (UC1, final gate)                         |
  | Reality rows         | 7/7 rows (PLAN_REALITY), 1 unverified       |
  +====================================================================+
```

### Design review (autoplan Phase 2)

Methodology read in full (`autoplan-design-methodology-79kxq7`, lines 1-600, 601-1200,
1201-1577 EOF). Scope gate: autoplan target = this plan. DESIGN.md exists; all decisions
calibrate against it. No prior design reviews on this branch. UI scope: one native HUD (the
update-download progress window); no new screens.

#### Step 0

- 0A initial rating: **6/10** — the plan maps colors onto shadcn tokens but leaves contrast on
  a translucent window, the state set and the QA pass criteria to the implementer. A 10 names
  each surface token, proves contrast for every theme, lists every HUD state and fixes the QA
  frames at the real window size.
- 0B: DESIGN.md calibrates everything (stock shadcn tokens, system font stacks, calm surfaces).
- 0C reuse: the existing HUD markup and copy, shadcn Progress semantics (track = primary/20%),
  the theme tokens, `prefers-reduced-motion`, the Settings updater status.
- 0D focus: all 7 dimensions (autoplan override, P1).
- Step 0.5 mockups: DESIGN_READY. 3 variants of the Default light HUD generated
  (`designs/update-progress-hud-20261103/`): A failed `$D check` (centered, oversized); B and C
  passed and were eyeballed. Board not served (it would open a host browser, forbidden by
  `AGENTS.md:13-16`); **variant B auto-approved** (TASTE, owner standing instruction) as the
  closest to the brief: bottom center, near-black fill on a light track, white surface, gray hint.

#### Design dual voices

- **Claude design subagent (in-host, completed, INPUT hash matched):** high — contrast of the
  96% panel over unknown desktops is unverified for all themes (add an AA check per theme);
  high — web-only theme users see a Default HUD (state it); medium — QA covers 4 of 14 themes,
  no 0%/100% frames; medium — track vs panel distinguishability; medium — say typography and
  layout stay unchanged; medium — no solid fallback before `color-mix`; medium — concrete picks
  ignore the OS appearance (confirm consistency).
- **Codex design voice (gpt-6-astra, OUTSIDE_STATUS: completed, P1):** High — 96% white over
  black drops Default light muted text (`oklch(0.556 0 0)`, 13 px/12 px) from ~4.73:1 to
  ~4.33:1; make the panel opaque or gate composited contrast ≥4.5:1; Medium — "keep the old
  palette" hides that System still follows the OS; state the contract; Medium — only the happy
  path is a state; add a state table; Low — no fit criteria at the real window size, 0%/100%;
  Medium — dynamic QA is stills only; record the 42→75 transition and reduced motion; Medium —
  the VM merge gate conflicts with the stated headless policy.

```
DESIGN OUTSIDE VOICES — LITMUS SCORECARD:
═══════════════════════════════════════════════════════════════
  Check                                    Claude    Codex     Consensus
  ─────────────────────────────────────── ───────── ───────── ──────────
  1. Brand unmistakable in first screen?   NOT SPEC  NOT SPEC  NOT SPEC'D (label names CoreLive)
  2. One strong visual anchor?             yes(bar)  yes(bar)  CONFIRMED
  3. Scannable by headlines only?          yes       yes       CONFIRMED
  4. Each section has one job?             yes       yes       CONFIRMED
  5. Cards actually necessary?             NOT SPEC  NOT SPEC  NOT SPEC'D (the panel is the window surface)
  6. Motion improves hierarchy?            NOT SPEC  needs video DISAGREE → Pass 6 (video QA added)
  7. Premium without decorative shadows?   NOT SPEC  NOT SPEC  NOT SPEC'D (shadow = depth of a floating window)
  ─────────────────────────────────────── ───────── ───────── ──────────
  Hard rejections triggered:               none      none      CONFIRMED none
═══════════════════════════════════════════════════════════════
```

#### Pass 1: Information Architecture — 8/10 → 9/10

Label → percent → bar → hint is the right order for a passive notice (both voices agree).
Gap: the plan never said typography/layout stay as they are, inviting a restyle while
swapping tokens. Auto-decided (P5, structural): state that only color declarations and panel
opacity change (D-6). Not 10 only because the copy itself is out of scope.

#### Pass 2: Interaction State Coverage — 4/10 → 9/10

Only the happy path was specified. Auto-decided (P5): add the HUD state table — none before
the first progress event; 0-99% normal; a final 100% tick then close on `update-downloaded`;
error/cancel closes through `clearDownloadProgress` with the error in Settings; stalled keeps
the last percent (D-3). These are existing behaviors, now pinned; Eng verifies each reference.

#### Pass 3: User Journey & Emotional Arc — 7/10 → 9/10

```
  STEP | USER DOES                     | USER FEELS                 | PLAN SPECIFIES?
  -----|-------------------------------|----------------------------|-------------------------
  1    | clicks Download Now           | expects something to happen| existing dialog
  2    | keeps writing                 | undisturbed                | click-through HUD, own theme
  3    | glances at the HUD            | "it is mine, it is calm"   | saved theme, opaque popover
  4    | OS switches to dark (System)  | no jolt                    | media query follows (D-4)
  5    | download ends                 | done, no drama             | 100% tick, HUD closes
```

5-sec: on-theme, quiet; 5-min: no interruption; 5-year: no foreign amber surface. Gap closed:
the System-follows-OS contract (D-4). Web-only picks stay a stated limitation (D-7).

#### Pass 4: AI Slop Risk — 8/10 → 8/10

Classifier: OPERATE (app UI). No hard rejection; one panel, no cards grid, no gradient, no
glow. Blacklist #11 (system UI font as primary) technically matches, but DESIGN.md:39-42 is the
owner's explicit 2026-09-05 decision (stock system stacks), so it stays — TASTE T2, not a
finding. Browser surfaces: no selection/focus (non-interactive). Score stays 8 because
blacklist #11 is a deliberate design-system choice, not unexamined slop.

#### Pass 5: Design System Alignment — 7/10 → 9/10

Tokens: `--popover`, `--popover-foreground`, `--muted-foreground`, `--border`, `--primary`
match shadcn Popover/Progress semantics; the old palette-local variables go. Gap: the 96%
translucent surface + blur is not a DESIGN.md surface. Auto-decided (P5 + a11y, both voices):
opaque `var(--popover)` (D-1). No new component.

#### Pass 6: Responsive & Accessibility — 4/10 → 9/10

Responsive: a fixed 360 × 118 window on macOS; no breakpoints apply; QA renders at that size
with 0% and 100% frames (D-5). A11y: role=progressbar, aria-live and reduced motion are kept;
no keyboard or touch targets (non-interactive, click-through). Gap closed: contrast is now
proven, not hoped — `update-hud-contrast.test.ts` asserts text ≥4.5:1 and fill ≥3:1 on
`--popover` for every `THEME_TOKENS` entry (D-2), and the panel is opaque (D-1). Motion: a
video of the 42→75 transition plus a reduced-motion check (D-5).

#### Pass 7: Unresolved Design Decisions

| DECISION NEEDED                                                                          | RESOLUTION                                          |
| ---------------------------------------------------------------------------------------- | --------------------------------------------------- |
| translucent vs opaque panel                                                              | opaque `--popover` (D-1)                            |
| how contrast is proven                                                                   | THEME_TOKENS contrast test (D-2)                    |
| state set                                                                                | table D-3                                           |
| System behavior while shown                                                              | follows the OS live (D-4)                           |
| QA pass criteria                                                                         | real size, 0/42/75/100, video, reduced motion (D-5) |
| what may change visually                                                                 | colors and opacity only (D-6)                       |
| web-only theme users                                                                     | PR known limitation (D-7)                           |
| Declined: a `color-mix` fallback line (tokens are generated constants, never invalid); a |
| 14-theme screenshot matrix (the contrast test covers all 14). 7 resolved, 0 deferred.    |

#### NOT in scope (design)

- New HUD copy, size/speed details or a dismiss control (outside #214).
- A 14-theme screenshot matrix (quantitative test instead).
- Changing the system font stacks (DESIGN.md decision, T2).

#### What already exists (design)

Existing HUD markup/copy, shadcn Progress semantics, theme tokens, reduced-motion handling,
the Settings updater status (`AppUpdateSettings.tsx:272`), the every-theme AA gate in
`generate-theme-css.test.ts:462`.

#### Design Review Completion Summary

```
  +====================================================================+
  |         DESIGN PLAN REVIEW — COMPLETION SUMMARY                    |
  +====================================================================+
  | System Audit         | DESIGN.md present; UI scope = 1 native HUD  |
  | Step 0               | 6/10 initial; all 7 dimensions              |
  | Pass 1  (Info Arch)  | 8/10 → 9/10 after fixes                     |
  | Pass 2  (States)     | 4/10 → 9/10 after fixes                     |
  | Pass 3  (Journey)    | 7/10 → 9/10 after fixes                     |
  | Pass 4  (AI Slop)    | 8/10 → 8/10 after fixes                     |
  | Pass 5  (Design Sys) | 7/10 → 9/10 after fixes                     |
  | Pass 6  (Responsive) | 4/10 → 9/10 after fixes                     |
  | Pass 7  (Decisions)  | 7 resolved, 0 deferred                      |
  +--------------------------------------------------------------------+
  | NOT in scope         | written (3 items)                           |
  | What already exists  | written                                     |
  | TODOS.md updates     | 0 items proposed (repository keeps none)    |
  | Approved Mockups     | 3 generated, 1 approved (B, auto)           |
  | Decisions made       | 7 added to plan                             |
  | Decisions deferred   | 0                                           |
  | Overall design score | 4/10 → 8/10                                 |
  +====================================================================+
```

Plan is design-complete (every rated pass ≥ 8). Unresolved design decisions: none.

#### Approved Mockups

| Screen/Section                      | Mockup Path                                                                                                  | Direction                                                                     | Notes                                                   |
| ----------------------------------- | ------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------- | ------------------------------------------------------- |
| Update progress HUD (Default light) | /Users/ryotamurakami/.gstack/projects/laststance-corelive/designs/update-progress-hud-20261103/variant-B.png | white surface, near-black fill on primary/20% track, gray hint, bottom center | auto-approved; real HUD keeps its 320 px panel and copy |

#### Design implementation tasks

- [ ] **T7 (P1, human: ~1h / CC: ~5min)** — desktop — opaque `--popover` panel, drop backdrop blur
  - Surfaced by: Pass 5/6 — D-1
  - Files: apps/desktop/electron/update-progress-window-html.ts
  - Verify: builder test asserts `background: var(--popover)` and no `backdrop-filter`
- [ ] **T8 (P1, human: ~1h / CC: ~10min)** — web tests — HUD contrast over THEME_TOKENS
  - Surfaced by: Pass 6 — D-2
  - Files: apps/web/src/lib/themes/update-hud-contrast.test.ts
  - Verify: `mise exec -- pnpm test -- update-hud-contrast`
- [ ] **T9 (P1, human: ~1h / CC: ~15min)** — QA — real-size frames, transition video, reduced motion, System flip
  - Surfaced by: Pass 6 — D-5
  - Files: none (QA artifacts under .gstack/)
  - Verify: inspected frames
    _No new tasks from Pass 1, 2, 3, 4 (documentation-only decisions applied in the plan)._

<!-- autoplan-baseline-edits:design {"sourceSha256":"ec11a8417656db73d3043ba2eac758612cb089147b8367fcdfb2c0f90de67f00","replacements":[{"oldText":"   - Window variables map onto shadcn semantics: panel `background:\n     color-mix(in oklch, var(--popover) 96%, transparent)`, label `--popover-foreground`,","newText":"   - Window variables map onto shadcn semantics: panel `background: var(--popover)`, fully\n     opaque, and the `backdrop-filter` blur goes (D-1: at 96% over a dark desktop the Default\n     light muted text falls to about 4.33:1, below AA), label `--popover-foreground`,"},{"oldText":"   - Keep everything else (markup, click-through, reduced motion, update script) unchanged.","newText":"   - Keep everything else unchanged: markup and copy, typography (sizes, weights, the\n     existing system font stacks), spacing, the 320 px panel, 12 px radius, 8 px track,\n     click-through, reduced motion and the update script. Only color declarations and the\n     panel's opacity change (D-6). Variant B of the approved mockup\n     (`~/.gstack/projects/laststance-corelive/designs/update-progress-hud-20261103/variant-B.png`)\n     is the Default light visual reference."},{"oldText":"   - The reader runs once, when the window is created. Contract: the HUD shows the saved\n     desktop theme as of its start.","newText":"   - The reader runs once, when the window is created. Contract: the saved theme choice is\n     fixed when the HUD is created; a System choice keeps following the OS appearance live\n     through its media query, while an explicit theme ignores the OS, as in the app (D-4)."},{"oldText":"4. Guards and docs.","newText":"   - HUD states (existing behavior, unchanged; D-3):\n     | State | What the user sees |\n     |---|---|\n     | before the first `download-progress` | no HUD |\n     | 0-99% | label, percent, bar, hint |\n     | `update-downloaded` | one final 100% tick, then the HUD closes (`AutoUpdater.ts:205-214`) |\n     | error or cancelled download | `clearDownloadProgress` closes the HUD (`AutoUpdater.ts:470-472`); the updater status carries the error to Settings |\n     | stalled download | the last percent stays; no timeout |\n4. Guards and docs."},{"oldText":"  `THEME_IDS` and the `ThemeToken` keys, never hard-coded.","newText":"  `THEME_IDS` and the `ThemeToken` keys, never hard-coded.\n- `apps/web/src/lib/themes/update-hud-contrast.test.ts` (new; culori is available there): for\n  every `THEME_TOKENS` entry, `--popover-foreground` and `--muted-foreground` on `--popover`\n  are at least 4.5:1, and `--primary` on `--popover` is at least 3:1 (WCAG 1.4.11 for the fill)\n  (D-2). This covers all 14 themes quantitatively; screenshots cover representatives."},{"oldText":"- QA, headless (isolated browser, no host input): render the exact builder output for\n  System light, System dark (emulated), `cathedral-light` and `harbor-dark` at 42% and after\n  the update script moves it to 75%; System over light and dark page backdrops (the 96%\n  panel on a transparent window); inspect every screenshot.","newText":"- QA, headless (isolated browser, no host input), at the real window size\n  (`UPDATE_PROGRESS_WINDOW_WIDTH_PX` × `UPDATE_PROGRESS_WINDOW_HEIGHT_PX` = 360 × 118):\n  render the exact builder output for System light, System dark (emulated), `cathedral-light`\n  and `harbor-dark` at 0%, 42%, 75% (after the update script) and 100%, over light and dark\n  page backdrops; flip the emulated color scheme while a System HUD is shown; record a video\n  of the Default light 42% → 75% transition, extract its frames and confirm the fill moves\n  smoothly; confirm reduced motion jumps instantly (D-5). Inspect every screenshot and frame."},{"oldText":"  workspace (they get the Default theme following the OS, per the issue's fallback).","newText":"  workspace (they get the Default theme following the OS, per the issue's fallback); the PR\n  body states this as a known limitation (D-7)."}]} -->

<!-- autoplan-accepted:design -->

- D-1: the HUD panel background is opaque `var(--popover)` and the `backdrop-filter` blur is removed. Test: builder output contains `background: var(--popover)` and no `backdrop-filter`.
- D-2: `apps/web/src/lib/themes/update-hud-contrast.test.ts` asserts, for every `THEME_TOKENS` entry, `--popover-foreground` and `--muted-foreground` on `--popover` ≥ 4.5:1 and `--primary` on `--popover` ≥ 3:1.
- D-3: the plan's HUD state table (none before the first progress event; 0-99% normal; final 100% tick then close on `update-downloaded`; error/cancel closes via `clearDownloadProgress`; stalled keeps the last percent) holds unchanged; Eng verifies each reference.
- D-4: contract — the saved theme choice is fixed at HUD creation; a System choice keeps following the OS appearance live; an explicit theme ignores the OS. Test: the System HTML contains the dark media block; QA flips the emulated color scheme on a shown System HUD.
- D-5: headless QA at 360 × 118 for System light/dark, cathedral-light, harbor-dark at 0/42/75/100% over light and dark backdrops, a recorded 42→75 transition with inspected frames, and an instant reduced-motion update.
- D-6: only color declarations and panel opacity change; markup, copy, typography, spacing, radius, track size, click-through, reduced motion and the update script stay as they are. Variant B is the Default light visual reference.
- D-7: the PR body states that a theme picked only in a browser (no prepared desktop workspace) leaves the HUD on Default following the OS.

<!-- /autoplan-accepted:design -->

### DX review (autoplan Phase 2.5, DX POLISH)

Methodology read in full (`autoplan-dx-methodology-kvoLm1`, lines 1-600, 601-1200,
1201-1800, 1801-1871 EOF). Product type (auto-decided, P6): **internal Library/SDK + CLI
scripts** — the theme generator (`pnpm theme:generate` / `pnpm theme:check`), the committed
module `@corelive/live-editor/theme-tokens`, and the `AutoUpdater` constructor contract.
Mode: DX POLISH (autoplan override). No prior DX reviews on this branch.

#### Step 0

```
TARGET DEVELOPER PERSONA
========================
Who:       an AI coding agent (or the owner) working in this monorepo
Context:   adds or retunes a theme, or needs theme colors in a non-React surface
Tolerance: one command and one failing check before it needs a human; reads errors literally
Expects:   a regenerate command, a typed import, errors that name the fix
```

Empathy narrative (predicted, from the plan and `generate-theme-css.ts`): "I changed a family
seed in `registry.ts`. I know `pnpm theme:generate` exists from DESIGN.md:154, so I run it and
see two files change — good. Then I want the HUD color in main: I find
`@corelive/live-editor/theme-tokens`, but I try `THEME_TOKENS.system` and get a type error
because System is not a key; nothing told me to normalize first. Later CI fails with a drift
message; it names the file and the fix command, but if the new module were simply missing I
would get a raw ENOENT and guess." Corrections from evidence: the existing drift message
already prints the fix command (`generate-theme-css.ts:568-571`); the System-key confusion and
missing-file path are real gaps (DX-4, DX-1).

Competitive benchmark (estimated; reference boundaries, not measured):

| Tool                 | Start → result                                                                  | Time + evidence type                    | DX choice                                       | Source                             |
| -------------------- | ------------------------------------------------------------------------------- | --------------------------------------- | ----------------------------------------------- | ---------------------------------- |
| Style Dictionary     | edit token JSON → CSS + JS via one npm script                                   | ~1-2 min, reported                      | one config, many platform outputs               | dev.to/137foundry; dev.to/philw_   |
| Tailwind v4 `@theme` | edit CSS variables → utilities                                                  | <1 min, reported                        | CSS-first tokens, no TS map                     | tailwindcss docs (in-distribution) |
| CoreLive (this plan) | edit registry → `pnpm theme:generate` → CSS + typed TS map → `pnpm theme:check` | ~2-3 min with deps installed, estimated | one script, two committed artifacts, drift gate | plan Step 1                        |

TTHW target: **Competitive (2-5 min)** auto-decided (P5: fewer steps; Champion unproven).
Magical moment (DX POLISH, existing capability): one `pnpm theme:generate` updates both
artifacts, and the `Record<ThemeId, …>` type makes a new theme reach the HUD with zero HUD edits.

Developer journey map:

```
STAGE           | DEVELOPER DOES                                   | FRICTION POINTS                      | STATUS
----------------|--------------------------------------------------|--------------------------------------|--------
1. Discover     | reads DESIGN.md Theme System                     | outputs list named only generated.css| fixed (DX-4)
2. Install      | none (workspace package, committed module)       | none                                 | ok
3. Hello World  | pnpm theme:generate → 2 files → theme:check      | none                                 | ok
4. Real Usage   | imports THEME_TOKENS in main                     | no 'system' key; no example          | fixed (DX-4)
5. Debug        | reads theme:check / HUD warn log                 | missing file = raw ENOENT; debug-only reader failure | fixed (DX-1, DX-2)
6. Upgrade      | registry/cathedral change → regenerate           | DESIGN.md:154 says "registry only"   | fixed (DX-4)
```

First-time developer report (agent persona):

```
T+0:00  edits a harbor seed, runs `pnpm theme:generate` from the root: both files rewritten.
T+0:30  runs `pnpm theme:check`: passes.
T+1:00  imports THEME_TOKENS in main; types guide the token names.
T+1:30  tries THEME_TOKENS.system → type error; (fixed: DESIGN.md note says normalize first).
T+3:00  succeeded; a forgotten regenerate fails CI with THEME_ARTIFACT_STALE + the command.
```

#### DX dual voices

- **Claude DX subagent (in-host, completed, INPUT hash matched):** High CAP6 —
  `theme:check` drift must carry the fix, exit non-zero, a stable code (fix line already exists
  today); High CAP6 — reader failure only at debug; log warn with operation/error/fallback;
  Medium — unknown stored theme falls back silently; Medium — five tokens vs the full map
  (keep the full map but say why in the header); Medium — type the reader
  `OfflinePreferences['theme']`; Medium — a QA env override to force a palette natively;
  Medium — color-mix guard / track contrast; Medium — AutoUpdater JSDoc + "adding a theme" note;
  Low — prettierignore vs lint-clean: say `--check` compares raw output.
- **Codex DX voice (gpt-6-astra, OUTSIDE_STATUS: completed, P1):** High — the mandatory native
  QA depends on owner-only assets and contradicts the authorized headless workflow (UC1);
  Medium — docs stop at naming the artifact: add run location, command, expected result, a
  copy-paste import, the no-`system`-key rule, and fix DESIGN.md:154/:363; Medium — two-artifact
  failure contract: `THEME_ARTIFACT_STALE` / `THEME_ARTIFACT_MISSING`, path, fix, stderr +
  non-zero exit, generate-all-before-write, no false "nothing was written"; Medium — reader
  failure needs a stable diagnostic id, phase, fallback and re-read note plus JSDoc; the
  one-argument call must stay compatible. API naming and upgrade path: no further issues.

```
DX DUAL VOICES — CONSENSUS TABLE:
  Dimension                           Claude   Codex    Consensus
  1. Getting started < 5 min?          yes(8)   unproven DISAGREE → taste (estimate kept, measured at /ship)
  2. API/CLI naming guessable?         yes      yes      CONFIRMED
  3. Error messages actionable?        no(CAP6) no       CONFIRMED gap → DX-1, DX-2
  4. Docs findable & complete?         no       no       CONFIRMED gap → DX-4
  5. Upgrade path safe?                yes      yes      CONFIRMED
  6. Dev environment friction-free?    partly   no (VM)  CONFIRMED concern → UC1 (native QA gate)
```

#### Pass 1: Getting Started — 7/10 → 8/10

One command regenerates both artifacts; a forgotten regenerate fails `theme:check` in
`validate`. Gap: the 4-step "from zero" path for a consumer was undocumented (Codex). Fixed via
the DX-4 note (root, command, expected two-file diff, check, import). Remaining: TTHW is an
estimate, not measured.

#### Pass 2: API/CLI/SDK Design — 7/10 → 8/10

`theme:generate` / `theme:check` and the `./theme-tokens` subpath match existing exports
(`packages/live-editor/package.json:29-35`). `buildUpdateProgressThemeCss` mirrors
`normalizeThemePreference`'s vocabulary. Gap: the reader typed `string | undefined` loses the
schema link → DX-5 (`OfflinePreferences['theme'] | undefined`, optional 2nd arg). Agent
ergonomics: non-interactive scripts, errors on stderr.

#### Pass 3: Error Messages & Debugging — 5/10 → 8/10

```
ERROR PATH MATRIX (agent-ready-v1)
Path                         | Class      | what | fix  | recovery | code | context | trace | redaction | channel | Cap
theme:check stale artifact   | validation | pass | pass | pass     | fix→pass | pass | N/A  | pass      | pass    | — (was: no code)
theme:check missing artifact | validation | fail→pass | fail→pass | fail→pass | fail→pass | pass | N/A | pass | pass | CAP6:missing:fix (fixed DX-1)
theme:generate write failure | unexpected | partial→pass | pass | unknown→pass | N/A | pass | pass (stack) | pass | pass | CAP6:write:recovery (fixed DX-1)
HUD theme reader throws      | unexpected | debug-only→pass | N/A (auto fallback) | pass | fail→pass | fail→pass | pass (message) | pass | log.warn | CAP6:reader:context (fixed DX-2)
```

Today an agent sees `Error: ENOENT: no such file or directory, open '.../themeTokens.generated.ts'`
for a missing module; corrected: `THEME_ARTIFACT_MISSING packages/live-editor/src/themes/themeTokens.generated.ts — Fix: from the repository root run pnpm theme:generate, review both diffs, rerun pnpm theme:check.`
Today a broken reader is invisible at default log level; corrected:
`warn UPDATE_HUD_THEME_READ_FAILED phase=create-window fallback=system: <message>; the next HUD reads again`.
Permission/safety: generator writes only its two files; no verbose mode needed.

#### Pass 4: Documentation & Learning — 5/10 → 8/10

DESIGN.md is the one place (DX-4), plus the module header (DX-6) and the AutoUpdater JSDoc with
`@example` (DX-3). Copy-paste import included; the no-`system`-key rule is stated where the
mistake happens.

#### Pass 5: Upgrade & Migration — 8/10 → 8/10

No breaking change: a new subpath export, an optional constructor argument (one-arg calls keep
working, tested), committed artifacts. No migration guide needed; CHANGELOG notes the export.

#### Pass 6: Developer Environment & Tooling — 8/10 → 8/10

Typed map, `theme:check` in `pnpm validate` and CI, non-interactive. The native QA dependency on
owner-local VM assets is real friction for any other contributor (Codex) — carried to UC1, not
changed here. Declined: a `CORELIVE_UPDATE_HUD_THEME` QA override (Claude) — no QA hooks in
production code; headless renders cover per-theme visuals.

#### Pass 7: Community & Ecosystem — 5/10 → 5/10

Private, single-owner repository; contributors are the owner and agents. Nothing to add within
#214; the score stays as an honest residual, not a gap to fix here.

#### Pass 8: DX Measurement & Feedback Loops — 6/10 → 7/10

`theme:check` in CI is the feedback loop for drift; the THEME_TOKENS contrast test is the loop
for palette quality. TTHW is not instrumented (not worth it for internal tooling); /ship will
time the regenerate→check path once as evidence.

#### DX Review Scorecard

```
+====================================================================+
|              DX PLAN REVIEW — SCORECARD                             |
+====================================================================+
| Dimension            | Score  | Prior  | Trend  |
|----------------------|--------|--------|--------|
| Getting Started      |  8/10  |  7/10  |   ↑    |
| API/CLI/SDK          |  8/10  |  7/10  |   ↑    |
| Error Messages       |  8/10  |  5/10  |   ↑    |
| Documentation        |  8/10  |  5/10  |   ↑    |
| Upgrade Path         |  8/10  |  8/10  |   =    |
| Dev Environment      |  8/10  |  8/10  |   =    |
| Community            |  5/10  |  5/10  |   =    |
| DX Measurement       |  7/10  |  6/10  |   ↑    |
+--------------------------------------------------------------------+
| TTHW                 | ~2-3 min (est.) | ~3 min | ↑ |
| Competitive Rank     | Competitive                                  |
| Magical Moment       | designed via the existing `pnpm theme:generate` |
| Product Type         | internal Library/SDK + CLI scripts           |
| Mode                 | POLISH                                       |
| Overall DX           |  8/10  |  6/10  |   ↑    |
+====================================================================+
| DX PRINCIPLE COVERAGE                                               |
| Zero Friction      | covered (one command, committed artifacts)     |
| Learn by Doing     | covered (copy-paste import)                    |
| Fight Uncertainty  | covered (DX-1/DX-2 contracts)                  |
| Opinionated + Escape Hatches | covered (System fallback; optional arg) |
| Code in Context    | covered (main-process example)                 |
| Magical Moments    | covered                                        |
| Agents Are Users   | covered (codes, stderr, non-zero exit)         |
+====================================================================+
```

Community stays 5/10 (structural, private repo); no pass below 6 needs action.

#### DX Implementation Checklist

```
[x] Time to hello world < 5 min (estimated; timed once at /ship)
[x] Installation is one command (none: workspace + committed module)
[x] First run produces meaningful output (two-file diff)
[x] Magical moment delivered via pnpm theme:generate
[ ] Every error message meets the agent-ready error contract (DX-1, DX-2 — to implement)
[x] API/CLI naming is guessable without docs
[x] Every parameter has a sensible default (reader defaults to () => undefined)
[ ] Docs have copy-paste examples that actually work (DX-4 — to implement)
[x] Upgrade path documented (no breaking change; CHANGELOG)
[x] TypeScript types included
[x] Works in CI/CD without special configuration (theme:check in validate)
[n/a] Free tier / community channel (private repository)
```

#### DX implementation tasks

- [ ] **T10 (P1, human: ~1.5h / CC: ~10min)** — generator — THEME_ARTIFACT_STALE / _MISSING contract, generate-all-before-write
  - Surfaced by: Pass 3 — DX-1
  - Files: apps/web/scripts/generate-theme-css.ts, apps/web/src/lib/themes/generate-theme-css.test.ts
  - Verify: `mise exec -- pnpm --filter @corelive/web test -- generate-theme-css`
- [ ] **T11 (P1, human: ~1h / CC: ~5min)** — desktop — reader warn diagnostic, typed optional arg, JSDoc
  - Surfaced by: Pass 2/3 — DX-2, DX-3, DX-5
  - Files: apps/desktop/electron/AutoUpdater.ts, apps/desktop/electron/**tests**/AutoUpdater.test.ts
  - Verify: `mise exec -- pnpm test:electron -- AutoUpdater`
- [ ] **T12 (P2, human: ~30min / CC: ~5min)** — docs — DESIGN.md Theme tokens note, :154/:161/:363, module header
  - Surfaced by: Pass 4 — DX-4, DX-6
  - Files: DESIGN.md, apps/web/scripts/generate-theme-css.ts
  - Verify: read the rendered DESIGN.md section; `pnpm theme:check`

<!-- autoplan-baseline-edits:dx {"sourceSha256":"fdc27bae4d63547a9986f6cf77b294397fc4552feada7cfe6f6697285d6fc2ad","replacements":[{"oldText":"   - The script's direct-run block writes both generated.css and the token module;\n     `--check` compares both and names the stale file in the drift message\n     (`describeThemeCssDrift` gains the path parameter).","newText":"   - The script's direct-run block generates and validates both outputs before writing\n     either, then writes generated.css and the token module. `--check` compares the raw\n     generator output with each committed file (DX-1 error contract, thrown as an Error so\n     `tsx` exits non-zero with the message on stderr):\n     - stale: `THEME_ARTIFACT_STALE <repo-relative path>`, the first differing line with the\n       existing 200-character excerpts, and the existing fix line (`pnpm theme:generate`,\n       review both diffs, rerun `pnpm theme:check`); `describeThemeCssDrift` gains the path\n       parameter and the code;\n     - missing: `THEME_ARTIFACT_MISSING <repo-relative path>` with the same fix line,\n       instead of a raw `ENOENT`;\n     - a write failure names the file that failed and which file, if any, was already\n       written, so the message never claims \"nothing was written\" after a partial write.\n     Diagnostics carry only paths and the bounded color excerpts, no environment or config."},{"oldText":"     emitted lint-clean; the desktop main bundle consumes `THEME_TOKENS`, so Fallow sees it","newText":"     emitted lint-clean (`--check` compares raw generator output, so a local prettier version\n     never causes false drift); its header says AUTO-GENERATED, names `pnpm theme:generate`,\n     and explains that it carries every token so later native surfaces can reuse it (DX-6);\n     the desktop main bundle consumes `THEME_TOKENS`, so Fallow sees it"},{"oldText":"   - `AutoUpdater` takes a second constructor argument\n     `readThemePreference: () => string | undefined` (default `() => undefined`).","newText":"   - `AutoUpdater` takes an optional second constructor argument\n     `readThemePreference: () => OfflinePreferences['theme'] | undefined` (default\n     `() => undefined`; type-only import from `@corelive/desktop-contract`), so the existing\n     one-argument call keeps working (DX-5). Its JSDoc (`@param` + `@example`) states the\n     contract: synchronous, called once when a HUD is created, called again for the next\n     HUD, and any throw falls back to System (DX-3)."},{"oldText":"     change breaks the build. A throwing reader counts as no preference (logged at debug).","newText":"     change breaks the build. A throwing reader counts as no preference and logs one\n     `log.warn` with `UPDATE_HUD_THEME_READ_FAILED`, `phase=create-window`,\n     `fallback=system`, the error message and \"the next HUD reads again\"; no theme value or\n     account data (DX-2). A normal `undefined` is not an error. A raw value that normalizes\n     to System without being `'system'` is logged at debug (`unknown theme preference,\n     using System`)."},{"oldText":"   - DESIGN.md:161 (the generator paragraph) also names the token module and its main-process\n     consumer. DESIGN.md:154 and :363 mention the generator but not its outputs list; no\n     other doc does [measured: `git grep -n -e generated.css -e generate-theme-css -e\n     theme:generate -- '*.md'`, excluding CHANGELOG and dated docs/designs].","newText":"   - DESIGN.md (DX-4): :161 names both generator outputs and the main-process consumer; :154\n     regenerates when the registry or the Warm Cathedral blocks (`base.css` / `CATHEDRAL`)\n     change; :363 says the generator rewrites both files; a short \"Theme tokens in code\"\n     note shows, from the repository root, `pnpm theme:generate` → both files change →\n     `pnpm theme:check` passes, and a copy-paste import\n     (`import { THEME_TOKENS } from '@corelive/live-editor/theme-tokens'`;\n     `THEME_TOKENS.dark['--primary']`), noting that the map has no `'system'` or legacy\n     keys, so callers run `normalizeThemePreference` first. No other doc lists the outputs\n     [measured: `git grep -n -e generated.css -e generate-theme-css -e theme:generate --\n     '*.md'`, excluding CHANGELOG and dated docs/designs; :363 does name generated.css]."},{"oldText":"  `loadURL`; a throwing reader builds the System/Default HUD.","newText":"  `loadURL`; a throwing reader builds the System/Default HUD and logs one\n  `UPDATE_HUD_THEME_READ_FAILED` warning; the one-argument constructor still works."},{"oldText":"  static equals registry `tokens`; `--check` reports a stale token module. Counts come from","newText":"  static equals registry `tokens`; `--check` reports `THEME_ARTIFACT_STALE` with the first\n  differing line and `pnpm theme:generate` for a stale module, and `THEME_ARTIFACT_MISSING`\n  with the same command for a missing one, both as thrown errors. Counts come from"}]} -->

<!-- autoplan-accepted:dx -->

- DX-1: the generator validates and generates both outputs before writing either; `--check` throws `THEME_ARTIFACT_STALE <path>` (first differing line, bounded excerpts, existing fix line) or `THEME_ARTIFACT_MISSING <path>` (fix line) so `tsx` exits non-zero on stderr; a write failure names the failed file and any already-written file; diagnostics carry only paths and bounded color excerpts. Tests: stale and missing module messages include the code and `pnpm theme:generate`.
- DX-2: a throwing HUD theme reader logs one `log.warn` with `UPDATE_HUD_THEME_READ_FAILED`, `phase=create-window`, `fallback=system`, the error message and the next-HUD re-read note, without theme values or account data; a raw value that normalizes to System without being `'system'` logs at debug. Test: the throwing-reader AutoUpdater test asserts the warn call.
- DX-3: the `AutoUpdater` constructor JSDoc documents the reader contract (synchronous, once per HUD, re-read for the next HUD, System fallback) with `@param` and `@example`.
- DX-4: DESIGN.md :161 names both outputs and the main-process consumer, :154 regenerates on registry or Warm Cathedral block changes, :363 names both regenerated files, and a "Theme tokens in code" note gives the root command, the expected two-file diff, `pnpm theme:check`, a copy-paste `THEME_TOKENS` import, and the normalize-first rule (no `'system'` or legacy keys).
- DX-5: the reader is an optional second argument typed `() => OfflinePreferences['theme'] | undefined` (type-only import); the one-argument constructor keeps working. Test: the existing one-argument construction still passes.
- DX-6: the generated module header says AUTO-GENERATED, names `pnpm theme:generate`, and explains why it carries every token; `--check` compares raw generator output (prettier-ignored file).

<!-- /autoplan-accepted:dx -->

### Eng review (autoplan Phase 3, FULL_REVIEW)

Target: this plan's `## Implementation plan` (fixed). Report file: this document. Methodology
`plan-eng-review` read 1-2110 of 2110 (4 ranges). Design doc = this plan; CEO plan
`~/.gstack/projects/laststance-corelive/ceo-plans/2026-11-03-update-window-theme.md`.
TODOS.md is absent on purpose and must not be recreated (CLAUDE.md, 2026-10-02): every
discovered item is resolved in this PR, so the TODOS step proposes nothing.

#### Step 0 — Scope Challenge

**A. What already solves each sub-problem**

| Sub-problem              | Existing code                                                                                                                                                                                        | Use                                                                                            |
| ------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| Static token values      | `StaticTheme.tokens` (`packages/live-editor/src/themes/registry.ts:138-141`)                                                                                                                         | reuse                                                                                          |
| Derived token values     | `deriveThemeTokens` (`apps/web/scripts/generate-theme-css.ts:273`), build-time only (culori, `apps/web/package.json:96`)                                                                             | reuse in generator                                                                             |
| Warm Cathedral values    | `CATHEDRAL` (`generate-theme-css.ts:59`), pinned by `cathedral-css-snapshot.test.ts`                                                                                                                 | reuse                                                                                          |
| Preference normalization | `normalizeThemePreference` (`registry.ts:550-558`)                                                                                                                                                   | reuse                                                                                          |
| System → Default pair    | `useEditorTheme` (`apps/desktop/renderer/NativeEditor.tsx:52-70`, JS `matchMedia`)                                                                                                                   | same policy; HUD uses a CSS media query, no shared helper (a two-id constant is not worth one) |
| Theme source in main     | `controller.getSnapshot()` (`OfflineEditorController.ts:159`), ready branch (`packages/desktop-contract/src/offline-workspace.ts:296-307`), `OfflineWorkspaceView.preferences` (`:268`)              | reuse                                                                                          |
| Drift diagnostic         | `describeThemeCssDrift` (`generate-theme-css.ts:545-570`)                                                                                                                                            | extend                                                                                         |
| Bundle path              | `AutoUpdater` is its own lazily loaded electron-vite entry (`apps/desktop/electron.vite.config.ts:68`, `./AutoUpdater.cjs` at `:45`)                                                                 | the token module lands in that chunk, not in startup main                                      |
| HUD test harness         | mocked `BrowserWindow` capturing `loadURL` (`apps/desktop/electron/__tests__/AutoUpdater.test.ts:20-34,82`)                                                                                          | reuse                                                                                          |
| Contrast math            | `contrastRatio` (`apps/web/src/lib/themes/contrast.ts`); the emitted-theme AA gate (`generate-theme-css.test.ts:462-492`) checks foreground/background and muted-foreground/card and skips cathedral | the new popover-pair gate is not a duplicate                                                   |

**Minimum change:** Steps 1-4 are all needed for issue acceptance 1-2; nothing is
deferrable without failing them. **Search check:** no new architectural pattern,
infrastructure or concurrency; a committed generated TS data module mirrors the existing
generated.css pattern [Layer 1], so no search was run. **Distribution:** no new artifact;
the change ships in the queued Electron release; the web renderer is untouched.

**Complexity check** [measured: plan Steps 1-4 plus the Eng additions below]: non-test
files `generate-theme-css.ts`, `themeTokens.generated.ts` (new, generated),
`packages/live-editor/package.json`, `update-progress-window-html.ts`, `AutoUpdater.ts`,
`main.ts`, `no-hardcoded-amber.test.ts` (guard), `DESIGN.md`, `.prettierignore`,
`.fallowrc.jsonc`, `utils/readUpdateHudThemePreference.ts` (new) = 11; test files
`update-progress-window-html.test.ts`, `AutoUpdater.test.ts`, `generate-theme-css.test.ts`,
`update-hud-contrast.test.ts` (new), `utils/readUpdateHudThemePreference.test.ts` (new) = 5;
new classes/services 0. 16 files ≥ 8, so the gate trips.

**B. Complexity selectors**

- Feature cuts: none asked (autoplan Eng override P2: never reduce scope).
- D-eng-1 `plan-eng-review-structure` — Original arrangement (16 files; the HUD contrast
  test in its own file) vs Smaller arrangement (15 files; the contrast gate folded into
  `generate-theme-css.test.ts`). Both keep every accepted CEO/design/DX obligation.
  Pending remedies not decided here: E-1..E-6. **Auto-decided → Original arrangement
  (recommended)**: moving parts are identical, and a file named for the HUD tells the next
  reader which surface the gate protects (P5).
- Scope record: feature answers: none (P2 override); structure: A Original (auto-decided,
  autoplan); accepted scope: Implementation plan Steps 1-4 and its tests as written;
  pending remedies: E-1..E-6, resolved in C.

**C. Findings**

1. [CRITICAL] (confidence: 8/10) `apps/desktop/electron/main.ts:713` — `autoUpdater = new
AutoUpdaterCls(prepareForQuit)`; plan Step 3 adds the reader inline here
   (`snapshot.phase === 'ready' ? snapshot.workspace.preferences.theme : undefined`). No
   planned test reaches it, and every planned native capture uses System/Default, which
   looks identical to the fallback. A reader that always returns `undefined` would ship
   the exact bug #214 fixes with all checks green. E-1 remedy: move it to
   `apps/desktop/electron/utils/readUpdateHudThemePreference.ts`
   (`(snapshot: OfflineEditorSnapshot | undefined) => OfflinePreferences['theme'] |
undefined`, one util per file like `utils/resolveHideAppIcon.ts`) with a colocated test
   (ready → the stored value; each non-ready phase and `undefined` → `undefined`);
   `main.ts` passes `() => readUpdateHudThemePreference(offlineEditor?.controller.getSnapshot())`.
2. [INFORMATIONAL] (confidence: 7/10) `.fallowrc.jsonc:31-35` — `"ignorePatterns"` lists
   `generated.css` because "theme:generate owns the repeated theme CSS"; the new generated
   module repeats a 36-key object 14 times, and `pnpm fallow:dupes --fail-on-issues`
   (`package.json:107`, part of `validate` at `:109`) has no exclusion for it. E-2 remedy:
   add the module to `duplicates.ignore` (`.fallowrc.jsonc:66`) only, so dead-code analysis
   still sees `THEME_TOKENS` used; verify with `pnpm fallow:dupes` and `pnpm fallow:dead-code`.
3. [INFORMATIONAL] (confidence: 8/10) plan Step 2 — "one exported helper
   `buildUpdateProgressThemeCss(preference)`": its only production caller is the builder
   in the same file, so the export exists for tests (test value bar item 4). E-3 remedy:
   keep the helper module-private and assert the five-token contract on the
   `buildUpdateProgressWindowHtml` output (the `:root` and dark-media blocks). The helper
   stays the single emitter (CEO-2 unchanged).
4. [INFORMATIONAL] (confidence: 7/10) `packages/desktop-contract/src/offline-workspace.ts:137`
   — `theme: z.string().min(1).max(50)` is synced account data, and the builder's HTML
   becomes a `data:` URL with no CSP (`AutoUpdater.ts:432-436`). The plan normalizes before
   lookup but never states that the raw string stays out of the document. E-4 remedy: state
   the invariant in Step 2 (only `normalizeThemePreference` output selects a
   `THEME_TOKENS` entry; the raw value is never written into the HTML) and test that a
   hostile value (`'</style><script>alert(1)</script>'`) yields output byte-identical to
   `'system'`.
5. [INFORMATIONAL] (confidence: 7/10) `apps/web/scripts/generate-theme-css.ts:59` —
   `CATHEDRAL: Record<ThemeMode, Record<string, string>>`, and `deriveThemeTokens` returns
   `Record<string, string>` (`:273-276`), so nothing upstream enforces the 36-key
   `ThemeToken` set. E-5 remedy: the generated module declares `export const THEME_TOKENS:
Readonly<Record<ThemeId, Readonly<Record<ThemeToken, string>>>> = { … }` (an
   annotation, no `as` cast), so `pnpm typecheck` rejects a missing or extra key, and the
   generator throws `THEME_TOKEN_SET_MISMATCH <themeId> missing=<keys> extra=<keys>` before
   writing anything.
6. [INFORMATIONAL] (confidence: 7/10) `apps/web/scripts/generate-theme-css.ts:585-610` —
   the check and write logic sits inside `if (process.argv[1] ===
fileURLToPath(import.meta.url))`, so the planned STALE / MISSING / partial-write tests
   cannot reach it without spawning `tsx`. E-6 remedy: export
   `checkThemeArtifacts(artifacts)` and `writeThemeArtifacts(artifacts)` over
   `{ absolutePath, repoPath, content }[]` using the real `node:fs`; the direct-run block
   only builds the two-artifact list and calls them; tests use a `mkdtempSync` directory
   (a missing file, a stale file, and a second target inside a nonexistent directory for
   the partial-write message). No injected fs seam.

Factual correction (no behavior change): the desktop runs Electron 45.0.0
(`apps/desktop/package.json:36`, installed `node_modules/electron` 45.0.0), not 44;
`color-mix(in oklch, …)` (Chromium 111+) is still available.

Dispositions: E-1..E-6 accepted by authorized auto-decision (autoplan P1/P5; mechanical,
in blast radius, < 1 day CC). D-3 references re-verified: `AutoUpdater.ts:205-214` sends
the final 100% then closes the HUD; `:185-190` (error) and `:470-472`
(`clearDownloadProgress`) close it. Scope Challenge result: scope accepted as-is.

**Reality rows**

Premise table (`premise | claim | file:line receipt | verdict`):

| #   | Claim                                                                           | Receipt                                                                  | Verdict                  |
| --- | ------------------------------------------------------------------------------- | ------------------------------------------------------------------------ | ------------------------ |
| 1   | `normalizeThemePreference` maps legacy aliases and unknown values to `'system'` | `registry.ts:550-558`                                                    | true                     |
| 2   | System = the Default pair following the OS                                      | `NativeEditor.tsx:57-62`                                                 | true                     |
| 3   | Static themes carry literal `tokens`                                            | `registry.ts:138-141`                                                    | true                     |
| 4   | Derived tokens need culori at build time                                        | `generate-theme-css.ts:17,27,273`; `apps/web/package.json:96`            | true                     |
| 5   | Cathedral is hand-authored, mirrored by `CATHEDRAL`                             | `generate-theme-css.ts:59`; `cathedral-css-snapshot.test.ts:46`          | true                     |
| 6   | Main holds the cached theme via `getSnapshot()` in phase `ready`                | `OfflineEditorController.ts:159`; `offline-workspace.ts:268,301-303,137` | true                     |
| 7   | The bundled editor applies it with normalize + media query                      | `NativeEditor.tsx:52-70,87-90`                                           | true                     |
| 8   | `offlineEditor` exists before the packaged-only `AutoUpdater`                   | `main.ts:675-682,707-713`                                                | true                     |
| 9   | electron-vite bundles `@corelive/live-editor` into main                         | `electron.vite.config.ts:9,35`                                           | true                     |
| 10  | `.prettierignore:32-33` holds generated.css                                     | `.prettierignore:32-33`                                                  | true                     |
| 11  | The `#214` allowlist entry                                                      | `no-hardcoded-amber.test.ts:56-60`                                       | true                     |
| 12  | HUD window is 360 × 118                                                         | `packages/desktop-contract/src/constants.ts:76,79`                       | true                     |
| 13  | Settings theme reaches the snapshot                                             | `offline-settings-sync.ts:494-501`; `WorkspaceService.ts:951`            | true                     |
| 14  | HUD lifecycle references (D-3)                                                  | `AutoUpdater.ts:185-190,205-214,470-472`                                 | true                     |
| 15  | Packaged Chromium supports `color-mix`                                          | `apps/desktop/package.json:36` (Electron 45)                             | true (corrected from 44) |

unverified=0.

REALITY: premise-table pass 15 claims, unverified=0, one version corrected (44 → 45) apps/desktop/package.json:36
REALITY: already-done pass `git log origin/main --since=2026-11-01` on the named files shows only #219/#220, no THEME_TOKENS or `theme-tokens` commit apps/web/src/lib/themes/no-hardcoded-amber.test.ts:56
REALITY: surface-check pass `theme:generate`/`theme:check` (package.json:71-72), `electron:build:dir` (package.json:87), `qa:browser` (package.json:102), `test:electron` (package.json:80), VM assets `prepare-native.mjs` and `native-updater.py` exist under ~/.local/share/corelive-qa/monorepo, tart 2.32.1 under ~/.local/share/corelive-qa/tart package.json:87
REALITY: binding-decisions pass `gstack-decision-search --scope branch` is empty; this plan's audit-trail rows 1-26 bind (live swap dropped, opaque panel, VM gate pending UC1); nothing here reintroduces an overruled default docs/designs/update-window-theme.md:1189
REALITY: numbers pass 14 ids × 36 tokens [measured: registry.ts THEME_REGISTRY, ThemeToken union = 36, CATHEDRAL 72 = 2 × 36], 360 × 118 [measured: packages/desktop-contract/src/constants.ts:76,79], generated.css 22,846 bytes [measured: wc -c], token module ~20-25 KB in the lazy AutoUpdater chunk [estimated] packages/desktop-contract/src/constants.ts:76
REALITY: deferred-asks pass issue #214 asks 3 things (theme tokens light/dark; Default fallback; per-theme builder unit test + VM visual QA); all three are in the plan; only UC1 could drop the VM half of acceptance 3, and that waits for the owner docs/designs/update-window-theme.md:197
REALITY: pr-count pass `.gstack/ship-policy.json` sets no `pr_count` (default one PR); this plan is one PR .gstack/ship-policy.json:1

#### Step 0.5 — Dual voices

Both voices reviewed snapshot `eng 39052998d04dedffe06c9f22909c402f0c48530bb8087c919e99c3cb546f44d5`.
The Claude subagent (in-host, plan text only) returned that INPUT line. Codex (`gpt-6-astra`,
read-only repository access) completed with `OUTSIDE_STATUS: completed`.

Claude SUBAGENT (eng — independent review), condensed with severities as given:
N-1 Medium-High, the reader runs once and the snapshot may not be `ready` yet at a fast
startup download (prefers a per-tick re-read that reloads only on change); N-2 Medium,
`prefers-color-scheme` follows `nativeTheme.themeSource`; N-3 Medium, the import subpath for
`normalizeThemePreference` / `ThemeId` is unnamed and must stay DOM/React-free; N-4 Medium,
run the contrast math now and also gate the fill against the 20% track; N-5 Low-Medium,
hostile-input test incl. `'__proto__'` / `'constructor'`; N-6 Low, temp-file + rename for the
two-file write; N-7 Low-Medium, test gaps (hard-code the Default dark primary, non-string
reader result, re-read after clear + new download, `describeThemeCssDrift` callers, close
race, missing generated file); N-8 Low, bundle ~25-30 KB acceptable, prefer an annotation /
`satisfies` so a missing key fails the build; N-9 Low, CI path filters and lint-staged must
not touch the generated file; N-10 Info, no new attack surface beyond N-5.

Codex SAYS (eng — architecture challenge), condensed: C-1 Medium, the HUD is created at 0%
when the user clicks Download Now, before `downloadUpdate()` (`AutoUpdater.ts:307`), so the
state table and the tests aim at the wrong first event, and the 100% frame is not guaranteed
to paint; C-2 Medium, the fill touches the composited 20% track, not `--popover` (Harbor
light: primary/popover ≈ 4.38, primary/track ≈ 3.40); C-3 Medium, `fallow:dupes` has no
exclusion for the generated module; C-4 Medium, `no-hardcoded-amber.test.ts:282-284` asserts
the `issue: 214` entry exists, so deleting it fails the suite; C-5 Low, `OfflinePreferences`
is exported only from `@corelive/desktop-contract/offline-workspace`, not the root; plus a
note that the plan body states the VM gate unconditionally while UC1 is pending.
Recommendation (Codex): revise the plan before implementation.

Verification of each claim against the code:

- C-1 true: `AutoUpdater.ts:307-312` calls `sendDownloadProgress({ percent: 0, … })` on
  response 0, then `downloadUpdate()`.
- C-2 / N-4 measured with culori over all 14 themes (primary at 20% alpha composited over
  popover in sRGB): minimum `--popover-foreground`/popover 14.83, `--muted-foreground`/popover
  4.73 (Default light), primary/popover 4.38 and primary/track 3.40 (both harbor-light).
  Every theme passes 4.5 / 3 / 3 today, so no token change and no allowlist is needed.
- C-3 true and matches Step 0 E-2 (`.fallowrc.jsonc:64-67`).
- C-4 true: `expect(ALLOWLIST.find((entry) => entry.issue === 214)?.path).toBe(…)`.
- C-5 true: `packages/desktop-contract/src/index.ts:1-2` re-exports only `ipc` and
  `electron-api` types; `package.json:16` exports `./offline-workspace`.
- N-2: no code sets `nativeTheme.themeSource` (grep over `apps/desktop`, `apps/web/src`),
  so `prefers-color-scheme` follows the OS; no change.
- N-3: `registry.ts` has no imports and is framework-agnostic (`registry.ts:1-14`), exported
  as `@corelive/live-editor/themes` (`packages/live-editor/package.json`).
- N-5: `isThemeId` uses `Object.hasOwn(THEME_REGISTRY, value)` (`registry.ts:524-526`), so
  prototype names already normalize to System; the test pins that.
- N-9: `test.yml:74` runs `pnpm theme:check` with no path filter; lint-staged runs
  `prettier --write` (honors `.prettierignore`) and `eslint --fix --max-warnings 0`, so the
  module must be emitted lint-clean or a commit would rewrite it and `theme:check` would fail.

```
ENG DUAL VOICES — CONSENSUS TABLE:
  Dimension                           Claude  Codex  Consensus
  1. Architecture sound?               yes     yes    CONFIRMED (keep the generated map + injected reader)
  2. Test coverage sufficient?         no      no     CONFIRMED gaps (lifecycle, fill/track, hostile input)
  3. Perf risks + budget/bench named?  low     —      N/A (Codex did not assess; native: ~25-30 KB, acceptable)
  4. Security threats covered?         no      —      N/A (single voice: hostile-input test; accepted as E-4)
  5. Error paths handled?              no      no     CONFIRMED gaps (startup race / Download Now path)
  6. Deployment risk manageable?       yes*    no     DISAGREE → resolved by fixes: Codex names three concrete
                                                       validate failures (dupes, amber assertion, import path)
CONFIRMED = native + outside agree; primary cannot replace outside. DISAGREE → taste.
Missing/disabled voice = N/A, never CONFIRMED. Flag any single-voice critical finding.
```

No voice raised a Critical. The only critical-severity item is the Step 0 primary-review
finding E-1, which neither voice saw: it is accepted as a remedy, not left open. Dimension 6
is not a taste call: Codex's three failures are factual and verified, so they become fixes.

#### Section 1 — Architecture

```
BUILD TIME (tsx + culori, apps/web)                          RUNTIME (Electron main, lazy AutoUpdater.cjs)
packages/live-editor/src/themes/registry.ts                  main.ts
  THEME_REGISTRY · ThemeId · ThemeToken ·                      reader = () => readUpdateHudThemePreference(
  normalizeThemePreference · THEME_IDS  (no imports)                       offlineEditor?.controller.getSnapshot())
        │                                                          │                         ▲
        ▼                                                          │      utils/readUpdateHudThemePreference.ts [NEW]
apps/web/scripts/generate-theme-css.ts                             │        OfflineEditorSnapshot ('ready' → theme)
  CATHEDRAL · deriveThemeTokens · generateThemesCss                │        (@corelive/desktop-contract/offline-workspace)
  generateThemeTokensModule [NEW]                                  ▼
  checkThemeArtifacts / writeThemeArtifacts [NEW]          AutoUpdater(beforeInstall, readThemePreference?) [CHANGED]
        │ pnpm theme:generate / theme:check                   Download Now → sendDownloadProgress(0%) → create HUD:
        ├──► styles/generated.css        [existing]             reader() once (throw → warn, System)
        └──► themes/themeTokens.generated.ts [NEW, committed]   later ticks → executeJavaScript(update script) only
               THEME_TOKENS                                        │
               export "./theme-tokens" [NEW] ──────────────────►  update-progress-window-html.ts [CHANGED]
                                                                    normalizeThemePreference(raw)
                                                                    → private buildUpdateProgressThemeCss(id | 'system')
                                                                    → THEME_TOKENS[id] (5 tokens) → data: URL HTML
                                                                       (raw preference never written)
```

Coupling: the desktop main now depends on two pure `@corelive/live-editor` subpaths
(`./themes`, `./theme-tokens`); both are data/functions with no DOM, React or CSS imports,
bundled into the lazy `AutoUpdater` chunk (`electron.vite.config.ts:68`), so startup cost and
the external set are unchanged. Scaling: one HUD per download; nothing grows with use.
Security: the only new input is the synced `theme` string (≤ 50 chars,
`offline-workspace.ts:137`); it selects a key and is never written into the `data:` document
(E-4). No IPC, auth or network surface changes. Distribution: no new artifact; the module is
committed and bundled; the release is the queued `/electron-release`.

Realistic production failure per new path: (1) generator — someone edits the registry and
forgets `pnpm theme:generate` → `theme:check` in CI (`test.yml:74`) fails with
`THEME_ARTIFACT_STALE`; (2) reader — the account is still opening when Download Now is
clicked → the HUD stays on System for that download (documented limit, util test);
(3) builder — a corrupt or legacy stored value → System (builder tests); (4) bundle — the
export map misses `./theme-tokens` → `pnpm electron:build:ts` fails before release.

Design-twice (new public boundary `@corelive/live-editor/theme-tokens`):

- A (chosen, CEO-1): the generator emits the full typed token map; consumers pick tokens.
- B: the generator emits ready HUD CSS per theme (`UPDATE_HUD_THEME_CSS: Record<ThemeId,
string>`). Shallower for main, but the HUD's five-token choice leaks into the generator
  (red flag 2) and the next native surface needs another generator output.
- C: import `generated.css?raw` and set `data-theme` in the HUD. That leaks selector structure,
  misses cathedral (hand-authored in `base.css` beside unrelated rules) and ships ~23 KB per
  `data:` URL.
  A hides the most (derivation, classification, cathedral mirroring) behind the smallest
  surface (one typed constant), so it stays.

Red-flag screen: (1) shallow module — no; the reader util is small but owns the phase
policy. (2) information leakage — the "System = Default pair" policy now lives in the
renderer (`NativeEditor.tsx:57-62`, JS `matchMedia`) and the HUD (CSS media query). These are
different runtimes, and both reference the `ThemeId`-typed `light` / `dark` keys, so a rename
fails typecheck; no shared helper (a two-literal constant would not hide anything). (3)
temporal decomposition — `checkThemeArtifacts` / `writeThemeArtifacts` split by operation over
one artifact list, which is acceptable. (4) pass-through — no. (5) split ownership — both
generated files come from one generator run; one owner. (6) two ways — no. (7) importable
internals — `buildUpdateProgressThemeCss` stays private (E-3). (8) hand-synced lists —
`.prettierignore`, `.fallowrc.jsonc` `duplicates.ignore` and `THEME_DEFINITION_PATHS` each
list the generated module; each omission fails a gate (commit-time prettier → `theme:check`,
`fallow:dupes`, the amber scan), so none can drift silently.

Findings:

- [INFORMATIONAL] (confidence: 9/10) `apps/desktop/electron/AutoUpdater.ts:307-312` —
  `this.sendDownloadProgress({ percent: UPDATE_PROGRESS_PERCENT_MIN, … })` runs on Download
  Now, so the HUD and the reader call happen there, not on the first `download-progress`
  (C-1). Fix the state table and test through Download Now.
- [INFORMATIONAL] (confidence: 9/10) `packages/desktop-contract/src/index.ts:1-2` —
  `export type * from './ipc'` / `'./electron-api'` only; import `OfflinePreferences` from
  `@corelive/desktop-contract/offline-workspace` (C-5).
- [INFORMATIONAL] (confidence: 8/10) plan Step 2 names no subpath for
  `normalizeThemePreference` / `ThemeId` / `THEME_IDS`; use `@corelive/live-editor/themes`
  (N-3).
- [INFORMATIONAL] (confidence: 7/10) N-1 startup race: a HUD created while the snapshot is not
  `ready` keeps System for that download. The per-tick re-read that reloads on change is the
  CEO-3 behavior both CEO voices dropped (audit row 9), so it stays dropped; the limit is
  stated in Step 3 and the util test pins the non-ready → System branch.

Dispositions: C-1, C-5, N-3 accepted (mechanical, P5); N-1 accepted as a documented limit,
re-read declined (binding decision, audit row 9); N-2 no change (verified).

#### Section 2 — Code quality

- [INFORMATIONAL] (confidence: 9/10) `apps/web/src/lib/themes/no-hardcoded-amber.test.ts:282-284`
  — the `issue === 214` assertion fails once the entry is removed; replace it with a check
  that the builder path is not in `ALLOWLIST`, so the scan keeps covering it (C-4).
- [INFORMATIONAL] (confidence: 8/10) E-3, the exported test-only helper (Step 0).
- [INFORMATIONAL] (confidence: 7/10) E-5, the typed annotation plus `THEME_TOKEN_SET_MISMATCH`
  (Step 0).
- [INFORMATIONAL] (confidence: 7/10) E-6, exported `checkThemeArtifacts` / `writeThemeArtifacts`
  (Step 0); every current `describeThemeCssDrift` caller and test moves to the new signature
  (N-7).
- Shared-code rubric: the only repeated policy (System → Default pair) has two callers in two
  runtimes with different mechanisms, and a helper would hide two literals; extraction
  rejected. No other duplication: the HUD builder reuses `normalizeThemePreference`, and the
  generator reuses `deriveThemeTokens` / `CATHEDRAL` / registry `tokens`.
- N-6, temp file + rename: declined. Both outputs are git-tracked, `theme:check` catches any
  partial result, and the DX-1 message already names what was written. A rename step adds
  cleanup paths to a developer-only script for no user-visible gain (P3, P5).

Dispositions: C-4, E-3, E-5, E-6, the N-7 caller updates accepted; extraction rejected; N-6
declined.

#### Section 3 — Test review

Framework: Vitest (`pnpm test` for apps/web, `pnpm test:electron` for
`apps/desktop/electron/**/*.test.ts` and `__tests__`, `apps/desktop/vitest.config.electron.ts:16-20`).
No LLM or prompt change, so no eval suite applies.

```
CODE PATHS                                                         USER FLOWS
[+] apps/web/scripts/generate-theme-css.ts                         [+] Update HUD for a picked theme
  ├── generateThemeTokensModule()                                    ├── [PLANNED ★★★] Harbor picked → Download Now → Harbor HUD
  │   ├── [PLANNED ★★★] static → registry tokens                      │      (util + AutoUpdater + builder unit chain; VM shows System only)
  │   ├── [PLANNED ★★★] derived → deriveThemeTokens                   ├── [PLANNED ★★ ] System user flips OS appearance → HUD follows (headless QA)
  │   ├── [PLANNED ★★★] preserved → CATHEDRAL[mode]                   ├── [PLANNED ★★★] theme changed mid-download → old palette until close
  │   └── [GAP→E-5]      key set ≠ ThemeToken → THEME_TOKEN_SET_MISMATCH├── [GAP→C-1]      error, then Download Now again → new HUD, current theme
  ├── checkThemeArtifacts()                                           └── [GAP→E-1]      account locked/opening → Default HUD
  │   ├── [PLANNED ★★★] stale → THEME_ARTIFACT_STALE + first line   [+] Developer flows
  │   ├── [PLANNED ★★★] missing → THEME_ARTIFACT_MISSING              ├── [PLANNED ★★★] registry edit, no regenerate → CI theme:check names the file
  │   └── [PLANNED ★★ ] equal → passes                                └── [GAP→E-6]      partial write → message names failed + written file
  ├── writeThemeArtifacts()  [GAP→E-6] second target fails
  └── describeThemeCssDrift(path,…) [EXISTING ★★★, signature update]
[+] apps/desktop/electron/update-progress-window-html.ts
  ├── buildUpdateProgressWindowHtml(progress, pref)
  │   ├── [PLANNED ★★★] undefined / 'system' / unknown → Default pair + dark media block
  │   ├── [PLANNED ★★★] 'default-dark' alias → Default dark (literal oklch(0.922 0 0))
  │   ├── [PLANNED ★★★] cathedral-light / cathedral-dark / harbor-dark → own tokens, no media block
  │   ├── [PLANNED ★★★] every ThemeId (table over THEME_IDS)
  │   ├── [GAP→E-4]      hostile / '__proto__' / 'constructor' → identical to 'system'
  │   ├── [PLANNED ★★ ] five tokens + color-scheme only (via builder output, E-3)
  │   ├── [PLANNED ★★ ] opaque var(--popover), no backdrop-filter (D-1)
  │   └── [EXISTING ★★ ] progressbar a11y, standalone doc, click-through, reduced motion
  └── buildUpdateProgressWindowUpdateScript() [EXISTING ★★, unchanged]
[+] apps/desktop/electron/utils/readUpdateHudThemePreference.ts [NEW]
  ├── [GAP→E-1] ready → stored theme
  ├── [GAP→E-1] opening / preparing / needs-preparation / locked / recovery → undefined
  └── [GAP→E-1] missing snapshot (offlineEditor null) → undefined
[+] apps/desktop/electron/AutoUpdater.ts
  ├── [GAP→C-1]      Download Now → 0% HUD from reader theme, reader called once
  ├── [PLANNED ★★★] later ticks → update script only, no 2nd loadURL, reader not re-called
  ├── [PLANNED ★★★] reader throws → System HUD + one UPDATE_HUD_THEME_READ_FAILED warn
  ├── [GAP→C-1]      error clears HUD → next Download Now re-reads, new HUD
  └── [PLANNED ★★ ] one-argument constructor still works
[+] apps/web/src/lib/themes/no-hardcoded-amber.test.ts
  └── [GAP→C-4] builder not allowlisted and scanned clean
[+] apps/web/src/lib/themes/update-hud-contrast.test.ts [NEW]
  ├── [PLANNED ★★★] text pairs on --popover ≥ 4.5 for every THEME_TOKENS entry
  └── [GAP→C-2]      fill vs composited 20% track ≥ 3 (plus primary/popover ≥ 3)

COVERAGE (plan before Eng): 23/36 paths (64%) | Code paths: 19/29 | User flows: 4/7
COVERAGE (with Eng remedies): 36/36 paths planned at ★★ or better (native per-theme capture is
  out of reach without a prepared account; the unit chain covers the non-Default case)
QUALITY (planned before Eng): ★★★: 16  ★★: 7  ★: 0  |  GAPS found by Eng: 13 (0 E2E, 0 eval)
```

Legend: ★★★ behavior + edge + error | ★★ happy path | ★ existence check | [GAP→id] =
added by the named remedy | [→E2E] none: the Electron E2E infra was retired (2026-08-27), and
the native VM capture is the integration check.

Regression rule: existing behavior at risk is the HUD's markup, a11y, click-through,
reduced motion, update script and window lifecycle. The existing builder tests
(`update-progress-window-html.test.ts:17-63`) and AutoUpdater window tests (`:489-560`) stay
and must pass unchanged; the intended differences are only the color declarations and the
removed blur (D-6). This is the plan's own approved contract (D-6), carried forward without a
new question.

Value cards for the new tests:

- Value: protects=a ready snapshot's theme reaches the HUD; fails_when=the reader returns
  undefined or reads the wrong field; why_new=no test reaches main.ts; seam=none (real util);
  no_claim=main.ts wiring itself (one-line call, typechecked)
- Value: protects=the HUD theme is read at Download Now; fails_when=the read moves to a later
  event or happens per tick; why_new=existing tests emit download-progress directly;
  seam=none; no_claim=real electron-updater timing (mocked updater)
- Value: protects=a retry after an error picks up the current theme; fails_when=a cached
  theme survives clearDownloadProgress; why_new=no test covers a second HUD; seam=none;
  no_claim=none beyond protects
- Value: protects=no stored value reaches the data: document; fails_when=the raw value is
  interpolated or a prototype key resolves; why_new=only registered/legacy/unknown values
  were planned; seam=none; no_claim=CSP (a data: URL has none)
- Value: protects=the bar fill stays visible on its track for every theme; fails_when=a token
  change drops primary/track below 3:1; why_new=planned gate compared primary to popover;
  seam=none; no_claim=sRGB compositing matches Chromium within rounding
- Value: protects=a generator partial write is reported truthfully; fails_when=the message
  claims nothing was written; why_new=logic was unreachable in the direct-run block;
  seam=none (real fs in a temp dir); no_claim=a crash between writes (git restores)
- Value: protects=the generated map has exactly the ThemeToken keys; fails_when=CATHEDRAL or
  derivation gains/loses a key; why_new=both sources are Record<string,string>; seam=none;
  no_claim=none beyond protects
- Value: protects=the amber scan covers the HUD builder; fails_when=the builder is
  re-allowlisted; why_new=the old assertion required the allowlist entry; seam=none;
  no_claim=non-oklch colors (the scan is oklch/Tailwind only)

Tests to retire: the `issue === 214` allowlist assertion (`no-hardcoded-amber.test.ts:282-284`),
replaced by the not-allowlisted check (C-4). Declined test proposals: a non-string reader
result (the reader is typed and the snapshot is zod-validated; `normalizeThemePreference`
already maps non-strings, `registry.ts:551`); the destroyed-window close race (unchanged code
path, existing `.catch`, `AutoUpdater.ts:443-447`).

Test plan artifact (written): `~/.gstack/projects/laststance-corelive/ryotamurakami-fix-214-update-window-theme-eng-review-test-plan-20261103-022905.md`.

Dispositions: E-1, E-4, E-5, E-6, C-1, C-2, C-4 test additions and the literal Default dark
expectation accepted; two proposals declined with reasons above.

#### Section 4 — Performance

The hot path is the `download-progress` tick (`AutoUpdater.ts:193-203` → `executeJavaScript`
of a one-line update script). It is unchanged, and the budget is enforced by test: no reader
call and no `loadURL` per tick. The new one-time work per HUD is one reader call, one
normalization and a five-declaration string, done once per download [estimated: under 1 ms].
The token module adds about 25-30 KB [estimated: 14 × 36 short `oklch` strings] to the lazy
`AutoUpdater` chunk, which loads only in packaged builds after startup; the `data:` URL gains
only the five tokens. No queries, caches or loops are involved. No issues found.

#### Eng amendments and failure modes

Failure modes (final plan):

| Path            | Realistic failure                     | Test                          | Handling                      | User sees                            |
| --------------- | ------------------------------------- | ----------------------------- | ----------------------------- | ------------------------------------ |
| generator       | registry edited, not regenerated      | stale test + CI `theme:check` | throws `THEME_ARTIFACT_STALE` | developer: file + fix command        |
| generator       | token key set drifts                  | E-5 test + typecheck          | throws before writing         | developer error                      |
| generator write | second write fails                    | E-6 test                      | message names both files      | developer error                      |
| reader          | snapshot not ready                    | util test                     | System                        | Default HUD (documented)             |
| reader          | throws                                | AutoUpdater test              | warn + System                 | Default HUD                          |
| builder         | unknown / hostile value               | builder tests                 | System                        | Default HUD                          |
| HUD             | theme changed mid-download            | AutoUpdater test              | palette kept                  | old palette until close (documented) |
| HUD             | retry after error                     | C-1 test                      | new HUD re-reads              | current theme                        |
| bundle          | `./theme-tokens` export missing       | `electron:build:ts`           | build fails                   | nothing ships                        |
| CI              | generated module flagged as duplicate | `fallow:dupes`                | `duplicates.ignore` (E-2)     | —                                    |

Critical gaps (no test, no handling, silent): 0 in the final plan. E-1 was one before its
remedy.

What already exists: see Step 0 table A. NOT in scope (added by Eng): a per-tick re-read
(binding decision, audit row 9); temp-file + rename writes (N-6); tests for a non-string
reader result and the close race (declined above).

Parallelization: Lane A (`apps/web/scripts`, `packages/live-editor`: generator, generated
module, export) → Lane B (`apps/desktop/electron`: util, builder, AutoUpdater, main) depends
on A's module; Lane C (DESIGN.md, `.fallowrc.jsonc`, `.prettierignore`, the amber guard) after
A. Sequential implementation in one checkout: B and C both need A's generated file.

#### Implementation Tasks (Eng)

Synthesized from this review's findings. Each task derives from a specific finding above.
Effort assumption: tests ~50x and small features ~30x human ÷ CC.

- [ ] **T13 (P1, human: ~1h / CC: ~10min)** — apps/desktop/electron/utils — Extract `readUpdateHudThemePreference` with phase tests and wire it in `main.ts`
  - Surfaced by: Step 0 — E-1 (`main.ts:713`, untested reader hidden by System captures)
  - Files: `apps/desktop/electron/utils/readUpdateHudThemePreference.ts`, `.test.ts`, `apps/desktop/electron/main.ts`
  - Verify: `pnpm test:electron`
- [ ] **T14 (P1, human: ~1h / CC: ~10min)** — AutoUpdater — Test the theme read on Download Now and the re-read after an error
  - Surfaced by: Section 1 — C-1 (`AutoUpdater.ts:307-312`)
  - Files: `apps/desktop/electron/AutoUpdater.ts`, `apps/desktop/electron/__tests__/AutoUpdater.test.ts`
  - Verify: `pnpm test:electron`
- [ ] **T15 (P1, human: ~1h / CC: ~10min)** — HUD builder — Private theme CSS helper, subpath imports, hostile-input and literal Default dark tests
  - Surfaced by: Step 0 — E-3, E-4; Section 1 — N-3; Section 3 — N-7
  - Files: `apps/desktop/electron/update-progress-window-html.ts`, `apps/desktop/electron/__tests__/update-progress-window-html.test.ts`
  - Verify: `pnpm test:electron`, `pnpm electron:build:ts`
- [ ] **T16 (P1, human: ~2h / CC: ~15min)** — theme generator — Typed `THEME_TOKENS`, `THEME_TOKEN_SET_MISMATCH`, exported check/write with temp-dir tests
  - Surfaced by: Step 0 — E-5, E-6; Section 2 — `describeThemeCssDrift` callers
  - Files: `apps/web/scripts/generate-theme-css.ts`, `apps/web/src/lib/themes/generate-theme-css.test.ts`
  - Verify: `pnpm test`, `pnpm theme:check`, `pnpm typecheck`
- [ ] **T17 (P1, human: ~15min / CC: ~3min)** — repo config — Exclude the token module from Fallow duplicates only
  - Surfaced by: Step 0 — E-2 / Codex C-3
  - Files: `.fallowrc.jsonc`
  - Verify: `pnpm fallow:dupes`, `pnpm fallow:dead-code`
- [ ] **T18 (P1, human: ~15min / CC: ~3min)** — amber guard — Replace the `issue === 214` assertion with a not-allowlisted check
  - Surfaced by: Section 2 — C-4 (`no-hardcoded-amber.test.ts:282-284`)
  - Files: `apps/web/src/lib/themes/no-hardcoded-amber.test.ts`
  - Verify: `pnpm test`
- [ ] **T19 (P1, human: ~30min / CC: ~5min)** — HUD contrast test — Gate the fill against the composited 20% track
  - Surfaced by: Section 3 — C-2 / N-4
  - Files: `apps/web/src/lib/themes/update-hud-contrast.test.ts`
  - Verify: `pnpm test`
- [ ] **T20 (P2, human: ~10min / CC: ~2min)** — PR body — List the not-ready-account limit next to the browser-only limit
  - Surfaced by: Section 1 — N-1
  - Files: PR description
  - Verify: PR body review at /ship

_No new tasks from Section 4 (Performance)._

#### Completion summary (Eng)

- Step 0: Scope Challenge — scope accepted as-is (D-eng-1 Original arrangement, auto-decided)
- Reality rows: 7/7 applicable rows emitted (`PLAN_REALITY: phase=eng rows=7/7 missing=none verdict=complete`); the Eng premise table has 0 unverified premises (the checker's `unverified=1` is the CEO table's P7, resolved by CEO-7)
- Architecture Review: 4 issues found (C-1, C-5, N-3, N-1)
- Code Quality Review: 4 issues found (C-4, E-3, E-5, E-6 with the `describeThemeCssDrift` callers)
- Test Review: diagram produced, 13 gaps identified (all closed by accepted remedies)
- Performance Review: 0 issues found
- NOT in scope: written
- What already exists: written (Step 0 table A)
- TODOS.md updates: 0 items proposed (TODOS.md must not be recreated; every item is resolved in this PR)
- Failure modes: 0 critical gaps flagged in the final plan (E-1 was one before its remedy)
- Unresolved decisions: 0 in this review (UC1 stays pending for the final gate, from the CEO phase)
- Outside voice: Codex (`gpt-6-astra`), completed, 5 findings (4 Medium, 1 Low); native Claude subagent completed (in-host)
- Parallelization: 3 lanes, 0 parallel / 3 sequential (B and C depend on A's generated module)
- Lake Score: N/A (Y = 0; the only selector, D-eng-1, differs in kind)

<!-- autoplan-baseline-edits:eng {"sourceSha256":"7779b37955a9e98297c557ce72a255ab5f1c5b976b85ff5fc7d7b2d2e963f263","replacements":[{"oldText":"  constructed only in packaged builds (`new AutoUpdaterCls(prepareForQuit)`).","newText":"  constructed only in packaged builds (`new AutoUpdaterCls(prepareForQuit)`).\n- No code sets `nativeTheme.themeSource` [measured: grep over `apps/desktop` and\n  `apps/web/src`], so `prefers-color-scheme` inside the HUD follows the OS appearance (N-2)."},{"oldText":"     `THEME_TOKENS: Readonly<Record<ThemeId, Readonly<Record<ThemeToken, string>>>>`","newText":"     `THEME_TOKENS: Readonly<Record<ThemeId, Readonly<Record<ThemeToken, string>>>>`, declared\n     with that annotation (no `as` cast) so `pnpm typecheck` rejects a missing or extra key;\n     the generator also throws `THEME_TOKEN_SET_MISMATCH <themeId> missing=<keys>\n     extra=<keys>` before writing anything when a resolved map's keys differ from the\n     `ThemeToken` set (E-5)"},{"oldText":"     Diagnostics carry only paths and the bounded color excerpts, no environment or config.","newText":"     Diagnostics carry only paths and the bounded color excerpts, no environment or config.\n     The check and write logic moves out of the direct-run block into exported\n     `checkThemeArtifacts(artifacts)` and `writeThemeArtifacts(artifacts)` over\n     `{ absolutePath, repoPath, content }[]`, using the real `node:fs`; the direct-run block\n     only builds the two-artifact list and calls them (E-6). Every existing\n     `describeThemeCssDrift` caller and test moves to the new signature."},{"oldText":"     The module joins `.prettierignore` next to generated.css (`.prettierignore:32-33`) and is","newText":"     The module joins `.prettierignore` next to generated.css (`.prettierignore:32-33`) and\n     `.fallowrc.jsonc` `duplicates.ignore` (only that list, so dead-code analysis still sees\n     `THEME_TOKENS` used; E-2), and is"},{"oldText":"   - `buildUpdateProgressWindowHtml(progress, themePreference?: string)`; normalize with\n     `normalizeThemePreference`.","newText":"   - `buildUpdateProgressWindowHtml(progress, themePreference?: string)`; normalize with\n     `normalizeThemePreference` (imported with `THEME_IDS` and the `ThemeId` type from\n     `@corelive/live-editor/themes`, the dependency-free `registry.ts`; `THEME_TOKENS` from\n     `@corelive/live-editor/theme-tokens`; N-3). Invariant (E-4): only the normalized\n     `ThemeId | 'system'` selects a `THEME_TOKENS` entry; the raw preference string is never\n     written into the HTML (`isThemeId` uses `Object.hasOwn`, so `'__proto__'` and\n     `'constructor'` normalize to System)."},{"oldText":"   - The token CSS comes from one exported helper `buildUpdateProgressThemeCss(preference)`","newText":"   - The token CSS comes from one module-private helper `buildUpdateProgressThemeCss(preference)`\n     (not exported: its only caller is the builder, so tests assert its output through\n     `buildUpdateProgressWindowHtml`; E-3)"},{"oldText":"the packaged Electron 44 Chromium has it,","newText":"the packaged Electron 45 Chromium has it,"},{"oldText":"     `() => undefined`; type-only import from `@corelive/desktop-contract`), so the existing","newText":"     `() => undefined`; type-only import from `@corelive/desktop-contract/offline-workspace`,\n     since the package root does not re-export it; C-5), so the existing"},{"oldText":"     `main.ts` passes a reader that returns\n     `snapshot.workspace.preferences.theme` when `offlineEditor?.controller.getSnapshot()`\n     is `ready`, else `undefined`; its return type is","newText":"     `main.ts` passes `() => readUpdateHudThemePreference(offlineEditor?.controller.getSnapshot())`;\n     the new util `apps/desktop/electron/utils/readUpdateHudThemePreference.ts` (E-1) returns\n     `snapshot.workspace.preferences.theme` when the snapshot is `ready`, else `undefined`\n     (also for a missing snapshot); its return type is"},{"oldText":"(documented limit). Dismissed alternatives:","newText":"(documented limit; the same holds for a HUD created while the account is not `ready`,\n     for example during startup or while locked: it stays on System until the next HUD,\n     because a per-tick re-read would be the dropped CEO-3 reload; N-1). Dismissed\n     alternatives:"},{"oldText":"     | before the first `download-progress` | no HUD |\n     | 0-99% | label, percent, bar, hint |\n     | `update-downloaded` | one final 100% tick, then the HUD closes (`AutoUpdater.ts:205-214`) |","newText":"     | before Download Now | no HUD |\n     | Download Now clicked | the HUD opens at 0% before `downloadUpdate()` starts (`AutoUpdater.ts:307-312`); the theme reader runs here (C-1) |\n     | 0-99% | label, percent, bar, hint |\n     | `update-downloaded` | a 100% update is requested, then the HUD closes (`AutoUpdater.ts:205-214`); the 100% frame may never paint |"},{"oldText":"     `THEME_DEFINITION_PATHS` (it legitimately contains Cathedral amber).","newText":"     `THEME_DEFINITION_PATHS` (it legitimately contains Cathedral amber). The existing\n     assertion that the `issue: 214` entry points at the builder\n     (`no-hardcoded-amber.test.ts:282-284`) becomes a regression check that the builder is no\n     longer allowlisted, so the scan covers it (C-4)."},{"oldText":"    `--primary: oklch(0.205 0 0)` light, Default dark primary from the registry);","newText":"    `--primary: oklch(0.205 0 0)` light, `--primary: oklch(0.922 0 0)` dark);"},{"oldText":"  - `buildUpdateProgressThemeCss(preference)` declares only the five HUD tokens and\n    `color-scheme`, and the builder embeds exactly that CSS.","newText":"  - The builder's token blocks (`:root` and the dark media block) declare only the five HUD\n    tokens and `color-scheme`, asserted on `buildUpdateProgressWindowHtml` output (E-3).\n  - Hostile or prototype-named values (`'</style><script>alert(1)</script>'`, `'__proto__'`,\n    `'constructor'`) produce output byte-identical to `'system'` (E-4)."},{"oldText":"- `AutoUpdater.test.ts`: the first progress event loads a data URL built with the\n  reader's theme;","newText":"- `AutoUpdater.test.ts`: clicking Download Now (mocked message box response 0) opens the\n  0% HUD with a data URL built with the reader's theme (C-1);"},{"oldText":"  `UPDATE_HUD_THEME_READ_FAILED` warning; the one-argument constructor still works.","newText":"  `UPDATE_HUD_THEME_READ_FAILED` warning; the one-argument constructor still works; after an\n  error clears the HUD, the next Download Now calls the reader again and builds a new HUD\n  with the current theme (C-1, N-7).\n- `apps/desktop/electron/utils/readUpdateHudThemePreference.test.ts` (new, E-1): a `ready`\n  snapshot returns its stored theme; each non-ready phase (`opening`, `preparing`,\n  `needs-preparation`, `locked`, `recovery`) and a missing snapshot return `undefined`."},{"oldText":"  are at least 4.5:1, and `--primary` on `--popover` is at least 3:1 (WCAG 1.4.11 for the fill)\n  (D-2).","newText":"  are at least 4.5:1, `--primary` on `--popover` is at least 3:1, and `--primary` on the track\n  (`--primary` at 20% alpha composited over `--popover` in sRGB, as the browser paints\n  `color-mix(in oklch, var(--primary) 20%, transparent)`) is at least 3:1 (WCAG 1.4.11 for the\n  fill against what touches it) (D-2, N-4, C-2). Measured on 2026-11-03 over all 14 themes:\n  minimum muted/popover 4.73 (Default light), primary/popover 4.38 and primary/track 3.40\n  (harbor-light) [measured: Eng review culori run over `THEME_REGISTRY`]."},{"oldText":"- `pnpm theme:check` (both artifacts), `pnpm validate`.","newText":"- `pnpm theme:check` (both artifacts), `pnpm --filter @corelive/live-editor lint` (the\n  generated module is emitted lint-clean, so commit-time `eslint --fix` never rewrites it),\n  `pnpm fallow:dupes`, `pnpm fallow:dead-code`, `pnpm electron:build:ts`, `pnpm validate`."},{"oldText":"- QA, native (issue acceptance 3; CLAUDE.md \"Electron Native QA\" names auto-update): in the","newText":"- QA, native (issue acceptance 3; CLAUDE.md \"Electron Native QA\" names auto-update; a merge\n  gate unless the owner approves User Challenge UC1 at the final gate): in the"}]} -->

<!-- autoplan-accepted:eng -->

- E-1: `apps/desktop/electron/utils/readUpdateHudThemePreference.ts` exports `readUpdateHudThemePreference(snapshot: OfflineEditorSnapshot | undefined): OfflinePreferences['theme'] | undefined` (ready → `workspace.preferences.theme`; any other phase or a missing snapshot → `undefined`); `main.ts` passes `() => readUpdateHudThemePreference(offlineEditor?.controller.getSnapshot())` as the `AutoUpdater` reader. Test: colocated `readUpdateHudThemePreference.test.ts` covers ready, `opening`, `preparing`, `needs-preparation`, `locked`, `recovery` and `undefined`.
- E-2: `packages/live-editor/src/themes/themeTokens.generated.ts` is added to `.fallowrc.jsonc` `duplicates.ignore` only (not `ignorePatterns`). Verify: `pnpm fallow:dupes` and `pnpm fallow:dead-code` pass.
- E-3: `buildUpdateProgressThemeCss` stays module-private; tests assert the five-token + `color-scheme` contract on `buildUpdateProgressWindowHtml` output.
- E-4: the raw theme preference is never written into the HUD HTML; only the normalized `ThemeId | 'system'` selects a `THEME_TOKENS` entry. Test: `'</style><script>alert(1)</script>'`, `'__proto__'` and `'constructor'` produce output byte-identical to `'system'`.
- E-5: the generated module declares `THEME_TOKENS: Readonly<Record<ThemeId, Readonly<Record<ThemeToken, string>>>>` by annotation (no `as` cast); the generator throws `THEME_TOKEN_SET_MISMATCH <themeId> missing=<keys> extra=<keys>` before writing when a resolved map's keys differ from `ThemeToken`. Test: a seed/map with a missing and an extra key throws that code.
- E-6: `checkThemeArtifacts(artifacts)` and `writeThemeArtifacts(artifacts)` are exported from `apps/web/scripts/generate-theme-css.ts` over `{ absolutePath, repoPath, content }[]` with the real `node:fs`; the direct-run block only builds the two-artifact list and calls them; every `describeThemeCssDrift` caller/test uses the new signature. Tests in a `mkdtempSync` directory: stale → `THEME_ARTIFACT_STALE` + first differing line + `pnpm theme:generate`; missing → `THEME_ARTIFACT_MISSING` + `pnpm theme:generate`; a second target inside a nonexistent directory → the message names the failed file and the already-written file.
- C-1: the HUD state table says the HUD opens at 0% on Download Now (`AutoUpdater.ts:307-312`) and that the 100% frame may never paint before close. Tests: Download Now (message box response 0) builds the HUD from the reader's theme with one reader call; after an error clears the HUD, the next Download Now calls the reader again and builds a new HUD with the current theme.
- C-2: `update-hud-contrast.test.ts` also asserts `--primary` against the track (`--primary` at 20% alpha composited over `--popover` in sRGB) ≥ 3:1 for every `THEME_TOKENS` entry, besides primary/popover ≥ 3:1 and the two text pairs ≥ 4.5:1.
- C-4: the `issue === 214` allowlist assertion in `no-hardcoded-amber.test.ts` is replaced by an assertion that `apps/desktop/electron/update-progress-window-html.ts` is not in `ALLOWLIST`; the scan passes on the new builder.
- C-5 / N-3: `OfflinePreferences` / `OfflineEditorSnapshot` are type-only imports from `@corelive/desktop-contract/offline-workspace`; `normalizeThemePreference`, `THEME_IDS` and `ThemeId` come from `@corelive/live-editor/themes`; `THEME_TOKENS` from `@corelive/live-editor/theme-tokens`. Verify: `pnpm typecheck`, `pnpm electron:build:ts`.
- N-1: Step 3's documented limit also covers a HUD created while the account is not `ready` (it stays on System until the next HUD); no per-tick re-read (binding CEO-7). The PR body lists it with D-7.
- N-7: the Default dark expectation is the literal `--primary: oklch(0.922 0 0)`.
- Gates: `pnpm --filter @corelive/live-editor lint` on the generated module, `pnpm fallow:dupes`, `pnpm fallow:dead-code`, `pnpm electron:build:ts` and `pnpm validate` pass. The native VM capture stays a merge gate unless the owner approves UC1.

<!-- /autoplan-accepted:eng -->

<!-- AUTONOMOUS DECISION LOG -->

## Decision Audit Trail

| #   | Phase  | Decision                                                                          | Classification | Principle            | Rationale                                                                  | Rejected                                                                                  |
| --- | ------ | --------------------------------------------------------------------------------- | -------------- | -------------------- | -------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------- |
| 1   | CEO    | Approach A: generated typed token map                                             | Taste          | P1, P5               | explicit, testable, reusable for later native surfaces                     | B raw CSS in data URL (implicit Tailwind-directive dropping), C renderer entry (XL infra) |
| 2   | CEO    | Mode SELECTIVE EXPANSION                                                          | Mechanical     | override             | autoplan rule                                                              | —                                                                                         |
| 3   | CEO    | Accept E1/CEO-3 in-place swap                                                     | Taste          | P1, P2               | same file, S; no flash                                                     | reload; next-window only                                                                  |
| 4   | CEO    | Skip E2 size/speed, E3 reduced transparency, E4 preview.ts                        | Mechanical     | P3, owner preference | outside #214                                                               | add to scope                                                                              |
| 5   | CEO    | Accept then reverse CEO-4 font stacks                                             | Mechanical     | P3, P5               | HUD already on a system stack                                              | Tailwind stacks pinned to node_modules                                                    |
| 6   | CEO    | Native QA in Tart VM, gates merge (reversed my "no VM" taste call)                | Mechanical     | CLAUDE.md rule       | auto-update is a listed native QA surface; issue acceptance 3              | headless only                                                                             |
| 7   | CEO    | Fold spec R1-R3 fixes (CEO-5, CEO-6, R3 four gaps)                                | Mechanical     | P1                   | completeness of accepted behavior                                          | —                                                                                         |
| 8   | CEO    | 0H document approval A                                                            | Mechanical     | P6                   | both documents reflect decisions                                           | revise / pause                                                                            |
| 9   | CEO    | Drop CEO-3 live swap; apply theme once at HUD start (CEO-7)                       | Mechanical     | P3, P5               | both CEO voices; my own expansion, not the owner direction                 | live swap with retry                                                                      |
| 10  | CEO    | Keep full 36-token THEME_TOKENS map (T1)                                          | Taste          | P4, P5               | one generic artifact; Claude voice preferred a 5-token module              | HUD-only module; parse generated.css                                                      |
| 11  | CEO    | Keep native VM QA as merge gate pending UC1                                       | User Challenge | —                    | issue acceptance 3 stands until the owner approves a change                | drop the VM gate (both voices)                                                            |
| 12  | CEO    | Decline HUD existence/dismissal change (Codex #2)                                 | Mechanical     | P3                   | click-through by design; outside #214                                      | redesign HUD visibility                                                                   |
| 13  | CEO    | Shrink headless matrix to 4 states; no swap video                                 | Mechanical     | P3                   | no dynamic claim left after CEO-7                                          | 6 themes × 2 backdrops                                                                    |
| 14  | Design | Approve mockup variant B (board not served on the host)                           | Taste          | P5, P6               | closest to the brief; AGENTS.md forbids opening a host browser             | A (failed check), C                                                                       |
| 15  | Design | Opaque --popover panel, drop blur (D-1)                                           | Mechanical     | P5, a11y             | both voices; 96% over dark drops Default light muted text below AA         | keep translucency + composited contrast gate                                              |
| 16  | Design | HUD contrast test over THEME_TOKENS (D-2)                                         | Mechanical     | P1                   | proves all 14 themes                                                       | 14-theme screenshots                                                                      |
| 17  | Design | State table, System contract, QA criteria, unchanged typography (D-3..D-6)        | Mechanical     | P5                   | both voices; structural gaps                                               | leave to implementer                                                                      |
| 18  | Design | Keep system font stacks despite slop #11 (T2)                                     | Taste          | DESIGN.md            | owner decision 2026-09-05                                                  | pick a typeface                                                                           |
| 19  | Design | PR known limitation for web-only theme picks (D-7)                                | Mechanical     | P5                   | Claude voice                                                               | silent                                                                                    |
| 20  | DX     | Product type internal Library/SDK + CLI; persona AI coding agent; mode POLISH     | Mechanical     | P6, override         | repo evidence; autoplan rule                                               | YC founder / platform engineer personas                                                   |
| 21  | DX     | TTHW target Competitive (2-5 min)                                                 | Mechanical     | P5                   | estimate ~2-3 min; Champion unproven                                       | Champion                                                                                  |
| 22  | DX     | Agent-ready drift/missing/write contract (DX-1)                                   | Mechanical     | P1                   | both voices; CAP6                                                          | raw ENOENT                                                                                |
| 23  | DX     | Reader failure warn diagnostic + typed optional arg + JSDoc (DX-2/3/5)            | Mechanical     | P1, P5               | both voices                                                                | debug-only                                                                                |
| 24  | DX     | DESIGN.md how-to + :154/:161/:363 + module header (DX-4/6)                        | Mechanical     | P1                   | both voices                                                                | name-only doc                                                                             |
| 25  | DX     | Decline QA env override for forcing the HUD palette natively                      | Mechanical     | P5                   | no QA hooks in production; headless covers per-theme                       | CORELIVE_UPDATE_HUD_THEME                                                                 |
| 26  | DX     | Decline color-mix @supports fallback / track contrast check                       | Mechanical     | P3                   | Electron 44 Chromium has color-mix; track is decorative (fill ≥3:1 tested) | add guard                                                                                 |
| 27  | Eng    | Original file arrangement (D-eng-1)                                               | Mechanical     | P5                   | same moving parts; a HUD-named contrast file                               | fold into generate-theme-css.test.ts                                                      |
| 28  | Eng    | Extract the main-process reader into a tested util (E-1)                          | Mechanical     | P1, P5               | the only untested link; System captures hide it                            | inline closure in main.ts                                                                 |
| 29  | Eng    | Fallow duplicates.ignore for the token module (E-2/C-3)                           | Mechanical     | P1                   | validate would fail; dead-code keeps seeing it                             | ignorePatterns                                                                            |
| 30  | Eng    | Private theme CSS helper (E-3)                                                    | Mechanical     | P5, test value bar   | test-only export                                                           | exported helper                                                                           |
| 31  | Eng    | Hostile-input invariant + test (E-4/N-5)                                          | Mechanical     | P1                   | synced string into a CSP-less data: URL                                    | rely on normalization silently                                                            |
| 32  | Eng    | Typed annotation + THEME_TOKEN_SET_MISMATCH (E-5)                                 | Mechanical     | P1, P5               | Record<string,string> sources                                              | test-only key check                                                                       |
| 33  | Eng    | Exported check/write over real fs (E-6)                                           | Mechanical     | P5                   | direct-run block unreachable by tests                                      | spawn tsx; injected fs seam                                                               |
| 34  | Eng    | HUD opens on Download Now; test that path + re-read after error (C-1/N-7)         | Mechanical     | P1                   | verified AutoUpdater.ts:307-312                                            | emit download-progress only                                                               |
| 35  | Eng    | Fill vs composited track ≥ 3:1 (C-2/N-4)                                          | Mechanical     | P1                   | both voices; all 14 pass today (min 3.40)                                  | primary/popover only                                                                      |
| 36  | Eng    | Replace the issue-214 allowlist assertion (C-4)                                   | Mechanical     | P1                   | suite would fail                                                           | delete the assertion                                                                      |
| 37  | Eng    | Subpath imports: desktop-contract/offline-workspace, live-editor/themes (C-5/N-3) | Mechanical     | P5                   | root does not export the type                                              | root import                                                                               |
| 38  | Eng    | Startup race → documented limit, no per-tick re-read (N-1)                        | Mechanical     | binding CEO-7        | re-read = the dropped CEO-3 reload                                         | re-read and reload on change                                                              |
| 39  | Eng    | Decline temp-file + rename writes (N-6)                                           | Mechanical     | P3, P5               | git-tracked outputs; theme:check catches drift                             | atomic rename                                                                             |
| 40  | Eng    | Decline non-string reader and close-race tests (N-7)                              | Mechanical     | P3                   | typed + zod-validated; unchanged path with .catch                          | add tests                                                                                 |

## GSTACK REVIEW REPORT

| Review         | Trigger                                       | Why                             | Runs | Status               | Findings                                                              |
| -------------- | --------------------------------------------- | ------------------------------- | ---- | -------------------- | --------------------------------------------------------------------- |
| CEO Review     | `/plan-ceo-review` (via /autoplan)            | Scope & strategy                | 1    | ISSUES OPEN (mapped) | mode: SELECTIVE_EXPANSION, 0 critical gaps                            |
| Outside Review | Codex `gpt-6-astra` (`codex exec`, per phase) | Independent 2nd opinion         | 4    | completed            | CEO, Design, DX, Eng all completed; Eng: 5 concerns (4 Medium, 1 Low) |
| Eng Review     | `/plan-eng-review` (via /autoplan)            | Architecture & tests (required) | 1    | ISSUES OPEN (mapped) | 21 issues, 0 critical gaps                                            |
| Design Review  | `/plan-design-review` (via /autoplan)         | UI/UX gaps                      | 1    | ISSUES OPEN (mapped) | score: 4/10 → 8/10, 7 decisions                                       |
| DX Review      | `/plan-devex-review` (via /autoplan)          | Developer experience gaps       | 1    | ISSUES OPEN (mapped) | score: 6/10 → 8/10, TTHW: ~3 min → 2-5 min                            |

- **OUTSIDE COVERAGE:** Codex completed in every phase (ceo, design, dx, eng); no unavailable, disabled or skipped phase. Native Claude subagents (in-host) completed in every phase.
- **CROSS-MODEL:** Eng 3/6 confirmed (architecture, test gaps, error-path gaps), 1 disagreement (deployment risk) resolved by three verified concrete fixes, 2 single-voice dimensions; CEO 5/6, Design 3 confirmed + 1 disagreement, DX 5/6. Every finding is mapped to accepted remedies T1-T20; "issues open" means mapped work, not failure.
- **VERDICT:** CEO + DESIGN + DX + ENG reviewed; plan approved at the final gate (`rec`, applied from the owner's standing instruction, gate_rev 1). UC1 answered b: the native Tart VM capture stays a merge gate. Eng is not CLEAR in the dashboard sense (issues mapped to tasks) — ready to implement; eng review required items are the P1 tasks.

NO UNRESOLVED DECISIONS
