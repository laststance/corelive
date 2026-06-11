# Theme system reference

A point-to-source surface map for CoreLive's theme system: 12 themes (Warm Cathedral light/dark default + 5 colored families × light/dark) derived from a single TypeScript registry into static CSS at build time, plus the heatmap intensity SSoT. The authoritative _why_ lives in [`DESIGN.md`](../../DESIGN.md) ("Theme System" and "Heatmap Invariance Rule"). This file is the _what / where_.

> **Volatility note.** This repo reshapes schemas and seed values freely (no migrations kept). Per-theme OKLCH seeds, the ~36 token names, and exact contrast ratios are deliberately **not** transcribed here — they rot on the next theme tweak. Each surface is named and anchored to `file:line`; open the source for current shapes.

## Cross-cutting invariants

These rules govern the whole surface. Most are CI-enforced.

| Invariant                                                                                                                                                                                                                                                                           | Where it lives / is enforced                                                                                               |
| ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| **Registry is the single source of truth.** Add a theme by appending a `ThemeFamilyId` + a light/dark seed to `THEME_REGISTRY` — never in `globals.css`, the provider, or the picker. `THEME_IDS`, `THEME_META`, `THEME_FAMILY_IDS`, and `useThemeAxis` all derive from it.         | `src/lib/themes/registry.ts:94` (`satisfies Record<ThemeId, ThemeSeed>` at `:290`)                                         |
| **Cathedral is never machine-generated.** The generator skips every `preserve: true` theme; the brand stays hand-authored in `globals.css` and is pinned byte-for-byte by a snapshot test (so the `CATHEDRAL` mirror in the generator cannot drift).                                | generator filter `!theme.preserve` at `scripts/generate-theme-css.ts:329`; `src/lib/themes/cathedral-css-snapshot.test.ts` |
| **Derived blocks use `:root[data-theme='id']` (specificity `0,2,0`).** This outranks cathedral's `:root` (`0,1,0`) regardless of `@import` order. A bare `[data-theme]` (`0,1,0`) would tie and lose.                                                                               | emitted at `scripts/generate-theme-css.ts:303`; asserted `generate-theme-css.test.ts:196`                                  |
| **Tailwind `dark:` is bound to `data-theme`, not the OS.** `@custom-variant dark` keys off `[data-theme$=dark]`, matching the flat `dark` id **and** every `*-dark` id, mirroring `getThemeMode()`. `:where()` keeps specificity at 0.                                              | `src/globals.css:20`; mirrored in charts at `src/components/ui/chart.tsx:33`                                               |
| **`culori` (OKLCH/WCAG math) is build/test-only.** It is a `devDependency`; importing it at runtime would pull color math back into the client bundle, which the static-CSS architecture exists to prevent. The runtime picker preview re-derives swatches without it.              | `src/lib/themes/contrast.ts:10` and `scripts/generate-theme-css.ts:22` import it; `src/lib/themes/preview.ts` does **not** |
| **Heatmap temperature = pride.** The two hottest stops (`--hm-3`, `--hm-4`) must have hue ∈ `[20, 70]` on **every** derived theme — never GitHub-green. This is the only seed-controlled heatmap axis (L/C are reused from cathedral).                                              | `src/lib/themes/generate-theme-css.test.ts:296` (`WARM_BAND_MIN_HUE`/`WARM_BAND_MAX_HUE` 20–70, `WARMEST_STOPS`)           |
| **The `@import` block in `globals.css` must stay contiguous.** Turbopack `next dev` stops inlining `@import` after a comment/blank break and silently drops `generated.css` → every colored family falls back to cathedral in dev with no error (production webpack is unaffected). | `src/globals.css:1`–`4`; guarded by `src/lib/themes/globals-import-contiguity.test.ts`                                     |

## Theme model

- **6 families, 12 themes.** Warm Cathedral (default) + Harbor, Grove, Rose Tea, Iris, Graphite — each in `{light, dark}`. Family list and seeds: `src/lib/themes/registry.ts:23` (`ThemeFamilyId`), `:94` (`THEME_REGISTRY`).
- **Stored id shape.** Cathedral keeps the **flat** ids `light` / `dark` (zero migration). Colored families use `` `${family}-${mode}` `` (e.g. `harbor-dark`). Type at `registry.ts:37` (`ThemeId`).
- **Two independent axes.** The picker treats _family_ and _mode_ as separate axes even though only one id is stored. `useThemeAxis` (`src/hooks/useThemeAxis.ts:66`) maps the stored id ↔ `(family, mode)`.
- **`System` belongs to cathedral only** (Fork-A rule). System is OS-managed (a light↔dark axis, not a palette). Colored families expose Light/Dark only; picking a colored family while on System collapses to an explicit id. Encoded in `availableModes` and `setFamily`/`setMode` at `useThemeAxis.ts:82`–`118`.
- **Persistence is 100% web.** `next-themes` writes `localStorage` under `storageKey="corelive-theme"` and sets `data-theme` on `<html>`. The Electron shell reads nothing native. Provider config: `src/providers/ThemeProvider.tsx:56`–`65`.

