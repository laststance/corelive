'use client'

import React, { useRef, useState, useSyncExternalStore } from 'react'

import { useCycleEffect } from '@/hooks/use-cycle-effect'
import { useUpdateEffect } from '@/hooks/use-update-effect'
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

/** Shared empty-particles reference so SSR + reset snapshots stay referentially stable for useSyncExternalStore (a fresh `[]` each call trips React's "getServerSnapshot should be cached" loop guard). */
const EMPTY_CONFETTI_PARTICLES: ConfettiParticle[] = []

/**
 * Creates an external store for confetti animation lifecycle and particles.
 * @param duration - Duration before timer completes
 * @param onComplete - Callback when timer completes
 * @returns Store interface for useSyncExternalStore
 */
function createConfettiStore(duration: number) {
  let isActive = false
  let particles: ConfettiParticle[] = EMPTY_CONFETTI_PARTICLES
  let onComplete: (() => void) | undefined
  const listeners = new Set<() => void>()
  let timeoutId: ReturnType<typeof setTimeout> | null = null

  const notify = () => {
    listeners.forEach((listener) => listener())
  }

  return {
    subscribe: (listener: () => void) => {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
    getIsActiveSnapshot: () => isActive,
    getParticlesSnapshot: () => particles,
    getServerIsActiveSnapshot: () => false,
    getServerParticlesSnapshot: () => EMPTY_CONFETTI_PARTICLES,
    setOnComplete: (handler: (() => void) | undefined) => {
      onComplete = handler
    },
    start: (nextParticles: ConfettiParticle[]) => {
      if (isActive) return
      isActive = true
      particles = nextParticles
      notify()
      timeoutId = setTimeout(() => {
        isActive = false
        particles = EMPTY_CONFETTI_PARTICLES
        notify()
        onComplete?.()
      }, duration)
    },
    stop: () => {
      if (timeoutId) {
        clearTimeout(timeoutId)
        timeoutId = null
      }
      isActive = false
      particles = EMPTY_CONFETTI_PARTICLES
      notify()
    },
  }
}

/**
 * ConfettiAnimation component for celebrating task completion
 * Renders confetti particles with various colors, shapes, and sizes
 */
export const ConfettiAnimation = function ConfettiAnimation({
  trigger,
  particleCount = 50,
  duration = 3000,
  className,
  onComplete,
}: ConfettiAnimationProps) {
  const [store, setStore] = useState(() => createConfettiStore(duration))

  // Rebuild the store only when `duration` actually changes — the useState
  // initializer already built it for the mount render, so skip the mount run.
  useUpdateEffect(() => {
    setStore(createConfettiStore(duration))
  }, [duration])

  useCycleEffect(() => {
    store.setOnComplete(onComplete)
  }, [onComplete, store])

  const isActive = useSyncExternalStore(
    store.subscribe,
    store.getIsActiveSnapshot,
    store.getServerIsActiveSnapshot,
  )

  const particles = useSyncExternalStore(
    store.subscribe,
    store.getParticlesSnapshot,
    store.getServerParticlesSnapshot,
  )

  const prevTriggerRef = useRef(false)

  useCycleEffect(() => {
    const risingEdge = trigger && !prevTriggerRef.current
    prevTriggerRef.current = trigger

    if (risingEdge && !isActive) {
      store.start(generateParticles(particleCount, Date.now()))
    }
  }, [trigger, isActive, particleCount, store])

  useCycleEffect(() => () => store.stop(), [store])

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
