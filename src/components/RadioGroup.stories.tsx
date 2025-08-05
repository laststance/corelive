import type { Meta, StoryObj } from '@storybook/react'
import {
  CreditCard,
  Wallet,
  Banknote,
  Zap,
  Star,
  Sparkles,
  Rocket,
  Plane,
  Train,
  Car,
  Bike,
  Package,
  Truck,
} from 'lucide-react'
import { useState } from 'react'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { Label } from '@/components/ui/label'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
import { Separator } from '@/components/ui/separator'

const meta: Meta<typeof RadioGroup> = {
  title: 'CoreLive Design System/Components/RadioGroup',
  component: RadioGroup,
  parameters: {
    layout: 'centered',
    docs: {
      description: {
        component:
          'A set of radio buttons for selecting a single option from multiple choices. Accessible and styled with CoreLive Design System tokens.',
      },
    },
  },
  tags: ['autodocs'],
}

export default meta
type Story = StoryObj<typeof meta>

export const Default: Story = {
  args: {},
  render: () => (
    <RadioGroup defaultValue="option-one">
      <div className="flex items-center space-x-2">
        <RadioGroupItem value="option-one" id="option-one" />
        <Label htmlFor="option-one">Option One</Label>
      </div>
      <div className="flex items-center space-x-2">
        <RadioGroupItem value="option-two" id="option-two" />
        <Label htmlFor="option-two">Option Two</Label>
      </div>
      <div className="flex items-center space-x-2">
        <RadioGroupItem value="option-three" id="option-three" />
        <Label htmlFor="option-three">Option Three</Label>
      </div>
    </RadioGroup>
  ),
}

export const WithDescriptions: Story = {
  args: {},
  render: () => (
    <RadioGroup defaultValue="comfortable" className="space-y-3">
      <div className="flex items-start space-x-3">
        <RadioGroupItem value="default" id="default" className="mt-1" />
        <div className="grid gap-1.5 leading-none">
          <Label htmlFor="default">Default</Label>
          <p className="text-muted-foreground text-sm">
            The standard configuration with balanced settings
          </p>
        </div>
      </div>
      <div className="flex items-start space-x-3">
        <RadioGroupItem value="comfortable" id="comfortable" className="mt-1" />
        <div className="grid gap-1.5 leading-none">
          <Label htmlFor="comfortable">Comfortable</Label>
          <p className="text-muted-foreground text-sm">
            Extra spacing and larger targets for improved usability
          </p>
        </div>
      </div>
      <div className="flex items-start space-x-3">
        <RadioGroupItem value="compact" id="compact" className="mt-1" />
        <div className="grid gap-1.5 leading-none">
          <Label htmlFor="compact">Compact</Label>
          <p className="text-muted-foreground text-sm">
            Reduced spacing to display more content
          </p>
        </div>
      </div>
    </RadioGroup>
  ),
}

export const PaymentMethods: Story = {
  args: {},
  render: () => {
    const [selectedMethod, setSelectedMethod] = useState('card')

    return (
      <Card className="w-[400px]">
        <CardHeader>
          <CardTitle>Payment Method</CardTitle>
          <CardDescription>Choose how you want to pay</CardDescription>
        </CardHeader>
        <CardContent>
          <RadioGroup value={selectedMethod} onValueChange={setSelectedMethod}>
            <div className="grid gap-3">
              <div className="hover:bg-muted/50 flex cursor-pointer items-center space-x-3 rounded-lg border p-4">
                <RadioGroupItem value="card" id="card" />
                <Label
                  htmlFor="card"
                  className="flex flex-1 cursor-pointer items-center gap-3"
                >
                  <CreditCard className="h-5 w-5" />
                  <div>
                    <p className="font-medium">Credit Card</p>
                    <p className="text-muted-foreground text-sm">
                      Visa, Mastercard, Amex
                    </p>
                  </div>
                </Label>
              </div>

              <div className="hover:bg-muted/50 flex cursor-pointer items-center space-x-3 rounded-lg border p-4">
                <RadioGroupItem value="paypal" id="paypal" />
                <Label
                  htmlFor="paypal"
                  className="flex flex-1 cursor-pointer items-center gap-3"
                >
                  <Wallet className="h-5 w-5" />
                  <div>
                    <p className="font-medium">PayPal</p>
                    <p className="text-muted-foreground text-sm">
                      Pay with your PayPal account
                    </p>
                  </div>
                </Label>
              </div>

              <div className="hover:bg-muted/50 flex cursor-pointer items-center space-x-3 rounded-lg border p-4">
                <RadioGroupItem value="bank" id="bank" />
                <Label
                  htmlFor="bank"
                  className="flex flex-1 cursor-pointer items-center gap-3"
                >
                  <Banknote className="h-5 w-5" />
                  <div>
                    <p className="font-medium">Bank Transfer</p>
                    <p className="text-muted-foreground text-sm">
                      Direct bank payment
                    </p>
                  </div>
                </Label>
              </div>
            </div>
          </RadioGroup>

          <Separator className="my-4" />

          <Button className="w-full">
            Continue with{' '}
            {selectedMethod === 'card'
              ? 'Credit Card'
              : selectedMethod === 'paypal'
                ? 'PayPal'
                : 'Bank Transfer'}
          </Button>
        </CardContent>
      </Card>
    )
  },
}

