import type { Meta, StoryObj } from '@storybook/react'
import {
  HelpCircle,
  FileQuestion,
  CreditCard,
  Package,
  Truck,
  Shield,
  RefreshCw,
  Phone,
  Mail,
  MessageSquare,
  Settings,
  Code,
  Palette,
  Layout,
  Lock,
  Zap,
  Terminal,
  BookOpen,
  CheckCircle,
  XCircle,
  AlertCircle,
  Info,
  Bell,
} from 'lucide-react'

import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'

const meta: Meta<typeof Accordion> = {
  title: 'CoreLive Design System/Components/Accordion',
  component: Accordion,
  parameters: {
    layout: 'centered',
    docs: {
      description: {
        component:
          'A vertically stacked set of interactive headings that reveal content. Built with accessibility in mind and styled with CoreLive Design System tokens.',
      },
    },
  },
  tags: ['autodocs'],
}

export default meta
type Story = StoryObj<typeof meta>

export const Default: Story = {
  // @ts-ignore - Storybook type issue with no component props
  // @ts-ignore - Storybook type issue with no component props
  args: {},
  render: () => (
    <Accordion type="single" collapsible className="w-full max-w-md">
      <AccordionItem value="item-1">
        <AccordionTrigger>Is it accessible?</AccordionTrigger>
        <AccordionContent>
          Yes. It adheres to the WAI-ARIA design pattern.
        </AccordionContent>
      </AccordionItem>
      <AccordionItem value="item-2">
        <AccordionTrigger>Is it styled?</AccordionTrigger>
        <AccordionContent>
          Yes. It comes with default styles that matches the CoreLive design
          system.
        </AccordionContent>
      </AccordionItem>
      <AccordionItem value="item-3">
        <AccordionTrigger>Is it animated?</AccordionTrigger>
        <AccordionContent>
          Yes. It's animated by default, but you can disable it if you prefer.
        </AccordionContent>
      </AccordionItem>
    </Accordion>
  ),
}

export const Multiple: Story = {
  // @ts-ignore - Storybook type issue with no component props
  args: {},
  render: () => (
    <Accordion type="multiple" className="w-full max-w-md">
      <AccordionItem value="item-1">
        <AccordionTrigger>Can I open multiple items?</AccordionTrigger>
        <AccordionContent>
          Yes, when using type="multiple", you can open multiple accordion items
          at once.
        </AccordionContent>
      </AccordionItem>
      <AccordionItem value="item-2">
        <AccordionTrigger>
          How do I control which items are open?
        </AccordionTrigger>
        <AccordionContent>
          You can use the defaultValue prop to set initially open items, or
          control it with value and onValueChange.
        </AccordionContent>
      </AccordionItem>
      <AccordionItem value="item-3">
        <AccordionTrigger>Can I customize the styling?</AccordionTrigger>
        <AccordionContent>
          Absolutely! The accordion uses CoreLive Design System tokens and
          accepts className props for customization.
        </AccordionContent>
      </AccordionItem>
    </Accordion>
  ),
}

