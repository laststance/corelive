import type { Meta, StoryObj } from '@storybook/react'
import * as React from 'react'

import {
  ResizablePanelGroup,
  ResizablePanel,
  ResizableHandle,
} from './resizable'

const meta: Meta<typeof ResizablePanelGroup> = {
  title: 'UI/Resizable',
  component: ResizablePanelGroup,
  parameters: { layout: 'centered' },
}
export default meta

type Story = StoryObj<typeof ResizablePanelGroup>

export const HorizontalPanels: Story = {
  render: () => (
    <ResizablePanelGroup
      direction="horizontal"
      className="h-[300px] max-w-md rounded-lg border"
    >
      <ResizablePanel defaultSize={50}>
        <div className="flex h-full items-center justify-center p-6">
          <span className="font-medium">Left panel</span>
        </div>
      </ResizablePanel>
      <ResizableHandle withHandle />
      <ResizablePanel defaultSize={50}>
        <div className="flex h-full items-center justify-center p-6">
          <span className="font-medium">Right panel</span>
        </div>
      </ResizablePanel>
    </ResizablePanelGroup>
  ),
}

export const VerticalPanels: Story = {
  render: () => (
    <ResizablePanelGroup
      direction="vertical"
      className="h-[300px] max-w-md rounded-lg border"
    >
      <ResizablePanel defaultSize={50}>
        <div className="flex h-full items-center justify-center p-6">
          <span className="font-medium">Top panel</span>
        </div>
      </ResizablePanel>
      <ResizableHandle withHandle />
      <ResizablePanel defaultSize={50}>
        <div className="flex h-full items-center justify-center p-6">
          <span className="font-medium">Bottom panel</span>
        </div>
      </ResizablePanel>
    </ResizablePanelGroup>
  ),
}
