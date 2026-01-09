'use client'

import React, { useRef, useMemo, useState, useSyncExternalStore } from 'react'

import { cn } from '@/lib/utils'

interface ConfettiParticle {
  id: number
  left: number
  delay: number
  duration: number
  colorClass: string
  shapeClass: string
  sizeClass: string
}

interface ConfettiAnimationProps {
  trigger: boolean
  particleCount?: number
  duration?: number
  className?: string
  onComplete?: () => void
}

/**
 * Generates random confetti particles
 * @param count - Number of particles to generate
 * @param seed - Seed for unique particle IDs
 * @returns Array of ConfettiParticle objects
 */
function generateParticles(count: number, seed: number): ConfettiParticle[] {
  return Array.from({ length: count }, (_, i) => ({
    id: seed + i,
    left: Math.random() * 100,
    delay: Math.random() * 5,
    duration: 1 + Math.random() * 2,
    colorClass: `confetti-color-${Math.ceil(Math.random() * 5)}`,
    shapeClass: (
      [
        'confetti-square',
        'confetti-circle',
        'confetti-triangle',
        'confetti-ribbon',
      ] as const
    )[Math.floor(Math.random() * 4)] as string,
    sizeClass: (
      ['confetti-small', 'confetti-medium', 'confetti-large'] as const
    )[Math.floor(Math.random() * 3)] as string,
  }))
}

/**
 * Creates a timer store for managing animation lifecycle
 * @param duration - Duration before timer completes
 * @param onComplete - Callback when timer completes
 * @returns Store interface for useSyncExternalStore
 */
function createTimerStore(duration: number, onComplete?: () => void) {
  let isActive = false
  const listeners = new Set<() => void>()
  let timeoutId: ReturnType<typeof setTimeout> | null = null

  return {
    subscribe: (listener: () => void) => {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
    getSnapshot: () => isActive,
    getServerSnapshot: () => false,
    start: () => {
      if (isActive) return
      isActive = true
      listeners.forEach((l) => l())
      timeoutId = setTimeout(() => {
        isActive = false
        listeners.forEach((l) => l())
        onComplete?.()
      }, duration)
    },
    stop: () => {
      if (timeoutId) {
        clearTimeout(timeoutId)
        timeoutId = null
      }
      isActive = false
      listeners.forEach((l) => l())
    },
  }
}

/**
 * ConfettiAnimation component for celebrating task completion
 * Renders confetti particles with various colors, shapes, and sizes
 */
export function ConfettiAnimation({
  trigger,
  particleCount = 50,
  duration = 3000,
  className,
  onComplete,
}: ConfettiAnimationProps) {
  const prevTriggerRef = useRef(false)
  const particleSeedRef = useRef(Date.now())

  // Create stable timer store
  const timerStoreRef = useRef<ReturnType<typeof createTimerStore> | null>(null)
  if (!timerStoreRef.current) {
    timerStoreRef.current = createTimerStore(duration, onComplete)
  }

  const isActive = useSyncExternalStore(
    timerStoreRef.current.subscribe,
    timerStoreRef.current.getSnapshot,
    timerStoreRef.current.getServerSnapshot,
  )

  // Detect trigger rising edge during render (not in effect)
  if (trigger && !prevTriggerRef.current && !isActive) {
    particleSeedRef.current = Date.now()
    timerStoreRef.current.start()
  }
  prevTriggerRef.current = trigger

  // Compute particles only when active (derived state via useMemo)
  const particles = useMemo(() => {
    if (!isActive) return []
    return generateParticles(particleCount, particleSeedRef.current)
  }, [isActive, particleCount])

  if (particles.length === 0) return null

  return (
    <div
      className={cn('confetti-container', className)}
      aria-hidden="true"
      data-slot="confetti-animation"
    >
      {particles.map((particle) => (
        <div
          key={particle.id}
          className={cn(
            'confetti-particle',
            particle.colorClass,
            particle.shapeClass,
            particle.sizeClass,
            `confetti-delay-${Math.ceil(particle.delay)}`,
          )}
          style={{
            left: `${particle.left}%`,
            animationDuration: `${particle.duration}s`,
          }}
        />
      ))}
    </div>
  )
}

/**
 * Hook to trigger confetti animation
 */
export function useConfetti() {
  const [trigger, setTrigger] = useState(false)

  const celebrate = () => {
    setTrigger(true)
    setTimeout(() => setTrigger(false), 100)
  }

  return { trigger, celebrate }
}
