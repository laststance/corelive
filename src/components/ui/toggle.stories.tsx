import type { Meta, StoryObj } from '@storybook/react'
import { Bold, Italic, Underline } from 'lucide-react'
import * as React from 'react'

import { Toggle } from './toggle'

const meta: Meta<typeof Toggle> = {
  title: 'UI/Toggle',
  component: Toggle,
  parameters: { layout: 'centered' },
}
export default meta

type Story = StoryObj<typeof Toggle>

export const Default: Story = {
  render: () => <Toggle>Bold</Toggle>,
}

export const WithIcon: Story = {
  render: () => (
    <Toggle aria-label="Toggle bold">
      <Bold className="size-4" />
    </Toggle>
  ),
}

export const WithIconAndText: Story = {
  render: () => (
    <Toggle>
      <Bold className="size-4" />
      <span>Bold</span>
    </Toggle>
  ),
}

export const Outline: Story = {
  render: () => <Toggle variant="outline">Outline</Toggle>,
}

export const Sizes: Story = {
  render: () => (
    <div className="flex items-center gap-4">
      <Toggle size="sm">
        <Bold className="size-3" />
        <span>Small</span>
      </Toggle>
      <Toggle size="default">
        <Italic className="size-4" />
        <span>Default</span>
      </Toggle>
      <Toggle size="lg">
        <Underline className="size-5" />
        <span>Large</span>
      </Toggle>
    </div>
  ),
}

export const Pressed: Story = {
  render: () => <Toggle pressed>Pressed</Toggle>,
}

export const Disabled: Story = {
  render: () => <Toggle disabled>Disabled</Toggle>,
}
