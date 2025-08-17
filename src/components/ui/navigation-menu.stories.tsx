import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import * as React from 'react'

import {
  NavigationMenu,
  NavigationMenuList,
  NavigationMenuItem,
  NavigationMenuTrigger,
  NavigationMenuContent,
  NavigationMenuLink,
  NavigationMenuIndicator,
} from './navigation-menu'

const meta: Meta<typeof NavigationMenu> = {
  title: 'UI/NavigationMenu',
  component: NavigationMenu,
  parameters: { layout: 'centered' },
}
export default meta

type Story = StoryObj<typeof NavigationMenu>

export const TopNav: Story = {
  render: () => (
    <NavigationMenu>
      <NavigationMenuList>
        <NavigationMenuItem>
          <NavigationMenuTrigger>Products</NavigationMenuTrigger>
          <NavigationMenuContent>
            <div className="grid w-[420px] grid-cols-2 gap-2 p-2">
              <NavigationMenuLink className="rounded border p-2">
                Analytics
              </NavigationMenuLink>
              <NavigationMenuLink className="rounded border p-2">
                Automation
              </NavigationMenuLink>
              <NavigationMenuLink className="rounded border p-2">
                Reports
              </NavigationMenuLink>
              <NavigationMenuLink className="rounded border p-2">
                Integrations
              </NavigationMenuLink>
            </div>
          </NavigationMenuContent>
        </NavigationMenuItem>
        <NavigationMenuItem>
          <NavigationMenuTrigger>Company</NavigationMenuTrigger>
          <NavigationMenuContent>
            <div className="grid w-[300px] gap-2 p-2">
              <NavigationMenuLink className="rounded border p-2">
                About
              </NavigationMenuLink>
              <NavigationMenuLink className="rounded border p-2">
                Careers
              </NavigationMenuLink>
            </div>
          </NavigationMenuContent>
        </NavigationMenuItem>
      </NavigationMenuList>
      <NavigationMenuIndicator />
    </NavigationMenu>
  ),
}
