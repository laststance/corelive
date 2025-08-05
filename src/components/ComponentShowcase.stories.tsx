import type { Meta, StoryObj } from '@storybook/react'
import {
  Calendar,
  Settings,
  Palette,
  Zap,
  Heart,
  Download,
  Share,
  Mail,
  MapPin,
  AlertCircle,
  CheckCircle,
  Info,
} from 'lucide-react'

import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Progress } from '@/components/ui/progress'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Separator } from '@/components/ui/separator'
import { Slider } from '@/components/ui/slider'
import { Switch } from '@/components/ui/switch'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'

const meta: Meta = {
  title: 'CoreLive Design System/Component Showcase',
  parameters: {
    layout: 'fullscreen',
    docs: {
      description: {
        component:
          'Complete showcase of all shadcn/ui components styled with CoreLive Design System tokens. This demonstrates the consistency and flexibility of the design system across different component types.',
      },
    },
  },
}

export default meta
type Story = StoryObj

export const AllComponents: Story = {
  args: {},
  render: () => (
    <div className="mx-auto max-w-7xl space-y-12 p-8">
      {/* Hero Section */}
      <section className="space-y-4 text-center">
        <h1 className="text-display-1 from-primary to-accent bg-gradient-to-r bg-clip-text font-bold text-transparent">
          CoreLive Design System
        </h1>
        <p className="text-body-1 text-muted-foreground mx-auto max-w-2xl">
          A comprehensive component library built with shadcn/ui and enhanced
          with CoreLive Design System tokens for consistent theming,
          accessibility, and scalability.
        </p>
        <div className="flex justify-center gap-4">
          <Button
            size="lg"
            className="bg-primary hover:bg-primary-hover text-on-primary"
          >
            Get Started
          </Button>
          <Button size="lg" variant="outline">
            View Documentation
          </Button>
        </div>
      </section>

      {/* Buttons Section */}
      <section>
        <h2 className="text-heading-1 mb-6 font-semibold">Buttons</h2>
        <div className="grid gap-8">
          <Card>
            <CardHeader>
              <CardTitle>Button Variants</CardTitle>
              <CardDescription>
                Different styles for various use cases
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="flex flex-wrap gap-3">
                <Button>Default</Button>
                <Button variant="secondary">Secondary</Button>
                <Button variant="destructive">Destructive</Button>
                <Button variant="outline">Outline</Button>
                <Button variant="ghost">Ghost</Button>
                <Button variant="link">Link</Button>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Button Sizes & Icons</CardTitle>
              <CardDescription>Various sizes with icon support</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="flex flex-wrap items-center gap-3">
                <Button size="sm">
                  <Mail className="mr-2 h-4 w-4" />
                  Small
                </Button>
                <Button>
                  <Download className="mr-2 h-4 w-4" />
                  Default
                </Button>
                <Button size="lg">
                  <Share className="mr-2 h-4 w-4" />
                  Large
                </Button>
                <Button size="icon">
                  <Heart className="h-4 w-4" />
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      </section>

      {/* Form Controls */}
      <section>
        <h2 className="text-heading-1 mb-6 font-semibold">Form Controls</h2>
        <div className="grid gap-8 md:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle>Inputs & Labels</CardTitle>
              <CardDescription>Text inputs with various states</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-2">
                <Label htmlFor="name">Name</Label>
                <Input id="name" placeholder="Enter your name" />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="email">Email</Label>
                <Input
                  id="email"
                  type="email"
                  placeholder="email@example.com"
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="phone">Phone</Label>
                <Input id="phone" type="tel" placeholder="+1 (555) 123-4567" />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Selection Controls</CardTitle>
              <CardDescription>
                Checkboxes, switches, and selects
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center space-x-2">
                <Checkbox id="terms" />
                <Label htmlFor="terms">Accept terms and conditions</Label>
              </div>
              <div className="flex items-center space-x-2">
                <Switch id="notifications" />
                <Label htmlFor="notifications">Enable notifications</Label>
              </div>
              <div className="grid gap-2">
                <Label>Country</Label>
                <Select>
                  <SelectTrigger>
                    <SelectValue placeholder="Select country" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="us">United States</SelectItem>
                    <SelectItem value="ca">Canada</SelectItem>
                    <SelectItem value="uk">United Kingdom</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </CardContent>
          </Card>
        </div>
      </section>

      {/* Cards & Content */}
      <section>
        <h2 className="text-heading-1 mb-6 font-semibold">Cards & Content</h2>
        <div className="grid gap-6 md:grid-cols-3">
          <Card>
            <CardHeader>
              <div className="flex items-center gap-3">
                <Avatar>
                  <AvatarImage src="https://images.unsplash.com/photo-1472099645785-5658abf4ff4e?w=150" />
                  <AvatarFallback>JD</AvatarFallback>
                </Avatar>
                <div>
                  <CardTitle className="text-lg">John Doe</CardTitle>
                  <CardDescription>Product Designer</CardDescription>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                <div className="text-muted-foreground flex items-center gap-2 text-sm">
                  <MapPin className="h-4 w-4" />
                  San Francisco, CA
                </div>
                <div className="text-muted-foreground flex items-center gap-2 text-sm">
                  <Mail className="h-4 w-4" />
                  john@example.com
                </div>
                <div className="mt-4 flex gap-2">
                  <Badge variant="secondary">Design</Badge>
                  <Badge variant="outline">UX/UI</Badge>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Zap className="text-primary h-5 w-5" />
                Project Status
              </CardTitle>
              <CardDescription>Current project progress</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <div className="mb-2 flex justify-between text-sm">
                  <span>Design Phase</span>
                  <span>75%</span>
                </div>
                <Progress value={75} className="h-2" />
              </div>
              <div>
                <div className="mb-2 flex justify-between text-sm">
                  <span>Development</span>
                  <span>45%</span>
                </div>
                <Progress value={45} className="h-2" />
              </div>
              <div>
                <div className="mb-2 flex justify-between text-sm">
                  <span>Testing</span>
                  <span>20%</span>
                </div>
                <Progress value={20} className="h-2" />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Calendar className="text-primary h-5 w-5" />
                Upcoming Events
              </CardTitle>
              <CardDescription>Next 3 events</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex items-center gap-3">
                <div className="bg-primary h-2 w-2 rounded-full"></div>
                <div className="flex-1">
                  <p className="text-sm font-medium">Team Meeting</p>
                  <p className="text-muted-foreground text-xs">
                    Today, 2:00 PM
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <div className="bg-warning h-2 w-2 rounded-full"></div>
                <div className="flex-1">
                  <p className="text-sm font-medium">Project Review</p>
                  <p className="text-muted-foreground text-xs">
                    Tomorrow, 10:00 AM
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <div className="bg-success h-2 w-2 rounded-full"></div>
                <div className="flex-1">
                  <p className="text-sm font-medium">Client Presentation</p>
                  <p className="text-muted-foreground text-xs">
                    Friday, 3:00 PM
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </section>

      {/* Interactive Components */}
      <section>
        <h2 className="text-heading-1 mb-6 font-semibold">
          Interactive Components
        </h2>
        <div className="grid gap-8">
          <Card>
            <CardHeader>
              <CardTitle>Tabs Navigation</CardTitle>
              <CardDescription>Organize content with tabs</CardDescription>
            </CardHeader>
            <CardContent>
              <Tabs defaultValue="overview" className="w-full">
                <TabsList className="grid w-full grid-cols-4">
                  <TabsTrigger value="overview">Overview</TabsTrigger>
                  <TabsTrigger value="analytics">Analytics</TabsTrigger>
                  <TabsTrigger value="reports">Reports</TabsTrigger>
                  <TabsTrigger value="settings">Settings</TabsTrigger>
                </TabsList>
                <TabsContent value="overview" className="mt-4 space-y-4">
                  <div className="grid grid-cols-3 gap-4">
                    <div className="rounded-lg border p-4 text-center">
                      <div className="text-primary text-2xl font-bold">
                        12.5k
                      </div>
                      <div className="text-muted-foreground text-sm">
                        Total Users
                      </div>
                    </div>
                    <div className="rounded-lg border p-4 text-center">
                      <div className="text-success text-2xl font-bold">
                        +15%
                      </div>
                      <div className="text-muted-foreground text-sm">
                        Growth
                      </div>
                    </div>
                    <div className="rounded-lg border p-4 text-center">
                      <div className="text-warning text-2xl font-bold">
                        $42k
                      </div>
                      <div className="text-muted-foreground text-sm">
                        Revenue
                      </div>
                    </div>
                  </div>
                </TabsContent>
                <TabsContent value="analytics" className="mt-4">
                  <div className="text-muted-foreground py-12 text-center">
                    <div className="mb-2 text-lg font-medium">
                      Analytics Dashboard
                    </div>
                    <p>View detailed analytics and insights here.</p>
                  </div>
                </TabsContent>
                <TabsContent value="reports" className="mt-4">
                  <div className="text-muted-foreground py-12 text-center">
                    <div className="mb-2 text-lg font-medium">
                      Reports Section
                    </div>
                    <p>Generate and download reports.</p>
                  </div>
                </TabsContent>
                <TabsContent value="settings" className="mt-4">
                  <div className="text-muted-foreground py-12 text-center">
                    <div className="mb-2 text-lg font-medium">
                      Settings Panel
                    </div>
                    <p>Configure your preferences and settings.</p>
                  </div>
                </TabsContent>
              </Tabs>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Accordion</CardTitle>
              <CardDescription>Collapsible content sections</CardDescription>
            </CardHeader>
            <CardContent>
              <Accordion type="single" collapsible className="w-full">
                <AccordionItem value="item-1">
                  <AccordionTrigger>Is it accessible?</AccordionTrigger>
                  <AccordionContent>
                    Yes. It adheres to the WAI-ARIA design pattern and uses
                    semantic HTML elements.
                  </AccordionContent>
                </AccordionItem>
                <AccordionItem value="item-2">
                  <AccordionTrigger>Is it styled?</AccordionTrigger>
                  <AccordionContent>
                    Yes. It comes with default styles that match the other
                    components&apos; aesthetic.
                  </AccordionContent>
                </AccordionItem>
                <AccordionItem value="item-3">
                  <AccordionTrigger>Is it animated?</AccordionTrigger>
                  <AccordionContent>
                    Yes. It&apos;s animated by default, but you can disable it
                    if you prefer.
                  </AccordionContent>
                </AccordionItem>
              </Accordion>
            </CardContent>
          </Card>
        </div>
      </section>

      {/* Alerts & Feedback */}
      <section>
        <h2 className="text-heading-1 mb-6 font-semibold">Alerts & Feedback</h2>
        <div className="space-y-4">
          <Alert>
            <Info className="h-4 w-4" />
            <AlertTitle>Information</AlertTitle>
            <AlertDescription>
              This is an informational alert using default styling.
            </AlertDescription>
          </Alert>

          <Alert className="border-success/50 text-success dark:border-success [&>svg]:text-success">
            <CheckCircle className="h-4 w-4" />
            <AlertTitle>Success</AlertTitle>
            <AlertDescription>
              Your changes have been saved successfully.
            </AlertDescription>
          </Alert>

          <Alert className="border-warning/50 text-warning dark:border-warning [&>svg]:text-warning">
            <AlertCircle className="h-4 w-4" />
            <AlertTitle>Warning</AlertTitle>
            <AlertDescription>
              Please review your settings before proceeding.
            </AlertDescription>
          </Alert>

          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertTitle>Error</AlertTitle>
            <AlertDescription>
              There was an error processing your request. Please try again.
            </AlertDescription>
          </Alert>
        </div>
      </section>

      {/* CoreLive Design System Showcase */}
      <section>
        <h2 className="text-heading-1 mb-6 font-semibold">
          CoreLive Design System Integration
        </h2>
        <div className="grid gap-8 md:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Palette className="text-primary h-5 w-5" />
                Color System
              </CardTitle>
              <CardDescription>
                Semantic color usage across components
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <Button className="bg-primary hover:bg-primary-hover text-on-primary">
                  Primary
                </Button>
                <Button className="bg-secondary hover:bg-secondary-hover text-on-secondary">
                  Secondary
                </Button>
                <Button className="bg-success hover:bg-success-hover text-white">
                  Success
                </Button>
                <Button className="bg-warning hover:bg-warning-hover text-black">
                  Warning
                </Button>
              </div>
              <Separator />
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <div className="bg-primary h-4 w-4 rounded"></div>
                  <span className="text-sm">
                    Primary - var(--system-color-primary)
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="bg-secondary h-4 w-4 rounded"></div>
                  <span className="text-sm">
                    Secondary - var(--system-color-secondary)
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="bg-accent h-4 w-4 rounded"></div>
                  <span className="text-sm">
                    Accent - var(--system-color-accent)
                  </span>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Settings className="text-primary h-5 w-5" />
                Component Tokens
              </CardTitle>
              <CardDescription>
                Component-specific design tokens in action
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-3">
                <div>
                  <Label className="text-sm font-medium">Spacing Scale</Label>
                  <div className="mt-2 flex gap-2">
                    <div
                      className="bg-primary h-4"
                      style={{ width: 'var(--system-space-component-xs)' }}
                    ></div>
                    <div
                      className="bg-primary h-4"
                      style={{ width: 'var(--system-space-component-sm)' }}
                    ></div>
                    <div
                      className="bg-primary h-4"
                      style={{ width: 'var(--system-space-component-md)' }}
                    ></div>
                    <div
                      className="bg-primary h-4"
                      style={{ width: 'var(--system-space-component-lg)' }}
                    ></div>
                  </div>
                </div>

                <div>
                  <Label className="text-sm font-medium">Custom Slider</Label>
                  <Slider
                    defaultValue={[50]}
                    max={100}
                    step={1}
                    className="mt-2"
                  />
                </div>

                <div className="pt-2">
                  <p className="text-muted-foreground text-xs">
                    All components use consistent tokens for spacing, colors,
                    and typography.
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </section>
    </div>
  ),
}

