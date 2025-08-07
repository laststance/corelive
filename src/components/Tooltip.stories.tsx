import type { Meta, StoryObj } from '@storybook/react'
import {
  Info,
  HelpCircle,
  Settings,
  User,
  Copy,
  Check,
  Trash2,
  Download,
  Share,
  Edit,
  Eye,
  Lock,
  Heart,
  MessageSquare,
  Calendar,
  Clock,
  MapPin,
  AlertCircle,
  CheckCircle,
  XCircle,
  Wifi,
  Battery,
  Volume2,
  Save,
  Search,
  Menu,
  ChevronRight,
  Users,
} from 'lucide-react'
import { useState } from 'react'

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
import { Progress } from '@/components/ui/progress'
import { Separator } from '@/components/ui/separator'
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip'

const meta: Meta<typeof Tooltip> = {
  title: 'CoreLive Design System/Components/Tooltip',
  component: Tooltip,
  parameters: {
    layout: 'centered',
    docs: {
      description: {
        component:
          'A popup that displays information related to an element when the element receives keyboard focus or the mouse hovers over it. Built with accessibility and styled with CoreLive Design System tokens.',
      },
    },
  },
  tags: ['autodocs'],
  decorators: [
    (Story: any) => (
      <TooltipProvider>
        <Story />
      </TooltipProvider>
    ),
  ],
}

export default meta
type Story = StoryObj<typeof meta>

export const Default: Story = {
  args: {},
  render: () => (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button variant="outline">Hover me</Button>
      </TooltipTrigger>
      <TooltipContent>
        <p>This is a tooltip</p>
      </TooltipContent>
    </Tooltip>
  ),
}

export const Positions: Story = {
  args: {},
  render: () => (
    <div className="grid grid-cols-2 gap-8 p-20">
      <div className="flex flex-col items-center gap-2">
        <Tooltip>
          <TooltipTrigger asChild>
            <Button variant="outline" size="sm">
              Top
            </Button>
          </TooltipTrigger>
          <TooltipContent side="top">
            <p>Tooltip on top</p>
          </TooltipContent>
        </Tooltip>
      </div>

      <div className="flex flex-col items-center gap-2">
        <Tooltip>
          <TooltipTrigger asChild>
            <Button variant="outline" size="sm">
              Right
            </Button>
          </TooltipTrigger>
          <TooltipContent side="right">
            <p>Tooltip on right</p>
          </TooltipContent>
        </Tooltip>
      </div>

      <div className="flex flex-col items-center gap-2">
        <Tooltip>
          <TooltipTrigger asChild>
            <Button variant="outline" size="sm">
              Bottom
            </Button>
          </TooltipTrigger>
          <TooltipContent side="bottom">
            <p>Tooltip on bottom</p>
          </TooltipContent>
        </Tooltip>
      </div>

      <div className="flex flex-col items-center gap-2">
        <Tooltip>
          <TooltipTrigger asChild>
            <Button variant="outline" size="sm">
              Left
            </Button>
          </TooltipTrigger>
          <TooltipContent side="left">
            <p>Tooltip on left</p>
          </TooltipContent>
        </Tooltip>
      </div>
    </div>
  ),
}

export const IconButtons: Story = {
  args: {},
  render: () => (
    <div className="flex gap-2">
      <Tooltip>
        <TooltipTrigger asChild>
          <Button variant="ghost" size="icon">
            <Settings className="h-4 w-4" />
          </Button>
        </TooltipTrigger>
        <TooltipContent>
          <p>Settings</p>
        </TooltipContent>
      </Tooltip>

      <Tooltip>
        <TooltipTrigger asChild>
          <Button variant="ghost" size="icon">
            <User className="h-4 w-4" />
          </Button>
        </TooltipTrigger>
        <TooltipContent>
          <p>Profile</p>
        </TooltipContent>
      </Tooltip>

      <Tooltip>
        <TooltipTrigger asChild>
          <Button variant="ghost" size="icon">
            <Search className="h-4 w-4" />
          </Button>
        </TooltipTrigger>
        <TooltipContent>
          <p>Search</p>
        </TooltipContent>
      </Tooltip>

      <Tooltip>
        <TooltipTrigger asChild>
          <Button variant="ghost" size="icon">
            <Menu className="h-4 w-4" />
          </Button>
        </TooltipTrigger>
        <TooltipContent>
          <p>Menu</p>
        </TooltipContent>
      </Tooltip>
    </div>
  ),
}

