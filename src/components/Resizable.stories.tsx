import type { Meta, StoryObj } from '@storybook/react'
import {
  Code,
  FileText,
  Folder,
  FolderOpen,
  Terminal,
  Search,
  GitBranch,
  Settings,
  Users,
  Home,
  Mail,
  BarChart3,
  PieChart,
  Activity,
  TrendingUp,
  Eye,
  Edit3,
  Share,
  Star,
} from 'lucide-react'
import { useState } from 'react'

import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import {
  ResizablePanelGroup,
  ResizablePanel,
  ResizableHandle,
} from '@/components/ui/resizable'
import { Separator } from '@/components/ui/separator'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'

const meta: Meta<typeof ResizablePanelGroup> = {
  title: 'Components/Resizable',
  component: ResizablePanelGroup,
  parameters: {
    layout: 'fullscreen',
    docs: {
      description: {
        component:
          'Resizable panels that allow users to adjust layout by dragging handles.',
      },
    },
  },
  tags: ['autodocs'],
}

export default meta
type Story = StoryObj<typeof ResizablePanelGroup>

export const Default: Story = {
  args: {},
  render: () => (
    <div className="h-96 w-full">
      <ResizablePanelGroup direction="horizontal" className="rounded-lg border">
        <ResizablePanel defaultSize={50}>
          <div className="flex h-full items-center justify-center p-6">
            <span className="font-semibold">Left Panel</span>
          </div>
        </ResizablePanel>
        <ResizableHandle />
        <ResizablePanel defaultSize={50}>
          <div className="flex h-full items-center justify-center p-6">
            <span className="font-semibold">Right Panel</span>
          </div>
        </ResizablePanel>
      </ResizablePanelGroup>
    </div>
  ),
}

export const WithHandle: Story = {
  args: {},
  render: () => (
    <div className="h-96 w-full">
      <ResizablePanelGroup direction="horizontal" className="rounded-lg border">
        <ResizablePanel defaultSize={50}>
          <div className="flex h-full items-center justify-center p-6">
            <span className="font-semibold">Panel A</span>
          </div>
        </ResizablePanel>
        <ResizableHandle withHandle />
        <ResizablePanel defaultSize={50}>
          <div className="flex h-full items-center justify-center p-6">
            <span className="font-semibold">Panel B</span>
          </div>
        </ResizablePanel>
      </ResizablePanelGroup>
    </div>
  ),
}

export const VerticalLayout: Story = {
  args: {},
  render: () => (
    <div className="h-96 w-full">
      <ResizablePanelGroup direction="vertical" className="rounded-lg border">
        <ResizablePanel defaultSize={50}>
          <div className="flex h-full items-center justify-center p-6">
            <span className="font-semibold">Top Panel</span>
          </div>
        </ResizablePanel>
        <ResizableHandle withHandle />
        <ResizablePanel defaultSize={50}>
          <div className="flex h-full items-center justify-center p-6">
            <span className="font-semibold">Bottom Panel</span>
          </div>
        </ResizablePanel>
      </ResizablePanelGroup>
    </div>
  ),
}

