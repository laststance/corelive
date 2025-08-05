import type { Meta, StoryObj } from '@storybook/react'
import {
  Settings,
  User,
  CreditCard,
  Bell,
  Shield,
  LogOut,
  Home,
  FileText,
  BarChart,
  Users,
  Calendar,
  Mail,
  MessageSquare,
  Heart,
  Share,
  Bookmark,
  ChevronRight,
  Star,
  Upload,
  Play,
  SkipBack,
  SkipForward,
  Volume2,
  Zap,
  CheckCircle,
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
import { Separator } from '@/components/ui/separator'

const meta: Meta<typeof Separator> = {
  title: 'CoreLive Design System/Components/Separator',
  component: Separator,
  parameters: {
    layout: 'centered',
    docs: {
      description: {
        component:
          'A visual divider component to separate content sections. Supports horizontal and vertical orientations with CoreLive Design System styling.',
      },
    },
  },
  tags: ['autodocs'],
  argTypes: {
    orientation: {
      control: 'radio',
      options: ['horizontal', 'vertical'],
      description: 'The orientation of the separator',
    },
    decorative: {
      control: 'boolean',
      description:
        'Whether the separator is purely decorative (affects accessibility)',
    },
  },
}

export default meta
type Story = StoryObj<typeof meta>

export const Default: Story = {
  args: {},
  render: () => (
    <div className="w-full max-w-md">
      <div className="space-y-1">
        <h4 className="text-sm leading-none font-medium">CoreLive UI</h4>
        <p className="text-muted-foreground text-sm">
          An open-source UI component library.
        </p>
      </div>
      <Separator className="my-4" />
      <div className="flex h-5 items-center space-x-4 text-sm">
        <div>Blog</div>
        <Separator orientation="vertical" />
        <div>Docs</div>
        <Separator orientation="vertical" />
        <div>Source</div>
      </div>
    </div>
  ),
}

export const WithText: Story = {
  args: {},
  render: () => (
    <div className="w-full max-w-md space-y-4">
      <div>
        <h3 className="text-lg font-semibold">Section One</h3>
        <p className="text-muted-foreground text-sm">
          This is the first section of content.
        </p>
      </div>

      <div className="relative">
        <Separator />
        <span className="bg-background text-muted-foreground absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 px-2 text-xs">
          OR
        </span>
      </div>

      <div>
        <h3 className="text-lg font-semibold">Section Two</h3>
        <p className="text-muted-foreground text-sm">
          This is the second section of content.
        </p>
      </div>
    </div>
  ),
}

export const ProfileCard: Story = {
  args: {},
  render: () => (
    <Card className="w-[350px]">
      <CardHeader>
        <div className="flex items-center space-x-4">
          <Avatar>
            <AvatarImage src="/placeholder.svg" />
            <AvatarFallback>JD</AvatarFallback>
          </Avatar>
          <div>
            <CardTitle>John Doe</CardTitle>
            <CardDescription>john.doe@example.com</CardDescription>
          </div>
        </div>
      </CardHeader>
      <Separator />
      <CardContent className="p-0">
        <div className="py-3">
          <button className="hover:bg-muted flex w-full items-center px-6 py-2 text-sm">
            <User className="mr-3 h-4 w-4" />
            Profile
          </button>
          <button className="hover:bg-muted flex w-full items-center px-6 py-2 text-sm">
            <CreditCard className="mr-3 h-4 w-4" />
            Billing
          </button>
          <button className="hover:bg-muted flex w-full items-center px-6 py-2 text-sm">
            <Settings className="mr-3 h-4 w-4" />
            Settings
          </button>
          <button className="hover:bg-muted flex w-full items-center px-6 py-2 text-sm">
            <Bell className="mr-3 h-4 w-4" />
            Notifications
          </button>
        </div>
        <Separator />
        <div className="py-3">
          <button className="hover:bg-muted flex w-full items-center px-6 py-2 text-sm">
            <Shield className="mr-3 h-4 w-4" />
            Privacy
          </button>
          <button className="text-danger hover:bg-danger/10 flex w-full items-center px-6 py-2 text-sm">
            <LogOut className="mr-3 h-4 w-4" />
            Log out
          </button>
        </div>
      </CardContent>
    </Card>
  ),
}

export const NavigationMenu: Story = {
  args: {},
  render: () => (
    <div className="w-full max-w-4xl">
      <nav className="flex items-center space-x-6 text-sm">
        <a href="#" className="text-primary font-medium">
          Home
        </a>
        <Separator orientation="vertical" className="h-6" />
        <a href="#" className="text-muted-foreground hover:text-foreground">
          Products
        </a>
        <Separator orientation="vertical" className="h-6" />
        <a href="#" className="text-muted-foreground hover:text-foreground">
          Solutions
        </a>
        <Separator orientation="vertical" className="h-6" />
        <a href="#" className="text-muted-foreground hover:text-foreground">
          Resources
        </a>
        <Separator orientation="vertical" className="h-6" />
        <a href="#" className="text-muted-foreground hover:text-foreground">
          Pricing
        </a>
        <div className="flex-1" />
        <Button variant="ghost" size="sm">
          Sign In
        </Button>
        <Separator orientation="vertical" className="h-6" />
        <Button size="sm">Get Started</Button>
      </nav>
    </div>
  ),
  parameters: {
    layout: 'padded',
  },
}

export const Sidebar: Story = {
  args: {},
  render: () => (
    <div className="w-[250px] rounded-lg border">
      <div className="p-4">
        <h2 className="text-lg font-semibold">Dashboard</h2>
      </div>
      <Separator />
      <nav className="p-2">
        <Button variant="ghost" className="w-full justify-start" size="sm">
          <Home className="mr-2 h-4 w-4" />
          Overview
        </Button>
        <Button variant="ghost" className="w-full justify-start" size="sm">
          <FileText className="mr-2 h-4 w-4" />
          Documents
        </Button>
        <Button variant="ghost" className="w-full justify-start" size="sm">
          <BarChart className="mr-2 h-4 w-4" />
          Analytics
        </Button>
        <Button variant="ghost" className="w-full justify-start" size="sm">
          <Users className="mr-2 h-4 w-4" />
          Team
        </Button>
      </nav>
      <Separator className="my-2" />
      <nav className="p-2">
        <Button variant="ghost" className="w-full justify-start" size="sm">
          <Calendar className="mr-2 h-4 w-4" />
          Calendar
        </Button>
        <Button variant="ghost" className="w-full justify-start" size="sm">
          <Mail className="mr-2 h-4 w-4" />
          Messages
          <Badge className="ml-auto" variant="secondary">
            3
          </Badge>
        </Button>
      </nav>
      <Separator className="my-2" />
      <div className="p-2">
        <Button variant="ghost" className="w-full justify-start" size="sm">
          <Settings className="mr-2 h-4 w-4" />
          Settings
        </Button>
      </div>
    </div>
  ),
}

export const BlogPost: Story = {
  args: {},
  render: () => (
    <article className="w-full max-w-2xl space-y-6">
      <header>
        <h1 className="text-heading-1 mb-2 font-bold">
          Building Better User Interfaces with CoreLive
        </h1>
        <div className="text-muted-foreground flex items-center gap-4 text-sm">
          <span>By Sarah Johnson</span>
          <Separator orientation="vertical" className="h-4" />
          <span>5 min read</span>
          <Separator orientation="vertical" className="h-4" />
          <span>March 15, 2024</span>
        </div>
      </header>

      <Separator />

      <div className="prose prose-gray dark:prose-invert">
        <p>
          Lorem ipsum dolor sit amet, consectetur adipiscing elit. Sed do
          eiusmod tempor incididunt ut labore et dolore magna aliqua. Ut enim ad
          minim veniam, quis nostrud exercitation ullamco laboris.
        </p>
        <p>
          Duis aute irure dolor in reprehenderit in voluptate velit esse cillum
          dolore eu fugiat nulla pariatur. Excepteur sint occaecat cupidatat non
          proident.
        </p>
      </div>

      <Separator className="my-8" decorative />

      <div className="space-y-2">
        <h2 className="text-heading-2 font-semibold">Key Takeaways</h2>
        <ul className="space-y-1 text-sm">
          <li>• Component-driven development improves consistency</li>
          <li>• Design tokens enable flexible theming</li>
          <li>• Accessibility should be built-in, not bolted on</li>
        </ul>
      </div>

      <Separator />

      <footer className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="sm">
            <Heart className="mr-2 h-4 w-4" />
            124
          </Button>
          <Button variant="ghost" size="sm">
            <MessageSquare className="mr-2 h-4 w-4" />
            23
          </Button>
          <Button variant="ghost" size="sm">
            <Share className="mr-2 h-4 w-4" />
            Share
          </Button>
        </div>
        <Button variant="ghost" size="sm">
          <Bookmark className="mr-2 h-4 w-4" />
          Save
        </Button>
      </footer>
    </article>
  ),
  parameters: {
    layout: 'padded',
  },
}

export const MediaPlayer: Story = {
  args: {},
  render: () => (
    <Card className="w-[400px]">
      <CardContent className="p-4">
        <div className="space-y-4">
          <div className="flex items-center space-x-4">
            <div className="from-primary to-accent h-16 w-16 rounded bg-gradient-to-br" />
            <div className="flex-1">
              <h3 className="font-semibold">Midnight Dreams</h3>
              <p className="text-muted-foreground text-sm">Luna Echo</p>
            </div>
          </div>

          <div className="space-y-2">
            <div className="text-muted-foreground flex items-center justify-between text-xs">
              <span>2:14</span>
              <span>4:36</span>
            </div>
            <div className="bg-secondary h-1 w-full rounded-full">
              <div className="bg-primary h-full w-1/2 rounded-full" />
            </div>
          </div>

          <div className="flex items-center justify-center space-x-4">
            <Button variant="ghost" size="icon">
              <SkipBack className="h-4 w-4" />
            </Button>
            <Button size="icon" className="h-10 w-10">
              <Play className="h-4 w-4" />
            </Button>
            <Button variant="ghost" size="icon">
              <SkipForward className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </CardContent>
      <Separator />
      <CardContent className="p-4">
        <div className="flex items-center space-x-2">
          <Volume2 className="h-4 w-4" />
          <div className="bg-secondary h-1 flex-1 rounded-full">
            <div className="bg-primary h-full w-3/4 rounded-full" />
          </div>
        </div>
      </CardContent>
    </Card>
  ),
}

export const DataTable: Story = {
  args: {},
  render: () => (
    <div className="w-full max-w-3xl">
      <div className="rounded-lg border">
        <div className="p-4">
          <h3 className="text-lg font-semibold">Recent Transactions</h3>
          <p className="text-muted-foreground text-sm">
            Your latest financial activity
          </p>
        </div>
        <Separator />
        <div className="p-0">
          <div className="text-muted-foreground grid grid-cols-4 gap-4 px-6 py-3 text-sm font-medium">
            <div>Date</div>
            <div>Description</div>
            <div>Category</div>
            <div className="text-right">Amount</div>
          </div>
          <Separator />
          <div className="divide-y">
            <div className="grid grid-cols-4 gap-4 px-6 py-3 text-sm">
              <div>Mar 15</div>
              <div>Coffee Shop</div>
              <div>
                <Badge variant="outline">Food</Badge>
              </div>
              <div className="text-right">-$4.50</div>
            </div>
            <div className="grid grid-cols-4 gap-4 px-6 py-3 text-sm">
              <div>Mar 14</div>
              <div>Monthly Salary</div>
              <div>
                <Badge variant="outline">Income</Badge>
              </div>
              <div className="text-success text-right">+$3,500.00</div>
            </div>
            <div className="grid grid-cols-4 gap-4 px-6 py-3 text-sm">
              <div>Mar 13</div>
              <div>Electric Bill</div>
              <div>
                <Badge variant="outline">Utilities</Badge>
              </div>
              <div className="text-right">-$120.00</div>
            </div>
          </div>
        </div>
        <Separator />
        <div className="flex items-center justify-between p-4">
          <p className="text-muted-foreground text-sm">
            Showing 3 of 128 transactions
          </p>
          <Button variant="outline" size="sm">
            View All
            <ChevronRight className="ml-2 h-4 w-4" />
          </Button>
        </div>
      </div>
    </div>
  ),
  parameters: {
    layout: 'padded',
  },
}

export const Features: Story = {
  args: {},
  render: () => (
    <div className="w-full max-w-4xl">
      <div className="mb-8 text-center">
        <h2 className="text-heading-2 mb-2 font-bold">Why Choose CoreLive?</h2>
        <p className="text-muted-foreground">
          Powerful features for modern applications
        </p>
      </div>

      <div className="grid grid-cols-1 gap-6 md:grid-cols-3">
        <div className="space-y-2 text-center">
          <div className="bg-primary/10 mx-auto flex h-12 w-12 items-center justify-center rounded-lg">
            <Zap className="text-primary h-6 w-6" />
          </div>
          <h3 className="font-semibold">Lightning Fast</h3>
          <p className="text-muted-foreground text-sm">
            Optimized performance for the best user experience
          </p>
        </div>

        <Separator orientation="vertical" className="hidden h-auto md:block" />

        <div className="space-y-2 text-center">
          <div className="bg-secondary/10 mx-auto flex h-12 w-12 items-center justify-center rounded-lg">
            <Shield className="text-secondary h-6 w-6" />
          </div>
          <h3 className="font-semibold">Secure by Default</h3>
          <p className="text-muted-foreground text-sm">
            Enterprise-grade security built into every component
          </p>
        </div>

        <Separator orientation="vertical" className="hidden h-auto md:block" />

        <div className="space-y-2 text-center">
          <div className="bg-accent/10 mx-auto flex h-12 w-12 items-center justify-center rounded-lg">
            <Star className="text-accent h-6 w-6" />
          </div>
          <h3 className="font-semibold">Premium Support</h3>
          <p className="text-muted-foreground text-sm">
            24/7 support from our expert team
          </p>
        </div>
      </div>

      <Separator className="my-8 md:hidden" />
    </div>
  ),
  parameters: {
    layout: 'padded',
  },
}

export const Timeline: Story = {
  args: {},
  render: () => (
    <div className="w-full max-w-md">
      <h3 className="mb-4 text-lg font-semibold">Activity Timeline</h3>
      <div className="space-y-4">
        <div className="flex gap-4">
          <div className="flex flex-col items-center">
            <div className="bg-primary flex h-8 w-8 items-center justify-center rounded-full">
              <Upload className="text-primary-foreground h-4 w-4" />
            </div>
            <Separator orientation="vertical" className="h-16" />
          </div>
          <div className="flex-1 pb-4">
            <p className="font-medium">File uploaded</p>
            <p className="text-muted-foreground text-sm">project-final.pdf</p>
            <p className="text-muted-foreground mt-1 text-xs">2 hours ago</p>
          </div>
        </div>

        <div className="flex gap-4">
          <div className="flex flex-col items-center">
            <div className="bg-secondary flex h-8 w-8 items-center justify-center rounded-full">
              <MessageSquare className="text-secondary-foreground h-4 w-4" />
            </div>
            <Separator orientation="vertical" className="h-16" />
          </div>
          <div className="flex-1 pb-4">
            <p className="font-medium">Comment added</p>
            <p className="text-muted-foreground text-sm">Great work on this!</p>
            <p className="text-muted-foreground mt-1 text-xs">4 hours ago</p>
          </div>
        </div>

        <div className="flex gap-4">
          <div className="flex flex-col items-center">
            <div className="bg-accent flex h-8 w-8 items-center justify-center rounded-full">
              <Users className="text-accent-foreground h-4 w-4" />
            </div>
            <Separator orientation="vertical" className="h-16" />
          </div>
          <div className="flex-1 pb-4">
            <p className="font-medium">Team member added</p>
            <p className="text-muted-foreground text-sm">
              Sarah joined the project
            </p>
            <p className="text-muted-foreground mt-1 text-xs">Yesterday</p>
          </div>
        </div>

        <div className="flex gap-4">
          <div className="flex flex-col items-center">
            <div className="bg-success flex h-8 w-8 items-center justify-center rounded-full">
              <CheckCircle className="text-success-foreground h-4 w-4" />
            </div>
          </div>
          <div className="flex-1">
            <p className="font-medium">Project created</p>
            <p className="text-muted-foreground text-sm">
              Initial setup complete
            </p>
            <p className="text-muted-foreground mt-1 text-xs">3 days ago</p>
          </div>
        </div>
      </div>
    </div>
  ),
}

export const CoreLiveThemeShowcase: Story = {
  args: {},
  render: () => (
    <div className="w-full max-w-2xl space-y-8">
      <div>
        <h3 className="text-heading-3 mb-4 font-medium">
          Separator Orientations
        </h3>
        <div className="space-y-6">
          <div>
            <p className="text-muted-foreground mb-2 text-sm">
              Horizontal (default)
            </p>
            <Separator
              style={{
                backgroundColor: 'var(--component-separator-background)',
              }}
            />
          </div>

          <div className="flex h-20 items-center gap-4">
            <p className="text-muted-foreground text-sm">Vertical</p>
            <Separator
              orientation="vertical"
              style={{
                backgroundColor: 'var(--component-separator-background)',
              }}
            />
            <p className="text-muted-foreground text-sm">Separator</p>
          </div>
        </div>
      </div>

      <div>
        <h3 className="text-heading-3 mb-4 font-medium">Semantic Separators</h3>
        <div className="space-y-4">
          <Card>
            <CardContent className="pt-6">
              <div className="space-y-4">
                <div>
                  <p className="mb-2 text-sm font-medium">Default Separator</p>
                  <Separator />
                </div>

                <div>
                  <p className="text-primary mb-2 text-sm font-medium">
                    Primary Separator
                  </p>
                  <Separator className="bg-primary/20" />
                </div>

                <div>
                  <p className="text-secondary mb-2 text-sm font-medium">
                    Secondary Separator
                  </p>
                  <Separator className="bg-secondary/20" />
                </div>

                <div>
                  <p className="text-accent mb-2 text-sm font-medium">
                    Accent Separator
                  </p>
                  <Separator className="bg-accent/20" />
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>

      <div>
        <h3 className="text-heading-3 mb-4 font-medium">Separator Weights</h3>
        <div className="space-y-4">
          <div>
            <p className="text-muted-foreground mb-2 text-sm">Thin (h-px)</p>
            <Separator className="h-px" />
          </div>

          <div>
            <p className="text-muted-foreground mb-2 text-sm">
              Default (h-[1px])
            </p>
            <Separator />
          </div>

          <div>
            <p className="text-muted-foreground mb-2 text-sm">Medium (h-0.5)</p>
            <Separator className="h-0.5" />
          </div>

          <div>
            <p className="text-muted-foreground mb-2 text-sm">Thick (h-1)</p>
            <Separator className="h-1" />
          </div>
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
                <p className="text-sm font-medium">
                  Custom separator using component tokens
                </p>
                <div
                  className="h-[1px] w-full"
                  style={{
                    backgroundColor: 'var(--component-separator-background)',
                  }}
                />
              </div>

              <div className="flex items-center gap-4">
                <span className="text-sm">Item 1</span>
                <div
                  className="h-4 w-[1px]"
                  style={{
                    backgroundColor: 'var(--component-separator-background)',
                  }}
                />
                <span className="text-sm">Item 2</span>
                <div
                  className="h-4 w-[1px]"
                  style={{
                    backgroundColor: 'var(--component-separator-background)',
                  }}
                />
                <span className="text-sm">Item 3</span>
              </div>

              <div className="bg-muted rounded-md p-3">
                <code className="text-xs">
                  --component-separator-background
                </code>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      <div>
        <h3 className="text-heading-3 mb-4 font-medium">Decorative Patterns</h3>
        <div className="space-y-6">
          <div className="relative">
            <Separator />
            <div className="absolute inset-0 flex items-center justify-center">
              <span className="bg-background text-muted-foreground px-3 text-sm">
                Section Break
              </span>
            </div>
          </div>

          <div className="flex items-center gap-4">
            <Separator className="flex-1" />
            <Star className="text-muted-foreground h-4 w-4" />
            <Separator className="flex-1" />
          </div>

          <div className="flex items-center gap-4">
            <Separator className="flex-1" />
            <div className="flex gap-1">
              <div className="bg-muted-foreground h-1.5 w-1.5 rounded-full" />
              <div className="bg-muted-foreground h-1.5 w-1.5 rounded-full" />
              <div className="bg-muted-foreground h-1.5 w-1.5 rounded-full" />
            </div>
            <Separator className="flex-1" />
          </div>
        </div>
      </div>

      <div>
        <h3 className="text-heading-3 mb-4 font-medium">Spacing Examples</h3>
        <Card>
          <CardHeader>
            <CardTitle>Content Sections</CardTitle>
          </CardHeader>
          <Separator />
          <CardContent className="pt-6">
            <p className="text-muted-foreground text-sm">
              Separators help organize content into distinct sections.
            </p>
          </CardContent>
          <Separator />
          <CardContent className="pt-6">
            <p className="text-muted-foreground text-sm">
              They provide visual hierarchy and improve readability.
            </p>
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
          'Comprehensive showcase of separator variations using CoreLive Design System tokens for consistent visual dividers across different contexts.',
      },
    },
  },
}
