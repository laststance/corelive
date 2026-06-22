'use client'

import { Trophy, Star } from 'lucide-react'
import React, { useRef, useState, useSyncExternalStore } from 'react'

import { useCycleEffect } from '@/hooks/use-cycle-effect'
import { cn } from '@/lib/utils'

/**
 * Creates a timer store for managing animation visibility
 * @param duration - Duration before timer completes
 * @param onComplete - Callback when timer completes
 * @returns Store interface for useSyncExternalStore
 */
function createVisibilityStore(duration: number) {
  let isVisible = false
  let onComplete: (() => void) | undefined
  const listeners = new Set<() => void>()
  let timeoutId: ReturnType<typeof setTimeout> | null = null

  return {
    subscribe: (listener: () => void) => {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
    getSnapshot: () => isVisible,
    getServerSnapshot: () => false,
    setOnComplete: (handler: (() => void) | undefined) => {
      onComplete = handler
    },
    show: () => {
      if (isVisible) return
      isVisible = true
      listeners.forEach((l) => l())
      timeoutId = setTimeout(() => {
        isVisible = false
        listeners.forEach((l) => l())
        onComplete?.()
      }, duration)
    },
    hide: () => {
      if (timeoutId) {
        clearTimeout(timeoutId)
        timeoutId = null
      }
      isVisible = false
      listeners.forEach((l) => l())
    },
  }
}

/**
 * Drives show/hide timing for level-up overlays via an external store.
 * @param show - Whether the parent wants the animation visible
 * @param duration - How long the overlay stays visible
 * @param onComplete - Optional callback after the overlay hides
 * @returns Whether the overlay is currently visible
 */
function useVisibilityAnimation(
  show: boolean,
  duration: number,
  onComplete?: () => void,
) {
  const [store, setStore] = useState(() => createVisibilityStore(duration))

  useCycleEffect(() => {
    setStore(createVisibilityStore(duration))
  }, [duration])

  useCycleEffect(() => {
    store.setOnComplete(onComplete)
  }, [onComplete, store])

  const isVisible = useSyncExternalStore(
    store.subscribe,
    store.getSnapshot,
    store.getServerSnapshot,
  )

  const prevShowRef = useRef(false)

  useCycleEffect(() => {
    const risingEdge = show && !prevShowRef.current
    prevShowRef.current = show

    if (risingEdge && !isVisible) {
      store.show()
    }
  }, [show, isVisible, store])

  useCycleEffect(() => () => store.hide(), [store])

  return isVisible
}

interface LevelUpAnimationProps {
  level: number
  show: boolean
  onComplete?: () => void
  className?: string
}

/**
 * LevelUpAnimation component for celebrating user level progression
 * Displays an animated badge with level number and effects
 */
export const LevelUpAnimation = function LevelUpAnimation({
  level,
  show,
  onComplete,
  className,
}: LevelUpAnimationProps) {
  const isVisible = useVisibilityAnimation(show, 4000, onComplete)

  if (!isVisible) return null

  return (
    <div
      className={cn('level-up-container', className)}
      aria-live="polite"
      aria-label={`Congratulations! You've reached level ${level}`}
      data-slot="level-up-animation"
    >
      <div className="level-up-badge">
        {/* Background effects */}
        <div className="level-up-bg-circle" />
        <div className="level-up-bg-rays" />

        {/* Sparkle effect */}
        <div className="level-up-sparkle" />

        {/* Level icon */}
        <div className="level-up-icon">{level}</div>

        {/* Particle effects */}
        <div className="level-up-particle level-up-particle-1" />
        <div className="level-up-particle level-up-particle-2" />
        <div className="level-up-particle level-up-particle-3" />
        <div className="level-up-particle level-up-particle-4" />
      </div>

      {/* Text content */}
      <div className="level-up-text">
        <h3 className="level-up-title">Level Up!</h3>
        <p className="level-up-subtitle">You've reached level {level}</p>
      </div>
    </div>
  )
}

/**
 * Milestone level up animation with special effects
 */
export const MilestoneLevelUpAnimation = function MilestoneLevelUpAnimation({
  level,
  show,
  milestone,
  reward,
  onComplete,
  className,
}: LevelUpAnimationProps & { milestone: string; reward?: string }) {
  const isVisible = useVisibilityAnimation(show, 5000, onComplete)

  if (!isVisible) return null

  return (
    <div
      className={cn('level-up-container', className)}
      aria-live="polite"
      aria-label={`Amazing! You've reached ${milestone} at level ${level}`}
      data-slot="milestone-level-up-animation"
    >
      <div className="level-up-badge achievement-legendary">
        {/* Enhanced background effects */}
        <div className="level-up-bg-circle" />
        <div className="level-up-bg-rays" />
        <div className="level-up-sparkle" />

        {/* Trophy icon for milestones */}
        <div className="level-up-icon">
          <Trophy className="h-10 w-10" />
        </div>

        {/* Extra star particles */}
        {[...Array(8)].map((_, i) => (
          <div
            key={i}
            className="level-up-particle"
            style={{
              top: '50%',
              left: '50%',
              animation: `levelUpParticle${(i % 4) + 1} var(--duration-slow) var(--ease-out) forwards`,
              animationDelay: `${i * 100}ms`,
            }}
          />
        ))}
      </div>

      {/* Enhanced text content */}
      <div className="level-up-text">
        <h3 className="level-up-title flex items-center gap-2">
          <Star className="h-5 w-5 text-yellow-500" />
          {milestone}
          <Star className="h-5 w-5 text-yellow-500" />
        </h3>
        <p className="level-up-subtitle">Level {level} Achieved!</p>
        {reward && (
          <p className="mt-2 text-sm text-muted-foreground">Reward: {reward}</p>
        )}
      </div>
    </div>
  )
}

/**
 * Hook to manage level up animations
 */
export function useLevelUp() {
  const [currentLevel, setCurrentLevel] = useState(1)
  const [showAnimation, setShowAnimation] = useState(false)

  const levelUp = (newLevel: number) => {
    setCurrentLevel(newLevel)
    setShowAnimation(true)
  }

  const hideAnimation = () => {
    setShowAnimation(false)
  }

  return {
    currentLevel,
    showAnimation,
    levelUp,
    hideAnimation,
  }
}
