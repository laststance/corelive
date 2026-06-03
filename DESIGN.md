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
| `--ring`                 | `oklch(0.62 0.16 50)`   | Focus ring = primary amber                                  |
| `--primary`              | `oklch(0.62 0.16 50)`   | Amber CTA                                                   |
| `--primary-foreground`   | `oklch(0.99 0 0)`       | Paper text on amber                                         |
| `--secondary`            | `oklch(0.942 0.024 78)` | Quiet button bg                                             |
| `--secondary-foreground` | `oklch(0.18 0.015 30)`  | Same as foreground                                          |
| `--accent`               | `oklch(0.942 0.024 78)` | Hover surfaces                                              |
| `--accent-foreground`    | `oklch(0.18 0.015 30)`  |                                                             |
| `--muted`                | `oklch(0.942 0.024 78)` | Disabled/quiet bg                                           |
| `--destructive`          | `oklch(0.6 0.20 25)`    | Clay red, retuned warmer than the default oklch destructive |

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

| Action                              | Motion                             | Duration | Easing             |
| ----------------------------------- | ---------------------------------- | -------- | ------------------ |
| Task completion → Heatmap cell fill | radial-sweep fill                  | 400ms    | ease-out           |
| Hover lift (cell, card, button)     | `translateY(-1px)` + `scale(1.04)` | 150ms    | ease-out           |
| Page transition                     | fade                               | 200ms    | ease-out           |
| Modal / Dialog                      | `scale(0.96 → 1)` + fade           | 250ms    | celebration easing |
| Tooltip                             | fade + 4px slide-up                | 100ms    | ease-out           |
| Theme toggle                        | crossfade (no transition flash)    | n/a      | n/a                |

### Forbidden

- Bounce springs (any `cubic-bezier` with overshoot >1.05 except modals)
- Confetti, particle bursts, screen-flash
- SFX, haptics
- Scroll-driven hero animations
- Loading spinners that exceed 3s without progress text

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
- **Heatmap cell:** `<rect>` with explicit fill from `--heatmap-level-N`, role=button when count>0, focus ring identical to other interactive elements

## Decisions Log

| Date       | Decision                                                                             | Rationale                                                                                                                                                                                                                 |
| ---------- | ------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 2026-05-10 | DESIGN.md created from `/design-consultation` (dry-run, OpenAI verification pending) | First codified design system; supersedes implicit shadcn/ui defaults                                                                                                                                                      |
| 2026-05-10 | Aesthetic: Warm Cathedral (vs cold Linear / Things baseline)                         | Aligns with north star "self-affirmation feeling"; differentiates from productivity category convergence                                                                                                                  |
| 2026-05-10 | Heatmap recolored from green to warm temperature gradient                            | Eureka: temperature carries the "personal pride" signal that green carries "GitHub work" — orthogonal axis to North Star                                                                                                  |
| 2026-05-10 | Newsreader serif for display (vs Inter / Geist / DM Sans)                            | Productivity apps 100% converge on geometric sans; a serif says "craft" within 0.3s of page load                                                                                                                          |
| 2026-05-10 | Inter Tight (not Inter) for body                                                     | Inter alone is the AI default; Tight is denser and pairs with Newsreader's character                                                                                                                                      |
| 2026-05-10 | Geist Mono for data/code (vs JetBrains Mono)                                         | Warmer character, tabular-nums, fewer false-positive associations with terminal/code                                                                                                                                      |
| 2026-05-10 | Streak counter replaced with "shown-up days this month"                              | Eliminates streak-guilt; empty days = rest, never failure; aligns with "self-affirmation"                                                                                                                                 |
| 2026-05-10 | Tooltip copy as quiet praise, not raw stats                                          | Each hover delivers a small affirmation moment — north star delivered at the interaction layer                                                                                                                            |
| 2026-05-10 | Cell size: 12px min / 32px max                                                       | Locked by Heatmap Cathedral eng review D6                                                                                                                                                                                 |
| 2026-05-10 | OKLCH color space throughout                                                         | Perceptually even gradient steps; current globals.css already uses oklch — alignment, not migration                                                                                                                       |
| 2026-05-27 | Startup-window settings ("On launch") — Sunrise framing + quiet-companion microcopy  | Choosing the boot window reads as "waking up for me," not "is it broken?"; the last enabled toggle locks with "At least one window opens at launch" — gentle guidance, never an error; north star: control, not KPI guilt |

## Implementation Migration Notes

This DESIGN.md describes the target system. Migration from current state (cold-neutral oklch + GitHub green Heatmap) is per-token in `src/globals.css`. No component code changes are required for the color/spacing migration. Typography requires:

1. Adding Newsreader, Inter Tight, Geist Mono to `<head>` (Google Fonts + Vercel)
2. Updating `body` className in `src/app/layout.tsx` to apply Inter Tight as default
3. A type-scale utility component or CSS layer for the Hero / H1 / H2 / H3 / Body / Small / Caption / Data tiers

The Heatmap palette swap touches `src/globals.css` (`--heatmap-level-N` for both light and dark), no `ContributionGraph.tsx` change required.

Streak and tooltip copy changes are scoped to `ContributionGraph.tsx` and any future StreakBadge component (deferred to the Heatmap Cathedral plan, decision D12 / Electron-only).
