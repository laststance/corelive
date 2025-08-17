import type { Meta, StoryObj } from '@storybook/react'
import * as React from 'react'

import { Tabs, TabsList, TabsTrigger, TabsContent } from './tabs'

const meta: Meta<typeof Tabs> = {
  title: 'UI/Tabs',
  component: Tabs,
  parameters: { layout: 'centered' },
}
export default meta

type Story = StoryObj<typeof Tabs>

export const Horizontal: Story = {
  render: () => (
    <Tabs defaultValue="account" className="w-[380px]">
      <TabsList>
        <TabsTrigger value="account">Account</TabsTrigger>
        <TabsTrigger value="password">Password</TabsTrigger>
      </TabsList>
      <TabsContent value="account" className="mt-3 text-sm">
        Account content
      </TabsContent>
      <TabsContent value="password" className="mt-3 text-sm">
        Password content
      </TabsContent>
    </Tabs>
  ),
}