export const SubscriptionPlans: Story = {
  args: {},
  render: () => {
    const [selectedPlan, setSelectedPlan] = useState('pro')

    return (
      <div className="w-full max-w-3xl">
        <div className="mb-6 text-center">
          <h2 className="text-heading-2 mb-2 font-bold">Choose Your Plan</h2>
          <p className="text-muted-foreground">
            Select the perfect plan for your needs
          </p>
        </div>

        <RadioGroup
          value={selectedPlan}
          onValueChange={setSelectedPlan}
          className="grid gap-4"
        >
          <div
            className={`relative cursor-pointer rounded-lg border p-6 transition-all ${
              selectedPlan === 'basic'
                ? 'border-primary bg-primary/5'
                : 'hover:border-muted-foreground/50'
            }`}
          >
            <div className="flex items-start space-x-3">
              <RadioGroupItem value="basic" id="basic" className="mt-1" />
              <div className="flex-1">
                <Label htmlFor="basic" className="cursor-pointer">
                  <div className="mb-2 flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Star className="h-5 w-5" />
                      <span className="text-lg font-semibold">Basic</span>
                    </div>
                    <div className="text-right">
                      <p className="text-2xl font-bold">$9</p>
                      <p className="text-muted-foreground text-sm">/month</p>
                    </div>
                  </div>
                  <p className="text-muted-foreground mb-3 text-sm">
                    Perfect for individuals
                  </p>
                  <ul className="space-y-2 text-sm">
                    <li className="flex items-center gap-2">
                      <div className="bg-primary h-1.5 w-1.5 rounded-full" />5
                      Projects
                    </li>
                    <li className="flex items-center gap-2">
                      <div className="bg-primary h-1.5 w-1.5 rounded-full" />
                      Basic Support
                    </li>
                    <li className="flex items-center gap-2">
                      <div className="bg-primary h-1.5 w-1.5 rounded-full" />
                      1GB Storage
                    </li>
                  </ul>
                </Label>
              </div>
            </div>
          </div>

          <div
            className={`relative cursor-pointer rounded-lg border p-6 transition-all ${
              selectedPlan === 'pro'
                ? 'border-primary bg-primary/5'
                : 'hover:border-muted-foreground/50'
            }`}
          >
            <Badge className="bg-primary text-on-primary absolute -top-3 left-6">
              Most Popular
            </Badge>
            <div className="flex items-start space-x-3">
              <RadioGroupItem value="pro" id="pro" className="mt-1" />
              <div className="flex-1">
                <Label htmlFor="pro" className="cursor-pointer">
                  <div className="mb-2 flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Sparkles className="h-5 w-5" />
                      <span className="text-lg font-semibold">Pro</span>
                    </div>
                    <div className="text-right">
                      <p className="text-2xl font-bold">$29</p>
                      <p className="text-muted-foreground text-sm">/month</p>
                    </div>
                  </div>
                  <p className="text-muted-foreground mb-3 text-sm">
                    Great for growing teams
                  </p>
                  <ul className="space-y-2 text-sm">
                    <li className="flex items-center gap-2">
                      <div className="bg-primary h-1.5 w-1.5 rounded-full" />
                      Unlimited Projects
                    </li>
                    <li className="flex items-center gap-2">
                      <div className="bg-primary h-1.5 w-1.5 rounded-full" />
                      Priority Support
                    </li>
                    <li className="flex items-center gap-2">
                      <div className="bg-primary h-1.5 w-1.5 rounded-full" />
                      10GB Storage
                    </li>
                    <li className="flex items-center gap-2">
                      <div className="bg-primary h-1.5 w-1.5 rounded-full" />
                      Advanced Analytics
                    </li>
                  </ul>
                </Label>
              </div>
            </div>
          </div>

          <div
            className={`relative cursor-pointer rounded-lg border p-6 transition-all ${
              selectedPlan === 'enterprise'
                ? 'border-primary bg-primary/5'
                : 'hover:border-muted-foreground/50'
            }`}
          >
            <div className="flex items-start space-x-3">
              <RadioGroupItem
                value="enterprise"
                id="enterprise"
                className="mt-1"
              />
              <div className="flex-1">
                <Label htmlFor="enterprise" className="cursor-pointer">
                  <div className="mb-2 flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Rocket className="h-5 w-5" />
                      <span className="text-lg font-semibold">Enterprise</span>
                    </div>
                    <div className="text-right">
                      <p className="text-2xl font-bold">Custom</p>
                      <p className="text-muted-foreground text-sm">
                        Contact us
                      </p>
                    </div>
                  </div>
                  <p className="text-muted-foreground mb-3 text-sm">
                    For large organizations
                  </p>
                  <ul className="space-y-2 text-sm">
                    <li className="flex items-center gap-2">
                      <div className="bg-primary h-1.5 w-1.5 rounded-full" />
                      Everything in Pro
                    </li>
                    <li className="flex items-center gap-2">
                      <div className="bg-primary h-1.5 w-1.5 rounded-full" />
                      Dedicated Support
                    </li>
                    <li className="flex items-center gap-2">
                      <div className="bg-primary h-1.5 w-1.5 rounded-full" />
                      Unlimited Storage
                    </li>
                    <li className="flex items-center gap-2">
                      <div className="bg-primary h-1.5 w-1.5 rounded-full" />
                      Custom Integrations
                    </li>
                  </ul>
                </Label>
              </div>
            </div>
          </div>
        </RadioGroup>

        <div className="mt-6 text-center">
          <Button size="lg" className="min-w-[200px]">
            Get Started with{' '}
            {selectedPlan.charAt(0).toUpperCase() + selectedPlan.slice(1)}
          </Button>
        </div>
      </div>
    )
  },
  parameters: {
    layout: 'padded',
  },
}

