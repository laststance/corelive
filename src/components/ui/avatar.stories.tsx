import type { Meta, StoryObj } from '@storybook/nextjs-vite'

import { Avatar, AvatarImage, AvatarFallback } from './avatar'

const meta: Meta<typeof Avatar> = {
  title: 'UI/Avatar',
  component: Avatar,
  parameters: { layout: 'centered' },
}
export default meta

type Story = StoryObj<typeof Avatar>

export const Image: Story = {
  render: () => (
    <Avatar className="size-12">
      <AvatarImage src="https://i.pravatar.cc/300" alt="Avatar" />
      <AvatarFallback>RM</AvatarFallback>
    </Avatar>
  ),
}

export const Fallback: Story = {
  render: () => (
    <Avatar className="size-12">
      <AvatarFallback>RM</AvatarFallback>
    </Avatar>
  ),
}

export const Sizes: Story = {
  render: () => (
    <div className="flex items-center gap-4">
      <Avatar className="size-8">
        <AvatarFallback>SM</AvatarFallback>
      </Avatar>
      <Avatar className="size-10">
        <AvatarFallback>MD</AvatarFallback>
      </Avatar>
      <Avatar className="size-12">
        <AvatarFallback>LG</AvatarFallback>
      </Avatar>
    </div>
  ),
}
