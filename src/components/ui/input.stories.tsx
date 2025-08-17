import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import * as React from 'react'

import { Input } from './input'

const meta: Meta<typeof Input> = {
  title: 'UI/Input',
  component: Input,
  parameters: { layout: 'centered' },
}
export default meta

type Story = StoryObj<typeof Input>

export const Placeholder: Story = {
  render: () => <Input placeholder="Enter your name" className="w-64" />,
}

export const Disabled: Story = {
  render: () => <Input placeholder="Disabled" disabled className="w-64" />,
}

export const Invalid: Story = {
  render: () => <Input placeholder="Invalid" aria-invalid className="w-64" />,
}

export const Types: Story = {
  render: () => (
    <div className="flex w-72 flex-col gap-3">
      <Input type="email" placeholder="email@example.com" />
      <Input type="password" placeholder="password" />
      <Input type="file" />
    </div>
  ),
}
