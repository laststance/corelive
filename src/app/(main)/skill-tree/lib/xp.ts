/**
 * Result of converting raw XP into level + in-level progress.
 * - `level`: 0 (Dormant) through 5 (Mastered)
 * - `progress`: XP earned within the current level (resets to 0 at each threshold)
 * - `next`: size of the current level's XP bar (XP required to reach the next level).
 *           `null` when Mastered.
 */
export interface LevelInfo {
  level: 0 | 1 | 2 | 3 | 4 | 5
  progress: number
  next: number | null
}

/**
 * Cumulative XP boundaries for each level, encoded as `[floor, ceil]` tuples.
 * `ceil - floor` is the size of that level's XP bar.
 *
 *     xp < 5     → level 0 (Dormant)
 *     xp < 15    → level 1
 *     xp < 30    → level 2
 *     xp < 50    → level 3
 *     xp < 75    → level 4
 *     xp >= 75   → level 5 (Mastered, handled separately in xpToLevel)
 */
const LEVEL_RANGES: ReadonlyArray<[floor: number, ceil: number]> = [
  [0, 5], // level 0: 5 XP bar
  [5, 15], // level 1: 10 XP bar
  [15, 30], // level 2: 15 XP bar
  [30, 50], // level 3: 20 XP bar
  [50, 75], // level 4: 25 XP bar
]

/**
 * Converts a raw XP count into the display level + progress bar info.
 * @param xp - Total XP for a single node (count of NodeAssignment rows).
 * @returns
 * - `{ level: 0, progress: 0-4, next: 5 }` for Dormant
 * - `{ level: 1-4, progress: 0-(next-1), next: size of bar }` for active levels
 * - `{ level: 5, progress: 0, next: null }` for Mastered
 * @example
 * xpToLevel(0)   // => { level: 0, progress: 0, next: 5 }
 * xpToLevel(5)   // => { level: 1, progress: 0, next: 10 }
 * xpToLevel(40)  // => { level: 3, progress: 10, next: 20 }
 * xpToLevel(75)  // => { level: 5, progress: 0, next: null }
 */
export function xpToLevel(xp: number): LevelInfo {
  const clamped = Math.max(0, xp)

  // Mastered: 75+ XP
  if (clamped >= 75) {
    return { level: 5, progress: 0, next: null }
  }

  // Find the highest level whose floor <= clamped (iterate high→low)
  for (let i = LEVEL_RANGES.length - 1; i >= 0; i--) {
    const range = LEVEL_RANGES[i]
    if (range !== undefined && clamped >= range[0]) {
      return {
        level: i as LevelInfo['level'],
        progress: clamped - range[0],
        next: range[1] - range[0],
      }
    }
  }

  // Unreachable fallback for TypeScript
  return { level: 0, progress: 0, next: 5 }
}
