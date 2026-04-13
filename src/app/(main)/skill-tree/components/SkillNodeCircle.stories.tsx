import { DndContext } from '@dnd-kit/core'
import type { Meta, StoryObj } from '@storybook/nextjs-vite'

import { SkillNodeCircle } from './SkillNodeCircle'
import '../styles.css'

const meta: Meta<typeof SkillNodeCircle> = {
  title: 'Skill Tree/SkillNodeCircle',
  component: SkillNodeCircle,
  decorators: [
    (Story) => (
      <DndContext>
        <div data-skill-tree="true" className="st-canvas-bg p-8">
          <svg viewBox="0 0 100 100" width="200" height="200">
            <defs>
              <filter
                id="st-cream-glow"
                x="-50%"
                y="-50%"
                width="200%"
                height="200%"
              >
                <feGaussianBlur stdDeviation="2" result="blur" />
                <feMerge>
                  <feMergeNode in="blur" />
                  <feMergeNode in="SourceGraphic" />
                </feMerge>
              </filter>
              <filter
                id="st-gold-glow"
                x="-50%"
                y="-50%"
                width="200%"
                height="200%"
              >
                <feGaussianBlur stdDeviation="3" result="blur" />
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
            <Story />
          </svg>
        </div>
      </DndContext>
    ),
  ],
}

export default meta
type Story = StoryObj<typeof SkillNodeCircle>

const base = { id: 1, name: 'APIs', cx: 50, cy: 50 }

export const Dormant: Story = { args: { ...base, xp: 0 } }
export const Level1: Story = { args: { ...base, xp: 5 } }
export const Level2: Story = { args: { ...base, xp: 15 } }
export const Level3: Story = { args: { ...base, xp: 30 } }
export const Level4: Story = { args: { ...base, xp: 50 } }
export const Mastered: Story = { args: { ...base, xp: 75 } }
