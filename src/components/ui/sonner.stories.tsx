import type { Meta, StoryObj } from '@storybook/react'
import * as React from 'react'

import { Toaster } from './sonner'

const meta: Meta<typeof Toaster> = {
  title: 'UI/Sonner',
  component: Toaster,
  parameters: { layout: 'centered' },
}
export default meta

type Story = StoryObj<typeof Toaster>

export const Default: Story = {
  render: () => <Toaster position="bottom-center" />,
}