export const CodeEditor: Story = {
  args: {},
  render: () => (
    <Card className="w-full max-w-6xl">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Code className="h-5 w-5" />
          Code Editor Layout
        </CardTitle>
        <CardDescription>
          IDE-like interface with resizable panels for file explorer, editor,
          and terminal
        </CardDescription>
      </CardHeader>
      <CardContent className="p-0">
        <div className="h-[600px]">
          <ResizablePanelGroup direction="horizontal">
            {/* Sidebar */}
            <ResizablePanel defaultSize={20} minSize={15} maxSize={30}>
              <div className="h-full border-r">
                <Tabs defaultValue="files" className="h-full">
                  <TabsList className="grid w-full grid-cols-3">
                    <TabsTrigger value="files" className="text-xs">
                      <Folder className="mr-1 h-3 w-3" />
                      Files
                    </TabsTrigger>
                    <TabsTrigger value="search" className="text-xs">
                      <Search className="mr-1 h-3 w-3" />
                      Search
                    </TabsTrigger>
                    <TabsTrigger value="git" className="text-xs">
                      <GitBranch className="mr-1 h-3 w-3" />
                      Git
                    </TabsTrigger>
                  </TabsList>

                  <TabsContent value="files" className="h-full space-y-1 p-2">
                    <div className="space-y-1">
                      <div className="flex items-center gap-1 p-1 text-sm font-medium">
                        <FolderOpen className="h-4 w-4" />
                        src
                      </div>
                      <div className="space-y-1 pl-4">
                        <div className="hover:bg-accent flex cursor-pointer items-center gap-1 rounded p-1 text-sm">
                          <FileText className="h-3 w-3" />
                          App.tsx
                        </div>
                        <div className="hover:bg-accent flex cursor-pointer items-center gap-1 rounded p-1 text-sm">
                          <FileText className="h-3 w-3" />
                          index.ts
                        </div>
                      </div>
                      <div className="flex items-center gap-1 p-1 text-sm font-medium">
                        <FolderOpen className="h-4 w-4" />
                        components
                      </div>
                      <div className="space-y-1 pl-4">
                        <div className="hover:bg-accent flex cursor-pointer items-center gap-1 rounded p-1 text-sm">
                          <FileText className="h-3 w-3" />
                          Button.tsx
                        </div>
                        <div className="hover:bg-accent flex cursor-pointer items-center gap-1 rounded p-1 text-sm">
                          <FileText className="h-3 w-3" />
                          Card.tsx
                        </div>
                      </div>
                    </div>
                  </TabsContent>

                  <TabsContent value="search" className="h-full p-2">
                    <div className="space-y-2">
                      <Input placeholder="Search files..." className="h-8" />
                      <div className="text-muted-foreground text-xs">
                        No results found
                      </div>
                    </div>
                  </TabsContent>

                  <TabsContent value="git" className="h-full p-2">
                    <div className="space-y-2">
                      <div className="text-xs font-medium">Changes (3)</div>
                      <div className="space-y-1">
                        <div className="hover:bg-accent flex cursor-pointer items-center gap-2 rounded p-1 text-xs">
                          <Badge
                            variant="outline"
                            className="h-4 w-4 p-0 text-xs"
                          >
                            M
                          </Badge>
                          src/App.tsx
                        </div>
                        <div className="hover:bg-accent flex cursor-pointer items-center gap-2 rounded p-1 text-xs">
                          <Badge
                            variant="outline"
                            className="h-4 w-4 p-0 text-xs"
                          >
                            +
                          </Badge>
                          components/NewFile.tsx
                        </div>
                      </div>
                    </div>
                  </TabsContent>
                </Tabs>
              </div>
            </ResizablePanel>

            <ResizableHandle withHandle />

            {/* Main Content Area */}
            <ResizablePanel defaultSize={55}>
              <ResizablePanelGroup direction="vertical">
                {/* Editor */}
                <ResizablePanel defaultSize={70}>
                  <div className="h-full border-b">
                    <div className="bg-muted flex h-8 items-center border-b px-3">
                      <div className="flex items-center gap-2">
                        <FileText className="h-3 w-3" />
                        <span className="text-xs font-medium">App.tsx</span>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="ml-2 h-4 w-4 p-0"
                        >
                          ×
                        </Button>
                      </div>
                    </div>
                    <div className="h-full overflow-auto p-4 font-mono text-sm">
                      <div className="space-y-1">
                        <div className="text-blue-600">
                          import React from 'react'
                        </div>
                        <div className="text-blue-600">
                          import {'{'} Button {'}'} from './components/Button'
                        </div>
                        <div className="text-blue-600">
                          import {'{'} Card {'}'} from './components/Card'
                        </div>
                        <div className="mt-4"></div>
                        <div className="text-purple-600">
                          function App() {`{`}
                        </div>
                        <div className="pl-4 text-gray-800">
                          <div>return (</div>
                          <div className="pl-4">
                            <div>
                              &lt;<span className="text-red-600">div</span>{' '}
                              <span className="text-blue-600">className</span>=
                              <span className="text-green-600">"App"</span>&gt;
                            </div>
                            <div className="pl-4">
                              <div>
                                &lt;<span className="text-red-600">Card</span>
                                &gt;
                              </div>
                              <div className="pl-4">
                                <div>
                                  &lt;<span className="text-red-600">h1</span>
                                  &gt;Hello World&lt;/
                                  <span className="text-red-600">h1</span>&gt;
                                </div>
                                <div>
                                  &lt;
                                  <span className="text-red-600">Button</span>
                                  &gt;Click me&lt;/
                                  <span className="text-red-600">Button</span>
                                  &gt;
                                </div>
                              </div>
                              <div>
                                &lt;/<span className="text-red-600">Card</span>
                                &gt;
                              </div>
                            </div>
                            <div>
                              &lt;/<span className="text-red-600">div</span>&gt;
                            </div>
                          </div>
                          <div>)</div>
                        </div>
                        <div>{`}`}</div>
                        <div className="mt-4"></div>
                        <div className="text-blue-600">export default App</div>
                      </div>
                    </div>
                  </div>
                </ResizablePanel>

                <ResizableHandle withHandle />

                {/* Terminal */}
                <ResizablePanel defaultSize={30} minSize={20}>
                  <div className="h-full bg-black p-4 font-mono text-sm text-green-400">
                    <div className="mb-2 flex items-center gap-2">
                      <Terminal className="h-4 w-4" />
                      <span className="text-xs">Terminal</span>
                    </div>
                    <div className="space-y-1">
                      <div>$ npm run dev</div>
                      <div className="text-blue-400">
                        Starting development server...
                      </div>
                      <div className="text-yellow-400">
                        webpack compiled with 1 warning
                      </div>
                      <div>Local: http://localhost:3000</div>
                      <div className="text-green-400">✓ Ready in 2.3s</div>
                      <div className="flex items-center">
                        <span>$ </span>
                        <div className="ml-1 h-4 w-2 animate-pulse bg-green-400"></div>
                      </div>
                    </div>
                  </div>
                </ResizablePanel>
              </ResizablePanelGroup>
            </ResizablePanel>

            <ResizableHandle withHandle />

            {/* Properties Panel */}
            <ResizablePanel defaultSize={25} minSize={20} maxSize={35}>
              <div className="h-full border-l p-4">
                <h3 className="mb-4 flex items-center gap-2 font-semibold">
                  <Settings className="h-4 w-4" />
                  Properties
                </h3>
                <div className="space-y-4">
                  <div>
                    <label className="text-sm font-medium">Component</label>
                    <div className="bg-muted mt-1 rounded p-2 text-sm">
                      Button
                    </div>
                  </div>
                  <div>
                    <label className="text-sm font-medium">Props</label>
                    <div className="mt-1 space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="text-xs">variant</span>
                        <Badge variant="outline" className="text-xs">
                          default
                        </Badge>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-xs">size</span>
                        <Badge variant="outline" className="text-xs">
                          md
                        </Badge>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-xs">disabled</span>
                        <Badge variant="outline" className="text-xs">
                          false
                        </Badge>
                      </div>
                    </div>
                  </div>
                  <Separator />
                  <div>
                    <label className="text-sm font-medium">Styles</label>
                    <div className="mt-1 space-y-2">
                      <div className="text-xs">
                        <div className="font-mono">padding: 8px 16px</div>
                        <div className="font-mono">border-radius: 6px</div>
                        <div className="font-mono">font-weight: 500</div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </ResizablePanel>
          </ResizablePanelGroup>
        </div>
      </CardContent>
    </Card>
  ),
}

