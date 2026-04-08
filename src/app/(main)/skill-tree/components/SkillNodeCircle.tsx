'use client'

import { useDroppable } from '@dnd-kit/core'
import React from 'react'
import { match } from 'ts-pattern'

import { xpToLevel } from '../lib/xp'

/**
 * A single skill tree node rendered as SVG.
 * Wraps an invisible 44x44 hit target for easy tapping and dragging drop.
 *
 * @example
 * <SkillNodeCircle id={1} name="APIs" cx={50} cy={50} xp={30} onClick={(id) => console.log(id)} />
 */
export interface SkillNodeCircleProps {
  id: number
  name: string
  cx: number
  cy: number
  xp: number
  onClick?: (nodeId: number) => void
}

const LEVEL_LABEL: Record<number, string> = {
  0: 'Dormant',
  1: 'Level 1',
  2: 'Level 2',
  3: 'Level 3',
  4: 'Level 4',
  5: 'Mastered',
}

export function SkillNodeCircle({
  id,
  name,
  cx,
  cy,
  xp,
  onClick,
}: SkillNodeCircleProps) {
  const { setNodeRef, isOver } = useDroppable({ id: String(id) })
  const { level, progress, next } = xpToLevel(xp)

  const ariaLabel =
    next === null
      ? `${name}, Mastered`
      : `${name}, ${LEVEL_LABEL[level]}, ${progress} of ${next} XP`

  const baseRadius = 14

  return (
    <g
      ref={setNodeRef as unknown as React.Ref<SVGGElement>}
      // eslint-disable-next-line dslint/token-only -- skill-tree scoped CSS class from styles.css Task 11
      className="st-node-group"
      role="button"
      aria-label={ariaLabel}
      tabIndex={0}
      onClick={() => onClick?.(id)}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault()
          onClick?.(id)
        }
      }}
      style={{ cursor: 'pointer' }}
    >
      {/* Invisible 44x44 hit target */}
      <rect x={cx - 22} y={cy - 22} width={44} height={44} fill="transparent" />

      {match(level)
        .with(0, () => (
          // Dormant — dashed muted ring, ? text, no fill
          <>
            <circle
              cx={cx}
              cy={cy}
              r={baseRadius}
              fill="transparent"
              stroke="var(--st-muted)"
              strokeWidth={1.5}
              strokeDasharray="3,3"
            />
            <text
              x={cx}
              y={cy + 4}
              textAnchor="middle"
              fill="var(--st-muted)"
              fontSize={12}
              style={{ userSelect: 'none' }}
            >
              ?
            </text>
          </>
        ))
        .with(1, () => (
          <>
            <circle
              cx={cx}
              cy={cy}
              r={baseRadius}
              fill="transparent"
              stroke="var(--st-cream)"
              strokeWidth={2}
            />
            <circle cx={cx} cy={cy} r={3} fill="var(--st-cream)" />
          </>
        ))
        .with(2, () => (
          <>
            <circle
              cx={cx}
              cy={cy}
              r={baseRadius}
              fill="transparent"
              stroke="var(--st-cream)"
              strokeWidth={2}
              filter="url(#st-cream-glow)"
            />
            <circle cx={cx} cy={cy} r={5} fill="var(--st-cream)" />
          </>
        ))
        .with(3, () => (
          <>
            <circle
              cx={cx}
              cy={cy}
              r={baseRadius + 4}
              fill="transparent"
              stroke="var(--st-cream)"
              strokeWidth={1}
              opacity={0.6}
            />
            <circle
              cx={cx}
              cy={cy}
              r={baseRadius}
              fill="transparent"
              stroke="var(--st-cream)"
              strokeWidth={2}
              filter="url(#st-cream-glow)"
            />
            <circle cx={cx} cy={cy} r={5} fill="var(--st-cream)" />
          </>
        ))
        .with(4, () => (
          <>
            <circle
              cx={cx}
              cy={cy}
              r={baseRadius + 4}
              fill="transparent"
              stroke="var(--st-gold)"
              strokeWidth={1}
              opacity={0.8}
            />
            <circle
              cx={cx}
              cy={cy}
              r={baseRadius}
              fill="transparent"
              stroke="var(--st-gold)"
              strokeWidth={2.5}
              filter="url(#st-gold-glow)"
            />
            <circle cx={cx} cy={cy} r={6} fill="var(--st-gold)" />
          </>
        ))
        .with(5, () => (
          <>
            <circle
              cx={cx}
              cy={cy}
              r={baseRadius + 8}
              fill="transparent"
              stroke="var(--st-gold)"
              strokeWidth={0.5}
              // eslint-disable-next-line dslint/token-only -- skill-tree scoped CSS class from styles.css Task 11
              className="st-mastered-ring"
            />
            <circle
              cx={cx}
              cy={cy}
              r={baseRadius + 4}
              fill="transparent"
              stroke="var(--st-gold)"
              strokeWidth={1}
              opacity={0.7}
            />
            <circle
              cx={cx}
              cy={cy}
              r={baseRadius}
              fill="url(#st-mastered-core)"
              stroke="var(--st-gold)"
              strokeWidth={2}
              filter="url(#st-gold-glow)"
            />
            <text
              x={cx}
              y={cy + 4}
              textAnchor="middle"
              fill="var(--st-bg-deep)"
              fontSize={12}
              fontWeight="bold"
              style={{ userSelect: 'none' }}
            >
              ★
            </text>
          </>
        ))
        .exhaustive()}

      {/* Hover/selection halo */}
      {isOver && (
        <circle
          cx={cx}
          cy={cy}
          r={baseRadius + 10}
          fill="transparent"
          stroke="var(--st-arcane)"
          strokeWidth={2}
          strokeDasharray="4,3"
          opacity={0.9}
        />
      )}
    </g>
  )
}