The family-signature **hue table** and the heatmap **OKLCH palette table** are owned by [`DESIGN.md`](../../DESIGN.md) ("Theme System", "Heatmap palette") — consult it rather than this file for those values.

## Public surface

### Registry helpers — `src/lib/themes/registry.ts`

Framework-agnostic (no `'use client'`); imported by the generator, tests, Electron, and React alike.

| Symbol                                    | Signature                                                                              | Anchor                                              | Purpose                                                                                                                                                                                                            |
| ----------------------------------------- | -------------------------------------------------------------------------------------- | --------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `THEME_REGISTRY`                          | `Record<ThemeId, ThemeSeed>`                                                           | `registry.ts:94`                                    | SSoT — all 12 themes keyed by stored id. Cathedral pair is `PreservedTheme` (metadata only); 10 colored entries are `DerivedTheme` with OKLCH seeds.                                                               |
| `isThemeId`                               | `(value: unknown) => value is ThemeId`                                                 | `registry.ts:306`                                   | Type guard via `Object.hasOwn`; rejects bare family names (`'harbor'`), unknown ids, non-strings, inherited keys. Backs the allowlist guard and the `useThemeAxis` stale-value fallback.                           |
| `getThemeMode`                            | `(id: string \| undefined) => ThemeMode`                                               | `registry.ts:328`                                   | Resolves any id to its light/dark axis: `'dark'` for `dark` or any `*-dark` suffix, else `'light'` (incl. `undefined`). The `*-dark` suffix rule is load-bearing; mirrored by the `@custom-variant dark` selector. |
| `getThemeId`                              | `(family: ThemeFamilyId, mode: ThemeMode) => ThemeId`                                  | `registry.ts:347`                                   | Builds the stored id for a `(family, mode)` pair: cathedral → flat `light`/`dark`, every other family → `` `${family}-${mode}` ``.                                                                                 |
| `DEFAULT_THEME_ID`                        | `ThemeId` (`'light'`)                                                                  | `registry.ts:293`                                   | Fallback when nothing is stored or the id is unknown.                                                                                                                                                              |
| `THEME_IDS`                               | `ThemeId[]`                                                                            | `registry.ts:311`                                   | Every registered id, derived from the registry.                                                                                                                                                                    |
| `THEME_FAMILY_LABEL` / `THEME_FAMILY_IDS` | `Record<ThemeFamilyId, string>` / `ThemeFamilyId[]`                                    | `registry.ts:362` / `:377`                          | Human family names (cathedral → `'Warm Cathedral'`) and the default-first family-axis order for the picker.                                                                                                        |
| Types                                     | `ThemeMode`, `ThemeFamilyId`, `ThemeId`, `ThemeSeed`, `PreservedTheme`, `DerivedTheme` | `registry.ts:14`, `:23`, `:37`, `:88`, `:65`, `:77` | `ThemeId` is a template literal that auto-expands when a family is added to `ThemeFamilyId`.                                                                                                                       |

### Two-axis picker hook — `src/hooks/useThemeAxis.ts`

| Symbol         | Signature         | Anchor               | Notes                                                                                                                                                                                                                                                                    |
| -------------- | ----------------- | -------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `useThemeAxis` | `() => ThemeAxis` | `useThemeAxis.ts:66` | Drives the Settings `ThemeSelector` + sidebar quick-switch. Returns `{ family, mode, isSystem, resolvedMode, activeId, availableModes, families, setFamily, setMode, mounted }` (interface at `:31`). Client component (`'use client'`). Encodes the Fork-A System rule. |

### Build-time generator — `scripts/generate-theme-css.ts`

**Build/test only** (imports `culori` via `contrast.ts`); never import in runtime app code. Run directly, it writes `src/lib/themes/generated.css`.

