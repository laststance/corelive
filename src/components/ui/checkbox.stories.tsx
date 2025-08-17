import type { Meta, StoryObj } from '@storybook/react'

import { Checkbox } from './checkbox'
import { Label } from './label'

const meta: Meta<typeof Checkbox> = {
  title: 'UI/Checkbox',
  component: Checkbox,
  parameters: { layout: 'centered' },
}
export default meta

type Story = StoryObj<typeof Checkbox>

export const Unchecked: Story = {
  render: () => <Checkbox />,
}

export const Checked: Story = {
  render: () => <Checkbox defaultChecked />,
}

export const Disabled: Story = {
  render: () => <Checkbox disabled defaultChecked />,
}

export const WithLabel: Story = {
  render: () => (
    <div className="flex items-center gap-2">
      <Checkbox id="accept" />
      <Label htmlFor="accept">Accept terms</Label>
    </div>
  ),
}

export const Invalid: Story = {
  render: () => <Checkbox aria-invalid />,
}
