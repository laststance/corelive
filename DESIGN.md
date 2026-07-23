# Design System — corelive

> **North Star:** 「些細でも経験値、今日自分頑張ったなと自分を肯定できる感覚」
>
> Every trivial task gets visualized as accumulation. The user closes the app feeling validated, never judged. All design decisions are evaluated against this north star.

## Product Context

- **What this is:** Personal task tracker + BrainDump archive whose centerpiece is an Activity Heatmap visualizing every completed task as warm density over a year.
- **Who it's for:** Solo, taste-driven productivity users who want quiet self-affirmation, not KPI grading or social comparison. Single-user (no team features).
- **Space/industry:** Personal productivity. Adjacent: Things 3, Bear, Linear, Reflect, Tana, Cron. Distant: Notion (too much), Todoist (KPI guilt), Asana (team).
- **Project type:** Hybrid — `(main)/*` is the dashboard app, `/login` and `/sign-up` are auth, marketing surfaces may follow. Web + Electron (macOS only).

## Aesthetic Direction

- **Direction:** **Warm Cathedral** — industrial-utilitarian craft warmed by daylight. The Heatmap year is the stained-glass window; accumulated days make the room glow.
- **Decoration level:** **Intentional** — paper-grain noise on backgrounds (≤2% opacity), no decorative blobs, no gradient orbs. Visual weight lives in the Heatmap; chrome stays quiet.
- **Mood:** Quiet pride. A workshop with a real window, not fluorescent tubes. Studio Ghibli morning, not corporate dashboard.
- **NOT:** Linear (cold completionism), Notion (feature bloat), Things 3 (precious minimalism), Todoist (KPI scoring), gamified RPG (badges/SFX/confetti).
- **Reference touchstones:** Apple Activity Rings (closing-the-loop emotional payoff), Strava personal heatmap (accumulation without judgment), Studio Ghibli morning light, Tana / Reflect (personal-tool craft).

## Presets First, Then Options

corelive ships an **opinionated concept** — the North Star and Warm Cathedral. That concept owns every **default and preset**, so a fresh install is complete and concept-faithful before the user touches a single setting. But the default is a **starting point, not a ceiling** — every aesthetic and UX item is meant to be tuned to the user's own taste.

**The rule:** ship the concept-faithful default **first** and make it sufficient on its own, **then expose the knob** so the user can change it. Good defaults are never an excuse to withhold a setting.

- The **default is always concept-faithful** — someone who never opens settings still gets the full intended experience, no setup required to feel complete.
- **Everything is configurable** — themes, sound, motion, copy, layout, density, all of it. If it's a design or UX choice, the user can configure it their way. Configuration is a **first-class, discoverable capability**, not a buried or grudging afterthought.

This holds for **design, features, and UX alike**. The concept owns the default; the user owns every item they want to change.

**Never deviable: the North Star itself** — self-affirmation over judgment. "Configure everything" means every _aesthetic and UX_ item (theme, sound, motion, layout, copy, density) — a louder theme, an optional sound, a denser layout are all fair game. It does **not** mean an option that grades, shames, or guilts (no opt-in streak-shame, no KPI-percentage mode). Style is infinitely yours to tune; the emotional contract is not.

> **Instances.** **Sound palette** — default is silence (on-concept); every soft cue is configurable per moment, off until the user turns it on. **Theme system** — Warm Cathedral is the default; the colored families are user-selectable. Next customization? Same shape: ship the concept default, make it sufficient, then let the user tune it.

## Typography

Three-font stack, deliberately unusual for the productivity category. The serif display is the loudest differentiation move — productivity apps converge on geometric sans (Inter / Geist / DM Sans), so a serif says "this is craft, not corporate" within the first 0.3 seconds.

- **Display / Hero (≥18px):** **Newsreader** — variable serif, optical sizes built-in. Editorial without being precious. Loaded from Google Fonts.
- **Body / UI:** **Inter Tight** — variable sans, dense and modern. Compact enough for dashboard density; pairs with Newsreader's character. Loaded from Google Fonts. Never plain Inter (AI default), never DM Sans (category convergence).
- **Data / Code:** **Geist Mono** — tabular-nums, warmer than JetBrains Mono, more disciplined than Fira Code. Loaded from Vercel Fonts or self-hosted.
- **Loading:** Google Fonts (`display=swap`) for Newsreader + Inter Tight, Vercel Fonts or self-hosted for Geist Mono.

### Blacklist (do NOT use as primary)

