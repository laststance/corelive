'use client'

import { LEVEL_LABEL, xpToLevel } from '../lib/xp'

/**
 * A compact badge showing the level + progress bar for a skill node.
 * Used in node tooltips and popover headers.
 *
 * @param props - Component props.
 * @param props.xp - Total XP for the node (count of NodeAssignment rows).
 * @returns A flex layout containing the level label, progress counter, and a gold progress bar.
 *          Returns only the label (no bar) when the node is Mastered (level 5, `next === null`).
 *
 * @example
 * <XpBadge xp={0} />   // => "Dormant", "0 / 5", empty bar
 * <XpBadge xp={40} />  // => "Level 3", "10 / 20", half-filled bar
 * <XpBadge xp={75} />  // => "Mastered" (no bar, no counter)
 */
export function XpBadge({ xp }: { xp: number }) {
  const { level, progress, next } = xpToLevel(xp)
  const label = LEVEL_LABEL[level]

  return (
    <div className="flex flex-col gap-1 text-xs text-[var(--st-cream)]">
      <div className="flex items-center justify-between gap-2">
        <span className="font-medium text-[var(--st-gold)]">{label}</span>
        {next !== null && (
          // eslint-disable-next-line dslint/token-only -- tabular-nums is a valid Tailwind utility class, not a design token
          <span className="tabular-nums">
            {progress} / {next}
          </span>
        )}
      </div>
      {next !== null && (
        // Track uses --st-surface (not --st-border-rune) so the gold fill
        // meets WCAG 2.2 SC 1.4.11 non-text contrast (3:1) against the
        // empty portion of the track in BOTH themes:
        //   dark:      gold #f4d06f vs surface #2a3055 → 8.34:1 ✅
        //   parchment: gold #8b5a2b vs surface #ddc89c → 3.48:1 ✅
        // Using --st-border-rune here would pass in dark mode (4.86:1) but
        // fail in parchment mode (2.07:1) because the new ink-on-parchment
        // palette puts gold and border-rune at similar low luminance values.
        <div
          className="h-1.5 w-full overflow-hidden rounded-full bg-[var(--st-surface)]"
          role="progressbar"
          aria-label="XP progress"
          aria-valuenow={progress}
          aria-valuemin={0}
          aria-valuemax={next}
        >
          <div
            className="h-full bg-[var(--st-gold)] transition-all"
            style={{ width: `${(progress / next) * 100}%` }}
          />
        </div>
      )}
    </div>
  )
}
