import type { Meta, StoryObj } from '@storybook/react'
import * as React from 'react'

import { Popover, PopoverTrigger, PopoverContent } from './popover'

const meta: Meta<typeof Popover> = {
  title: 'UI/Popover',
  component: Popover,
  parameters: { layout: 'centered' },
}
export default meta

type Story = StoryObj<typeof Popover>

export const Default: Story = {
  render: () => (
    <Popover open>
      <PopoverTrigger className="rounded border px-3 py-1 text-sm">
        Open popover
      </PopoverTrigger>
      <PopoverContent>Popover content</PopoverContent>
    </Popover>
  ),
}
