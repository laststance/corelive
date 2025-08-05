import type { Meta, StoryObj } from '@storybook/react'
import {
  Check,
  X,
  Clock,
  AlertTriangle,
  Star,
  Zap,
  Users,
  TrendingUp,
  Award,
  Crown,
  Heart,
  MessageCircle,
  Eye,
  Calendar,
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

const meta: Meta<typeof Badge> = {
  title: 'CoreLive Design System/Components/Badge',
  component: Badge,
  parameters: {
    layout: 'centered',
    docs: {
      description: {
        component:
          'A badge component for displaying status, labels, and counts. Styled with CoreLive Design System tokens for consistent appearance across different variants and themes.',
      },
    },
  },
  tags: ['autodocs'],
  argTypes: {
    variant: {
      control: 'select',
      options: ['default', 'secondary', 'destructive', 'outline'],
      description: 'Visual style variant of the badge',
    },
  },
}

export default meta
type Story = StoryObj<typeof meta>

export const Default: Story = {
  args: {
    children: 'Badge',
  },
}

export const Secondary: Story = {
  args: {
    variant: 'secondary',
    children: 'Secondary',
  },
}

export const Destructive: Story = {
  args: {
    variant: 'destructive',
    children: 'Destructive',
  },
}

export const Outline: Story = {
  args: {
    variant: 'outline',
    children: 'Outline',
  },
}

export const WithIcon: Story = {
  args: {},
  render: () => (
    <div className="flex flex-wrap gap-2">
      <Badge>
        <Check className="mr-1 h-3 w-3" />
        Verified
      </Badge>
      <Badge variant="secondary">
        <Star className="mr-1 h-3 w-3" />
        Featured
      </Badge>
      <Badge variant="destructive">
        <X className="mr-1 h-3 w-3" />
        Blocked
      </Badge>
      <Badge variant="outline">
        <Clock className="mr-1 h-3 w-3" />
        Pending
      </Badge>
    </div>
  ),
}

export const AllVariants: Story = {
  args: {},
  render: () => (
    <div className="flex flex-wrap gap-2">
      <Badge>Default</Badge>
      <Badge variant="secondary">Secondary</Badge>
      <Badge variant="destructive">Destructive</Badge>
      <Badge variant="outline">Outline</Badge>
    </div>
  ),
  parameters: {
    docs: {
      description: {
        story: 'All available badge variants showcased together.',
      },
    },
  },
}

export const StatusBadges: Story = {
  args: {},
  render: () => (
    <div className="flex flex-wrap gap-2">
      <Badge className="bg-success text-white">
        <Check className="mr-1 h-3 w-3" />
        Active
      </Badge>
      <Badge className="bg-warning text-black">
        <Clock className="mr-1 h-3 w-3" />
        Pending
      </Badge>
      <Badge className="bg-danger text-white">
        <X className="mr-1 h-3 w-3" />
        Inactive
      </Badge>
      <Badge className="bg-info text-white">
        <AlertTriangle className="mr-1 h-3 w-3" />
        Review
      </Badge>
    </div>
  ),
  parameters: {
    docs: {
      description: {
        story:
          'Status badges using semantic colors from CoreLive Design System.',
      },
    },
  },
}

export const CountBadges: Story = {
  args: {},
  render: () => (
    <div className="flex flex-wrap items-center gap-4">
      <div className="relative">
        <Button variant="outline">
          <MessageCircle className="h-4 w-4" />
          Messages
        </Button>
        <Badge className="absolute -top-2 -right-2 flex h-5 w-5 items-center justify-center p-0 text-xs">
          3
        </Badge>
      </div>

      <div className="relative">
        <Button variant="outline">
          <Eye className="h-4 w-4" />
          Views
        </Button>
        <Badge
          variant="secondary"
          className="absolute -top-2 -right-2 flex h-5 w-5 items-center justify-center p-0 text-xs"
        >
          99+
        </Badge>
      </div>

      <div className="relative">
        <Button variant="outline">
          <Heart className="h-4 w-4" />
          Likes
        </Button>
        <Badge className="bg-danger absolute -top-2 -right-2 flex h-5 w-5 items-center justify-center p-0 text-xs text-white">
          12
        </Badge>
      </div>
    </div>
  ),
  parameters: {
    docs: {
      description: {
        story: 'Count badges positioned over buttons and other elements.',
      },
    },
  },
}

export const UserProfileBadges: Story = {
  args: {},
  render: () => (
    <Card className="w-[350px]">
      <CardHeader>
        <div className="flex items-center gap-4">
          <div className="relative">
            <Avatar className="h-12 w-12">
              <AvatarImage src="https://images.unsplash.com/photo-1472099645785-5658abf4ff4e?w=150" />
              <AvatarFallback>JD</AvatarFallback>
            </Avatar>
            <Badge className="absolute -right-1 -bottom-1 flex h-6 w-6 items-center justify-center p-0">
              <Check className="h-3 w-3" />
            </Badge>
          </div>
          <div className="flex-1">
            <div className="flex items-center gap-2">
              <CardTitle className="text-lg">John Doe</CardTitle>
              <Badge className="bg-primary hover:bg-primary text-on-primary">
                <Crown className="mr-1 h-3 w-3" />
                Pro
              </Badge>
            </div>
            <CardDescription>Full Stack Developer</CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <div className="space-y-3">
          <div className="flex flex-wrap gap-2">
            <Badge variant="secondary">JavaScript</Badge>
            <Badge variant="secondary">React</Badge>
            <Badge variant="secondary">Node.js</Badge>
            <Badge variant="outline">TypeScript</Badge>
          </div>

          <div className="text-muted-foreground flex items-center gap-4 text-sm">
            <div className="flex items-center gap-1">
              <Users className="h-4 w-4" />
              <span>1.2k followers</span>
            </div>
            <div className="flex items-center gap-1">
              <Star className="h-4 w-4" />
              <span>4.8 rating</span>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  ),
  parameters: {
    docs: {
      description: {
        story:
          'Badges used in a user profile context with verification and skill tags.',
      },
    },
  },
}

export const NotificationBadges: Story = {
  args: {},
  render: () => (
    <div className="w-full max-w-md space-y-4">
      <Card>
        <CardContent className="pt-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="relative">
                <div className="bg-primary/10 flex h-10 w-10 items-center justify-center rounded-full">
                  <MessageCircle className="text-primary h-5 w-5" />
                </div>
                <Badge className="absolute -top-1 -right-1 flex h-5 w-5 items-center justify-center p-0 text-xs">
                  5
                </Badge>
              </div>
              <div>
                <p className="font-medium">New Messages</p>
                <p className="text-muted-foreground text-sm">
                  You have unread messages
                </p>
              </div>
            </div>
            <Badge className="bg-success text-white">New</Badge>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="pt-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="bg-warning/10 flex h-10 w-10 items-center justify-center rounded-full">
                <AlertTriangle className="text-warning h-5 w-5" />
              </div>
              <div>
                <p className="font-medium">System Alert</p>
                <p className="text-muted-foreground text-sm">
                  Server maintenance scheduled
                </p>
              </div>
            </div>
            <Badge className="bg-warning text-black">
              <Clock className="mr-1 h-3 w-3" />
              Scheduled
            </Badge>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="pt-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="bg-success/10 flex h-10 w-10 items-center justify-center rounded-full">
                <TrendingUp className="text-success h-5 w-5" />
              </div>
              <div>
                <p className="font-medium">Performance</p>
                <p className="text-muted-foreground text-sm">
                  All systems operational
                </p>
              </div>
            </div>
            <Badge className="bg-success text-white">
              <Check className="mr-1 h-3 w-3" />
              Healthy
            </Badge>
          </div>
        </CardContent>
      </Card>
    </div>
  ),
  parameters: {
    docs: {
      description: {
        story: 'Notification-style badges with semantic colors and states.',
      },
    },
  },
}

export const InteractiveBadges: Story = {
  args: {},
  render: () => (
    <div className="space-y-4">
      <div>
        <h4 className="mb-2 text-sm font-medium">Filter Tags</h4>
        <div className="flex flex-wrap gap-2">
          {['JavaScript', 'React', 'TypeScript', 'Node.js', 'Python', 'Go'].map(
            (tag) => (
              <Badge
                key={tag}
                variant="outline"
                className="hover:bg-primary hover:text-primary-foreground cursor-pointer transition-colors"
              >
                {tag}
                <X className="ml-1 h-3 w-3" />
              </Badge>
            ),
          )}
        </div>
      </div>

      <div>
        <h4 className="mb-2 text-sm font-medium">Priority Levels</h4>
        <div className="flex flex-wrap gap-2">
          <Badge className="bg-danger hover:bg-danger-hover cursor-pointer text-white">
            <Zap className="mr-1 h-3 w-3" />
            Critical
          </Badge>
          <Badge className="bg-warning hover:bg-warning-hover cursor-pointer text-black">
            <AlertTriangle className="mr-1 h-3 w-3" />
            High
          </Badge>
          <Badge className="bg-info hover:bg-info-hover cursor-pointer text-white">
            <Clock className="mr-1 h-3 w-3" />
            Medium
          </Badge>
          <Badge variant="outline" className="hover:bg-muted cursor-pointer">
            Low
          </Badge>
        </div>
      </div>
    </div>
  ),
  parameters: {
    docs: {
      description: {
        story:
          'Interactive badges that can be clicked or removed, useful for filters and tags.',
      },
    },
  },
}

export const CoreLiveThemeShowcase: Story = {
  args: {},
  render: () => (
    <div className="w-full max-w-2xl space-y-6">
      <div>
        <h3 className="text-heading-3 mb-4 font-medium">Badge Variants</h3>
        <div className="flex flex-wrap gap-3">
          <Badge
            style={{
              backgroundColor: 'var(--component-badge-primary-background)',
              color: 'var(--component-badge-primary-text)',
            }}
          >
            Primary Badge
          </Badge>
          <Badge
            style={{
              backgroundColor: 'var(--component-badge-secondary-background)',
              color: 'var(--component-badge-secondary-text)',
            }}
          >
            Secondary Badge
          </Badge>
          <Badge
            style={{
              backgroundColor: 'var(--system-color-accent)',
              color: 'var(--system-color-accent-on-container)',
            }}
          >
            Accent Badge
          </Badge>
        </div>
      </div>

      <div>
        <h3 className="text-heading-3 mb-4 font-medium">
          Semantic Color Badges
        </h3>
        <div className="grid grid-cols-2 gap-4">
          <Card className="p-4">
            <h4 className="mb-3 font-medium">Status Indicators</h4>
            <div className="flex flex-wrap gap-2">
              <Badge
                style={{
                  backgroundColor: 'var(--system-color-success)',
                  color: 'var(--system-color-success-on-container)',
                }}
              >
                <Check className="mr-1 h-3 w-3" />
                Success
              </Badge>
              <Badge
                style={{
                  backgroundColor: 'var(--system-color-warning)',
                  color: 'var(--system-color-warning-on-container)',
                }}
              >
                <Clock className="mr-1 h-3 w-3" />
                Warning
              </Badge>
              <Badge
                style={{
                  backgroundColor: 'var(--system-color-danger)',
                  color: 'var(--system-color-danger-on-container)',
                }}
              >
                <X className="mr-1 h-3 w-3" />
                Error
              </Badge>
              <Badge
                style={{
                  backgroundColor: 'var(--system-color-info)',
                  color: 'var(--system-color-info-on-container)',
                }}
              >
                <AlertTriangle className="mr-1 h-3 w-3" />
                Info
              </Badge>
            </div>
          </Card>

          <Card className="p-4">
            <h4 className="mb-3 font-medium">Priority Levels</h4>
            <div className="space-y-2">
              <Badge
                className="w-full justify-center"
                style={{
                  backgroundColor: 'var(--primitive-color-brand-600)',
                  color: 'white',
                }}
              >
                <Crown className="mr-1 h-3 w-3" />
                Premium
              </Badge>
              <Badge
                variant="outline"
                className="w-full justify-center"
                style={{
                  borderColor: 'var(--system-color-primary)',
                  color: 'var(--system-color-primary)',
                }}
              >
                <Star className="mr-1 h-3 w-3" />
                Standard
              </Badge>
              <Badge variant="secondary" className="w-full justify-center">
                <Users className="mr-1 h-3 w-3" />
                Basic
              </Badge>
            </div>
          </Card>
        </div>
      </div>

      <div>
        <h3 className="text-heading-3 mb-4 font-medium">
          Component Token Usage
        </h3>
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <span
              className="rounded-full px-2 py-1 text-xs font-medium transition-colors"
              style={{
                backgroundColor: 'var(--component-badge-primary-background)',
                color: 'var(--component-badge-primary-text)',
                border: `1px solid var(--component-badge-primary-border)`,
              }}
            >
              Custom Badge
            </span>
            <span className="text-muted-foreground text-sm">
              Using component badge tokens
            </span>
          </div>

          <div className="flex items-center gap-2">
            <span
              className="rounded-md px-2 py-1 text-xs font-medium"
              style={{
                backgroundColor: 'var(--system-color-primary-container)',
                color: 'var(--system-color-primary-on-container)',
                border: `1px solid var(--system-color-primary-outline)`,
              }}
            >
              System Colors
            </span>
            <span className="text-muted-foreground text-sm">
              Using system color tokens
            </span>
          </div>
        </div>
      </div>

      <div>
        <h3 className="text-heading-3 mb-4 font-medium">
          Event Calendar Example
        </h3>
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Calendar className="h-5 w-5" />
              Upcoming Events
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex items-center justify-between rounded-lg border p-3">
              <div>
                <p className="font-medium">Team Standup</p>
                <p className="text-muted-foreground text-sm">Today, 9:00 AM</p>
              </div>
              <div className="flex gap-2">
                <Badge className="bg-success text-white">
                  <Check className="mr-1 h-3 w-3" />
                  Confirmed
                </Badge>
                <Badge variant="outline">
                  <Users className="mr-1 h-3 w-3" />8 attending
                </Badge>
              </div>
            </div>

            <div className="flex items-center justify-between rounded-lg border p-3">
              <div>
                <p className="font-medium">Product Review</p>
                <p className="text-muted-foreground text-sm">
                  Tomorrow, 2:00 PM
                </p>
              </div>
              <div className="flex gap-2">
                <Badge className="bg-warning text-black">
                  <Clock className="mr-1 h-3 w-3" />
                  Pending
                </Badge>
                <Badge variant="secondary">
                  <Award className="mr-1 h-3 w-3" />
                  Important
                </Badge>
              </div>
            </div>
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
          'Comprehensive showcase of badge variations using CoreLive Design System tokens for consistent styling across different contexts and semantic meanings.',
      },
    },
  },
}
