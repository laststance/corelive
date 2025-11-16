'use client'

import { Trophy, Star } from 'lucide-react'
import React, { useEffect, useState } from 'react'

import { cn } from '@/lib/utils'

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
export function LevelUpAnimation({
  level,
  show,
  onComplete,
  className,
}: LevelUpAnimationProps) {
  const [isVisible, setIsVisible] = useState(false)

  useEffect(() => {
    if (show && !isVisible) {
      setIsVisible(true)

      // Auto-hide after animation completes
      const timer = setTimeout(() => {
        setIsVisible(false)
        onComplete?.()
      }, 4000) // Total animation duration

      return () => clearTimeout(timer)
    }
  }, [show, isVisible, onComplete])

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

        {/* Sparkle effect for premium themes */}
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
export function MilestoneLevelUpAnimation({
  level,
  show,
  milestone,
  reward,
  onComplete,
  className,
}: LevelUpAnimationProps & {
  milestone: string
  reward?: string
}) {
  const [isVisible, setIsVisible] = useState(false)

  useEffect(() => {
    if (show && !isVisible) {
      setIsVisible(true)

      // Auto-hide after animation completes
      const timer = setTimeout(() => {
        setIsVisible(false)
        onComplete?.()
      }, 5000) // Longer duration for milestone

      return () => clearTimeout(timer)
    }
  }, [show, isVisible, onComplete])

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
