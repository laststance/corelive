'use client'

import { xpToLevel } from '../lib/xp'

/**
 * Maps level 0-5 to their display labels.
 * Typed as `Record<0 | 1 | 2 | 3 | 4 | 5, string>` so TypeScript narrows
 * `LABEL[level]` to `string` (not `string | undefined`) under
 * `noUncheckedIndexedAccess: true`, because the index type exactly covers
 * the union — all keys are always present.
 */
const LABEL: Record<0 | 1 | 2 | 3 | 4 | 5, string> = {
  0: 'Dormant',
  1: 'Level 1',
  2: 'Level 2',
  3: 'Level 3',
  4: 'Level 4',
  5: 'Mastered',
}

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
  const label = LABEL[level]
  const isMastered = next === null

  return (
    <div className="flex flex-col gap-1 text-xs text-[var(--st-cream)]">
      <div className="flex items-center justify-between gap-2">
        <span className="font-medium text-[var(--st-gold)]">{label}</span>
        {!isMastered && (
          // eslint-disable-next-line dslint/token-only -- tabular-nums is a valid Tailwind utility class, not a design token
          <span className="tabular-nums">
            {progress} / {next}
          </span>
        )}
      </div>
      {!isMastered && (
        <div
          className="h-1.5 w-full overflow-hidden rounded-full bg-[var(--st-border-rune)]"
          role="progressbar"
          aria-valuenow={progress}
          aria-valuemin={0}
          aria-valuemax={next ?? 100}
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
