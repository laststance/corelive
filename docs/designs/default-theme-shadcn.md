<!-- /autoplan restore point: "/Users/ryotamurakami/laststance/corelive/.gstack/tmp/autoplan/fix-213-default-theme-shadcn-autoplan-restore-20261102-192114.md" -->

## Implementation plan

# Make stock shadcn Default the applied default theme (#213)

Status: plan, 2026-11-02. Issue: https://github.com/laststance/corelive/issues/213

## Owner intent

> amberをテーマカラーとして扱うのやめてくれや、何回Chadcnのデフォルトがデフォルトthemeって説明した？amber基調のはあくまでもthemeメニューから選べる一つのthemeオプションの一つな。

> デフォルトテーマでこのログインになってるから、直して。 (the login window renders amber)

The applied default is the stock shadcn **Default** neutral pair. Warm Cathedral (amber) is one option in the theme menu, nothing more.

## Facts (main @ 4302821e)

- `packages/live-editor/src/themes/registry.ts:476` `DEFAULT_THEME_ID = 'light'`, and `light`/`dark` are the **Warm Cathedral** ids. Default uses `default-light`/`default-dark`.
- next-themes (`apps/web/src/providers/ThemeProvider.tsx`, `enableSystem`) resolves **System** to the literal names `light`/`dark`, so System can only ever follow whichever family owns those two ids (today Warm Cathedral). `useThemeAxis` therefore offers System only for the cathedral family.
- CSS: `packages/live-editor/src/styles/base.css` `:root` and `[data-theme='dark']` hold the hand-authored Warm Cathedral palette, so any page before hydration (and any window with no stored theme, e.g. the login window) paints amber. `generated.css` emits `:root[data-theme='default-light']` etc. from `apps/web/scripts/generate-theme-css.ts`.
- Desktop editor: `apps/desktop/renderer/NativeEditor.tsx` resolves `system` to `light`/`dark` and unknown ids to `DEFAULT_THEME_ID`.
- Theme reaches desktop as a raw string through `OfflinePreferenceSync.themeChanged` → workspace `preferences.theme`.
- The login window (`/login-shell`) uses tokens only; the amber is the default theme, not hard-coded color.
- LiveEditor text-color preset `{ id: 'amber', label: 'Amber', cssValue: 'var(--primary)' }` is themed but labelled after the cathedral hue (`packages/desktop-contract/src/live-editor-constants.ts:148`). Stored value is the `cssValue`, not the id.
- `DESIGN.md` §Theme rules 1, 2, 8 and the instances paragraph say Warm Cathedral is the default and owns System.

## Decision

1. **Swap the ids.** The Default family takes the flat ids `light`/`dark`; Warm Cathedral becomes `cathedral-light`/`cathedral-dark` like every other family. `getThemeId` loses its cathedral special case and gains a `default` one. `DEFAULT_THEME_ID` stays `'light'`, which now means shadcn Default light; it is the concrete fallback id. The stored-preference default is `system` (`DEFAULT_THEME_PREFERENCE`, CEO-1/CEO-3).
   - Why: System must follow the default pair, and next-themes System can only resolve to the names `light`/`dark`. Owning those names is what "default" means here. Every other approach needs a custom System resolver plus its own pre-hydration script.
2. **System follows Default.** `useThemeAxis.availableModes` exposes System for the `default` family; picking Default while on System keeps System. Warm Cathedral becomes explicit Light/Dark like the colored families. `NativeEditor` keeps its `system → light/dark` mapping, which now lands on Default.
3. **CSS fallback is Default.** The no-attribute `:root` palette is shadcn Default light (emitted by the generator as `:root, :root[data-theme='light'], :root[data-theme='default-light']`), Default dark is `:root[data-theme='dark'], :root[data-theme='default-dark']`, plus the desktop-only first-paint block `@media (prefers-color-scheme: dark) { :root:not([data-theme]) { … } }` (CEO-2/CEO-7/CEO-17). The Warm Cathedral palette stays hand-authored in `base.css`, byte-identical values, under `:root[data-theme='cathedral-light']` / `:root[data-theme='cathedral-dark']`. `--radius`, `color-scheme` defaults and `--control-border` stay on bare `:root`.
4. **Legacy stored ids.** Only `default-light`/`default-dark` need an alias (`normalizeThemePreference` in the registry, CEO-4), applied where a stored id is read: `ThemeAllowlistGuard` (rewrites storage) and `NativeEditor`; the generator also keeps `default-*` CSS selectors so the pre-hydration paint is already Default (CEO-2). An old stored `light`/`dark` (Warm Cathedral) now reads as Default. Accepted: pre-release, single user (CLAUDE.md "Production Status"), and the owner wants Default; a versioned remap would need a pre-hydration script and two-store coordination for a case that does not exist.
5. **Text-color preset** `amber` → `{ id: 'accent', label: 'Accent' }`, same `var(--primary)`; no stored-value change.
6. **Words.** `DESIGN.md` theme rules and instances paragraph: shadcn Default is the applied default and owns System; Warm Cathedral is one selectable family (its palette tables stay, titled as the Warm Cathedral theme). Code comments that call default UI "amber" (`ElectronOAuthButtons.tsx:63,73,204`, `DayDetailDialog.tsx:178`, registry comments) switch to token wording (`--primary`, `cathedral-lit`).

## Out of scope (own issues)

- #214 update-download window colors. #215 delete web LiveEditor. #216 offline-first desktop editor.
- Category color `amber` (`category-colors.ts`, `desktop-contract/category.ts`) is a user-picked category hue, not theme chrome; unchanged.

## Tests

- `registry.test.ts`: `DEFAULT_THEME_ID` is the Default family; ids `light`/`dark` belong to Default; cathedral ids are `cathedral-*`; `getThemeId('default','dark') === 'dark'`, `getThemeId('cathedral','light') === 'cathedral-light'`.
- `cathedral-css-snapshot.test.ts`: cathedral palette values unchanged, now under `cathedral-*` selectors; bare `:root` palette equals the Default seed.
- `generate-theme-css` test + `pnpm theme:check`: Default emitted as `:root, :root[data-theme='light'], :root[data-theme='default-light']` and `:root[data-theme='dark'], :root[data-theme='default-dark']`, and the `:root:not([data-theme])` dark media block (CEO-2/CEO-7/CEO-17).
- `useThemeAxis` tests: System offered for Default only; Default ↔ System round trip; Warm Cathedral explicit.
- `ThemeAllowlistGuard` test: stored `default-dark` rewrites to `dark`; unknown id heals to `system` (CEO-3).
- `NativeEditor` theme test: no stored theme follows the OS (`data-theme="light"` with a light OS, `"dark"` with a dark OS; CEO-1); `default-dark` → `dark`; `system` + dark OS → `dark`.
- Text-color preset label test.

## QA (headless only, no host takeover)

- Web (`pnpm dev`, isolated `pnpm qa:browser`, fresh profile): `/login`, `/login-shell` render the neutral Default palette (screenshot; `--primary` computed is the Default value); emulate `prefers-color-scheme: dark` with System → Default dark; Settings picker: Default shows System, Warm Cathedral shows Light/Dark and applies amber.
- Desktop editor fixture (`pnpm qa:offline-editor`): no stored theme → Default; `cathedral-light` → amber; `system` + dark → Default dark.
- Theme crossfade still animates (video frames).

## Verification

`pnpm validate` (includes `theme:check`), `pnpm test:electron`.

<!-- autoplan-accepted:ceo -->

- CEO-1: With no stored theme, web uses next-themes `defaultTheme='system'` so the OS picks Default light or Default dark; the desktop editor treats a missing or blank workspace theme as `system`. `DEFAULT_THEME_ID` stays `light` (Default light) as the fallback for unknown ids. Tests: ThemeProvider renders `defaultTheme="system"`; NativeEditor with no theme and a dark OS sets `data-theme="dark"`, with a light OS `light`. QA: fresh headless profile with `prefers-color-scheme: dark` shows Default dark on `/login`.
- X1: Add a guard test that fails when an amber hue literal (oklch hue 30–80 with chroma ≥ 0.1, or a Tailwind `amber-*` class) appears in theme-bearing source outside the Warm Cathedral definitions (base.css cathedral blocks, the registry cathedral seed), the user-picked category palette (`category-colors.ts`, `desktop-contract/src/category.ts`) and the heatmap ramps; `apps/desktop/electron/update-progress-window-html.ts` is excluded by name with a comment pointing to #214. Test: the guard passes on the branch and fails on a planted `oklch(0.56 0.16 50)` in a non-allowlisted file.
- CEO-2: The theme CSS generator also emits the legacy selectors `:root[data-theme='default-light']` (with the Default light block) and `:root[data-theme='default-dark']` (with the Default dark block), so a stored legacy id paints Default before `ThemeAllowlistGuard` rewrites it. Test: generator output contains both alias selectors on the Default blocks. QA: a headless profile pre-seeded with `localStorage['corelive-theme']='default-dark'` paints Default dark at first frame (screenshot) and ends with storage `dark`.
- CEO-3: One fallback contract, web and desktop: no stored value → `system`; `system` → Default light/dark by OS; `light`/`dark` (old Warm Cathedral or new Default) → Default light/dark; `default-light`/`default-dark` → `light`/`dark`; `cathedral-*` and colored ids → that theme; unknown or blank → `system`. `DEFAULT_THEME_PREFERENCE = 'system'` is exported from the registry; web `ThemeProvider` uses it as `defaultTheme`, `ThemeAllowlistGuard` heals unknown values to it, and `NativeEditor` uses it before the workspace is ready and for unknown/blank values. `DEFAULT_THEME_ID = 'light'` stays the concrete id where an id is required. Tests: table-driven over every row for `normalizeThemePreference`; NativeEditor pre-ready with a dark OS sets `data-theme="dark"`.
- CEO-4: `normalizeThemePreference(value: unknown): ThemeId | 'system'` lives in `packages/live-editor/src/themes/registry.ts` (re-exported to web by `apps/web/src/lib/themes/registry.ts` `export *`); `isThemeId` stays strict. Legacy aliases are a private `Record<string, ThemeId>` inside the registry. Tests: one row per CEO-3 case.
- CEO-5: Sweep every theme-id literal (`'light'`, `'dark'`, `'default-light'`, `'default-dark'`, `'warm-cathedral-*'`) in source, scripts and tests with `rg`, classifying each as a mode literal (unchanged) or an id literal (renamed or justified): at least `ThemeId`/`getThemeId` (`registry.ts:41,530`), `THEME_REGISTRY` keys and lookups, the generator's cathedral ladder mirror (`apps/web/scripts/generate-theme-css.ts`), `apps/web/scripts/qa-settings/main.tsx`, `apps/desktop/scripts/qa-offline-editor.ts`, the desktop benchmark script and existing tests. Verify: `pnpm typecheck` and `pnpm validate` green.
- CEO-6: Picker transitions in `useThemeAxis`: Default offers Light/Dark/System; every other family offers Light/Dark. `setMode('system')` from any family selects System (the Default pair); `setFamily('default')` while on System stays on System; `setFamily(x)` for any other family while on System selects `x` at the resolved mode. Tests for each transition plus Warm Cathedral → System → Warm Cathedral.
- CEO-7: CSS split: bare `:root` keeps `color-scheme: light` and `--radius`; the Warm Cathedral light palette moves byte-identical to `:root[data-theme='cathedral-light']`; the `[data-theme='dark']` block moves byte-identical (with `color-scheme: dark`) to `:root[data-theme='cathedral-dark']`; the `--control-border` `:root` block is unchanged. The generator emits Default as `:root, :root[data-theme='light'], :root[data-theme='default-light']` and `:root[data-theme='dark'], :root[data-theme='default-dark']`; Warm Cathedral stays `preserve` (not generated). Test: the cathedral snapshot test pins the moved blocks byte-for-byte; `pnpm theme:check` clean.
- CEO-8 (taste): The Default family keeps the existing warm heatmap ramp (`--hm-*`): DESIGN.md treats the heatmap ramp as content color, not theme chrome. The guard allowlists `--hm-*` values with that reason.
- CEO-9: The amber guard (X1) scans hand-authored `.ts/.tsx/.css/.html` under `apps/web/src`, `apps/desktop/renderer`, `apps/desktop/electron` and `packages/*/src`, excluding tests, `generated.css`, `themes/registry.ts`, `apps/web/scripts/generate-theme-css.ts` and the theme tooling `apps/web/src/lib/themes/{preview,contrast}.ts`. In `base.css` only the `cathedral-*` blocks and `--hm-*`/`--chart-*` declarations may carry amber; the category palettes are allowed; `apps/desktop/electron/update-progress-window-html.ts` is excluded by name with a comment pointing to #214. Matches: `oklch(L C H[ / a])` with 30 ≤ H ≤ 80 and C ≥ 0.1, and Tailwind classes `[a-z-]+-amber-[0-9]{2,3}`. It is green on the branch; a planted `oklch(0.56 0.16 50)` in a non-allowlisted file fails it.
- CEO-10: Crossfade QA uses the offline-editor fixture (`window.__offlineFixture.control({ theme })`) switching `light` → `cathedral-light`, recorded with `pnpm qa:browser video-start`/`video-stop`, frames extracted with ffmpeg and inspected.
- CEO-11 (premise correction, taste T2 at the gate): Old stored `light`/`dark` values read as Default; no migration to `cathedral-*`, because they cannot be told apart from the old seeded default (`offline-settings-sync.ts:414,575`). Distinguishable explicit picks are kept: `default-*` via the alias, every colored-family id unchanged. Test: `normalizeThemePreference('light') === 'light'` (Default) and `('harbor-dark') === 'harbor-dark'`.
- CEO-12: Login window QA: headless `/login-shell` screenshots on Default (no stored theme), Default with a dark OS (`pnpm qa:browser set-color-scheme dark`), and Warm Cathedral (`localStorage['corelive-theme']='cathedral-light'`). The explicit-choice path is the shared default-session `corelive.app` localStorage (no BrowserWindow `partition`), recorded in the QA report.
- CEO-13: The text-color preset keeps `var(--primary)` under the `accent`/"Accent" label; a test asserts `--primary` on `--background` is at least 4.5:1 for the Default pair and Warm Cathedral (reuse the existing contrast helper in `apps/web/src/lib/themes/contrast.ts`).
- CEO-14: Sync boundary normalization: `OfflinePreferenceSync.themeChanged` and `applyNativePreferences` pass values through `normalizeThemePreference`, so a legacy `default-*` from either side converges to `light`/`dark` without a second round trip. Tests: native `default-dark` applies `dark` to web and pushes `dark` back once; web `default-light` is pushed as `light`.
- CEO-15: Types and comments: `ThemeId` becomes `'light' | 'dark' | ${Exclude<ThemeFamilyId, 'default'>}-${ThemeMode}`; `getThemeId('default', m)` returns `m`; `default-*` are not `ThemeId`s, only legacy aliases. Registry, `THEME_FAMILY_LABEL`/`THEME_FAMILY_IDS` comments and the Facts wording describe `DEFAULT_THEME_ID` as the concrete Default light id and `DEFAULT_THEME_PREFERENCE` as the fresh-state value. Verify: `pnpm typecheck`.
- CEO-16: The shipped test set is the Tests section plus every `Tests:`/`Test:` clause in CEO-1..CEO-17 and X1; none is optional.
- CEO-17: Desktop first paint follows the OS: remove `data-theme="light"` from `apps/desktop/renderer/index.html`, and the generator emits `@media (prefers-color-scheme: dark) { :root:not([data-theme]) { Default dark tokens } }`, so the editor window never paints light on a dark OS before React mounts. Test: generator output contains the media block; QA: the desktop fixture with a dark OS shows Default dark in its first recorded frame.
- CEO-4 (restated): `LEGACY_THEME_ID_ALIASES` (read-only, exported) and `normalizeThemePreference(value: unknown): ThemeId | 'system'` live in `packages/live-editor/src/themes/registry.ts`; the generator reads the alias map to emit the legacy selectors (CEO-2). Readers: `ThemeAllowlistGuard`, `useThemeAxis` (raw stored value), `NativeEditor`, and the sync boundary (CEO-14). `isThemeId` stays strict.
- CEO-6 (restated as expected ids): Light/Dark/System offered for Default, Light/Dark for every other family. From System: `setFamily('default')` → `system`; `setFamily('cathedral')` → `cathedral-<resolved>`; `setFamily('harbor')` → `harbor-<resolved>`. From `cathedral-light`: `setMode('system')` → `system`; `setMode('dark')` → `cathedral-dark`. From `light`: `setMode('dark')` → `dark`; `setFamily('cathedral')` → `cathedral-light`.
- CEO-7 (restated): The Warm Cathedral `:root` palette and its header comment move together to `:root[data-theme='cathedral-light']`; `[data-theme='dark']` moves to `:root[data-theme='cathedral-dark']`; values byte-identical. The snapshot test extracts those two selectors instead of `/:root \{[^}]*\}/`. A new test asserts every bare `:root` block in `base.css` declares no color token (only `color-scheme`, `--radius`, `--control-border`).
- CEO-9 (restated): Guard coverage is stated as partial: it detects `oklch` literals (hue 30–80, chroma ≥ 0.1) and Tailwind `amber-`/`orange-`/`yellow-` color classes in hand-authored UI code; it does not parse hex/hsl/rgb. Theme definition files (`generated.css`, `themes/registry.ts`, `base.css` theme blocks, `generate-theme-css.ts`, `lib/themes/{preview,contrast}.ts`) and the user-picked category palettes are out of its scope by design; `update-progress-window-html.ts` is excluded by name until #214.
- CEO-1/CEO-3 (restated): Remove "blank": a ready workspace theme cannot be blank (`OfflinePreferencesSchema.theme` is `min(1)`), so the desktop applies `system` only before the workspace is ready and for unknown values.
- CEO-1/CEO-3 (restated, final): unknown → `system`; `DEFAULT_THEME_ID = 'light'` is only the concrete Default light id used where an id is required before `system` resolves (SSR/pre-mount). The CEO-1 clause "fallback for unknown ids" is superseded.
- CEO-4 (final): exported read-only `LEGACY_THEME_ID_ALIASES` supersedes the earlier "private" wording.
- CEO-6 (restated, precedence): `useThemeAxis` reads `theme` through `normalizeThemePreference`; `system` (stored or normalized) makes `isSystem` true and `activeId = resolvedTheme`; otherwise `activeId` is the normalized id. Transitions as in the earlier restated CEO-6 table.
- CEO-9 (final): matchers are `oklch` hue 30–80 with chroma ≥ 0.1 and Tailwind `amber-` color classes only (no `orange-`/`yellow-`); the test file is `apps/web/src/lib/themes/no-hardcoded-amber.test.ts`.
- CEO-13: dropped (superseded; no contrast test added).
- CEO-14 (restated): Echo suppression: both directions compare normalized values; `applyNativePreferences` sets `applyingTheme` to the normalized native value before `setTheme`, so the resulting `themeChanged` is not marked dirty; a normalization-only difference (native `default-dark` vs web `dark`) is never pushed back, because the desktop normalizes on read. Tests: native `default-dark` → web `dark`, zero pushes; a real web change after that pushes once.
- CEO-5 (addition): Tests pinned to the old semantics are rewritten, not deleted: `apps/web/src/lib/themes/registry.test.ts:116-117` (default family) and `apps/web/src/lib/redux/persistedUserSettingsSurviveAppUpdate.test.ts` (stored `dark`).
- CEO-18: One-time audit during implementation: `rg` for warm hex/hsl/rgb literals in hand-authored UI code (outside theme definitions and category palettes); each hit is converted to a token or justified in the PR body.
- CEO-19: Electron windows that show web or editor content set `backgroundColor` from `nativeTheme.shouldUseDarkColors` (Default dark background vs `#ffffff`) instead of a fixed `#ffffff`, so a dark OS never flashes white before the first paint. Test: the window-options builder returns the dark color when `shouldUseDarkColors` is true.
- CEO-18: dropped (V1).
- CEO-19: dropped (V1).
- CEO-13 (restored by V8): Tests assert `--primary` on `--background` ≥ 4.5:1 for Default light, Default dark and Warm Cathedral light/dark using `apps/web/src/lib/themes/contrast.ts`; QA screenshots the editor with the Accent preset on Default light and dark.
- CEO-20: Applied-palette contract test: every chrome token of the Default pair (`--background`, `--foreground`, `--card`, `--card-foreground`, `--popover`, `--popover-foreground`, `--primary`, `--primary-foreground`, `--secondary`, `--muted`, `--muted-foreground`, `--accent`, `--border`, `--input`, `--ring`, `--sidebar*`) has OKLCH chroma ≤ 0.02 in `generated.css`, and the bare `:root` fallback block equals the Default light values.
- CEO-21: DESIGN.md theme section starts with the rule "The applied default is shadcn Default (neutral). Warm Cathedral is one selectable theme; never hard-code its amber outside its theme definition."; rule 8 says System currently follows the Default pair (next-themes resolves System to the default ids) and per-family System is a possible future change.
- CEO-22: Release sequencing: after merge and the Vercel deploy, run the Electron release the same day; the PR body states that the installed editor keeps Warm Cathedral for `light` until the app updates, and that an old Warm Cathedral pick resets to Default (one click to restore in Settings → Theme).
- CEO-9 (test title): the guard test is titled to state partial coverage ("flags hand-authored amber oklch literals and Tailwind amber classes; hex/hsl/rgb not parsed").

<!-- /autoplan-accepted:ceo -->

<!-- autoplan-accepted:design -->

