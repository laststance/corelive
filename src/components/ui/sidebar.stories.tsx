import type { Meta, StoryObj } from '@storybook/react'
import { HomeIcon, SettingsIcon, UserIcon } from 'lucide-react'
import * as React from 'react'

import {
  Sidebar,
  SidebarProvider,
  SidebarHeader,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupLabel,
  SidebarGroupContent,
  SidebarMenu,
  SidebarMenuItem,
  SidebarMenuButton,
  SidebarTrigger,
} from './sidebar'

const meta: Meta<typeof SidebarProvider> = {
  title: 'UI/Sidebar',
  component: SidebarProvider,
  parameters: { layout: 'fullscreen' },
}
export default meta

type Story = StoryObj<typeof SidebarProvider>

export const Default: Story = {
  render: () => (
    <SidebarProvider>
      <Sidebar>
        <SidebarHeader>
          <div className="flex items-center gap-2 px-2">
            <div className="bg-primary h-6 w-6 rounded-md"></div>
            <span className="font-semibold">My App</span>
          </div>
        </SidebarHeader>
        <SidebarContent>
          <SidebarGroup>
            <SidebarGroupLabel>Navigation</SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                <SidebarMenuItem>
                  <SidebarMenuButton isActive tooltip="Home">
                    <HomeIcon />
                    <span>Home</span>
                  </SidebarMenuButton>
                </SidebarMenuItem>
                <SidebarMenuItem>
                  <SidebarMenuButton tooltip="Profile">
                    <UserIcon />
                    <span>Profile</span>
                  </SidebarMenuButton>
                </SidebarMenuItem>
                <SidebarMenuItem>
                  <SidebarMenuButton tooltip="Settings">
                    <SettingsIcon />
                    <span>Settings</span>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        </SidebarContent>
        <SidebarFooter>
          <div className="flex items-center justify-between px-2">
            <div className="flex items-center gap-2">
              <div className="bg-muted h-6 w-6 rounded-full"></div>
              <span className="text-sm">User Name</span>
            </div>
            <SidebarTrigger />
          </div>
        </SidebarFooter>
      </Sidebar>
      <div className="flex-1 p-4">
        <h1 className="text-2xl font-bold">Main Content</h1>
        <p className="text-muted-foreground">This is the main content area.</p>
      </div>
    </SidebarProvider>
  ),
}

export const Collapsed: Story = {
  render: () => (
    <SidebarProvider defaultOpen={false}>
      <Sidebar>
        <SidebarHeader>
          <div className="flex items-center gap-2 px-2">
            <div className="bg-primary h-6 w-6 rounded-md"></div>
            <span className="font-semibold">My App</span>
          </div>
        </SidebarHeader>
        <SidebarContent>
          <SidebarGroup>
            <SidebarGroupLabel>Navigation</SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                <SidebarMenuItem>
                  <SidebarMenuButton isActive tooltip="Home">
                    <HomeIcon />
                    <span>Home</span>
                  </SidebarMenuButton>
                </SidebarMenuItem>
                <SidebarMenuItem>
                  <SidebarMenuButton tooltip="Profile">
                    <UserIcon />
                    <span>Profile</span>
                  </SidebarMenuButton>
                </SidebarMenuItem>
                <SidebarMenuItem>
                  <SidebarMenuButton tooltip="Settings">
                    <SettingsIcon />
                    <span>Settings</span>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        </SidebarContent>
        <SidebarFooter>
          <div className="flex items-center justify-between px-2">
            <div className="flex items-center gap-2">
              <div className="bg-muted h-6 w-6 rounded-full"></div>
              <span className="text-sm">User Name</span>
            </div>
            <SidebarTrigger />
          </div>
        </SidebarFooter>
      </Sidebar>
      <div className="flex-1 p-4">
        <h1 className="text-2xl font-bold">Main Content</h1>
        <p className="text-muted-foreground">This is the main content area.</p>
      </div>
    </SidebarProvider>
  ),
}