export const WithKeyboardShortcut: Story = {
  args: {},
  render: () => (
    <div className="flex gap-2">
      <Tooltip>
        <TooltipTrigger asChild>
          <Button variant="outline" size="icon">
            <Copy className="h-4 w-4" />
          </Button>
        </TooltipTrigger>
        <TooltipContent>
          <p className="flex items-center gap-2">
            Copy
            <kbd className="bg-muted text-muted-foreground pointer-events-none inline-flex h-5 items-center gap-1 rounded border px-1.5 font-mono text-[10px] font-medium opacity-100 select-none">
              <span className="text-xs">⌘</span>C
            </kbd>
          </p>
        </TooltipContent>
      </Tooltip>

      <Tooltip>
        <TooltipTrigger asChild>
          <Button variant="outline" size="icon">
            <Save className="h-4 w-4" />
          </Button>
        </TooltipTrigger>
        <TooltipContent>
          <p className="flex items-center gap-2">
            Save
            <kbd className="bg-muted text-muted-foreground pointer-events-none inline-flex h-5 items-center gap-1 rounded border px-1.5 font-mono text-[10px] font-medium opacity-100 select-none">
              <span className="text-xs">⌘</span>S
            </kbd>
          </p>
        </TooltipContent>
      </Tooltip>

      <Tooltip>
        <TooltipTrigger asChild>
          <Button variant="outline" size="icon">
            <Search className="h-4 w-4" />
          </Button>
        </TooltipTrigger>
        <TooltipContent>
          <p className="flex items-center gap-2">
            Search
            <kbd className="bg-muted text-muted-foreground pointer-events-none inline-flex h-5 items-center gap-1 rounded border px-1.5 font-mono text-[10px] font-medium opacity-100 select-none">
              <span className="text-xs">⌘</span>K
            </kbd>
          </p>
        </TooltipContent>
      </Tooltip>
    </div>
  ),
}

export const RichContent: Story = {
  args: {},
  render: () => (
    <div className="flex gap-4">
      <Tooltip>
        <TooltipTrigger asChild>
          <Avatar className="cursor-pointer">
            <AvatarImage src="/placeholder.svg" />
            <AvatarFallback>JD</AvatarFallback>
          </Avatar>
        </TooltipTrigger>
        <TooltipContent>
          <div className="flex items-center gap-3">
            <Avatar className="h-10 w-10">
              <AvatarImage src="/placeholder.svg" />
              <AvatarFallback>JD</AvatarFallback>
            </Avatar>
            <div>
              <p className="font-medium">John Doe</p>
              <p className="text-muted-foreground text-sm">
                john.doe@example.com
              </p>
              <div className="mt-1 flex items-center gap-1">
                <Badge variant="secondary" className="text-xs">
                  Pro User
                </Badge>
                <Badge variant="outline" className="text-xs">
                  Admin
                </Badge>
              </div>
            </div>
          </div>
        </TooltipContent>
      </Tooltip>

      <Tooltip>
        <TooltipTrigger asChild>
          <Button variant="outline" size="sm">
            <Wifi className="mr-2 h-4 w-4" />
            Connected
          </Button>
        </TooltipTrigger>
        <TooltipContent>
          <div className="space-y-2">
            <p className="font-medium">Network Status</p>
            <div className="space-y-1 text-sm">
              <div className="flex items-center justify-between gap-8">
                <span className="text-muted-foreground">Signal:</span>
                <span className="font-medium">Excellent</span>
              </div>
              <div className="flex items-center justify-between gap-8">
                <span className="text-muted-foreground">Speed:</span>
                <span className="font-medium">150 Mbps</span>
              </div>
              <div className="flex items-center justify-between gap-8">
                <span className="text-muted-foreground">Ping:</span>
                <span className="font-medium">12ms</span>
              </div>
            </div>
            <Progress value={85} className="h-1.5" />
          </div>
        </TooltipContent>
      </Tooltip>
    </div>
  ),
}