- DES-1 (final contract; supersedes earlier restated CEO clauses where they differ):
  - (a) Stored value → applied theme, the same on web and desktop:
    - none → `system`
    - `system` → Default light/dark by OS
    - `light`/`dark` → Default light/dark
    - `default-light`/`default-dark` → `light`/`dark` (the web guard rewrites storage; desktop and sync normalize on read)
    - `cathedral-*` and colored ids → that theme
    - unknown → `system` (the web guard rewrites storage)
  - (b) Picker, as the user sees it:
    - Default card ringed → Mode toggles Light, Dark, System.
    - Any other card ringed → Light, Dark and the DES-3 helper line.
    - Transitions are exactly the CEO-6 (restated, expected ids) table. `useThemeAxis` reflects the normalized value immediately.
  - (c) First paint:
    - On the web, next-themes' blocking script sets `data-theme` before paint (`defaultTheme='system'`), so `:root:not([data-theme])` never applies with JS.
    - On the desktop, the editor has no attribute until mount, and the media block paints OS-matched Default.
    - Sync follows CEO-14 (restated): a normalization-only difference makes zero pushes.
  - (d) Clause status: CEO-18 OUT; CEO-19 OUT (the login window keeps `backgroundColor: '#ffffff'`; the pre-paint native white on a dark OS is pre-existing and out of #213); CEO-13 IN; `LEGACY_THEME_ID_ALIASES` exported.
- DES-2: The login ribbon (`apps/web/src/components/login-shell/LoginShell.tsx`, `HEATMAP_RIBBON_CELLS`) stops using `HEATMAP_LEVEL_TOKENS`/`--hm-*`.
  - Each level 0–4 fills with `color-mix(in oklch, var(--primary) P%, var(--muted))`, P = 10, 30, 50, 70, 90.
  - The values are defined once as a `LOGIN_RIBBON_LEVEL_FILLS` constant colocated with the login shell.
  - The JSDoc describes a theme-following ramp.
  - Result: Default shows a neutral ramp, Warm Cathedral cream → amber, and colored families their own accent.
  - Test: rendered ribbon cells reference `--primary`/`--muted` and none references `--hm-`.
  - QA: on Default light and dark every ribbon cell's computed fill has OKLCH chroma ≤ 0.02; on Warm Cathedral the ramp is warm.
- DES-3: `ThemeSelector` shows `To follow your device's light or dark setting, choose the Default palette.` (`type-small text-muted-foreground`) directly under the Mode toggle only while the active palette is not Default.
  - The Mode `ToggleGroup` gets `aria-describedby` pointing to it.
  - The sidebar menu shows no helper line (quick switcher).
  - Test: shown and described-by for Warm Cathedral and Harbor; absent for Default.
- DES-4: `ThemeSelectorMenuItem` renders both axes with `DropdownMenuRadioGroup` + `DropdownMenuRadioItem`, using the mode and the family as values. Items expose `menuitemradio` with `aria-checked`; the hand-rolled `bg-accent` + `Check` active styling is removed in favour of the radio indicator.
  - Test: the active mode and palette items have `role="menuitemradio"` and `aria-checked="true"`, and the others `"false"`.
- DES-5: QA pass criteria (headless only, report lists each with evidence):
  1. Rendered-element neutrality on Default light and dark: `eval` reads the computed `background-color`, `color`, `border-color` and `outline-color` of the login page background, headline, sign-in button and desktop-only notice, the Settings selected palette card ring and active mode toggle, and the editor surface. Each is OKLCH chroma ≤ 0.02 (heatmap, category and Today Ember excluded).
  2. Login states by screenshot on Default light, Default dark and Warm Cathedral:
     - desktop-only notice (plain tab)
     - signed-out front door (`run-code` init script stubbing the preload oauth bridge)
     - OAuth error line (stub rejects)
     - The signed-in recovery screen is listed as a headless limit.
  3. Legacy seed `localStorage['corelive-theme']='default-dark'`: computed `--background` is identical before and after the guard rewrite, and storage ends as `dark`.
  4. Settings fixture at viewport widths giving 1, 2 and 3 palette columns and a half-width zoom proxy: no clipped label, check or helper line, and no horizontal scroll.
  5. Keyboard: Tab → mode toggle, arrows change mode, Tab → palette, arrows/Space select; the focus ring is visible on Default light and dark.
  6. Motion: `set-reduced-motion reduce` makes the switch instant; normally the 200ms crossfade frames are present (video, ffmpeg frames).
  7. Editor screenshot with the Accent preset on Default light/dark.
- DES-6: The Accent preset keeps `var(--primary)`. On Default it reads close to the body text by design: stock shadcn primary is neutral, a fixed hue would hard-code a colour on Default, and the custom hex input stays the colour path. CEO-13's contrast test runs `--primary` against both `--background` and `--card` for Default light/dark and Warm Cathedral light/dark.
- DES-7: DESIGN.md sweep:
  - Line 16 (Direction): the concept is self-affirmation. Warmth lives in the heatmap's accumulated days. Default chrome is stock shadcn Default. Warm Cathedral is one selectable theme.
  - Line 24: the North Star owns every default; the default chrome is shadcn Default.
  - Line 35 Instances.
  - Line 139 section intro.
  - Rules 1, 2, 4 ("Warm Cathedral is not generated"; Default is emitted), 8 (per CEO-21) and 10 (unknown → System).
  - Family signatures row (role "opt-in warm palette").
  - Line 343 ("For Warm Cathedral").
  - Add the rule "The heatmap ramp is content colour (accumulated days) and stays warm on every theme, including Default; decorative surfaces use theme chrome tokens, never `--hm-*`".
  - Add a Decisions Log row dated 2026-11-02. Earlier rows stay as history.
  - Verify: every remaining `Warm Cathedral` hit in DESIGN.md names it as an option, its own palette, or history.
- DES-8: The same-day Electron release is a hard requirement of this ship. The PR body and the final owner report say: 「旧 Warm Cathedral の選択は Default になります。戻すには Settings → Appearance → Palette → Warm Cathedral」. Release is complete when the tag build, its 8 assets and `latest-mac.yml` are verified. The installed app is not touched on the host, so confirming the in-app update is the owner's step. No in-app notice (T4).
- DES-9: `ThemeSelector`'s hydration placeholder comment stops claiming a same-height block and states that it reserves approximate space.
- DES-10: CEO-20's token list adds `--secondary-foreground` and `--accent-foreground`.
- DES-11: CEO-16 extends to this phase. Every `Test:` clause in DES-2, DES-3, DES-4, DES-6 and DES-10 ships, and every DES-5 QA criterion appears in the QA report. None is optional.

<!-- /autoplan-accepted:design -->

<!-- autoplan-accepted:dx -->

- DX-1: Precedence and order.
  - Precedence, highest first: DX items, then DES items (DES-1 is the final contract except where a DX item changes it), then the latest "restated"/"final" CEO clause, then earlier clauses. Explicit overrides: DX-9 replaces DES-1(d)'s "login window keeps `#ffffff`" clause; DX-8's rule-8 wording replaces CEO-21's. Items marked dropped are not built: CEO-18; CEO-19, except DX-9's login-window part; CEO-13's first drop is superseded by its restoration.
  - Implementation order, each step ending green:
    1. registry + its tests (`pnpm --filter @corelive/web exec vitest run src/lib/themes`)
    2. generator, `base.css` split and `apps/desktop/renderer/index.html` (`pnpm theme:generate && pnpm theme:check` + generator/snapshot tests)
    3. the CEO-5 id-literal sweep (`pnpm typecheck`)
    4. web readers: ThemeProvider, guard, `useThemeAxis`, DES-3/DES-4 picker, CEO-14 sync (their focused tests)
    5. desktop: NativeEditor and DX-9 (`pnpm test:electron`)
    6. DES-2 ribbon, Accent preset, comments, DESIGN.md (DES-7/DX-8), guard and contract tests (`pnpm test`)
    7. `pnpm validate`, then DES-5 headless QA
- DX-2: Amber guard diagnostics, in `apps/web/src/lib/themes/no-hardcoded-amber.test.ts`.
  - Format: every hit prints `THEME_AMBER_LITERAL <repo-relative path>:<line> <literal or class>`. A fix line follows, chosen by property context:
    - text/color → `text-primary` / `var(--primary)` or `text-muted-foreground`
    - background → `bg-primary`, `bg-muted` or `bg-card`
    - border/ring → `border-border` / `ring-ring`
  - Then "Warm Cathedral amber belongs only in its `base.css` `:root[data-theme='cathedral-*']` blocks (DESIGN.md#theme-system)" and the focused rerun command `pnpm --filter @corelive/web exec vitest run src/lib/themes/no-hardcoded-amber.test.ts`.
  - The assertion message is that text, not an array diff.
  - Allowlist: a data array of `{ path, reason, issue? }` in the same test file (e.g. `update-progress-window-html.ts`, reason "#214 themes this window", issue 214).
  - Test: the scanner, defined in the test file, reports these fields for an in-memory `oklch(0.56 0.16 50)` fixture and a `text-amber-600` fixture.
- DX-3: Default chroma contract diagnostics (CEO-20/DES-10).
  - A failure names: theme id, selector, token, actual value, measured chroma, limit `0.02`, and file `packages/live-editor/src/styles/generated.css`.
  - Recovery line: "edit the Default StaticTheme tokens in `packages/live-editor/src/themes/registry.ts` (never generated.css), then `pnpm theme:generate && pnpm theme:check`".
  - An absent or unparsable token is reported as its own message.
  - Test: an in-memory block with `--primary: oklch(0.6 0.15 55)` yields that message; a missing token yields the absent message.
- DX-4: Bare-`:root` test diagnostics (CEO-7).
  - A failure names: `base.css:<line>`, the declaration and selector, and the permitted bare declarations (`color-scheme`, `--radius`, `--control-border`).
  - Both ownership paths: a Warm Cathedral value belongs in `:root[data-theme='cathedral-*']`; a Default value belongs in the registry seed + `pnpm theme:generate`. Plus the DESIGN.md anchor.
  - Test: an in-memory `:root { --primary: … }` fixture yields that message.
- DX-5: `theme:check` drift (`apps/web/scripts/generate-theme-css.ts`).
  - The error names the output file `packages/live-editor/src/styles/generated.css`, the first differing line number, and the expected and actual lines (bounded to one line each).
  - Recovery: "from the repository root run `pnpm theme:generate`, review that file's diff, rerun `pnpm theme:check` and `pnpm test`, then commit".
  - The check stays read-only and exits non-zero.
  - `GENERATED_HEADER` says preserved themes live in `packages/live-editor/src/styles/base.css`.
  - Test: the exported drift-describer returns the line number and excerpts for two strings that differ on line 3.
- DX-6: Generator validation, before any write in both modes.
  - (a) Every `StaticTheme` token value and every derived value parses as a colour (culori) where the token is a colour. Otherwise it throws `THEME_INVALID_COLOR theme=<id> token=<token> value=<value> source=packages/live-editor/src/themes/registry.ts`.
  - (b) Every `LEGACY_THEME_ID_ALIASES` target is a registry id whose seed is emitted (not `preserve`). Otherwise it throws `THEME_ALIAS_TARGET alias=<alias> target=<target>`.
  - (c) `ladderColor` errors include theme id, mode and token.
  - Unexpected errors keep `cause`. The CLI exits non-zero and writes nothing.
  - Tests: `generateThemesCss` throws `THEME_INVALID_COLOR` for a static seed with `--primary: 'not-a-color'`, and `THEME_ALIAS_TARGET` for an alias pointing at `cathedral-light` or a missing id.
- DX-7: Migration docs and API JSDoc.
  - The `/ship` CHANGELOG entry and DESIGN.md's theme section carry the mapping:
    - `light`/`dark` = shadcn Default (was Warm Cathedral)
    - `cathedral-light`/`cathedral-dark` = Warm Cathedral (new)
    - `default-light`/`default-dark` = legacy aliases → `light`/`dark` (not `ThemeId`s)
    - unknown → System
  - Registry JSDoc carries `@example`s for `getThemeId('default','dark') // 'dark'`, `getThemeId('cathedral','dark') // 'cathedral-dark'`, `normalizeThemePreference('default-dark') // 'dark'` and `isThemeId('default-dark') // false`.
  - `DEFAULT_THEME_ID` and `DEFAULT_THEME_PREFERENCE` JSDoc cross-reference each other (`@see`) and say which one to use where.
  - The PR body carries an English line beside DES-8's Japanese note: "An old Warm Cathedral pick now shows Default; restore it in Settings → Appearance → Palette → Warm Cathedral."
- DX-8: DESIGN.md contributor recipe ("Theme-safe UI in three steps"), in the Theme System section:
  1. Use semantic token classes (`bg-background text-foreground`, `bg-primary text-primary-foreground`, `text-muted-foreground`, `border-border`), never a hue literal.
  2. View it on Default and Warm Cathedral (Settings fixture `apps/web/scripts/qa-settings` or `pnpm dev` → Settings → Appearance → Palette).
  3. Run `pnpm test`; only when the registry changed, also `pnpm theme:generate && pnpm theme:check`.
  - Expected result: neutral on Default light and dark.
  - The section states the guard's partial coverage (oklch + Tailwind `amber-` only).
  - Rule 8 reads "System follows the Default pair; other families are explicit Light/Dark (next-themes resolves System to the Default ids)", with no future-change clause.
- DX-9 (taste T7; narrow reopen of CEO-19 under the CLAUDE.md discovered-TODO rule):
  - The login window's pre-paint `backgroundColor` in `apps/desktop/electron/WindowManager.ts` is `#0a0a0a` (Default dark background, `oklch(0.145 0 0)`) when `nativeTheme.shouldUseDarkColors` is true, otherwise `#ffffff`.
  - Both values are named constants in the desktop constants module.
  - Editor and Settings windows stay transparent (unchanged).
  - Test: the login window is created with `#0a0a0a` under a dark `nativeTheme` mock and `#ffffff` under a light one.
  - QA limit: native pre-paint is not visible headless; the unit test is the evidence.
- DX-10: `ThemeAllowlistGuard` calls `log.debug` (`apps/web/src/lib/logger.ts`; the debug level is development-only) with the raw stored value and the healed value whenever it rewrites storage (legacy alias or unknown).
  - Test: healing `cathedral-lite` logs both `cathedral-lite` and `system`.
- DX-11: Motion evidence.
  - DES-5.6 extracts every recorded frame (`ffmpeg -i <video> -fps_mode passthrough <dir>/frame_%04d.png`).
  - Normal motion must show at least one intermediate frame between the endpoints; reduced motion must show none.
  - `docs/headless-development.md:92-93` changes its example from `fps=2` to the same full-frame extraction, with a note that `fps=2` misses transitions under 500 ms.
- DX-12: The QA report records one timed dry run of the 0C clock: plant `text-amber-600` in a scratch component, run the focused guard command, follow its message to green, then revert. It records the elapsed time (target ≤ 5 min) and whether the message alone was enough.
- DX-13: CEO-16/DES-11 extend to this phase. Every `Test:` clause in DX-2..DX-6, DX-9 and DX-10 ships; DX-11 and DX-12 appear in the QA report. None is optional.

<!-- /autoplan-accepted:dx -->

<!-- autoplan-accepted:eng -->

- ENG-1: Build list. Implement exactly these items, in DX-1 order:
  - Decisions 1–6.
  - CEO-1..CEO-17 at their latest restated/final wording, plus CEO-20..CEO-22 and X1/CEO-9 (final).
  - DES-1..DES-11 and DX-1..DX-13.
  - ENG-2..ENG-11, which win over earlier wording where they differ (precedence ENG > DX > DES > CEO).
  - Not built: CEO-18, CEO-19 (except the DX-9 login window), the first CEO-13 drop.
- ENG-2: Generator layout that honours the dslint parser contract (`packages/eslint-plugin-dslint/src/cli/css-parser.ts:92-98`).
  - Default is emitted as separate blocks, never selector lists: `:root {…}`, `:root[data-theme='light'] {…}`, `:root[data-theme='default-light'] {…}`, `:root[data-theme='dark'] {…}`, `:root[data-theme='default-dark'] {…}`, and `@media (prefers-color-scheme: dark) { :root:not([data-theme]) {…} }`.
  - Every dark block declares `color-scheme: dark`.
  - This supersedes the selector-list wording in Decision 3, CEO-2, CEO-7 and E0-3.
  - `css-parser.ts` skips declarations inside `@media` blocks (brace-matched).
  - Tests:
    - The generator output contains exactly those six Default blocks, each with the expected `color-scheme`.
    - A dslint integration test parses the real `generated.css` + `base.css` and asserts the `light`-tagged tokens equal the Default light seed, and that no Default-dark value is tagged `light` or `base`.
- ENG-3: Echo suppression in `OfflinePreferenceSync.themeChanged`.
  - The `applyingTheme` marker expires on the first observation after an apply. An equal observation is the echo and is not dirty. A different observation clears the marker and is treated as a user change.
  - Comparisons use normalized values.
  - Test: native `dark` is applied; the web observes `harbor-light` (a user pick) before the echo, then the user picks `dark`. `dark` is pushed.
- ENG-4: In `useThemeAxis`, when the raw stored value is not `system` but normalizes to `system` (unknown), `activeId` uses next-themes `systemTheme` (the OS mode), not `resolvedTheme`. Unmounted behaviour is unchanged.
  - Test: raw `cathedral-lite` on a dark OS → `isSystem` true and `activeId` `dark`, before the guard repairs storage.
- ENG-5: CEO-20 amendment.
  - The chroma ≤ 0.02 contract exempts Default dark `--sidebar-primary` (stock shadcn `oklch(0.488 0.243 264.376)`, blue hue 264). It is kept verbatim per the owner's "stock shadcn Default", and the test lists the exemption with that reason.
  - Plus a no-warm assertion: no Default token outside `--hm-*`/`--chart-*` has hue 30–80 with chroma ≥ 0.1.
  - Tests: both assertions green on the branch; a planted warm `--accent` fails the no-warm assertion.
- ENG-6: The reduced-motion criterion (DES-5.6/DX-11) is refined.
  - Under reduced motion, the global crossfade on page/editor background and surfaces (`theme-transition`) shows no intermediate frames.
  - Component-level colour transitions (`packages/live-editor/src/ui/button.tsx` `transition-all`) are colour-only, pre-existing, and outside this assertion. The QA report states this.
- ENG-7 (taste T9): The deploy-skew window is an accepted degradation per CLAUDE.md "Production Status" (no compat shims). The PR body and owner report state:
  - (a) Until the app updates, the installed editor shows its old default for `cathedral-*` and Warm Cathedral for `light`. Download is manual (`apps/desktop/electron/AutoUpdater.ts:148`).
  - (b) An already-open old web window may rewrite a new `cathedral-*` pick to `light`. Recovery: reopen the Settings and login windows after the deploy, and re-pick Warm Cathedral.
  - (c) If the release run fails, rerun the failed `build-and-release.yml` job; the web stays deployed.
  - (d) Rollback: revert and redeploy; stored `cathedral-*` values then heal to the old `light` (= Warm Cathedral).
- ENG-8 (taste T8): The brief Default paint before the workspace is ready, for non-Default themes, is accepted (local workspace read). DES-5 adds a desktop-fixture recording with stored `cathedral-light`, and the report counts the Default frames before the stored theme applies.
- ENG-9: Additional tests.
  - (a) `prepare` seeds `system` when the web theme is `system` (offline-settings-sync test).
  - (b) The existing native-vs-web apply rule is preserved: native `system` with web `light`/`dark`, and the reverse, where the native value applies when the web is not dirty.
  - (c) A ship-time check: `git diff origin/main -- packages/live-editor/src/styles/generated.css` changes only the Default, alias and media blocks. Recorded in the QA report.
  - (d) The `color-scheme` assertions in ENG-2.
  - (e) A web theme test asserts that Default dark `--background` from the registry formats to `#0a0a0a` (culori). Its failure message names `apps/desktop/electron/constants.ts`.
- ENG-10: DX-1 amendment. Steps 1–3 land as one unit; `pnpm typecheck` goes green at the end of step 3, not after each step.
- ENG-11: CEO-16/DES-11/DX-13 extend to this phase. Every `Test:`/`Tests:` clause in ENG-2..ENG-5 and ENG-9 ships; ENG-8 and ENG-9c appear in the QA report. None is optional.

<!-- /autoplan-accepted:eng -->

## Review record

### CEO Step 0 (autoplan, SELECTIVE EXPANSION)

**Pre-review audit.** Base `main` @ 4302821e. Stash `stash@{0}: On main: wip flex` (owner's, untouched). No TODOS.md (project rule: never recreate). Local `main` carries the owner's unpushed `3cd1f47a` (mise.toml removal); this branch starts from `origin/main` and does not include it. Recently hot files: `apps/desktop/package.json`, `CHANGELOG.md`, `SharedEditorSurface.tsx` (keep-struck work, merged). Retrospective: the theme system (v0.9.0, PR for 14 themes) made Warm Cathedral the applied default; memory `feedback-default-theme-is-shadcn-not-amber` records repeated owner corrections, so this is a recurring problem with an architectural cause (cathedral owns the flat ids), not a one-off copy slip. Taste references: `registry.ts` (single source, generated CSS), `ThemeAllowlistGuard.tsx` (self-healing storage) are good patterns to extend; the `getThemeId` cathedral special case and `useThemeAxis` `family === 'cathedral'` branches are the patterns to remove.

**0A Premise challenge.** Real problem: with nothing stored, every surface (web first paint, the Electron login window, a new Settings window session, the desktop editor before its workspace loads) paints Warm Cathedral amber, and the docs/comments keep telling future work that amber is the brand. Target outcome: shadcn Default is what nobody-chose-anything looks like, System follows the Default pair, Warm Cathedral is one explicit option. Do-nothing cost: the owner keeps seeing amber on the default path (stated anger, repeated corrections), and every new screen, QA screenshot and agent decision drifts back to amber. The plan addresses the cause (id ownership + CSS fallback + docs), not a proxy.

| Premise | Claim                                                                                                   | Receipt                                                                                                                                                                | Verdict                                          |
| ------- | ------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------ |
| P1      | next-themes System resolves to the literal names `light`/`dark`                                         | `node_modules/next-themes/dist/index.mjs` (`resolvedTheme: c==="system"?T:c`, `matches?"dark":"light"`)                                                                | verified                                         |
| P2      | Default id is Warm Cathedral `light`                                                                    | `packages/live-editor/src/themes/registry.ts:476`                                                                                                                      | verified                                         |
| P3      | System is offered only for cathedral                                                                    | `apps/web/src/hooks/useThemeAxis.ts:82-83`                                                                                                                             | verified                                         |
| P4      | CSS fallback palette is cathedral                                                                       | `packages/live-editor/src/styles/base.css:61`, `:107`                                                                                                                  | verified                                         |
| P5      | Login window amber is the default theme, not hard-coded color                                           | `apps/web/src/components/login-shell/LoginShell.tsx` (token classes only; no amber/oklch literal)                                                                      | verified                                         |
| P6      | Desktop theme is the workspace `preferences.theme` string, written by the web Settings sync             | `apps/web/src/components/electron/OfflineSettingsSync.tsx:91`, `apps/desktop/electron/offline/WorkspaceService.ts:951`, `apps/desktop/renderer/NativeEditor.tsx:44-54` | verified                                         |
| P7      | Issue acceptance wants an OS-following fresh state ("`default-light` (or `default-dark` in dark mode)") | issue #213 acceptance criteria, first bullet                                                                                                                           | verified — **missing from the plan** (see CEO-1) |
| P8      | Old stored `light`/`dark` reading as Default is acceptable                                              | `CLAUDE.md` "Production Status — pre-release, single user"; owner states they use Default                                                                              | verified (accepted risk, recorded)               |

unverified=0

**0B Existing code leverage.** Theme ids and seeds → `registry.ts` (reuse, single source). CSS → `apps/web/scripts/generate-theme-css.ts` + `generated.css` (extend selector emission, no new generator). Stored-id healing → `ThemeAllowlistGuard.tsx` (reuse for the legacy alias; no second guard). System → next-themes `enableSystem` (reuse; no custom resolver). Desktop → `NativeEditor.useEditorTheme` (reuse its `system` branch). Picker → `useThemeAxis` (edit branches only). Nothing is rebuilt.

REALITY: premise-table pass 8 premises, unverified=0 apps/web/src/hooks/useThemeAxis.ts:82
REALITY: already-done pass no origin/main commit since 2026-11-01 changes the default theme (4302821e only touched base.css transitions) packages/live-editor/src/styles/base.css:194
REALITY: surface-check pass pnpm dev/theme:check/theme:generate/test:electron/qa:offline-editor/qa:browser/validate all exist package.json:64
REALITY: binding-decisions pass gstack-decision-search --scope branch returned none; CLAUDE.md pre-release policy honored CLAUDE.md:52
REALITY: numbers pass plan cites only file:line receipts and no metrics [measured: grep] packages/live-editor/src/themes/registry.ts:476
REALITY: deferred-asks pass issue #213 asks left out: none; update-download window is #214 by the issue's own "Related" line docs/designs/default-theme-shadcn.md:36
REALITY: pr-count pass no .gstack/ship-policy.json, default one PR for this wave docs/designs/default-theme-shadcn.md:1

**0C Dream state.**

```
  CURRENT STATE                         THIS PLAN                                   12-MONTH IDEAL
  cathedral owns light/dark;     --->   Default owns light/dark + System;    --->   desktop-owned offline editor (#216)
  amber fallback paints first;          :root fallback is Default;                 with a themed update window (#214),
  System = amber pair;                  cathedral is an explicit option;           Default as the neutral baseline and
  docs call amber the brand             docs/comments use token words;             every theme a skin; no surface can
                                        guard test blocks amber literals           assume a hue
```

Moves directly toward the ideal; #214 and #216 build on the Default-owned ids.

**0D Approach.** A) swap ids (plan) — reuses next-themes System, removes the cathedral special case, one CSS fallback change. B) keep ids, write a custom System resolver plus its own pre-hydration script for web and desktop — more code, a second flash-prevention script to maintain. C) next-themes `value` map — maps every use of the name `light`, so explicit Warm Cathedral would also become Default; not viable. Auto-decided A (P1 completeness, P5 explicit); not close, mechanical.

