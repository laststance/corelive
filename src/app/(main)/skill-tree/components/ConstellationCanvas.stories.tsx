import { DndContext } from '@dnd-kit/core'
import type { Meta, StoryObj } from '@storybook/nextjs-vite'

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

const sampleNodes = [
  { id: 1, name: 'HTTP', x: 0.2, y: 0.2, xp: 0 },
  { id: 2, name: 'REST APIs', x: 0.5, y: 0.4, xp: 0 },
  { id: 3, name: 'Auth', x: 0.5, y: 0.2, xp: 0 },
  { id: 4, name: 'PostgreSQL', x: 0.2, y: 0.5, xp: 0 },
  { id: 5, name: 'Docker', x: 0.3, y: 0.8, xp: 0 },
]
const sampleEdges = [
  { id: 1, fromNodeId: 1, toNodeId: 2 },
  { id: 2, fromNodeId: 3, toNodeId: 2 },
  { id: 3, fromNodeId: 4, toNodeId: 2 },
  { id: 4, fromNodeId: 5, toNodeId: 4 },
]

export const Empty: Story = {
  args: { nodes: sampleNodes, edges: sampleEdges },
}

export const PartiallyLeveled: Story = {
  args: {
    nodes: [
      // sampleNodes literal has 5 elements; indices 0-4 are statically safe
      { ...sampleNodes[0]!, xp: 5 },
      { ...sampleNodes[1]!, xp: 20 },
      { ...sampleNodes[2]!, xp: 0 },
      { ...sampleNodes[3]!, xp: 35 },
      { ...sampleNodes[4]!, xp: 0 },
    ],
    edges: sampleEdges,
  },
}

export const FullyMastered: Story = {
  args: {
    nodes: sampleNodes.map((n) => ({ ...n, xp: 75 })),
    edges: sampleEdges,
  },
}