export const Dashboard: Story = {
  args: {},
  render: () => (
    <Card className="w-full max-w-6xl">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <BarChart3 className="h-5 w-5" />
          Analytics Dashboard
        </CardTitle>
        <CardDescription>
          Resizable dashboard layout with charts, metrics, and data tables
        </CardDescription>
      </CardHeader>
      <CardContent className="p-0">
        <div className="h-[600px]">
          <ResizablePanelGroup direction="vertical">
            {/* Top Section - Metrics */}
            <ResizablePanel defaultSize={30} minSize={25}>
              <div className="h-full p-4">
                <h3 className="mb-4 font-semibold">Key Metrics</h3>
                <div className="grid h-full grid-cols-4 gap-4">
                  <Card>
                    <CardContent className="p-4">
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="text-muted-foreground text-sm">
                            Revenue
                          </p>
                          <p className="text-2xl font-bold">$12,345</p>
                          <p className="text-xs text-green-600">+12.5%</p>
                        </div>
                        <TrendingUp className="h-8 w-8 text-green-600" />
                      </div>
                    </CardContent>
                  </Card>
                  <Card>
                    <CardContent className="p-4">
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="text-muted-foreground text-sm">Users</p>
                          <p className="text-2xl font-bold">8,492</p>
                          <p className="text-xs text-blue-600">+3.2%</p>
                        </div>
                        <Users className="h-8 w-8 text-blue-600" />
                      </div>
                    </CardContent>
                  </Card>
                  <Card>
                    <CardContent className="p-4">
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="text-muted-foreground text-sm">
                            Orders
                          </p>
                          <p className="text-2xl font-bold">1,423</p>
                          <p className="text-xs text-purple-600">+8.1%</p>
                        </div>
                        <Activity className="h-8 w-8 text-purple-600" />
                      </div>
                    </CardContent>
                  </Card>
                  <Card>
                    <CardContent className="p-4">
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="text-muted-foreground text-sm">
                            Conversion
                          </p>
                          <p className="text-2xl font-bold">24.8%</p>
                          <p className="text-xs text-orange-600">-1.2%</p>
                        </div>
                        <PieChart className="h-8 w-8 text-orange-600" />
                      </div>
                    </CardContent>
                  </Card>
                </div>
              </div>
            </ResizablePanel>

            <ResizableHandle withHandle />

            {/* Bottom Section */}
            <ResizablePanel defaultSize={70}>
              <ResizablePanelGroup direction="horizontal">
                {/* Charts */}
                <ResizablePanel defaultSize={65}>
                  <div className="h-full p-4">
                    <h3 className="mb-4 font-semibold">Analytics</h3>
                    <Tabs defaultValue="revenue" className="h-full">
                      <TabsList>
                        <TabsTrigger value="revenue">Revenue</TabsTrigger>
                        <TabsTrigger value="users">Users</TabsTrigger>
                        <TabsTrigger value="traffic">Traffic</TabsTrigger>
                      </TabsList>

                      <TabsContent value="revenue" className="h-full">
                        <Card className="h-full">
                          <CardContent className="p-4">
                            <div className="flex h-full items-center justify-center rounded bg-gradient-to-br from-blue-50 to-indigo-100 dark:from-blue-950 dark:to-indigo-900">
                              <div className="text-center">
                                <BarChart3 className="mx-auto mb-4 h-16 w-16 text-blue-600" />
                                <p className="text-lg font-semibold">
                                  Revenue Chart
                                </p>
                                <p className="text-muted-foreground text-sm">
                                  Monthly revenue trends
                                </p>
                              </div>
                            </div>
                          </CardContent>
                        </Card>
                      </TabsContent>

                      <TabsContent value="users" className="h-full">
                        <Card className="h-full">
                          <CardContent className="p-4">
                            <div className="flex h-full items-center justify-center rounded bg-gradient-to-br from-green-50 to-emerald-100 dark:from-green-950 dark:to-emerald-900">
                              <div className="text-center">
                                <Users className="mx-auto mb-4 h-16 w-16 text-green-600" />
                                <p className="text-lg font-semibold">
                                  User Growth
                                </p>
                                <p className="text-muted-foreground text-sm">
                                  Active user metrics
                                </p>
                              </div>
                            </div>
                          </CardContent>
                        </Card>
                      </TabsContent>

                      <TabsContent value="traffic" className="h-full">
                        <Card className="h-full">
                          <CardContent className="p-4">
                            <div className="flex h-full items-center justify-center rounded bg-gradient-to-br from-purple-50 to-violet-100 dark:from-purple-950 dark:to-violet-900">
                              <div className="text-center">
                                <Activity className="mx-auto mb-4 h-16 w-16 text-purple-600" />
                                <p className="text-lg font-semibold">
                                  Traffic Analysis
                                </p>
                                <p className="text-muted-foreground text-sm">
                                  Website traffic patterns
                                </p>
                              </div>
                            </div>
                          </CardContent>
                        </Card>
                      </TabsContent>
                    </Tabs>
                  </div>
                </ResizablePanel>

                <ResizableHandle withHandle />

                {/* Data Table */}
                <ResizablePanel defaultSize={35} minSize={30}>
                  <div className="h-full p-4">
                    <h3 className="mb-4 font-semibold">Recent Activity</h3>
                    <Card className="h-full">
                      <CardContent className="p-4">
                        <div className="space-y-3">
                          {[
                            {
                              user: 'John Doe',
                              action: 'Made purchase',
                              amount: '$299.99',
                              time: '2m ago',
                            },
                            {
                              user: 'Jane Smith',
                              action: 'Signed up',
                              amount: '',
                              time: '5m ago',
                            },
                            {
                              user: 'Bob Wilson',
                              action: 'Updated profile',
                              amount: '',
                              time: '8m ago',
                            },
                            {
                              user: 'Alice Brown',
                              action: 'Made purchase',
                              amount: '$149.99',
                              time: '12m ago',
                            },
                            {
                              user: 'Charlie Davis',
                              action: 'Left review',
                              amount: '',
                              time: '15m ago',
                            },
                          ].map((activity, index) => (
                            <div
                              key={index}
                              className="hover:bg-muted flex items-center justify-between rounded p-2"
                            >
                              <div className="flex items-center gap-3">
                                <Avatar className="h-8 w-8">
                                  <AvatarFallback className="text-xs">
                                    {activity.user
                                      .split(' ')
                                      .map((n) => n[0])
                                      .join('')}
                                  </AvatarFallback>
                                </Avatar>
                                <div>
                                  <p className="text-sm font-medium">
                                    {activity.user}
                                  </p>
                                  <p className="text-muted-foreground text-xs">
                                    {activity.action}
                                  </p>
                                </div>
                              </div>
                              <div className="text-right">
                                {activity.amount && (
                                  <p className="text-sm font-medium text-green-600">
                                    {activity.amount}
                                  </p>
                                )}
                                <p className="text-muted-foreground text-xs">
                                  {activity.time}
                                </p>
                              </div>
                            </div>
                          ))}
                        </div>
                      </CardContent>
                    </Card>
                  </div>
                </ResizablePanel>
              </ResizablePanelGroup>
            </ResizablePanel>
          </ResizablePanelGroup>
        </div>
      </CardContent>
    </Card>
  ),
}

