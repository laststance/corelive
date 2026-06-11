# Why themes are a build-time pipeline

CoreLive ships its colored themes by compiling a single TypeScript registry into a static CSS file at build time, rather than computing colors in the browser. This document explains the two constraints that force that shape, and the threat each CI guard defends against — so a future engineer can change the theme system without quietly breaking the brand, the bundle, or the heatmap's meaning.

For _how to add a family_, see [howto-add-theme-family.md](./howto-add-theme-family.md). For the surface map (exact files, functions, tokens), see [reference-theme-system.md](./reference-theme-system.md). For the product rules this implements, see [DESIGN.md](../../DESIGN.md) (the "Theme System" and "Heatmap Invariance Rule" sections are canonical; this doc explains the engineering mechanics they summarize).

## The two forcing constraints

Everything downstream follows from two requirements that pull in opposite directions:

1. **Color math must not ship to the client.** Deriving an accessible palette from a seed means OKLCH conversion and WCAG contrast math (the `culori` library). That is build-time work; running it in every browser tab would reintroduce exactly the weight the design wants gone, and would tie runtime rendering to a color-science dependency.

2. **The brand must never be touched by a formula.** The default Warm Cathedral light/dark is hand-tuned — its neutral surfaces carry per-token chroma that no single derivation formula reproduces. The brand's "soul" (DESIGN.md's north star, 「些細でも経験値」) lives in those hand-picked values and must not drift when someone adds a tenth colored family.

A naive "compute theme colors at runtime from a seed" approach violates both. So the system splits in time instead: a **registry** (the single source of truth, plain TypeScript) is compiled by a **build-time generator** into **static CSS** that the app loads like any stylesheet. The brand is _excluded_ from generation entirely. No color math reaches the client.

```
src/lib/themes/registry.ts   ──pnpm theme:generate──▶  src/lib/themes/generated.css
   (SSoT: 12 themes)            (scripts/generate-theme-css.ts)   (one :root[data-theme='id'] block
                                  reads culori, build-only)         per colored family — committed)
```

The colored families are _systematic_; the brand is _preserved_. The pipeline's whole job is to keep those two facts true forever.

## The registry is the single source of truth

`src/lib/themes/registry.ts` holds every theme as a discriminated union (`registry.ts:65-88`): a `PreservedTheme` (the cathedral pair — metadata only, `preserve: true`) or a `DerivedTheme` (`preserve: false` plus an OKLCH seed: accent L/chroma/hue, neutral chroma/hue, and a 5-stop `heatmapHues` tuple). `THEME_REGISTRY` (`registry.ts:94`) is keyed by stored id and closed with `satisfies Record<ThemeId, ThemeSeed>` (`registry.ts:290`), so the map keys are _exactly_ the id union — a typo'd or missing id is a type error, not a runtime surprise.

The point of one registry is that nothing else hardcodes a theme. `THEME_IDS`, the family labels, the `next-themes` provider config, the picker, the `useThemeAxis` hook, and the generator all _derive_ from `THEME_REGISTRY`. Add a family in one place — append a `ThemeFamilyId` and a light/dark seed pair — and the id union auto-expands through the `${family}-${mode}` template (`registry.ts:37-40`); every consumer follows. The alternative (a theme list duplicated across the provider, the picker, and `globals.css`) is the exact fragmentation the registry's module doc calls out as the thing it exists to prevent.

## Why generation skips the brand

The generator's defining move is a _negative_ one: it does nothing for preserved themes. `generateThemesCss` filters them out — `themes.filter((theme): theme is DerivedTheme => !theme.preserve)` (`generate-theme-css.ts:329`) — and `generated.css` contains only colored-family blocks. The cathedral's CSS stays hand-authored in `globals.css`.

This is **brand safety over DRY**, made structural. A formula expressive enough to reproduce the cathedral's hand-tuned neutrals would be fragile and would still risk drift on every edit. So instead of re-emitting the brand from a formula, the system _pins_ it: `cathedral-css-snapshot.test.ts` asserts the hand-authored `globals.css` cathedral tokens byte-for-byte against the `CATHEDRAL` mirror the generator carries (`generate-theme-css.ts:41-118`). The mirror exists because derived themes reuse the cathedral _lightness ladder_ (see below), and the snapshot test is what guarantees the mirror can never silently diverge from the real brand.

**What breaks if violated:** make the cathedral a `DerivedTheme` to "unify" the system, and you hand the brand's soul to a formula that doesn't reproduce it — the default theme drifts, and the snapshot test (now asserting against generated output) no longer protects anything.

## AA holds by construction — and where the one real seed gate lives

It is tempting to summarize this as "colored families are WCAG-AA gated," but the honest mechanism is more specific, and the specificity _is_ the insight.

