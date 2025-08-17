import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import * as React from 'react'

import { ScrollArea } from './scroll-area'

const meta: Meta<typeof ScrollArea> = {
  title: 'UI/ScrollArea',
  component: ScrollArea,
  parameters: { layout: 'centered' },
}
export default meta

type Story = StoryObj<typeof ScrollArea>

export const Default: Story = {
  render: () => (
    <ScrollArea className="h-72 w-48 rounded-md border p-4">
      <div>
        <h4 className="mb-4 text-sm leading-none font-medium">Tags</h4>
        {Array.from({ length: 50 }).map((_, i) => (
          <div key={i} className="mb-2 text-sm">
            Tag {i + 1}
          </div>
        ))}
      </div>
    </ScrollArea>
  ),
}

export const Horizontal: Story = {
  render: () => (
    <ScrollArea className="h-20 w-96 rounded-md border whitespace-nowrap">
      <div className="flex w-max p-4">
        {Array.from({ length: 50 }).map((_, i) => (
          <div key={i} className="w-40 border-r p-4">
            <div className="text-sm">Item {i + 1}</div>
          </div>
        ))}
      </div>
    </ScrollArea>
  ),
}
