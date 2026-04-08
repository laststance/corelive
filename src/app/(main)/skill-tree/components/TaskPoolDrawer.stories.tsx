import { DndContext } from '@dnd-kit/core'
import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { useState } from 'react'

import { TaskPoolDrawer } from './TaskPoolDrawer'
import '../styles.css'

const meta: Meta<typeof TaskPoolDrawer> = {
  title: 'Skill Tree/TaskPoolDrawer',
  component: TaskPoolDrawer,
  decorators: [
    (Story) => (
      <DndContext>
        <div
          data-skill-tree="true"
          className="st-canvas-bg"
          style={{ height: '600px', position: 'relative' }}
        >
          <Story />
        </div>
      </DndContext>
    ),
  ],
}

export default meta
type Story = StoryObj<typeof TaskPoolDrawer>

function Template(args: React.ComponentProps<typeof TaskPoolDrawer>) {
  const [open, setOpen] = useState(true)
  return <TaskPoolDrawer {...args} open={open} onOpenChange={setOpen} />
}

export const EmptyState: Story = {
  render: (args) => <Template {...args} />,
  args: { todos: [] },
}

export const ThreeTasks: Story = {
  render: (args) => <Template {...args} />,
  args: {
    todos: [
      { id: 1, text: 'Set up PostgreSQL locally' },
      { id: 2, text: 'Write API auth middleware' },
      { id: 3, text: 'Deploy to production' },
    ],
  },
}

export const ManyTasks_Scroll: Story = {
  render: (args) => <Template {...args} />,
  args: {
    todos: Array.from({ length: 12 }, (_, i) => ({
      id: i + 1,
      text: `Completed task number ${i + 1}`,
    })),
  },
}
