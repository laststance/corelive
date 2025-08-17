import type { Meta, StoryObj } from '@storybook/react'
import * as React from 'react'

import { Slider } from './slider'

const meta: Meta<typeof Slider> = {
  title: 'UI/Slider',
  component: Slider,
  parameters: { layout: 'centered' },
}
export default meta

type Story = StoryObj<typeof Slider>

export const Default: Story = {
  render: () => (
    <div className="w-[300px]">
      <Slider defaultValue={[50]} />
    </div>
  ),
}

export const Range: Story = {
  render: () => (
    <div className="w-[300px]">
      <Slider defaultValue={[25, 75]} />
    </div>
  ),
}

export const Steps: Story = {
  render: () => (
    <div className="w-[300px]">
      <Slider defaultValue={[40]} step={20} />
    </div>
  ),
}

export const Disabled: Story = {
  render: () => (
    <div className="w-[300px]">
      <Slider defaultValue={[50]} disabled />
    </div>
  ),
}