export const StatusTooltips: Story = {
  args: {},
  render: () => (
    <div className="flex gap-2">
      <Tooltip>
        <TooltipTrigger asChild>
          <div className="border-success/20 bg-success/5 flex cursor-help items-center gap-2 rounded-lg border p-2">
            <CheckCircle className="text-success h-4 w-4" />
            <span className="text-sm font-medium">Active</span>
          </div>
        </TooltipTrigger>
        <TooltipContent>
          <p>System is operational</p>
        </TooltipContent>
      </Tooltip>

      <Tooltip>
        <TooltipTrigger asChild>
          <div className="border-warning/20 bg-warning/5 flex cursor-help items-center gap-2 rounded-lg border p-2">
            <AlertCircle className="text-warning h-4 w-4" />
            <span className="text-sm font-medium">Warning</span>
          </div>
        </TooltipTrigger>
        <TooltipContent>
          <p>Performance degradation detected</p>
        </TooltipContent>
      </Tooltip>

      <Tooltip>
        <TooltipTrigger asChild>
          <div className="border-danger/20 bg-danger/5 flex cursor-help items-center gap-2 rounded-lg border p-2">
            <XCircle className="text-danger h-4 w-4" />
            <span className="text-sm font-medium">Error</span>
          </div>
        </TooltipTrigger>
        <TooltipContent>
          <p>Service unavailable</p>
        </TooltipContent>
      </Tooltip>
    </div>
  ),
}

export const FormFieldTooltips: Story = {
  args: {},
  render: () => (
    <Card className="w-[400px]">
      <CardHeader>
        <CardTitle>Account Settings</CardTitle>
        <CardDescription>Manage your account preferences</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          <div>
            <label className="flex items-center gap-2 text-sm font-medium">
              Username
              <Tooltip>
                <TooltipTrigger asChild>
                  <HelpCircle className="text-muted-foreground h-3 w-3 cursor-help" />
                </TooltipTrigger>
                <TooltipContent>
                  <p className="max-w-xs">
                    Your username is unique and cannot be changed after account
                    creation
                  </p>
                </TooltipContent>
              </Tooltip>
            </label>
            <input
              type="text"
              className="mt-1 w-full rounded-md border px-3 py-2 text-sm"
              placeholder="johndoe"
              disabled
            />
          </div>

          <div>
            <label className="flex items-center gap-2 text-sm font-medium">
              API Key
              <Tooltip>
                <TooltipTrigger asChild>
                  <Info className="text-muted-foreground h-3 w-3 cursor-help" />
                </TooltipTrigger>
                <TooltipContent>
                  <div className="max-w-xs space-y-2">
                    <p className="font-medium">API Key Usage</p>
                    <p className="text-sm">
                      Use this key to authenticate API requests
                    </p>
                    <p className="text-warning text-sm">
                      Keep this key secret!
                    </p>
                  </div>
                </TooltipContent>
              </Tooltip>
            </label>
            <div className="mt-1 flex gap-2">
              <input
                type="password"
                className="flex-1 rounded-md border px-3 py-2 text-sm"
                value="sk_test_abc123xyz789"
                readOnly
              />
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button size="sm" variant="outline">
                    <Copy className="h-4 w-4" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>
                  <p>Copy API key</p>
                </TooltipContent>
              </Tooltip>
            </div>
          </div>

          <div>
            <label className="flex items-center gap-2 text-sm font-medium">
              Two-Factor Authentication
              <Tooltip>
                <TooltipTrigger asChild>
                  <Lock className="text-muted-foreground h-3 w-3 cursor-help" />
                </TooltipTrigger>
                <TooltipContent>
                  <p className="max-w-xs">
                    Enable 2FA for enhanced security. You'll need an
                    authenticator app.
                  </p>
                </TooltipContent>
              </Tooltip>
            </label>
            <div className="mt-1">
              <Button size="sm" variant="outline">
                Enable 2FA
              </Button>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  ),
}