**0E Mode.** SELECTIVE EXPANSION (autoplan override). Mode: SELECTIVE EXPANSION; approved decisions: none. Hold the issue's scope, harden it, and cherry-pick only in-radius additions. No new approach decision was needed beyond 0D.

**0F/0G.** HOLD checks: (1) ~20 files, but most are tests, comments and one doc; the moving parts are 1 registry constant set, 1 generator rule, 1 CSS block move, 2 branch edits, 1 alias map — no new services. (2) A smaller change (only `DEFAULT_THEME_ID = 'default-light'`) leaves System on amber and the amber `:root` first paint, failing two acceptance criteria — not sufficient. (3) Invariants kept: colored-family ids and stored picks unchanged; Warm Cathedral palette byte-identical.

Gap against the issue (required, not an expansion): **CEO-1** fresh state must follow the OS with the Default pair — web `defaultTheme='system'`; desktop treats a missing/blank workspace theme as `system`. Auto-decided include (issue acceptance, P1).

Delight / cherry-pick candidates:

| #   | Proposal                                                                                                                                                                                                                                                                | Effort | Risk   | Decision         | Reason                                                                                                                                                                                                                               |
| --- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------ | ------ | ---------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| X1  | Guard test: no amber hue literal (oklch hue 30–80, chroma ≥ 0.1, or `amber`-named Tailwind color) in theme-bearing source outside the Warm Cathedral definitions (`base.css` cathedral blocks, registry cathedral seed, heatmap/category palettes that are user-picked) | S      | low    | ACCEPTED         | It is the issue's own acceptance criterion and the owner has corrected this repeatedly; a test makes it stick. The update-download window is excluded by name with a pointer to #214, the next pipeline, which removes the exclusion |
| X2  | Picker marks Default as "Default (recommended)"                                                                                                                                                                                                                         | S      | low    | SKIPPED          | The family is already named Default and listed first; extra copy adds noise                                                                                                                                                          |
| X3  | Settings "Reset theme" button                                                                                                                                                                                                                                           | S      | low    | SKIPPED          | Not requested; System/Default is one click today                                                                                                                                                                                     |
| X4  | Migrate old stored `light`/`dark` to `cathedral-*` with a version marker                                                                                                                                                                                                | M      | medium | SKIPPED          | Pre-release single user who uses Default; needs a pre-hydration script and two-store coordination (P8)                                                                                                                               |
| X5  | Theme the update-download window now                                                                                                                                                                                                                                    | M      | low    | DEFERRED to #214 | Separate issue and pipeline by owner instruction                                                                                                                                                                                     |

**0H cap decision.** `spec not re-verified`: 14 launch-3 fixes are applied without a fourth reviewer launch (cap = 3); the CEO dual voices and the Eng phase review the amended plan next. Auto-decided (P6 bias toward action).

**0H document approval.** Auto-decided A) approve these documents and continue to 0I (both reflect the exact decisions; unresolved items are the gate taste decisions T1/T2).

**0I Temporal interrogation.**

- Hour 1: ids are strings in four stores (next-themes localStorage `corelive-theme`, workspace `preferences.theme`, ConfigManager `appearance` (none for theme), tests). Know which read paths heal (guard, NativeEditor) — CC ~10 min / human ~1 h.
- Hour 2–3: generator selector emission and the `:root` fallback ordering vs `base.css` specificity (`:root` 0,1,0 vs `:root[data-theme=…]` 0,2,0); cathedral snapshot test must keep byte-identical values — CC ~20 min / human ~3 h.
- Hour 4–5: Settings sync: web stores `light` while an old desktop workspace may still say `default-light` — the desktop alias read covers it; a later Settings change overwrites it — CC ~10 min / human ~2 h.
- Hour 6+: QA in headless web + desktop fixture with OS dark emulation, crossfade video — CC ~20 min / human ~3 h.

**0H Spec review, launch 1** (score 5/10, FAIL; completeness 4, consistency 5, clarity 6, scope 6, feasibility 5). Dispositions (auto-decided to the recommended remedy, P1/P5):
1.1 legacy `default-dark` pre-hydration flash → CEO-2 (keep `default-*` CSS selectors). 1.2 desktop "missing/blank" path → corrected: the seed is `OfflinePreferenceSync.prepare` (`apps/web/src/lib/offline-settings-sync.ts:414`) from the web's next-themes value, so `defaultTheme='system'` seeds `system`; the schema stays `min(1)`; an existing stored `light` reads as Default light (CEO-3 table). 1.3 pre-ready fallback → CEO-3. 1.4 alias API → CEO-4. 1.5 literal sweep → CEO-5. 1.6 generator/base.css split → CEO-7. 1.7 Default heatmap → CEO-8 (taste, surfaced at the gate). 2.1/2.2 fresh vs unknown semantics → baseline edits on Decisions 1/4 and the guard test, plus CEO-3 table. 2.3 → CEO-3 tests. 2.4 Decisions 5/6 citation → issue #213 acceptance "amber wording becomes token wording" and its Current-state bullet naming `ElectronOAuthButtons.tsx:63,73` and `DayDetailDialog.tsx:178`; recorded in the CEO summary. 3.1/4.1 guard scope → CEO-9 replaces X1's wording. 3.2 alias placement → CEO-4 (`packages/live-editor/src/themes`, web re-exports through `apps/web/src/lib/themes/registry.ts` `export *`). 3.3 structure → baseline edits fold CEO-1 into Decisions; accepted items stay appended by the tool. 4.2 comment edits → in scope by the same acceptance line. 5.1 type/call-site sizing → CEO-5. 5.2 → CEO-2 QA. 5.3 picker transitions → CEO-6. 5.4 data-loss acknowledgement → CEO-3 table states old cathedral `light`/`dark` read as Default (accepted, P8). 5.5 crossfade tool → CEO-10.

