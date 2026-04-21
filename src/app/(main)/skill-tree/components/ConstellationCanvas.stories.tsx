import { DndContext } from '@dnd-kit/core'
import type { Meta, StoryObj } from '@storybook/nextjs-vite'

import type {
  EdgeFromNodeId,
  EdgeToNodeId,
  NodeCoordinate,
  NodeEdgeId,
  NodeXp,
  SkillNodeId,
  SkillNodeName,
} from '../lib/domain-types'

import { ConstellationCanvas } from './ConstellationCanvas'
import '../styles.css'

const meta: Meta<typeof ConstellationCanvas> = {
  title: 'Skill Tree/ConstellationCanvas',
  component: ConstellationCanvas,
  decorators: [
    (Story) => (
      <DndContext>
        <div data-skill-tree="true" style={{ width: '800px', height: '800px' }}>
          <Story />
        </div>
      </DndContext>
    ),
  ],
}

export default meta
type Story = StoryObj<typeof ConstellationCanvas>

/**
 * Creates a SkillNodeId value for story sample data.
 * @param value - Numeric node identifier.
 * @returns SkillNodeId for typed story fixtures.
 * @example
 * createSkillNodeId(1)
 */
function createSkillNodeId(value: number): SkillNodeId {
  return value as SkillNodeId
}

/**
 * Creates a SkillNodeName value for story sample data.
 * @param value - Node display name.
 * @returns SkillNodeName for typed story fixtures.
 * @example
 * createSkillNodeName('HTTP')
 */
function createSkillNodeName(value: string): SkillNodeName {
  return value as SkillNodeName
}

/**
 * Creates a NodeCoordinate value for story sample data.
 * @param value - Normalized coordinate (0 to 1).
 * @returns NodeCoordinate for typed story fixtures.
 * @example
 * createNodeCoordinate(0.2)
 */
function createNodeCoordinate(value: number): NodeCoordinate {
  return value as NodeCoordinate
}

/**
 * Creates a NodeXp value for story sample data.
 * @param value - XP amount.
 * @returns NodeXp for typed story fixtures.
 * @example
 * createNodeXp(75)
 */
function createNodeXp(value: number): NodeXp {
  return value as NodeXp
}

/**
 * Creates a NodeEdgeId value for story sample data.
 * @param value - Numeric edge identifier.
 * @returns NodeEdgeId for typed story fixtures.
 * @example
 * createNodeEdgeId(1)
 */
function createNodeEdgeId(value: number): NodeEdgeId {
  return value as NodeEdgeId
}

/**
 * Creates an EdgeFromNodeId value for story sample data.
 * @param value - Source node identifier.
 * @returns EdgeFromNodeId for typed story fixtures.
 * @example
 * createEdgeFromNodeId(1)
 */
function createEdgeFromNodeId(value: number): EdgeFromNodeId {
  return value as EdgeFromNodeId
}

/**
 * Creates an EdgeToNodeId value for story sample data.
 * @param value - Destination node identifier.
 * @returns EdgeToNodeId for typed story fixtures.
 * @example
 * createEdgeToNodeId(2)
 */
function createEdgeToNodeId(value: number): EdgeToNodeId {
  return value as EdgeToNodeId
}

const sampleNodes = [
  {
    id: createSkillNodeId(1),
    name: createSkillNodeName('HTTP'),
    x: createNodeCoordinate(0.2),
    y: createNodeCoordinate(0.2),
    xp: createNodeXp(0),
  },
  {
    id: createSkillNodeId(2),
    name: createSkillNodeName('REST APIs'),
    x: createNodeCoordinate(0.5),
    y: createNodeCoordinate(0.4),
    xp: createNodeXp(0),
  },
  {
    id: createSkillNodeId(3),
    name: createSkillNodeName('Auth'),
    x: createNodeCoordinate(0.5),
    y: createNodeCoordinate(0.2),
    xp: createNodeXp(0),
  },
  {
    id: createSkillNodeId(4),
    name: createSkillNodeName('PostgreSQL'),
    x: createNodeCoordinate(0.2),
    y: createNodeCoordinate(0.5),
    xp: createNodeXp(0),
  },
  {
    id: createSkillNodeId(5),
    name: createSkillNodeName('Docker'),
    x: createNodeCoordinate(0.3),
    y: createNodeCoordinate(0.8),
    xp: createNodeXp(0),
  },
]
const sampleEdges = [
  {
    id: createNodeEdgeId(1),
    fromNodeId: createEdgeFromNodeId(1),
    toNodeId: createEdgeToNodeId(2),
  },
  {
    id: createNodeEdgeId(2),
    fromNodeId: createEdgeFromNodeId(3),
    toNodeId: createEdgeToNodeId(2),
  },
  {
    id: createNodeEdgeId(3),
    fromNodeId: createEdgeFromNodeId(4),
    toNodeId: createEdgeToNodeId(2),
  },
  {
    id: createNodeEdgeId(4),
    fromNodeId: createEdgeFromNodeId(5),
    toNodeId: createEdgeToNodeId(4),
  },
]

export const Empty: Story = {
  args: { nodes: sampleNodes, edges: sampleEdges },
}

export const PartiallyLeveled: Story = {
  args: {
    nodes: [
      // sampleNodes literal has 5 elements; indices 0-4 are statically safe
      { ...sampleNodes[0]!, xp: createNodeXp(5) },
      { ...sampleNodes[1]!, xp: createNodeXp(20) },
      { ...sampleNodes[2]!, xp: createNodeXp(0) },
      { ...sampleNodes[3]!, xp: createNodeXp(35) },
      { ...sampleNodes[4]!, xp: createNodeXp(0) },
    ],
    edges: sampleEdges,
  },
}

export const FullyMastered: Story = {
  args: {
    nodes: sampleNodes.map((n) => ({ ...n, xp: createNodeXp(75) })),
    edges: sampleEdges,
  },
}
