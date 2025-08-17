import type { Meta, StoryObj } from '@storybook/react'
import * as React from 'react'

import { Textarea } from './textarea'

const meta: Meta<typeof Textarea> = {
  title: 'UI/Textarea',
  component: Textarea,
  parameters: { layout: 'centered' },
}
export default meta

type Story = StoryObj<typeof Textarea>

export const Default: Story = {
  render: () => (
    <Textarea placeholder="Type your message here." className="w-[300px]" />
  ),
}

export const Disabled: Story = {
  render: () => (
    <Textarea
      disabled
      placeholder="This textarea is disabled."
      className="w-[300px]"
    />
  ),
}

export const WithLabel: Story = {
  render: () => (
    <div className="grid w-[300px] gap-1.5">
      <label htmlFor="message" className="text-sm font-medium">
        Your message
      </label>
      <Textarea placeholder="Type your message here." id="message" />
      <p className="text-muted-foreground text-xs">
        Your message will be sent to our team.
      </p>
    </div>
  ),
}

export const Invalid: Story = {
  render: () => (
    <div className="grid w-[300px] gap-1.5">
      <label htmlFor="message-invalid" className="text-sm font-medium">
        Your message
      </label>
      <Textarea
        placeholder="Type your message here."
        id="message-invalid"
        aria-invalid={true}
      />
      <p className="text-destructive text-xs">Please enter a valid message.</p>
    </div>
  ),
}
