'use client'

import type {
  EdgeFromNodeId,
  EdgeToNodeId,
  NodeCoordinate,
  NodeEdgeId,
  NodeXp,
  SkillNodeId,
  SkillNodeName,
  ViewboxCoordinate,
} from '../lib/domain-types'

import { SkillNodeCircle } from './SkillNodeCircle'

/**
 * A lightweight view model for nodes passed into the canvas.
 * Kept separate from the Prisma type to avoid pulling server types into client code.
 */
export interface CanvasNode {
  id: SkillNodeId
  name: SkillNodeName
  x: NodeCoordinate // 0-1 normalized
  y: NodeCoordinate // 0-1 normalized
  xp: NodeXp
}

export interface CanvasEdge {
  id: NodeEdgeId
  fromNodeId: EdgeFromNodeId
  toNodeId: EdgeToNodeId
}

export interface ConstellationCanvasProps {
  nodes: CanvasNode[]
  edges: CanvasEdge[]
  onNodeClick?: (nodeId: SkillNodeId) => void
}

const VIEWBOX = 1000 // logical units — actual size is controlled by CSS

/**
 * Converts a normalized (0-1) coordinate into logical SVG units.
 *
 * @param n - Normalized coordinate in the range [0, 1].
 * @returns The coordinate scaled to VIEWBOX logical units.
 * @example
 * toViewboxUnits(0.5) // => 500
 * toViewboxUnits(0)   // => 0
 */
function toViewboxUnits(n: NodeCoordinate): ViewboxCoordinate {
  return n * VIEWBOX
}

/**
 * Renders the full constellation: background stars, edges, nodes.
 * Pure SVG — no canvas, no React Flow. Nodes receive droppable behavior
 * from @dnd-kit via `useDroppable` inside `<SkillNodeCircle>`.
 *
 * @remarks
 * This component defines the `<defs>` block that `SkillNodeCircle` requires
 * for level 2+ visuals (`st-cream-glow`, `st-gold-glow`, `st-mastered-core`).
 * Without these defs, filters and gradients will silently degrade.
 *
 * @example
 * <ConstellationCanvas
 *   nodes={[{ id: 1, name: 'HTTP', x: 0.2, y: 0.2, xp: 5 }]}
 *   edges={[]}
 *   onNodeClick={(id) => console.log(id)}
 * />
 */
export function ConstellationCanvas({
  nodes,
  edges,
  onNodeClick,
}: ConstellationCanvasProps) {
  // Map node IDs to their coordinates for edge lookups
  const nodeById = new Map(
    nodes.map((n) => [
      n.id,
      { cx: toViewboxUnits(n.x), cy: toViewboxUnits(n.y) },
    ]),
  )

  // 18 static + 3 twinkle stars, positions are pseudo-random but stable
  const staticStars = [
    [120, 80],
    [270, 150],
    [450, 60],
    [620, 120],
    [780, 90],
    [900, 180],
    [100, 320],
    [350, 380],
    [580, 310],
    [830, 390],
    [950, 460],
    [220, 520],
    [410, 610],
    [690, 560],
    [880, 640],
    [150, 720],
    [520, 780],
    [770, 830],
  ] as const
  const twinkleStars = [
    [320, 220],
    [620, 440],
    [150, 580],
  ] as const

  return (
    // NOTE: no explicit role="img" here — that would atomize the SVG into a
    // single a11y leaf and hide the inner <SkillNodeCircle> buttons from the
    // accessibility tree (and from Playwright's getByRole). The SVG still
    // exposes itself as `graphics-document` / `img` via SVG-AAM based on the
    // aria-label below, so screen readers still announce it. See the matching
    // comment in SkillNodeCircle.tsx (the <title> child there is the
    // SVG-AAM canonical accessible-name source for each button).
    <svg
      // eslint-disable-next-line dslint/token-only -- skill-tree scoped CSS class from styles.css Task 11
      className="st-canvas-bg"
      viewBox={`0 0 ${VIEWBOX} ${VIEWBOX}`}
      width="100%"
      height="100%"
      style={{ display: 'block' }}
      aria-label="Skill tree constellation"
    >
      <defs>
        <filter id="st-cream-glow" x="-50%" y="-50%" width="200%" height="200%">
          <feGaussianBlur stdDeviation="4" result="blur" />
          <feMerge>
            <feMergeNode in="blur" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
        <filter id="st-gold-glow" x="-50%" y="-50%" width="200%" height="200%">
          <feGaussianBlur stdDeviation="5" result="blur" />
          <feMerge>
            <feMergeNode in="blur" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
        <radialGradient id="st-mastered-core" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="var(--st-gold)" />
          <stop offset="100%" stopColor="var(--st-cream)" />
        </radialGradient>
      </defs>

      {/* Background stars */}
      <g aria-hidden="true">
        {staticStars.map(([x, y], i) => (
          <circle
            key={`star-${i}`}
            cx={x}
            cy={y}
            r={1.5}
            fill="var(--st-cream)"
            opacity={0.6}
          />
        ))}
        {twinkleStars.map(([x, y], i) => (
          <circle
            key={`twinkle-${i}`}
            cx={x}
            cy={y}
            r={2}
            fill="var(--st-gold)"
            // eslint-disable-next-line dslint/token-only -- skill-tree scoped CSS class from styles.css Task 11
            className={`st-twinkle-star ${
              i === 1
                ? 'st-twinkle-star--delay-1'
                : i === 2
                  ? 'st-twinkle-star--delay-2'
                  : ''
            }`}
          />
        ))}
      </g>

      {/* Edges (drawn first, under nodes) */}
      <g aria-hidden="true">
        {edges.map((edge) => {
          const from = nodeById.get(edge.fromNodeId)
          const to = nodeById.get(edge.toNodeId)
          if (!from || !to) return null
          const fromNode = nodes.find((n) => n.id === edge.fromNodeId)
          const toNode = nodes.find((n) => n.id === edge.toNodeId)
          if (!fromNode || !toNode) return null

          // Edge style based on endpoint activation
          const bothActive = fromNode.xp >= 5 && toNode.xp >= 5
          const oneActive = fromNode.xp >= 5 || toNode.xp >= 5
          const stroke = bothActive
            ? 'var(--st-gold)'
            : oneActive
              ? 'var(--st-cream)'
              : 'var(--st-muted)'
          const strokeWidth = bothActive ? 3 : oneActive ? 2 : 1.6
          const opacity = bothActive ? 0.6 : oneActive ? 0.45 : 0.4
          const dash = bothActive || oneActive ? undefined : '4,6'

          return (
            <line
              key={edge.id}
              x1={from.cx}
              y1={from.cy}
              x2={to.cx}
              y2={to.cy}
              stroke={stroke}
              strokeWidth={strokeWidth}
              strokeOpacity={opacity}
              strokeDasharray={dash}
            />
          )
        })}
      </g>

      {/* Nodes */}
      <g>
        {nodes.map((node) => (
          <SkillNodeCircle
            key={node.id}
            id={node.id}
            name={node.name}
            cx={toViewboxUnits(node.x)}
            cy={toViewboxUnits(node.y)}
            xp={node.xp}
            onClick={onNodeClick}
          />
        ))}
      </g>
    </svg>
  )
}
