import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import * as React from 'react'

import { HoverCard, HoverCardTrigger, HoverCardContent } from './hover-card'

const meta: Meta<typeof HoverCard> = {
  title: 'UI/HoverCard',
  component: HoverCard,
  parameters: { layout: 'centered' },
}
export default meta

type Story = StoryObj<typeof HoverCard>

export const Default: Story = {
  render: () => (
    <HoverCard open>
      <HoverCardTrigger className="rounded border px-3 py-1 text-sm">
        Hover me
      </HoverCardTrigger>
      <HoverCardContent>Additional info on hover</HoverCardContent>
    </HoverCard>
  ),
}