export const FAQSection: Story = {
  // @ts-ignore - Storybook type issue with no component props
  args: {},
  render: () => (
    <Card className="w-full max-w-2xl">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <HelpCircle className="h-5 w-5" />
          Frequently Asked Questions
        </CardTitle>
        <CardDescription>
          Find answers to common questions about our service
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Accordion type="single" collapsible defaultValue="billing">
          <AccordionItem value="general">
            <AccordionTrigger>
              <div className="flex items-center gap-2">
                <FileQuestion className="h-4 w-4" />
                General Questions
              </div>
            </AccordionTrigger>
            <AccordionContent>
              <div className="space-y-4">
                <div className="space-y-2">
                  <h4 className="font-medium">What is CoreLive?</h4>
                  <p className="text-muted-foreground text-sm">
                    CoreLive is a modern platform designed to help teams
                    collaborate more effectively with real-time features and
                    intuitive design.
                  </p>
                </div>
                <div className="space-y-2">
                  <h4 className="font-medium">Who can use CoreLive?</h4>
                  <p className="text-muted-foreground text-sm">
                    CoreLive is suitable for teams of all sizes, from startups
                    to enterprises, across various industries.
                  </p>
                </div>
              </div>
            </AccordionContent>
          </AccordionItem>

          <AccordionItem value="billing">
            <AccordionTrigger>
              <div className="flex items-center gap-2">
                <CreditCard className="h-4 w-4" />
                Billing & Pricing
              </div>
            </AccordionTrigger>
            <AccordionContent>
              <div className="space-y-4">
                <div className="space-y-2">
                  <h4 className="font-medium">
                    What payment methods do you accept?
                  </h4>
                  <p className="text-muted-foreground text-sm">
                    We accept all major credit cards (Visa, MasterCard, American
                    Express), PayPal, and bank transfers for enterprise
                    customers.
                  </p>
                </div>
                <div className="space-y-2">
                  <h4 className="font-medium">Can I change my plan anytime?</h4>
                  <p className="text-muted-foreground text-sm">
                    Yes, you can upgrade or downgrade your plan at any time.
                    Changes take effect at the start of the next billing cycle.
                  </p>
                </div>
                <div className="flex gap-2 pt-2">
                  <Button size="sm">View Pricing</Button>
                  <Button size="sm" variant="outline">
                    Contact Sales
                  </Button>
                </div>
              </div>
            </AccordionContent>
          </AccordionItem>

          <AccordionItem value="shipping">
            <AccordionTrigger>
              <div className="flex items-center gap-2">
                <Truck className="h-4 w-4" />
                Shipping & Delivery
              </div>
            </AccordionTrigger>
            <AccordionContent>
              <div className="space-y-4">
                <div className="grid gap-3">
                  <div className="flex items-start gap-2">
                    <Package className="text-muted-foreground mt-0.5 h-4 w-4" />
                    <div className="space-y-1">
                      <p className="text-sm font-medium">Standard Shipping</p>
                      <p className="text-muted-foreground text-sm">
                        5-7 business days • Free on orders over $50
                      </p>
                    </div>
                  </div>
                  <div className="flex items-start gap-2">
                    <Zap className="text-muted-foreground mt-0.5 h-4 w-4" />
                    <div className="space-y-1">
                      <p className="text-sm font-medium">Express Shipping</p>
                      <p className="text-muted-foreground text-sm">
                        2-3 business days • $12.99
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            </AccordionContent>
          </AccordionItem>

          <AccordionItem value="returns">
            <AccordionTrigger>
              <div className="flex items-center gap-2">
                <RefreshCw className="h-4 w-4" />
                Returns & Refunds
              </div>
            </AccordionTrigger>
            <AccordionContent>
              <div className="space-y-4">
                <div className="flex items-start gap-2">
                  <Shield className="text-success mt-0.5 h-4 w-4" />
                  <div className="space-y-2">
                    <p className="text-sm font-medium">30-Day Return Policy</p>
                    <p className="text-muted-foreground text-sm">
                      We offer a 30-day return policy for all products in
                      original condition. Refunds are processed within 5-7
                      business days after we receive the return.
                    </p>
                  </div>
                </div>
                <Button size="sm" variant="outline">
                  Start a Return
                </Button>
              </div>
            </AccordionContent>
          </AccordionItem>

          <AccordionItem value="support">
            <AccordionTrigger>
              <div className="flex items-center gap-2">
                <MessageSquare className="h-4 w-4" />
                Customer Support
              </div>
            </AccordionTrigger>
            <AccordionContent>
              <div className="grid gap-3">
                <div className="flex items-center gap-3">
                  <Phone className="text-muted-foreground h-4 w-4" />
                  <span className="text-sm">+1 (555) 123-4567</span>
                </div>
                <div className="flex items-center gap-3">
                  <Mail className="text-muted-foreground h-4 w-4" />
                  <span className="text-sm">support@corelive.com</span>
                </div>
                <div className="flex items-center gap-3">
                  <MessageSquare className="text-muted-foreground h-4 w-4" />
                  <span className="text-sm">Live chat available 24/7</span>
                </div>
              </div>
            </AccordionContent>
          </AccordionItem>
        </Accordion>
      </CardContent>
    </Card>
  ),
  parameters: {
    layout: 'padded',
  },
}

