'use client'

import { useSyncExternalStore } from 'react'

import { getLocalTodayIsoDate } from '@/lib/getLocalTodayIsoDate'
import { getMillisecondsUntilNextLocalDay } from '@/lib/utils/getMillisecondsUntilNextLocalDay'

/**
 * Subscribes the active page to local-midnight and app-resume notifications so relative date filters never go stale.
 * @param onStoreChange - React callback that requests a fresh local-day snapshot.
 * @returns Cleanup that removes browser listeners and the scheduled midnight timeout.
 * @example
 * const unsubscribe = subscribeToLocalDay(() => console.log('local day may have changed'))
 */
function subscribeToLocalDay(onStoreChange: () => void): () => void {
  let timeoutId: ReturnType<typeof setTimeout> | undefined

  /**
   * Re-arms the one-shot timeout after every midnight or foreground refresh.
   * @returns Nothing after replacing the previous timeout.
   * @example
   * scheduleNextLocalDay()
   */
  function scheduleNextLocalDay(): void {
    if (timeoutId !== undefined) clearTimeout(timeoutId)
    timeoutId = setTimeout(() => {
      onStoreChange()
      scheduleNextLocalDay()
    }, getMillisecondsUntilNextLocalDay())
  }

  /**
   * Re-checks the snapshot when a suspended/backgrounded app becomes active, then corrects its next timeout.
   * @returns Nothing after notifying React and re-arming midnight.
   * @example
   * refreshAfterPause()
   */
  function refreshAfterPause(): void {
    onStoreChange()
    scheduleNextLocalDay()
  }

  /**
   * Refreshes only when the document becomes visible because hiding it cannot advance the displayed local day.
   * @returns Nothing after optionally forwarding the foreground refresh.
   * @example
   * document.dispatchEvent(new Event('visibilitychange'))
   */
  function handleVisibilityChange(): void {
    if (document.visibilityState === 'visible') refreshAfterPause()
  }

  scheduleNextLocalDay()
  window.addEventListener('focus', refreshAfterPause)
  document.addEventListener('visibilitychange', handleVisibilityChange)

  return () => {
    if (timeoutId !== undefined) clearTimeout(timeoutId)
    window.removeEventListener('focus', refreshAfterPause)
    document.removeEventListener('visibilitychange', handleVisibilityChange)
  }
}

/**
 * Reads the browser's current YYYY-MM-DD key whenever React checks the external local-day store.
 * @returns Current calendar day in the browser's resolved timezone.
 * @example
 * getLocalDaySnapshot() // => '2026-07-14'
 */
function getLocalDaySnapshot(): string {
  return getLocalTodayIsoDate()
}

/**
 * Supplies an SSR snapshot using the render environment's calendar day until hydration corrects it for the browser zone.
 * @returns Current YYYY-MM-DD key in the render environment.
 * @example
 * getServerLocalDaySnapshot() // => '2026-07-14'
 */
function getServerLocalDaySnapshot(): string {
  return getLocalTodayIsoDate()
}

/**
 * Returns a tear-free local-day key for relative period queries and updates it at midnight or after app foregrounding.
 * @returns Current browser-local day as YYYY-MM-DD.
 * @example
 * const localDayKey = useLocalDayKey()
 */
export function useLocalDayKey(): string {
  return useSyncExternalStore(
    subscribeToLocalDay,
    getLocalDaySnapshot,
    getServerLocalDaySnapshot,
  )
}
