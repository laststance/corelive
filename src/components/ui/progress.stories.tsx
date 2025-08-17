import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import * as React from 'react'

import { Progress } from './progress'

const meta: Meta<typeof Progress> = {
  title: 'UI/Progress',
  component: Progress,
  parameters: { layout: 'centered' },
}
export default meta

type Story = StoryObj<typeof Progress>

export const Value30: Story = {
  render: () => <Progress value={30} className="w-64" />,
}

export const Value70: Story = {
  render: () => <Progress value={70} className="w-64" />,
}