Inter, Roboto, Arial, Helvetica, DM Sans, Geist Sans, Plus Jakarta Sans, Open Sans, Lato, Montserrat, Poppins, Space Grotesk. All are productivity-category convergence fonts; using them dilutes the differentiation Newsreader earns.

### Scale (1.2 modular ratio)

| Tier    | Size                     | Font        | Weight | Notes                                                 |
| ------- | ------------------------ | ----------- | ------ | ----------------------------------------------------- |
| Hero    | `clamp(40px, 5vw, 64px)` | Newsreader  | 600    | Marketing/empty-state moments                         |
| H1      | 36px                     | Newsreader  | 600    | Section headers, dialog titles                        |
| H2      | 24px                     | Newsreader  | 500    | Subsection                                            |
| H3      | 18px                     | Inter Tight | 600    | Card headers, group labels                            |
| Body    | 15px                     | Inter Tight | 400    | Default reading size                                  |
| Small   | 13px                     | Inter Tight | 400    | Secondary copy, footers                               |
| Caption | 12px                     | Inter Tight | 500    | `text-transform: uppercase`, `letter-spacing: 0.05em` |
| Data    | 13px                     | Geist Mono  | 500    | `font-variant-numeric: tabular-nums` for counts/dates |

## Color

OKLCH color space throughout. Departing deliberately from the current cold-neutral baseline to introduce warmth via small chroma values (0.005–0.015) on neutrals plus an amber-warm accent.

### Approach

- **Restrained chromatic accent:** amber-warm is the only saturated color in chrome. Heatmap cells get the chromatic stage.
- **Warm neutrals:** every _solid_ neutral surface carries OKLCH chroma ≥0.016 (light) / ≥0.026 (dark) — the golden-hour warm-up (2026-06-03) that pushed the whole UI off clinical white toward late-afternoon light. Earlier values (0.005–0.015) read as "Linear cold". Exception: dark `--border`/`--input` stay translucent white (`oklch(1 0 0 / 8–12%)`); they composite over the warm coal background, so the rendered line reads warm without carrying its own chroma.
- **Temperature gradient over lightness gradient** for the Heatmap — the eureka. Cooler-empty → hotter-full, not lighter → darker.

### Light mode (primary)

| Token                    | Value                   | Role                                                        |
| ------------------------ | ----------------------- | ----------------------------------------------------------- |
| `--background`           | `oklch(0.975 0.016 80)` | Golden-hour paper (warmed off white)                        |
| `--card` / surface       | `oklch(0.972 0.018 78)` | Sand-lit elevated surface                                   |
| `--popover`              | `oklch(0.972 0.018 78)` | Same as card                                                |
| `--foreground`           | `oklch(0.18 0.015 30)`  | Deep warm charcoal (not pure black)                         |
| `--muted-foreground`     | `oklch(0.5 0.026 56)`   | Earthy taupe for secondary copy (5.6:1 on card, AA)         |
| `--border`               | `oklch(0.908 0.022 76)` | Warm dawn gray                                              |
| `--input`                | `oklch(0.908 0.022 76)` | Form input border                                           |
| `--ring`                 | `oklch(0.56 0.16 50)`   | Focus ring = primary amber                                  |
| `--primary`              | `oklch(0.56 0.16 50)`   | Amber CTA                                                   |
| `--primary-foreground`   | `oklch(0.99 0 0)`       | Paper text on amber                                         |
| `--secondary`            | `oklch(0.942 0.024 78)` | Quiet button bg                                             |
| `--secondary-foreground` | `oklch(0.18 0.015 30)`  | Same as foreground                                          |
| `--accent`               | `oklch(0.942 0.024 78)` | Hover surfaces                                              |
| `--accent-foreground`    | `oklch(0.18 0.015 30)`  |                                                             |
| `--muted`                | `oklch(0.942 0.024 78)` | Disabled/quiet bg                                           |
| `--destructive`          | `oklch(0.6 0.20 25)`    | Clay red, retuned warmer than the default oklch destructive |

> **`--primary` / `--ring` darkened L0.62 → L0.56 (2026-06-11, WCAG AA).** White
> `--primary-foreground` on the old lighter amber was only 3.75:1 — below the AA
> 4.5:1 floor for CTA text. L0.56 lifts white-on-amber to 4.81:1 while staying
> brand amber (hue 50, chroma 0.16). `--sidebar-primary` / `--sidebar-ring` move
> with it; `--chart-1` stays L0.62 (data-viz fill, no overlaid text). Dark mode
> already passed (dark ink on lifted amber, 6.93:1). Locked by
> `cathedral-contrast.test.ts`.

### Dark mode