export const ShippingOptions: Story = {
  args: {},
  render: () => {
    const [shipping, setShipping] = useState('standard')

    return (
      <Card className="w-[400px]">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Package className="h-5 w-5" />
            Shipping Options
          </CardTitle>
          <CardDescription>Choose your delivery speed</CardDescription>
        </CardHeader>
        <CardContent>
          <RadioGroup
            value={shipping}
            onValueChange={setShipping}
            className="space-y-3"
          >
            <div className="flex items-center justify-between rounded-lg border p-3">
              <div className="flex items-center space-x-3">
                <RadioGroupItem value="economy" id="economy" />
                <Label htmlFor="economy" className="cursor-pointer">
                  <div>
                    <p className="flex items-center gap-2 font-medium">
                      <Truck className="h-4 w-4" />
                      Economy Shipping
                    </p>
                    <p className="text-muted-foreground text-sm">
                      5-7 business days
                    </p>
                  </div>
                </Label>
              </div>
              <span className="font-semibold">Free</span>
            </div>

            <div className="flex items-center justify-between rounded-lg border p-3">
              <div className="flex items-center space-x-3">
                <RadioGroupItem value="standard" id="standard" />
                <Label htmlFor="standard" className="cursor-pointer">
                  <div>
                    <p className="flex items-center gap-2 font-medium">
                      <Car className="h-4 w-4" />
                      Standard Shipping
                    </p>
                    <p className="text-muted-foreground text-sm">
                      3-5 business days
                    </p>
                  </div>
                </Label>
              </div>
              <span className="font-semibold">$5.99</span>
            </div>

            <div className="flex items-center justify-between rounded-lg border p-3">
              <div className="flex items-center space-x-3">
                <RadioGroupItem value="express" id="express" />
                <Label htmlFor="express" className="cursor-pointer">
                  <div>
                    <p className="flex items-center gap-2 font-medium">
                      <Zap className="h-4 w-4" />
                      Express Shipping
                    </p>
                    <p className="text-muted-foreground text-sm">
                      1-2 business days
                    </p>
                  </div>
                </Label>
              </div>
              <span className="font-semibold">$12.99</span>
            </div>

            <div className="flex items-center justify-between rounded-lg border p-3">
              <div className="flex items-center space-x-3">
                <RadioGroupItem value="overnight" id="overnight" />
                <Label htmlFor="overnight" className="cursor-pointer">
                  <div>
                    <p className="flex items-center gap-2 font-medium">
                      <Plane className="h-4 w-4" />
                      Overnight
                    </p>
                    <p className="text-muted-foreground text-sm">
                      Next business day
                    </p>
                  </div>
                </Label>
              </div>
              <span className="font-semibold">$24.99</span>
            </div>
          </RadioGroup>

          <Separator className="my-4" />

          <div className="flex items-center justify-between">
            <span className="text-muted-foreground text-sm">
              Estimated delivery:
            </span>
            <Badge variant="secondary">
              {shipping === 'economy'
                ? 'Dec 15-17'
                : shipping === 'standard'
                  ? 'Dec 12-14'
                  : shipping === 'express'
                    ? 'Dec 10-11'
                    : 'Dec 9'}
            </Badge>
          </div>
        </CardContent>
      </Card>
    )
  },
}

