'use client'

import { Trophy, Star, Gift, Medal, Crown } from 'lucide-react'
import React from 'react'

import { cn } from '@/lib/utils'

export interface Achievement {
  id: string
  title: string
  description: string
  icon: 'trophy' | 'star' | 'gift' | 'medal' | 'crown'
  rarity: 'common' | 'rare' | 'legendary'
  reward?: string
  progress?: number // 0-100
}

interface AchievementAnimationProps {
  achievement: Achievement
  className?: string
}

const ACHIEVEMENT_ICONS = {
  trophy: Trophy,
  star: Star,
  gift: Gift,
  medal: Medal,
  crown: Crown,
}

/**
 * AchievementAnimation component for displaying achievement unlocks
 * Shows animated achievement card with progress bar
 * Note: Parent component is responsible for showing/hiding the achievement
 */
export function AchievementAnimation({
  achievement,
  className,
}: AchievementAnimationProps) {
  const Icon = ACHIEVEMENT_ICONS[achievement.icon]

  return (
    <div
      className={cn('achievement-container', className)}
      data-slot="achievement-animation"
    >
      <div
        className={cn(
          'achievement-card',
          achievement.rarity === 'rare' && 'achievement-rare',
          achievement.rarity === 'legendary' && 'achievement-legendary',
        )}
        role="alert"
        aria-live="polite"
      >
        {/* Shine effect */}
        <div className="achievement-shine" />

        {/* Star effects for rare/legendary */}
        {achievement.rarity !== 'common' && (
          <div className="achievement-stars">
            <div className="achievement-star achievement-star-1" />
            <div className="achievement-star achievement-star-2" />
            <div className="achievement-star achievement-star-3" />
            <div className="achievement-star achievement-star-4" />
          </div>
        )}

        {/* Achievement badge */}
        <div className="achievement-badge">
          <div className="achievement-badge-bg" />
          <div className="achievement-badge-icon">
            <Icon className="h-10 w-10" />
          </div>
        </div>

        {/* Achievement content */}
        <h3 className="achievement-title">{achievement.title}</h3>
        <p className="achievement-description">{achievement.description}</p>

        {/* Reward display */}
        {achievement.reward && (
          <div className="achievement-reward">
            <Gift className="h-4 w-4" />
            <span>{achievement.reward}</span>
          </div>
        )}

        {/* Progress bar */}
        {achievement.progress !== undefined && (
          <div className="achievement-progress">
            <div
              className="achievement-progress-bar"
              style={
                {
                  '--achievement-progress': achievement.progress / 100,
                } as React.CSSProperties
              }
            />
          </div>
        )}
      </div>
    </div>
  )
}

/**
 * Achievement notification list for multiple achievements
 */
export function AchievementNotifications({
  className,
}: {
  className?: string
}) {
  const [achievements, setAchievements] = useState<Achievement[]>([])
  const [currentIndex, setCurrentIndex] = useState(0)

  // Show achievements one by one
  const achievement = achievements[currentIndex] || null

  const handleComplete = () => {
    if (currentIndex < achievements.length - 1) {
      setCurrentIndex(currentIndex + 1)
    } else {
      setAchievements([])
      setCurrentIndex(0)
    }
  }

  const addAchievement = (achievement: Achievement) => {
    setAchievements((prev) => [...prev, achievement])
  }

  // Expose methods via ref or context if needed
  React.useEffect(() => {
    // Example: Listen for achievement events
    const handleAchievementUnlock = (event: CustomEvent<Achievement>) => {
      addAchievement(event.detail)
    }

    window.addEventListener(
      'achievement:unlock',
      handleAchievementUnlock as EventListener,
    )
    return () => {
      window.removeEventListener(
        'achievement:unlock',
        handleAchievementUnlock as EventListener,
      )
    }
  }, [])

  return (
    <AchievementAnimation
      achievement={achievement}
      onComplete={handleComplete}
      className={className}
    />
  )
}

/**
 * Hook to trigger achievement animations
 */
export function useAchievements() {
  const unlockAchievement = (achievement: Achievement) => {
    // Dispatch custom event for achievement system
    const event = new CustomEvent('achievement:unlock', {
      detail: achievement,
    })
    window.dispatchEvent(event)
  }

  // Example achievement templates
  const templates = {
    firstTask: (): Achievement => ({
      id: 'first-task',
      title: 'First Steps',
      description: 'Complete your first task',
      icon: 'star',
      rarity: 'common',
      reward: '+10 XP',
    }),

    taskStreak: (days: number): Achievement => ({
      id: `streak-${days}`,
      title: `${days} Day Streak!`,
      description: `Complete tasks for ${days} consecutive days`,
      icon: 'trophy',
      rarity: days >= 30 ? 'legendary' : days >= 7 ? 'rare' : 'common',
      reward: `+${days * 5} XP`,
    }),

    levelMilestone: (level: number): Achievement => ({
      id: `level-${level}`,
      title: `Level ${level} Master`,
      description: `Reach level ${level}`,
      icon: 'crown',
      rarity: level >= 50 ? 'legendary' : level >= 25 ? 'rare' : 'common',
      reward: 'New theme unlocked!',
    }),

    monthlyChallenge: (month: string): Achievement => ({
      id: `monthly-${month}`,
      title: `${month} Champion`,
      description: `Complete the ${month} challenge`,
      icon: 'medal',
      rarity: 'rare',
      reward: 'Exclusive badge',
      progress: 100,
    }),
  }

  return {
    unlockAchievement,
    templates,
  }
}
