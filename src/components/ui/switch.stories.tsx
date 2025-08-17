import type { Meta, StoryObj } from '@storybook/nextjs-vite'

import { Label } from './label'
import { Switch } from './switch'

const meta: Meta<typeof Switch> = {
  title: 'UI/Switch',
  component: Switch,
  parameters: { layout: 'centered' },
}
export default meta

type Story = StoryObj<typeof Switch>

export const Off: Story = {
  render: () => <Switch />,
}

export const On: Story = {
  render: () => <Switch defaultChecked />,
}

export const Disabled: Story = {
  render: () => <Switch disabled defaultChecked />,
}

export const WithLabel: Story = {
  render: () => (
    <div className="flex items-center gap-2">
      <Switch id="notifications" defaultChecked />
      <Label htmlFor="notifications">Notifications</Label>
    </div>
  ),
}
