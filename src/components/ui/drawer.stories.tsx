import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import * as React from 'react'

import { Button } from './button'
import {
  Drawer,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
  DrawerDescription,
  DrawerFooter,
} from './drawer'

const meta: Meta<typeof Drawer> = {
  title: 'UI/Drawer',
  component: Drawer,
  parameters: { layout: 'centered' },
}
export default meta

type Story = StoryObj<typeof Drawer>

export const Bottom: Story = {
  render: () => (
    <Drawer open>
      <DrawerContent>
        <DrawerHeader>
          <DrawerTitle>Move to folder</DrawerTitle>
          <DrawerDescription>Select a destination</DrawerDescription>
        </DrawerHeader>
        <div className="p-4 text-sm">Main content area</div>
        <DrawerFooter>
          <Button variant="secondary">Cancel</Button>
          <Button>Move</Button>
        </DrawerFooter>
      </DrawerContent>
    </Drawer>
  ),
}