export const TravelOptions: Story = {
  args: {},
  render: () => (
    <Card className="w-[350px]">
      <CardHeader>
        <CardTitle>Travel Mode</CardTitle>
        <CardDescription>How do you prefer to travel?</CardDescription>
      </CardHeader>
      <CardContent>
        <RadioGroup defaultValue="car" className="grid grid-cols-2 gap-4">
          <div className="text-center">
            <RadioGroupItem value="plane" id="plane" className="peer sr-only" />
            <Label
              htmlFor="plane"
              className="border-muted hover:bg-muted hover:text-accent-foreground peer-data-[state=checked]:border-primary [&:has([data-state=checked])]:border-primary flex cursor-pointer flex-col items-center justify-center rounded-lg border-2 bg-transparent p-4"
            >
              <Plane className="mb-2 h-6 w-6" />
              <span>Plane</span>
            </Label>
          </div>

          <div className="text-center">
            <RadioGroupItem value="train" id="train" className="peer sr-only" />
            <Label
              htmlFor="train"
              className="border-muted hover:bg-muted hover:text-accent-foreground peer-data-[state=checked]:border-primary [&:has([data-state=checked])]:border-primary flex cursor-pointer flex-col items-center justify-center rounded-lg border-2 bg-transparent p-4"
            >
              <Train className="mb-2 h-6 w-6" />
              <span>Train</span>
            </Label>
          </div>

          <div className="text-center">
            <RadioGroupItem value="car" id="car" className="peer sr-only" />
            <Label
              htmlFor="car"
              className="border-muted hover:bg-muted hover:text-accent-foreground peer-data-[state=checked]:border-primary [&:has([data-state=checked])]:border-primary flex cursor-pointer flex-col items-center justify-center rounded-lg border-2 bg-transparent p-4"
            >
              <Car className="mb-2 h-6 w-6" />
              <span>Car</span>
            </Label>
          </div>

          <div className="text-center">
            <RadioGroupItem value="bike" id="bike" className="peer sr-only" />
            <Label
              htmlFor="bike"
              className="border-muted hover:bg-muted hover:text-accent-foreground peer-data-[state=checked]:border-primary [&:has([data-state=checked])]:border-primary flex cursor-pointer flex-col items-center justify-center rounded-lg border-2 bg-transparent p-4"
            >
              <Bike className="mb-2 h-6 w-6" />
              <span>Bike</span>
            </Label>
          </div>
        </RadioGroup>
      </CardContent>
    </Card>
  ),
}

