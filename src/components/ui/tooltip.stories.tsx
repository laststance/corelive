import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import * as React from 'react'

import { Tooltip, TooltipTrigger, TooltipContent } from './tooltip'

const meta: Meta<typeof Tooltip> = {
  title: 'UI/Tooltip',
  component: Tooltip,
  parameters: { layout: 'centered' },
}
export default meta

type Story = StoryObj<typeof Tooltip>

export const Default: Story = {
  render: () => (
    <Tooltip>
      <TooltipTrigger className="rounded border px-3 py-1 text-sm">
        Hover me
      </TooltipTrigger>
      <TooltipContent>Tooltip content</TooltipContent>
    </Tooltip>
  ),
}
