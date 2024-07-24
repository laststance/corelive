import type { Meta, StoryObj } from '@storybook/react'

import { Spacer } from './Spacer'

const meta: Meta<typeof Spacer> = {
  title: 'components/Spacer',
  component: Spacer,
  tags: ['autodocs'],
  decorators: [
    (Story) => (
      <div className="grid place-content-start">
        <h1 className="flex text-4xl font-bold dark:text-white">
          Breaking{<Story />} News
        </h1>
        <Story />
        <p className="dark:text-white">News deitals article...</p>
      </div>
    ),
  ],
}

export default meta

type Story = StoryObj<typeof Spacer>

export const H4xs: Story = {
  args: {
    size: 'h-4xs',
  },
}
export const H3xs: Story = {
  args: {
    size: 'h-3xs',
  },
}

export const H2xs: Story = {
  args: {
    size: 'h-2xs',
  },
}
export const H_xs: Story = {
  args: {
    size: 'h-xs',
  },
}
export const H_sm: Story = {
  args: {
    size: 'h-sm',
  },
}

export const H_md: Story = {
  args: {
    size: 'h-md',
  },
}

export const H_lg: Story = {
  args: {
    size: 'h-lg',
  },
}

export const H_xl: Story = {
  args: {
    size: 'h-xl',
  },
}

export const H_2xl: Story = {
  args: {
    size: 'h-2xl',
  },
}

export const H_3xl: Story = {
  args: {
    size: 'h-3xl',
  },
}

export const H_4xl: Story = {
  args: {
    size: 'h-4xl',
  },
}

export const W_4xs: Story = {
  args: {
    size: 'w-4xs',
  },
}

export const W_3xs: Story = {
  args: {
    size: 'w-3xs',
  },
}

export const W_2xs: Story = {
  args: {
    size: 'w-2xs',
  },
}

export const W_xs: Story = {
  args: {
    size: 'w-xs',
  },
}

export const W_sm: Story = {
  args: {
    size: 'w-sm',
  },
}

export const W_md: Story = {
  args: {
    size: 'w-md',
  },
}

export const W_lg: Story = {
  args: {
    size: 'w-lg',
  },
}

export const W_xl: Story = {
  args: {
    size: 'w-xl',
  },
}

export const W_2xl: Story = {
  args: {
    size: 'w-2xl',
  },
}

export const W_3xl: Story = {
  args: {
    size: 'w-3xl',
  },
}

export const W_4xl: Story = {
  args: {
    size: 'w-4xl',
  },
}
