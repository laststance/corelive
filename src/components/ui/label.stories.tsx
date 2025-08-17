import type { Meta, StoryObj } from '@storybook/react'
import * as React from 'react'

import { Input } from './input'
import { Label } from './label'

const meta: Meta<typeof Label> = {
  title: 'UI/Label',
  component: Label,
  parameters: { layout: 'centered' },
}
export default meta

type Story = StoryObj<typeof Label>

export const WithInput: Story = {
  render: () => (
    <div className="flex w-72 flex-col gap-2">
      <Label htmlFor="email">Email</Label>
      <Input id="email" type="email" placeholder="you@example.com" />
    </div>
  ),
}