export const SettingsAccordion: Story = {
  // @ts-ignore - Storybook type issue with no component props
  args: {},
  render: () => (
    <Card className="w-full max-w-lg">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Settings className="h-5 w-5" />
          Settings
        </CardTitle>
        <CardDescription>Manage your application preferences</CardDescription>
      </CardHeader>
      <CardContent className="p-0">
        <Accordion
          type="multiple"
          defaultValue={['appearance', 'notifications']}
        >
          <AccordionItem value="appearance" className="border-0">
            <AccordionTrigger className="px-6">
              <div className="flex items-center gap-2">
                <Palette className="h-4 w-4" />
                Appearance
              </div>
            </AccordionTrigger>
            <AccordionContent className="px-6 pb-4">
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-sm">Theme</span>
                  <Badge variant="secondary">Dark</Badge>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm">Accent Color</span>
                  <div className="flex gap-2">
                    <div className="bg-primary h-6 w-6 rounded-full" />
                    <div className="bg-secondary h-6 w-6 rounded-full" />
                    <div className="bg-accent h-6 w-6 rounded-full" />
                  </div>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm">Font Size</span>
                  <Badge variant="outline">Medium</Badge>
                </div>
              </div>
            </AccordionContent>
          </AccordionItem>

          <AccordionItem value="notifications" className="border-0">
            <AccordionTrigger className="px-6">
              <div className="flex items-center gap-2">
                <Bell className="h-4 w-4" />
                Notifications
                <Badge className="mr-4 ml-auto" variant="secondary">
                  3
                </Badge>
              </div>
            </AccordionTrigger>
            <AccordionContent className="px-6 pb-4">
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-sm">Email Notifications</span>
                  <Badge variant="outline">Enabled</Badge>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm">Push Notifications</span>
                  <Badge variant="outline">Disabled</Badge>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm">SMS Alerts</span>
                  <Badge variant="outline">Enabled</Badge>
                </div>
              </div>
            </AccordionContent>
          </AccordionItem>

          <AccordionItem value="privacy" className="border-0">
            <AccordionTrigger className="px-6">
              <div className="flex items-center gap-2">
                <Lock className="h-4 w-4" />
                Privacy & Security
              </div>
            </AccordionTrigger>
            <AccordionContent className="px-6 pb-4">
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-sm">Two-Factor Authentication</span>
                  <Badge variant="default">Active</Badge>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm">Data Encryption</span>
                  <Badge variant="default">AES-256</Badge>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm">Session Timeout</span>
                  <Badge variant="outline">30 min</Badge>
                </div>
              </div>
            </AccordionContent>
          </AccordionItem>

          <AccordionItem value="advanced" className="border-0 border-b-0">
            <AccordionTrigger className="px-6">
              <div className="flex items-center gap-2">
                <Terminal className="h-4 w-4" />
                Advanced
              </div>
            </AccordionTrigger>
            <AccordionContent className="px-6 pb-4">
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-sm">Developer Mode</span>
                  <Badge variant="outline">Off</Badge>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm">API Rate Limit</span>
                  <Badge variant="outline">1000/hr</Badge>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm">Debug Logging</span>
                  <Badge variant="outline">Disabled</Badge>
                </div>
              </div>
            </AccordionContent>
          </AccordionItem>
        </Accordion>
      </CardContent>
    </Card>
  ),
}