| Symbol              | Signature                                          | Anchor                      | Notes                                                                                                                                                                                                                   |
| ------------------- | -------------------------------------------------- | --------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `deriveThemeTokens` | `(seed: DerivationSeed) => Record<string, string>` | `generate-theme-css.ts:241` | Two-pass derivation of all 36 tokens for one theme: pass 1 neutral/accent/fixed/heatmap, pass 2 computed foregrounds reading their now-derived accent. Throws if a token lacks a `TOKEN_CATEGORY` classification.       |
| `deriveThemeCss`    | `(theme: DerivedTheme) => string`                  | `generate-theme-css.ts:303` | Wraps one theme's tokens in a `:root[data-theme='id'] { … }` block — `color-scheme` first, then the token lines.                                                                                                        |
| `generateThemesCss` | `(themes: readonly ThemeSeed[]) => string`         | `generate-theme-css.ts:327` | Emits the AUTO-GENERATED header + one block per **non-preserved** theme; header-only when all are preserved.                                                                                                            |
| `CATHEDRAL`         | `Record<ThemeMode, Record<string, string>>`        | `generate-theme-css.ts:41`  | The cathedral token values copied verbatim from `globals.css` — the fixed lightness ladder + fixed-identity palette reused by every theme. Pinned to `globals.css` by the snapshot test.                                |
| `TOKEN_CATEGORY`    | `Record<string, TokenCategory>`                    | `generate-theme-css.ts:132` | Classifies each token as `neutral` \| `accent` \| `computedFg` \| `fixed` \| `heatmap`. Fixed-identity tokens (`--destructive`, `--chart-1…5`) emit the cathedral value unchanged for all themes (design decision #15). |

### Contrast utilities — `src/lib/themes/contrast.ts`

**Build/test only** (`culori` is a `devDependency`).

| Symbol               | Signature                     | Anchor           | Notes                                                                                                                                                                                                       |
| -------------------- | ----------------------------- | ---------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `contrastRatio`      | `(fg, bg) => number`          | `contrast.ts:38` | WCAG 2.x ratio (1–21), order-independent.                                                                                                                                                                   |
| `meetsAA`            | `(fg, bg, large?) => boolean` | `contrast.ts:53` | AA gate. Thresholds `AA_TEXT_CONTRAST` / `AA_LARGE_CONTRAST` are the named constants at `contrast.ts:13`–`15` — read them there rather than inlining the numbers.                                           |
| `readableForeground` | `(bg, candidates?) => string` | `contrast.ts:76` | Picks the highest-contrast foreground, so `--primary-foreground` is contrast-computed per theme, never hardcoded white. The generator passes its own `FOREGROUND_CANDIDATES` (`generate-theme-css.ts:190`). |

> AA thresholds in `contrast.ts` (4.5 text / 3 large) and the per-surface gates DESIGN.md cites (e.g. `fg/bg ≥ 7`) are different checks for different pairs — consult each source directly; they are not reconciled here.

### Runtime-safe preview — `src/lib/themes/preview.ts`

Ships in the client bundle (no `culori`).

| Symbol            | Signature                       | Anchor           | Notes                                                                                                                                                                                                                                                                                                                          |
| ----------------- | ------------------------------- | ---------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `getThemePreview` | `(id: ThemeId) => ThemePreview` | `preview.ts:101` | Composite swatch `{ surface, card, accent, text, heatmap[5] }` reconstructed from the registry seed at the cathedral ladder — identical to the generated CSS, cross-checked by `preview.test.ts`. Cathedral returns hand-copied `globals.css` values. Powers the picker family cards (`src/components/ThemeSelector.tsx:145`). |

### Heatmap intensity SSoT — `src/lib/heatmap-intensity.ts`

Runtime-safe. Maps a day's raw completion **count** to one of 5 levels; shared by the heatmap cells and the day-detail band so they can never drift.

| Symbol                         | Signature                                                                       | Anchor                         | Notes                                                                                                                                                                 |
| ------------------------------ | ------------------------------------------------------------------------------- | ------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `getHeatmapIntensityFromCount` | `(dayCount: number) => Intensity`                                               | `heatmap-intensity.ts:56`      | 5 bands: `0` rest, `1` = 1–3, `2` = 4–9, `3` = 10–19, `4` = 20+. Buckets the **raw** count including repeats; never dedups, never weights by recency/streak/category. |
| `HEATMAP_LEVEL_TOKENS`         | `readonly ['var(--hm-0)' … 'var(--hm-4)']`                                      | `heatmap-intensity.ts:32`      | The 5 CSS `var(--hm-N)` tokens, indexed by `Intensity`.                                                                                                               |
| Thresholds                     | `HEATMAP_GOOD_DAY_MIN=4`, `HEATMAP_FULL_DAY_MIN=10`, `HEATMAP_CATHEDRAL_MIN=20` | `heatmap-intensity.ts:19`–`25` | Named constants shared with the graph's `PANEL_COLORS` map.                                                                                                           |

**Consumers:** `ContributionGraph.tsx` builds `PANEL_COLORS` (a `@uiw/react-heat-map` `panelColors` map) from these tokens at `src/app/(main)/home/_components/ContributionGraph.tsx:74` (passed as `panelColors={PANEL_COLORS}` at `:348`); `DayDetailDialog.tsx` resolves its band token at `src/app/(main)/home/_components/DayDetailDialog.tsx:64`.

### Providers — `src/providers/`

| Component             | Anchor                       | Role                                                                                                                                                                                                                                           |
| --------------------- | ---------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `ThemeProvider`       | `ThemeProvider.tsx:50`       | Wraps `next-themes` (`attribute="data-theme"`, `storageKey="corelive-theme"`, `themes` from `THEME_IDS`, `enableColorScheme={false}`). Exports `THEMES` + `THEME_META` derived from the registry (`:22`, `:33`). Mounts the two helpers below. |
| `ThemeAllowlistGuard` | `ThemeAllowlistGuard.tsx:26` | Post-mount self-heal: a stored id that is neither `system` nor a registered id (stale after a downgrade that dropped a family, or tampered) is rewritten to `DEFAULT_THEME_ID`. `next-themes` does not validate its own `localStorage`.        |
| `ThemeTransition`     | `ThemeTransition.tsx:19`     | A `MutationObserver` on `<html>` `data-theme` adds a transient `theme-transition` class for one crossfade window (`THEME_CROSSFADE_DURATION_MS`), so the switch crossfades but hover/focus stay instant.                                       |

## Application contract

- **Attribute:** `next-themes` sets `data-theme` on `<html>`. `ThemeProvider.tsx:58`.
- **Derived block selector:** `:root[data-theme='id'] { color-scheme: …; <tokens> }`, specificity `0,2,0`. `generate-theme-css.ts:303`.
- **Dark variant binding:** `@custom-variant dark (&:where([data-theme$=dark], [data-theme$=dark] *))`. `globals.css:20`.
- **Crossfade CSS:** an **unlayered** rule (so it beats Tailwind's layered `transition-*` utilities) under `@media (prefers-reduced-motion: no-preference)`, `200ms ease-out`, scoped to `html.theme-transition`. `globals.css:173`. `THEME_CROSSFADE_DURATION_MS` (`src/lib/constants/theme.ts:9`) **must** equal the CSS `200ms` or the class clears mid-fade.
- **Generated output:** `src/lib/themes/generated.css` — AUTO-GENERATED, **do not edit**; one `:root[data-theme='id']` block per colored family (10 blocks). Cathedral is **not** here (it lives in `globals.css`). Committed and drift-checked.

## Operational commands

Both are defined in `package.json` `"scripts"` and run inside `pnpm validate`.

```bash
# Regenerate src/lib/themes/generated.css from the registry
pnpm theme:generate    # package.json:36 → tsx scripts/generate-theme-css.ts

# Fail if the committed generated.css is stale (regenerate + git diff --exit-code)
pnpm theme:check       # package.json:37
```

`pnpm validate` (`package.json:40`) runs `theme:check` alongside `test` / `lint` / `build` / `typecheck`. The per-family WCAG AA gate and the temperature=pride gate run as part of `pnpm test` (`src/lib/themes/generate-theme-css.test.ts`).

## Related, but separate

`getColorDotClass` / `COLOR_DOT_CLASSES` (`src/lib/category-colors.ts:12,29`) is the per-**category** dot palette (blue/green/amber/rose/violet/orange → Tailwind `bg-*-500`). It uses Tailwind palette classes, **not** the OKLCH `--hm`/theme tokens, and is not part of this theme system.

## See also

- [`DESIGN.md`](../../DESIGN.md) — "Theme System" (the 10 governing rules + family/hue table) and "Heatmap Invariance Rule" (the three-tier temperature=pride guarantee). The canonical _why_.
- `src/lib/themes/generate-theme-css.test.ts`, `cathedral-css-snapshot.test.ts`, `globals-import-contiguity.test.ts`, `preview.test.ts`, `contrast.test.ts`, `registry.test.ts`, `src/hooks/useThemeAxis.test.tsx` — the CI guards behind every invariant above.
