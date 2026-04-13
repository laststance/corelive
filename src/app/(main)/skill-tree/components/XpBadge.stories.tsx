import type { Meta, StoryObj } from '@storybook/nextjs-vite'

import '../styles.css'
import { XpBadge } from './XpBadge'

const meta: Meta<typeof XpBadge> = {
  title: 'Skill Tree/XpBadge',
  component: XpBadge,
  decorators: [
    (Story) => (
      <div
        data-skill-tree="true"
        className="bg-[var(--st-bg-mid)] p-6"
        style={{ width: 240 }}
      >
        <Story />
      </div>
    ),
  ],
}

export default meta
type Story = StoryObj<typeof XpBadge>

export const L0: Story = { args: { xp: 0 } }
export const L3_progress: Story = { args: { xp: 40 } }
export const Mastered: Story = { args: { xp: 75 } }
