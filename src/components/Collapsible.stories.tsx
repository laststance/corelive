import type { Meta, StoryObj } from '@storybook/react'
import {
  ChevronDown,
  ChevronRight,
  ChevronsUpDown,
  Info,
  Code,
  FileText,
  Eye,
  EyeOff,
  Filter,
  Calendar,
  Clock,
  Mail,
  Bell,
  Shield,
  Database,
  Server,
  Wifi,
  Zap,
  HelpCircle,
  AlertCircle,
  CheckCircle,
  XCircle,
  MoreVertical,
  Hash,
  GitBranch,
  MessageSquare,
  Package,
  Layout,
  Layers,
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
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible'
import { Label } from '@/components/ui/label'
import { Separator } from '@/components/ui/separator'
import { Switch } from '@/components/ui/switch'

const meta: Meta<typeof Collapsible> = {
  title: 'CoreLive Design System/Components/Collapsible',
  component: Collapsible,
  parameters: {
    layout: 'centered',
    docs: {
      description: {
        component:
          'A collapsible component that can be toggled to show/hide content. Built with accessibility and styled with CoreLive Design System tokens.',
      },
    },
  },
  tags: ['autodocs'],
  argTypes: {
    open: {
      control: 'boolean',
      description: 'The controlled open state of the collapsible',
    },
    defaultOpen: {
      control: 'boolean',
      description: 'The default open state when uncontrolled',
    },
    disabled: {
      control: 'boolean',
      description: 'Whether the collapsible is disabled',
    },
  },
}

export default meta
type Story = StoryObj<typeof meta>

export const Default: Story = {
  args: {},
  render: () => {
    const [isOpen, setIsOpen] = useState(false)

    return (
      <Collapsible
        open={isOpen}
        onOpenChange={setIsOpen}
        className="w-[350px] space-y-2"
      >
        <div className="flex items-center justify-between space-x-4 px-4">
          <h4 className="text-sm font-semibold">
            @peduarte starred 3 repositories
          </h4>
          <CollapsibleTrigger asChild>
            <Button variant="ghost" size="sm" className="w-9 p-0">
              <ChevronsUpDown className="h-4 w-4" />
              <span className="sr-only">Toggle</span>
            </Button>
          </CollapsibleTrigger>
        </div>
        <div className="rounded-md border px-4 py-3 font-mono text-sm">
          @radix-ui/primitives
        </div>
        <CollapsibleContent className="space-y-2">
          <div className="rounded-md border px-4 py-3 font-mono text-sm">
            @radix-ui/colors
          </div>
          <div className="rounded-md border px-4 py-3 font-mono text-sm">
            @stitches/react
          </div>
        </CollapsibleContent>
      </Collapsible>
    )
  },
}

export const WithChevronIcon: Story = {
  args: {},
  render: () => {
    const [isOpen, setIsOpen] = useState(false)

    return (
      <Card className="w-[400px]">
        <Collapsible open={isOpen} onOpenChange={setIsOpen}>
          <CollapsibleTrigger asChild>
            <CardHeader className="cursor-pointer">
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle>Advanced Settings</CardTitle>
                  <CardDescription>Configure advanced options</CardDescription>
                </div>
                <ChevronDown
                  className={`h-5 w-5 transition-transform ${isOpen ? 'rotate-180' : ''}`}
                />
              </div>
            </CardHeader>
          </CollapsibleTrigger>
          <CollapsibleContent>
            <CardContent className="space-y-4">
              <div className="flex items-center justify-between">
                <Label htmlFor="debug">Debug mode</Label>
                <Switch id="debug" />
              </div>
              <div className="flex items-center justify-between">
                <Label htmlFor="analytics">Analytics</Label>
                <Switch id="analytics" defaultChecked />
              </div>
              <div className="flex items-center justify-between">
                <Label htmlFor="cache">Enable cache</Label>
                <Switch id="cache" defaultChecked />
              </div>
            </CardContent>
          </CollapsibleContent>
        </Collapsible>
      </Card>
    )
  },
}

export const CodePreview: Story = {
  args: {},
  render: () => {
    const [isOpen, setIsOpen] = useState(false)

    const codeExample = `function calculateTotal(items) {
  return items.reduce((total, item) => {
    return total + (item.price * item.quantity);
  }, 0);
}

const items = [
  { name: 'Widget', price: 9.99, quantity: 2 },
  { name: 'Gadget', price: 24.99, quantity: 1 }
];

console.log(calculateTotal(items)); // 44.97`

    return (
      <Card className="w-[600px]">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Code className="h-5 w-5" />
            Code Example
          </CardTitle>
          <CardDescription>JavaScript function implementation</CardDescription>
        </CardHeader>
        <CardContent>
          <Collapsible open={isOpen} onOpenChange={setIsOpen}>
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Badge variant="secondary">example.js</Badge>
                  <span className="text-muted-foreground text-sm">
                    12 lines
                  </span>
                </div>
                <CollapsibleTrigger asChild>
                  <Button variant="ghost" size="sm">
                    {isOpen ? (
                      <>
                        <EyeOff className="mr-2 h-4 w-4" />
                        Hide
                      </>
                    ) : (
                      <>
                        <Eye className="mr-2 h-4 w-4" />
                        Show
                      </>
                    )}
                  </Button>
                </CollapsibleTrigger>
              </div>

              <CollapsibleContent>
                <pre className="bg-muted mt-4 overflow-x-auto rounded-lg p-4">
                  <code className="font-mono text-sm">{codeExample}</code>
                </pre>
              </CollapsibleContent>
            </div>
          </Collapsible>
        </CardContent>
      </Card>
    )
  },
}

export const FilterPanel: Story = {
  args: {},
  render: () => {
    const [isOpen, setIsOpen] = useState(true)

    return (
      <div className="w-[300px] space-y-4">
        <Collapsible open={isOpen} onOpenChange={setIsOpen}>
          <CollapsibleTrigger asChild>
            <Button variant="outline" className="w-full justify-between">
              <span className="flex items-center gap-2">
                <Filter className="h-4 w-4" />
                Filters
              </span>
              <ChevronDown
                className={`h-4 w-4 transition-transform ${isOpen ? 'rotate-180' : ''}`}
              />
            </Button>
          </CollapsibleTrigger>

          <CollapsibleContent className="mt-4">
            <div className="space-y-4 rounded-lg border p-4">
              <div>
                <Label className="mb-2 block text-sm font-medium">
                  Date Range
                </Label>
                <div className="space-y-2">
                  <Button
                    variant="outline"
                    size="sm"
                    className="w-full justify-start"
                  >
                    <Calendar className="mr-2 h-4 w-4" />
                    Last 7 days
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    className="w-full justify-start"
                  >
                    <Clock className="mr-2 h-4 w-4" />
                    Last 30 days
                  </Button>
                </div>
              </div>

              <Separator />

              <div>
                <Label className="mb-2 block text-sm font-medium">Status</Label>
                <div className="space-y-2">
                  <div className="flex items-center space-x-2">
                    <input type="checkbox" id="active" className="rounded" />
                    <Label htmlFor="active" className="text-sm font-normal">
                      Active
                    </Label>
                  </div>
                  <div className="flex items-center space-x-2">
                    <input type="checkbox" id="pending" className="rounded" />
                    <Label htmlFor="pending" className="text-sm font-normal">
                      Pending
                    </Label>
                  </div>
                  <div className="flex items-center space-x-2">
                    <input type="checkbox" id="completed" className="rounded" />
                    <Label htmlFor="completed" className="text-sm font-normal">
                      Completed
                    </Label>
                  </div>
                </div>
              </div>

              <div className="flex gap-2 pt-2">
                <Button size="sm" className="flex-1">
                  Apply
                </Button>
                <Button size="sm" variant="outline" className="flex-1">
                  Reset
                </Button>
              </div>
            </div>
          </CollapsibleContent>
        </Collapsible>
      </div>
    )
  },
}

export const FAQItem: Story = {
  args: {},
  render: () => {
    const faqs = [
      {
        question: 'What is CoreLive Design System?',
        answer:
          'CoreLive Design System is a comprehensive set of design guidelines, components, and tools that help teams build consistent, accessible, and beautiful user interfaces.',
        icon: HelpCircle,
      },
      {
        question: 'How do I get started?',
        answer:
          'Getting started is easy! Install the package using npm or yarn, import the components you need, and start building. Check out our documentation for detailed guides and examples.',
        icon: Zap,
      },
      {
        question: 'Is it accessible?',
        answer:
          'Yes! All components are built with accessibility in mind, following WCAG 2.1 guidelines. We include proper ARIA labels, keyboard navigation, and screen reader support.',
        icon: Shield,
      },
    ]

    return (
      <div className="w-full max-w-2xl space-y-2">
        <h3 className="text-heading-3 mb-4 font-medium">
          Frequently Asked Questions
        </h3>
        {faqs.map((faq, index) => {
          const [isOpen, setIsOpen] = useState(index === 0)
          const Icon = faq.icon

          return (
            <Card key={index}>
              <Collapsible open={isOpen} onOpenChange={setIsOpen}>
                <CollapsibleTrigger asChild>
                  <CardHeader className="cursor-pointer">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <Icon className="text-primary h-5 w-5" />
                        <h4 className="font-medium">{faq.question}</h4>
                      </div>
                      <ChevronRight
                        className={`h-5 w-5 transition-transform ${isOpen ? 'rotate-90' : ''}`}
                      />
                    </div>
                  </CardHeader>
                </CollapsibleTrigger>
                <CollapsibleContent>
                  <CardContent className="pt-0">
                    <p className="text-muted-foreground text-sm">
                      {faq.answer}
                    </p>
                  </CardContent>
                </CollapsibleContent>
              </Collapsible>
            </Card>
          )
        })}
      </div>
    )
  },
  parameters: {
    layout: 'padded',
  },
}

export const SystemStatus: Story = {
  args: {},
  render: () => {
    const [expandedServices, setExpandedServices] = useState<Set<string>>(
      new Set(['api']),
    )

    const toggleService = (service: string) => {
      const newExpanded = new Set(expandedServices)
      if (newExpanded.has(service)) {
        newExpanded.delete(service)
      } else {
        newExpanded.add(service)
      }
      setExpandedServices(newExpanded)
    }

    const services = [
      {
        id: 'api',
        name: 'API Service',
        status: 'operational',
        icon: Server,
        uptime: '99.9%',
        metrics: [
          { label: 'Response Time', value: '45ms' },
          { label: 'Error Rate', value: '0.01%' },
          { label: 'Requests/min', value: '1.2k' },
        ],
      },
      {
        id: 'database',
        name: 'Database',
        status: 'operational',
        icon: Database,
        uptime: '99.99%',
        metrics: [
          { label: 'Connections', value: '142' },
          { label: 'Query Time', value: '12ms' },
          { label: 'Storage Used', value: '67%' },
        ],
      },
      {
        id: 'cdn',
        name: 'CDN',
        status: 'degraded',
        icon: Wifi,
        uptime: '98.5%',
        metrics: [
          { label: 'Cache Hit Rate', value: '92%' },
          { label: 'Bandwidth', value: '1.8TB' },
          { label: 'Latency', value: '120ms' },
        ],
      },
    ]

    const getStatusIcon = (status: string) => {
      switch (status) {
        case 'operational':
          return <CheckCircle className="text-success h-4 w-4" />
        case 'degraded':
          return <AlertCircle className="text-warning h-4 w-4" />
        case 'down':
          return <XCircle className="text-danger h-4 w-4" />
        default:
          return null
      }
    }

    const getStatusColor = (status: string) => {
      switch (status) {
        case 'operational':
          return 'text-success'
        case 'degraded':
          return 'text-warning'
        case 'down':
          return 'text-danger'
        default:
          return ''
      }
    }

    return (
      <Card className="w-full max-w-2xl">
        <CardHeader>
          <CardTitle>System Status</CardTitle>
          <CardDescription>
            Real-time monitoring of all services
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-2">
          {services.map((service) => {
            const Icon = service.icon
            const isOpen = expandedServices.has(service.id)

            return (
              <div key={service.id} className="rounded-lg border">
                <Collapsible
                  open={isOpen}
                  onOpenChange={() => toggleService(service.id)}
                >
                  <CollapsibleTrigger asChild>
                    <div className="hover:bg-muted/50 flex cursor-pointer items-center justify-between p-4">
                      <div className="flex items-center gap-3">
                        <Icon className="h-5 w-5" />
                        <div>
                          <p className="font-medium">{service.name}</p>
                          <div className="mt-1 flex items-center gap-2">
                            {getStatusIcon(service.status)}
                            <span
                              className={`text-sm ${getStatusColor(service.status)}`}
                            >
                              {service.status.charAt(0).toUpperCase() +
                                service.status.slice(1)}
                            </span>
                          </div>
                        </div>
                      </div>
                      <div className="flex items-center gap-4">
                        <Badge variant="outline">{service.uptime} uptime</Badge>
                        <ChevronDown
                          className={`h-4 w-4 transition-transform ${isOpen ? 'rotate-180' : ''}`}
                        />
                      </div>
                    </div>
                  </CollapsibleTrigger>

                  <CollapsibleContent>
                    <div className="px-4 pb-4">
                      <Separator className="mb-4" />
                      <div className="grid grid-cols-3 gap-4">
                        {service.metrics.map((metric, index) => (
                          <div key={index} className="text-center">
                            <p className="text-muted-foreground text-sm">
                              {metric.label}
                            </p>
                            <p className="text-lg font-semibold">
                              {metric.value}
                            </p>
                          </div>
                        ))}
                      </div>
                    </div>
                  </CollapsibleContent>
                </Collapsible>
              </div>
            )
          })}
        </CardContent>
      </Card>
    )
  },
  parameters: {
    layout: 'padded',
  },
}

export const NotificationSettings: Story = {
  args: {},
  render: () => {
    const [emailOpen, setEmailOpen] = useState(true)
    const [pushOpen, setPushOpen] = useState(false)

    return (
      <Card className="w-[400px]">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Bell className="h-5 w-5" />
            Notification Preferences
          </CardTitle>
          <CardDescription>
            Manage how you receive notifications
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <Collapsible open={emailOpen} onOpenChange={setEmailOpen}>
            <div className="space-y-4">
              <CollapsibleTrigger asChild>
                <div className="flex cursor-pointer items-center justify-between">
                  <div className="flex items-center gap-3">
                    <Mail className="h-4 w-4" />
                    <div>
                      <p className="font-medium">Email Notifications</p>
                      <p className="text-muted-foreground text-sm">
                        Configure email alerts
                      </p>
                    </div>
                  </div>
                  <Switch checked={emailOpen} />
                </div>
              </CollapsibleTrigger>

              <CollapsibleContent>
                <div className="ml-7 space-y-3 pt-2">
                  <div className="flex items-center justify-between">
                    <Label
                      htmlFor="email-updates"
                      className="text-sm font-normal"
                    >
                      Product updates
                    </Label>
                    <Switch id="email-updates" defaultChecked />
                  </div>
                  <div className="flex items-center justify-between">
                    <Label
                      htmlFor="email-security"
                      className="text-sm font-normal"
                    >
                      Security alerts
                    </Label>
                    <Switch id="email-security" defaultChecked />
                  </div>
                  <div className="flex items-center justify-between">
                    <Label
                      htmlFor="email-marketing"
                      className="text-sm font-normal"
                    >
                      Marketing emails
                    </Label>
                    <Switch id="email-marketing" />
                  </div>
                </div>
              </CollapsibleContent>
            </div>
          </Collapsible>

          <Separator />

          <Collapsible open={pushOpen} onOpenChange={setPushOpen}>
            <div className="space-y-4">
              <CollapsibleTrigger asChild>
                <div className="flex cursor-pointer items-center justify-between">
                  <div className="flex items-center gap-3">
                    <Bell className="h-4 w-4" />
                    <div>
                      <p className="font-medium">Push Notifications</p>
                      <p className="text-muted-foreground text-sm">
                        In-app and browser alerts
                      </p>
                    </div>
                  </div>
                  <Switch checked={pushOpen} />
                </div>
              </CollapsibleTrigger>

              <CollapsibleContent>
                <div className="ml-7 space-y-3 pt-2">
                  <div className="flex items-center justify-between">
                    <Label
                      htmlFor="push-messages"
                      className="text-sm font-normal"
                    >
                      Direct messages
                    </Label>
                    <Switch id="push-messages" defaultChecked />
                  </div>
                  <div className="flex items-center justify-between">
                    <Label
                      htmlFor="push-mentions"
                      className="text-sm font-normal"
                    >
                      Mentions
                    </Label>
                    <Switch id="push-mentions" defaultChecked />
                  </div>
                  <div className="flex items-center justify-between">
                    <Label
                      htmlFor="push-comments"
                      className="text-sm font-normal"
                    >
                      Comments
                    </Label>
                    <Switch id="push-comments" />
                  </div>
                </div>
              </CollapsibleContent>
            </div>
          </Collapsible>
        </CardContent>
      </Card>
    )
  },
}

export const FileExplorer: Story = {
  args: {},
  render: () => {
    const [expandedFolders, setExpandedFolders] = useState<Set<string>>(
      new Set(['src', 'components']),
    )

    const toggleFolder = (folder: string) => {
      const newExpanded = new Set(expandedFolders)
      if (newExpanded.has(folder)) {
        newExpanded.delete(folder)
      } else {
        newExpanded.add(folder)
      }
      setExpandedFolders(newExpanded)
    }

    const FileItem = ({
      name,
      indent = 0,
    }: {
      name: string
      indent?: number
    }) => (
      <div
        className="hover:bg-muted flex items-center gap-2 rounded px-2 py-1"
        style={{ paddingLeft: `${indent * 16 + 8}px` }}
      >
        <FileText className="text-muted-foreground h-4 w-4" />
        <span className="text-sm">{name}</span>
      </div>
    )

    const FolderItem = ({
      name,
      path,
      indent = 0,
      children,
    }: {
      name: string
      path: string
      indent?: number
      children?: React.ReactNode
    }) => {
      const isOpen = expandedFolders.has(path)

      return (
        <Collapsible open={isOpen} onOpenChange={() => toggleFolder(path)}>
          <CollapsibleTrigger asChild>
            <div
              className="hover:bg-muted flex cursor-pointer items-center gap-2 rounded px-2 py-1"
              style={{ paddingLeft: `${indent * 16 + 8}px` }}
            >
              <ChevronRight
                className={`h-4 w-4 transition-transform ${isOpen ? 'rotate-90' : ''}`}
              />
              <Package className="text-primary h-4 w-4" />
              <span className="text-sm font-medium">{name}</span>
            </div>
          </CollapsibleTrigger>
          <CollapsibleContent>{children}</CollapsibleContent>
        </Collapsible>
      )
    }

    return (
      <Card className="w-[350px]">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Layout className="h-5 w-5" />
            Project Structure
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-1">
            <FolderItem name="src" path="src" indent={0}>
              <FolderItem name="components" path="components" indent={1}>
                <FolderItem name="ui" path="ui" indent={2}>
                  <FileItem name="button.tsx" indent={3} />
                  <FileItem name="card.tsx" indent={3} />
                  <FileItem name="collapsible.tsx" indent={3} />
                </FolderItem>
                <FileItem name="layout.tsx" indent={2} />
                <FileItem name="header.tsx" indent={2} />
              </FolderItem>
              <FolderItem name="lib" path="lib" indent={1}>
                <FileItem name="utils.ts" indent={2} />
                <FileItem name="constants.ts" indent={2} />
              </FolderItem>
              <FileItem name="app.tsx" indent={1} />
              <FileItem name="index.tsx" indent={1} />
            </FolderItem>
            <FileItem name="package.json" indent={0} />
            <FileItem name="tsconfig.json" indent={0} />
          </div>
        </CardContent>
      </Card>
    )
  },
}

export const CommitDetails: Story = {
  args: {},
  render: () => {
    const [filesOpen, setFilesOpen] = useState(true)

    return (
      <Card className="w-full max-w-2xl">
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <GitBranch className="h-5 w-5" />
                feat: Add collapsible component
              </CardTitle>
              <CardDescription>
                Committed by John Doe • 2 hours ago
              </CardDescription>
            </div>
            <div className="flex gap-2">
              <Badge variant="outline" className="text-success">
                +248
              </Badge>
              <Badge variant="outline" className="text-danger">
                -12
              </Badge>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            <div className="flex items-center gap-4 text-sm">
              <div className="flex items-center gap-2">
                <Hash className="h-4 w-4" />
                <code>a1b2c3d</code>
              </div>
              <div className="flex items-center gap-2">
                <MessageSquare className="h-4 w-4" />
                <span>3 comments</span>
              </div>
            </div>

            <Separator />

            <Collapsible open={filesOpen} onOpenChange={setFilesOpen}>
              <CollapsibleTrigger asChild>
                <Button variant="outline" className="w-full justify-between">
                  <span>Files changed (5)</span>
                  <ChevronDown
                    className={`h-4 w-4 transition-transform ${filesOpen ? 'rotate-180' : ''}`}
                  />
                </Button>
              </CollapsibleTrigger>

              <CollapsibleContent className="mt-4">
                <div className="space-y-2">
                  <div className="hover:bg-muted flex items-center justify-between rounded p-2">
                    <div className="flex items-center gap-2">
                      <FileText className="h-4 w-4" />
                      <code className="text-sm">
                        src/components/collapsible.tsx
                      </code>
                    </div>
                    <div className="flex gap-2 text-sm">
                      <span className="text-success">+156</span>
                      <span className="text-danger">-4</span>
                    </div>
                  </div>
                  <div className="hover:bg-muted flex items-center justify-between rounded p-2">
                    <div className="flex items-center gap-2">
                      <FileText className="h-4 w-4" />
                      <code className="text-sm">
                        src/stories/collapsible.stories.tsx
                      </code>
                    </div>
                    <div className="flex gap-2 text-sm">
                      <span className="text-success">+78</span>
                      <span className="text-danger">-0</span>
                    </div>
                  </div>
                  <div className="hover:bg-muted flex items-center justify-between rounded p-2">
                    <div className="flex items-center gap-2">
                      <FileText className="h-4 w-4" />
                      <code className="text-sm">src/index.ts</code>
                    </div>
                    <div className="flex gap-2 text-sm">
                      <span className="text-success">+2</span>
                      <span className="text-danger">-0</span>
                    </div>
                  </div>
                  <div className="hover:bg-muted flex items-center justify-between rounded p-2">
                    <div className="flex items-center gap-2">
                      <FileText className="h-4 w-4" />
                      <code className="text-sm">package.json</code>
                    </div>
                    <div className="flex gap-2 text-sm">
                      <span className="text-success">+1</span>
                      <span className="text-danger">-1</span>
                    </div>
                  </div>
                  <div className="hover:bg-muted flex items-center justify-between rounded p-2">
                    <div className="flex items-center gap-2">
                      <FileText className="h-4 w-4" />
                      <code className="text-sm">README.md</code>
                    </div>
                    <div className="flex gap-2 text-sm">
                      <span className="text-success">+11</span>
                      <span className="text-danger">-7</span>
                    </div>
                  </div>
                </div>
              </CollapsibleContent>
            </Collapsible>
          </div>
        </CardContent>
      </Card>
    )
  },
  parameters: {
    layout: 'padded',
  },
}

export const CoreLiveThemeShowcase: Story = {
  args: {},
  render: () => (
    <div className="w-full max-w-2xl space-y-6">
      <div>
        <h3 className="text-heading-3 mb-4 font-medium">Collapsible States</h3>
        <div className="space-y-4">
          <Card>
            <CardContent className="pt-6">
              <div className="space-y-4">
                <Collapsible defaultOpen>
                  <CollapsibleTrigger asChild>
                    <Button
                      variant="ghost"
                      className="w-full justify-between"
                      style={{
                        backgroundColor:
                          'var(--component-collapsible-trigger-background)',
                        borderColor:
                          'var(--component-collapsible-trigger-border)',
                        color: 'var(--component-collapsible-trigger-text)',
                      }}
                    >
                      <span>Open state</span>
                      <ChevronDown className="h-4 w-4 rotate-180" />
                    </Button>
                  </CollapsibleTrigger>
                  <CollapsibleContent
                    className="mt-2 rounded-md p-4"
                    style={{
                      backgroundColor:
                        'var(--component-collapsible-content-background)',
                      borderWidth: '1px',
                      borderStyle: 'solid',
                      borderColor:
                        'var(--component-collapsible-content-border)',
                    }}
                  >
                    <p className="text-sm">
                      This content is visible when the collapsible is open.
                    </p>
                  </CollapsibleContent>
                </Collapsible>

                <Collapsible>
                  <CollapsibleTrigger asChild>
                    <Button
                      variant="ghost"
                      className="w-full justify-between"
                      style={{
                        backgroundColor:
                          'var(--component-collapsible-trigger-background)',
                        borderColor:
                          'var(--component-collapsible-trigger-border)',
                        color: 'var(--component-collapsible-trigger-text)',
                      }}
                    >
                      <span>Closed state</span>
                      <ChevronDown className="h-4 w-4" />
                    </Button>
                  </CollapsibleTrigger>
                  <CollapsibleContent>
                    <p className="mt-2 p-4 text-sm">This content is hidden.</p>
                  </CollapsibleContent>
                </Collapsible>

                <Collapsible disabled>
                  <CollapsibleTrigger asChild>
                    <Button
                      variant="ghost"
                      className="w-full cursor-not-allowed justify-between opacity-50"
                      disabled
                    >
                      <span>Disabled state</span>
                      <ChevronDown className="h-4 w-4" />
                    </Button>
                  </CollapsibleTrigger>
                </Collapsible>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>

      <div>
        <h3 className="text-heading-3 mb-4 font-medium">Trigger Variations</h3>
        <div className="grid grid-cols-2 gap-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-sm">Icon Triggers</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                <Collapsible>
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium">Chevron trigger</span>
                    <CollapsibleTrigger asChild>
                      <Button variant="ghost" size="icon" className="h-8 w-8">
                        <ChevronRight className="h-4 w-4" />
                      </Button>
                    </CollapsibleTrigger>
                  </div>
                </Collapsible>

                <Collapsible>
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium">
                      Plus/Minus trigger
                    </span>
                    <CollapsibleTrigger asChild>
                      <Button variant="ghost" size="icon" className="h-8 w-8">
                        <MoreVertical className="h-4 w-4" />
                      </Button>
                    </CollapsibleTrigger>
                  </div>
                </Collapsible>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-sm">Text Triggers</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                <Collapsible>
                  <CollapsibleTrigger asChild>
                    <Button variant="link" className="h-auto p-0">
                      Show more details →
                    </Button>
                  </CollapsibleTrigger>
                </Collapsible>

                <Collapsible>
                  <CollapsibleTrigger asChild>
                    <Button variant="outline" size="sm">
                      <Eye className="mr-2 h-4 w-4" />
                      View options
                    </Button>
                  </CollapsibleTrigger>
                </Collapsible>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>

      <div>
        <h3 className="text-heading-3 mb-4 font-medium">Semantic Usage</h3>
        <div className="space-y-4">
          <Collapsible defaultOpen>
            <Card className="border-info/20">
              <CollapsibleTrigger asChild>
                <CardHeader className="cursor-pointer">
                  <CardTitle className="text-info flex items-center justify-between">
                    <span className="flex items-center gap-2">
                      <Info className="h-5 w-5" />
                      Information
                    </span>
                    <ChevronDown className="h-5 w-5 rotate-180" />
                  </CardTitle>
                </CardHeader>
              </CollapsibleTrigger>
              <CollapsibleContent>
                <CardContent className="bg-info/5">
                  <p className="text-sm">
                    Additional information that can be toggled for visibility.
                  </p>
                </CardContent>
              </CollapsibleContent>
            </Card>
          </Collapsible>

          <Collapsible>
            <Card className="border-warning/20">
              <CollapsibleTrigger asChild>
                <CardHeader className="cursor-pointer">
                  <CardTitle className="text-warning flex items-center justify-between">
                    <span className="flex items-center gap-2">
                      <AlertCircle className="h-5 w-5" />
                      Warning Details
                    </span>
                    <ChevronDown className="h-5 w-5" />
                  </CardTitle>
                </CardHeader>
              </CollapsibleTrigger>
              <CollapsibleContent>
                <CardContent className="bg-warning/5">
                  <p className="text-sm">
                    Important warning information that users should be aware of.
                  </p>
                </CardContent>
              </CollapsibleContent>
            </Card>
          </Collapsible>
        </div>
      </div>

      <div>
        <h3 className="text-heading-3 mb-4 font-medium">
          Component Token Usage
        </h3>
        <Card>
          <CardContent className="pt-6">
            <div className="space-y-4">
              <div className="space-y-2">
                <p className="text-sm font-medium">Custom styled collapsible</p>
                <Collapsible defaultOpen>
                  <CollapsibleTrigger asChild>
                    <button
                      className="flex w-full items-center justify-between rounded-md p-3 transition-colors"
                      style={{
                        backgroundColor:
                          'var(--component-collapsible-trigger-background)',
                        borderWidth: '1px',
                        borderStyle: 'solid',
                        borderColor:
                          'var(--component-collapsible-trigger-border)',
                        color: 'var(--component-collapsible-trigger-text)',
                      }}
                    >
                      <span>Custom trigger styling</span>
                      <ChevronsUpDown className="h-4 w-4" />
                    </button>
                  </CollapsibleTrigger>
                  <CollapsibleContent>
                    <div
                      className="mt-2 rounded-md p-4"
                      style={{
                        backgroundColor:
                          'var(--component-collapsible-content-background)',
                        borderWidth: '1px',
                        borderStyle: 'solid',
                        borderColor:
                          'var(--component-collapsible-content-border)',
                      }}
                    >
                      <p className="text-sm">
                        Content styled with component tokens
                      </p>
                    </div>
                  </CollapsibleContent>
                </Collapsible>
              </div>

              <div className="bg-muted rounded-md p-3">
                <code className="text-xs">
                  --component-collapsible-trigger-background
                  <br />
                  --component-collapsible-trigger-border
                  <br />
                  --component-collapsible-trigger-text
                  <br />
                  --component-collapsible-trigger-hover-background
                  <br />
                  --component-collapsible-content-background
                  <br />
                  --component-collapsible-content-border
                  <br />
                  --component-collapsible-animation-duration
                </code>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      <div>
        <h3 className="text-heading-3 mb-4 font-medium">Nested Collapsibles</h3>
        <Card>
          <CardHeader>
            <CardTitle>Layered Information</CardTitle>
          </CardHeader>
          <CardContent>
            <Collapsible defaultOpen>
              <CollapsibleTrigger asChild>
                <Button
                  variant="outline"
                  className="mb-2 w-full justify-between"
                >
                  <span className="flex items-center gap-2">
                    <Layers className="h-4 w-4" />
                    Level 1
                  </span>
                  <ChevronDown className="h-4 w-4 rotate-180" />
                </Button>
              </CollapsibleTrigger>
              <CollapsibleContent>
                <div className="ml-4 space-y-2">
                  <p className="text-muted-foreground text-sm">
                    First level content
                  </p>

                  <Collapsible>
                    <CollapsibleTrigger asChild>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="w-full justify-between"
                      >
                        <span>Level 2</span>
                        <ChevronDown className="h-4 w-4" />
                      </Button>
                    </CollapsibleTrigger>
                    <CollapsibleContent>
                      <div className="bg-muted mt-2 ml-4 rounded p-3">
                        <p className="text-sm">Nested collapsible content</p>
                      </div>
                    </CollapsibleContent>
                  </Collapsible>
                </div>
              </CollapsibleContent>
            </Collapsible>
          </CardContent>
        </Card>
      </div>
    </div>
  ),
  parameters: {
    layout: 'padded',
    docs: {
      description: {
        story:
          'Comprehensive showcase of collapsible variations using CoreLive Design System tokens for consistent expandable content across different contexts.',
      },
    },
  },
}
