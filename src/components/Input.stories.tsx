import type { Meta, StoryObj } from '@storybook/react'
import { Search, Mail, User, Eye, EyeOff, Phone } from 'lucide-react'
import { useState } from 'react'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

const meta: Meta<typeof Input> = {
  title: 'CoreLive Design System/Components/Input',
  component: Input,
  parameters: {
    layout: 'centered',
    docs: {
      description: {
        component:
          'A flexible input component with support for various types, states, and styling. Uses CoreLive Design System tokens for consistent borders, focus states, and spacing.',
      },
    },
  },
  tags: ['autodocs'],
  argTypes: {
    type: {
      control: 'select',
      options: ['text', 'email', 'password', 'number', 'tel', 'url', 'search'],
      description: 'Input type',
    },
    placeholder: {
      control: 'text',
      description: 'Placeholder text',
    },
    disabled: {
      control: 'boolean',
      description: 'Disabled state',
    },
    readOnly: {
      control: 'boolean',
      description: 'Read-only state',
    },
  },
}

export default meta
type Story = StoryObj<typeof meta>

export const Default: Story = {
  args: {
    placeholder: 'Type something...',
  },
}

export const WithLabel: Story = {
  args: {},
  render: () => (
    <div className="grid w-full max-w-sm items-center gap-1.5">
      <Label htmlFor="email">Email</Label>
      <Input type="email" id="email" placeholder="Enter your email" />
    </div>
  ),
}

export const Required: Story = {
  args: {},
  render: () => (
    <div className="grid w-full max-w-sm items-center gap-1.5">
      <Label htmlFor="name">
        Name <span className="text-destructive">*</span>
      </Label>
      <Input id="name" placeholder="Enter your name" required />
    </div>
  ),
}

export const WithIcon: Story = {
  args: {},
  render: () => (
    <div className="w-full max-w-sm space-y-4">
      <div className="relative">
        <Search className="text-muted-foreground absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 transform" />
        <Input className="pl-10" placeholder="Search..." />
      </div>
      <div className="relative">
        <Mail className="text-muted-foreground absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 transform" />
        <Input type="email" className="pl-10" placeholder="Enter email" />
      </div>
      <div className="relative">
        <User className="text-muted-foreground absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 transform" />
        <Input className="pl-10" placeholder="Username" />
      </div>
    </div>
  ),
}

export const PasswordInput: Story = {
  args: {},
  render: () => {
    const [showPassword, setShowPassword] = useState(false)

    return (
      <div className="grid w-full max-w-sm items-center gap-1.5">
        <Label htmlFor="password">Password</Label>
        <div className="relative">
          <Input
            id="password"
            type={showPassword ? 'text' : 'password'}
            placeholder="Enter password"
            className="pr-10"
          />
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="absolute top-0 right-0 h-full px-3 py-2 hover:bg-transparent"
            onClick={() => setShowPassword(!showPassword)}
          >
            {showPassword ? (
              <EyeOff className="text-muted-foreground h-4 w-4" />
            ) : (
              <Eye className="text-muted-foreground h-4 w-4" />
            )}
          </Button>
        </div>
      </div>
    )
  },
}

export const Disabled: Story = {
  args: {
    placeholder: 'Disabled input',
    disabled: true,
  },
}

export const ReadOnly: Story = {
  args: {
    value: 'Read-only value',
    readOnly: true,
  },
}

export const WithError: Story = {
  args: {},
  render: () => (
    <div className="grid w-full max-w-sm items-center gap-1.5">
      <Label htmlFor="email-error">Email</Label>
      <Input
        id="email-error"
        type="email"
        placeholder="Enter email"
        className="border-destructive focus-visible:ring-destructive"
      />
      <p className="text-destructive text-sm">
        Please enter a valid email address.
      </p>
    </div>
  ),
}

export const WithSuccess: Story = {
  args: {},
  render: () => (
    <div className="grid w-full max-w-sm items-center gap-1.5">
      <Label htmlFor="email-success">Email</Label>
      <Input
        id="email-success"
        type="email"
        value="user@example.com"
        className="border-success focus-visible:ring-success"
        readOnly
      />
      <p className="text-success text-sm">Email is valid and available.</p>
    </div>
  ),
}

export const DifferentTypes: Story = {
  args: {},
  render: () => (
    <div className="w-full max-w-sm space-y-4">
      <div className="grid items-center gap-1.5">
        <Label htmlFor="text">Text</Label>
        <Input id="text" type="text" placeholder="Text input" />
      </div>
      <div className="grid items-center gap-1.5">
        <Label htmlFor="email">Email</Label>
        <Input id="email" type="email" placeholder="email@example.com" />
      </div>
      <div className="grid items-center gap-1.5">
        <Label htmlFor="password">Password</Label>
        <Input id="password" type="password" placeholder="Password" />
      </div>
      <div className="grid items-center gap-1.5">
        <Label htmlFor="number">Number</Label>
        <Input id="number" type="number" placeholder="123" />
      </div>
      <div className="grid items-center gap-1.5">
        <Label htmlFor="tel">Phone</Label>
        <Input id="tel" type="tel" placeholder="+1 (555) 123-4567" />
      </div>
      <div className="grid items-center gap-1.5">
        <Label htmlFor="url">URL</Label>
        <Input id="url" type="url" placeholder="https://example.com" />
      </div>
      <div className="grid items-center gap-1.5">
        <Label htmlFor="search">Search</Label>
        <Input id="search" type="search" placeholder="Search..." />
      </div>
    </div>
  ),
}

