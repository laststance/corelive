import type { Meta, StoryObj } from '@storybook/react'
import {
  Calendar,
  Clock,
  MapPin,
  Star,
  Users,
  Heart,
  Share,
  MessageCircle,
} from 'lucide-react'

import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { Separator } from '@/components/ui/separator'

const meta: Meta<typeof Card> = {
  title: 'CoreLive Design System/Components/Card',
  component: Card,
  parameters: {
    layout: 'centered',
    docs: {
      description: {
        component:
          'A flexible card component with header, content, and footer sections. Styled using CoreLive Design System tokens for consistent elevation and spacing.',
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
    <Card className="w-[350px]">
      <CardHeader>
        <CardTitle>Card Title</CardTitle>
        <CardDescription>Card Description</CardDescription>
      </CardHeader>
      <CardContent>
        <p>
          Card content goes here. This is where you can put any information you
          want to display.
        </p>
      </CardContent>
      <CardFooter className="flex justify-between">
        <Button variant="outline">Cancel</Button>
        <Button>Deploy</Button>
      </CardFooter>
    </Card>
  ),
}

export const Simple: Story = {
  args: {},
  render: () => (
    <Card className="w-[350px]">
      <CardContent className="pt-6">
        <div className="text-center">
          <h3 className="text-heading-3 font-semibold">Simple Card</h3>
          <p className="text-muted-foreground mt-2">
            A simple card with just content, no header or footer.
          </p>
        </div>
      </CardContent>
    </Card>
  ),
}

export const ProductCard: Story = {
  args: {},
  render: () => (
    <Card className="w-[300px] overflow-hidden">
      <div className="bg-muted flex aspect-square items-center justify-center">
        <div className="text-4xl">📱</div>
      </div>
      <CardHeader>
        <div className="flex items-start justify-between">
          <div>
            <CardTitle className="text-lg">iPhone 15 Pro</CardTitle>
            <CardDescription>Apple</CardDescription>
          </div>
          <Badge variant="secondary">New</Badge>
        </div>
      </CardHeader>
      <CardContent>
        <div className="mb-2 flex items-center gap-1">
          {[...Array(5)].map((_, i) => (
            <Star key={i} className="h-4 w-4 fill-yellow-400 text-yellow-400" />
          ))}
          <span className="text-muted-foreground ml-2 text-sm">(4.8)</span>
        </div>
        <p className="text-2xl font-bold">$999</p>
      </CardContent>
      <CardFooter>
        <Button className="w-full">Add to Cart</Button>
      </CardFooter>
    </Card>
  ),
}

export const UserProfile: Story = {
  args: {},
  render: () => (
    <Card className="w-[350px]">
      <CardHeader>
        <div className="flex items-center gap-4">
          <Avatar className="h-12 w-12">
            <AvatarImage src="https://images.unsplash.com/photo-1472099645785-5658abf4ff4e?w=150" />
            <AvatarFallback>JD</AvatarFallback>
          </Avatar>
          <div>
            <CardTitle className="text-lg">John Doe</CardTitle>
            <CardDescription>Software Engineer</CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <div className="text-muted-foreground mb-2 flex items-center gap-2 text-sm">
          <MapPin className="h-4 w-4" />
          San Francisco, CA
        </div>
        <div className="text-muted-foreground mb-4 flex items-center gap-2 text-sm">
          <Users className="h-4 w-4" />
          1.2k followers
        </div>
        <p className="text-sm">
          Passionate about building great user experiences with modern web
          technologies.
        </p>
      </CardContent>
      <CardFooter>
        <div className="flex w-full gap-2">
          <Button className="flex-1">Follow</Button>
          <Button variant="outline" size="icon">
            <MessageCircle className="h-4 w-4" />
          </Button>
        </div>
      </CardFooter>
    </Card>
  ),
}

export const EventCard: Story = {
  args: {},
  render: () => (
    <Card className="w-[400px]">
      <CardHeader>
        <div className="flex items-start justify-between">
          <div>
            <CardTitle>React Conference 2024</CardTitle>
            <CardDescription>
              The biggest React event of the year
            </CardDescription>
          </div>
          <Badge className="bg-primary text-on-primary">Featured</Badge>
        </div>
      </CardHeader>
      <CardContent>
        <div className="space-y-3">
          <div className="flex items-center gap-2 text-sm">
            <Calendar className="text-muted-foreground h-4 w-4" />
            <span>March 15-17, 2024</span>
          </div>
          <div className="flex items-center gap-2 text-sm">
            <Clock className="text-muted-foreground h-4 w-4" />
            <span>9:00 AM - 6:00 PM</span>
          </div>
          <div className="flex items-center gap-2 text-sm">
            <MapPin className="text-muted-foreground h-4 w-4" />
            <span>San Francisco Convention Center</span>
          </div>
          <Separator />
          <div className="flex items-center gap-2">
            <Users className="text-muted-foreground h-4 w-4" />
            <span className="text-sm">2,500+ attendees expected</span>
          </div>
        </div>
      </CardContent>
      <CardFooter className="flex justify-between">
        <div className="flex gap-2">
          <Button variant="outline" size="icon">
            <Heart className="h-4 w-4" />
          </Button>
          <Button variant="outline" size="icon">
            <Share className="h-4 w-4" />
          </Button>
        </div>
        <Button>Register Now</Button>
      </CardFooter>
    </Card>
  ),
}

export const StatsCard: Story = {
  args: {},
  render: () => (
    <div className="grid w-full max-w-3xl grid-cols-1 gap-4 md:grid-cols-3">
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
            <p className="text-muted-foreground text-sm">Growth Rate</p>
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
  ),
}

export const CoreLiveThemeShowcase: Story = {
  args: {},
  render: () => (
    <div className="w-full max-w-4xl space-y-6">
      <div>
        <h3 className="text-heading-3 mb-4 font-medium">Elevation Levels</h3>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
          <div
            className="card"
            style={{ boxShadow: 'var(--system-elevation-raised)' }}
          >
            <div className="p-4">
              <h4 className="mb-2 font-semibold">Raised</h4>
              <p className="text-muted-foreground text-sm">
                Using system-elevation-raised
              </p>
            </div>
          </div>
          <div
            className="bg-card rounded-lg border p-4"
            style={{ boxShadow: 'var(--system-elevation-floating)' }}
          >
            <h4 className="mb-2 font-semibold">Floating</h4>
            <p className="text-muted-foreground text-sm">
              Using system-elevation-floating
            </p>
          </div>
          <div
            className="bg-card rounded-lg border p-4"
            style={{ boxShadow: 'var(--system-elevation-overlay)' }}
          >
            <h4 className="mb-2 font-semibold">Overlay</h4>
            <p className="text-muted-foreground text-sm">
              Using system-elevation-overlay
            </p>
          </div>
        </div>
      </div>

      <div>
        <h3 className="text-heading-3 mb-4 font-medium">
          Component Token Usage
        </h3>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <Card
            style={{
              backgroundColor: 'var(--component-card-background)',
              borderColor: 'var(--component-card-border)',
              boxShadow: 'var(--component-card-shadow)',
            }}
          >
            <CardContent className="pt-6">
              <h4 className="mb-2 font-semibold">Component Tokens</h4>
              <p className="text-muted-foreground text-sm">
                Styled using component-card-* tokens
              </p>
            </CardContent>
          </Card>
          <Card className="transition-shadow duration-200 hover:shadow-lg">
            <CardContent className="pt-6">
              <h4 className="mb-2 font-semibold">Hover Effect</h4>
              <p className="text-muted-foreground text-sm">
                Interactive card with hover elevation
              </p>
            </CardContent>
          </Card>
        </div>
      </div>

      <div>
        <h3 className="text-heading-3 mb-4 font-medium">
          Semantic Color Cards
        </h3>
        <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
          <Card className="border-success/20 bg-success/5">
            <CardContent className="pt-6 text-center">
              <div className="text-success text-2xl font-bold">✓</div>
              <p className="text-success text-sm">Success</p>
            </CardContent>
          </Card>
          <Card className="border-warning/20 bg-warning/5">
            <CardContent className="pt-6 text-center">
              <div className="text-warning text-2xl font-bold">⚠</div>
              <p className="text-warning text-sm">Warning</p>
            </CardContent>
          </Card>
          <Card className="border-danger/20 bg-danger/5">
            <CardContent className="pt-6 text-center">
              <div className="text-danger text-2xl font-bold">✕</div>
              <p className="text-danger text-sm">Error</p>
            </CardContent>
          </Card>
          <Card className="border-info/20 bg-info/5">
            <CardContent className="pt-6 text-center">
              <div className="text-info text-2xl font-bold">ℹ</div>
              <p className="text-info text-sm">Info</p>
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
          'Comprehensive showcase of card variations using CoreLive Design System tokens for elevation, colors, and spacing.',
      },
    },
  },
}
