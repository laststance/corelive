import type { Meta, StoryObj } from '@storybook/react'
import {
  User,
  Settings,
  Bell,
  Shield,
  CreditCard,
  BarChart3,
  FileText,
  Users,
  Activity,
  TrendingUp,
} from 'lucide-react'

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
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Progress } from '@/components/ui/progress'
import { Separator } from '@/components/ui/separator'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'

const meta: Meta<typeof Tabs> = {
  title: 'CoreLive Design System/Components/Tabs',
  component: Tabs,
  parameters: {
    layout: 'centered',
    docs: {
      description: {
        component:
          'A set of layered sections of content—known as tab panels—that are displayed one at a time. Uses CoreLive Design System tokens for consistent styling and focus states.',
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
    <Tabs defaultValue="account" className="w-[400px]">
      <TabsList className="grid w-full grid-cols-2">
        <TabsTrigger value="account">Account</TabsTrigger>
        <TabsTrigger value="password">Password</TabsTrigger>
      </TabsList>
      <TabsContent value="account">
        <Card>
          <CardHeader>
            <CardTitle>Account</CardTitle>
            <CardDescription>
              Make changes to your account here. Click save when you're done.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            <div className="space-y-1">
              <Label htmlFor="name">Name</Label>
              <Input id="name" defaultValue="Pedro Duarte" />
            </div>
            <div className="space-y-1">
              <Label htmlFor="username">Username</Label>
              <Input id="username" defaultValue="@peduarte" />
            </div>
          </CardContent>
        </Card>
      </TabsContent>
      <TabsContent value="password">
        <Card>
          <CardHeader>
            <CardTitle>Password</CardTitle>
            <CardDescription>
              Change your password here. After saving, you'll be logged out.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            <div className="space-y-1">
              <Label htmlFor="current">Current password</Label>
              <Input id="current" type="password" />
            </div>
            <div className="space-y-1">
              <Label htmlFor="new">New password</Label>
              <Input id="new" type="password" />
            </div>
          </CardContent>
        </Card>
      </TabsContent>
    </Tabs>
  ),
}

export const WithIcons: Story = {
  args: {},
  render: () => (
    <Tabs defaultValue="profile" className="w-[500px]">
      <TabsList className="grid w-full grid-cols-4">
        <TabsTrigger value="profile" className="flex items-center gap-2">
          <User className="h-4 w-4" />
          Profile
        </TabsTrigger>
        <TabsTrigger value="settings" className="flex items-center gap-2">
          <Settings className="h-4 w-4" />
          Settings
        </TabsTrigger>
        <TabsTrigger value="notifications" className="flex items-center gap-2">
          <Bell className="h-4 w-4" />
          Notifications
        </TabsTrigger>
        <TabsTrigger value="security" className="flex items-center gap-2">
          <Shield className="h-4 w-4" />
          Security
        </TabsTrigger>
      </TabsList>

      <TabsContent value="profile" className="mt-4">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <User className="h-5 w-5" />
              Profile Information
            </CardTitle>
            <CardDescription>Update your profile details</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center gap-4">
              <Avatar className="h-16 w-16">
                <AvatarImage src="https://images.unsplash.com/photo-1472099645785-5658abf4ff4e?w=150" />
                <AvatarFallback>JD</AvatarFallback>
              </Avatar>
              <div>
                <Button variant="outline" size="sm">
                  Change Photo
                </Button>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="first-name">First name</Label>
                <Input id="first-name" defaultValue="John" />
              </div>
              <div className="space-y-2">
                <Label htmlFor="last-name">Last name</Label>
                <Input id="last-name" defaultValue="Doe" />
              </div>
            </div>
          </CardContent>
        </Card>
      </TabsContent>

      <TabsContent value="settings" className="mt-4">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Settings className="h-5 w-5" />
              General Settings
            </CardTitle>
            <CardDescription>Configure your preferences</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <Label>Dark Mode</Label>
                <p className="text-muted-foreground text-sm">
                  Enable dark theme
                </p>
              </div>
              <Badge variant="secondary">Auto</Badge>
            </div>
            <Separator />
            <div className="flex items-center justify-between">
              <div>
                <Label>Language</Label>
                <p className="text-muted-foreground text-sm">
                  Interface language
                </p>
              </div>
              <Badge variant="outline">English</Badge>
            </div>
          </CardContent>
        </Card>
      </TabsContent>

      <TabsContent value="notifications" className="mt-4">
        <Card>
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
            <div className="flex items-center justify-between">
              <div>
                <Label>Email Notifications</Label>
                <p className="text-muted-foreground text-sm">
                  Receive updates via email
                </p>
              </div>
              <Badge className="bg-success text-white">Enabled</Badge>
            </div>
            <div className="flex items-center justify-between">
              <div>
                <Label>Push Notifications</Label>
                <p className="text-muted-foreground text-sm">
                  Browser notifications
                </p>
              </div>
              <Badge variant="destructive">Disabled</Badge>
            </div>
          </CardContent>
        </Card>
      </TabsContent>

      <TabsContent value="security" className="mt-4">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Shield className="h-5 w-5" />
              Security Settings
            </CardTitle>
            <CardDescription>Manage your account security</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <Label>Two-Factor Authentication</Label>
                <p className="text-muted-foreground text-sm">
                  Add an extra layer of security
                </p>
              </div>
              <Button variant="outline" size="sm">
                Enable
              </Button>
            </div>
            <Separator />
            <div className="flex items-center justify-between">
              <div>
                <Label>Login Sessions</Label>
                <p className="text-muted-foreground text-sm">
                  3 active sessions
                </p>
              </div>
              <Button variant="outline" size="sm">
                Manage
              </Button>
            </div>
          </CardContent>
        </Card>
      </TabsContent>
    </Tabs>
  ),
}

export const Dashboard: Story = {
  args: {},
  render: () => (
    <Tabs defaultValue="overview" className="w-full max-w-4xl">
      <TabsList className="grid w-full grid-cols-5">
        <TabsTrigger value="overview" className="flex items-center gap-2">
          <BarChart3 className="h-4 w-4" />
          Overview
        </TabsTrigger>
        <TabsTrigger value="analytics" className="flex items-center gap-2">
          <Activity className="h-4 w-4" />
          Analytics
        </TabsTrigger>
        <TabsTrigger value="reports" className="flex items-center gap-2">
          <FileText className="h-4 w-4" />
          Reports
        </TabsTrigger>
        <TabsTrigger value="team" className="flex items-center gap-2">
          <Users className="h-4 w-4" />
          Team
        </TabsTrigger>
        <TabsTrigger value="billing" className="flex items-center gap-2">
          <CreditCard className="h-4 w-4" />
          Billing
        </TabsTrigger>
      </TabsList>

      <TabsContent value="overview" className="mt-6">
        <div className="grid gap-6">
          <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
            <Card>
              <CardContent className="pt-6">
                <div className="text-center">
                  <div className="text-primary text-3xl font-bold">12.5k</div>
                  <p className="text-muted-foreground text-sm">Total Users</p>
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-6">
                <div className="text-center">
                  <div className="text-success text-3xl font-bold">+23%</div>
                  <p className="text-muted-foreground text-sm">Growth</p>
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-6">
                <div className="text-center">
                  <div className="text-warning text-3xl font-bold">$45.2k</div>
                  <p className="text-muted-foreground text-sm">Revenue</p>
                </div>
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader>
              <CardTitle>Recent Activity</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                <div className="flex items-center gap-3">
                  <div className="bg-primary h-2 w-2 rounded-full"></div>
                  <span className="text-sm">New user registration</span>
                  <Badge variant="secondary">2 min ago</Badge>
                </div>
                <div className="flex items-center gap-3">
                  <div className="bg-success h-2 w-2 rounded-full"></div>
                  <span className="text-sm">Payment received</span>
                  <Badge variant="secondary">5 min ago</Badge>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </TabsContent>

      <TabsContent value="analytics" className="mt-6">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <TrendingUp className="h-5 w-5" />
              Analytics Dashboard
            </CardTitle>
            <CardDescription>Detailed performance metrics</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <div>
                <div className="mb-2 flex justify-between text-sm">
                  <span>Page Views</span>
                  <span>75%</span>
                </div>
                <Progress value={75} className="h-2" />
              </div>
              <div>
                <div className="mb-2 flex justify-between text-sm">
                  <span>Conversions</span>
                  <span>45%</span>
                </div>
                <Progress value={45} className="h-2" />
              </div>
              <div>
                <div className="mb-2 flex justify-between text-sm">
                  <span>User Engagement</span>
                  <span>80%</span>
                </div>
                <Progress value={80} className="h-2" />
              </div>
            </div>
          </CardContent>
        </Card>
      </TabsContent>

      <TabsContent value="reports" className="mt-6">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <FileText className="h-5 w-5" />
              Generate Reports
            </CardTitle>
            <CardDescription>
              Create custom reports for your data
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="text-muted-foreground py-12 text-center">
              <FileText className="mx-auto mb-4 h-12 w-12 opacity-50" />
              <p className="mb-2 text-lg font-medium">No Reports Generated</p>
              <p className="mb-4">Start by creating your first report</p>
              <Button>Create Report</Button>
            </div>
          </CardContent>
        </Card>
      </TabsContent>

      <TabsContent value="team" className="mt-6">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Users className="h-5 w-5" />
              Team Members
            </CardTitle>
            <CardDescription>Manage your team and permissions</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {[
                { name: 'John Doe', role: 'Admin', status: 'Active' },
                { name: 'Jane Smith', role: 'Editor', status: 'Active' },
                { name: 'Bob Johnson', role: 'Viewer', status: 'Inactive' },
              ].map((member, index) => (
                <div
                  key={index}
                  className="flex items-center justify-between rounded-lg border p-3"
                >
                  <div className="flex items-center gap-3">
                    <Avatar>
                      <AvatarFallback>
                        {member.name
                          .split(' ')
                          .map((n) => n[0])
                          .join('')}
                      </AvatarFallback>
                    </Avatar>
                    <div>
                      <p className="font-medium">{member.name}</p>
                      <p className="text-muted-foreground text-sm">
                        {member.role}
                      </p>
                    </div>
                  </div>
                  <Badge
                    variant={
                      member.status === 'Active' ? 'default' : 'secondary'
                    }
                  >
                    {member.status}
                  </Badge>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </TabsContent>

      <TabsContent value="billing" className="mt-6">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <CreditCard className="h-5 w-5" />
              Billing Information
            </CardTitle>
            <CardDescription>
              Manage your subscription and billing
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <div className="flex items-center justify-between rounded-lg border p-4">
                <div>
                  <p className="font-medium">Pro Plan</p>
                  <p className="text-muted-foreground text-sm">$29/month</p>
                </div>
                <Badge className="bg-success text-white">Active</Badge>
              </div>
              <div className="py-8 text-center">
                <Button>Manage Subscription</Button>
              </div>
            </div>
          </CardContent>
        </Card>
      </TabsContent>
    </Tabs>
  ),
  parameters: {
    layout: 'padded',
  },
}

export const Vertical: Story = {
  args: {},
  render: () => (
    <Tabs
      defaultValue="general"
      orientation="vertical"
      className="flex w-[600px] gap-4"
    >
      <TabsList className="flex h-fit w-[200px] flex-col">
        <TabsTrigger value="general" className="w-full justify-start">
          <Settings className="mr-2 h-4 w-4" />
          General
        </TabsTrigger>
        <TabsTrigger value="account" className="w-full justify-start">
          <User className="mr-2 h-4 w-4" />
          Account
        </TabsTrigger>
        <TabsTrigger value="notifications" className="w-full justify-start">
          <Bell className="mr-2 h-4 w-4" />
          Notifications
        </TabsTrigger>
        <TabsTrigger value="privacy" className="w-full justify-start">
          <Shield className="mr-2 h-4 w-4" />
          Privacy
        </TabsTrigger>
      </TabsList>

      <div className="flex-1">
        <TabsContent value="general">
          <Card>
            <CardHeader>
              <CardTitle>General Settings</CardTitle>
            </CardHeader>
            <CardContent>
              <p>Configure general application settings.</p>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="account">
          <Card>
            <CardHeader>
              <CardTitle>Account Settings</CardTitle>
            </CardHeader>
            <CardContent>
              <p>Manage your account information.</p>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="notifications">
          <Card>
            <CardHeader>
              <CardTitle>Notification Settings</CardTitle>
            </CardHeader>
            <CardContent>
              <p>Control how you receive notifications.</p>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="privacy">
          <Card>
            <CardHeader>
              <CardTitle>Privacy Settings</CardTitle>
            </CardHeader>
            <CardContent>
              <p>Manage your privacy preferences.</p>
            </CardContent>
          </Card>
        </TabsContent>
      </div>
    </Tabs>
  ),
}

export const CoreLiveThemeShowcase: Story = {
  args: {},
  render: () => (
    <div className="w-full max-w-3xl space-y-6">
      <div>
        <h3 className="text-heading-3 mb-4 font-medium">Tab States</h3>
        <Tabs defaultValue="active" className="w-full">
          <TabsList
            style={{
              backgroundColor: 'var(--component-tabs-background)',
              borderColor: 'var(--component-tabs-border)',
            }}
          >
            <TabsTrigger
              value="active"
              style={{
                color: 'var(--component-tabs-active-text)',
                backgroundColor: 'var(--component-tabs-active-background)',
              }}
            >
              Active Tab
            </TabsTrigger>
            <TabsTrigger
              value="inactive"
              style={{
                color: 'var(--component-tabs-inactive-text)',
              }}
            >
              Inactive Tab
            </TabsTrigger>
            <TabsTrigger value="disabled" disabled>
              Disabled Tab
            </TabsTrigger>
          </TabsList>
          <TabsContent value="active" className="mt-4">
            <Card>
              <CardContent className="pt-6">
                <p>Active tab content using CoreLive Design System tokens.</p>
              </CardContent>
            </Card>
          </TabsContent>
          <TabsContent value="inactive" className="mt-4">
            <Card>
              <CardContent className="pt-6">
                <p>Inactive tab content.</p>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>

      <div>
        <h3 className="text-heading-3 mb-4 font-medium">Semantic Color Tabs</h3>
        <Tabs defaultValue="success" className="w-full">
          <TabsList>
            <TabsTrigger
              value="success"
              className="data-[state=active]:bg-success data-[state=active]:text-white"
            >
              Success
            </TabsTrigger>
            <TabsTrigger
              value="warning"
              className="data-[state=active]:bg-warning data-[state=active]:text-black"
            >
              Warning
            </TabsTrigger>
            <TabsTrigger
              value="danger"
              className="data-[state=active]:bg-danger data-[state=active]:text-white"
            >
              Danger
            </TabsTrigger>
            <TabsTrigger
              value="info"
              className="data-[state=active]:bg-info data-[state=active]:text-white"
            >
              Info
            </TabsTrigger>
          </TabsList>
          <TabsContent value="success" className="mt-4">
            <Card className="border-success/20 bg-success/5">
              <CardContent className="pt-6">
                <div className="flex items-center gap-2">
                  <div className="bg-success h-2 w-2 rounded-full"></div>
                  <p className="text-success">Success state content</p>
                </div>
              </CardContent>
            </Card>
          </TabsContent>
          <TabsContent value="warning" className="mt-4">
            <Card className="border-warning/20 bg-warning/5">
              <CardContent className="pt-6">
                <div className="flex items-center gap-2">
                  <div className="bg-warning h-2 w-2 rounded-full"></div>
                  <p className="text-warning">Warning state content</p>
                </div>
              </CardContent>
            </Card>
          </TabsContent>
          <TabsContent value="danger" className="mt-4">
            <Card className="border-danger/20 bg-danger/5">
              <CardContent className="pt-6">
                <div className="flex items-center gap-2">
                  <div className="bg-danger h-2 w-2 rounded-full"></div>
                  <p className="text-danger">Danger state content</p>
                </div>
              </CardContent>
            </Card>
          </TabsContent>
          <TabsContent value="info" className="mt-4">
            <Card className="border-info/20 bg-info/5">
              <CardContent className="pt-6">
                <div className="flex items-center gap-2">
                  <div className="bg-info h-2 w-2 rounded-full"></div>
                  <p className="text-info">Info state content</p>
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>

      <div>
        <h3 className="text-heading-3 mb-4 font-medium">
          Component Token Usage
        </h3>
        <div className="space-y-4">
          <div
            className="flex border-b"
            style={{
              borderColor: 'var(--component-tabs-border)',
            }}
          >
            <button
              className="border-b-2 px-4 py-2 font-medium transition-colors"
              style={{
                borderColor: 'var(--system-color-primary)',
                color: 'var(--system-color-primary)',
                backgroundColor: 'var(--component-tabs-active-background)',
              }}
            >
              Custom Tab 1
            </button>
            <button
              className="hover:text-foreground border-b-2 border-transparent px-4 py-2 font-medium transition-colors"
              style={{
                color: 'var(--component-tabs-inactive-text)',
              }}
            >
              Custom Tab 2
            </button>
          </div>
          <Card>
            <CardContent className="pt-6">
              <p className="text-muted-foreground text-sm">
                Custom tab implementation using CoreLive component tokens
                directly.
              </p>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  ),
  parameters: {
    layout: 'padded',
    docs: {
      description: {
        story:
          'Comprehensive showcase of tab variations using CoreLive Design System tokens for consistent styling across different states and themes.',
      },
    },
  },
}
