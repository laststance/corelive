import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import * as React from 'react'

import {
  Command,
  CommandDialog,
  CommandInput,
  CommandList,
  CommandEmpty,
  CommandGroup,
  CommandItem,
  CommandShortcut,
  CommandSeparator,
} from './command'

const meta: Meta<typeof Command> = {
  title: 'UI/Command',
  component: Command,
  parameters: { layout: 'centered' },
}
export default meta

type Story = StoryObj<typeof Command>

export const Palette: Story = {
  render: () => (
    <Command className="w-[420px]">
      <CommandInput placeholder="Type a command or search..." />
      <CommandList>
        <CommandEmpty>No results found.</CommandEmpty>
        <CommandGroup heading="Suggestions">
          <CommandItem>
            Open File<CommandShortcut>⌘O</CommandShortcut>
          </CommandItem>
          <CommandItem>
            Save<CommandShortcut>⌘S</CommandShortcut>
          </CommandItem>
          <CommandItem disabled>
            Rename<CommandShortcut>F2</CommandShortcut>
          </CommandItem>
        </CommandGroup>
        <CommandSeparator />
        <CommandGroup heading="Navigation">
          <CommandItem>Home</CommandItem>
          <CommandItem>Projects</CommandItem>
          <CommandItem>Settings</CommandItem>
        </CommandGroup>
      </CommandList>
    </Command>
  ),
}

export const Dialog: Story = {
  render: () => (
    <CommandDialog open>
      <CommandInput placeholder="Search commands..." />
      <CommandList>
        <CommandEmpty>No results found.</CommandEmpty>
        <CommandGroup heading="Files">
          <CommandItem>index.tsx</CommandItem>
          <CommandItem>page.tsx</CommandItem>
          <CommandItem>README.md</CommandItem>
        </CommandGroup>
      </CommandList>
    </CommandDialog>
  ),
}