For neutral surface/text tokens, derivation keeps each token's **lightness** from the fixed cathedral ladder and swaps in only the family's neutral hue and chroma (accent tokens instead take their lightness from the seed's `accentL`, and heatmap tokens keep both the cathedral L _and_ C, swapping only hue) — see `deriveThemeTokens`, `generate-theme-css.ts:257-277`. Because contrast in OKLCH is overwhelmingly lightness-driven, neutral-on-neutral pairs (`--foreground` on `--background`, `--muted-foreground` on `--card`) clear AA _by construction_ for every family — a seed only re-tints a shared hue/chroma, it cannot move those ratios. The test treats these as **structural** assertions (foreground/background `>= 7`, muted/card `>= 4.5` at `generate-theme-css.test.ts:273-278`): they guard against a _generator_ regression that breaks ladder reuse, not against a bad seed.

The one place a seed _can_ fail AA is the **accent foreground**. `--primary` (and `--sidebar-primary`) is the seed-controlled accent color, so `--primary-foreground` cannot be a hardcoded `white` — at a mid-lightness accent, white fails AA. It is instead **contrast-computed** per theme: `readableForeground` (`contrast.ts:76`) picks whichever of the brand near-white / near-ink candidates clears the threshold. The genuinely seed-sensitive gate is the `>= 4.5` check on `--primary-foreground`/`--sidebar-primary-foreground` against their accents (`generate-theme-css.test.ts:283-291`). This is why a few seeds were nudged for headroom (e.g. Harbor light's accent L, documented in `registry.ts:121-122`): a mid-lightness accent can leave _neither_ candidate clearing 4.5, and only the computed gate catches it.

So: most of accessibility is free because of the ladder; the accent is the part that needs a real per-theme check, which is exactly why it is computed rather than fixed.

## Why color math never ships

`culori` (OKLCH conversion + WCAG contrast) is a **devDependency**, confined to build and test. The two modules that import it — `scripts/generate-theme-css.ts` and `src/lib/themes/contrast.ts` — both carry an explicit "BUILD/TEST ONLY" contract in their module docs (`contrast.ts:5-9`): importing them from runtime app code would pull `culori` into the client bundle and reintroduce the color math the static-CSS architecture exists to remove.

The runtime never _needs_ `culori`, because the one place the app would otherwise want color math — the picker's theme-preview swatches — has a **culori-free path**. `src/lib/themes/preview.ts` reconstructs the swatches from the registry seed by re-implementing the cathedral lightness ladder as plain constants (`preview.ts:34-44`), formatting OKLCH strings directly. The guarantee that this hand-rolled path can't silently diverge from the real generated CSS is a cross-check test: `preview.test.ts` pins every preview swatch against the generator's own `deriveThemeTokens` / `CATHEDRAL` output.

The accurate framing: the runtime is kept free of color math by _convention_ (the build-only contract) plus a _culori-free reconstruction_ that a test keeps honest — not by a mechanical bundle gate that rejects `culori`. A future engineer who imports `contrast.ts` into a client component breaks the invariant; the defense is the documented contract and code review, so respect it.

## The heatmap temperature-is-pride invariant

This is the product's most consequential color decision, so it is the most strongly defended. The heatmap's hot end must bloom **warm** on every theme, forever — accumulation reading as warmth, never as a GitHub-green work grid. DESIGN.md's "Heatmap Invariance Rule" states it as a CI-enforced invariant, not a guideline.

The non-obvious part is _why the gate checks two stops_. The seed's `heatmapHues` tuple controls **hue only** at each of the five stops; the lightness/chroma ramp is reused structurally from the cathedral. So the real gate (`generate-theme-css.test.ts:296-348`) asserts, for every derived theme, that the **two hottest** stops — `--hm-3` and `--hm-4` — both land in the warm hue band `[20, 70]`. Checking only the apex would be insufficient: a degenerate body like `heatmapHues: [145, 145, 145, 145, 42]` keeps a perfectly valid L/C ramp but renders a **green grid with a single warm cell** — precisely the GitHub-green regression the north star forbids, which a single-apex check would wave through. Requiring _both_ hottest stops in the band rejects it. The cool rest stops (`--hm-0..2`) stay family-hued by design and are intentionally unconstrained — a green Grove resting green is correct; a green Grove that _stays_ green as it heats up is the failure.

The other half of "more completions = hotter" is the count-to-level mapping, and it is a separate single source of truth: `src/lib/heatmap-intensity.ts` (`getHeatmapIntensityFromCount`, `heatmap-intensity.ts:56`) buckets a day's raw completion count into one of five levels, and `HEATMAP_LEVEL_TOKENS` maps those to the `var(--hm-N)` CSS tokens. Both the `ContributionGraph` cells and the `DayDetailDialog` band read this module, so a cell's color and its dialog band can never drift. Critically, intensity is a pure function of the **raw count, repetition included** — doing the same task twice counts as two, and the module never deduplicates (this mirrors the project's "no dedup — repetition is XP" rule). Never add recency, streak, or category weighting here: temperature scales with count and only count. (The exact band thresholds are volatile; they live in `heatmap-intensity.ts` and the reference doc, not transcribed here.)

## How a theme actually applies: `data-theme` and the dark variant

`next-themes` persists the chosen id to `localStorage` (key `corelive-theme`) and writes it to `data-theme` on `<html>` (configured in `src/providers/ThemeProvider.tsx`). Two engineering choices make that attribute drive everything:

**Specificity, not import order.** Generated blocks are emitted as `:root[data-theme='id']` (specificity 0,2,0; `generate-theme-css.ts:303`), deliberately one notch above cathedral's hand-authored `:root` (0,1,0). A bare `[data-theme]` would tie and depend on source order; the `:root[...]` form means a derived theme _always_ wins over the cathedral base regardless of how `@import` orders the files. (Asserted in `generate-theme-css.test.ts`.)

**The `dark:` variant is bound to the attribute, not the OS.** Tailwind's `dark:` utilities key off the app's `data-theme`, via `@custom-variant dark (&:where([data-theme$=dark], [data-theme$=dark] *))` in `globals.css:20`. The `$=dark` suffix match is load-bearing: it catches the flat `dark` id _and_ every `*-dark` family id (e.g. `harbor-dark`), exactly mirroring `getThemeMode()` in `registry.ts:328` — while `light`/`*-light` never end in `dark`, so they're excluded. This is required because Tailwind v4 ignores `tailwind.config` `darkMode` without a `@config` directive, and `:where()` keeps the variant's specificity at 0. The same suffix selector drives chart colors (`src/components/ui/chart.tsx:33`), so charts flip with the rest of the UI.

Note the asymmetry this creates as a _trap_: the cathedral uses **flat** ids `light`/`dark` (chosen so adding the family system required zero migration of existing stored values), so a stale or tampered `localStorage` id that happens to end in `-dark` will still fire the dark Tailwind variant while falling back to cathedral tokens — a broken light/dark hybrid. `next-themes` does not validate `localStorage`, so a small allowlist guard self-heals an unregistered id back to the default post-mount. That guard, and the two-axis (family × mode) picker model with its System-belongs-only-to-cathedral rule, are mechanics best read in [reference-theme-system.md](./reference-theme-system.md).

## The drift guards, and why each exists

The pipeline only works if the committed `generated.css` always matches the registry, and if the dev build actually loads it. Two CI checks defend those:

- **Stale CSS → `pnpm theme:check`.** `generated.css` is _committed_ (so it ships without a build step running first), which means it can go stale if someone edits a seed and forgets to regenerate. `theme:check` (`package.json:37`) re-runs the generator and `git diff --exit-code`s the output, so a stale file fails CI. It runs inside `pnpm validate` (`package.json:40`) alongside the AA and temperature gates; `pnpm theme:generate` (`package.json:36`) is the regenerate command.

- **Silent dev fallback → the import-contiguity test.** This is the subtle one. Under Turbopack (`next dev`), `@import` statements stop being inlined once parsing hits a comment or blank line — so a comment wedged _before_ the `./lib/themes/generated.css` import silently drops it, and every colored family falls back to cathedral **in dev with no error** (the webpack production build is unaffected, making it invisible until someone notices their theme looks wrong locally). The `@import` block at the top of `globals.css` is therefore kept _contiguous_, and `globals-import-contiguity.test.ts` is the only automated guard against a future "tidy this comment" edit reintroducing the break. Comments after the generated import are fine.

The crossfade on theme switch is a separate, deliberately small concern: a transient `theme-transition` class on `<html>` (added by a `MutationObserver` watching `data-theme`) scopes a short fade to the switch window only, and `THEME_CROSSFADE_DURATION_MS` (`src/lib/constants/theme.ts`) must equal the CSS duration in `globals.css` or the class clears mid-fade.

## What shipped

The 12-theme system (Warm Cathedral light/dark default + 5 colored families × light/dark) shipped in **v0.9.0**. The colored families are systematic and CI-locked; the brand is hand-authored and pinned. If you change any of this, the question to keep asking is the one each guard above answers: _what would silently break, and which test would catch it?_

## See also

- [howto-add-theme-family.md](./howto-add-theme-family.md) — the step-by-step task (append a seed, regenerate, let `validate` gate it).
- [reference-theme-system.md](./reference-theme-system.md) — the surface map: registry helpers, `useThemeAxis`, generator entry points, the token list and per-theme seeds (the volatile detail this doc deliberately defers).
- [DESIGN.md](../../DESIGN.md) — the canonical product rules: "Theme System" and "Heatmap Invariance Rule".
- the doc hub [`README.md`](./README.md) — the full developer-docs index.
