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
        <div
          className="h-1.5 w-full overflow-hidden rounded-full bg-[var(--st-border-rune)]"
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