**0H Spec review, launch 2** (score 5/10, FAIL; reviewer also read issue #213 and its two comments). Dispositions (auto-decided, P1/P5; one premise correction surfaced at the gate):
1.1 "explicit picks keep their theme" → premise correction CEO-11: a stored `light`/`dark` is not evidence of an explicit Warm Cathedral pick, because `OfflinePreferenceSync.prepare` seeds the workspace from the web's next-themes value (old default `light`, `apps/web/src/lib/offline-settings-sync.ts:414`) and `applyNativePreferences` writes it back to web storage with `setTheme` (`:575`). Migrating `light` → `cathedral-light` would keep the owner (who never picked) on amber, defeating the issue's primary ask. Explicit picks that are distinguishable are kept (Default via the alias, every colored family id unchanged); an old Warm Cathedral pick resets to Default and is one click to restore. Surfaced at the final gate as taste T2.
1.2 login window follows the explicit choice → verified: no BrowserWindow sets `partition` (`apps/desktop/electron/WindowManager.ts`, no match), so the login window and the Settings window share the default session's `corelive.app` localStorage `corelive-theme`; the desktop editor's workspace theme is synced from that same Settings page. CEO-12 adds the QA row. 1.3 Warm Cathedral login screenshot → CEO-12. 1.4 Accent preset legibility → CEO-13. 1.5 sync echo → CEO-14. 1.6 sweep list → CEO-5 restated as the `rg`-derived list below. 1.7 `ThemeId` type → CEO-15. 1.8 guard coverage → CEO-9 restated with stated limits and `orange-`/`yellow-` classes.
2.1 allowlist vs the "no warm hue outside Warm Cathedral" bullet → interpretation recorded: the bullet governs hand-authored UI code; per-theme token definitions (`generated.css`, registry seeds, `base.css` theme blocks) are theme definitions; the Default warm heatmap ramp is the one owner-taste exception (CEO-8, gate taste T1). 2.2 CEO summary rows → CEO-2..7, 9, 10, 12–16 reclassified as implementation details of Decisions 1–4 and X1; scope rows stay CEO-1, X1, CEO-8. 2.3 "blank" desktop theme → dropped; only pre-ready and unknown values occur (schema `min(1)`). 2.4 one test list → CEO-16. 2.5 `DEFAULT_THEME_ID` role → CEO-3 plus comment updates in CEO-15.
3.1 snapshot mechanics → CEO-7 restated. 3.2 transitions → CEO-6 restated as a table. 3.3 legacy id read in `useThemeAxis` → CEO-4 restated. 3.4 legacy selector source → CEO-4/CEO-7 (exported alias map feeds the generator).
4.1–4.3 API/obligation padding → reclassified (2.2). 4.3 `ElectronOAuthButtons.tsx:204` and registry comments → same "amber wording becomes token wording" bullet.
5.1 → CEO-11. 5.2 CSS order trap → CEO-7 test "bare `:root` in base.css has no color token". 5.3 emulation command → `pnpm qa:browser set-color-scheme dark` (exists in `scripts/qa-browser.mjs` allowed commands). 5.4 heatmap ramp → verified: Default light uses the light ramp (`generated.css:39-40`), Default dark the dark ramp (`:79-80`). 5.5 unknown → `system` → stated in CEO-3.
Sweep list (CEO-5, from `rg` over apps/packages/scripts): `apps/desktop/electron/ConfigManager.ts` (comment), `apps/desktop/renderer/index.html` (`data-theme="light"`), `apps/desktop/renderer/NativeEditor.tsx`, `apps/desktop/scripts/benchmark-offline-workspace.ts`, `apps/desktop/electron/offline/{OfflineEditorController,OfflineEditorIPC,WorkspaceService,WorkspaceWorkerClient}.test.ts`, `apps/web/scripts/generate-theme-css.ts`, `apps/web/scripts/qa-settings/main.tsx`, `apps/desktop/scripts/qa-offline-editor.ts`, `apps/web/src/components/{ThemeSelector,ThemeSelectorMenuItem}.tsx`, `apps/web/src/hooks/useThemeAxis{,.test}.ts(x)`, `apps/web/src/lib/redux/persistedUserSettingsSurviveAppUpdate.test.ts`, `apps/web/src/lib/themes/{cathedral-css-snapshot,control-border-contrast,generate-theme-css,preview,registry}.test.ts`, `apps/web/src/lib/themes/preview.ts`, `apps/web/src/providers/{ThemeAllowlistGuard.tsx,ThemeProvider.tsx,ThemeProvider.guard.test.tsx,ThemeProvider.test.ts}`, `packages/eslint-plugin-dslint/src/cli/css-parser.ts` and its test, `packages/live-editor/src/styles/{base,generated}.css`, `packages/live-editor/src/themes/registry.ts`, plus `ui/chart.tsx`, `ui/sonner.tsx`, skill-tree and `animations.css` selectors named by the reviewer (to be confirmed by the same `rg` during implementation).

**0H Spec review, launch 3** (score 6/10, FAIL; three-launch cap reached — no further reviewer launch). Dispositions:
C1 login window vs editor workspace → answered by trace, no bridge: the only theme picker is the Settings page on `corelive.app` in the default session; the editor's workspace theme is written from that same page (`OfflineSettingsSync.tsx:91`, `offline-settings-sync.ts:414`), and the login window reads the same default-session localStorage (no `partition` in `WindowManager.ts`). An explicit choice therefore always lands where the login window reads it (CEO-12 records it; packaged-window proof is out of headless reach and is stated as a QA limit). C2/F1 CEO-11 premise → corrected to desktop + Electron Settings window; in a plain browser a stored `light` is most likely a deliberate Warm Cathedral pick, and resetting it to Default is a knowingly accepted loss for the single pre-release user (gate T2). C3 guard limits → CEO-18 (one-time `rg` audit for hex/hsl/rgb warm values) and CEO-19 (window `backgroundColor` follows the OS). C4 → CEO-5 names `registry.test.ts:116-117` and `persistedUserSettingsSurviveAppUpdate.test.ts`. C5 → CEO-9 file `apps/web/src/lib/themes/no-hardcoded-amber.test.ts`.
K1 unknown fallback → CEO-1/CEO-3 restated again: unknown → `system`; `DEFAULT_THEME_ID` is only the concrete id behind `system` before mount. K2 stale text → Decision 3 and the generator test line rewritten in place by baseline edits. K3 CEO-4 → the restated exported `LEGACY_THEME_ID_ALIASES` is final. K4 `useThemeAxis` precedence → CEO-6 restated. K5 first paint → web relies on CEO-2 (next-themes sets `data-theme` before paint), desktop on CEO-17 (no attribute until React mounts).
L1 bare-`:root` amber → covered by CEO-7's "no color token in bare `:root`" test. L2/S1 CEO-13 → dropped (the preset color is unchanged; only the label changes). L3 snapshot mechanism → regex on the two cathedral selectors. L4 pre-ready path → `NativeEditor.tsx:77-81` passes `DEFAULT_THEME_PREFERENCE`.
S2 CEO-10 → kept as a regression check for DESIGN.md "Theme toggle: crossfade, no flash" because the theme selectors move. S3 → CEO-8/CEO-11 labelled auto-decided taste, surfaced at the gate. S4 → `orange-`/`yellow-` matchers dropped. S5 → "none" wording.
F2 CEO-17 ordering → refuted: `:root:not([data-theme])` is (0,2,0) and beats bare `:root` (0,1,0) in any order, and it never matches together with a `[data-theme]` block; desktop-only by construction. F3 CEO-14 echo → CEO-14 restated. F4 → stated QA limit.
Cap outcome: 14 fixes applied after launch 3 and **not re-verified by a reviewer** (`spec not re-verified`, decision recorded below).

### CEO dual voices (snapshot `288f4eae…`, after the spec loop)

**Native (Claude subagent, in-host):** right problem, id swap sound, plan oversized. High: 2.1 verify the "cannot tell apart" seed claim and surface the owner-visible reset; 3.1 cross-version skew — an installed older desktop build reads `light` as Warm Cathedral. Medium: 1.1 promote the guard and add a durable rule; 1.2 scope creep, cut or time-box CEO-18; 2.2 record the next-themes `value` map alternative; 3.2 guard rewrite of unknown ids is destructive under deploy skew; 3.3 name the guard as partial.

**Codex (gpt-6-astra, outside, completed):** High 1: the plan drifts from "apply Default" to "hunt warm literals"; the guard cannot guarantee Default stays neutral because theme definitions are out of its scope — make the applied-palette contract the guarantee. High 2: CEO-19 is too broad — the editor and Settings windows are intentionally transparent with vibrancy (`WindowManager.ts:734-735`), only the login window is `#ffffff` (`:403`), and an OS-only color can contradict an explicit theme. Medium 3: "System only for Default" is a library constraint, not a product rule. Medium 4: verification over-weights internal structure; restore a readability check for `var(--primary)` as editor text.

```
CEO DUAL VOICES — CONSENSUS TABLE:
  Dimension                            Claude              Codex                Consensus
  1. Premises valid?                    yes, 2 caveats      yes, 1 caveat        CONFIRMED (caveats recorded)
  2. Right problem to solve?            yes                 yes                  CONFIRMED
  3. Scope calibration correct?         no — oversized      no — oversized       CONFIRMED: cut CEO-18, CEO-19
  4. Alternatives sufficiently explored?no — value map      no — {family,mode}   CONFIRMED: record both
  5. Competitive/market risks covered?  negligible          not raised           CONFIRMED (low)
  6. 6-month trajectory sound?          skew + guard rewrite System-as-spec, QA  DISAGREE in kind → both recorded
```

Decisions from the voices (auto-decided; principle in brackets):

- V1 [P3, both voices] Cut CEO-18 (open-ended audit) and CEO-19 (window background); the login-window white flash on a dark OS is pre-existing and outside #213.
- V2 [P1, Codex 1] Add CEO-20, the applied-palette contract: a test that every chrome token of the Default pair (`--background`, `--foreground`, `--card`, `--popover`, `--primary`, `--secondary`, `--muted`, `--accent`, `--border`, `--input`, `--ring`, sidebar equivalents) has OKLCH chroma ≤ 0.02 in the generated CSS, and that the bare `:root` fallback resolves to the Default light values. This is the guarantee that "Default is not warm".
- V3 [taste T3] Keep the X1/CEO-9 guard as a narrow, explicitly partial check (it is the issue's own acceptance line); Codex would demote it, Claude would promote it. Its test title states the partial coverage (native 3.3).
- V4 [P5, native 1.1] DESIGN.md gains a one-line rule at the top of the theme section: "The applied default is shadcn Default (neutral). Warm Cathedral is one selectable theme; never hard-code its amber outside its theme definition."
- V5 [P5, native 2.2 + Codex 3] Record alternatives: next-themes `value` map (maps every use of the name `light`, so explicit Warm Cathedral would also become Default unless Warm Cathedral is renamed anyway — no saving); `{ family, mode }` storage with System per family (larger contract change across web storage, sync wire and desktop; out of scope, noted as a future direction). DESIGN.md rule 8 wording says System currently follows the Default pair, not that it never can.
- V6 [P1, native 3.1] Cross-version skew is handled by sequencing, not code: merge → Vercel deploy → Electron release the same day (the bundled editor renderer ships only with an Electron release; the login and Settings windows are web and update on deploy). Until the owner's app updates, the old editor bundle paints Warm Cathedral for `light` — stated in the PR body and the release notes.
- V7 [P5, native 3.2] Keep healing unknown stored values to `system` (existing guard behavior; the realistic writer of an unknown id is a stale tab, single user); not changed to alias-only.
- V8 [P1, Codex 4] Restore a readability check (supersedes the CEO-13 drop): the generated Default light/dark and Warm Cathedral `--primary` on `--background` meet 4.5:1, and QA screenshots the editor with the Accent preset on Default light and dark.
- V9 [native 2.1] Seed claim verified: no persisted explicit-pick flag exists (`apps/web/src/lib/offline-settings-sync.ts`: `dirtyTheme` is transient), so CEO-11 stands; the owner-visible reset is stated in the PR body and at the gate (T2).

Baseline edit (CEO-1 supersedes the old "no stored theme → light" desktop assertion):

<!-- autoplan-baseline-edits:ceo {"sourceSha256":"a71491931844239f2ccaf011d6c5de74187cf448b84f62605459c0484f0f988d","replacements":[{"oldText":"- `NativeEditor` theme test: no stored theme → `data-theme=\"light\"` (Default); `default-dark` → `dark`; `system` + dark OS → `dark`.","newText":"- `NativeEditor` theme test: no stored theme follows the OS (`data-theme=\"light\"` with a light OS, `\"dark\"` with a dark OS; CEO-1); `default-dark` → `dark`; `system` + dark OS → `dark`."},{"oldText":"`DEFAULT_THEME_ID` stays `'light'`, which now means shadcn Default.","newText":"`DEFAULT_THEME_ID` stays `'light'`, which now means shadcn Default light; it is the concrete fallback id. The stored-preference default is `system` (`DEFAULT_THEME_PREFERENCE`, CEO-1/CEO-3)."},{"oldText":"4. **Legacy stored ids.** Only `default-light`/`default-dark` need an alias (`LEGACY_THEME_ID_ALIASES` in the registry → `light`/`dark`), applied where a stored id is read: `ThemeAllowlistGuard` (rewrites storage) and `NativeEditor`.","newText":"4. **Legacy stored ids.** Only `default-light`/`default-dark` need an alias (`normalizeThemePreference` in the registry, CEO-4), applied where a stored id is read: `ThemeAllowlistGuard` (rewrites storage) and `NativeEditor`; the generator also keeps `default-*` CSS selectors so the pre-hydration paint is already Default (CEO-2)."},{"oldText":"- `ThemeAllowlistGuard` test: stored `default-dark` rewrites to `dark`; unknown id heals to `light`.","newText":"- `ThemeAllowlistGuard` test: stored `default-dark` rewrites to `dark`; unknown id heals to `system` (CEO-3)."},{"oldText":"(emitted by the generator as `:root, :root[data-theme='light']`), Default dark is `:root[data-theme='dark']`.","newText":"(emitted by the generator as `:root, :root[data-theme='light'], :root[data-theme='default-light']`), Default dark is `:root[data-theme='dark'], :root[data-theme='default-dark']`, plus the desktop-only first-paint block `@media (prefers-color-scheme: dark) { :root:not([data-theme]) { … } }` (CEO-2/CEO-7/CEO-17)."},{"oldText":"Default emitted as `:root, :root[data-theme='light']` and `:root[data-theme='dark']`.","newText":"Default emitted as `:root, :root[data-theme='light'], :root[data-theme='default-light']` and `:root[data-theme='dark'], :root[data-theme='default-dark']`, and the `:root:not([data-theme])` dark media block (CEO-2/CEO-7/CEO-17)."}]} -->

<!-- autoplan-accepted:ceo -->

- CEO-1: With no stored theme, web uses next-themes `defaultTheme='system'` so the OS picks Default light or Default dark; the desktop editor treats a missing or blank workspace theme as `system`. `DEFAULT_THEME_ID` stays `light` (Default light) as the fallback for unknown ids. Tests: ThemeProvider renders `defaultTheme="system"`; NativeEditor with no theme and a dark OS sets `data-theme="dark"`, with a light OS `light`. QA: fresh headless profile with `prefers-color-scheme: dark` shows Default dark on `/login`.
- X1: Add a guard test that fails when an amber hue literal (oklch hue 30–80 with chroma ≥ 0.1, or a Tailwind `amber-*` class) appears in theme-bearing source outside the Warm Cathedral definitions (base.css cathedral blocks, the registry cathedral seed), the user-picked category palette (`category-colors.ts`, `desktop-contract/src/category.ts`) and the heatmap ramps; `apps/desktop/electron/update-progress-window-html.ts` is excluded by name with a comment pointing to #214. Test: the guard passes on the branch and fails on a planted `oklch(0.56 0.16 50)` in a non-allowlisted file.
- CEO-2: The theme CSS generator also emits the legacy selectors `:root[data-theme='default-light']` (with the Default light block) and `:root[data-theme='default-dark']` (with the Default dark block), so a stored legacy id paints Default before `ThemeAllowlistGuard` rewrites it. Test: generator output contains both alias selectors on the Default blocks. QA: a headless profile pre-seeded with `localStorage['corelive-theme']='default-dark'` paints Default dark at first frame (screenshot) and ends with storage `dark`.
- CEO-3: One fallback contract, web and desktop: no stored value → `system`; `system` → Default light/dark by OS; `light`/`dark` (old Warm Cathedral or new Default) → Default light/dark; `default-light`/`default-dark` → `light`/`dark`; `cathedral-*` and colored ids → that theme; unknown or blank → `system`. `DEFAULT_THEME_PREFERENCE = 'system'` is exported from the registry; web `ThemeProvider` uses it as `defaultTheme`, `ThemeAllowlistGuard` heals unknown values to it, and `NativeEditor` uses it before the workspace is ready and for unknown/blank values. `DEFAULT_THEME_ID = 'light'` stays the concrete id where an id is required. Tests: table-driven over every row for `normalizeThemePreference`; NativeEditor pre-ready with a dark OS sets `data-theme="dark"`.
- CEO-4: `normalizeThemePreference(value: unknown): ThemeId | 'system'` lives in `packages/live-editor/src/themes/registry.ts` (re-exported to web by `apps/web/src/lib/themes/registry.ts` `export *`); `isThemeId` stays strict. Legacy aliases are a private `Record<string, ThemeId>` inside the registry. Tests: one row per CEO-3 case.
- CEO-5: Sweep every theme-id literal (`'light'`, `'dark'`, `'default-light'`, `'default-dark'`, `'warm-cathedral-*'`) in source, scripts and tests with `rg`, classifying each as a mode literal (unchanged) or an id literal (renamed or justified): at least `ThemeId`/`getThemeId` (`registry.ts:41,530`), `THEME_REGISTRY` keys and lookups, the generator's cathedral ladder mirror (`apps/web/scripts/generate-theme-css.ts`), `apps/web/scripts/qa-settings/main.tsx`, `apps/desktop/scripts/qa-offline-editor.ts`, the desktop benchmark script and existing tests. Verify: `pnpm typecheck` and `pnpm validate` green.
- CEO-6: Picker transitions in `useThemeAxis`: Default offers Light/Dark/System; every other family offers Light/Dark. `setMode('system')` from any family selects System (the Default pair); `setFamily('default')` while on System stays on System; `setFamily(x)` for any other family while on System selects `x` at the resolved mode. Tests for each transition plus Warm Cathedral → System → Warm Cathedral.
- CEO-7: CSS split: bare `:root` keeps `color-scheme: light` and `--radius`; the Warm Cathedral light palette moves byte-identical to `:root[data-theme='cathedral-light']`; the `[data-theme='dark']` block moves byte-identical (with `color-scheme: dark`) to `:root[data-theme='cathedral-dark']`; the `--control-border` `:root` block is unchanged. The generator emits Default as `:root, :root[data-theme='light'], :root[data-theme='default-light']` and `:root[data-theme='dark'], :root[data-theme='default-dark']`; Warm Cathedral stays `preserve` (not generated). Test: the cathedral snapshot test pins the moved blocks byte-for-byte; `pnpm theme:check` clean.
- CEO-8 (taste): The Default family keeps the existing warm heatmap ramp (`--hm-*`): DESIGN.md treats the heatmap ramp as content color, not theme chrome. The guard allowlists `--hm-*` values with that reason.
- CEO-9: The amber guard (X1) scans hand-authored `.ts/.tsx/.css/.html` under `apps/web/src`, `apps/desktop/renderer`, `apps/desktop/electron` and `packages/*/src`, excluding tests, `generated.css`, `themes/registry.ts`, `apps/web/scripts/generate-theme-css.ts` and the theme tooling `apps/web/src/lib/themes/{preview,contrast}.ts`. In `base.css` only the `cathedral-*` blocks and `--hm-*`/`--chart-*` declarations may carry amber; the category palettes are allowed; `apps/desktop/electron/update-progress-window-html.ts` is excluded by name with a comment pointing to #214. Matches: `oklch(L C H[ / a])` with 30 ≤ H ≤ 80 and C ≥ 0.1, and Tailwind classes `[a-z-]+-amber-[0-9]{2,3}`. It is green on the branch; a planted `oklch(0.56 0.16 50)` in a non-allowlisted file fails it.
- CEO-10: Crossfade QA uses the offline-editor fixture (`window.__offlineFixture.control({ theme })`) switching `light` → `cathedral-light`, recorded with `pnpm qa:browser video-start`/`video-stop`, frames extracted with ffmpeg and inspected.
- CEO-11 (premise correction, taste T2 at the gate): Old stored `light`/`dark` values read as Default; no migration to `cathedral-*`, because they cannot be told apart from the old seeded default (`offline-settings-sync.ts:414,575`). Distinguishable explicit picks are kept: `default-*` via the alias, every colored-family id unchanged. Test: `normalizeThemePreference('light') === 'light'` (Default) and `('harbor-dark') === 'harbor-dark'`.
- CEO-12: Login window QA: headless `/login-shell` screenshots on Default (no stored theme), Default with a dark OS (`pnpm qa:browser set-color-scheme dark`), and Warm Cathedral (`localStorage['corelive-theme']='cathedral-light'`). The explicit-choice path is the shared default-session `corelive.app` localStorage (no BrowserWindow `partition`), recorded in the QA report.
- CEO-13: The text-color preset keeps `var(--primary)` under the `accent`/"Accent" label; a test asserts `--primary` on `--background` is at least 4.5:1 for the Default pair and Warm Cathedral (reuse the existing contrast helper in `apps/web/src/lib/themes/contrast.ts`).
- CEO-14: Sync boundary normalization: `OfflinePreferenceSync.themeChanged` and `applyNativePreferences` pass values through `normalizeThemePreference`, so a legacy `default-*` from either side converges to `light`/`dark` without a second round trip. Tests: native `default-dark` applies `dark` to web and pushes `dark` back once; web `default-light` is pushed as `light`.
- CEO-15: Types and comments: `ThemeId` becomes `'light' | 'dark' | ${Exclude<ThemeFamilyId, 'default'>}-${ThemeMode}`; `getThemeId('default', m)` returns `m`; `default-*` are not `ThemeId`s, only legacy aliases. Registry, `THEME_FAMILY_LABEL`/`THEME_FAMILY_IDS` comments and the Facts wording describe `DEFAULT_THEME_ID` as the concrete Default light id and `DEFAULT_THEME_PREFERENCE` as the fresh-state value. Verify: `pnpm typecheck`.
- CEO-16: The shipped test set is the Tests section plus every `Tests:`/`Test:` clause in CEO-1..CEO-17 and X1; none is optional.
- CEO-17: Desktop first paint follows the OS: remove `data-theme="light"` from `apps/desktop/renderer/index.html`, and the generator emits `@media (prefers-color-scheme: dark) { :root:not([data-theme]) { Default dark tokens } }`, so the editor window never paints light on a dark OS before React mounts. Test: generator output contains the media block; QA: the desktop fixture with a dark OS shows Default dark in its first recorded frame.
- CEO-4 (restated): `LEGACY_THEME_ID_ALIASES` (read-only, exported) and `normalizeThemePreference(value: unknown): ThemeId | 'system'` live in `packages/live-editor/src/themes/registry.ts`; the generator reads the alias map to emit the legacy selectors (CEO-2). Readers: `ThemeAllowlistGuard`, `useThemeAxis` (raw stored value), `NativeEditor`, and the sync boundary (CEO-14). `isThemeId` stays strict.
- CEO-6 (restated as expected ids): Light/Dark/System offered for Default, Light/Dark for every other family. From System: `setFamily('default')` → `system`; `setFamily('cathedral')` → `cathedral-<resolved>`; `setFamily('harbor')` → `harbor-<resolved>`. From `cathedral-light`: `setMode('system')` → `system`; `setMode('dark')` → `cathedral-dark`. From `light`: `setMode('dark')` → `dark`; `setFamily('cathedral')` → `cathedral-light`.
- CEO-7 (restated): The Warm Cathedral `:root` palette and its header comment move together to `:root[data-theme='cathedral-light']`; `[data-theme='dark']` moves to `:root[data-theme='cathedral-dark']`; values byte-identical. The snapshot test extracts those two selectors instead of `/:root \{[^}]*\}/`. A new test asserts every bare `:root` block in `base.css` declares no color token (only `color-scheme`, `--radius`, `--control-border`).
- CEO-9 (restated): Guard coverage is stated as partial: it detects `oklch` literals (hue 30–80, chroma ≥ 0.1) and Tailwind `amber-`/`orange-`/`yellow-` color classes in hand-authored UI code; it does not parse hex/hsl/rgb. Theme definition files (`generated.css`, `themes/registry.ts`, `base.css` theme blocks, `generate-theme-css.ts`, `lib/themes/{preview,contrast}.ts`) and the user-picked category palettes are out of its scope by design; `update-progress-window-html.ts` is excluded by name until #214.
- CEO-1/CEO-3 (restated): Remove "blank": a ready workspace theme cannot be blank (`OfflinePreferencesSchema.theme` is `min(1)`), so the desktop applies `system` only before the workspace is ready and for unknown values.
- CEO-1/CEO-3 (restated, final): unknown → `system`; `DEFAULT_THEME_ID = 'light'` is only the concrete Default light id used where an id is required before `system` resolves (SSR/pre-mount). The CEO-1 clause "fallback for unknown ids" is superseded.
- CEO-4 (final): exported read-only `LEGACY_THEME_ID_ALIASES` supersedes the earlier "private" wording.
- CEO-6 (restated, precedence): `useThemeAxis` reads `theme` through `normalizeThemePreference`; `system` (stored or normalized) makes `isSystem` true and `activeId = resolvedTheme`; otherwise `activeId` is the normalized id. Transitions as in the earlier restated CEO-6 table.
- CEO-9 (final): matchers are `oklch` hue 30–80 with chroma ≥ 0.1 and Tailwind `amber-` color classes only (no `orange-`/`yellow-`); the test file is `apps/web/src/lib/themes/no-hardcoded-amber.test.ts`.
- CEO-13: dropped (superseded; no contrast test added).
- CEO-14 (restated): Echo suppression: both directions compare normalized values; `applyNativePreferences` sets `applyingTheme` to the normalized native value before `setTheme`, so the resulting `themeChanged` is not marked dirty; a normalization-only difference (native `default-dark` vs web `dark`) is never pushed back, because the desktop normalizes on read. Tests: native `default-dark` → web `dark`, zero pushes; a real web change after that pushes once.
- CEO-5 (addition): Tests pinned to the old semantics are rewritten, not deleted: `apps/web/src/lib/themes/registry.test.ts:116-117` (default family) and `apps/web/src/lib/redux/persistedUserSettingsSurviveAppUpdate.test.ts` (stored `dark`).
- CEO-18: One-time audit during implementation: `rg` for warm hex/hsl/rgb literals in hand-authored UI code (outside theme definitions and category palettes); each hit is converted to a token or justified in the PR body.
- CEO-19: Electron windows that show web or editor content set `backgroundColor` from `nativeTheme.shouldUseDarkColors` (Default dark background vs `#ffffff`) instead of a fixed `#ffffff`, so a dark OS never flashes white before the first paint. Test: the window-options builder returns the dark color when `shouldUseDarkColors` is true.
- CEO-18: dropped (V1).
- CEO-19: dropped (V1).
- CEO-13 (restored by V8): Tests assert `--primary` on `--background` ≥ 4.5:1 for Default light, Default dark and Warm Cathedral light/dark using `apps/web/src/lib/themes/contrast.ts`; QA screenshots the editor with the Accent preset on Default light and dark.
- CEO-20: Applied-palette contract test: every chrome token of the Default pair (`--background`, `--foreground`, `--card`, `--card-foreground`, `--popover`, `--popover-foreground`, `--primary`, `--primary-foreground`, `--secondary`, `--muted`, `--muted-foreground`, `--accent`, `--border`, `--input`, `--ring`, `--sidebar*`) has OKLCH chroma ≤ 0.02 in `generated.css`, and the bare `:root` fallback block equals the Default light values.
- CEO-21: DESIGN.md theme section starts with the rule "The applied default is shadcn Default (neutral). Warm Cathedral is one selectable theme; never hard-code its amber outside its theme definition."; rule 8 says System currently follows the Default pair (next-themes resolves System to the default ids) and per-family System is a possible future change.
- CEO-22: Release sequencing: after merge and the Vercel deploy, run the Electron release the same day; the PR body states that the installed editor keeps Warm Cathedral for `light` until the app updates, and that an old Warm Cathedral pick resets to Default (one click to restore in Settings → Theme).
- CEO-9 (test title): the guard test is titled to state partial coverage ("flags hand-authored amber oklch literals and Tailwind amber classes; hex/hsl/rgb not parsed").

<!-- /autoplan-accepted:ceo -->

### CEO Review Sections (SELECTIVE EXPANSION, implementation-ready depth)

**Current scope.** Mode SELECTIVE EXPANSION (autoplan override, auto-decided). Accepted: Decisions 1–6, CEO-1..CEO-17 (as restated), CEO-20..CEO-22, X1/CEO-9 (narrow, partial), CEO-13 (restored). Taste pending at gate: T1 (CEO-8 Default warm heatmap), T2 (CEO-11 old `light`/`dark` → Default), T3 (V3 guard kept). Rejected: X2, X3, X4, CEO-18, CEO-19. Deferred: X5 → #214.

**Section 1 — Architecture.**

```
 registry.ts (ids, seeds, DEFAULT_THEME_ID='light', DEFAULT_THEME_PREFERENCE='system',
 │            LEGACY_THEME_ID_ALIASES, normalizeThemePreference)
 ├──► generate-theme-css.ts ──► generated.css  (:root,[light],[default-light] / [dark],[default-dark] /
 │                                              @media dark :root:not([data-theme]) / colored families)
 ├──► web: ThemeProvider(defaultTheme=system) ─► next-themes blocking script ─► <html data-theme>
 │         ThemeAllowlistGuard (normalize, rewrite legacy/unknown) ; useThemeAxis (picker)
 │         OfflinePreferenceSync (normalize both directions) ──IPC──► workspace preferences.theme
 └──► desktop: NativeEditor.useEditorTheme(normalize, system→OS) ─► <html data-theme>
 base.css: bare :root (color-scheme, --radius) ; :root[cathedral-light] ; :root[cathedral-dark] ; --control-border
```

Data flows: stored value → normalize → id or system → attribute. Happy: `cathedral-dark` → that id. Nil: nothing stored → `system` → OS. Empty: `''` → unknown → `system`. Error: storage throws (next-themes catches; guard runs after mount) → in-memory default `system`. Coupling: the generator now reads the alias map (new, justified: single source). Scaling: N/A (client-side, constant). SPOF: the registry (already). Security: no new surface (localStorage string, validated by `isThemeId`/normalize; IPC theme already `z.string().min(1).max(50)`). Rollback: revert the PR; stored new ids (`cathedral-*`) would then be unknown to the old code and heal to old `light` (= Warm Cathedral) — acceptable. No issues beyond V1–V9.

**Section 2 — Error & Rescue Map.**

```
 METHOD/CODEPATH                         | WHAT CAN GO WRONG                         | CLASS
 normalizeThemePreference                | non-string / unknown / legacy value       | input domain (no throw)
 ThemeAllowlistGuard effect              | localStorage write blocked (quota/private) | DOMException from next-themes setTheme
 generate-theme-css --check              | registry and generated.css drift          | CI failure (theme:check)
 OfflinePreferenceSync.applyNative       | native theme legacy/unknown               | input domain
 NativeEditor.useEditorTheme             | matchMedia unavailable (tests)            | TypeError
 EXCEPTION/CASE        | RESCUED? | RESCUE ACTION                          | USER SEES
 unknown/legacy value  | Y        | normalize → alias or system            | Default (OS)
 storage write blocked | Y        | next-themes keeps in-memory theme      | correct theme this session
 drift                 | Y        | CI blocks merge                        | nothing (pre-merge)
 matchMedia missing    | N/A      | renderer always has matchMedia; tests stub it | —
```

No GAP rows.

**Section 3 — Security.** No new endpoints, params, secrets or dependencies. Inputs: the stored theme string (localStorage, workspace) — bounded by schema (`max(50)`) and normalized before use as an attribute; attribute injection is not possible because only registry ids or `system` reach `data-theme`. Likelihood/impact of misuse: Low/Low. No issues found.

**Section 4 — Data flow & interaction edge cases.**

```
 INPUT(stored) -> VALIDATE(normalize) -> TRANSFORM(system→OS) -> PERSIST(guard rewrite / sync) -> OUTPUT(data-theme)
   nil → system      wrong type → system     legacy → alias      unknown → system (rewritten)
   storage throws → in-memory    sync conflict → revision rules (unchanged)    stale tab → may rewrite (V7)
```

Async ordering: web guard rewrite vs `OfflinePreferenceSync.themeChanged` — invariant "a normalization-only change is never pushed" (CEO-14): both compare normalized values; `applyingTheme` suppresses the echo. Both orders (native apply first / guard rewrite first) end in web `dark`, native unchanged; regression test drives both orders with controlled promises. Interaction edges: double-click picker (idempotent setTheme); switching family while on System (CEO-6 table); OS theme flips while open (next-themes listener / NativeEditor media listener). No unhandled edges.

**Section 5 — Code quality.** Removes two special cases (`getThemeId` cathedral, `useThemeAxis` cathedral System) and adds one normalizer used by four readers instead of four ad-hoc checks (DRY). Naming: `DEFAULT_THEME_PREFERENCE` vs `DEFAULT_THEME_ID` must be documented side by side (CEO-15). No method exceeds 5 branches (`normalizeThemePreference`: string? system? alias? id? else). No issues beyond CEO-15.

**Section 6 — Tests.**

```
 NEW THING                         | TYPE        | HAPPY                      | FAILURE/EDGE
 normalizeThemePreference          | unit        | ids pass through           | legacy, unknown, '', non-string
 generator (aliases, media, :root) | unit+check  | selectors present          | theme:check drift
 base.css split / bare :root       | unit        | cathedral blocks byte-same | bare :root has no color token
 Default chroma contract (CEO-20)  | unit        | chroma ≤ 0.02              | warm value planted → fail
 guard X1 (partial)                | unit        | branch green               | planted oklch amber → fail
 useThemeAxis transitions          | unit        | table rows                 | System ↔ families
 ThemeAllowlistGuard               | component   | legacy rewrite             | unknown → system
 ThemeProvider                     | component   | defaultTheme=system        | —
 OfflinePreferenceSync             | unit        | normalized push            | echo suppression, both orders
 NativeEditor                      | component   | stored id                  | pre-ready + dark OS, legacy
 contrast (CEO-13)                 | unit        | ≥ 4.5:1                    | —
```

Each row maps to an accepted obligation; `no_claim`: unit/component tests do not prove the packaged Electron windows (headless QA + release covers that). 2am-Friday test: fresh profile + dark OS shows Default dark on `/login-shell`. Hostile QA: pre-seeded `default-dark`. Chaos: stale tab writes unknown id. Flakiness: matchMedia stubs only.

**Section 7 — Performance.** One extra CSS media block (~40 lines) and selector lists; no runtime cost beyond a string normalize per theme read. No issues found.

**Section 8 — Observability.** Theme selection is a client preference with no server path; failures surface visually and through CI (`theme:check`, contract tests). Debuggability: `data-theme` and `corelive-theme` are inspectable; the guard logs nothing today — adding a dev-only `logger.debug` on rewrite is optional and not required. No gaps.

**Section 9 — Deployment & rollout.** No DB migration. Order: merge → Vercel (web: login and Settings windows update immediately) → Electron release same day (CEO-22, V6). Deploy-time risk: old installed editor shows Warm Cathedral for `light` until updated (accepted, stated). Rollback: revert PR + redeploy; `cathedral-*` stored values heal to old `light` (Warm Cathedral). Post-deploy check: canary `corelive.app/login` paints Default (computed `--primary` chroma ≈ 0).

**Section 10 — Long-term trajectory.** Debt removed (cathedral special cases). New debt: the `default-*` legacy selectors and alias map (small; removable after the owner's stored values migrate — tracked by the alias map's comment). Reversibility 4/5. Ecosystem fit: uses next-themes' native System. 12-month obviousness: high (Default owns the flat ids like every design system). Next: #214 consumes `DEFAULT_THEME_ID`/registry tokens for the update window; #216 moves theme ownership into the desktop.

**Section 11 — Design & UX (UI scope).** First impression on a fresh install: neutral shadcn Default, OS-matched. States: loading (pre-hydration paint = final palette, no flash), empty (nothing stored = System), error (unknown → System), success (picked theme). Journey: no amber surprise; Warm Cathedral one click away. DESIGN.md alignment: DESIGN.md itself is amended (Decision 6, CEO-21) with owner authority (the issue). Accessibility: contrast CEO-13. Recommend the Phase 2 design review (autoplan runs it).

```
 fresh launch ─► System ─► (OS light) Default light ─┐
                        └► (OS dark)  Default dark  ─┤─► Settings → Theme ─► Warm Cathedral (Light/Dark only)
 stored legacy default-* ─► alias ─► Default ─────────┘                      └► System again ─► Default pair
```

**NOT in scope.** X2 picker "(recommended)" marker — skipped, already first and named Default. X3 reset button — skipped, not requested. X4 versioned cathedral migration — skipped (CEO-11/T2). CEO-18 literal audit — rejected (V1). CEO-19 window background — rejected (V1; pre-existing). X5 update-download window theming — deferred to issue #214 (no TODOS.md by project rule). Per-family System / `{family, mode}` storage — not pursued (V5).

**What already exists.** Registry single source (`packages/live-editor/src/themes/registry.ts`) — reused. Generator + `theme:check` — extended. next-themes System — reused. `ThemeAllowlistGuard` healing — extended with normalize. `NativeEditor` system branch — reused. `OfflinePreferenceSync` — two normalize calls added. Contrast helper `apps/web/src/lib/themes/contrast.ts` — reused for CEO-13.

**Dream state delta.** After this plan: Default owns the neutral baseline everywhere the web and editor render; still missing vs the 12-month ideal: the update-download window (#214), desktop-owned theme and offline Settings (#216), per-family System (future).

**Failure Modes Registry.**

```
 CODEPATH                 | FAILURE MODE                      | RESCUED? | TEST? | USER SEES?             | LOGGED?
 web first paint          | stored legacy default-dark        | Y (CEO-2)| Y     | Default dark           | n/a
 web first paint          | unknown stored id                 | Y        | Y     | Default (OS)           | n/a
 desktop first paint      | dark OS before React              | Y (CEO-17)| Y    | Default dark           | n/a
 sync                     | legacy native value               | Y (CEO-14)| Y    | Default                | n/a
 installed old editor     | reads light as Warm Cathedral     | N (sequenced, V6) | n/a | amber until update | release notes
 stale browser tab        | rewrites newer cathedral-* id     | N (V7, accepted) | N | Default             | n/a
```

CRITICAL GAPS: 0 (the two N rows are accepted, user-visible and stated).

<!-- ceo-implementation-tasks -->

## Implementation Tasks (CEO)

- [ ] **T1 (P1, human: ~3h / CC: ~15min)** — registry — swap ids, add `DEFAULT_THEME_PREFERENCE`, `LEGACY_THEME_ID_ALIASES`, `normalizeThemePreference`, retype `ThemeId`/`getThemeId`
  - Surfaced by: Decision 1, CEO-3/4/15 · Files: `packages/live-editor/src/themes/registry.ts` · Verify: registry tests, `pnpm typecheck`
- [ ] **T2 (P1, human: ~4h / CC: ~20min)** — CSS — generator selectors (aliases, `:root` fallback, dark media block) and base.css cathedral split
  - Surfaced by: Decision 3, CEO-2/7/17 · Files: `apps/web/scripts/generate-theme-css.ts`, `packages/live-editor/src/styles/{base,generated}.css`, `apps/desktop/renderer/index.html` · Verify: `pnpm theme:check`, snapshot + bare-`:root` + CEO-20 tests
- [ ] **T3 (P1, human: ~3h / CC: ~15min)** — web — ThemeProvider `defaultTheme`, guard normalize, `useThemeAxis` transitions
  - Surfaced by: Decision 2, CEO-1/3/6 · Files: `apps/web/src/providers/{ThemeProvider,ThemeAllowlistGuard}.tsx`, `apps/web/src/hooks/useThemeAxis.ts`, `apps/web/src/components/ThemeSelector*.tsx` · Verify: component tests
- [ ] **T4 (P1, human: ~2h / CC: ~10min)** — desktop + sync — NativeEditor normalize/pre-ready, sync normalization
  - Surfaced by: CEO-3/14 · Files: `apps/desktop/renderer/NativeEditor.tsx`, `apps/web/src/lib/offline-settings-sync.ts` · Verify: NativeEditor + sync tests
- [ ] **T5 (P1, human: ~2h / CC: ~10min)** — guard + contract tests — X1/CEO-9 partial guard, CEO-20 chroma contract, CEO-13 contrast
  - Surfaced by: X1, V2, V8 · Files: `apps/web/src/lib/themes/no-hardcoded-amber.test.ts` (+ contract/contrast tests) · Verify: green on branch, planted value fails
- [ ] **T6 (P2, human: ~1h / CC: ~5min)** — copy — Accent preset, DESIGN.md rule + rules 1/2/8, comment wording
  - Surfaced by: Decisions 5/6, CEO-21 · Files: `packages/desktop-contract/src/live-editor-constants.ts`, `DESIGN.md`, `ElectronOAuthButtons.tsx`, `DayDetailDialog.tsx` · Verify: preset test, docs read
- [ ] **T7 (P1, human: ~2h / CC: ~15min)** — sweep — rg-derived id literal sweep incl. pinned tests, QA fixtures, dslint css-parser
  - Surfaced by: CEO-5 · Files: list in spec review launch 2 · Verify: `pnpm validate`
- [ ] **T8 (P1, human: ~3h / CC: ~20min)** — QA — headless web (fresh, dark OS, legacy seed, Warm Cathedral, login-shell), desktop fixture (first paint, crossfade video)
  - Surfaced by: CEO-10/12, QA section · Verify: QA report with screenshots/video frames

**CEO Completion Summary**

```
  +====================================================================+
  |            MEGA PLAN REVIEW — COMPLETION SUMMARY                   |
  +====================================================================+
  | Mode selected        | SELECTIVE EXPANSION (autoplan)              |
  | System Audit         | cathedral owns flat ids; amber :root fallback|
  | Step 0               | id swap (A); CEO-1 fresh=System; X1 guard   |
  | Section 1  (Arch)    | 0 new issues (V1–V9 applied)                |
  | Section 2  (Errors)  | 5 error paths mapped, 0 GAPS                |
  | Section 3  (Security)| 0 issues found, 0 High severity             |
  | Section 4  (Data/UX) | 7 edge cases mapped, 0 unhandled            |
  | Section 5  (Quality) | 0 issues found (CEO-15 naming applied)      |
  | Section 6  (Tests)   | Diagram produced, 0 gaps                    |
  | Section 7  (Perf)    | 0 issues found                              |
  | Section 8  (Observ)  | 0 gaps found                                |
  | Section 9  (Deploy)  | 1 risk flagged (old editor until update)    |
  | Section 10 (Future)  | Reversibility: 4/5, debt items: 1           |
  | Section 11 (Design)  | 0 issues (Phase 2 review recommended)       |
  +--------------------------------------------------------------------+
  | NOT in scope         | written (7 items)                           |
  | What already exists  | written                                     |
  | Dream state delta    | written                                     |
  | Error/rescue registry| 4 rows, 0 CRITICAL GAPS                     |
  | Failure modes        | 6 total, 0 CRITICAL GAPS                    |
  | TODOS.md updates     | 0 items (project forbids TODOS.md)          |
  | Scope proposals      | 6 proposed, 2 accepted (EXP + SEL)          |
  | CEO plan             | written                                     |
  | Outside voice        | codex completed                             |
  | Lake Score           | N/A (no scored coverage questions)          |
  | Diagrams produced    | 4 (architecture, data flow, user flow, dream)|
  | Stale diagrams found | 0                                           |
  | Unresolved decisions | 3 (taste T1–T3, at the gate)                |
  | Reality rows         | 7/7 rows (PLAN_REALITY), 0 unverified       |
  +====================================================================+
```

### Design Step 0 (autoplan Phase 2)

Methodology read: `autoplan-design-methodology-ybV3Ya/methodology.md` ranges 1-600, 601-1200, 1201-1577 of 1577 (EOF).

**System audit.** UI scope: yes. The changed surfaces are the web first paint, the Electron login window (`/login-shell`), the Settings theme picker (`ThemeSelector`, `ThemeSelectorMenuItem`, `useThemeAxis`), the desktop editor's first paint and theme, and the LiveEditor text-color preset label. No new screens. DESIGN.md exists. It still names Warm Cathedral as the applied default in more places than Decision 6 lists: line 16 (Direction), line 24 (concept owns every default), line 35 (Instances), line 139 (section intro "soul of the product"), rules 1, 2, 4, 8 and 10, and line 343 (heatmap editing note). The decisions log rows dated 2026-06-10/2026-09-05 are history and stay. Retrospective: design-review #5 (2026-06-11) set the whole-UI crossfade, which CEO-10 keeps under QA. The owner has corrected "amber is the default" several times (memory `feedback-default-theme-is-shadcn-not-amber`), so the same mistake keeps coming back.

**0A Initial rating: 6/10.** The plan says which palette applies, and when. It does not say what the owner will see on the screen they complained about. The login window draws a decorative 10-cell heatmap "ribbon" (`LoginShell.tsx:20-37`) from `--hm-*`. The Default family reuses the Warm Cathedral ramp verbatim (`registry.ts:180,223-224`, e.g. `--hm-1: oklch(0.89 0.06 75)`). So after this plan the Default login window keeps a warm amber ramp next to a neutral black button. Neither X1 (it scans literals, the ribbon uses `var()` tokens) nor CEO-20 (it excludes `--hm-*`) catches it. Picker states and the reset visible to an old Warm Cathedral user are described as engineering transitions, not as what the user sees.

A 10 here: every default-path surface has a stated visual outcome on Default light and dark, including the decorative ribbon. Picker transitions are stated as visible controls (which mode buttons exist, which one is pressed, which card is ringed). DESIGN.md is fully swept, so no future agent reads amber back in as the default.

**0B DESIGN.md.** Present. Every design decision is calibrated against it. DESIGN.md is being amended under the owner's authority (issue #213; CEO-21), so the "default is sacred" rules are the target of the change, not a constraint on it.

**0C Existing leverage.** The picker stays as built: `ThemeSelector` (ToggleGroup mode axis with `min-h-11` targets, RadioGroup palette cards with `ThemePreviewSwatch`, `peer-focus-visible` ring), `ThemeTransition` crossfade, `HEATMAP_LEVEL_TOKENS`, the shadcn Default `StaticTheme` tokens (`neutral.json` verbatim), and the `useMounted` placeholder that prevents a selection flash.

**0D Focus.** All seven passes (autoplan P1). Mockups (plan-design-review Step 0.5) are not part of the autoplan design phase. The board would also need the owner's live feedback and would take over the host display (QA constraint). Rendered evidence comes from headless QA (CEO-12) instead.

### Design dual voices (snapshot `3f9343fb…`)

**Claude subagent (native, in-host, completed; INPUT hash matches the snapshot):** 10 findings. Critical 1: an old amber pick resets silently, so show a one-time in-app notice. High 2: the System segment's behavior in the picker is unspecified. High 3: the "Default" label is ambiguous and swatches are unstated. High 4: the crossfade may fire on the guard rewrite, and the web first paint on a dark OS is unstated. High 5: the visible web/installed-app skew. Medium 6: on Default, the Accent preset may be indistinguishable from the text color. Medium 7: a warm heatmap on neutral chrome may read as leftover amber. Medium 8: the hex/hsl/rgb audit was dropped. Medium 9: first-run tone on a neutral palette. Medium 10: superseded clauses are scattered and CEO-19 status is unclear.

**Codex (outside, `gpt-6-astra`, ran to completion; result parser verdict `unverified`: the Japanese reply carried no machine-readable severity tags):** its coverage counts as missing (`outside_status: unavailable`, reason `untagged_review`). Its findings are used below as data, not as confirmation. High 1: DESIGN.md's upper sections (Aesthetic Direction, Presets, Instances, rule 4, Family signatures) still make Warm Cathedral the owner of every default. High 2: Mode depends on Palette, but the UI asks for Mode first, so picking Warm Cathedral silently drops System. High 3: a same-day release does not mean the installed app has updated; hand the owner the restore path; make unknown-id healing display-only. High 4: CEO-20 checks generated CSS, not rendered elements; add computed-color QA and the `--secondary-foreground`/`--accent-foreground` tokens. Medium 5: login and editor states (loading, OAuth waiting, error, recovery, hydration) have no expected look. Medium 6: the sidebar menu has no radio semantics; keyboard, focus and reduced-motion checks are missing. Medium 7: the Settings grid's 1/2/3 columns and 200% zoom are unprotected, and the placeholder's "same-height" claim is false. Medium 8: consolidate the restated clauses into one final contract. Classification: every surface is APP UI. No hard rejections. Recommendation: approve after fixes.

```
DESIGN OUTSIDE VOICES — LITMUS SCORECARD:
═══════════════════════════════════════════════════════════════
  Check                                    Claude  Codex*  Consensus
  ─────────────────────────────────────── ─────── ─────── ─────────
  1. Brand unmistakable in first screen?   —       YES     N/A
  2. One strong visual anchor?             —       YES     N/A
  3. Scannable by headlines only?          —       NO      N/A
  4. Each section has one job?             —       YES     N/A
  5. Cards actually necessary?             —       YES     N/A
  6. Motion improves hierarchy?            —       YES     N/A
  7. Premium without decorative shadows?   —       YES     N/A
  ─────────────────────────────────────── ─────── ─────── ─────────
  Hard rejections triggered:               none    none    N/A
═══════════════════════════════════════════════════════════════
 * Codex verdict unverified → missing coverage; consensus cells are N/A, not CONFIRMED.
 The native prompt does not ask the litmus questions ("—"). Primary review answers them in Pass 4.
```

### Design Review Sections (7 passes)

Classifier: OPERATE (APP UI) for every surface: login window, Settings picker, sidebar theme menu, desktop editor.

**Pass 1 — Information Architecture: 6/10 → 8/10.**

- Login window: the hierarchy is unchanged (wordmark → headline → sign-in CTA → trust line → ribbon). Only the palette moves.
- Settings picker: it shows Mode first and Palette second, but the Mode options depend on the Palette (System only exists for Default). Codex 2 and native 2 agree this is unexplained.
- Auto-decided (taste **T5**, voices differ on the remedy) → DES-3:
  - Keep the existing Mode → Palette order. Reordering is outside #213 (owner rule: one request per pipeline).
  - Keep the existing "offer only the modes the family has" pattern.
  - Add one helper line in Settings when the active palette is not Default.
  - Rejected: native's "visible but disabled System". A disabled segment cannot take focus, and it hides the reason in a tooltip.
- Remaining gap that keeps this at 8: the Mode-first order still precedes the dependency it explains.

**Pass 2 — Interaction State Coverage: 5/10 → 9/10.** Added the state table (DES-5 checks it):

```
  SURFACE / STATE                      | WHAT THE USER SEES (Default light / Default dark)          | WARM CATHEDRAL
  -------------------------------------|-------------------------------------------------------------|----------------
  Web first paint (no stored value)    | OS-matched Default; next-themes script sets data-theme pre-paint | n/a
  Web first paint (stored default-*)   | Default (legacy selectors); guard rewrite changes no color   | n/a
  Login: desktop-only notice (tab)     | neutral surface + text                                       | warm
  Login: Loading… / signed-out door    | neutral; sign-in button = --primary (near-black / near-white) | amber button
  Login: OAuth waiting / error line    | neutral; error = --destructive (fixed identity)              | same tokens
  Login: decorative ribbon             | neutral ramp from --muted to --primary (DES-2)               | cream → amber
  Login: signed-in recovery            | neutral (tokens only); not reachable headless (QA limit)     | warm
  Settings: hydration placeholder      | bg-muted/50 pulse block                                      | same
  Settings: Default active             | Mode = Light/Dark/System, no helper line                     | n/a
  Settings: other palette active       | Mode = Light/Dark + helper line (DES-3)                      | same
  Desktop editor: pre-ready            | OS-matched Default (media block, no attribute)               | n/a
  Desktop editor: ready / unknown id   | stored theme / System                                        | stored
  Accent text preset                   | reads close to body text by design (DES-6)                   | amber
```

- Native 4b (crossfade on the guard rewrite) is resolved by evidence. `ThemeTransition` (`packages/live-editor/src/ThemeTransition.tsx`) adds `theme-transition` on any post-mount `data-theme` mutation. The rewrite `default-dark` → `dark` goes between selectors with identical token values (CEO-2), so the 200ms transition has no visible change. DES-5 asserts the identical computed `--background`.
- Remaining gap: the signed-in recovery screen is unreachable headless.

**Pass 3 — User Journey & Emotional Arc: 5/10 → 8/10.**

```
  STEP | USER DOES                          | USER FEELS                       | PLAN SPECIFIES?
  -----|------------------------------------|----------------------------------|-----------------------------------------------
  1    | Opens the login window after update| "finally the stock look"         | yes: Default chrome + neutral ribbon (DES-2)
  2    | Opens Settings → Appearance         | oriented: Default ringed, System | yes: picker table (DES-1b)
  3    | Tries Warm Cathedral                | System vanished — why?           | yes: helper line (DES-3)
  4    | Returns to Default                  | expects System back              | yes: explicit Light/Dark kept; System one click (CEO-6)
  5    | Had picked Warm Cathedral before    | "my theme changed"               | partial: owner handoff + PR body (DES-8); no in-app notice (T4)
  6    | Uses the installed editor pre-update| "editor still amber"             | yes: same-day release is a hard requirement (DES-8)
```

- Time horizons. 5 s: neutral, no amber surprise. 5 min: one rule (System = Default pair) explained in place. 5 years: DESIGN.md no longer teaches amber-as-default (DES-7).
- Native 1 (critical, one-time in-app toast) is auto-declined (taste **T4**):
  - The single user is the owner, who asked for Default.
  - A notice needs a new persisted flag and a new surface.
  - The handoff text names the restore path instead.
- Remaining gap: no in-app notice for a reset Warm Cathedral pick.

**Pass 4 — AI Slop Risk: 7/10 → 9/10.**

- Hard rejections: none (APP UI; palette cards are the interaction).
- Litmus (primary):
  1. YES: the wordmark and the sign-in action.
  2. YES: the headline.
  3. NO → fixed by DES-3: "Mode/Palette" alone does not reveal the dependency.
  4. YES.
  5. YES: the cards compare real palettes.
  6. YES: the crossfade keeps the switch continuous.
  7. YES: the screens use type, space and borders, not shadows.
- Specificity gap: the login window would keep a warm 10-cell `--hm-*` ribbon on Default (Step 0). It is the only decorative heatmap consumer (others: `ContributionGraph`, `DayDetailDialog`, `TodayEmber`, picker `preview.ts`, all data or previews).
- Auto-decided (taste **T6**, voices split: Codex treats the ribbon as heatmap warmth worth keeping, native flags warm leftovers): **DES-2**, the ribbon follows theme chrome.
- Remaining: none blocking.

**Pass 5 — Design System Alignment: 5/10 → 9/10.**

- DESIGN.md: the sweep in Decision 6 covered rules 1, 2 and 8 and Instances only. Codex 1 and Step 0 found further lines: 16, 24, 139, rules 4/10, the Family signatures row (156) and 343 → **DES-7**, a full sweep plus an explicit "heatmap = content color, decoration uses chrome tokens" rule and a decisions-log row.
- The contract test extends to `--secondary-foreground` and `--accent-foreground` (**DES-10**).
- Codex 4 rendered-element check → **DES-5**. This also answers native 8 without reviving CEO-18: a hard-coded hex shows up in computed colors.
- Label "Default" kept (native 3 declined): it is the shadcn name and the owner's own word, and `ThemePreviewSwatch` already shows the neutral palette on its card (`ThemeSelector.tsx`).
- Tone tuning of neutral tokens (native 9) declined: the owner asked for stock shadcn Default.
- Remaining: none.

**Pass 6 — Responsive & Accessibility: 6/10 → 8/10.**

- Existing strengths: Settings radio group with an `sr-only` radio peer, `peer-focus-visible` ring, `min-h-11` mode targets, `settings.css` 1/2/3-column grid at 264/480 px.
- Gaps:
  - The sidebar theme menu uses plain `DropdownMenuItem` + `Check`, with no `menuitemradio`/`aria-checked` → **DES-4** (fixed in this PR as a discovered TODO; CLAUDE.md rule).
  - No keyboard, focus, reduced-motion or narrow-width checks → **DES-5**.
  - The Accent contrast was checked only on `--background` → **DES-6** adds `--card`.
  - The placeholder comment says "same-height" but the grid height varies by column count → **DES-9**.
- Remaining: true browser zoom is approximated by viewport width; native window chrome is out of headless reach.

**Pass 7 — Unresolved Design Decisions (register).**

```
  DECISION                                   | RESOLUTION                                   | IF IT HAD BEEN LEFT OPEN
  -------------------------------------------|----------------------------------------------|---------------------------------------
  Login ribbon colour on Default             | DES-2 chrome ramp (taste T6)                 | owner sees amber on the login again
  What explains "System only for Default"    | DES-3 helper line, Settings only (taste T5)  | System silently disappears
  In-app notice for reset Warm Cathedral     | none; owner handoff + PR body (taste T4)     | —
  Accent preset on Default                   | keeps var(--primary) (DES-6)                 | a fixed hue → hard-coded amber/other
  Picker order Mode/Palette                  | unchanged (scope)                            | —
  Unknown stored id                          | heals to system (V7 kept; old code is the only realistic writer) | —
  CEO-18 / CEO-19                            | OUT (DES-1d); CEO-13 IN                      | implementer guesses
  Clause sprawl                              | DES-1 final contract supersedes restatements | reviewers read different clauses
```

Resolved 8; deferred 0. Taste decisions T4–T6 go to the final gate together with T1–T3.

**NOT in scope (design).**

- Picker reorder Palette → Mode: not requested; the helper line answers the dependency.
- In-app reset toast (T4).
- "Default (neutral)" label.
- Tuning the neutral tokens for warmth: the owner wants stock.
- Per-family System (V5, future).
- Native window `backgroundColor` (CEO-19).
- Theming the update-download window (#214).

**What already exists (design).**

- `ThemeSelector` (ToggleGroup + RadioGroup cards, `ThemePreviewSwatch`, focus ring, `min-h-11`).
- `ThemeSelectorMenuItem`, `DropdownMenuRadioGroup`/`DropdownMenuRadioItem` in `components/ui/dropdown-menu.tsx`.
- `ThemeTransition` crossfade, `settings.css` grid breakpoints.
- The Settings QA fixture (`apps/web/scripts/qa-settings`, stubs `window.electronAPI`).
- `pnpm qa:browser` commands `run-code`, `eval`, `resize`, `set-color-scheme`, `set-reduced-motion`, `localstorage-set`, `video-start/stop`.

**TODOS.md updates.** None. The project forbids TODOS.md, and every finding is either built in this PR or declined above.

<!-- autoplan-accepted:design -->

- DES-1 (final contract; supersedes earlier restated CEO clauses where they differ):
  - (a) Stored value → applied theme, the same on web and desktop:
    - none → `system`
    - `system` → Default light/dark by OS
    - `light`/`dark` → Default light/dark
    - `default-light`/`default-dark` → `light`/`dark` (the web guard rewrites storage; desktop and sync normalize on read)
    - `cathedral-*` and colored ids → that theme
    - unknown → `system` (the web guard rewrites storage)
  - (b) Picker, as the user sees it:
    - Default card ringed → Mode toggles Light, Dark, System.
    - Any other card ringed → Light, Dark and the DES-3 helper line.
    - Transitions are exactly the CEO-6 (restated, expected ids) table. `useThemeAxis` reflects the normalized value immediately.
  - (c) First paint:
    - On the web, next-themes' blocking script sets `data-theme` before paint (`defaultTheme='system'`), so `:root:not([data-theme])` never applies with JS.
    - On the desktop, the editor has no attribute until mount, and the media block paints OS-matched Default.
    - Sync follows CEO-14 (restated): a normalization-only difference makes zero pushes.
  - (d) Clause status: CEO-18 OUT; CEO-19 OUT (the login window keeps `backgroundColor: '#ffffff'`; the pre-paint native white on a dark OS is pre-existing and out of #213); CEO-13 IN; `LEGACY_THEME_ID_ALIASES` exported.
- DES-2: The login ribbon (`apps/web/src/components/login-shell/LoginShell.tsx`, `HEATMAP_RIBBON_CELLS`) stops using `HEATMAP_LEVEL_TOKENS`/`--hm-*`.
  - Each level 0–4 fills with `color-mix(in oklch, var(--primary) P%, var(--muted))`, P = 10, 30, 50, 70, 90.
  - The values are defined once as a `LOGIN_RIBBON_LEVEL_FILLS` constant colocated with the login shell.
  - The JSDoc describes a theme-following ramp.
  - Result: Default shows a neutral ramp, Warm Cathedral cream → amber, and colored families their own accent.
  - Test: rendered ribbon cells reference `--primary`/`--muted` and none references `--hm-`.
  - QA: on Default light and dark every ribbon cell's computed fill has OKLCH chroma ≤ 0.02; on Warm Cathedral the ramp is warm.
- DES-3: `ThemeSelector` shows `To follow your device's light or dark setting, choose the Default palette.` (`type-small text-muted-foreground`) directly under the Mode toggle only while the active palette is not Default.
  - The Mode `ToggleGroup` gets `aria-describedby` pointing to it.
  - The sidebar menu shows no helper line (quick switcher).
  - Test: shown and described-by for Warm Cathedral and Harbor; absent for Default.
- DES-4: `ThemeSelectorMenuItem` renders both axes with `DropdownMenuRadioGroup` + `DropdownMenuRadioItem`, using the mode and the family as values. Items expose `menuitemradio` with `aria-checked`; the hand-rolled `bg-accent` + `Check` active styling is removed in favour of the radio indicator.
  - Test: the active mode and palette items have `role="menuitemradio"` and `aria-checked="true"`, and the others `"false"`.
- DES-5: QA pass criteria (headless only, report lists each with evidence):
  1. Rendered-element neutrality on Default light and dark: `eval` reads the computed `background-color`, `color`, `border-color` and `outline-color` of the login page background, headline, sign-in button and desktop-only notice, the Settings selected palette card ring and active mode toggle, and the editor surface. Each is OKLCH chroma ≤ 0.02 (heatmap, category and Today Ember excluded).
  2. Login states by screenshot on Default light, Default dark and Warm Cathedral:
     - desktop-only notice (plain tab)
     - signed-out front door (`run-code` init script stubbing the preload oauth bridge)
     - OAuth error line (stub rejects)
     - The signed-in recovery screen is listed as a headless limit.
  3. Legacy seed `localStorage['corelive-theme']='default-dark'`: computed `--background` is identical before and after the guard rewrite, and storage ends as `dark`.
  4. Settings fixture at viewport widths giving 1, 2 and 3 palette columns and a half-width zoom proxy: no clipped label, check or helper line, and no horizontal scroll.
  5. Keyboard: Tab → mode toggle, arrows change mode, Tab → palette, arrows/Space select; the focus ring is visible on Default light and dark.
  6. Motion: `set-reduced-motion reduce` makes the switch instant; normally the 200ms crossfade frames are present (video, ffmpeg frames).
  7. Editor screenshot with the Accent preset on Default light/dark.
- DES-6: The Accent preset keeps `var(--primary)`. On Default it reads close to the body text by design: stock shadcn primary is neutral, a fixed hue would hard-code a colour on Default, and the custom hex input stays the colour path. CEO-13's contrast test runs `--primary` against both `--background` and `--card` for Default light/dark and Warm Cathedral light/dark.
- DES-7: DESIGN.md sweep:
  - Line 16 (Direction): the concept is self-affirmation. Warmth lives in the heatmap's accumulated days. Default chrome is stock shadcn Default. Warm Cathedral is one selectable theme.
  - Line 24: the North Star owns every default; the default chrome is shadcn Default.
  - Line 35 Instances.
  - Line 139 section intro.
  - Rules 1, 2, 4 ("Warm Cathedral is not generated"; Default is emitted), 8 (per CEO-21) and 10 (unknown → System).
  - Family signatures row (role "opt-in warm palette").
  - Line 343 ("For Warm Cathedral").
  - Add the rule "The heatmap ramp is content colour (accumulated days) and stays warm on every theme, including Default; decorative surfaces use theme chrome tokens, never `--hm-*`".
  - Add a Decisions Log row dated 2026-11-02. Earlier rows stay as history.
  - Verify: every remaining `Warm Cathedral` hit in DESIGN.md names it as an option, its own palette, or history.
- DES-8: The same-day Electron release is a hard requirement of this ship. The PR body and the final owner report say: 「旧 Warm Cathedral の選択は Default になります。戻すには Settings → Appearance → Palette → Warm Cathedral」. Release is complete when the tag build, its 8 assets and `latest-mac.yml` are verified. The installed app is not touched on the host, so confirming the in-app update is the owner's step. No in-app notice (T4).
- DES-9: `ThemeSelector`'s hydration placeholder comment stops claiming a same-height block and states that it reserves approximate space.
- DES-10: CEO-20's token list adds `--secondary-foreground` and `--accent-foreground`.
- DES-11: CEO-16 extends to this phase. Every `Test:` clause in DES-2, DES-3, DES-4, DES-6 and DES-10 ships, and every DES-5 QA criterion appears in the QA report. None is optional.

<!-- /autoplan-accepted:design -->

<!-- design-implementation-tasks -->

## Implementation Tasks (Design)

Synthesized from this review's findings. Each task derives from a specific finding above. Effort ratio assumption: UI edit + test ≈ 20–30x.

- [ ] **T1 (P1, human: ~1.5h / CC: ~10min)** — login-shell — ribbon on theme chrome tokens
  - Surfaced by: Step 0 / Pass 4: warm `--hm-*` ribbon on Default (`LoginShell.tsx:20-37`)
  - Files: `apps/web/src/components/login-shell/LoginShell.tsx` (+ colocated constant), `LoginShell.test.tsx`
  - Verify: ribbon test; DES-5.1/5.2 QA
- [ ] **T2 (P1, human: ~1h / CC: ~10min)** — settings picker — non-Default helper line + `aria-describedby`; placeholder comment
  - Surfaced by: Pass 1 / Pass 6: System dependency unexplained; "same-height" claim
  - Files: `apps/web/src/components/ThemeSelector.tsx` + test
  - Verify: helper tests; DES-5.4/5.5
- [ ] **T3 (P1, human: ~1h / CC: ~10min)** — sidebar menu — radio semantics for mode and palette
  - Surfaced by: Pass 6: `DropdownMenuItem` + `Check` with no `aria-checked`
  - Files: `apps/web/src/components/ThemeSelectorMenuItem.tsx` + test
  - Verify: role/aria-checked test
- [ ] **T4 (P1, human: ~1h / CC: ~10min)** — DESIGN.md — full default-theme sweep + heatmap-is-content rule + log row
  - Surfaced by: Pass 5 / Codex 1 / Step 0 audit
  - Files: `DESIGN.md`
  - Verify: `rg -n 'Warm Cathedral' DESIGN.md` hits reviewed
- [ ] **T5 (P1, human: ~3h / CC: ~20min)** — QA — DES-5 rendered-element neutrality, login states, legacy seed, widths, keyboard, motion, Accent
  - Surfaced by: Pass 2 / Pass 6 / Codex 4–7 (extends CEO T8)
  - Files: QA report under `.gstack/qa-reports/`
  - Verify: report with screenshots, eval output, video frames
- [ ] **T6 (P2, human: ~30min / CC: ~5min)** — tests — CEO-20 token additions, CEO-13 on `--card`
  - Surfaced by: Pass 5 / Pass 6
  - Files: theme contract/contrast tests
  - Verify: `pnpm test`

## Design Review Completion Summary

```
  +====================================================================+
  |         DESIGN PLAN REVIEW — COMPLETION SUMMARY                    |
  +====================================================================+
  | System Audit         | DESIGN.md present; UI scope: 5 surfaces     |
  | Step 0               | 6/10; focus all 7 (autoplan)                |
  | Pass 1  (Info Arch)  | 6/10 → 8/10 after fixes                     |
  | Pass 2  (States)     | 5/10 → 9/10 after fixes                     |
  | Pass 3  (Journey)    | 5/10 → 8/10 after fixes                     |
  | Pass 4  (AI Slop)    | 7/10 → 9/10 after fixes                     |
  | Pass 5  (Design Sys) | 5/10 → 9/10 after fixes                     |
  | Pass 6  (Responsive) | 6/10 → 8/10 after fixes                     |
  | Pass 7  (Decisions)  | 8 resolved, 0 deferred                      |
  +--------------------------------------------------------------------+
  | NOT in scope         | written (7 items)                           |
  | What already exists  | written                                     |
  | TODOS.md updates     | 0 items (project forbids TODOS.md)          |
  | Approved Mockups     | 0 generated (autoplan phase has no mockups) |
  | Decisions made       | 10 added to plan (DES-1..DES-10)            |
  | Decisions deferred   | 0                                           |
  | Overall design score | 5/10 → 8/10                                 |
  +====================================================================+
```

All rated passes are 8 or higher, so the plan is design-complete. Run /design-review after implementation for visual QA (DES-5 covers it headless). The remaining gaps are recorded per pass: the Mode-first order, the headless-unreachable recovery screen, no in-app reset notice (T4), and the zoom proxy.

Unresolved Decisions: none open in this phase. Taste decisions T4–T6 are auto-decided and surface at the final gate with T1–T3.

## DX Review (autoplan Phase 2.5)

### DX Step 0 (autoplan Phase 2.5, DX POLISH)

Methodology read: `autoplan-dx-methodology-ivq4U5/methodology.md` ranges 1-600, 601-1200, 1201-1800, 1801-1871 of 1871 (EOF). The phase was triggered by the term "shell" ×3 (`login-shell`). The plan still has real developer-facing surfaces, so the review runs in full.

**Product type (auto-decided, P6).** A repo-internal **library + build CLI**:

- the theme registry module API (`ThemeId`, `getThemeId`, `DEFAULT_THEME_ID`, `DEFAULT_THEME_PREFERENCE`, `LEGACY_THEME_ID_ALIASES`, `normalizeThemePreference`, `isThemeId`)
- the generator CLI (`pnpm theme:generate`, `pnpm theme:check`)
- guard/contract tests, whose failure messages are developer-facing errors
- DESIGN.md as the contributor doc
- QA scripts (`pnpm qa:browser`, `pnpm qa:offline-editor`, `apps/web/scripts/qa-settings`)

**0A Persona (auto-decided, P6: the most common developer here).**

```
TARGET DEVELOPER PERSONA
========================
Who:       An AI coding agent (Claude Code / Codex) implementing a corelive change while the owner is away.
Context:   Asked to build or restyle a screen, add a theme family, or read the stored theme in new code.
Tolerance: Cannot ask the owner mid-task; reads errors literally; retries; follows whatever DESIGN.md and the tests say.
Expects:   One rule stated up front, shadcn conventions (`:root` = light default, dark block, next-themes System), a failing test that names the fix.
```

Evidence: every recent PR in `git log` was agent-authored, and the owner has corrected "amber is the default" repeatedly (memory `feedback-default-theme-is-shadcn-not-amber`). The defect class is agents following stale docs.

**0B Empathy narrative (observed sources: DESIGN.md:16,24,35,139-150; registry.ts:476; generate-theme-css.ts:384-387).** "I'm asked to add a settings card. CLAUDE.md tells me to read DESIGN.md first. Its direction line says Warm Cathedral, rule 1 says 'the default is sacred: Warm Cathedral', and the registry's `DEFAULT_THEME_ID` is `'light'`, which is cathedral. So I reach for the warm accent and hard-code `oklch(0.6 0.15 55)` to match the screenshot, and every test passes. The owner sees amber again. Nothing in the repo told me I was wrong. With this plan, DESIGN.md's first theme line says Default is neutral and amber stays inside Warm Cathedral's definition. If I still hard-code the literal, `pnpm test` fails at once. Whether that failure tells me _what to write instead_ is the part the plan does not yet specify."

**0C Benchmark (reference evidence; web search returned third-party guides, not the official shadcn page).**

| Tool                      | Start → result                                                      | Time + evidence type                                    | DX choice                                                      | Source                                                                                                                                                                                                                      |
| ------------------------- | ------------------------------------------------------------------- | ------------------------------------------------------- | -------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| shadcn/ui theming         | init → light `:root` + dark block                                   | minutes, reported                                       | CSS variables in two blocks; generator pages output both       | [makerkit theme guide](https://makerkit.dev/docs/md/next-supabase-turbo/customization/theme), [shadcnblocks theming](https://www.shadcnblocks.com/docs/blocks/theming)                                                      |
| next-themes (with shadcn) | add provider → System follows OS                                    | minutes, reported                                       | `defaultTheme="system"` + `enableSystem`, one provider at root | [eastondev guide](https://eastondev.com/blog/en/posts/dev/20260326-shadcn-ui-theme-customization/), [shadcn customization skill](https://cdn.jsdelivr.net/npm/claude-code-skills@0.5.0/data/skills/shadcn/customization.md) |
| corelive today            | agent reads DESIGN.md → correct default palette                     | unbounded, observed: docs point at amber, no test fails | cathedral owns `:root`/`light`                                 | DESIGN.md:141,148; registry.ts:476                                                                                                                                                                                          |
| corelive after plan       | agent reads the DESIGN.md rule → correct palette, or a failing test | ~2-5 min, estimated                                     | Default owns `:root`/`light`/`dark`; guard + contract tests    | this plan                                                                                                                                                                                                                   |

Clock: an agent with a fresh checkout and `pnpm install` done, from reading the task until a component that renders on the default theme passes `pnpm test` + `pnpm theme:check`. **Target: Competitive (2-5 min)**, auto-decided (P5, fewer steps). Champion would need new tooling (lint rule, editor hints), which DX POLISH excludes.

**0D Magical moment (auto-decided, P5 lowest-effort vehicle).** The agent writes an amber literal or `amber-*` class. `pnpm test` fails in the existing vitest run. The message names `file:line`, the literal, the token to use instead (`var(--primary)` / `bg-primary` / `text-primary`) and the DESIGN.md rule anchor. Vehicle: the X1/CEO-9 guard test's assertion message. No new tool.

**0E Mode.** DX POLISH (autoplan override). The plan's DX scope is right; no additions beyond in-scope touchpoints.

### DX dual voices (snapshot `d5e1696d…`)

**Claude subagent (native, in-host, completed; INPUT hash matches):** scores Getting started 6, Ergonomics 7, Errors 4, Docs 6, Escape hatches 6.

- High: the clause log needs one final contract and an ordered sequence.
- High CAP6: `theme:check` drift fix line is missing.
- High CAP6: the amber guard prints a raw array diff.
- Medium:
  - unverified QA subcommands
  - `DEFAULT_THEME_ID` vs `DEFAULT_THEME_PREFERENCE` misuse
  - silent heal of a mistyped id (dev-only warning)
  - generator alias target unvalidated
  - sync failed-push recovery
  - JSDoc `@example`s
  - English line beside the Japanese PR note
  - guard allowlist reasons as data
  - Warm Cathedral cannot follow the OS
  - guard ignores hex/hsl/rgb
  - login-window white flash vs the CLAUDE.md discovered-TODO rule
- No CAP4.

**Codex (outside, `gpt-6-astra`, completed, `OUTSIDE_STATUS: completed`):**

- Critical CAP4: an unparsable `StaticTheme` token is copied verbatim (`generate-theme-css.ts:341`) and `--check` compares bytes only (`:384`), so a malformed palette generates and checks as success.
- High CAP6:
  - guard diagnostics
  - CEO-20 contract diagnostics
  - bare-`:root` test recovery
  - alias-target and `ladderColor` parser context (`:211-215` loses theme/mode/token)
  - drift context (no output file or first difference; "commit the result" without review)
- Medium:
  - DESIGN.md contributor recipe
  - migration table in CHANGELOG/DESIGN.md/JSDoc
  - frame extraction (the documented `fps=2` at `docs/headless-development.md:92-93` samples every 500 ms and can miss the 200 ms crossfade)

```
DX DUAL VOICES — CONSENSUS TABLE:
  Dimension                           Claude  Codex  Consensus
  1. Getting started < 5 min?          NO      NO     CONFIRMED gap (sequence, recipe)
  2. API/CLI naming guessable?         YES*    YES*   CONFIRMED (*docs/examples needed)
  3. Error messages actionable?        NO      NO     CONFIRMED (Codex adds CAP4 — single-voice critical, verified below)
  4. Docs findable & complete?         NO      NO     CONFIRMED gap (recipe, migration table)
  5. Upgrade path safe?                PARTIAL PARTIAL CONFIRMED gap (mapping documentation)
  6. Dev environment friction-free?    NO      NO     CONFIRMED (QA command/frames verification)
CONFIRMED = native + outside agree. Disagreements: none in direction. Single-voice items listed in the passes.
```

**Single-voice critical, verified:**

- `StaticTheme.tokens` is `Readonly<Record<ThemeToken, string>>` (`registry.ts:134`).
- `staticThemeCss` copies it unchanged (`generate-theme-css.ts:341`).
- `--check` is a string compare (`:384-388`).

Confirmed as CAP4 (failure signalled as success).

**Other evidence:**

- Native ND10 (failed push) is resolved by the existing bounded retry with idempotent replay (`offline-settings-sync.ts:204,354,384`). No change.
- QA subcommands `set-color-scheme`, `set-reduced-motion`, `run-code`, `eval`, `resize` and `localstorage-set` exist in `scripts/qa-browser.mjs`'s allow-list. `video-start`/`video-stop` are documented (`docs/headless-development.md:89-91`).
- `apps/web/src/lib/themes/generated.css` is a one-line `@import` shim of the generator output `packages/live-editor/src/styles/generated.css`.
- The generator header still says preserved themes live in `globals.css` (`generate-theme-css.ts` `GENERATED_HEADER`). They live in `base.css`, so this is a discovered comment defect.

### DX Review Sections (8 passes, DX POLISH)

**Pass 1 — Getting Started: 5/10 → 8/10.**

- TTHW today is unbounded: the docs point at amber and no test fails.
- After the plan: the rule is on DESIGN.md's first theme line (CEO-21), a three-step recipe follows (DX-8), the guard fails with a fix line (DX-2), and an ordered sequence has green checkpoints (DX-1).
- Remaining: the clause log itself stays append-only (tool-managed accepted blocks). DX-1's precedence line names the authority.

**Pass 2 — API/CLI/SDK: 7/10 → 8/10.**

- Names follow shadcn/next-themes conventions (flat `light`/`dark` default, System via next-themes).
- `normalizeThemePreference` is the single reader entry; `isThemeId` stays strict for already-normalized ids.
- Accepted: JSDoc `@example`s and `@see` cross-links between `DEFAULT_THEME_ID` and `DEFAULT_THEME_PREFERENCE` (DX-7).
- Declined: native's extra `DEFAULT_LIGHT_ID`/`DEFAULT_DARK_ID` constants. `getThemeId('default', mode)` is already the guessable entry, and more constants add surface (P4/P5).

**Pass 3 — Error Messages (agent-ready-v1): 4/10 (CAP4) → 8/10.**

```
ERROR PATH MATRIX (agent-ready-v1)                      before → after
Path                          | Class      | what | fix | recovery | code | context | trace | redaction | channel | Cap
amber guard (vitest)          | validation | gap→✓| gap→✓| N/A rerun| gap→✓| N/A    | N/A   | ✓         | ✓ exit≠0| CAP6:fix → none   (DX-2)
Default chroma contract       | validation | gap→✓| gap→✓| N/A      | gap→✓| gap→✓  | N/A   | ✓         | ✓       | CAP6:context→none (DX-3)
bare-:root token test         | validation | gap→✓| gap→✓| N/A      | gap→✓| gap→✓  | N/A   | ✓         | ✓       | CAP6:fix → none   (DX-4)
theme:check drift             | validation | part→✓| part→✓| part→✓ | none→✓| gap→✓ | N/A   | ✓         | ✓ throw | CAP6:context→none (DX-5)
generator bad seed / alias    | unexpected | ✗→✓  | ✗→✓ | ✗→✓      | ✗→✓  | ✗→✓    | cause | ✓         | exit 0→≠0| CAP4:channel→none (DX-6)
normalizeThemePreference      | input      | N/A (never throws; heal is logged in dev, DX-10)                                     | —
```

- Agent sees today: `expected [ ... ] to deeply equal []`.
- Corrected line: `THEME_AMBER_LITERAL apps/web/src/components/Foo.tsx:12 text-amber-600 → use text-primary (or text-muted-foreground); amber lives only in Warm Cathedral's base.css blocks (DESIGN.md#theme-system). Rerun: pnpm --filter @corelive/web exec vitest run src/lib/themes/no-hardcoded-amber.test.ts`.
- Safety model: all checks are read-only, and `theme:check` never writes. Debug mode: the dev logger at `debug`.

**Pass 4 — Documentation: 5/10 → 8/10.**

- Accepted:
  - DX-8 (recipe, explicit partial-guard limit, rule-8 wording that states the rule without implying a pending task)
  - DX-7 (mapping table in CHANGELOG + DESIGN.md, JSDoc examples, an English PR line)
  - DX-2 (allowlist entries as data with reasons, #214 linked)

**Pass 5 — Upgrade & Migration: 6/10 → 8/10.**

- Breaking change: `light`/`dark` keep their spelling but change palette, and `default-*` stop being `ThemeId`s.
- The mitigation is the alias map plus documentation (DX-7). The reset of an old Warm Cathedral pick is accepted and stated (CEO-11, T2/T4). No codemod: in-repo literals are swept by CEO-5 and checked by `pnpm typecheck`.

**Pass 6 — Dev Environment & Tooling: 6/10 → 8/10.**

- Verified the QA subcommands (above).
- Accepted DX-11 (full-frame extraction for the 200 ms crossfade, and the generic doc example corrected), plus the DX-1 checkpoints.
- Native ND16 / CLAUDE.md "resolve discovered TODOs in the current PR" reopens CEO V1 narrowly → **DX-9** (taste **T7**). The login window's pre-paint `backgroundColor` follows the OS. Editor and Settings windows stay transparent, which addresses Codex's CEO objection (vibrancy).
- Declined: per-family System (V5; not a defect, no promise in code). Hex/hsl/rgb parsing in the guard (T3 kept; the limit is documented, DX-8).

**Pass 7 — Community & Ecosystem: 6/10 → 6/10.**

- This is a private single-owner repo; the issues tracker and CLAUDE.md are the contribution channel. No issues found within scope.

**Pass 8 — DX Measurement: 3/10 → 7/10.**

- DX-12: one timed dry run of the 0C clock (plant `text-amber-600`, follow the guard message to green) recorded in the QA report.
- No telemetry and no recurring process: both are independent policies and not proposed.
- Boomerang: `/devex-review` can repeat the same dry run.

**Developer journey map.**

```
STAGE           | DEVELOPER (agent) DOES                                   | FRICTION POINTS                         | STATUS
1. Discover     | CLAUDE.md → DESIGN.md Theme System                        | docs said amber = default               | fixed (CEO-21, DES-7, DX-8)
2. Install      | pnpm install (mise-pinned Node)                           | none new                                | ok
3. Hello World  | token classes → view on Default/Warm Cathedral → pnpm test | silent amber; no recipe                 | fixed (DX-2, DX-8)
4. Real Usage   | read stored theme / add family via registry               | isThemeId vs normalize; two DEFAULT_*   | fixed (DX-7 JSDoc)
5. Debug        | guard / contract / bare-root / drift / generator errors    | raw diffs; malformed seed passes        | fixed (DX-2..DX-6)
6. Upgrade      | rename light/dark → Default; cathedral-*; default-* alias | mapping undocumented                    | fixed (DX-7)
```

**First-time developer report (0G, after the plan; grounded in DESIGN.md, registry.ts and the guard spec).**

```
Persona: AI coding agent   Attempting: theme-safe settings card
T+0:00  Reads CLAUDE.md → "Always read DESIGN.md"; opens Theme System. First line: Default is neutral; amber only inside Warm Cathedral.
T+0:40  Writes the card with text-amber-600 for an emphasis label (habit).
T+1:10  pnpm test fails: THEME_AMBER_LITERAL …:12 text-amber-600 → use text-primary … (DX-2). Addressed.
T+1:40  Swaps to text-primary; reruns the printed focused command → green.
T+2:30  No registry change, so no theme:generate needed (recipe step 3 says when). Done inside the Competitive target.
```

Before the plan, the same flow ends green with amber shipped, and the owner finds it.

**NOT in scope (DX).**

- Lint rule / editor hints (Champion tier would need new tooling).
- Telemetry.
- Per-family System (V5).
- Hex/hsl/rgb guard parsing (T3).
- Named flat-id constants.

**What already exists (DX).**

- `pnpm theme:generate`/`theme:check`, `generate-theme-css.test.ts`, `cathedral-css-snapshot.test.ts`, culori at build time.
- `apps/web/src/lib/logger.ts` (`log.debug`, development-only level).
- The `qa:browser` allow-list, the Settings fixture, and bounded sync retry.

**TODOS.md updates.** None. The project forbids TODOS.md; every finding is built here or declined above.

<!-- autoplan-accepted:dx -->

- DX-1: Precedence and order.
  - Precedence, highest first: DX items, then DES items (DES-1 is the final contract except where a DX item changes it), then the latest "restated"/"final" CEO clause, then earlier clauses. Explicit overrides: DX-9 replaces DES-1(d)'s "login window keeps `#ffffff`" clause; DX-8's rule-8 wording replaces CEO-21's. Items marked dropped are not built: CEO-18; CEO-19, except DX-9's login-window part; CEO-13's first drop is superseded by its restoration.
  - Implementation order, each step ending green:
    1. registry + its tests (`pnpm --filter @corelive/web exec vitest run src/lib/themes`)
    2. generator, `base.css` split and `apps/desktop/renderer/index.html` (`pnpm theme:generate && pnpm theme:check` + generator/snapshot tests)
    3. the CEO-5 id-literal sweep (`pnpm typecheck`)
    4. web readers: ThemeProvider, guard, `useThemeAxis`, DES-3/DES-4 picker, CEO-14 sync (their focused tests)
    5. desktop: NativeEditor and DX-9 (`pnpm test:electron`)
    6. DES-2 ribbon, Accent preset, comments, DESIGN.md (DES-7/DX-8), guard and contract tests (`pnpm test`)
    7. `pnpm validate`, then DES-5 headless QA
- DX-2: Amber guard diagnostics, in `apps/web/src/lib/themes/no-hardcoded-amber.test.ts`.
  - Format: every hit prints `THEME_AMBER_LITERAL <repo-relative path>:<line> <literal or class>`. A fix line follows, chosen by property context:
    - text/color → `text-primary` / `var(--primary)` or `text-muted-foreground`
    - background → `bg-primary`, `bg-muted` or `bg-card`
    - border/ring → `border-border` / `ring-ring`
  - Then "Warm Cathedral amber belongs only in its `base.css` `:root[data-theme='cathedral-*']` blocks (DESIGN.md#theme-system)" and the focused rerun command `pnpm --filter @corelive/web exec vitest run src/lib/themes/no-hardcoded-amber.test.ts`.
  - The assertion message is that text, not an array diff.
  - Allowlist: a data array of `{ path, reason, issue? }` in the same test file (e.g. `update-progress-window-html.ts`, reason "#214 themes this window", issue 214).
  - Test: the scanner, defined in the test file, reports these fields for an in-memory `oklch(0.56 0.16 50)` fixture and a `text-amber-600` fixture.
- DX-3: Default chroma contract diagnostics (CEO-20/DES-10).
  - A failure names: theme id, selector, token, actual value, measured chroma, limit `0.02`, and file `packages/live-editor/src/styles/generated.css`.
  - Recovery line: "edit the Default StaticTheme tokens in `packages/live-editor/src/themes/registry.ts` (never generated.css), then `pnpm theme:generate && pnpm theme:check`".
  - An absent or unparsable token is reported as its own message.
  - Test: an in-memory block with `--primary: oklch(0.6 0.15 55)` yields that message; a missing token yields the absent message.
- DX-4: Bare-`:root` test diagnostics (CEO-7).
  - A failure names: `base.css:<line>`, the declaration and selector, and the permitted bare declarations (`color-scheme`, `--radius`, `--control-border`).
  - Both ownership paths: a Warm Cathedral value belongs in `:root[data-theme='cathedral-*']`; a Default value belongs in the registry seed + `pnpm theme:generate`. Plus the DESIGN.md anchor.
  - Test: an in-memory `:root { --primary: … }` fixture yields that message.
- DX-5: `theme:check` drift (`apps/web/scripts/generate-theme-css.ts`).
  - The error names the output file `packages/live-editor/src/styles/generated.css`, the first differing line number, and the expected and actual lines (bounded to one line each).
  - Recovery: "from the repository root run `pnpm theme:generate`, review that file's diff, rerun `pnpm theme:check` and `pnpm test`, then commit".
  - The check stays read-only and exits non-zero.
  - `GENERATED_HEADER` says preserved themes live in `packages/live-editor/src/styles/base.css`.
  - Test: the exported drift-describer returns the line number and excerpts for two strings that differ on line 3.
- DX-6: Generator validation, before any write in both modes.
  - (a) Every `StaticTheme` token value and every derived value parses as a colour (culori) where the token is a colour. Otherwise it throws `THEME_INVALID_COLOR theme=<id> token=<token> value=<value> source=packages/live-editor/src/themes/registry.ts`.
  - (b) Every `LEGACY_THEME_ID_ALIASES` target is a registry id whose seed is emitted (not `preserve`). Otherwise it throws `THEME_ALIAS_TARGET alias=<alias> target=<target>`.
  - (c) `ladderColor` errors include theme id, mode and token.
  - Unexpected errors keep `cause`. The CLI exits non-zero and writes nothing.
  - Tests: `generateThemesCss` throws `THEME_INVALID_COLOR` for a static seed with `--primary: 'not-a-color'`, and `THEME_ALIAS_TARGET` for an alias pointing at `cathedral-light` or a missing id.
- DX-7: Migration docs and API JSDoc.
  - The `/ship` CHANGELOG entry and DESIGN.md's theme section carry the mapping:
    - `light`/`dark` = shadcn Default (was Warm Cathedral)
    - `cathedral-light`/`cathedral-dark` = Warm Cathedral (new)
    - `default-light`/`default-dark` = legacy aliases → `light`/`dark` (not `ThemeId`s)
    - unknown → System
  - Registry JSDoc carries `@example`s for `getThemeId('default','dark') // 'dark'`, `getThemeId('cathedral','dark') // 'cathedral-dark'`, `normalizeThemePreference('default-dark') // 'dark'` and `isThemeId('default-dark') // false`.
  - `DEFAULT_THEME_ID` and `DEFAULT_THEME_PREFERENCE` JSDoc cross-reference each other (`@see`) and say which one to use where.
  - The PR body carries an English line beside DES-8's Japanese note: "An old Warm Cathedral pick now shows Default; restore it in Settings → Appearance → Palette → Warm Cathedral."
- DX-8: DESIGN.md contributor recipe ("Theme-safe UI in three steps"), in the Theme System section:
  1. Use semantic token classes (`bg-background text-foreground`, `bg-primary text-primary-foreground`, `text-muted-foreground`, `border-border`), never a hue literal.
  2. View it on Default and Warm Cathedral (Settings fixture `apps/web/scripts/qa-settings` or `pnpm dev` → Settings → Appearance → Palette).
  3. Run `pnpm test`; only when the registry changed, also `pnpm theme:generate && pnpm theme:check`.
  - Expected result: neutral on Default light and dark.
  - The section states the guard's partial coverage (oklch + Tailwind `amber-` only).
  - Rule 8 reads "System follows the Default pair; other families are explicit Light/Dark (next-themes resolves System to the Default ids)", with no future-change clause.
- DX-9 (taste T7; narrow reopen of CEO-19 under the CLAUDE.md discovered-TODO rule):
  - The login window's pre-paint `backgroundColor` in `apps/desktop/electron/WindowManager.ts` is `#0a0a0a` (Default dark background, `oklch(0.145 0 0)`) when `nativeTheme.shouldUseDarkColors` is true, otherwise `#ffffff`.
  - Both values are named constants in the desktop constants module.
  - Editor and Settings windows stay transparent (unchanged).
  - Test: the login window is created with `#0a0a0a` under a dark `nativeTheme` mock and `#ffffff` under a light one.
  - QA limit: native pre-paint is not visible headless; the unit test is the evidence.
- DX-10: `ThemeAllowlistGuard` calls `log.debug` (`apps/web/src/lib/logger.ts`; the debug level is development-only) with the raw stored value and the healed value whenever it rewrites storage (legacy alias or unknown).
  - Test: healing `cathedral-lite` logs both `cathedral-lite` and `system`.
- DX-11: Motion evidence.
  - DES-5.6 extracts every recorded frame (`ffmpeg -i <video> -fps_mode passthrough <dir>/frame_%04d.png`).
  - Normal motion must show at least one intermediate frame between the endpoints; reduced motion must show none.
  - `docs/headless-development.md:92-93` changes its example from `fps=2` to the same full-frame extraction, with a note that `fps=2` misses transitions under 500 ms.
- DX-12: The QA report records one timed dry run of the 0C clock: plant `text-amber-600` in a scratch component, run the focused guard command, follow its message to green, then revert. It records the elapsed time (target ≤ 5 min) and whether the message alone was enough.
- DX-13: CEO-16/DES-11 extend to this phase. Every `Test:` clause in DX-2..DX-6, DX-9 and DX-10 ships; DX-11 and DX-12 appear in the QA report. None is optional.

<!-- /autoplan-accepted:dx -->

<!-- dx-implementation-tasks -->

## Implementation Tasks (DX)

Synthesized from this review's findings. Effort ratio assumption: tests/diagnostics ≈ 30–50x.

- [ ] **T1 (P1, human: ~2h / CC: ~15min)** — theme generator — seed/alias validation (CAP4) + drift diagnostics + header comment
  - Surfaced by: Pass 3: Codex CAP4 `generate-theme-css.ts:341,384`; CAP6 drift/alias/parser
  - Files: `apps/web/scripts/generate-theme-css.ts`, `apps/web/src/lib/themes/generate-theme-css.test.ts`
  - Verify: generator tests, `pnpm theme:check`
- [ ] **T2 (P1, human: ~1.5h / CC: ~10min)** — guard + contract tests — agent-ready diagnostics, allowlist as data
  - Surfaced by: Pass 3 CAP6 (both voices)
  - Files: `no-hardcoded-amber.test.ts`, CEO-20 contract test, `cathedral-css-snapshot.test.ts`
  - Verify: fixture-message tests green; planted literal prints the fix line
- [ ] **T3 (P1, human: ~1h / CC: ~10min)** — docs — DESIGN.md recipe + mapping table + rule 8 wording; registry JSDoc examples/@see; headless-development frame extraction
  - Surfaced by: Passes 1/4/5/6
  - Files: `DESIGN.md`, `packages/live-editor/src/themes/registry.ts`, `docs/headless-development.md`
  - Verify: docs read; `pnpm typecheck`
- [ ] **T4 (P1, human: ~1h / CC: ~10min)** — desktop — login window pre-paint background follows OS (T7)
  - Surfaced by: Pass 6 native ND16 + CLAUDE.md discovered-TODO rule
  - Files: `apps/desktop/electron/WindowManager.ts`, desktop constants, `WindowManager` test
  - Verify: `pnpm test:electron`
- [ ] **T5 (P2, human: ~30min / CC: ~5min)** — web guard — dev-only heal log
  - Surfaced by: Pass 3 native ND8
  - Files: `apps/web/src/providers/ThemeAllowlistGuard.tsx` + test
  - Verify: guard test
- [ ] **T6 (P1, human: ~1h / CC: ~10min)** — QA — full-frame motion evidence + timed TTHW dry run in the QA report
  - Surfaced by: Pass 6/8 (DX-11/DX-12)
  - Files: QA report
  - Verify: report shows intermediate frames and elapsed time

## DX Review Scorecard

```
+====================================================================+
|              DX PLAN REVIEW — SCORECARD                             |
+====================================================================+
| Dimension            | Score  | Prior  | Trend  |
|----------------------|--------|--------|--------|
| Getting Started      |  8/10  |  5/10  |  ↑     |
| API/CLI/SDK          |  8/10  |  7/10  |  ↑     |
| Error Messages       |  8/10  |  4/10  |  ↑ (CAP4 cleared) |
| Documentation        |  8/10  |  5/10  |  ↑     |
| Upgrade Path         |  8/10  |  6/10  |  ↑     |
| Dev Environment      |  8/10  |  6/10  |  ↑     |
| Community            |  6/10  |  6/10  |  =     |
| DX Measurement       |  7/10  |  3/10  |  ↑     |
+--------------------------------------------------------------------+
| TTHW                 | 2-5 min (target, estimated) | unbounded today |
| Competitive Rank     | Competitive                                  |
| Magical Moment       | designed via the amber guard's fix-line      |
| Product Type         | Library + build CLI (repo-internal)          |
| Mode                 | POLISH                                       |
| Overall DX           |  8/10  |  5/10  |  ↑ (mean 7.6 / 5.3) |
+====================================================================+
| DX PRINCIPLE COVERAGE                                               |
| Zero Friction      | covered (rule line + recipe)                   |
| Learn by Doing     | covered (recipe + focused rerun command)       |
| Fight Uncertainty  | covered (agent-ready diagnostics DX-2..DX-6)   |
| Opinionated + Escape Hatches | covered (Default + explicit families, custom hex) |
| Code in Context    | covered (JSDoc examples, token recipe)         |
| Magical Moments    | covered (guard fix line)                       |
| Agents Are Users   | covered (stable codes, non-interactive checks) |
+====================================================================+
```

Community stays at 6 for a private single-owner repo; every other dimension is 7 or higher. The plan has no critical DX debt.

```
DX IMPLEMENTATION CHECKLIST
============================
[ ] Time to hello world < 5 min (DX-12 timed dry run)
[x] Installation is one command (pnpm install; unchanged)
[ ] First run produces meaningful output (guard fix line, DX-2)
[ ] Magical moment delivered via the amber guard's fix line
[ ] Every error message meets the agent-ready error contract (DX-2..DX-6)
[ ] API naming guessable without docs (JSDoc examples, DX-7)
[x] Every parameter has a sensible default (fresh = system; unknown = system)
[ ] Docs have copy-paste examples that actually work (DX-8 recipe)
[ ] Upgrade path documented with mapping table (DX-7)
[x] TypeScript types included (ThemeId template type, CEO-15)
[x] Works in CI without special configuration (pnpm validate / theme:check)
[ ] Changelog entry carries the mapping (DX-7, written by /ship)
```

Unresolved Decisions: none open in this phase. Taste T7 (DX-9) is auto-decided and goes to the final gate with T1–T6.

## Eng Review (autoplan Phase 3)

### Eng Step 0 — Scope Challenge

Methodology read: `autoplan-eng-methodology-899qWD/methodology.md` ranges 1-600, 601-1200, 1201-1800, 1801-2110 of 2110 (EOF).

**A. What already solves each sub-problem.**

| Sub-problem | Existing code                                                                                                                | Reuse                                                                     |
| ----------- | ---------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------- |
| ids         | `registry.ts` `THEME_REGISTRY`/`ThemeId`/`getThemeId` (`:40-41,174,530-531`)                                                 | edit                                                                      |
| CSS         | `generate-theme-css.ts` `renderThemeBlock` (`:309-317`, selector built from `theme.id`) and `generateThemesCss` (`:362-371`) | extend: Default needs its own selector list + media block                 |
| ladder      | `CATHEDRAL` mirror keyed by mode (`:45`)                                                                                     | unchanged; values stay byte-identical, so derived families are unaffected |
| healing     | `ThemeAllowlistGuard.tsx:17-18` (rewrites to `DEFAULT_THEME_ID`)                                                             | edit to normalize                                                         |
| System      | next-themes `enableSystem` + `themes={THEME_IDS}` (`ThemeProvider.tsx:38-44`)                                                | reuse                                                                     |
| desktop     | `NativeEditor.tsx:43-58` (`system` branch), `:77-81` (pre-ready passes `DEFAULT_THEME_ID`)                                   | edit                                                                      |
| sync        | `offline-settings-sync.ts` `themeChanged`/bounded retry (`:179,204,354`)                                                     | add normalize                                                             |
| contrast    | `apps/web/src/lib/themes/contrast.ts`                                                                                        | reuse                                                                     |
| logger      | `apps/web/src/lib/logger.ts` `log.debug`                                                                                     | reuse                                                                     |

**Minimum change.** The id swap, CSS fallback and readers are one atomic contract. Every intermediate state (ids swapped but guard not normalizing, or CSS swapped but ids not) paints the wrong palette, so nothing core is deferrable. Diagnostics, docs and QA items are in scope by the earlier phases' accepted decisions.

**Complexity check.**

- Proposed changed files ≈ 40 [estimated: CEO-5 sweep list + DES/DX items, mostly tests and comments].
- New source files: `apps/web/src/lib/themes/no-hardcoded-amber.test.ts`, the CEO-20 contract test, and `apps/desktop/electron/constants.ts` (see E0-2).
- New classes/services: 0.
- 8+ files → the complexity gate trips.

**Search check.** No new architectural pattern, infrastructure or concurrency approach (next-themes System, CSS custom properties, culori at build time are all existing) [Layer 1].

**TODOS cross-reference.** No TODOS.md; the project forbids it.

**Completeness.** Full tests are already mandatory (CEO-16, DES-11, DX-13).

**Distribution.** No new artifact. The Electron release (CEO-22, DES-8) ships the editor renderer and the DX-9 main-process change through the existing `build-and-release.yml` tag flow.

**B. Complexity selectors (auto-decided).**

- Feature cuts: none proposed. Never-reduce override (P2); every item maps to an accepted CEO/DES/DX decision.
- Structure (`plan-eng-review-structure`): Original arrangement. One PR in the DX-1 order, ≈40 files, 0 new classes/services.
  - A smaller arrangement that splits PRs (registry+CSS first, readers later) cannot preserve the approved contract: the first PR alone flips `light` to Default while the guard and desktop still treat unknown/legacy values the old way.
  - Pending remedies not decided here: none.
- Scope record: feature answers: none (no cuts); structure: A (auto-decided, P5/P3); accepted scope: CEO + DES + DX accepted blocks; pending remedies: none.

**C. Findings.**

- E0-1 [INFORMATIONAL] (confidence 9/10) `apps/desktop/electron/` has no constants module (`ls apps/desktop/electron`: no `constants.ts`; `packages/desktop-contract/src/constants.ts` is the shared renderer/main contract). DX-9's "desktop constants module" therefore names a missing file.
  - Disposition: factual correction. The two login-window colours go in a new main-process `apps/desktop/electron/constants.ts`, colocated with `WindowManager.ts`, not in the shared contract (no renderer reader).
- E0-2 [INFORMATIONAL] (confidence 8/10) `package.json:110` `validate` runs `fallow:dead-code`/`fallow:dupes`. A new export whose only callers are tests would fail validate.
  - Disposition: routine. DX-5's drift describer is called by `--check` (production caller). DX-2/DX-3/DX-4 scanners and parsers stay inside their test files. `LEGACY_THEME_ID_ALIASES` has production callers (normalize, generator).
- E0-3 [INFORMATIONAL] (confidence 9/10) `generate-theme-css.ts:317` builds every selector as `:root[data-theme='${theme.id}']`. Default's `:root, :root[data-theme='light'], :root[data-theme='default-light']` list and the dark media block need a Default-specific emitter path, driven by `LEGACY_THEME_ID_ALIASES` (CEO-4) and `DEFAULT_THEME_ID`.
  - Disposition: implementation detail of CEO-2/CEO-7/CEO-17; no new choice.
- E0-4 [INFORMATIONAL] (confidence 9/10) Numbers [measured: culori, `apps/web/node_modules/culori`]:
  - `oklch(0.145 0 0)` = `#0a0a0a` (DX-9).
  - Default light `--primary` vs `--foreground` = 1.10:1, confirming DES-6's "reads close to body text".
  - CEO-13 contrast for `--primary` on background/card: Default light 17.91/17.91, Default dark 15.72/14.22, Warm Cathedral light 4.60/4.56, dark 6.82/5.98. All ≥ 4.5.
  - The Warm Cathedral light card margin is 0.06, so the test documents the byte-identical values rather than tuning them.
  - Chroma limit 0.02 and ribbon P = 10..90 are chosen bounds [estimated].

Scope Challenge result: **scope accepted as-is**.

REALITY: premise-table pass 8 CEO premises + 4 eng premises (generator mirror keyed by mode, selector from theme.id, guard heals to DEFAULT_THEME_ID, NativeEditor pre-ready passes DEFAULT_THEME_ID) unverified=0 apps/web/scripts/generate-theme-css.ts:317
REALITY: already-done pass git log origin/main --since=2026-11-01 over the touched paths shows only 4302821e (base.css transitions, PR #217) packages/live-editor/src/styles/base.css:194
REALITY: surface-check pass theme:generate, theme:check, test:electron, qa:offline-editor, typecheck, validate exist; qa:browser set-color-scheme/set-reduced-motion/run-code/eval/resize/localstorage-set in the allow-list package.json:110
REALITY: binding-decisions pass gstack-decision-search --scope branch --recent 50 returned none; CLAUDE.md owner rules (one pipeline per request, discovered TODOs fixed in-PR) honored CLAUDE.md:1
REALITY: numbers pass #0a0a0a, 1.10, 17.91, 15.72, 14.22, 4.60, 4.56, 6.82, 5.98 [measured: culori]; 0.02 and P=10..90 [estimated] packages/live-editor/src/themes/registry.ts:191
REALITY: deferred-asks pass issue #213 asks covered (Default applied, System follows Default, login neutral, amber wording to tokens, guard); update-download window is #214 by the issue's Related line docs/designs/default-theme-shadcn.md:49
REALITY: pr-count pass no .gstack/ship-policy.json, default one PR for this wave docs/designs/default-theme-shadcn.md:1

### Eng dual voices (snapshot `17c8002e…`)

**Claude subagent (native, in-host, completed; INPUT hash matches):** the core design is sound.

- High 1: the seeded desktop `light` defeats none→system.
- Medium-High 2: web/editor version skew.
- Medium:
  - 3: pre-ready Default flash for non-Default users
  - 4: cut DX-5/DX-6/DX-12/DES-4/DES-9 as scope creep
  - 5: collapse the clause stack into one spec
  - 6: echo flag brittle
  - 7: non-Default generated blocks must stay byte-identical, and `color-scheme` must be on dark/alias/media blocks
- Low-Medium:
  - 8: `#0a0a0a` duplicated; OS-dark flash for an explicit light pick
  - 9: guard is a heuristic; do a one-off `rg` audit
- Low 10: server schema / Redux theme storage / DX-1 steps 1-3 cannot end green separately.

**Codex (outside, `gpt-6-astra`, completed, `OUTSIDE_STATUS: completed`):**

- Medium:
  - Default dark `--sidebar-primary: oklch(0.488 0.243 264.376)` (`registry.ts:264`) contradicts CEO-20's chroma ≤ 0.02.
  - Selector lists and the media block break dslint extraction (`css-parser.ts:92-124`, `sync.ts:101-104`).
  - A superseded `applyingTheme` marker survives a different observation (`offline-settings-sync.ts:179-187,575-577`).
  - Mixed-version / stale-window / rollback / manual-download (`AutoUpdater.ts:148`) window.
  - Reduced-motion criterion vs `transition-all` on renderer controls (`button.tsx:8-19`, `styles.css:40-46`).
- Low: `useThemeAxis` must use `systemTheme`, not `resolvedTheme`, when an unknown raw value normalizes to System (next-themes `resolvedTheme` echoes a non-`system` raw value).

```
ENG DUAL VOICES — CONSENSUS TABLE:
  Dimension                           Claude   Codex    Consensus
  1. Architecture sound?               YES*     YES*     CONFIRMED (*with fixes: dslint layout, sidebar exemption)
  2. Test coverage sufficient?         NO       NO       CONFIRMED gap (seed, echo sequences, unknown-on-dark-OS, color-scheme, tooling)
  3. Perf risks + budget/bench named?  silent   silent   CONFIRMED no hot path (client string normalize, ~6 extra CSS blocks)
  4. Security threats covered?         YES      silent   Claude only (no new surface; theme string bounded by schema max 50)
  5. Error paths handled?              NO       NO       CONFIRMED (echo marker, unknown resolution)
  6. Deployment risk manageable?       PARTIAL  NO       DISAGREE in remedy → taste T9 (accepted degradation vs compat strategy)
Single-voice critical findings: none.
```

**Evidence for the voices' claims:**

- Native 1 is partly refuted. `prepare` seeds `theme: this.theme!` (`offline-settings-sync.ts:412`), the web's current value, so with `defaultTheme='system'` a fresh workspace stores `system`. Existing workspaces keep the old seeded `light`, which reads as Default light: CEO-11 / taste T2, accepted.
- Codex sidebar: confirmed (`registry.ts:264`).
- dslint: confirmed. The parser's own contract comment forbids selector lists (`css-parser.ts:92-98`), and `:root:not([data-theme])` declarations stay `base`.
- Echo marker: confirmed. `themeChanged` clears `applyingTheme` only on an equal observation (`:181`); this is a pre-existing defect.
- Native 10:
  - No server/oRPC theme validation; the contract is `theme: z.string().min(1).max(50)` (`packages/desktop-contract/src/offline-workspace.ts:137,257`).
  - Redux stores no theme. `settingsSlice.ts` holds only the editor text colour, and `persistedUserSettingsSurviveAppUpdate.test.ts:77,112` checks the next-themes key only.

### Section 1 — Architecture

```
 registry.ts ─ THEME_REGISTRY{light,dark (Default) │ cathedral-* (preserve) │ colored-*}
   │  DEFAULT_THEME_ID='light' · DEFAULT_THEME_PREFERENCE='system'
   │  LEGACY_THEME_ID_ALIASES{default-light→light, default-dark→dark} · normalizeThemePreference()
   ├─► generate-theme-css.ts ──validate(DX-6)──► generated.css
   │       Default: :root{} · [light]{} · [default-light]{} · [dark]{} · [default-dark]{} · @media dark :root:not([data-theme]){}
   │       colored: [x-light]{} [x-dark]{} (byte-identical) ── CATHEDRAL mirror (unchanged ladder)
   │                         └──► dslint css-parser (ignores @media; :root/[light] → 'light')
   ├─► web  ThemeProvider(defaultTheme=system) → next-themes script → <html data-theme>
   │        ThemeAllowlistGuard(normalize → setTheme, log.debug) · useThemeAxis(normalize; systemTheme for unknown)
   │        OfflinePreferenceSync(normalize; marker expires on first observation) ⇄ IPC ⇄ workspace.preferences.theme
   ├─► desktop renderer NativeEditor(normalize; pre-ready=system) → <html data-theme>
   └─► desktop main WindowManager login window backgroundColor(nativeTheme) ← electron/constants.ts
 base.css: :root{color-scheme,--radius} · :root[cathedral-light]{} · :root[cathedral-dark]{} · :root{--control-border}
```

- Coupling: the generator reads the alias map (single source).
- Security: no new surface. Only registry ids or `system` reach `data-theme`.
- Production failure per new path:
  - stale old window rewrites `cathedral-*` (T9, accepted + recovery)
  - malformed seed (DX-6 blocks the build)
  - dslint mis-tag (ENG-2 integration test)
- Distribution: no new artifact; the existing tag release.
- Design-twice: no new module or public boundary (registry functions extend an existing module); not applicable.
- Red flags:
  - (8) hand-synced list: `#0a0a0a` vs the registry value → ENG-9e pins it.
  - (6) two ways to resolve a stored theme → one normalizer for four readers (CEO-4).
  - None else.

Findings:

- [INFORMATIONAL] (9/10) `packages/eslint-plugin-dslint/src/cli/css-parser.ts:92-98` — "NOT a combined `:root, [data-theme='x']` selector list". The plan's selector lists violate it → ENG-2.
- [INFORMATIONAL] (9/10) `packages/live-editor/src/themes/registry.ts:264` — `'--sidebar-primary': 'oklch(0.488 0.243 264.376)'` conflicts with CEO-20 → ENG-5.

Dispositions: both accepted (ENG-2, ENG-5), auto-decided P1/P5.

### Section 2 — Code quality

- [INFORMATIONAL] (9/10) `apps/web/src/lib/offline-settings-sync.ts:181` — `if (theme === this.applyingTheme) this.applyingTheme = undefined`. The marker survives a different observation, so a later identical user pick is swallowed → ENG-3 (discovered defect, fixed in this PR).
- [INFORMATIONAL] (8/10) `apps/web/src/hooks/useThemeAxis.ts` — `const rawActiveId = isSystem ? resolvedTheme : theme`. For an unknown raw value normalized to System, `resolvedTheme` is the raw value (next-themes `resolvedTheme = theme === 'system' ? systemTheme : theme`) → ENG-4.
- Spec sprawl (native 5): DX-1 already sets precedence. ENG-1 adds the consolidated build list the implementer follows.

Dispositions: ENG-3, ENG-4 and ENG-1 accepted (P5).

### Section 3 — Test review

Framework: vitest (web `apps/web`, desktop `pnpm test:electron`, packages `pnpm test:packages`). There is no Playwright E2E suite (removed 2026-08-27), and headless QA covers flows.

```
CODE PATHS                                                  USER FLOWS
[+] registry.ts                                             [+] Fresh install
  ├── normalizeThemePreference  [GAP→planned ★★★ table CEO-3]   ├── [GAP→QA DES-5.1] web/login neutral, light & dark OS
  ├── getThemeId default/cathedral [★★ registry.test → rewrite]  └── [GAP→unit ENG-9a] prepare seeds system
  └── LEGACY aliases            [GAP→planned CEO-4]           [+] Pick Warm Cathedral → Default → System
[+] generate-theme-css.ts                                         ├── [GAP→unit CEO-6 table] transitions
  ├── Default 6 blocks + color-scheme [GAP→ENG-2]                 └── [GAP→QA DES-5.4/5.5] widths, keyboard
  ├── validate seed/alias       [GAP→DX-6]                    [+] Legacy/unknown stored value
  └── --check drift describer   [GAP→DX-5]                        ├── [GAP→QA DES-5.3] default-dark rewrite, no colour change
[+] dslint css-parser @media / blocks [GAP→ENG-2 integration]     └── [GAP→unit ENG-4] unknown on dark OS before repair
[+] ThemeAllowlistGuard heal + log [★★ guard.test → extend DX-10] [+] Sync races
[+] useThemeAxis transitions    [★★ existing → extend CEO-6/ENG-4]├── [GAP→unit CEO-14] normalization-only, zero pushes
[+] OfflinePreferenceSync       [★★ existing → extend CEO-14/ENG-3]└── [GAP→unit ENG-3] superseded echo then same pick
[+] NativeEditor pre-ready/system/stored [★★ existing → extend CEO-1/3]
[+] WindowManager login bg      [GAP→unit DX-9 + ENG-9e]      [+] Editor first frames
[+] LoginShell ribbon tokens    [GAP→unit DES-2]                  ├── [GAP→QA CEO-17] dark OS first frame
[+] ThemeSelector helper / menu radios [GAP→unit DES-3/DES-4]     └── [GAP→QA ENG-8] cathedral-light frames counted
[+] amber guard / chroma / bare-:root contracts [GAP→DX-2..4, CEO-20/ENG-5]
COVERAGE (planned): every new branch has a named test or QA row; existing ★★ suites extended, none retired.
```

Regression rule: existing behaviour at risk is covered as follows.

- Colored-family output → ENG-9c, a ship-time `generated.css` diff restricted to the Default/alias/media blocks.
- Cathedral palette bytes → the CEO-7 snapshot.
- Sync revision rules → the existing suites stay green.

Test plan artifact: `~/.gstack/projects/laststance-corelive/ryotamurakami-fix-213-default-theme-shadcn-eng-review-test-plan-20261102-202816.md`.

Dispositions: all gaps accepted as planned tests (ENG-9, ENG-11).

### Section 4 — Performance

- Client: one string normalize per theme read, and one more `log.debug` call (development level only).
- CSS: Default grows from 2 to 6 blocks, ≈ +160 lines [estimated], parsed once per page.
- Build: culori validation runs per seed at build time only.
- No hot path, loop or query. No issues found.

### Failure modes

```
 CODEPATH                    | FAILURE                                   | TEST/HANDLING            | USER SEES            | CRITICAL?
 web first paint             | legacy default-dark stored                | CEO-2 + DES-5.3          | Default dark         | no
 picker                      | unknown stored id, dark OS                | ENG-4 test               | System / Default dark| no
 sync                        | superseded native echo                    | ENG-3 test               | their last pick      | no
 generator                   | malformed seed / alias                    | DX-6 THEME_* error       | build fails (dev)    | no
 dslint sync                 | mis-tagged dark tokens                    | ENG-2 integration test   | nothing (CI)         | no
 old installed editor        | cathedral-* unknown to old build          | none (T9, accepted)      | old default until update | no (stated, recovery documented)
 stale old web window        | rewrites cathedral-* to light             | none (T9, accepted)      | Default; re-pick     | no (stated, recovery documented)
 desktop pre-ready           | non-Default theme paints Default briefly  | ENG-8 QA frame count     | short Default paint  | no (accepted T8)
```

Critical gaps: 0. The two "none" rows are visible, recoverable and documented, not silent.

### NOT in scope (Eng)

- Compatibility release or versioned persistence for mixed versions. CLAUDE.md "Production Status" says no compat shims for a single pre-release user (T9).
- localStorage mirror plus inline script for the editor's pre-ready theme (T8).
- Native 4's cuts. Declined under the never-reduce override (P2): DX-6 closes a CAP4, DES-4 is an a11y defect, DES-9 a wrong comment, DX-5/DX-12 accepted DX work.
- One-off warm hex/hsl/rgb audit (native 9). Cut by CEO V1; superseded by DES-5.1's rendered-element check.

### What already exists (Eng)

- next-themes System and its storage listener.
- Registry single source and generator + `theme:check`.
- The CATHEDRAL ladder mirror.
- ThemeAllowlistGuard, NativeEditor `system` branch, OfflinePreferenceSync bounded retry.
- The contrast helper, web logger, and dslint parser/sync.
- WindowManager login window options, AutoUpdater (manual download), and the tag release workflow.

### Worktree parallelization

Sequential implementation, no parallelization opportunity. One contract spans registry → generator → readers; the later lanes depend on the `ThemeId` change.

### TODOS.md updates

None proposed. The project forbids TODOS.md, and every finding is built in this PR or declined above. Prior phases left no deferred expansions except #214/#215/#216, which are today's next pipelines, not TODOs.

<!-- autoplan-accepted:eng -->

- ENG-1: Build list. Implement exactly these items, in DX-1 order:
  - Decisions 1–6.
  - CEO-1..CEO-17 at their latest restated/final wording, plus CEO-20..CEO-22 and X1/CEO-9 (final).
  - DES-1..DES-11 and DX-1..DX-13.
  - ENG-2..ENG-11, which win over earlier wording where they differ (precedence ENG > DX > DES > CEO).
  - Not built: CEO-18, CEO-19 (except the DX-9 login window), the first CEO-13 drop.
- ENG-2: Generator layout that honours the dslint parser contract (`packages/eslint-plugin-dslint/src/cli/css-parser.ts:92-98`).
  - Default is emitted as separate blocks, never selector lists: `:root {…}`, `:root[data-theme='light'] {…}`, `:root[data-theme='default-light'] {…}`, `:root[data-theme='dark'] {…}`, `:root[data-theme='default-dark'] {…}`, and `@media (prefers-color-scheme: dark) { :root:not([data-theme]) {…} }`.
  - Every dark block declares `color-scheme: dark`.
  - This supersedes the selector-list wording in Decision 3, CEO-2, CEO-7 and E0-3.
  - `css-parser.ts` skips declarations inside `@media` blocks (brace-matched).
  - Tests:
    - The generator output contains exactly those six Default blocks, each with the expected `color-scheme`.
    - A dslint integration test parses the real `generated.css` + `base.css` and asserts the `light`-tagged tokens equal the Default light seed, and that no Default-dark value is tagged `light` or `base`.
- ENG-3: Echo suppression in `OfflinePreferenceSync.themeChanged`.
  - The `applyingTheme` marker expires on the first observation after an apply. An equal observation is the echo and is not dirty. A different observation clears the marker and is treated as a user change.
  - Comparisons use normalized values.
  - Test: native `dark` is applied; the web observes `harbor-light` (a user pick) before the echo, then the user picks `dark`. `dark` is pushed.
- ENG-4: In `useThemeAxis`, when the raw stored value is not `system` but normalizes to `system` (unknown), `activeId` uses next-themes `systemTheme` (the OS mode), not `resolvedTheme`. Unmounted behaviour is unchanged.
  - Test: raw `cathedral-lite` on a dark OS → `isSystem` true and `activeId` `dark`, before the guard repairs storage.
- ENG-5: CEO-20 amendment.
  - The chroma ≤ 0.02 contract exempts Default dark `--sidebar-primary` (stock shadcn `oklch(0.488 0.243 264.376)`, blue hue 264). It is kept verbatim per the owner's "stock shadcn Default", and the test lists the exemption with that reason.
  - Plus a no-warm assertion: no Default token outside `--hm-*`/`--chart-*` has hue 30–80 with chroma ≥ 0.1.
  - Tests: both assertions green on the branch; a planted warm `--accent` fails the no-warm assertion.
- ENG-6: The reduced-motion criterion (DES-5.6/DX-11) is refined.
  - Under reduced motion, the global crossfade on page/editor background and surfaces (`theme-transition`) shows no intermediate frames.
  - Component-level colour transitions (`packages/live-editor/src/ui/button.tsx` `transition-all`) are colour-only, pre-existing, and outside this assertion. The QA report states this.
- ENG-7 (taste T9): The deploy-skew window is an accepted degradation per CLAUDE.md "Production Status" (no compat shims). The PR body and owner report state:
  - (a) Until the app updates, the installed editor shows its old default for `cathedral-*` and Warm Cathedral for `light`. Download is manual (`apps/desktop/electron/AutoUpdater.ts:148`).
  - (b) An already-open old web window may rewrite a new `cathedral-*` pick to `light`. Recovery: reopen the Settings and login windows after the deploy, and re-pick Warm Cathedral.
  - (c) If the release run fails, rerun the failed `build-and-release.yml` job; the web stays deployed.
  - (d) Rollback: revert and redeploy; stored `cathedral-*` values then heal to the old `light` (= Warm Cathedral).
- ENG-8 (taste T8): The brief Default paint before the workspace is ready, for non-Default themes, is accepted (local workspace read). DES-5 adds a desktop-fixture recording with stored `cathedral-light`, and the report counts the Default frames before the stored theme applies.
- ENG-9: Additional tests.
  - (a) `prepare` seeds `system` when the web theme is `system` (offline-settings-sync test).
  - (b) The existing native-vs-web apply rule is preserved: native `system` with web `light`/`dark`, and the reverse, where the native value applies when the web is not dirty.
  - (c) A ship-time check: `git diff origin/main -- packages/live-editor/src/styles/generated.css` changes only the Default, alias and media blocks. Recorded in the QA report.
  - (d) The `color-scheme` assertions in ENG-2.
  - (e) A web theme test asserts that Default dark `--background` from the registry formats to `#0a0a0a` (culori). Its failure message names `apps/desktop/electron/constants.ts`.
- ENG-10: DX-1 amendment. Steps 1–3 land as one unit; `pnpm typecheck` goes green at the end of step 3, not after each step.
- ENG-11: CEO-16/DES-11/DX-13 extend to this phase. Every `Test:`/`Tests:` clause in ENG-2..ENG-5 and ENG-9 ships; ENG-8 and ENG-9c appear in the QA report. None is optional.

<!-- /autoplan-accepted:eng -->

<!-- eng-implementation-tasks -->

## Implementation Tasks (Eng)

Synthesized from this review's findings. Effort ratio assumption: bug fix with regression ≈ 20x, tests ≈ 50x.

- [ ] **T1 (P1, human: ~2h / CC: ~15min)** — generator + dslint — six separate Default blocks with color-scheme; parser skips @media; integration test
  - Surfaced by: Section 1, Codex dslint (`css-parser.ts:92-124`)
  - Files: `apps/web/scripts/generate-theme-css.ts`, `packages/eslint-plugin-dslint/src/cli/css-parser.ts`, dslint tests
  - Verify: `pnpm theme:check`, `pnpm test:packages`
- [ ] **T2 (P1, human: ~1.5h / CC: ~10min)** — sync — expire superseded echo markers
  - Surfaced by: Section 2, `offline-settings-sync.ts:181`
  - Files: `apps/web/src/lib/offline-settings-sync.ts` + test
  - Verify: superseded-echo test
- [ ] **T3 (P1, human: ~1h / CC: ~10min)** — picker — systemTheme for unknown values
  - Surfaced by: Section 2, Codex Low
  - Files: `apps/web/src/hooks/useThemeAxis.ts` + test
  - Verify: unknown-on-dark-OS test
- [ ] **T4 (P1, human: ~30min / CC: ~5min)** — contract — sidebar-primary exemption + no-warm assertion
  - Surfaced by: Section 1, `registry.ts:264`
  - Files: theme contract test
  - Verify: `pnpm test`
- [ ] **T5 (P2, human: ~1h / CC: ~10min)** — tests — seed system, apply rules, #0a0a0a pin, generated.css diff check
  - Surfaced by: Section 3 (ENG-9)
  - Files: offline-settings-sync test, theme tests, QA report
  - Verify: `pnpm test`, QA report
- [ ] **T6 (P2, human: ~30min / CC: ~5min)** — release notes — skew degradation + recovery steps (T9) in the PR body and owner report
  - Surfaced by: Codex / native deploy findings
  - Files: PR body
  - Verify: PR body contains ENG-7 (a)-(d)

## Eng Completion Summary

- Step 0: Scope Challenge — scope accepted as-is
- Reality rows: 7/7 applicable rows emitted, 0 unverified premises
- Architecture Review: 2 issues found (dslint layout, sidebar contract)
- Code Quality Review: 2 issues found (echo marker, unknown resolution)
- Test Review: diagram produced, 18 gaps identified (all planned)
- Performance Review: 0 issues found
- NOT in scope: written
- What already exists: written
- TODOS.md updates: 0 items proposed (project forbids TODOS.md)
- Failure modes: 0 critical gaps flagged
- Unresolved decisions: 0 in this review (taste T8/T9 auto-decided → final gate)
- Outside voice: codex `gpt-6-astra` completed (5 Medium, 1 Low)
- Parallelization: 1 lane, 0 parallel / 1 sequential
- Lake Score: N/A (no completeness-scored questions; autoplan auto-decisions)

<!-- AUTONOMOUS DECISION LOG -->

## Decision Audit Trail

| #   | Phase  | Decision                                              | Classification | Principle                   | Rationale                                                                  | Rejected                                   |
| --- | ------ | ----------------------------------------------------- | -------------- | --------------------------- | -------------------------------------------------------------------------- | ------------------------------------------ |
| 1   | CEO    | Approach A: swap ids (Default owns light/dark)        | Mechanical     | P1/P5                       | only option reusing next-themes System with no second pre-hydration script | B custom resolver; C next-themes value map |
| 2   | CEO    | Mode SELECTIVE EXPANSION                              | Mechanical     | autoplan override           | hold the issue's scope, cherry-pick in-radius additions                    | EXPANSION/HOLD                             |
| 3   | CEO    | CEO-1 fresh state = System                            | Mechanical     | P1                          | issue #213 acceptance bullet asks for OS-following Default                 | fresh = Default light                      |
| 4   | CEO    | X1 amber guard accepted                               | Mechanical     | P1                          | the issue's own acceptance line; owner corrected this repeatedly           | no guard                                   |
| 5   | CEO    | X2 '(recommended)' marker skipped                     | Mechanical     | P8 subtraction              | Default is already first and named Default                                 | marker                                     |
| 6   | CEO    | X3 reset button skipped                               | Mechanical     | P3                          | not requested; one click today                                             | reset button                               |
| 7   | CEO    | X4 versioned migration skipped                        | Mechanical     | P3/P5                       | single pre-release user; needs pre-hydration script + two stores           | migration                                  |
| 8   | CEO    | X5 update window deferred to #214                     | Mechanical     | owner rule                  | separate issue/pipeline by owner instruction                               | fold in                                    |
| 9   | CEO    | Spec-loop cap reached; 14 fixes not re-verified       | Mechanical     | P6                          | three-launch cap; later phases review the amended plan                     | fourth launch                              |
| 10  | CEO    | V1 cut CEO-18/CEO-19                                  | Mechanical     | P3                          | both voices: oversized                                                     | keep                                       |
| 11  | CEO    | V2 add CEO-20 applied-palette contract                | Mechanical     | P1                          | guarantee that Default is neutral                                          | literal guard only                         |
| 12  | CEO    | T1 Default keeps warm heatmap                         | Taste          | P5                          | DESIGN.md heatmap invariant; content colour                                | neutral heatmap                            |
| 13  | CEO    | T2 old light/dark read as Default                     | Taste          | P3                          | seed indistinguishable from pick (offline-settings-sync.ts:412)            | migrate to cathedral-*                     |
| 14  | CEO    | T3 keep narrow partial guard                          | Taste          | P1/P5                       | issue acceptance; honest title                                             | promote or demote                          |
| 15  | CEO    | V6 skew handled by same-day release                   | Mechanical     | P6                          | editor renderer ships with Electron only                                   | code shim                                  |
| 16  | CEO    | V7 unknown ids heal to system                         | Mechanical     | P3                          | existing guard behaviour; stale tab is the only writer                     | alias-only                                 |
| 17  | Design | DES-1 final contract table                            | Mechanical     | P5                          | consolidates restated clauses                                              | leave scattered                            |
| 18  | Design | T6 login ribbon on chrome tokens (DES-2)              | Taste          | P1/P5                       | owner's complaint screen; decoration is chrome                             | keep --hm-* ribbon                         |
| 19  | Design | T5 helper line, keep Mode-first order (DES-3)         | Taste          | P5 + scope                  | explains System rule without reorder                                       | reorder / disabled System                  |
| 20  | Design | T4 no in-app reset toast                              | Taste          | P3                          | single user who asked for Default; handoff note instead                    | persisted toast                            |
| 21  | Design | DES-4 menu radio semantics                            | Mechanical     | P1 + CLAUDE.md              | discovered a11y defect in a touched file                                   | leave                                      |
| 22  | Design | DES-6 Accent keeps var(--primary)                     | Mechanical     | P5 + owner rule             | a fixed hue would hard-code colour on Default                              | fixed hue                                  |
| 23  | Design | DES-7 full DESIGN.md sweep                            | Mechanical     | P1                          | stale default wording beyond Decision 6                                    | partial sweep                              |
| 24  | DX     | Persona = AI coding agent; target Competitive 2-5 min | Mechanical     | P6/P5                       | agents author the repo; Champion needs new tooling                         | human dev; Champion                        |
| 25  | DX     | DX-6 generator validation (CAP4)                      | Mechanical     | P1                          | malformed seed reported as success (generate-theme-css.ts:341,384)         | leave                                      |
| 26  | DX     | DX-2..DX-5 agent-ready diagnostics                    | Mechanical     | P1                          | both voices CAP6                                                           | raw diffs                                  |
| 27  | DX     | T7 login window pre-paint follows OS (DX-9)           | Taste          | CLAUDE.md discovered-TODO   | scope-only objections do not postpone a discovered defect                  | keep #ffffff                               |
| 28  | DX     | DX-10 dev-only heal log                               | Mechanical     | P1                          | silent heal of mistyped ids                                                | no log                                     |
| 29  | DX     | DX-11 full-frame extraction + doc fix                 | Mechanical     | P1                          | fps=2 misses 200 ms                                                        | sampled frames                             |
| 30  | Eng    | Structure: original arrangement, one PR               | Mechanical     | P5/P3                       | splitting leaves a broken intermediate contract                            | split PRs                                  |
| 31  | Eng    | Native cuts (DX-5/6/12, DES-4/9) declined             | Mechanical     | P2 never-reduce             | DX-6 closes CAP4; DES-4 a11y defect                                        | cut                                        |
| 32  | Eng    | ENG-2 separate Default blocks + dslint @media skip    | Mechanical     | P5                          | honours css-parser.ts:92-98 contract                                       | selector lists                             |
| 33  | Eng    | ENG-3 echo marker expiry                              | Mechanical     | P1                          | pre-existing defect offline-settings-sync.ts:181                           | leave                                      |
| 34  | Eng    | ENG-4 systemTheme for unknown values                  | Mechanical     | P1                          | next-themes resolvedTheme echoes raw value                                 | resolvedTheme                              |
| 35  | Eng    | ENG-5 sidebar-primary exemption + no-warm check       | Mechanical     | P5 + owner intent           | stock shadcn value kept verbatim                                           | edit stock token                           |
| 36  | Eng    | ENG-6 reduced-motion criterion refined                | Mechanical     | P5                          | colour fades are not motion; criterion over-specified                      | global transition kill                     |
| 37  | Eng    | T8 accept editor pre-ready Default paint              | Taste          | P3                          | local workspace read; mirror needs inline script                           | localStorage mirror                        |
| 38  | Eng    | T9 skew = accepted degradation + recovery             | Taste          | CLAUDE.md Production Status | no compat shims for a single pre-release user                              | compat release / versioned persistence     |

## GSTACK REVIEW REPORT

| Review         | Trigger                               | Why                             | Runs | Status                                                                          | Findings                                                            |
| -------------- | ------------------------------------- | ------------------------------- | ---- | ------------------------------------------------------------------------------- | ------------------------------------------------------------------- |
| CEO Review     | `/plan-ceo-review` (via /autoplan)    | Scope & strategy                | 1    | issues resolved (log written at the final gate)                                 | 6 proposals, 2 accepted, 4 skipped/deferred                         |
| Outside Review | codex (`codex exec`, per phase)       | Independent 2nd opinion         | 4    | CEO: completed; design: unavailable (unverified); DX: completed; eng: completed | CEO 4; design 8 (data only); DX 9 (1 CAP4); eng 6 (5 Medium, 1 Low) |
| Eng Review     | `/plan-eng-review` (via /autoplan)    | Architecture & tests (required) | 1    | issues_open (all mapped to accepted ENG items; log at the final gate)           | 22 issues, 0 critical gaps                                          |
| Design Review  | `/plan-design-review` (via /autoplan) | UI/UX gaps                      | 1    | clean (8+, 0 unresolved)                                                        | score: 5/10 → 8/10, 10 decisions                                    |
| DX Review      | `/plan-devex-review` (via /autoplan)  | Developer experience gaps       | 1    | clean (overall 8, 0 unresolved)                                                 | score: 5/10 → 8/10, TTHW: unbounded → 2-5 min                       |

- **OUTSIDE COVERAGE:** codex `gpt-6-astra`.
  - CEO: completed.
  - Design: ran, but the parser marked it `unverified` (no severity tags) → missing coverage.
  - DX: completed (1 Critical CAP4, 5 High, 3 Medium).
  - Eng: completed (5 Medium, 1 Low).
- **CROSS-MODEL:** native Claude subagent + completed codex for CEO, DX and Eng.
  - Eng overlap: test gaps, error paths (echo), deploy skew.
  - Codex alone: the sidebar-primary contract conflict, the dslint parser contract, and the `systemTheme` resolution, all verified in source.
  - Native alone: the pre-ready flash (T8) and scope cuts (declined, P2).
- **VERDICT:** CEO + DESIGN + DX CLEARED; ENG reviewed with every finding mapped to accepted ENG-1..ENG-11 (status issues_open by the log rule, counted findings); ready for the /autoplan final gate.

NO UNRESOLVED DECISIONS
