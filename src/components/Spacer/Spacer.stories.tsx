import type { Meta, StoryObj } from '@storybook/react'

import { Spacer } from './Spacer'

const meta: Meta<typeof Spacer> = {
  title: 'components/Spacer',
  component: Spacer,
  tags: ['autodocs'],
  decorators: [
    (Story) => (
      <div className="grid place-content-start">
        <h1 className="text-4xl font-bold dark:text-white">Breaking News</h1>
        <Story />
        <p className="dark:text-white">News deitals article...</p>
      </div>
    ),
  ],
}

export default meta

type Story = StoryObj<typeof Spacer>

export const _4xs: Story = {
  args: {
    size: '4xs',
  },
}

export const _3xs: Story = {
  args: {
    size: '3xs',
  },
}

export const _2xs: Story = {
  args: {
    size: '2xs',
  },
}
export const Xs: Story = {
  args: {
    size: 'xs',
  },
}
export const Sm: Story = {
  args: {
    size: 'sm',
  },
}

export const Md: Story = {
  args: {
    size: 'md',
  },
}

export const Lg: Story = {
  args: {
    size: 'lg',
  },
}

export const Xl: Story = {
  args: {
    size: 'xl',
  },
}

export const _2xl: Story = {
  args: {
    size: '2xl',
  },
}

export const _3xl: Story = {
  args: {
    size: '3xl',
  },
}

export const _4xl: Story = {
  args: {
    size: '4xl',
  },
}