export const TableActions: Story = {
  args: {},
  render: () => (
    <div className="w-full max-w-2xl">
      <Card>
        <CardHeader>
          <CardTitle>Recent Files</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-2">
            {[
              {
                name: 'project-proposal.pdf',
                size: '2.4 MB',
                modified: '2 hours ago',
              },
              {
                name: 'meeting-notes.docx',
                size: '156 KB',
                modified: '1 day ago',
              },
              {
                name: 'budget-2024.xlsx',
                size: '4.8 MB',
                modified: '3 days ago',
              },
            ].map((file, index) => (
              <div
                key={index}
                className="hover:bg-muted flex items-center justify-between rounded-lg p-3"
              >
                <div className="flex items-center gap-3">
                  <div className="text-sm">
                    <p className="font-medium">{file.name}</p>
                    <p className="text-muted-foreground">
                      {file.size} • {file.modified}
                    </p>
                  </div>
                </div>
                <div className="flex gap-1">
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button variant="ghost" size="icon" className="h-8 w-8">
                        <Download className="h-4 w-4" />
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent>
                      <p>Download</p>
                    </TooltipContent>
                  </Tooltip>

                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button variant="ghost" size="icon" className="h-8 w-8">
                        <Share className="h-4 w-4" />
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent>
                      <p>Share</p>
                    </TooltipContent>
                  </Tooltip>

                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button variant="ghost" size="icon" className="h-8 w-8">
                        <Edit className="h-4 w-4" />
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent>
                      <p>Rename</p>
                    </TooltipContent>
                  </Tooltip>

                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="text-danger hover:text-danger h-8 w-8"
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent>
                      <p>Delete</p>
                    </TooltipContent>
                  </Tooltip>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  ),
  parameters: {
    layout: 'padded',
  },
}

export const DelayedTooltip: Story = {
  args: {},
  render: () => (
    <div className="flex gap-4">
      <Tooltip delayDuration={0}>
        <TooltipTrigger asChild>
          <Button variant="outline">Instant (0ms)</Button>
        </TooltipTrigger>
        <TooltipContent>
          <p>No delay</p>
        </TooltipContent>
      </Tooltip>

      <Tooltip delayDuration={300}>
        <TooltipTrigger asChild>
          <Button variant="outline">Fast (300ms)</Button>
        </TooltipTrigger>
        <TooltipContent>
          <p>Short delay</p>
        </TooltipContent>
      </Tooltip>

      <Tooltip delayDuration={700}>
        <TooltipTrigger asChild>
          <Button variant="outline">Default (700ms)</Button>
        </TooltipTrigger>
        <TooltipContent>
          <p>Default delay</p>
        </TooltipContent>
      </Tooltip>

      <Tooltip delayDuration={1000}>
        <TooltipTrigger asChild>
          <Button variant="outline">Slow (1000ms)</Button>
        </TooltipTrigger>
        <TooltipContent>
          <p>Long delay</p>
        </TooltipContent>
      </Tooltip>
    </div>
  ),
}

export const StatusBar: Story = {
  args: {},
  render: () => {
    const [copied, setCopied] = useState(false)

    const handleCopy = () => {
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    }

    return (
      <div className="bg-muted/50 flex items-center gap-2 rounded-lg border p-2">
        <Tooltip>
          <TooltipTrigger asChild>
            <div className="hover:bg-muted flex cursor-pointer items-center gap-2 rounded px-2 py-1">
              <Wifi className="text-success h-4 w-4" />
              <span className="text-sm">Connected</span>
            </div>
          </TooltipTrigger>
          <TooltipContent>
            <p>Network: CoreLive-5G</p>
          </TooltipContent>
        </Tooltip>

        <Separator orientation="vertical" className="h-4" />

        <Tooltip>
          <TooltipTrigger asChild>
            <div className="hover:bg-muted flex cursor-pointer items-center gap-2 rounded px-2 py-1">
              <Battery className="h-4 w-4" />
              <span className="text-sm">85%</span>
            </div>
          </TooltipTrigger>
          <TooltipContent>
            <p>Battery: 3 hours remaining</p>
          </TooltipContent>
        </Tooltip>

        <Separator orientation="vertical" className="h-4" />

        <Tooltip>
          <TooltipTrigger asChild>
            <div className="hover:bg-muted flex cursor-pointer items-center gap-2 rounded px-2 py-1">
              <Volume2 className="h-4 w-4" />
              <span className="text-sm">75%</span>
            </div>
          </TooltipTrigger>
          <TooltipContent>
            <p>Volume: 75%</p>
          </TooltipContent>
        </Tooltip>

        <Separator orientation="vertical" className="h-4" />

        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="sm"
              className="h-7 px-2"
              onClick={handleCopy}
            >
              {copied ? (
                <Check className="text-success h-4 w-4" />
              ) : (
                <Copy className="h-4 w-4" />
              )}
            </Button>
          </TooltipTrigger>
          <TooltipContent>
            <p>{copied ? 'Copied!' : 'Copy system info'}</p>
          </TooltipContent>
        </Tooltip>
      </div>
    )
  },
}

export const CoreLiveThemeShowcase: Story = {
  args: {},
  render: () => (
    <div className="w-full max-w-2xl space-y-6">
      <div>
        <h3 className="text-heading-3 mb-4 font-medium">Tooltip Positions</h3>
        <div className="grid grid-cols-4 gap-4 p-8">
          {(['top', 'right', 'bottom', 'left'] as const).map((side) => (
            <Tooltip key={side}>
              <TooltipTrigger asChild>
                <Button variant="outline" size="sm" className="capitalize">
                  {side}
                </Button>
              </TooltipTrigger>
              <TooltipContent
                side={side}
                style={{
                  backgroundColor: 'var(--component-tooltip-background)',
                  color: 'var(--component-tooltip-text)',
                  borderColor: 'var(--component-tooltip-border)',
                }}
              >
                <p>{side} position</p>
              </TooltipContent>
            </Tooltip>
          ))}
        </div>
      </div>

      <div>
        <h3 className="text-heading-3 mb-4 font-medium">Semantic Tooltips</h3>
        <div className="grid grid-cols-2 gap-4">
          <Card className="border-success/20 bg-success/5">
            <CardContent className="pt-6">
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button className="bg-success hover:bg-success/90 w-full">
                    <CheckCircle className="mr-2 h-4 w-4" />
                    Success Action
                  </Button>
                </TooltipTrigger>
                <TooltipContent className="bg-success border-success text-white">
                  <p>Operation completed successfully</p>
                </TooltipContent>
              </Tooltip>
            </CardContent>
          </Card>

          <Card className="border-warning/20 bg-warning/5">
            <CardContent className="pt-6">
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button className="bg-warning hover:bg-warning/90 w-full">
                    <AlertCircle className="mr-2 h-4 w-4" />
                    Warning Action
                  </Button>
                </TooltipTrigger>
                <TooltipContent className="bg-warning border-warning text-white">
                  <p>This action requires caution</p>
                </TooltipContent>
              </Tooltip>
            </CardContent>
          </Card>

          <Card className="border-danger/20 bg-danger/5">
            <CardContent className="pt-6">
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button className="bg-danger hover:bg-danger/90 w-full">
                    <XCircle className="mr-2 h-4 w-4" />
                    Danger Action
                  </Button>
                </TooltipTrigger>
                <TooltipContent className="bg-danger border-danger text-white">
                  <p>This action cannot be undone</p>
                </TooltipContent>
              </Tooltip>
            </CardContent>
          </Card>

          <Card className="border-info/20 bg-info/5">
            <CardContent className="pt-6">
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button className="bg-info hover:bg-info/90 w-full">
                    <Info className="mr-2 h-4 w-4" />
                    Info Action
                  </Button>
                </TooltipTrigger>
                <TooltipContent className="bg-info border-info text-white">
                  <p>Additional information available</p>
                </TooltipContent>
              </Tooltip>
            </CardContent>
          </Card>
        </div>
      </div>

      <div>
        <h3 className="text-heading-3 mb-4 font-medium">
          Component Token Usage
        </h3>
        <Card>
          <CardContent className="pt-6">
            <div className="space-y-4">
              <Tooltip>
                <TooltipTrigger asChild>
                  <div
                    className="inline-flex cursor-pointer items-center justify-center rounded-md border px-4 py-2 text-sm font-medium"
                    style={{
                      backgroundColor: 'var(--component-button-background)',
                      borderColor: 'var(--component-button-border)',
                      color: 'var(--component-button-text)',
                    }}
                  >
                    Custom Styled Trigger
                  </div>
                </TooltipTrigger>
                <TooltipContent>
                  <div
                    className="rounded-md border p-3"
                    style={{
                      backgroundColor: 'var(--component-tooltip-background)',
                      color: 'var(--component-tooltip-text)',
                      borderColor: 'var(--component-tooltip-border)',
                      boxShadow: 'var(--component-tooltip-shadow)',
                    }}
                  >
                    <p className="mb-1 font-medium">Custom Tooltip</p>
                    <p className="text-sm opacity-90">
                      Using component design tokens
                    </p>
                  </div>
                </TooltipContent>
              </Tooltip>

              <div className="bg-muted rounded-md p-3">
                <code className="text-xs">
                  --component-tooltip-background
                  <br />
                  --component-tooltip-text
                  <br />
                  --component-tooltip-border
                  <br />
                  --component-tooltip-shadow
                </code>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      <div>
        <h3 className="text-heading-3 mb-4 font-medium">
          Interactive Elements
        </h3>
        <div className="flex items-center gap-4">
          <Tooltip>
            <TooltipTrigger asChild>
              <Button variant="ghost" size="icon">
                <Eye className="h-4 w-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>
              <p>View details</p>
            </TooltipContent>
          </Tooltip>

          <Tooltip>
            <TooltipTrigger asChild>
              <Button variant="ghost" size="icon">
                <Heart className="h-4 w-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>
              <p>Add to favorites</p>
            </TooltipContent>
          </Tooltip>

          <Tooltip>
            <TooltipTrigger asChild>
              <Button variant="ghost" size="icon">
                <MessageSquare className="h-4 w-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>
              <p>Leave a comment</p>
            </TooltipContent>
          </Tooltip>

          <Tooltip>
            <TooltipTrigger asChild>
              <Button variant="ghost" size="icon">
                <Share className="h-4 w-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>
              <p>Share with others</p>
            </TooltipContent>
          </Tooltip>
        </div>
      </div>

      <div>
        <h3 className="text-heading-3 mb-4 font-medium">Complex Content</h3>
        <Tooltip>
          <TooltipTrigger asChild>
            <Card className="hover:border-primary cursor-pointer transition-colors">
              <CardContent className="p-4">
                <div className="flex items-center gap-3">
                  <Calendar className="text-muted-foreground h-5 w-5" />
                  <div>
                    <p className="font-medium">Team Meeting</p>
                    <p className="text-muted-foreground text-sm">
                      Tomorrow at 2:00 PM
                    </p>
                  </div>
                  <ChevronRight className="text-muted-foreground ml-auto h-4 w-4" />
                </div>
              </CardContent>
            </Card>
          </TooltipTrigger>
          <TooltipContent className="overflow-hidden p-0">
            <div className="max-w-sm space-y-3 p-4">
              <div className="flex items-start gap-3">
                <Calendar className="text-primary mt-0.5 h-5 w-5" />
                <div className="space-y-1">
                  <p className="font-medium">Quarterly Planning Meeting</p>
                  <p className="text-muted-foreground text-sm">
                    Tomorrow, March 16 • 2:00 - 3:30 PM
                  </p>
                </div>
              </div>
              <Separator />
              <div className="space-y-2">
                <div className="flex items-center gap-2 text-sm">
                  <MapPin className="text-muted-foreground h-4 w-4" />
                  <span>Conference Room A</span>
                </div>
                <div className="flex items-center gap-2 text-sm">
                  <Users className="text-muted-foreground h-4 w-4" />
                  <span>8 attendees</span>
                </div>
                <div className="flex items-center gap-2 text-sm">
                  <Clock className="text-muted-foreground h-4 w-4" />
                  <span>90 minutes</span>
                </div>
              </div>
              <Separator />
              <div className="flex gap-2">
                <Button size="sm" className="flex-1">
                  Join Meeting
                </Button>
                <Button size="sm" variant="outline">
                  View Details
                </Button>
              </div>
            </div>
          </TooltipContent>
        </Tooltip>
      </div>
    </div>
  ),
  parameters: {
    layout: 'padded',
    docs: {
      description: {
        story:
          'Comprehensive showcase of tooltip variations using CoreLive Design System tokens for consistent styling across different contexts and use cases.',
      },
    },
  },
}
