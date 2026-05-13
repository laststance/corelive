'use client'

import { useUser } from '@clerk/nextjs'
import { useRef } from 'react'

import type { StreakTier } from '@/lib/calc-streak'
import { calcStreak, STREAK_TIERS } from '@/lib/calc-streak'
import { log } from '@/lib/logger'

import { useCycleEffect } from './use-cycle-effect'
import { useElectronNotifications } from './useElectronNotifications'
import type { HeatmapDay } from './useHeatmapData'

/**
 * localStorage key *prefix* that stores the highest tier ever notified.
 * The full key is `${STORAGE_KEY_PREFIX}${clerkUserId}` so two accounts
 * sharing one browser/Electron profile do not suppress each other's
 * milestones. Once a tier fires (per account), it stays fired — the
 * value never decreases. This guarantees the "additive, generous, never
 * decreases without explanation" rule from DESIGN.md D12: rebuilding a
 * broken streak does not re-trigger an already-celebrated milestone.
 */
const STORAGE_KEY_PREFIX = 'corelive.streak-max-tier-notified.'

/**
 * Builds the per-user localStorage key. The Clerk `userId` is a stable
 * `user_…` identifier that survives reloads but resets on sign-out.
 *
 * @param userId - Clerk user id from `useUser().user.id`
 * @returns The fully namespaced localStorage key for this account
 * @example
 * storageKeyFor('user_2fT2GATLWCa…')
 * // => 'corelive.streak-max-tier-notified.user_2fT2GATLWCa…'
 */
function storageKeyFor(userId: string): string {
  return `${STORAGE_KEY_PREFIX}${userId}`
}

/**
 * Copy bundle for one milestone tier. Voice is "quiet companion, not coach"
 * per DESIGN.md §Voice & Microcopy — short title, one-line body, never
 * exclamatory, never KPI ("you crushed it").
 */
type TierCopy = {
  title: string
  body: string
}

/**
 * Display copy keyed by tier day count. The phrases are additive ("a year
 * of showing up") rather than streak-anxious ("don't break the chain") so
 * the notification reinforces self-affirmation, not fragility.
 *
 * Tags are reused so each tier's macOS notification replaces any previous
 * banner of the same tier rather than stacking.
 */
const TIER_COPY: Record<NonNullable<StreakTier>, TierCopy & { tag: string }> = {
  7: {
    title: 'Day 7 of showing up.',
    body: 'the cathedral remembers.',
    tag: 'streak-tier-7',
  },
  30: {
    title: 'Day 30 — a month of light.',
    body: 'the room is filling in, one quiet day at a time.',
    tag: 'streak-tier-30',
  },
  100: {
    title: 'Day 100 — steady hands.',
    body: 'something gets built when you keep showing up.',
    tag: 'streak-tier-100',
  },
  365: {
    title: 'A year of showing up.',
    body: 'this is yours now.',
    tag: 'streak-tier-365',
  },
}

/**
 * Reads the stored "max tier ever notified" from localStorage. Returns 0
 * when the key is absent, malformed, or holds a value that is not one of
 * the canonical tiers (someone hand-edited it, or a future version stored
 * a different schema) — restricting to {@link STREAK_TIERS} keeps a
 * tampered/spurious "5000" from blocking every real future milestone.
 *
 * @returns
 * - One of 0 / 7 / 30 / 100 / 365 (the canonical tier set, or 0 on miss)
 * @example
 * readStoredTier() // => 0 on first run
 * readStoredTier() // => 7 after Day-7 fires
 */
function readStoredTier(storageKey: string): number {
  if (typeof window === 'undefined') return 0
  try {
    const raw = window.localStorage.getItem(storageKey)
    if (!raw) return 0
    const parsed = Number.parseInt(raw, 10)
    if (!Number.isFinite(parsed)) return 0
    // Only accept values that exist in the canonical tier set — guards
    // against a stale schema or hand-edited value capping real progress.
    return (STREAK_TIERS as readonly number[]).includes(parsed) ? parsed : 0
  } catch {
    return 0
  }
}

/**
 * Persists the max-tier-notified value. Swallows storage errors so the
 * notification flow keeps working in restricted environments — failing to
 * dedupe is preferable to throwing inside a render-triggered effect.
 *
 * @param tier - Non-negative integer tier value to persist
 * @example
 * writeStoredTier(7)
 */
function writeStoredTier(storageKey: string, tier: number): void {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.setItem(storageKey, String(tier))
  } catch (error) {
    log.warn('Failed to persist streak tier', error)
  }
}