export const InputGroup: Story = {
  args: {},
  render: () => (
    <div className="w-full max-w-sm space-y-4">
      <div className="flex w-full items-center space-x-2">
        <Input placeholder="Enter amount" />
        <Button type="submit">Send</Button>
      </div>
      <div className="flex w-full items-center">
        <Input placeholder="https://" className="rounded-r-none border-r-0" />
        <Button variant="outline" className="rounded-l-none">
          .com
        </Button>
      </div>
    </div>
  ),
}

export const CoreLiveThemeShowcase: Story = {
  args: {},
  render: () => (
    <div className="w-full max-w-lg space-y-6">
      <div>
        <h3 className="text-heading-3 mb-4 font-medium">Input States</h3>
        <div className="space-y-3">
          <div className="grid items-center gap-1.5">
            <Label>Default State</Label>
            <Input
              placeholder="Default input"
              style={{
                backgroundColor: 'var(--component-input-background)',
                borderColor: 'var(--component-input-border)',
                color: 'var(--component-input-text)',
              }}
            />
          </div>

          <div className="grid items-center gap-1.5">
            <Label>Focus State</Label>
            <Input
              placeholder="Focus to see border color change"
              className="focus:border-primary focus-visible:ring-primary"
            />
          </div>

          <div className="grid items-center gap-1.5">
            <Label>Error State</Label>
            <Input
              placeholder="Error input"
              style={{
                borderColor: 'var(--component-input-border-error)',
              }}
              className="focus-visible:ring-destructive"
            />
            <p
              className="text-sm"
              style={{ color: 'var(--system-color-danger)' }}
            >
              This field has an error
            </p>
          </div>

          <div className="grid items-center gap-1.5">
            <Label>Success State</Label>
            <Input
              placeholder="Success input"
              style={{
                borderColor: 'var(--component-input-border-success)',
              }}
              className="focus-visible:ring-success"
            />
            <p
              className="text-sm"
              style={{ color: 'var(--system-color-success)' }}
            >
              This field is valid
            </p>
          </div>

          <div className="grid items-center gap-1.5">
            <Label>Disabled State</Label>
            <Input
              placeholder="Disabled input"
              disabled
              style={{
                backgroundColor: 'var(--component-input-background-disabled)',
                color: 'var(--component-input-text-disabled)',
              }}
            />
          </div>
        </div>
      </div>

      <div>
        <h3 className="text-heading-3 mb-4 font-medium">
          Component Token Usage
        </h3>
        <div className="space-y-3">
          <input
            type="text"
            placeholder="Using component input tokens directly"
            className="w-full rounded-md border px-3 py-2 transition-colors"
            style={{
              backgroundColor: 'var(--component-input-background)',
              borderColor: 'var(--component-input-border)',
              color: 'var(--component-input-text)',
              boxShadow: 'var(--component-input-shadow)',
            }}
            onFocus={(e) => {
              e.target.style.borderColor = 'var(--component-input-border-focus)'
              e.target.style.boxShadow = 'var(--component-input-shadow-focus)'
            }}
            onBlur={(e) => {
              e.target.style.borderColor = 'var(--component-input-border)'
              e.target.style.boxShadow = 'var(--component-input-shadow)'
            }}
          />
        </div>
      </div>

      <div>
        <h3 className="text-heading-3 mb-4 font-medium">Advanced Examples</h3>
        <div className="space-y-3">
          <div className="relative">
            <Phone className="text-muted-foreground absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 transform" />
            <Input
              type="tel"
              placeholder="+1 (555) 123-4567"
              className="pl-10"
            />
          </div>

          <div className="flex gap-2">
            <Input placeholder="Grouped input" className="flex-1" />
            <Button className="bg-primary hover:bg-primary-hover text-on-primary">
              Submit
            </Button>
          </div>

          <div className="grid grid-cols-3 gap-2">
            <Input placeholder="MM" maxLength={2} />
            <Input placeholder="DD" maxLength={2} />
            <Input placeholder="YYYY" maxLength={4} />
          </div>
        </div>
      </div>
    </div>
  ),
  parameters: {
    layout: 'padded',
    docs: {
      description: {
        story:
          'Comprehensive showcase of input variations using CoreLive Design System tokens for consistent styling across different states and interactions.',
      },
    },
  },
}