export const DocumentationAccordion: Story = {
  // @ts-ignore - Storybook type issue with no component props
  args: {},
  render: () => (
    <div className="w-full max-w-3xl space-y-4">
      <div className="mb-6 text-center">
        <h2 className="text-heading-2 mb-2 font-bold">
          Developer Documentation
        </h2>
        <p className="text-muted-foreground">
          Everything you need to build with CoreLive
        </p>
      </div>

      <Accordion type="single" collapsible className="space-y-2">
        <AccordionItem
          value="getting-started"
          className="rounded-lg border px-1"
        >
          <AccordionTrigger className="hover:no-underline">
            <div className="flex items-center gap-3">
              <div className="bg-primary/10 rounded-lg p-2">
                <BookOpen className="text-primary h-5 w-5" />
              </div>
              <div className="text-left">
                <h3 className="font-semibold">Getting Started</h3>
                <p className="text-muted-foreground text-sm">
                  Quick setup guide and basics
                </p>
              </div>
            </div>
          </AccordionTrigger>
          <AccordionContent className="pt-4">
            <div className="space-y-4 pl-14">
              <div className="space-y-2">
                <h4 className="flex items-center gap-2 font-medium">
                  <CheckCircle className="text-success h-4 w-4" />
                  Installation
                </h4>
                <pre className="bg-muted rounded-md p-3 text-sm">
                  <code>npm install @corelive/ui</code>
                </pre>
              </div>
              <div className="space-y-2">
                <h4 className="font-medium">Basic Usage</h4>
                <pre className="bg-muted overflow-x-auto rounded-md p-3 text-sm">
                  <code>{`import { Button } from '@corelive/ui'

function App() {
  return <Button>Click me</Button>
}`}</code>
                </pre>
              </div>
              <Button size="sm">View Full Guide</Button>
            </div>
          </AccordionContent>
        </AccordionItem>

        <AccordionItem value="components" className="rounded-lg border px-1">
          <AccordionTrigger className="hover:no-underline">
            <div className="flex items-center gap-3">
              <div className="bg-secondary/10 rounded-lg p-2">
                <Layout className="text-secondary h-5 w-5" />
              </div>
              <div className="text-left">
                <h3 className="font-semibold">Components</h3>
                <p className="text-muted-foreground text-sm">
                  UI component library reference
                </p>
              </div>
            </div>
          </AccordionTrigger>
          <AccordionContent className="pt-4">
            <div className="space-y-3 pl-14">
              <div className="grid grid-cols-2 gap-3">
                <div className="hover:bg-muted/50 cursor-pointer rounded-lg border p-3">
                  <h4 className="mb-1 font-medium">Buttons</h4>
                  <p className="text-muted-foreground text-sm">
                    Clickable elements
                  </p>
                </div>
                <div className="hover:bg-muted/50 cursor-pointer rounded-lg border p-3">
                  <h4 className="mb-1 font-medium">Forms</h4>
                  <p className="text-muted-foreground text-sm">
                    Input components
                  </p>
                </div>
                <div className="hover:bg-muted/50 cursor-pointer rounded-lg border p-3">
                  <h4 className="mb-1 font-medium">Layout</h4>
                  <p className="text-muted-foreground text-sm">
                    Structure components
                  </p>
                </div>
                <div className="hover:bg-muted/50 cursor-pointer rounded-lg border p-3">
                  <h4 className="mb-1 font-medium">Data Display</h4>
                  <p className="text-muted-foreground text-sm">
                    Tables and lists
                  </p>
                </div>
              </div>
            </div>
          </AccordionContent>
        </AccordionItem>

        <AccordionItem value="theming" className="rounded-lg border px-1">
          <AccordionTrigger className="hover:no-underline">
            <div className="flex items-center gap-3">
              <div className="bg-accent/10 rounded-lg p-2">
                <Palette className="text-accent h-5 w-5" />
              </div>
              <div className="text-left">
                <h3 className="font-semibold">Theming & Styling</h3>
                <p className="text-muted-foreground text-sm">
                  Customize the design system
                </p>
              </div>
            </div>
          </AccordionTrigger>
          <AccordionContent className="pt-4">
            <div className="space-y-4 pl-14">
              <div className="grid gap-3">
                <div className="space-y-2">
                  <h4 className="font-medium">Design Tokens</h4>
                  <p className="text-muted-foreground text-sm">
                    CoreLive uses a 4-level token architecture for consistent
                    theming.
                  </p>
                </div>
                <div className="space-y-2">
                  <h4 className="font-medium">Color System</h4>
                  <div className="flex gap-2">
                    <div className="space-y-1">
                      <div className="bg-primary h-10 w-20 rounded" />
                      <p className="text-xs">Primary</p>
                    </div>
                    <div className="space-y-1">
                      <div className="bg-secondary h-10 w-20 rounded" />
                      <p className="text-xs">Secondary</p>
                    </div>
                    <div className="space-y-1">
                      <div className="bg-accent h-10 w-20 rounded" />
                      <p className="text-xs">Accent</p>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </AccordionContent>
        </AccordionItem>

        <AccordionItem value="api" className="rounded-lg border px-1">
          <AccordionTrigger className="hover:no-underline">
            <div className="flex items-center gap-3">
              <div className="bg-warning/10 rounded-lg p-2">
                <Code className="text-warning h-5 w-5" />
              </div>
              <div className="text-left">
                <h3 className="font-semibold">API Reference</h3>
                <p className="text-muted-foreground text-sm">
                  Complete API documentation
                </p>
              </div>
            </div>
          </AccordionTrigger>
          <AccordionContent className="pt-4">
            <div className="space-y-3 pl-14">
              <div className="space-y-3">
                <div className="bg-muted/50 rounded-lg p-3">
                  <div className="mb-2 flex items-center justify-between">
                    <code className="font-mono text-sm">GET /api/users</code>
                    <Badge variant="outline">Public</Badge>
                  </div>
                  <p className="text-muted-foreground text-sm">
                    Retrieve user list
                  </p>
                </div>
                <div className="bg-muted/50 rounded-lg p-3">
                  <div className="mb-2 flex items-center justify-between">
                    <code className="font-mono text-sm">POST /api/auth</code>
                    <Badge variant="outline">Auth Required</Badge>
                  </div>
                  <p className="text-muted-foreground text-sm">
                    Authenticate user
                  </p>
                </div>
              </div>
            </div>
          </AccordionContent>
        </AccordionItem>
      </Accordion>
    </div>
  ),
  parameters: {
    layout: 'padded',
  },
}

