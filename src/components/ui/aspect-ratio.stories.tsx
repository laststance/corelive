import type { Meta, StoryObj } from '@storybook/react'

import { AspectRatio } from './aspect-ratio'

const meta: Meta<typeof AspectRatio> = {
  title: 'UI/AspectRatio',
  component: AspectRatio,
  parameters: { layout: 'centered' },
}
export default meta

type Story = StoryObj<typeof AspectRatio>

export const Ratio16x9: Story = {
  render: () => (
    <div className="w-[360px] overflow-hidden rounded-md border">
      <AspectRatio ratio={16 / 9}>
        <img
          src="https://picsum.photos/800/450"
          alt="16:9"
          className="h-full w-full object-cover"
        />
      </AspectRatio>
    </div>
  ),
}

export const Ratio3x4: Story = {
  render: () => (
    <div className="w-[280px] overflow-hidden rounded-md border">
      <AspectRatio ratio={3 / 4}>
        <img
          src="https://picsum.photos/600/800"
          alt="3:4"
          className="h-full w-full object-cover"
        />
      </AspectRatio>
    </div>
  ),
}

export const Ratio1x1: Story = {
  render: () => (
    <div className="w-[220px] overflow-hidden rounded-md border">
      <AspectRatio ratio={1}>
        <img
          src="https://picsum.photos/800/800"
          alt="1:1"
          className="h-full w-full object-cover"
        />
      </AspectRatio>
    </div>
  ),
}
