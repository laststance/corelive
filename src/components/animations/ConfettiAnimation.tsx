'use client'

import React, { useEffect, useState } from 'react'

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
  const [particles, setParticles] = useState<ConfettiParticle[]>([])
  const [isActive, setIsActive] = useState(false)

  useEffect(() => {
    if (trigger && !isActive) {
      // Generate random particles
      const newParticles = Array.from({ length: particleCount }, (_, i) => ({
        id: Date.now() + i,
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

      setParticles(newParticles)
      setIsActive(true)

      // Clean up after animation
      const timer = setTimeout(() => {
        setParticles([])
        setIsActive(false)
        onComplete?.()
      }, duration)

      return () => clearTimeout(timer)
    }
  }, [trigger, isActive, particleCount, duration, onComplete])

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
