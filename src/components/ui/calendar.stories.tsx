import type { Meta, StoryObj } from '@storybook/react'

import { Calendar } from './calendar'

const meta: Meta<typeof Calendar> = {
  title: 'UI/Calendar',
  component: Calendar,
  parameters: { layout: 'centered' },
}
export default meta

type Story = StoryObj<typeof Calendar>

export const Basic: Story = {
  render: () => <Calendar />,
}

export const GhostNavButtons: Story = {
  render: () => <Calendar buttonVariant="ghost" />,
}

export const LabelCaption: Story = {
  render: () => <Calendar captionLayout="dropdown" />,
}