export const EmailClient: Story = {
  args: {},
  render: () => {
    const [selectedEmail, setSelectedEmail] = useState(0)

    const emails = [
      {
        from: 'Sarah Johnson',
        subject: 'Project Update - Q4 Progress',
        preview:
          'Hi team, I wanted to share the latest updates on our Q4 projects...',
        time: '2h',
        unread: true,
      },
      {
        from: 'Mike Chen',
        subject: 'Meeting Notes from Client Call',
        preview:
          'Thanks everyone for joining the call today. Here are the key takeaways...',
        time: '4h',
        unread: true,
      },
      {
        from: 'Design Team',
        subject: 'New UI Components Ready for Review',
        preview:
          'The new component library is ready for your review. Please check...',
        time: '1d',
        unread: false,
      },
      {
        from: 'Support',
        subject: 'Weekly Support Summary',
        preview:
          "Here's your weekly summary of support tickets and customer feedback...",
        time: '2d',
        unread: false,
      },
    ]

    return (
      <Card className="w-full max-w-6xl">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Mail className="h-5 w-5" />
            Email Client
          </CardTitle>
          <CardDescription>
            Three-panel email interface with folders, inbox, and message view
          </CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          <div className="h-[600px]">
            <ResizablePanelGroup direction="horizontal">
              {/* Sidebar */}
              <ResizablePanel defaultSize={20} minSize={15} maxSize={25}>
                <div className="h-full border-r p-4">
                  <div className="space-y-2">
                    <Button variant="default" className="w-full justify-start">
                      <Mail className="mr-2 h-4 w-4" />
                      Inbox
                      <Badge className="ml-auto">12</Badge>
                    </Button>
                    <Button variant="ghost" className="w-full justify-start">
                      <Edit3 className="mr-2 h-4 w-4" />
                      Drafts
                      <Badge variant="secondary" className="ml-auto">
                        3
                      </Badge>
                    </Button>
                    <Button variant="ghost" className="w-full justify-start">
                      <Share className="mr-2 h-4 w-4" />
                      Sent
                    </Button>
                    <Button variant="ghost" className="w-full justify-start">
                      <Star className="mr-2 h-4 w-4" />
                      Starred
                      <Badge variant="secondary" className="ml-auto">
                        7
                      </Badge>
                    </Button>
                    <Separator />
                    <div className="text-muted-foreground text-sm font-medium">
                      Labels
                    </div>
                    <Button
                      variant="ghost"
                      className="w-full justify-start text-sm"
                    >
                      <div className="mr-2 h-3 w-3 rounded-full bg-red-500"></div>
                      Important
                    </Button>
                    <Button
                      variant="ghost"
                      className="w-full justify-start text-sm"
                    >
                      <div className="mr-2 h-3 w-3 rounded-full bg-blue-500"></div>
                      Work
                    </Button>
                    <Button
                      variant="ghost"
                      className="w-full justify-start text-sm"
                    >
                      <div className="mr-2 h-3 w-3 rounded-full bg-green-500"></div>
                      Personal
                    </Button>
                  </div>
                </div>
              </ResizablePanel>

              <ResizableHandle withHandle />

              {/* Email List */}
              <ResizablePanel defaultSize={35} minSize={30}>
                <div className="h-full border-r">
                  <div className="border-b p-4">
                    <div className="mb-2 flex items-center justify-between">
                      <h3 className="font-semibold">Inbox</h3>
                      <Button size="sm" variant="outline">
                        <Search className="h-4 w-4" />
                      </Button>
                    </div>
                    <Input placeholder="Search emails..." className="h-8" />
                  </div>
                  <div className="overflow-auto">
                    {emails.map((email, index) => (
                      <div
                        key={index}
                        className={`hover:bg-muted cursor-pointer border-b p-4 transition-colors ${
                          selectedEmail === index ? 'bg-muted' : ''
                        } ${email.unread ? 'border-l-primary border-l-4' : ''}`}
                        onClick={() => setSelectedEmail(index)}
                      >
                        <div className="flex items-start justify-between">
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-2">
                              <p
                                className={`truncate text-sm ${email.unread ? 'font-semibold' : 'font-medium'}`}
                              >
                                {email.from}
                              </p>
                              <span className="text-muted-foreground text-xs">
                                {email.time}
                              </span>
                            </div>
                            <p
                              className={`mt-1 truncate text-sm ${email.unread ? 'font-medium' : ''}`}
                            >
                              {email.subject}
                            </p>
                            <p className="text-muted-foreground mt-1 truncate text-xs">
                              {email.preview}
                            </p>
                          </div>
                          <div className="ml-2 flex items-center gap-1">
                            {email.unread && (
                              <div className="bg-primary h-2 w-2 rounded-full"></div>
                            )}
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-6 w-6 p-0"
                            >
                              <Star className="h-3 w-3" />
                            </Button>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </ResizablePanel>

              <ResizableHandle withHandle />

              {/* Email Content */}
              <ResizablePanel defaultSize={45}>
                <div className="h-full p-4">
                  <div className="mb-4 border-b pb-4">
                    <div className="flex items-start justify-between">
                      <div>
                        <h2 className="text-lg font-semibold">
                          {emails[selectedEmail]?.subject}
                        </h2>
                        <div className="mt-2 flex items-center gap-2">
                          <Avatar className="h-8 w-8">
                            <AvatarFallback>
                              {emails[selectedEmail]?.from
                                .split(' ')
                                .map((n) => n[0])
                                .join('')}
                            </AvatarFallback>
                          </Avatar>
                          <div>
                            <p className="text-sm font-medium">
                              {emails[selectedEmail]?.from}
                            </p>
                            <p className="text-muted-foreground text-xs">
                              to me
                            </p>
                          </div>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-muted-foreground text-sm">
                          {emails[selectedEmail]?.time} ago
                        </span>
                        <Button variant="ghost" size="sm">
                          <Star className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  </div>

                  <div className="prose max-w-none">
                    <p>Hi there,</p>
                    <p>{emails[selectedEmail]?.preview}</p>
                    <p>
                      This is the full content of the email message. In a real
                      application, this would be the complete email body with
                      proper formatting, images, and other rich content.
                    </p>
                    <p>
                      The resizable panels allow users to adjust the layout
                      based on their preferences - they can make the email list
                      wider to see more preview text, or expand the content area
                      for better reading experience.
                    </p>
                    <p>
                      Best regards,
                      <br />
                      {emails[selectedEmail]?.from}
                    </p>
                  </div>

                  <div className="mt-8 flex gap-2">
                    <Button>Reply</Button>
                    <Button variant="outline">Forward</Button>
                    <Button variant="ghost">Archive</Button>
                  </div>
                </div>
              </ResizablePanel>
            </ResizablePanelGroup>
          </div>
        </CardContent>
      </Card>
    )
  },
}

export const CoreLiveThemeShowcase: Story = {
  args: {},
  render: () => (
    <div className="w-full max-w-6xl space-y-8">
      <div className="space-y-2 text-center">
        <h2 className="text-2xl font-bold">CoreLive Resizable Components</h2>
        <p className="text-muted-foreground">
          Resizable panel layouts showcasing CoreLive Design System integration
        </p>
      </div>

      <div className="space-y-6">
        {/* Basic Layouts */}
        <Card>
          <CardHeader>
            <CardTitle>Basic Resizable Layouts</CardTitle>
            <CardDescription>
              Fundamental resizable panel configurations with CoreLive styling
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            {/* Horizontal Layout */}
            <div>
              <h4 className="mb-2 font-medium">Horizontal Layout</h4>
              <div className="h-32">
                <ResizablePanelGroup
                  direction="horizontal"
                  className="rounded-lg border"
                >
                  <ResizablePanel defaultSize={40} className="bg-primary/5">
                    <div className="flex h-full items-center justify-center">
                      <Badge className="bg-primary">Primary Panel</Badge>
                    </div>
                  </ResizablePanel>
                  <ResizableHandle withHandle />
                  <ResizablePanel defaultSize={60} className="bg-secondary/5">
                    <div className="flex h-full items-center justify-center">
                      <Badge className="bg-secondary text-secondary-foreground">
                        Secondary Panel
                      </Badge>
                    </div>
                  </ResizablePanel>
                </ResizablePanelGroup>
              </div>
            </div>

            {/* Vertical Layout */}
            <div>
              <h4 className="mb-2 font-medium">Vertical Layout</h4>
              <div className="h-32">
                <ResizablePanelGroup
                  direction="vertical"
                  className="rounded-lg border"
                >
                  <ResizablePanel defaultSize={60} className="bg-success/5">
                    <div className="flex h-full items-center justify-center">
                      <Badge className="bg-success text-success-foreground">
                        Success Panel
                      </Badge>
                    </div>
                  </ResizablePanel>
                  <ResizableHandle withHandle />
                  <ResizablePanel defaultSize={40} className="bg-warning/5">
                    <div className="flex h-full items-center justify-center">
                      <Badge className="bg-warning text-warning-foreground">
                        Warning Panel
                      </Badge>
                    </div>
                  </ResizablePanel>
                </ResizablePanelGroup>
              </div>
            </div>

            {/* Three Panel Layout */}
            <div>
              <h4 className="mb-2 font-medium">Three Panel Layout</h4>
              <div className="h-32">
                <ResizablePanelGroup
                  direction="horizontal"
                  className="rounded-lg border"
                >
                  <ResizablePanel defaultSize={25} className="bg-info/5">
                    <div className="flex h-full items-center justify-center">
                      <Badge className="bg-info text-info-foreground">
                        Info
                      </Badge>
                    </div>
                  </ResizablePanel>
                  <ResizableHandle withHandle />
                  <ResizablePanel defaultSize={50} className="bg-accent/5">
                    <div className="flex h-full items-center justify-center">
                      <Badge className="bg-accent text-accent-foreground">
                        Accent
                      </Badge>
                    </div>
                  </ResizablePanel>
                  <ResizableHandle withHandle />
                  <ResizablePanel defaultSize={25} className="bg-discovery/5">
                    <div className="flex h-full items-center justify-center">
                      <Badge className="bg-discovery text-discovery-foreground">
                        Discovery
                      </Badge>
                    </div>
                  </ResizablePanel>
                </ResizablePanelGroup>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Nested Layouts */}
        <Card>
          <CardHeader>
            <CardTitle>Nested Resizable Layouts</CardTitle>
            <CardDescription>
              Complex nested panel structures with semantic color theming
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="h-64">
              <ResizablePanelGroup
                direction="horizontal"
                className="rounded-lg border"
              >
                <ResizablePanel defaultSize={30} className="bg-neutral/5">
                  <div className="h-full p-4">
                    <h4 className="text-neutral-foreground mb-2 font-medium">
                      Sidebar
                    </h4>
                    <div className="space-y-2">
                      <Button
                        variant="ghost"
                        size="sm"
                        className="w-full justify-start"
                      >
                        <Home className="mr-2 h-4 w-4" />
                        Dashboard
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="w-full justify-start"
                      >
                        <Users className="mr-2 h-4 w-4" />
                        Users
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="w-full justify-start"
                      >
                        <Settings className="mr-2 h-4 w-4" />
                        Settings
                      </Button>
                    </div>
                  </div>
                </ResizablePanel>

                <ResizableHandle withHandle />

                <ResizablePanel defaultSize={70}>
                  <ResizablePanelGroup direction="vertical">
                    <ResizablePanel defaultSize={60} className="bg-surface/5">
                      <div className="h-full p-4">
                        <h4 className="mb-2 font-medium">Main Content</h4>
                        <div className="bg-background border-border flex h-full items-center justify-center rounded border-2 border-dashed">
                          <div className="text-center">
                            <Eye className="text-muted-foreground mx-auto mb-2 h-8 w-8" />
                            <p className="text-muted-foreground text-sm">
                              Content Area
                            </p>
                          </div>
                        </div>
                      </div>
                    </ResizablePanel>

                    <ResizableHandle withHandle />

                    <ResizablePanel defaultSize={40} className="bg-muted/50">
                      <div className="h-full p-4">
                        <h4 className="mb-2 font-medium">Properties</h4>
                        <div className="space-y-2">
                          <div className="flex items-center justify-between">
                            <span className="text-sm">Width</span>
                            <Badge variant="outline">100%</Badge>
                          </div>
                          <div className="flex items-center justify-between">
                            <span className="text-sm">Height</span>
                            <Badge variant="outline">auto</Badge>
                          </div>
                          <div className="flex items-center justify-between">
                            <span className="text-sm">Position</span>
                            <Badge variant="outline">relative</Badge>
                          </div>
                        </div>
                      </div>
                    </ResizablePanel>
                  </ResizablePanelGroup>
                </ResizablePanel>
              </ResizablePanelGroup>
            </div>
          </CardContent>
        </Card>

        {/* Design Tokens */}
        <Card>
          <CardHeader>
            <CardTitle>CoreLive Resizable Design Tokens</CardTitle>
            <CardDescription>
              Design system tokens used in resizable components
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 gap-6 text-sm md:grid-cols-2 lg:grid-cols-3">
              <div className="space-y-3">
                <h4 className="font-medium">Handle Styling</h4>
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <Badge variant="outline">--border</Badge>
                    <span className="text-muted-foreground">Handle color</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge variant="outline">w-px</Badge>
                    <span className="text-muted-foreground">Handle width</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge variant="outline">--ring</Badge>
                    <span className="text-muted-foreground">
                      Focus ring color
                    </span>
                  </div>
                </div>
              </div>

              <div className="space-y-3">
                <h4 className="font-medium">Panel Backgrounds</h4>
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <Badge variant="outline">--background</Badge>
                    <span className="text-muted-foreground">
                      Default panel background
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge variant="outline">--muted</Badge>
                    <span className="text-muted-foreground">
                      Secondary panel background
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge variant="outline">--surface</Badge>
                    <span className="text-muted-foreground">
                      Elevated panel background
                    </span>
                  </div>
                </div>
              </div>

              <div className="space-y-3">
                <h4 className="font-medium">Interactive States</h4>
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <Badge variant="outline">hover:opacity-90</Badge>
                    <span className="text-muted-foreground">Hover state</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge variant="outline">focus-visible:ring-1</Badge>
                    <span className="text-muted-foreground">Focus state</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge variant="outline">cursor-col-resize</Badge>
                    <span className="text-muted-foreground">Resize cursor</span>
                  </div>
                </div>
              </div>
            </div>

            <Separator className="my-6" />

            <div className="space-y-4">
              <h4 className="font-medium">Layout Properties</h4>
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <h5 className="text-sm font-medium">Panel Group</h5>
                  <div className="space-y-1 text-xs">
                    <div>
                      <code className="bg-muted rounded px-1">
                        display: flex
                      </code>
                    </div>
                    <div>
                      <code className="bg-muted rounded px-1">
                        height: 100%
                      </code>
                    </div>
                    <div>
                      <code className="bg-muted rounded px-1">width: 100%</code>
                    </div>
                    <div>
                      <code className="bg-muted rounded px-1">
                        flex-direction: row | column
                      </code>
                    </div>
                  </div>
                </div>
                <div className="space-y-2">
                  <h5 className="text-sm font-medium">Resize Handle</h5>
                  <div className="space-y-1 text-xs">
                    <div>
                      <code className="bg-muted rounded px-1">
                        position: relative
                      </code>
                    </div>
                    <div>
                      <code className="bg-muted rounded px-1">
                        background: var(--border)
                      </code>
                    </div>
                    <div>
                      <code className="bg-muted rounded px-1">
                        width: 1px (horizontal)
                      </code>
                    </div>
                    <div>
                      <code className="bg-muted rounded px-1">
                        height: 1px (vertical)
                      </code>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <div className="bg-muted mt-6 rounded-lg p-4">
              <div className="mb-2 flex items-center gap-2">
                <Activity className="h-4 w-4" />
                <span className="text-sm font-medium">
                  Accessibility Features
                </span>
              </div>
              <p className="text-muted-foreground text-sm">
                Resizable panels include keyboard navigation support, focus
                management, and proper ARIA labels. Handles can be operated with
                keyboard using arrow keys, and all interactions respect user
                motion preferences.
              </p>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  ),
}
