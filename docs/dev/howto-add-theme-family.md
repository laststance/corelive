# How to add a new colored theme family

This recipe walks you through adding one colored theme family (a light/dark pair) to CoreLive. The whole change lives in **one registry edit**, a regenerate, and a few test-lock bumps — the picker, the `dark:` variant, and the preview swatches all derive from the registry automatically.

For _why_ the pipeline is shaped this way (build-time derivation, why `culori` never ships to the client, the `0,2,0` specificity choice), read [explanation-theme-system.md](./explanation-theme-system.md). For the surface map (every helper, anchored to `file:line`), read [reference-theme-system.md](./reference-theme-system.md). For the governing product rules and the heatmap invariant, read the **Theme System** (`DESIGN.md:119`) and **Heatmap Invariance Rule** (`DESIGN.md:147`) sections of [DESIGN.md](../../DESIGN.md). Do not deviate from those rules without explicit approval.

## Before you start

A family is **a light and a dark seed** — always add both. Cathedral (`Warm Cathedral`) is the only hand-authored family; it is `preserve: true` and lives in `src/globals.css`. Every colored family is a `DerivedTheme`: you supply ~7 OKLCH numbers and the build-time generator derives all 36 color tokens at the fixed cathedral lightness ladder. You never write CSS, and you never touch `src/lib/themes/generated.css` (it is machine-written).

The two gates that will actually reject a bad seed:

- **WCAG AA on the accent.** `--primary-foreground` is _contrast-computed_ (not hardcoded white) against your `--primary`, and must clear 4.5. Mid-lightness accents (`accentL` ≈ 0.5–0.6) are the danger zone where neither near-white nor near-ink text clears AA — see `registry.ts:121-122` (Harbor `0.56 → 0.555`) and `registry.ts:154-159` (Grove `0.55 → 0.54`).
- **Heatmap "temperature = pride".** The two hottest stops must bloom warm on every theme, forever — never GitHub-green. That means `heatmapHues` **indices 3 and 4** (the last two) must each have hue ∈ **[20, 70]**. Indices 0–2 are the cool rest stops and stay family-hued by design (unconstrained).

## Steps

### 1. Add the family id to the `ThemeFamilyId` union

`src/lib/themes/registry.ts:23`. Append your id to the union:

```ts
export type ThemeFamilyId =
  | 'cathedral'
  | 'harbor'
  | 'grove'
  | 'rose-tea'
  | 'iris'
  | 'graphite'
  | 'sunset' // ← your new family
```

This one edit makes the type system point you at the two maps that must be filled: the moment you add the id, `pnpm typecheck` errors at `THEME_REGISTRY` (`satisfies Record<ThemeId, ThemeSeed>`, `registry.ts:290`) **and** at `THEME_FAMILY_LABEL` (`Record<ThemeFamilyId, string>`, `registry.ts:362`). The `ThemeId` template (`registry.ts:37-40`) auto-expands to include `'sunset-light' | 'sunset-dark'`, so you do not edit `ThemeId`.

### 2. Add the light + dark `DerivedTheme` seeds to `THEME_REGISTRY`

`src/lib/themes/registry.ts:94`. Add **two** entries, keyed by their stored id (`${family}-${mode}`). Use the existing **Harbor** pair (`registry.ts:123-152`) as your annotated template — it is real, shipped, and passes both gates:

```ts
'sunset-light': {
  family: 'sunset',
  mode: 'light',
  id: 'sunset-light',
  name: 'Sunset Light',
  preview: '#c2603a',        // coarse brand/meta hex (picker uses a token composite, not this)
  colorScheme: 'light',
  preserve: false,           // union discriminant: derived, not hand-authored
  accentL: 0.55,             // mid-L → AA danger zone; nudge if --primary-foreground fails (step 5)
  accentChroma: 0.13,
  accentHue: 40,             // the family signature color
  neutralChroma: 0.012,      // low tint on neutral surfaces (~0.012 light / ~0.014 dark)
  neutralHue: 40,            // convention: neutralHue = accentHue (surfaces lean toward the accent)
  heatmapHues: [40, 45, 50, 55, 42], // indices 3 & 4 (here 55, 42) MUST be ∈ [20, 70]
},
'sunset-dark': {
  family: 'sunset',
  mode: 'dark',
  id: 'sunset-dark',
  name: 'Sunset Dark',
  preview: '#e89368',
  colorScheme: 'dark',
  preserve: false,
  accentL: 0.72,             // dark-mode accents sit higher (≈0.7–0.72) for contrast on dark surfaces
  accentChroma: 0.13,
  accentHue: 40,
  neutralChroma: 0.014,
  neutralHue: 40,
  heatmapHues: [40, 45, 50, 55, 42],
},
```

