import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import * as React from 'react'

import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuLabel,
  DropdownMenuGroup,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuCheckboxItem,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
} from './dropdown-menu'

const meta: Meta<typeof DropdownMenu> = {
  title: 'UI/DropdownMenu',
  component: DropdownMenu,
  parameters: { layout: 'centered' },
}
export default meta

type Story = StoryObj<typeof DropdownMenu>

export const Menu: Story = {
  render: () => (
    <DropdownMenu>
      <DropdownMenuTrigger className="bg-muted text-muted-foreground rounded px-4 py-2 text-sm">
        Open menu
      </DropdownMenuTrigger>
      <DropdownMenuContent className="w-60">
        <DropdownMenuLabel>Application</DropdownMenuLabel>
        <DropdownMenuGroup>
          <DropdownMenuItem>New Window</DropdownMenuItem>
          <DropdownMenuItem>Open...</DropdownMenuItem>
          <DropdownMenuItem disabled>Save</DropdownMenuItem>
        </DropdownMenuGroup>
        <DropdownMenuSeparator />
        <DropdownMenuSub>
          <DropdownMenuSubTrigger>Share</DropdownMenuSubTrigger>
          <DropdownMenuSubContent>
            <DropdownMenuItem>Email link</DropdownMenuItem>
            <DropdownMenuItem>Copy link</DropdownMenuItem>
          </DropdownMenuSubContent>
        </DropdownMenuSub>
        <DropdownMenuSeparator />
        <DropdownMenuCheckboxItem checked>Auto Save</DropdownMenuCheckboxItem>
        <DropdownMenuRadioGroup value="list">
          <DropdownMenuRadioItem value="grid">Grid</DropdownMenuRadioItem>
          <DropdownMenuRadioItem value="list">List</DropdownMenuRadioItem>
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  ),
}
