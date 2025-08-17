import type { Meta, StoryObj } from '@storybook/react'
import * as React from 'react'

import { Label } from './label'
import { RadioGroup, RadioGroupItem } from './radio-group'

const meta: Meta<typeof RadioGroup> = {
  title: 'UI/RadioGroup',
  component: RadioGroup,
  parameters: { layout: 'centered' },
}
export default meta

type Story = StoryObj<typeof RadioGroup>

export const Horizontal: Story = {
  render: () => (
    <RadioGroup defaultValue="a" className="flex items-center gap-4">
      <div className="flex items-center gap-2">
        <RadioGroupItem id="r1" value="a" />
        <Label htmlFor="r1">A</Label>
      </div>
      <div className="flex items-center gap-2">
        <RadioGroupItem id="r2" value="b" />
        <Label htmlFor="r2">B</Label>
      </div>
      <div className="flex items-center gap-2">
        <RadioGroupItem id="r3" value="c" />
        <Label htmlFor="r3">C</Label>
      </div>
    </RadioGroup>
  ),
}
