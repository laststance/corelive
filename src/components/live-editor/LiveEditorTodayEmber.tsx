'use client'

import { useTodayKeeps } from '@/hooks/useTodayKeeps'

import { TodayEmber } from './TodayEmber'

/**
 * Subscribes to today's keeps only while {@link LiveEditor} has its Ember setting enabled.
 * @param props - Whether the desktop panel needs the compact Ember.
 * @returns The shared Ember with the current device or account count.
 * @example
 * <LiveEditorTodayEmber compact />
 */
export function LiveEditorTodayEmber({ compact }: { compact: boolean }) {
  const todayKeeps = useTodayKeeps()

  return (
    <div className={compact ? undefined : 'mb-3'}>
      <TodayEmber count={todayKeeps} compact={compact} />
    </div>
  )
}