/**
 * Side-effect hook that fires a one-shot Electron notification when the
 * user crosses a "shown up N days" milestone (7 / 30 / 100 / 365). The
 * hook is a pure consumer — composing {@link useElectronNotifications}
 * and {@link calcStreak} — so the only persistent state it owns is the
 * `corelive.streak-max-tier-notified` localStorage key.
 *
 * Why localStorage instead of `electron-store`: corelive.app loads inside
 * an Electron `BrowserWindow` pointing at the production origin, so
 * localStorage is shared with the web app and survives quit/relaunch
 * without adding an Electron-only dependency. Per-device dedupe is the
 * right grain — a fresh install legitimately re-celebrates the milestone
 * once.
 *
 * Behavioral guarantees:
 * - The hook is a no-op outside Electron (web users get the heatmap, not a
 *   permissioned banner).
 * - The hook never *decreases* the stored tier (a broken-and-rebuilt streak
 *   does not re-fire — additive only, per DESIGN.md D12).
 * - The hook never fires for streaks below 7 (the first tier).
 * - The hook waits on the heatmap query — `isLoading` skips the effect so
 *   stale `0` does not race the real data.
 *
 * @param input.dataByDate - Per-day heatmap entries from `useHeatmapData()`
 * @param input.isLoading - Whether the heatmap query is still settling
 * @param input.isRestoring - TanStack Query persister rehydration sentinel
 *   (`useIsRestoring()`). Skipping the effect while restoring prevents a
 *   stale persisted snapshot from firing the wrong tier *before* the live
 *   fetch settles — without this gate a long-offline user could trip the
 *   max-tier latch with last week's data and never see future milestones.
 * @param input.now - Optional injection for tests; defaults to `new Date()`
 * @returns
 * - Nothing — the hook is fire-and-forget
 * @example
 * const { dataByDate, isLoading } = useHeatmapData()
 * const isRestoring = useIsRestoring()
 * useStreakNotifications({ dataByDate, isLoading, isRestoring })
 */
export function useStreakNotifications(input: {
  dataByDate: Map<string, HeatmapDay>
  isLoading: boolean
  isRestoring?: boolean
  now?: Date
}): void {
  const { dataByDate, isLoading, isRestoring, now } = input
  const { isSupported, isEnabled, showNotification } =
    useElectronNotifications()
  // Scope the dedupe key to the signed-in Clerk user so two accounts
  // sharing one browser/Electron profile do not suppress each other's
  // milestones. When the user is signed out, `userId` is `undefined`
  // and the effect short-circuits (no heatmap data either, so this is
  // already a no-op path in practice).
  const { user } = useUser()
  const userId = user?.id

  // Latch on a ref so a Strict-Mode double-invoke or React 19 re-render does
  // not redundantly call `showNotification` for the same tier inside one
  // session before localStorage write settles. The persistent dedupe is
  // localStorage; this is just the in-memory edge-case guard.
  //
  // The latch is keyed by `userId` so a sign-out → sign-in-as-different-user
  // in the same session does not leak the previous account's tier into the
  // new account's notification gate (CodeRabbit #4 follow-up).
  const latchedTierRef = useRef<{ userId: string | null; tier: number }>({
    userId: null,
    tier: 0,
  })

  useCycleEffect(() => {
    if (!isSupported || !isEnabled) return
    if (isLoading) return
    // Wait for the TanStack Query persister to finish rehydrating before
    // reading streak data — otherwise the live fetch may swap in moments
    // after we'd already latched the wrong tier from a cached snapshot.
    if (isRestoring) return
    if (dataByDate.size === 0) return
    // Cannot scope the dedupe key without a stable user id; defer the
    // milestone instead of firing under a global namespace.
    if (!userId) return

    // Reset the in-memory latch when the signed-in user changes.
    if (latchedTierRef.current.userId !== userId) {
      latchedTierRef.current = { userId, tier: 0 }
    }

    const { currentTier } = calcStreak(dataByDate, now ?? new Date())
    if (currentTier === null) return

    const storageKey = storageKeyFor(userId)
    const storedTier = Math.max(
      readStoredTier(storageKey),
      latchedTierRef.current.tier,
    )
    if (currentTier <= storedTier) return

    const copy = TIER_COPY[currentTier]
    latchedTierRef.current = { userId, tier: currentTier }

    // Write-then-notify: persist the new max tier BEFORE showing so a crash
    // mid-notification (or a user-rejected permission) does not double-fire
    // on next mount. Failing-quiet is intentional (writeStoredTier swallows
    // errors) since over-notification is the worst outcome to recover from.
    writeStoredTier(storageKey, currentTier)
    showNotification(copy.title, copy.body, {
      tag: copy.tag,
      silent: false,
    }).catch((error) => {
      log.warn('Failed to show streak tier notification', error)
    })
  }, [
    dataByDate,
    isLoading,
    isRestoring,
    isSupported,
    isEnabled,
    showNotification,
    now,
    userId,
  ])
}
