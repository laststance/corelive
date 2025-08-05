import type { Meta, StoryObj } from '@storybook/react'
import {
  Crown,
  Shield,
  Star,
  MessageCircle,
  Settings,
  Plus,
  Check,
  Camera,
  Users,
  MapPin,
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
import { Separator } from '@/components/ui/separator'

const meta: Meta<typeof Avatar> = {
  title: 'CoreLive Design System/Components/Avatar',
  component: Avatar,
  parameters: {
    layout: 'centered',
    docs: {
      description: {
        component:
          'An avatar component for displaying user profile images with fallback support. Styled with CoreLive Design System tokens for consistent sizing and appearance.',
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
    <Avatar>
      <AvatarImage
        src="https://images.unsplash.com/photo-1472099645785-5658abf4ff4e?w=150"
        alt="@johndoe"
      />
      <AvatarFallback>JD</AvatarFallback>
    </Avatar>
  ),
}

export const WithFallback: Story = {
  args: {},
  render: () => (
    <Avatar>
      <AvatarImage src="https://broken-link.com" alt="@user" />
      <AvatarFallback>UN</AvatarFallback>
    </Avatar>
  ),
}

export const DifferentSizes: Story = {
  args: {},
  render: () => (
    <div className="flex items-center gap-4">
      <Avatar className="h-8 w-8">
        <AvatarImage src="https://images.unsplash.com/photo-1472099645785-5658abf4ff4e?w=150" />
        <AvatarFallback className="text-xs">JD</AvatarFallback>
      </Avatar>
      <Avatar className="h-10 w-10">
        <AvatarImage src="https://images.unsplash.com/photo-1494790108755-2616b612b601?w=150" />
        <AvatarFallback className="text-sm">JS</AvatarFallback>
      </Avatar>
      <Avatar className="h-12 w-12">
        <AvatarImage src="https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=150" />
        <AvatarFallback>RJ</AvatarFallback>
      </Avatar>
      <Avatar className="h-16 w-16">
        <AvatarImage src="https://images.unsplash.com/photo-1500648767791-00dcc994a43e?w=150" />
        <AvatarFallback className="text-lg">AB</AvatarFallback>
      </Avatar>
      <Avatar className="h-20 w-20">
        <AvatarImage src="https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=150" />
        <AvatarFallback className="text-xl">MK</AvatarFallback>
      </Avatar>
    </div>
  ),
  parameters: {
    docs: {
      description: {
        story:
          'Avatars in different sizes from small (32px) to extra large (80px).',
      },
    },
  },
}

export const AvatarGroup: Story = {
  args: {},
  render: () => (
    <div className="flex -space-x-2">
      <Avatar className="border-background border-2">
        <AvatarImage src="https://images.unsplash.com/photo-1472099645785-5658abf4ff4e?w=150" />
        <AvatarFallback>JD</AvatarFallback>
      </Avatar>
      <Avatar className="border-background border-2">
        <AvatarImage src="https://images.unsplash.com/photo-1494790108755-2616b612b601?w=150" />
        <AvatarFallback>JS</AvatarFallback>
      </Avatar>
      <Avatar className="border-background border-2">
        <AvatarImage src="https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=150" />
        <AvatarFallback>RJ</AvatarFallback>
      </Avatar>
      <Avatar className="border-background border-2">
        <AvatarImage src="https://images.unsplash.com/photo-1500648767791-00dcc994a43e?w=150" />
        <AvatarFallback>AB</AvatarFallback>
      </Avatar>
      <Avatar className="border-background bg-muted border-2">
        <AvatarFallback>+3</AvatarFallback>
      </Avatar>
    </div>
  ),
  parameters: {
    docs: {
      description: {
        story: 'A group of overlapping avatars with overflow count indicator.',
      },
    },
  },
}

export const WithStatus: Story = {
  args: {},
  render: () => (
    <div className="flex items-center gap-8">
      <div className="relative">
        <Avatar className="h-12 w-12">
          <AvatarImage src="https://images.unsplash.com/photo-1472099645785-5658abf4ff4e?w=150" />
          <AvatarFallback>JD</AvatarFallback>
        </Avatar>
        <div className="bg-success border-background absolute right-0 bottom-0 h-3 w-3 rounded-full border-2"></div>
      </div>

      <div className="relative">
        <Avatar className="h-12 w-12">
          <AvatarImage src="https://images.unsplash.com/photo-1494790108755-2616b612b601?w=150" />
          <AvatarFallback>JS</AvatarFallback>
        </Avatar>
        <div className="bg-warning border-background absolute right-0 bottom-0 h-3 w-3 rounded-full border-2"></div>
      </div>

      <div className="relative">
        <Avatar className="h-12 w-12">
          <AvatarImage src="https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=150" />
          <AvatarFallback>RJ</AvatarFallback>
        </Avatar>
        <div className="bg-muted-foreground border-background absolute right-0 bottom-0 h-3 w-3 rounded-full border-2"></div>
      </div>
    </div>
  ),
  parameters: {
    docs: {
      description: {
        story:
          'Avatars with status indicators showing online, away, and offline states.',
      },
    },
  },
}

export const WithBadges: Story = {
  args: {},
  render: () => (
    <div className="flex items-center gap-8">
      <div className="relative">
        <Avatar className="h-12 w-12">
          <AvatarImage src="https://images.unsplash.com/photo-1472099645785-5658abf4ff4e?w=150" />
          <AvatarFallback>JD</AvatarFallback>
        </Avatar>
        <Badge className="absolute -top-1 -right-1 flex h-6 w-6 items-center justify-center p-0">
          <Crown className="h-3 w-3" />
        </Badge>
      </div>

      <div className="relative">
        <Avatar className="h-12 w-12">
          <AvatarImage src="https://images.unsplash.com/photo-1494790108755-2616b612b601?w=150" />
          <AvatarFallback>JS</AvatarFallback>
        </Avatar>
        <Badge className="bg-success absolute -top-1 -right-1 flex h-6 w-6 items-center justify-center p-0 text-white">
          <Check className="h-3 w-3" />
        </Badge>
      </div>

      <div className="relative">
        <Avatar className="h-12 w-12">
          <AvatarImage src="https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=150" />
          <AvatarFallback>RJ</AvatarFallback>
        </Avatar>
        <Badge className="bg-danger absolute -top-1 -right-1 flex h-6 w-6 items-center justify-center p-0 text-xs text-white">
          5
        </Badge>
      </div>
    </div>
  ),
  parameters: {
    docs: {
      description: {
        story:
          'Avatars with badge overlays for special status, verification, or counts.',
      },
    },
  },
}

export const UserProfiles: Story = {
  args: {},
  render: () => (
    <div className="grid w-full max-w-4xl grid-cols-1 gap-6 md:grid-cols-2">
      <Card>
        <CardHeader>
          <div className="flex items-center gap-4">
            <div className="relative">
              <Avatar className="h-16 w-16">
                <AvatarImage src="https://images.unsplash.com/photo-1472099645785-5658abf4ff4e?w=150" />
                <AvatarFallback>JD</AvatarFallback>
              </Avatar>
              <div className="bg-success border-background absolute right-0 bottom-0 h-4 w-4 rounded-full border-2"></div>
            </div>
            <div className="flex-1">
              <div className="flex items-center gap-2">
                <CardTitle>John Doe</CardTitle>
                <Badge className="bg-primary text-on-primary">
                  <Crown className="mr-1 h-3 w-3" />
                  Pro
                </Badge>
              </div>
              <CardDescription>Senior Developer</CardDescription>
              <div className="text-muted-foreground mt-2 flex items-center gap-4 text-sm">
                <div className="flex items-center gap-1">
                  <MapPin className="h-3 w-3" />
                  <span>San Francisco</span>
                </div>
                <div className="flex items-center gap-1">
                  <Calendar className="h-3 w-3" />
                  <span>Joined 2023</span>
                </div>
              </div>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-between">
            <div className="flex gap-2">
              <Button size="sm">
                <MessageCircle className="mr-2 h-4 w-4" />
                Message
              </Button>
              <Button size="sm" variant="outline">
                Follow
              </Button>
            </div>
            <div className="text-muted-foreground text-sm">1.2k followers</div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <div className="flex items-center gap-4">
            <div className="relative">
              <Avatar className="h-16 w-16">
                <AvatarImage src="https://images.unsplash.com/photo-1494790108755-2616b612b601?w=150" />
                <AvatarFallback>JS</AvatarFallback>
              </Avatar>
              <Badge className="bg-success absolute -right-1 -bottom-1 flex h-6 w-6 items-center justify-center p-0 text-white">
                <Check className="h-3 w-3" />
              </Badge>
            </div>
            <div className="flex-1">
              <div className="flex items-center gap-2">
                <CardTitle>Jane Smith</CardTitle>
                <Badge variant="secondary">
                  <Shield className="mr-1 h-3 w-3" />
                  Admin
                </Badge>
              </div>
              <CardDescription>Product Manager</CardDescription>
              <div className="text-muted-foreground mt-2 flex items-center gap-4 text-sm">
                <div className="flex items-center gap-1">
                  <MapPin className="h-3 w-3" />
                  <span>New York</span>
                </div>
                <div className="flex items-center gap-1">
                  <Star className="h-3 w-3" />
                  <span>4.9 rating</span>
                </div>
              </div>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-between">
            <div className="flex gap-2">
              <Button size="sm">
                <MessageCircle className="mr-2 h-4 w-4" />
                Message
              </Button>
              <Button size="sm" variant="outline">
                <Settings className="mr-2 h-4 w-4" />
                Manage
              </Button>
            </div>
            <div className="text-muted-foreground text-sm">856 followers</div>
          </div>
        </CardContent>
      </Card>
    </div>
  ),
  parameters: {
    layout: 'padded',
    docs: {
      description: {
        story:
          'Complete user profile cards with avatars, status, badges, and actions.',
      },
    },
  },
}

export const TeamMembers: Story = {
  args: {},
  render: () => (
    <Card className="w-full max-w-2xl">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Users className="h-5 w-5" />
          Team Members
        </CardTitle>
        <CardDescription>Manage your team and their roles</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          {[
            {
              name: 'Alex Johnson',
              role: 'Team Lead',
              avatar:
                'https://images.unsplash.com/photo-1472099645785-5658abf4ff4e?w=150',
              status: 'online',
              badge: 'lead',
            },
            {
              name: 'Sarah Chen',
              role: 'Senior Developer',
              avatar:
                'https://images.unsplash.com/photo-1494790108755-2616b612b601?w=150',
              status: 'online',
              badge: 'verified',
            },
            {
              name: 'Mike Rodriguez',
              role: 'Designer',
              avatar:
                'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=150',
              status: 'away',
              badge: null,
            },
            {
              name: 'Emma Wilson',
              role: 'Developer',
              avatar:
                'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=150',
              status: 'offline',
              badge: 'new',
            },
          ].map((member, index) => (
            <div
              key={index}
              className="flex items-center justify-between rounded-lg border p-3"
            >
              <div className="flex items-center gap-3">
                <div className="relative">
                  <Avatar>
                    <AvatarImage src={member.avatar} />
                    <AvatarFallback>
                      {member.name
                        .split(' ')
                        .map((n) => n[0])
                        .join('')}
                    </AvatarFallback>
                  </Avatar>
                  <div
                    className={`border-background absolute right-0 bottom-0 h-3 w-3 rounded-full border-2 ${
                      member.status === 'online'
                        ? 'bg-success'
                        : member.status === 'away'
                          ? 'bg-warning'
                          : 'bg-muted-foreground'
                    }`}
                  ></div>
                  {member.badge && (
                    <Badge
                      className={`absolute -top-1 -right-1 flex h-5 w-5 items-center justify-center p-0 text-xs ${
                        member.badge === 'lead'
                          ? 'bg-primary text-on-primary'
                          : member.badge === 'verified'
                            ? 'bg-success text-white'
                            : member.badge === 'new'
                              ? 'bg-info text-white'
                              : ''
                      }`}
                    >
                      {member.badge === 'lead' && <Crown className="h-3 w-3" />}
                      {member.badge === 'verified' && (
                        <Check className="h-3 w-3" />
                      )}
                      {member.badge === 'new' && <Plus className="h-3 w-3" />}
                    </Badge>
                  )}
                </div>
                <div>
                  <p className="font-medium">{member.name}</p>
                  <p className="text-muted-foreground text-sm">{member.role}</p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Badge
                  variant={member.status === 'online' ? 'default' : 'secondary'}
                >
                  {member.status.charAt(0).toUpperCase() +
                    member.status.slice(1)}
                </Badge>
                <Button size="sm" variant="outline">
                  <MessageCircle className="h-4 w-4" />
                </Button>
              </div>
            </div>
          ))}
        </div>
        <Separator className="my-4" />
        <Button className="w-full" variant="outline">
          <Plus className="mr-2 h-4 w-4" />
          Invite Team Member
        </Button>
      </CardContent>
    </Card>
  ),
  parameters: {
    layout: 'padded',
    docs: {
      description: {
        story:
          'Team member list with avatars, status indicators, badges, and management actions.',
      },
    },
  },
}

export const EditableAvatar: Story = {
  args: {},
  render: () => (
    <div className="flex items-center gap-8">
      <div className="space-y-2 text-center">
        <div className="relative inline-block">
          <Avatar className="h-20 w-20">
            <AvatarImage src="https://images.unsplash.com/photo-1472099645785-5658abf4ff4e?w=150" />
            <AvatarFallback>JD</AvatarFallback>
          </Avatar>
          <Button
            size="icon"
            className="absolute right-0 bottom-0 h-7 w-7 rounded-full"
          >
            <Camera className="h-4 w-4" />
          </Button>
        </div>
        <p className="text-sm font-medium">Edit Photo</p>
      </div>

      <div className="space-y-2 text-center">
        <div className="relative inline-block">
          <Avatar className="border-muted-foreground h-20 w-20 border-2 border-dashed">
            <AvatarFallback className="bg-muted">
              <Plus className="text-muted-foreground h-8 w-8" />
            </AvatarFallback>
          </Avatar>
        </div>
        <p className="text-sm font-medium">Add Photo</p>
      </div>
    </div>
  ),
  parameters: {
    docs: {
      description: {
        story:
          'Editable avatars with upload functionality and placeholder states.',
      },
    },
  },
}

export const CoreLiveThemeShowcase: Story = {
  args: {},
  render: () => (
    <div className="w-full max-w-3xl space-y-6">
      <div>
        <h3 className="text-heading-3 mb-4 font-medium">Avatar Variations</h3>
        <div className="flex items-center gap-6">
          <Avatar
            className="h-16 w-16"
            style={{
              backgroundColor: 'var(--component-avatar-background)',
              color: 'var(--component-avatar-text)',
            }}
          >
            <AvatarImage src="https://images.unsplash.com/photo-1472099645785-5658abf4ff4e?w=150" />
            <AvatarFallback>JD</AvatarFallback>
          </Avatar>

          <Avatar
            className="h-16 w-16 border-2"
            style={{
              borderColor: 'var(--system-color-primary)',
            }}
          >
            <AvatarImage src="https://images.unsplash.com/photo-1494790108755-2616b612b601?w=150" />
            <AvatarFallback>JS</AvatarFallback>
          </Avatar>

          <Avatar
            className="h-16 w-16"
            style={{
              backgroundColor: 'var(--system-color-accent-container)',
              color: 'var(--system-color-accent-on-container)',
            }}
          >
            <AvatarFallback>AC</AvatarFallback>
          </Avatar>
        </div>
      </div>

      <div>
        <h3 className="text-heading-3 mb-4 font-medium">Status Indicators</h3>
        <div className="flex items-center gap-6">
          <div className="relative">
            <Avatar className="h-14 w-14">
              <AvatarImage src="https://images.unsplash.com/photo-1472099645785-5658abf4ff4e?w=150" />
              <AvatarFallback>ON</AvatarFallback>
            </Avatar>
            <div
              className="border-background absolute right-0 bottom-0 h-4 w-4 rounded-full border-2"
              style={{ backgroundColor: 'var(--system-color-success)' }}
            ></div>
            <p className="mt-2 text-center text-xs">Online</p>
          </div>

          <div className="relative">
            <Avatar className="h-14 w-14">
              <AvatarImage src="https://images.unsplash.com/photo-1494790108755-2616b612b601?w=150" />
              <AvatarFallback>AW</AvatarFallback>
            </Avatar>
            <div
              className="border-background absolute right-0 bottom-0 h-4 w-4 rounded-full border-2"
              style={{ backgroundColor: 'var(--system-color-warning)' }}
            ></div>
            <p className="mt-2 text-center text-xs">Away</p>
          </div>

          <div className="relative">
            <Avatar className="h-14 w-14">
              <AvatarImage src="https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=150" />
              <AvatarFallback>OFF</AvatarFallback>
            </Avatar>
            <div
              className="border-background absolute right-0 bottom-0 h-4 w-4 rounded-full border-2"
              style={{ backgroundColor: 'var(--system-color-neutral-400)' }}
            ></div>
            <p className="mt-2 text-center text-xs">Offline</p>
          </div>
        </div>
      </div>

      <div>
        <h3 className="text-heading-3 mb-4 font-medium">
          Semantic Color Avatars
        </h3>
        <div className="grid grid-cols-4 gap-4">
          <div className="text-center">
            <Avatar
              className="mx-auto mb-2 h-12 w-12"
              style={{
                backgroundColor: 'var(--system-color-primary-container)',
                color: 'var(--system-color-primary-on-container)',
              }}
            >
              <AvatarFallback>PR</AvatarFallback>
            </Avatar>
            <p className="text-xs">Primary</p>
          </div>

          <div className="text-center">
            <Avatar
              className="mx-auto mb-2 h-12 w-12"
              style={{
                backgroundColor: 'var(--system-color-success-container)',
                color: 'var(--system-color-success-on-container)',
              }}
            >
              <AvatarFallback>SC</AvatarFallback>
            </Avatar>
            <p className="text-xs">Success</p>
          </div>

          <div className="text-center">
            <Avatar
              className="mx-auto mb-2 h-12 w-12"
              style={{
                backgroundColor: 'var(--system-color-warning-container)',
                color: 'var(--system-color-warning-on-container)',
              }}
            >
              <AvatarFallback>WR</AvatarFallback>
            </Avatar>
            <p className="text-xs">Warning</p>
          </div>

          <div className="text-center">
            <Avatar
              className="mx-auto mb-2 h-12 w-12"
              style={{
                backgroundColor: 'var(--system-color-danger-container)',
                color: 'var(--system-color-danger-on-container)',
              }}
            >
              <AvatarFallback>DN</AvatarFallback>
            </Avatar>
            <p className="text-xs">Danger</p>
          </div>
        </div>
      </div>

      <div>
        <h3 className="text-heading-3 mb-4 font-medium">
          Component Token Usage
        </h3>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-4">
              <div
                className="flex h-12 w-12 items-center justify-center rounded-full text-sm font-medium"
                style={{
                  backgroundColor: 'var(--component-avatar-background)',
                  color: 'var(--component-avatar-text)',
                  border: `2px solid var(--component-avatar-border)`,
                }}
              >
                CT
              </div>
              <div>
                <p className="font-medium">Custom Avatar</p>
                <p className="text-muted-foreground text-sm">
                  Using component avatar tokens for consistent styling
                </p>
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
          'Comprehensive showcase of avatar variations using CoreLive Design System tokens for consistent styling across different states, sizes, and semantic meanings.',
      },
    },
  },
}