Field semantics are documented on the `DerivedTheme` interface (`registry.ts:69-85`). Do not invent values and assume they are good — `pnpm validate` (step 5) is the source of truth for any new numbers.

> **Gotcha — heatmap rest stops vs. apex.** The L/C ramp is reused verbatim from cathedral; your `heatmapHues` only swaps the _hue_ at each stop. Let indices 0–2 rest on your family hue (Iris rests violet `300`, Grove rests green `140` — see `registry.ts:173,239`), but bend indices 3 and 4 into `[20, 70]`. A degenerate all-cool body like `[145, 145, 145, 145, 42]` keeps the ramp but renders a green grid with one warm cell — exactly the failure the build forbids.

> **Note — fixed-identity tokens.** `--destructive` and `--chart-1..5` always emit the cathedral value for every theme (design decision #15, `generate-theme-css.ts:147,151-155`). If your accent hue lands near one of those (Grove's `145` sits by `--chart-2`'s `145`; Rose Tea's `18` sits near `--destructive`'s `25`), that collision is acceptable as long as it stays separable by chroma/lightness and AA passes — flag it in a code comment, as those families do (`registry.ts:154-159,191-192`).

### 3. Add the family label to `THEME_FAMILY_LABEL`

`src/lib/themes/registry.ts:362`. This is the human name shown in the picker; it is **not** derivable from a theme name (cathedral's label `'Warm Cathedral'` proves why the map is explicit):

```ts
export const THEME_FAMILY_LABEL: Record<ThemeFamilyId, string> = {
  cathedral: 'Warm Cathedral',
  harbor: 'Harbor',
  grove: 'Grove',
  'rose-tea': 'Rose Tea',
  iris: 'Iris',
  graphite: 'Graphite',
  sunset: 'Sunset', // ← your new family
}
```

That is the **only** other map you touch. `THEME_IDS`, `THEME_FAMILY_IDS`, the `useThemeAxis` picker, `getThemePreview`, and the `ThemeSelectorMenuItem` family handlers all derive from the registry — no edits needed there.

### 4. Regenerate the static CSS

```bash
pnpm theme:generate
```

This runs `tsx scripts/generate-theme-css.ts` (`package.json:36`), which reads the registry, **skips** the preserved cathedral pair, derives your two new blocks, and rewrites `src/lib/themes/generated.css`. Each block is a `:root[data-theme='sunset-light'] { … }` selector (specificity `0,2,0`, so it outranks cathedral's `:root`). Commit the regenerated `generated.css` — it is committed and drift-checked.

### 5. Let `pnpm validate` gate it

```bash
pnpm validate
```

`validate` (`package.json:40`) runs four relevant checks in parallel:

| Check                                      | What it enforces                                                        | Where                                                                         |
| ------------------------------------------ | ----------------------------------------------------------------------- | ----------------------------------------------------------------------------- |
| `pnpm typecheck`                           | `THEME_REGISTRY` and `THEME_FAMILY_LABEL` have your new entries         | `registry.ts:290,362`                                                         |
| `pnpm theme:check`                         | `generated.css` is not stale (regenerate + `git diff --exit-code`)      | `package.json:37`                                                             |
| `pnpm test` → per-family **WCAG AA** gate  | `--primary-foreground` on `--primary` ≥ 4.5 for **every** derived theme | `generate-theme-css.test.ts:262-294` (`$id clears AA …`)                      |
| `pnpm test` → **temperature = pride** gate | `--hm-3` **and** `--hm-4` hue ∈ [20, 70] for **every** derived theme    | `generate-theme-css.test.ts:296-348` (`$id … blooms its two hottest stops …`) |

The AA and temperature gates iterate `DERIVED_THEMES` (`generate-theme-css.test.ts:249-252`), so a bad seed fails CI **by name** (e.g. `sunset-light clears AA …`).

- **AA failure** (`--primary-foreground` ratio < 4.5): nudge `accentL` toward the lighter or darker extreme to give one text candidate headroom, re-run `pnpm theme:generate`, re-validate. This is exactly what the Harbor/Grove nudges did.
- **Temperature failure** (`--hm-3`/`--hm-4` hue outside `[20, 70]`): bend those two `heatmapHues` entries warmer (toward the cathedral apex of `40`/`65`); leave indices 0–2 alone.

### 6. Update the test-count locks

Adding a family is **+2 themes**, so four hard-coded counts must move. Each guards against an accidental add/drop; bump each:

| Lock                    | Change                                                    | Where (`file:line` + test)                                                           |
| ----------------------- | --------------------------------------------------------- | ------------------------------------------------------------------------------------ |
| The explicit id array   | gains `'sunset-light'`, `'sunset-dark'` (12 → 14 entries) | `registry.test.ts:24-37` (`registers exactly the twelve shipped themes …`)           |
| `modesByFamily.size`    | `6 → 7`                                                   | `registry.test.ts:51` (`pairs a light and a dark theme for every family`)            |
| `colored` length        | `10 → 12`                                                 | `registry.test.ts:71` (`marks cathedral preserved and every colored family derived`) |
| `DERIVED_THEMES` length | `10 → 12`                                                 | `generate-theme-css.test.ts:259` (`ships exactly 10 colored families …`)             |

> **Why the `DERIVED_THEMES` lock matters.** The per-family AA and temperature gates use `it.each(DERIVED_THEMES)`, which passes _vacuously_ on an empty array. If the registry ever emptied or the `preserve` filter regressed, those gates would silently test nothing — the explicit count is the trip-wire (`generate-theme-css.test.ts:254-260`).

Also update the `it(...)` description strings if you want them to stay literally accurate (e.g. "twelve shipped themes" → "fourteen"); the assertions are what fail, but stale prose misleads the next reader. Run `pnpm validate` once more — green means done.

## Troubleshooting: my colored theme renders as Warm Cathedral in `pnpm dev`

**Symptom.** You added the family, `pnpm validate` is green, but in `pnpm dev` (Turbopack) every colored family falls back to Warm Cathedral — with **no build error**. Production (`pnpm build`, webpack) is unaffected, which makes this easy to miss.

**Cause — the `@import` contiguity trap.** Turbopack's `next dev` stops inlining `@import` statements once it hits a comment or blank line, so any non-`@import` line wedged _before_ the `generated.css` import makes Turbopack silently drop the whole colored-family stylesheet. This is trivially reintroduced by "tidying" a comment back up between the imports.

**Fix.** Keep the leading `@import` block in `src/globals.css:1-4` **contiguous** — every line from the first `@import` through `@import './lib/themes/generated.css';` must itself be an `@import`. Comments are fine **after** the `generated.css` import (the contiguity-explaining comment lives at `globals.css:5-10`). Do not insert anything between lines 1 and 4.

**Guard.** `src/lib/themes/globals-import-contiguity.test.ts` (the `keeps generated.css contiguous …` test, `:54-61`) is the only automated catch for this — it scans `globals.css` and fails if any comment/blank break appears before the `generated.css` import. It runs in `pnpm validate`.

> Related contract: Tailwind's `dark:` variant is bound to `data-theme` via `@custom-variant dark (&:where([data-theme$=dark], …))` at `globals.css:20`. The `$=dark` suffix matches the flat `dark` id **and** every `*-dark` family id (e.g. `sunset-dark`), mirroring `getThemeMode()` — so your dark seed gets the dark variant automatically with no extra wiring.
