import type { Meta, StoryObj } from '@storybook/react'
import * as React from 'react'

import {
  ContextMenu,
  ContextMenuTrigger,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuLabel,
  ContextMenuGroup,
  ContextMenuSub,
  ContextMenuSubTrigger,
  ContextMenuSubContent,
  ContextMenuCheckboxItem,
  ContextMenuRadioGroup,
  ContextMenuRadioItem,
} from './context-menu'

const meta: Meta<typeof ContextMenu> = {
  title: 'UI/ContextMenu',
  component: ContextMenu,
  parameters: { layout: 'centered' },
}
export default meta

type Story = StoryObj<typeof ContextMenu>

export const Menu: Story = {
  render: () => (
    <ContextMenu>
      <ContextMenuTrigger className="bg-muted text-muted-foreground rounded p-6">
        Right click here
      </ContextMenuTrigger>
      <ContextMenuContent className="w-64">
        <ContextMenuLabel>File</ContextMenuLabel>
        <ContextMenuGroup>
          <ContextMenuItem>New File</ContextMenuItem>
          <ContextMenuItem>Open...</ContextMenuItem>
          <ContextMenuItem disabled>Rename</ContextMenuItem>
        </ContextMenuGroup>
        <ContextMenuSeparator />
        <ContextMenuSub>
          <ContextMenuSubTrigger>Share</ContextMenuSubTrigger>
          <ContextMenuSubContent>
            <ContextMenuItem>Email</ContextMenuItem>
            <ContextMenuItem>Copy link</ContextMenuItem>
          </ContextMenuSubContent>
        </ContextMenuSub>
        <ContextMenuSeparator />
        <ContextMenuCheckboxItem checked>Show hidden</ContextMenuCheckboxItem>
        <ContextMenuRadioGroup value="list">
          <ContextMenuRadioItem value="grid">Grid</ContextMenuRadioItem>
          <ContextMenuRadioItem value="list">List</ContextMenuRadioItem>
        </ContextMenuRadioGroup>
      </ContextMenuContent>
    </ContextMenu>
  ),
}
