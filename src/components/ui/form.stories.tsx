import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import * as React from 'react'
import { useForm } from 'react-hook-form'

import { Button } from './button'
import {
  Form,
  FormField,
  FormItem,
  FormLabel,
  FormControl,
  FormMessage,
} from './form'
import { Input } from './input'

const meta: Meta<typeof Form> = {
  title: 'UI/Form',
  component: Form,
  parameters: { layout: 'centered' },
}
export default meta

type Story = StoryObj<typeof Form>

export const RHFExample: Story = {
  render: () => {
    const methods = useForm<{ email: string }>({ defaultValues: { email: '' } })
    return (
      <Form {...methods}>
        <form
          className="flex w-80 flex-col gap-3"
          onSubmit={methods.handleSubmit(() => {})}
        >
          <FormField
            control={methods.control}
            name="email"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Email</FormLabel>
                <FormControl>
                  <Input
                    type="email"
                    placeholder="you@example.com"
                    {...field}
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <Button type="submit">Submit</Button>
        </form>
      </Form>
    )
  },
}