Dark mode is a redesign of the surfaces, not a saturation reduction. The warm undertone (chroma 0.026–0.028 on hue 40–66, raised in the 2026-06-03 golden-hour warm-up from 0.012–0.015) makes the coal glow like embers rather than slate.

| Token                  | Value                   | Role                                              |
| ---------------------- | ----------------------- | ------------------------------------------------- |
| `--background`         | `oklch(0.172 0.026 40)` | Ember coal, warm ochre undertone                  |
| `--card` / surface     | `oklch(0.235 0.028 44)` | Warm coal                                         |
| `--popover`            | `oklch(0.235 0.028 44)` |                                                   |
| `--foreground`         | `oklch(0.96 0.005 75)`  | Warm white                                        |
| `--muted-foreground`   | `oklch(0.74 0.026 66)`  | Warm fog (7.3:1 on card, AA)                      |
| `--border`             | `oklch(1 0 0 / 8%)`     | Soft glow boundary                                |
| `--input`              | `oklch(1 0 0 / 12%)`    |                                                   |
| `--ring`               | `oklch(0.7 0.16 55)`    | Focus ring slightly brighter than primary in dark |
| `--primary`            | `oklch(0.7 0.16 55)`    | Amber lifted for dark contrast                    |
| `--primary-foreground` | `oklch(0.16 0.012 35)`  | Background on amber                               |
| `--secondary`          | `oklch(0.285 0.026 44)` |                                                   |
| `--accent`             | `oklch(0.285 0.026 44)` |                                                   |
| `--muted`              | `oklch(0.285 0.026 44)` |                                                   |
| `--destructive`        | `oklch(0.7 0.19 25)`    | Clay red lifted                                   |

### Heatmap palette — temperature gradient

This is the project's most consequential color decision. Departs from GitHub's green ramp to a warm temperature gradient (paper → dawn → amber → terracotta). Chroma and hue move; lightness moves only enough to stay readable.

| Level     | Light                                  | Dark                             | Meaning           |
| --------- | -------------------------------------- | -------------------------------- | ----------------- |
| 0 (empty) | `oklch(0.96 0.008 80)` paper           | `oklch(0.22 0.012 40)` warm coal | Rest, not failure |
| 1         | `oklch(0.89 0.06 75)` first dawn light | `oklch(0.32 0.06 50)` ember      | Started the day   |
| 2         | `oklch(0.78 0.11 70)` amber            | `oklch(0.45 0.10 55)` copper     | Productive        |
| 3         | `oklch(0.65 0.14 60)` honey            | `oklch(0.58 0.13 60)` brass      | Full day          |
| 4         | `oklch(0.55 0.16 40)` terracotta       | `oklch(0.70 0.15 65)` warm sun   | Cathedral lit     |

### Semantic

- **success:** `oklch(0.65 0.13 145)` moss — confirmations only, NEVER as primary CTA
- **warning:** `oklch(0.7 0.14 80)` caution amber
- **error:** `oklch(0.6 0.20 25)` (light) / `oklch(0.7 0.19 25)` (dark) — clay red
- **info:** `oklch(0.6 0.10 230)` slate blue — rare, advisory only

## Theme System

Warm Cathedral is the soul of the product; the colored families are optional self-expression layered _on top of_ it without ever touching it. The ten rules below govern how themes are added, derived, and applied.