export const NotificationStates: Story = {
  // @ts-ignore - Storybook type issue with no component props
  args: {},
  render: () => (
    <Card className="w-full max-w-md">
      <CardHeader>
        <CardTitle>System Status</CardTitle>
        <CardDescription>Current status of all services</CardDescription>
      </CardHeader>
      <CardContent className="p-0">
        <Accordion type="single" collapsible>
          <AccordionItem value="success" className="border-0">
            <AccordionTrigger className="data-[state=open]:bg-success/5 px-6">
              <div className="flex flex-1 items-center gap-3">
                <CheckCircle className="text-success h-5 w-5" />
                <span className="font-medium">All Systems Operational</span>
                <Badge
                  variant="outline"
                  className="border-success text-success mr-4 ml-auto"
                >
                  Healthy
                </Badge>
              </div>
            </AccordionTrigger>
            <AccordionContent className="bg-success/5 px-6 pb-4">
              <div className="space-y-2 pl-8">
                <div className="flex items-center justify-between text-sm">
                  <span>API Gateway</span>
                  <span className="text-success">99.99% uptime</span>
                </div>
                <div className="flex items-center justify-between text-sm">
                  <span>Database Cluster</span>
                  <span className="text-success">Response time: 12ms</span>
                </div>
                <div className="flex items-center justify-between text-sm">
                  <span>CDN</span>
                  <span className="text-success">Cache hit rate: 94%</span>
                </div>
              </div>
            </AccordionContent>
          </AccordionItem>

          <AccordionItem value="warning" className="border-0">
            <AccordionTrigger className="data-[state=open]:bg-warning/5 px-6">
              <div className="flex flex-1 items-center gap-3">
                <AlertCircle className="text-warning h-5 w-5" />
                <span className="font-medium">Performance Degradation</span>
                <Badge
                  variant="outline"
                  className="border-warning text-warning mr-4 ml-auto"
                >
                  Warning
                </Badge>
              </div>
            </AccordionTrigger>
            <AccordionContent className="bg-warning/5 px-6 pb-4">
              <div className="space-y-2 pl-8">
                <p className="text-muted-foreground mb-2 text-sm">
                  Some services are experiencing higher than normal response
                  times.
                </p>
                <div className="space-y-1 text-sm">
                  <div className="flex items-center gap-2">
                    <div className="bg-warning h-2 w-2 rounded-full" />
                    <span>Search API: 250ms average response time</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="bg-warning h-2 w-2 rounded-full" />
                    <span>Image Processing: Queue depth increasing</span>
                  </div>
                </div>
              </div>
            </AccordionContent>
          </AccordionItem>

          <AccordionItem value="error" className="border-0 border-b-0">
            <AccordionTrigger className="data-[state=open]:bg-danger/5 px-6">
              <div className="flex flex-1 items-center gap-3">
                <XCircle className="text-danger h-5 w-5" />
                <span className="font-medium">Service Outage</span>
                <Badge variant="destructive" className="mr-4 ml-auto">
                  Critical
                </Badge>
              </div>
            </AccordionTrigger>
            <AccordionContent className="bg-danger/5 px-6 pb-4">
              <div className="space-y-3 pl-8">
                <p className="text-danger text-sm font-medium">
                  Email service is currently unavailable
                </p>
                <div className="space-y-2 text-sm">
                  <p className="text-muted-foreground">
                    Started: 2:34 PM UTC • Duration: 15 minutes
                  </p>
                  <p className="text-muted-foreground">
                    Our team is actively working on resolving this issue. Email
                    notifications will be queued and sent once service is
                    restored.
                  </p>
                </div>
                <Button size="sm" variant="outline">
                  View Status Page
                </Button>
              </div>
            </AccordionContent>
          </AccordionItem>
        </Accordion>
      </CardContent>
    </Card>
  ),
}