export const ComponentGrid: Story = {
  args: {},
  render: () => (
    <div className="p-8">
      <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {/* Component showcase cards */}
        {[
          {
            name: 'Button',
            icon: '🔘',
            description: 'Interactive button components',
          },
          { name: 'Input', icon: '📝', description: 'Form input controls' },
          { name: 'Card', icon: '🃏', description: 'Content containers' },
          { name: 'Dialog', icon: '💬', description: 'Modal dialogs' },
          { name: 'Select', icon: '📋', description: 'Dropdown selections' },
          { name: 'Tabs', icon: '📑', description: 'Tab navigation' },
          { name: 'Badge', icon: '🏷️', description: 'Status indicators' },
          { name: 'Avatar', icon: '👤', description: 'User profile images' },
          { name: 'Progress', icon: '📊', description: 'Progress indicators' },
          { name: 'Slider', icon: '🎚️', description: 'Range controls' },
          { name: 'Switch', icon: '🔄', description: 'Toggle switches' },
          { name: 'Checkbox', icon: '☑️', description: 'Check controls' },
        ].map((component, index) => (
          <Card
            key={index}
            className="transition-all duration-200 hover:shadow-lg"
          >
            <CardContent className="pt-6">
              <div className="space-y-2 text-center">
                <div className="text-3xl">{component.icon}</div>
                <h3 className="font-semibold">{component.name}</h3>
                <p className="text-muted-foreground text-sm">
                  {component.description}
                </p>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  ),
  parameters: {
    docs: {
      description: {
        story:
          'Grid view of all available components in the CoreLive Design System.',
      },
    },
  },
}
