import type { Meta, StoryObj } from '@storybook/react'
import * as React from 'react'

import {
  Select,
  SelectTrigger,
  SelectContent,
  SelectItem,
  SelectLabel,
  SelectSeparator,
  SelectGroup,
  SelectValue,
} from './select'

const meta: Meta<typeof Select> = {
  title: 'UI/Select',
  component: Select,
  parameters: { layout: 'centered' },
}
export default meta

type Story = StoryObj<typeof Select>

export const Default: Story = {
  render: () => (
    <Select defaultValue="apple">
      <SelectTrigger className="min-w-40">
        <SelectValue placeholder="Select a fruit" />
      </SelectTrigger>
      <SelectContent>
        <SelectGroup>
          <SelectLabel>Fruits</SelectLabel>
          <SelectItem value="apple">Apple</SelectItem>
          <SelectItem value="banana">Banana</SelectItem>
          <SelectItem value="blueberry">Blueberry</SelectItem>
        </SelectGroup>
        <SelectSeparator />
        <SelectGroup>
          <SelectLabel>Vegetables</SelectLabel>
          <SelectItem value="carrot">Carrot</SelectItem>
          <SelectItem value="onion">Onion</SelectItem>
        </SelectGroup>
      </SelectContent>
    </Select>
  ),
}