export const CoreLiveThemeShowcase: Story = {
  // @ts-ignore - Storybook type issue with no component props
  args: {},
  render: () => (
    <div className="w-full max-w-2xl space-y-6">
      <div>
        <h3 className="text-heading-3 mb-4 font-medium">Accordion States</h3>
        <Accordion type="single" collapsible>
          <AccordionItem value="default">
            <AccordionTrigger
              style={{
                backgroundColor: 'var(--component-accordion-background)',
                borderColor: 'var(--component-accordion-border)',
              }}
            >
              Default State
            </AccordionTrigger>
            <AccordionContent
              style={{
                backgroundColor:
                  'var(--component-accordion-content-background)',
              }}
            >
              This accordion item demonstrates the default state with CoreLive
              Design System tokens.
            </AccordionContent>
          </AccordionItem>

          <AccordionItem value="hover">
            <AccordionTrigger className="hover:bg-muted">
              Hover State (hover to see effect)
            </AccordionTrigger>
            <AccordionContent>
              The trigger changes background on hover for better interactivity.
            </AccordionContent>
          </AccordionItem>

          <AccordionItem value="focus">
            <AccordionTrigger className="focus-visible:ring-primary focus-visible:ring-2">
              Focus State (tab to see effect)
            </AccordionTrigger>
            <AccordionContent>
              Keyboard navigation highlights the focused accordion trigger.
            </AccordionContent>
          </AccordionItem>

          <AccordionItem value="disabled">
            <AccordionTrigger
              disabled
              className="cursor-not-allowed opacity-50"
            >
              Disabled State
            </AccordionTrigger>
            <AccordionContent>
              This content is not accessible when disabled.
            </AccordionContent>
          </AccordionItem>
        </Accordion>
      </div>

      <div>
        <h3 className="text-heading-3 mb-4 font-medium">Semantic Variations</h3>
        <div className="space-y-3">
          <Accordion type="single" collapsible>
            <AccordionItem value="success" className="border-success/20">
              <AccordionTrigger className="hover:bg-success/5 data-[state=open]:bg-success/10">
                <div className="text-success flex items-center gap-2">
                  <CheckCircle className="h-4 w-4" />
                  Success State Accordion
                </div>
              </AccordionTrigger>
              <AccordionContent className="bg-success/5 text-success-foreground">
                This accordion uses success semantic color tokens for positive
                states.
              </AccordionContent>
            </AccordionItem>
          </Accordion>

          <Accordion type="single" collapsible>
            <AccordionItem value="warning" className="border-warning/20">
              <AccordionTrigger className="hover:bg-warning/5 data-[state=open]:bg-warning/10">
                <div className="text-warning flex items-center gap-2">
                  <AlertCircle className="h-4 w-4" />
                  Warning State Accordion
                </div>
              </AccordionTrigger>
              <AccordionContent className="bg-warning/5 text-warning-foreground">
                This accordion uses warning semantic color tokens for cautionary
                information.
              </AccordionContent>
            </AccordionItem>
          </Accordion>

          <Accordion type="single" collapsible>
            <AccordionItem value="danger" className="border-danger/20">
              <AccordionTrigger className="hover:bg-danger/5 data-[state=open]:bg-danger/10">
                <div className="text-danger flex items-center gap-2">
                  <XCircle className="h-4 w-4" />
                  Danger State Accordion
                </div>
              </AccordionTrigger>
              <AccordionContent className="bg-danger/5 text-danger-foreground">
                This accordion uses danger semantic color tokens for critical
                information.
              </AccordionContent>
            </AccordionItem>
          </Accordion>

          <Accordion type="single" collapsible>
            <AccordionItem value="info" className="border-info/20">
              <AccordionTrigger className="hover:bg-info/5 data-[state=open]:bg-info/10">
                <div className="text-info flex items-center gap-2">
                  <Info className="h-4 w-4" />
                  Info State Accordion
                </div>
              </AccordionTrigger>
              <AccordionContent className="bg-info/5 text-info-foreground">
                This accordion uses info semantic color tokens for informational
                content.
              </AccordionContent>
            </AccordionItem>
          </Accordion>
        </div>
      </div>

      <div>
        <h3 className="text-heading-3 mb-4 font-medium">
          Component Token Usage
        </h3>
        <Card>
          <CardContent className="pt-6">
            <Accordion type="single" collapsible>
              <AccordionItem value="tokens">
                <AccordionTrigger>CoreLive Accordion Tokens</AccordionTrigger>
                <AccordionContent>
                  <div className="space-y-4">
                    <p className="text-muted-foreground text-sm">
                      The accordion component uses these design system tokens:
                    </p>
                    <div className="bg-muted rounded-md p-3">
                      <code className="text-xs">
                        --component-accordion-background
                        <br />
                        --component-accordion-border
                        <br />
                        --component-accordion-content-background
                        <br />
                        --component-accordion-trigger-hover
                        <br />
                        --component-accordion-trigger-active
                      </code>
                    </div>
                  </div>
                </AccordionContent>
              </AccordionItem>
            </Accordion>
          </CardContent>
        </Card>
      </div>

      <div>
        <h3 className="text-heading-3 mb-4 font-medium">
          Animation & Transitions
        </h3>
        <Accordion type="single" collapsible>
          <AccordionItem value="animated">
            <AccordionTrigger>Smooth Animations</AccordionTrigger>
            <AccordionContent>
              <div className="space-y-3">
                <p>
                  The accordion features smooth height animations when opening
                  and closing.
                </p>
                <div className="grid gap-2">
                  <div className="bg-muted rounded p-3">
                    <p className="text-sm font-medium">Transition Duration</p>
                    <p className="text-muted-foreground text-sm">
                      200ms ease-out
                    </p>
                  </div>
                  <div className="bg-muted rounded p-3">
                    <p className="text-sm font-medium">Chevron Rotation</p>
                    <p className="text-muted-foreground text-sm">
                      180° transform on open
                    </p>
                  </div>
                </div>
              </div>
            </AccordionContent>
          </AccordionItem>
        </Accordion>
      </div>
    </div>
  ),
  parameters: {
    layout: 'padded',
    docs: {
      description: {
        story:
          'Comprehensive showcase of accordion variations using CoreLive Design System tokens for consistent styling across different states and use cases.',
      },
    },
  },
}
