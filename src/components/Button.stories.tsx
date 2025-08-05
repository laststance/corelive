import type { Meta, StoryObj } from '@storybook/react'
import { ChevronRight, Mail, Plus, Trash2, Download, Heart } from 'lucide-react'

import { Button } from '@/components/ui/button'

const meta: Meta<typeof Button> = {
  title: 'CoreLive Design System/Components/Button',
  component: Button,
  parameters: {
    layout: 'centered',
    docs: {
      description: {
        component:
          'A customizable button component with multiple variants, sizes, and states. Built with CoreLive Design System tokens for consistent styling across themes.',
      },
    },
  },
  tags: ['autodocs'],
  argTypes: {
    variant: {
      control: 'select',
      options: [
        'default',
        'destructive',
        'outline',
        'secondary',
        'ghost',
        'link',
      ],
      description: 'Visual style variant of the button',
    },
    size: {
      control: 'select',
      options: ['default', 'sm', 'lg', 'icon'],
      description: 'Size of the button',
    },
    asChild: {
      control: 'boolean',
      description: 'Render as child element',
    },
    disabled: {
      control: 'boolean',
      description: 'Disabled state',
    },
  },
}

export default meta
type Story = StoryObj<typeof meta>

export const Default: Story = {
  args: {
    children: 'Button',
  },
}

export const Secondary: Story = {
  args: {
    variant: 'secondary',
    children: 'Secondary',
  },
}

export const Destructive: Story = {
  args: {
    variant: 'destructive',
    children: 'Destructive',
  },
}

export const Outline: Story = {
  args: {
    variant: 'outline',
    children: 'Outline',
  },
}

export const Ghost: Story = {
  args: {
    variant: 'ghost',
    children: 'Ghost',
  },
}

export const Link: Story = {
  args: {
    variant: 'link',
    children: 'Link',
  },
}

export const Small: Story = {
  args: {
    size: 'sm',
    children: 'Small',
  },
}

export const Large: Story = {
  args: {
    size: 'lg',
    children: 'Large',
  },
}

export const Icon: Story = {
  args: {
    variant: 'outline',
    size: 'icon',
    children: <ChevronRight className="h-4 w-4" />,
  },
}

export const WithIcon: Story = {
  args: {
    children: (
      <>
        <Mail className="mr-2 h-4 w-4" />
        Login with Email
      </>
    ),
  },
}

export const Loading: Story = {
  args: {
    disabled: true,
    children: (
      <>
        <div className="border-background border-t-foreground mr-2 h-4 w-4 animate-spin rounded-full border-2" />
        Please wait
      </>
    ),
  },
}

export const Disabled: Story = {
  args: {
    disabled: true,
    children: 'Disabled',
  },
}

export const AllVariants: Story = {
  args: {},
  render: () => (
    <div className="flex flex-wrap gap-4">
      <Button>Default</Button>
      <Button variant="secondary">Secondary</Button>
      <Button variant="destructive">Destructive</Button>
      <Button variant="outline">Outline</Button>
      <Button variant="ghost">Ghost</Button>
      <Button variant="link">Link</Button>
    </div>
  ),
  parameters: {
    docs: {
      description: {
        story: 'All available button variants showcased together.',
      },
    },
  },
}

export const AllSizes: Story = {
  args: {},
  render: () => (
    <div className="flex items-center gap-4">
      <Button size="sm">Small</Button>
      <Button>Default</Button>
      <Button size="lg">Large</Button>
      <Button size="icon">
        <Plus className="h-4 w-4" />
      </Button>
    </div>
  ),
  parameters: {
    docs: {
      description: {
        story:
          'All available button sizes demonstrated with consistent spacing.',
      },
    },
  },
}

export const ButtonGroup: Story = {
  args: {},
  render: () => (
    <div className="flex gap-2">
      <Button variant="outline" size="sm">
        <Download className="mr-2 h-4 w-4" />
        Download
      </Button>
      <Button variant="outline" size="sm">
        <Heart className="mr-2 h-4 w-4" />
        Save
      </Button>
      <Button variant="destructive" size="sm">
        <Trash2 className="mr-2 h-4 w-4" />
        Delete
      </Button>
    </div>
  ),
  parameters: {
    docs: {
      description: {
        story: 'Example of buttons grouped together for related actions.',
      },
    },
  },
}

export const CoreLiveThemeShowcase: Story = {
  args: {},
  render: () => (
    <div className="space-y-6">
      <div>
        <h3 className="text-heading-3 mb-3 font-medium">Primary Actions</h3>
        <div className="flex gap-3">
          <Button className="bg-primary hover:bg-primary-hover text-on-primary">
            Primary Action
          </Button>
          <Button className="bg-secondary hover:bg-secondary-hover text-on-secondary">
            Secondary Action
          </Button>
          <Button className="bg-accent hover:bg-accent-hover text-on-accent">
            Accent Action
          </Button>
        </div>
      </div>

      <div>
        <h3 className="text-heading-3 mb-3 font-medium">Semantic Actions</h3>
        <div className="flex gap-3">
          <Button className="bg-success hover:bg-success-hover text-white">
            Success
          </Button>
          <Button className="bg-warning hover:bg-warning-hover text-black">
            Warning
          </Button>
          <Button className="bg-danger hover:bg-danger-hover text-white">
            Danger
          </Button>
          <Button className="bg-info hover:bg-info-hover text-white">
            Info
          </Button>
        </div>
      </div>

      <div>
        <h3 className="text-heading-3 mb-3 font-medium">Component Tokens</h3>
        <div className="flex gap-3">
          <button
            className="btn-primary"
            style={{
              padding:
                'var(--system-space-component-sm) var(--system-space-component-md)',
              fontSize: 'var(--primitive-font-size-2)',
            }}
          >
            Component Token Button
          </button>
          <button
            className="rounded-md px-4 py-2 transition-all duration-150"
            style={{
              backgroundColor: 'var(--component-button-secondary-background)',
              color: 'var(--component-button-secondary-text)',
              border: `1px solid var(--component-button-secondary-border)`,
            }}
          >
            Custom Styled
          </button>
        </div>
      </div>
    </div>
  ),
  parameters: {
    docs: {
      description: {
        story:
          'Demonstration of buttons using CoreLive Design System color tokens and component-specific styling.',
      },
    },
  },
}
