import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import * as React from 'react'

import {
  Collapsible,
  CollapsibleTrigger,
  CollapsibleContent,
} from './collapsible'

const meta: Meta<typeof Collapsible> = {
  title: 'UI/Collapsible',
  component: Collapsible,
  parameters: { layout: 'centered' },
}
export default meta

type Story = StoryObj<typeof Collapsible>

export const Closed: Story = {
  render: () => (
    <Collapsible className="w-[320px]" defaultOpen={false}>
      <div className="flex items-center justify-between">
        <span className="font-medium">Toggle section</span>
        <CollapsibleTrigger className="text-sm underline">
          Toggle
        </CollapsibleTrigger>
      </div>
      <CollapsibleContent className="mt-2 rounded border p-3 text-sm">
        Hidden content
      </CollapsibleContent>
    </Collapsible>
  ),
}

export const Open: Story = {
  render: () => (
    <Collapsible className="w-[320px]" defaultOpen>
      <div className="flex items-center justify-between">
        <span className="font-medium">Toggle section</span>
        <CollapsibleTrigger className="text-sm underline">
          Toggle
        </CollapsibleTrigger>
      </div>
      <CollapsibleContent className="mt-2 rounded border p-3 text-sm">
        Visible content
      </CollapsibleContent>
    </Collapsible>
  ),
}

export const Controlled: Story = {
  render: () => {
    const [open, setOpen] = React.useState(false)
    return (
      <Collapsible className="w-[320px]" open={open} onOpenChange={setOpen}>
        <div className="flex items-center justify-between">
          <span className="font-medium">Controlled</span>
          <CollapsibleTrigger className="text-sm underline">
            {open ? 'Close' : 'Open'}
          </CollapsibleTrigger>
        </div>
        <CollapsibleContent className="mt-2 rounded border p-3 text-sm">
          Content controlled by state
        </CollapsibleContent>
      </Collapsible>
    )
  },
}
