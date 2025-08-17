import type { Meta, StoryObj } from '@storybook/react'

import { Button } from './button'
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
  CardFooter,
  CardAction,
} from './card'

const meta: Meta<typeof Card> = {
  title: 'UI/Card',
  component: Card,
  parameters: { layout: 'centered' },
}
export default meta

type Story = StoryObj<typeof Card>

export const Default: Story = {
  render: () => (
    <Card className="w-[360px]">
      <CardHeader>
        <CardTitle>Card title</CardTitle>
        <CardDescription>Short description goes here.</CardDescription>
        <CardAction>
          <Button size="sm">Action</Button>
        </CardAction>
      </CardHeader>
      <CardContent>Content area with arbitrary elements.</CardContent>
      <CardFooter>
        <Button variant="secondary" size="sm">
          Secondary
        </Button>
      </CardFooter>
    </Card>
  ),
}
