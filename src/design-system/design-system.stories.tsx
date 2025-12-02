import type { Meta, StoryObj } from '@storybook/nextjs-vite'

import { ThemeProvider } from '@/providers/ThemeProvider'

import { ExampleTodoList, ThemeAwareCard } from './example-component'

// Decorator to wrap stories in ThemeProvider
const withThemeProvider = (Story: any) => (
  <ThemeProvider>
    <div className="min-h-screen bg-background p-8 text-foreground">
      <Story />
    </div>
  </ThemeProvider>
)

const meta: Meta<typeof ExampleTodoList> = {
  title: 'Design System/Example Components',
  component: ExampleTodoList,
  parameters: {
    layout: 'padded',
    backgrounds: {
      disable: true, // Disable default backgrounds since we're using theme backgrounds
    },
  },
  decorators: [withThemeProvider],
}

export default meta

type Story = StoryObj<typeof ExampleTodoList>

/**
 * Example TodoList component demonstrating CoreLive Design System usage
 *
 * Features:
 * - Design token usage
 * - Component styling with tokens
 * - Animation integration (confetti on task completion)
 * - Theme-aware styling
 */
export const TodoList: Story = {
  render: () => <ExampleTodoList />,
}

/**
 * Theme-aware card component demonstrating theme-specific styling
 *
 * Features:
 * - Gradient effects for gradient themes
 * - Theme-specific visual effects
 * - Automatic theme adaptation
 */
export const ThemeAware: Story = {
  render: () => (
    <div className="mx-auto max-w-md">
      <ThemeAwareCard />
    </div>
  ),
}

/**
 * Combined view showing both example components together
 */
export const Combined: Story = {
  render: () => (
    <div className="space-y-8">
      <ExampleTodoList />
      <div className="mx-auto max-w-md">
        <ThemeAwareCard />
      </div>
    </div>
  ),
}