export const DisabledOptions: Story = {
  args: {},
  render: () => (
    <RadioGroup defaultValue="option-1">
      <div className="flex items-center space-x-2">
        <RadioGroupItem value="option-1" id="option-1" />
        <Label htmlFor="option-1">Available Option</Label>
      </div>
      <div className="flex items-center space-x-2 opacity-50">
        <RadioGroupItem value="option-2" id="option-2" disabled />
        <Label htmlFor="option-2" className="cursor-not-allowed">
          Disabled Option
        </Label>
      </div>
      <div className="flex items-center space-x-2">
        <RadioGroupItem value="option-3" id="option-3" />
        <Label htmlFor="option-3">Another Available Option</Label>
      </div>
      <div className="flex items-center space-x-2 opacity-50">
        <RadioGroupItem value="option-4" id="option-4" disabled />
        <Label htmlFor="option-4" className="cursor-not-allowed">
          Another Disabled Option
        </Label>
      </div>
    </RadioGroup>
  ),
}

export const CoreLiveThemeShowcase: Story = {
  args: {},
  render: () => (
    <div className="w-full max-w-2xl space-y-6">
      <div>
        <h3 className="text-heading-3 mb-4 font-medium">Radio Button States</h3>
        <div className="grid grid-cols-2 gap-4">
          <RadioGroup defaultValue="default" className="space-y-3">
            <div className="flex items-center space-x-3">
              <RadioGroupItem
                value="default"
                id="default-radio"
                style={{
                  borderColor: 'var(--component-radio-border)',
                  backgroundColor: 'var(--component-radio-background)',
                }}
              />
              <Label htmlFor="default-radio">Default state</Label>
            </div>

            <div className="flex items-center space-x-3">
              <RadioGroupItem
                value="checked"
                id="checked-radio"
                style={{
                  borderColor: 'var(--component-radio-checked-border)',
                  backgroundColor: 'var(--component-radio-checked-background)',
                }}
              />
              <Label htmlFor="checked-radio">Checked state</Label>
            </div>

            <div className="flex items-center space-x-3 opacity-50">
              <RadioGroupItem
                value="disabled"
                id="disabled-radio"
                disabled
                style={{
                  borderColor: 'var(--component-radio-disabled-border)',
                  backgroundColor: 'var(--component-radio-disabled-background)',
                }}
              />
              <Label htmlFor="disabled-radio" className="cursor-not-allowed">
                Disabled state
              </Label>
            </div>
          </RadioGroup>

          <RadioGroup defaultValue="focus" className="space-y-3">
            <div className="flex items-center space-x-3">
              <RadioGroupItem
                value="focus"
                id="focus-radio"
                className="focus-visible:ring-primary"
              />
              <Label htmlFor="focus-radio">Focus state (tab to see)</Label>
            </div>

            <div className="flex items-center space-x-3">
              <RadioGroupItem
                value="hover"
                id="hover-radio"
                className="hover:border-primary"
              />
              <Label htmlFor="hover-radio">Hover state</Label>
            </div>

            <div className="flex items-center space-x-3">
              <RadioGroupItem
                value="error"
                id="error-radio"
                className="border-destructive"
              />
              <Label htmlFor="error-radio" className="text-destructive">
                Error state
              </Label>
            </div>
          </RadioGroup>
        </div>
      </div>

      <div>
        <h3 className="text-heading-3 mb-4 font-medium">
          Semantic Color Usage
        </h3>
        <RadioGroup defaultValue="success" className="space-y-3">
          <Card className="border-success/20 bg-success/5">
            <CardContent className="pt-6">
              <div className="flex items-center space-x-3">
                <RadioGroupItem
                  value="success"
                  id="success-radio"
                  className="data-[state=checked]:border-success data-[state=checked]:text-success"
                />
                <Label
                  htmlFor="success-radio"
                  className="text-success cursor-pointer font-medium"
                >
                  Success state radio
                </Label>
              </div>
            </CardContent>
          </Card>

          <Card className="border-warning/20 bg-warning/5">
            <CardContent className="pt-6">
              <div className="flex items-center space-x-3">
                <RadioGroupItem
                  value="warning"
                  id="warning-radio"
                  className="data-[state=checked]:border-warning data-[state=checked]:text-warning"
                />
                <Label
                  htmlFor="warning-radio"
                  className="text-warning cursor-pointer font-medium"
                >
                  Warning state radio
                </Label>
              </div>
            </CardContent>
          </Card>

          <Card className="border-danger/20 bg-danger/5">
            <CardContent className="pt-6">
              <div className="flex items-center space-x-3">
                <RadioGroupItem
                  value="danger"
                  id="danger-radio"
                  className="data-[state=checked]:border-danger data-[state=checked]:text-danger"
                />
                <Label
                  htmlFor="danger-radio"
                  className="text-danger cursor-pointer font-medium"
                >
                  Danger state radio
                </Label>
              </div>
            </CardContent>
          </Card>

          <Card className="border-info/20 bg-info/5">
            <CardContent className="pt-6">
              <div className="flex items-center space-x-3">
                <RadioGroupItem
                  value="info"
                  id="info-radio"
                  className="data-[state=checked]:border-info data-[state=checked]:text-info"
                />
                <Label
                  htmlFor="info-radio"
                  className="text-info cursor-pointer font-medium"
                >
                  Info state radio
                </Label>
              </div>
            </CardContent>
          </Card>
        </RadioGroup>
      </div>

      <div>
        <h3 className="text-heading-3 mb-4 font-medium">
          Component Token Usage
        </h3>
        <Card>
          <CardContent className="pt-6">
            <div className="space-y-4">
              <div className="flex items-center gap-3">
                <input
                  type="radio"
                  name="custom-radio"
                  id="custom-radio-1"
                  className="h-4 w-4 cursor-pointer rounded-full border transition-colors"
                  style={{
                    borderColor: 'var(--component-radio-border)',
                    backgroundColor: 'var(--component-radio-background)',
                    accentColor: 'var(--system-color-primary)',
                  }}
                />
                <Label htmlFor="custom-radio-1">
                  Custom radio using component tokens
                </Label>
              </div>

              <div className="flex items-center gap-3">
                <input
                  type="radio"
                  name="custom-radio"
                  id="custom-radio-2"
                  className="h-4 w-4 cursor-pointer rounded-full border transition-colors"
                  style={{
                    borderColor: 'var(--component-radio-border)',
                    backgroundColor: 'var(--component-radio-background)',
                    accentColor: 'var(--system-color-primary)',
                  }}
                />
                <Label htmlFor="custom-radio-2">Another option</Label>
              </div>

              <div className="bg-muted rounded-md p-3">
                <code className="text-xs">
                  --component-radio-border
                  <br />
                  --component-radio-background
                  <br />
                  --component-radio-checked-background
                  <br />
                  --component-radio-checked-border
                  <br />
                  --component-radio-dot-color
                </code>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      <div>
        <h3 className="text-heading-3 mb-4 font-medium">Size Variations</h3>
        <RadioGroup className="space-y-4">
          <div className="flex items-center space-x-2">
            <RadioGroupItem value="small" id="small" className="h-3 w-3" />
            <Label htmlFor="small" className="text-sm">
              Small Radio Button
            </Label>
          </div>
          <div className="flex items-center space-x-2">
            <RadioGroupItem value="medium" id="medium" className="h-4 w-4" />
            <Label htmlFor="medium">Medium Radio Button (Default)</Label>
          </div>
          <div className="flex items-center space-x-2">
            <RadioGroupItem value="large" id="large" className="h-5 w-5" />
            <Label htmlFor="large" className="text-lg">
              Large Radio Button
            </Label>
          </div>
        </RadioGroup>
      </div>
    </div>
  ),
  parameters: {
    layout: 'padded',
    docs: {
      description: {
        story:
          'Comprehensive showcase of radio group variations using CoreLive Design System tokens for consistent styling across different states and contexts.',
      },
    },
  },
}