1. **The default is sacred.** Warm Cathedral light + dark are the untouched default, byte-for-byte. Every other theme is derived or layered; none may alter the cathedral tokens. The cathedral pair stays **hand-authored in `src/globals.css`** (never machine-generated) — brand safety over DRY.
2. **12 themes, 6 families.** Warm Cathedral (default) + five colored families — **Harbor** (calm blue), **Grove** (forest green), **Rose Tea** (dusty rose), **Iris** (soft violet), **Graphite** (near-neutral slate) — each in `{light, dark}`.
3. **The registry is the single source of truth.** `src/lib/themes/registry.ts` holds every theme as a discriminated union: `PreservedTheme` (cathedral — metadata only) or `DerivedTheme` (a colored family's accent L/C/H, a neutral tint, and a 5-stop heatmap hue path). `THEMES`, the picker, and `useThemeAxis` all derive from it — never edit them directly.
4. **Colored families are generated, the default is not.** A build-time generator (`scripts/generate-theme-css.ts`) reads the registry and emits static CSS to `src/lib/themes/generated.css`, one `:root[data-theme='id']` block per derived theme (specificity `0,2,0`, so it beats the cathedral `:root` regardless of `@import` order). The generator **skips every `preserve` theme** — cathedral is never emitted. WCAG math (`culori`) runs at **build/test time only**; it is never shipped in the client bundle. `pnpm theme:generate` regenerates; `theme:check` fails CI if the committed CSS is stale.
5. **Derivation is systematic, identity is preserved.** A derived family tints its neutral surfaces toward the family hue at the **cathedral lightness ladder** (so AA is L-driven and always holds); the accent is the family's own L/C/H; **fixed-identity tokens — `--destructive`, `--chart-1…5` — are emitted as the cathedral value unchanged for every theme**; foregrounds are contrast-computed for WCAG AA, never hand-picked.
6. **Graphite is the temperature=pride proof.** Its accent is nearly desaturated (chroma ~0.02), so the **only real chroma on screen is the heatmap bloom**. A near-monochrome chrome with a glowing heatmap is the purest statement of the north star: the year you accumulated is the color.
7. **The picker is two-axis.** Settings and the sidebar quick-switch both pick a **family** and a **mode** independently. Each family card previews the family's _real_ tokens (surface · accent · text · heatmap ramp) as a **composite swatch reconstructed at runtime from the registry** — never a single hex dot, never the culori library.
8. **System belongs to the default only.** `System` is OS-managed and maps **only** to the Warm Cathedral light/dark pair (it is a light↔dark axis, not a palette). Colored families expose Light/Dark only; choosing a colored family while on System collapses to an explicit id.
9. **Theme toggle = crossfade.** Switching theme crossfades rather than hard-cutting (Motion table, "Theme toggle"). The **whole UI** — page background/text plus component surfaces (cards, sidebar, popovers) — crossfades together (200ms `ease-out`, gated behind `motion-safe:` — `prefers-reduced-motion` users get an instant change). To keep hover/focus instant, the fade is scoped to a transient `theme-transition` class that `<ThemeTransition>` puts on `<html>` only for the switch window. _Decided 2026-06-11 (design-review #5): broadened from body-only to all surfaces._
10. **Theme lives in the web, applied as `data-theme`.** Persistence is 100% web `localStorage` (`storageKey="corelive-theme"`); next-themes sets `data-theme` on `<html>`. Tailwind `dark:` is keyed to the app's `data-theme` (`@custom-variant dark` on `[data-theme$=dark]`), **never the OS** `prefers-color-scheme`. The Electron shell reads nothing native (its vestigial `appearance.theme`/`accentColor` were removed). An unknown or stale stored id self-heals to the default on mount (`ThemeAllowlistGuard`).

**Family signatures** (accent hue; full seeds live in the registry):

| Family         | Accent hue      | Character          | Heatmap rest → apex hue |
| -------------- | --------------- | ------------------ | ----------------------- |
| Warm Cathedral | ~50 (amber)     | the default craft  | 80 → 40 (light)         |
| Harbor         | 250             | calm blue          | 235 → 42                |
| Grove          | 145             | forest green       | 140 → 42                |
| Rose Tea       | 18              | dusty rose         | 25 → 38                 |
| Iris           | 292             | soft violet        | 300 → 45                |
| Graphite       | 250 (~0 chroma) | near-neutral slate | 250 → 42                |

**Accepted hue collisions** (both AA-pass, separable by chroma/lightness, flagged in-code for design-review): **Grove** accent `145` lands exactly on the fixed `--chart-2` token (`oklch(0.65 0.13 145)`) and beside the app's success-green (`--color-success`, hue ≈149), and a green theme also dilutes green's "success-everywhere" semantic; **Rose Tea** accent `18` sits near the fixed `--destructive` (hue 25). Both ship as deliberate taste calls — the family signature is worth more than perfect hue isolation.

## Heatmap Invariance Rule

> **The heatmap's temperature = pride. The hot end blooms warm on every theme, forever — it is a CI-enforced invariant, not a guideline.**

Adding a colored family must never let the heatmap's payoff drift back toward a "GitHub-green work-grid." The guarantee has three tiers, strongest first. For **every** registered theme, `src/lib/themes/generate-theme-css.test.ts` asserts the five heatmap stops (`--hm-0` rest → `--hm-4` apex):

1. **The two hottest stops bloom warm** _(CI-locked seed constraint — the load-bearing gate)_. `--hm-3` **and** `--hm-4` hue ∈ **[20, 70]**, regardless of where the family rests. Per-stop hue is the only thing a `heatmapHues` seed actually controls, so this is what makes "more completions = hotter" read the same across families. A seed that keeps a cool body all the way up (e.g. green `[145, 145, 145, 145, 42]`) **fails the build** — the cool rest with a single warm apex _is_ the GitHub-green failure mode.
2. **Lightness moves monotonically and chroma intensifies toward the apex** _(structural — holds by construction)_. Light mode rests palest and deepens to the apex; dark mode rests darkest and brightens to it; the fullest day is the most saturated cell. The generator reuses the cathedral L/C ladder verbatim for every family, so the test here guards against a _generator_ regression, not a bad seed — a seed cannot move L or C.
3. **The cool rest stops stay the family's hue** _(intentional, unconstrained)_. `--hm-0`…`--hm-2` carry the family color — Grove rests green, Iris rests violet — and are deliberately _not_ forced warm. In a real contribution grid most cells are low-intensity, so a family genuinely reads in its own hue at the cool end, by design. The rest hue is the family's; the payoff hue is the project's.

Per-theme WCAG AA gates ride alongside (`fg/bg ≥ 7`, `muted-fg/card ≥ 4.5`, `primary-fg/primary ≥ 4.5`). A new family that cools its hot end, breaks the L/C ramp, or fails AA **fails the build** — the north-star payoff cannot regress by accident.

## Spacing

- **Base unit:** 4px
- **Density:** Comfortable (between Things 3 and Linear)
- **Scale:** `2xs(4) xs(8) sm(12) md(16) lg(24) xl(32) 2xl(48) 3xl(64) 4xl(96)`
- **Card padding:** `lg` (24px)
- **Section spacing:** `2xl` (48px) between major sections; `xl` (32px) within sections

### Heatmap-specific

- Cell size: **12px minimum, 32px maximum** (per Heatmap Cathedral plan, eng review D6 lock)
- Cell gap: 3px (light theme), 4px (dark theme — needs slightly more breathing room)

## Layout

- **Approach:** Hybrid — grid-disciplined for app surfaces, editorial moments for hero / empty states
- **Grid:** 12-column, 24px gutter
- **Max content width:** **1180px** (intentionally tighter than the 1200px convention; the few px signal restraint)
- **Border radius:**
  - sm: 4px (chips, small badges)
  - md: 8px (buttons, inputs)
  - lg: 12px (cards, dialogs)
  - xl: 16px (large modals, hero cards)
  - full: 9999px (avatar, pill badges)
- **Heatmap container:** full content-width, the home page centerpiece — never demoted to sidebar
- **Sidebar:** 248px, top-aligned navigation, Caption-style section labels

## Motion

Intentional choreography. Most motion is in the 150–250ms range. The one motion moment that earns extended duration is the **completion celebration** — the only place where the design "performs" for the user.

- **Approach:** Intentional (between minimal-functional and expressive)
- **Easing:**
  - enter: `ease-out`
  - exit: `ease-in`
  - move: `ease-in-out`
  - celebration: `cubic-bezier(0.16, 1, 0.3, 1)` (gentle overshoot)
- **Duration:**
  - micro: 50–100ms (focus rings, color shifts)
  - short: 150–250ms (hover, fade)
  - medium: 250–400ms (modal, page transition)
  - long: 400–700ms (cell completion fill, the hero motion)

### Specific motion choreography

| Action                              | Motion                              | Duration | Easing             |
| ----------------------------------- | ----------------------------------- | -------- | ------------------ |
| Task completion → Heatmap cell fill | radial-sweep fill                   | 400ms    | ease-out           |
| Task completion → checkbox fill     | amber fill (checkbox only, NOT row) | ~200ms   | ease-out           |
| Hover lift (cell, card, button)     | `translateY(-1px)` + `scale(1.04)`  | 150ms    | ease-out           |
| Page transition                     | fade                                | 200ms    | ease-out           |
| Modal / Dialog                      | `scale(0.96 → 1)` + fade            | 250ms    | celebration easing |
| Tooltip                             | fade + 4px slide-up                 | 100ms    | ease-out           |
| Theme toggle                        | crossfade (whole UI, surfaces)      | 200ms    | ease-out           |

> **Checkbox completion fill (2026-06-04, opt-in-feedback feature).** Checking a
> task plays a soft amber fill on the CHECKBOX (not the whole row) over ~200ms
> `ease-out` — short tier, deliberately NOT the heatmap's radial-sweep geometry
> or celebration easing. The heatmap-cell fill stays the single performative
> "hero" moment (400ms); the checkbox fill is the quiet, repeatable
> acknowledgment of the app's most-frequent gesture, and that restraint is what
> lets it fire on every check without fatigue. Gated behind `motion-safe:` —
> `prefers-reduced-motion` users get an instant, motionless state change. On an
> optimistic-update rollback the state snaps back instantly (no reverse-celebration).

### Forbidden

- Bounce springs (any `cubic-bezier` with overshoot >1.05 except modals)
- Confetti, particle bursts, screen-flash
- SFX, haptics — EXCEPT an opt-in palette of soft sounds at a few earned moments (default OFF; see note below)
- Scroll-driven hero animations
- Loading spinners that exceed 3s without progress text

> **Opt-in sound palette (2026-06-04 single completion sound → 2026-06-13
> widened to a palette).** The one sanctioned exception to the SFX ban: a small,
> opt-in palette of soft, warm, **non-melodic** cues at a few _earned_ task-life
> moments — creating a task, completing, and clearing completed. Each cue is a
> single short organic texture (≤~400ms), chosen from 3–5 selectable timbres at a
> user-set volume, **off by default and toggled per moment**. It is a quiet
> companion's acknowledgment — never a gamified "level-up" chime, never a melodic
> run, and never plays by default. OS mute is honored by the OS (the app does not
> detect it). At most one cue plays at a time — a rapid second action cuts/restarts
> rather than layering (scoped per window). High-frequency UI manipulation
> (reorder, category-switch) is deliberately excluded to keep these moments feeling
> earned.
>
> **Shortcut opening cue (2026-07-23; user-approved default-ON exception).**
> This Electron-only utility cue is separate from the earned-moment palette: one
> of ten brief, non-melodic keyboard textures plays only when a global shortcut
> actually transitions Floating Navigator or Brain Dump from hidden to shown.
> The default `Shuffle all` mode avoids repeating the immediately previous texture;
> people can instead pin any one cue and preview choices from Sound settings. It
> does not play when the shortcut hides a window, targets an already-visible
> window, or fails to open one. It defaults ON because an off-screen native
> shortcut needs quiet spatial confirmation, remains independently configurable
> under Sound, and never counts as a reward or completion celebration.

## Voice & Microcopy

The product talks like a quiet companion, not a coach. Microcopy is one of the few places where the north star comes through directly.

### Tooltip copy

GitHub: `8 contributions on May 9, 2026`
Things 3: `8 completed`
**corelive:** `8 things done — good day` (English) / `今日は 8 個 — お疲れさま` (Japanese)

The praise is one short phrase appended to the count. Not saccharine, not corporate.

### Empty states

- Empty Heatmap day on hover: "rest day" / "休息日" — never "0 tasks", never "missed".
- New user, never any data: "your year starts here" / "ここから始まる一年" — invitational.

### Streak replacement

Instead of "5-day streak" (creates fragility), display **"shown up 18 days this month"** — additive, generous, never decreases without explanation.

### Forbidden phrases

- "Productivity" (loaded category word)
- "Crush your tasks", "ship faster", "10x"
- "You missed a day" / 「途切れました」
- Percent-completion KPIs in primary UI ("47% complete today")

## Component Behavior Notes (CSS-variable-compatible)

The full color system maps onto the existing shadcn/ui tokens. Migration is per-token, not per-component. Every shadcn primitive in `src/components/ui/` keeps working — only the underlying CSS variables change.

- **Button (primary):** amber bg, paper-white text, 8px radius, hover lifts 1px
- **Card:** surface bg, 1px soft border, 12px radius, no shadow by default (shadow only when elevated/dragging)
- **Input:** transparent bg in light mode, white-on-white feel; focus ring uses `--ring` (amber)
- **Badge:** pill (full radius), Caption typography (12px Inter Tight 500 uppercase)
- **Tooltip:** popover bg, 4px slide-up entrance, 13px Inter Tight; max 2 lines, no markdown
- **Heatmap cell:** `<rect>` with explicit fill from `--hm-0…--hm-4` (resolved per active theme; the component reads them via the `HEATMAP_LEVEL_TOKENS` source-of-truth in `src/lib/heatmap-intensity.ts`), role=button when count>0, focus ring identical to other interactive elements

## Decisions Log

| Date       | Decision                                                                                                                                                                                                                                                                                                                                                                                                     | Rationale                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| ---------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 2026-05-10 | DESIGN.md created from `/design-consultation` (dry-run, OpenAI verification pending)                                                                                                                                                                                                                                                                                                                         | First codified design system; supersedes implicit shadcn/ui defaults                                                                                                                                                                                                                                                                                                                                                                                                             |
| 2026-05-10 | Aesthetic: Warm Cathedral (vs cold Linear / Things baseline)                                                                                                                                                                                                                                                                                                                                                 | Aligns with north star "self-affirmation feeling"; differentiates from productivity category convergence                                                                                                                                                                                                                                                                                                                                                                         |
| 2026-05-10 | Heatmap recolored from green to warm temperature gradient                                                                                                                                                                                                                                                                                                                                                    | Eureka: temperature carries the "personal pride" signal that green carries "GitHub work" — orthogonal axis to North Star                                                                                                                                                                                                                                                                                                                                                         |
| 2026-05-10 | Newsreader serif for display (vs Inter / Geist / DM Sans)                                                                                                                                                                                                                                                                                                                                                    | Productivity apps 100% converge on geometric sans; a serif says "craft" within 0.3s of page load                                                                                                                                                                                                                                                                                                                                                                                 |
| 2026-05-10 | Inter Tight (not Inter) for body                                                                                                                                                                                                                                                                                                                                                                             | Inter alone is the AI default; Tight is denser and pairs with Newsreader's character                                                                                                                                                                                                                                                                                                                                                                                             |
| 2026-05-10 | Geist Mono for data/code (vs JetBrains Mono)                                                                                                                                                                                                                                                                                                                                                                 | Warmer character, tabular-nums, fewer false-positive associations with terminal/code                                                                                                                                                                                                                                                                                                                                                                                             |
| 2026-05-10 | Streak counter replaced with "shown-up days this month"                                                                                                                                                                                                                                                                                                                                                      | Eliminates streak-guilt; empty days = rest, never failure; aligns with "self-affirmation"                                                                                                                                                                                                                                                                                                                                                                                        |
| 2026-05-10 | Tooltip copy as quiet praise, not raw stats                                                                                                                                                                                                                                                                                                                                                                  | Each hover delivers a small affirmation moment — north star delivered at the interaction layer                                                                                                                                                                                                                                                                                                                                                                                   |
| 2026-05-10 | Cell size: 12px min / 32px max                                                                                                                                                                                                                                                                                                                                                                               | Locked by Heatmap Cathedral eng review D6                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| 2026-05-10 | OKLCH color space throughout                                                                                                                                                                                                                                                                                                                                                                                 | Perceptually even gradient steps; current globals.css already uses oklch — alignment, not migration                                                                                                                                                                                                                                                                                                                                                                              |
| 2026-05-27 | Startup-window settings ("On launch") — Sunrise framing + quiet-companion microcopy                                                                                                                                                                                                                                                                                                                          | Choosing the boot window reads as "waking up for me," not "is it broken?"; the last enabled toggle locks with "At least one window opens at launch" — gentle guidance, never an error; north star: control, not KPI guilt                                                                                                                                                                                                                                                        |
| 2026-06-04 | Completion feedback: checkbox amber fill (~200ms ease-out, NOT the heatmap hero) always-on + opt-in completion sound (default OFF)                                                                                                                                                                                                                                                                           | The app's most-repeated gesture returned nothing; a quiet, design-sanctioned fill turns each check into self-affirmation without gamification. Motion stays subordinate to the heatmap hero so it repeats without fatigue; sound is opt-in so it is a deliberate choice, never default SFX (north star: self-affirmation, not dopamine hits)                                                                                                                                     |
| 2026-06-10 | Theme system expanded to 12 themes / 6 families (Warm Cathedral default + Harbor / Grove / Rose Tea / Iris / Graphite) via registry → build-time generator → static CSS; cathedral stays the untouched, hand-authored default                                                                                                                                                                                | Self-expression without diluting the default craft; the generator keeps every colored family systematic and WCAG-AA-gated, while the cathedral stays hand-authored for brand safety; `culori` runs build-only so the client bundle is unaffected                                                                                                                                                                                                                                 |
| 2026-06-10 | Heatmap "temperature = pride" locked as a CI invariant across ALL themes — the two hottest stops (`--hm-3`/`--hm-4` hue ∈ [20, 70]) are the seed gate; the L/C ramp is reused from cathedral (structural); cool rest stops stay family-hued by design                                                                                                                                                        | The north-star payoff must survive every future family — a green Grove still blooms warm at the hot end yet rests green by design; the build fails if a new theme cools its hot end, breaks the L/C ramp, or drops AA                                                                                                                                                                                                                                                            |
| 2026-06-10 | `System` maps only to the default Warm Cathedral light/dark pair; colored families are explicit Light/Dark                                                                                                                                                                                                                                                                                                   | `System` means "follow my OS light↔dark," not a palette choice — keeps the two-axis (family × mode) mental model clean                                                                                                                                                                                                                                                                                                                                                           |
| 2026-06-11 | Two hue collisions accepted (Grove accent 145 ≈ `--chart-2` 145 / `--success` 149; Rose Tea accent 18 ≈ `--destructive` 25), separable by chroma/lightness, AA-pass, flagged in-code                                                                                                                                                                                                                         | The family signature is worth more than perfect hue isolation; surfaced for design-review rather than silently compromised                                                                                                                                                                                                                                                                                                                                                       |
| 2026-06-11 | Theme toggle is a whole-UI crossfade (page + card/sidebar/popover surfaces, 200ms ease-out, `motion-safe`), scoped to a transient `theme-transition` class so hover/focus stay instant; Electron native `appearance.theme` / `accentColor` removed                                                                                                                                                           | Reduced-motion-safe transition, broadened from body-only to all surfaces (design-review #5 decided 2026-06-11); the native theme copy had zero readers and could only drift from the real web-persisted value                                                                                                                                                                                                                                                                    |
| 2026-06-13 | "Presets First, Then Options" codified as a cross-cutting principle — the concept owns every default/preset; an out-of-concept option is allowed only as an opt-in deviation layered on a sufficient on-concept default. Applies to design, features, and UX                                                                                                                                                 | Generalizes the opt-in sound palette's logic into a reusable governance rule, so future customization (themes, sound, motion, copy) follows one shape: ship the concept default, make it sufficient, then let options ride on top. The North Star itself stays non-deviable — style is optional, the emotional contract (self-affirmation, never judgment) is not                                                                                                                |
| 2026-06-25 | "Presets First, Then Options" reframed away from "zero configuration" — the concept-faithful default is now an explicit **starting point, not a ceiling**, and **every aesthetic/UX item is configurable** (theme, sound, motion, copy, layout, density) as a first-class, discoverable capability rather than a buried opt-in deviation. Title kept (referenced by code + this log); body carries the shift | Direction change from "the app just works without config" to "great defaults AND everything is yours to tune" — the user wants to configure every item their way. The good-defaults discipline stays (ship the concept default first, make it sufficient, then expose the knob); the North Star stays non-deviable — total configurability covers style/UX only, never opting into judgment (no streak-shame, no KPI mode). Amends the 2026-06-13 opt-in-deviation framing above |
| 2026-06-26 | BrainDump writing surface disables the native browser spellcheck red underlines (`spellCheck={false}` on the capture textarea, #128)                                                                                                                                                                                                                                                                         | Quick-capture must feel calm and un-graded; the red "misspelled" squiggles make unfinished / mixed-language fragments read as _corrected_, fighting the north-star calm-capture voice. Only the correction overlay is suppressed — typing / IME / save are untouched. One shared editor covers every BrainDump surface (web + Floating + BrainDump windows)                                                                                                                      |
| 2026-07-23 | Electron shortcut opening cue offers ten brief keyboard textures (typewriter + electrostatic-capacitive / Realforce-inspired), defaults to non-repeating `Shuffle all`, plays only when Floating Navigator or Brain Dump actually opens, and defaults ON as an explicit exception to the earned-moment palette's default OFF                                                                                 | This is functional spatial confirmation for an otherwise off-screen global-shortcut result, not a reward. A quiet varied default plus fixed-choice and preview controls makes the texture genuinely configurable while keeping it independent, narrowly triggered, non-melodic, and subordinate to the work itself                                                                                                                                                               |

## Implementation Migration Notes

This DESIGN.md describes the target system. Migration from current state (cold-neutral oklch + GitHub green Heatmap) is per-token in `src/globals.css`. No component code changes are required for the color/spacing migration. Typography requires:

1. Adding Newsreader, Inter Tight, Geist Mono to `<head>` (Google Fonts + Vercel)
2. Updating `body` className in `src/app/layout.tsx` to apply Inter Tight as default
3. A type-scale utility component or CSS layer for the Hero / H1 / H2 / H3 / Body / Small / Caption / Data tiers

The Heatmap palette is defined by the `--hm-0…--hm-4` tokens. For the **default Warm Cathedral**, edit them directly in `src/globals.css` (light and dark). For a **colored family**, change its `heatmapHues` seed in `src/lib/themes/registry.ts` and run `pnpm theme:generate` (the generator rewrites `src/lib/themes/generated.css`). Either way **no `ContributionGraph.tsx` change is required** — the component resolves the tokens through the `HEATMAP_LEVEL_TOKENS` source-of-truth.

Streak and tooltip copy changes are scoped to `ContributionGraph.tsx` and any future StreakBadge component (deferred to the Heatmap Cathedral plan, decision D12 / Electron-only).
