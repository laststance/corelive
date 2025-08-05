import type { Meta, StoryObj } from '@storybook/react'
import {
  Calendar,
  MapPin,
  Star,
  Users,
  Building,
  Mail,
  ExternalLink,
  ShoppingCart,
  Eye,
  Heart,
  MessageCircle,
  Share,
  Award,
  TrendingUp,
  Upload,
} from 'lucide-react'

import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import {
  HoverCard,
  HoverCardContent,
  HoverCardTrigger,
} from '@/components/ui/hover-card'
import { Separator } from '@/components/ui/separator'

const meta: Meta<typeof HoverCard> = {
  title: 'Components/HoverCard',
  component: HoverCard,
  parameters: {
    layout: 'centered',
    docs: {
      description: {
        component:
          'A card component that appears on hover, perfect for showing additional information.',
      },
    },
  },
  tags: ['autodocs'],
}

export default meta
type Story = StoryObj<typeof HoverCard>

export const Default: Story = {
  args: {},
  render: () => (
    <div className="flex items-center space-x-4">
      <HoverCard>
        <HoverCardTrigger asChild>
          <Button variant="link" className="p-0">
            @johndoe
          </Button>
        </HoverCardTrigger>
        <HoverCardContent className="w-80">
          <div className="flex justify-between space-x-4">
            <Avatar>
              <AvatarImage src="https://github.com/vercel.png" />
              <AvatarFallback>JD</AvatarFallback>
            </Avatar>
            <div className="space-y-1">
              <h4 className="text-sm font-semibold">@johndoe</h4>
              <p className="text-sm">
                The React Framework – created and maintained by @vercel.
              </p>
              <div className="flex items-center pt-2">
                <Calendar className="mr-2 h-4 w-4 opacity-70" />
                <span className="text-muted-foreground text-xs">
                  Joined December 2021
                </span>
              </div>
            </div>
          </div>
        </HoverCardContent>
      </HoverCard>
    </div>
  ),
}

export const UserProfile: Story = {
  args: {},
  render: () => (
    <div className="space-y-4 p-8">
      <p className="text-muted-foreground mb-4 text-sm">
        Hover over the user mentions to see their profiles:
      </p>

      <div className="space-y-2">
        <p>
          Great work on the new feature{' '}
          <HoverCard>
            <HoverCardTrigger asChild>
              <Button
                variant="link"
                className="text-primary h-auto p-0 font-medium"
              >
                @sarah_design
              </Button>
            </HoverCardTrigger>
            <HoverCardContent className="w-80">
              <div className="space-y-3">
                <div className="flex items-center space-x-3">
                  <Avatar className="h-12 w-12">
                    <AvatarImage src="https://github.com/shadcn.png" />
                    <AvatarFallback>SD</AvatarFallback>
                  </Avatar>
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <h4 className="text-sm font-semibold">Sarah Johnson</h4>
                      <Badge variant="secondary" className="text-xs">
                        Pro
                      </Badge>
                    </div>
                    <p className="text-muted-foreground text-sm">
                      @sarah_design
                    </p>
                  </div>
                </div>

                <p className="text-sm">
                  Senior UX Designer with a passion for creating intuitive and
                  beautiful user experiences. Currently working on next-gen
                  design systems.
                </p>

                <div className="space-y-2">
                  <div className="text-muted-foreground flex items-center text-sm">
                    <Building className="mr-2 h-4 w-4" />
                    Design Co.
                  </div>
                  <div className="text-muted-foreground flex items-center text-sm">
                    <MapPin className="mr-2 h-4 w-4" />
                    San Francisco, CA
                  </div>
                  <div className="text-muted-foreground flex items-center text-sm">
                    <Calendar className="mr-2 h-4 w-4" />
                    Joined March 2020
                  </div>
                </div>

                <Separator />

                <div className="flex justify-between text-sm">
                  <div className="text-center">
                    <div className="font-semibold">127</div>
                    <div className="text-muted-foreground">Following</div>
                  </div>
                  <div className="text-center">
                    <div className="font-semibold">2.3k</div>
                    <div className="text-muted-foreground">Followers</div>
                  </div>
                  <div className="text-center">
                    <div className="font-semibold">89</div>
                    <div className="text-muted-foreground">Projects</div>
                  </div>
                </div>
              </div>
            </HoverCardContent>
          </HoverCard>{' '}
          and{' '}
          <HoverCard>
            <HoverCardTrigger asChild>
              <Button
                variant="link"
                className="text-primary h-auto p-0 font-medium"
              >
                @mike_dev
              </Button>
            </HoverCardTrigger>
            <HoverCardContent className="w-80">
              <div className="space-y-3">
                <div className="flex items-center space-x-3">
                  <Avatar className="h-12 w-12">
                    <AvatarImage src="https://github.com/vercel.png" />
                    <AvatarFallback>MD</AvatarFallback>
                  </Avatar>
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <h4 className="text-sm font-semibold">Mike Chen</h4>
                      <Badge variant="outline" className="text-xs">
                        Team Lead
                      </Badge>
                    </div>
                    <p className="text-muted-foreground text-sm">@mike_dev</p>
                  </div>
                </div>

                <p className="text-sm">
                  Full-stack developer and team lead. Passionate about clean
                  code, performance optimization, and mentoring junior
                  developers.
                </p>

                <div className="flex flex-wrap gap-1">
                  <Badge variant="secondary" className="text-xs">
                    React
                  </Badge>
                  <Badge variant="secondary" className="text-xs">
                    TypeScript
                  </Badge>
                  <Badge variant="secondary" className="text-xs">
                    Node.js
                  </Badge>
                  <Badge variant="secondary" className="text-xs">
                    GraphQL
                  </Badge>
                </div>

                <div className="flex items-center justify-between pt-2">
                  <div className="text-muted-foreground flex items-center space-x-4 text-sm">
                    <div className="flex items-center">
                      <Star className="mr-1 h-3 w-3" />
                      4.9
                    </div>
                    <div className="flex items-center">
                      <Users className="mr-1 h-3 w-3" />
                      15 reports
                    </div>
                  </div>
                  <Button size="sm" variant="outline">
                    <Mail className="mr-1 h-3 w-3" />
                    Contact
                  </Button>
                </div>
              </div>
            </HoverCardContent>
          </HoverCard>
          ! The collaboration has been amazing.
        </p>
      </div>
    </div>
  ),
}

export const ProductPreview: Story = {
  args: {},
  render: () => (
    <div className="p-8">
      <div className="max-w-md">
        <h3 className="mb-4 text-lg font-semibold">Featured Products</h3>
        <div className="grid grid-cols-2 gap-4">
          <HoverCard>
            <HoverCardTrigger asChild>
              <Card className="cursor-pointer transition-shadow hover:shadow-md">
                <CardContent className="p-4">
                  <div className="bg-muted mb-2 aspect-square rounded-md"></div>
                  <h4 className="text-sm font-medium">Wireless Headphones</h4>
                  <p className="text-muted-foreground text-sm">$99.99</p>
                </CardContent>
              </Card>
            </HoverCardTrigger>
            <HoverCardContent className="w-80">
              <div className="space-y-3">
                <div className="flex items-start justify-between">
                  <div>
                    <h4 className="font-semibold">
                      Premium Wireless Headphones
                    </h4>
                    <p className="text-muted-foreground text-sm">
                      Model: WH-1000XM4
                    </p>
                  </div>
                  <div className="text-right">
                    <div className="text-lg font-bold">$99.99</div>
                    <div className="text-muted-foreground text-sm line-through">
                      $149.99
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <div className="flex">
                    {[...Array(5)].map((_, i) => (
                      <Star
                        key={i}
                        className={`h-4 w-4 ${
                          i < 4
                            ? 'fill-yellow-400 text-yellow-400'
                            : 'text-gray-300'
                        }`}
                      />
                    ))}
                  </div>
                  <span className="text-muted-foreground text-sm">
                    4.5 (2,847 reviews)
                  </span>
                </div>

                <p className="text-sm">
                  Industry-leading noise cancellation with premium sound
                  quality. 30-hour battery life and quick charge technology.
                </p>

                <div className="space-y-2">
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-muted-foreground">Color:</span>
                    <div className="flex gap-1">
                      <div className="h-4 w-4 rounded-full border bg-black"></div>
                      <div className="h-4 w-4 rounded-full border bg-white"></div>
                      <div className="h-4 w-4 rounded-full border bg-blue-500"></div>
                    </div>
                  </div>
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-muted-foreground">In Stock:</span>
                    <Badge
                      variant="outline"
                      className="text-success border-success"
                    >
                      23 available
                    </Badge>
                  </div>
                </div>

                <Separator />

                <div className="flex gap-2">
                  <Button className="flex-1" size="sm">
                    <ShoppingCart className="mr-1 h-4 w-4" />
                    Add to Cart
                  </Button>
                  <Button variant="outline" size="sm">
                    <Heart className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            </HoverCardContent>
          </HoverCard>

          <HoverCard>
            <HoverCardTrigger asChild>
              <Card className="cursor-pointer transition-shadow hover:shadow-md">
                <CardContent className="p-4">
                  <div className="bg-muted mb-2 aspect-square rounded-md"></div>
                  <h4 className="text-sm font-medium">Smart Watch</h4>
                  <p className="text-muted-foreground text-sm">$299.99</p>
                </CardContent>
              </Card>
            </HoverCardTrigger>
            <HoverCardContent className="w-80">
              <div className="space-y-3">
                <div className="flex items-start justify-between">
                  <div>
                    <h4 className="font-semibold">Smart Fitness Watch</h4>
                    <p className="text-muted-foreground text-sm">Series 7</p>
                  </div>
                  <div className="text-right">
                    <div className="text-success text-lg font-bold">
                      $299.99
                    </div>
                    <Badge variant="secondary" className="text-xs">
                      Best Seller
                    </Badge>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <div className="flex">
                    {[...Array(5)].map((_, i) => (
                      <Star
                        key={i}
                        className="h-4 w-4 fill-yellow-400 text-yellow-400"
                      />
                    ))}
                  </div>
                  <span className="text-muted-foreground text-sm">
                    5.0 (1,234 reviews)
                  </span>
                </div>

                <p className="text-sm">
                  Advanced health monitoring, GPS tracking, and 7-day battery
                  life. Water resistant up to 100 meters.
                </p>

                <div className="grid grid-cols-2 gap-4 text-sm">
                  <div className="space-y-1">
                    <div className="text-muted-foreground">Features:</div>
                    <ul className="space-y-0.5 text-xs">
                      <li>• Heart Rate Monitor</li>
                      <li>• GPS Tracking</li>
                      <li>• Sleep Analysis</li>
                    </ul>
                  </div>
                  <div className="space-y-1">
                    <div className="text-muted-foreground">Compatibility:</div>
                    <ul className="space-y-0.5 text-xs">
                      <li>• iOS 14+</li>
                      <li>• Android 8+</li>
                      <li>• Web Dashboard</li>
                    </ul>
                  </div>
                </div>

                <Button className="w-full" size="sm">
                  <ShoppingCart className="mr-1 h-4 w-4" />
                  Quick Add - $299.99
                </Button>
              </div>
            </HoverCardContent>
          </HoverCard>
        </div>
      </div>
    </div>
  ),
}

export const LinkPreview: Story = {
  args: {},
  render: () => (
    <div className="max-w-2xl space-y-6 p-8">
      <h3 className="text-lg font-semibold">Article with Link Previews</h3>

      <div className="prose prose-sm space-y-4">
        <p>
          Check out this amazing{' '}
          <HoverCard>
            <HoverCardTrigger asChild>
              <a
                href="#"
                className="text-primary underline underline-offset-4 transition-all hover:underline-offset-2"
              >
                React documentation
              </a>
            </HoverCardTrigger>
            <HoverCardContent className="w-80">
              <div className="space-y-3">
                <div className="flex items-center space-x-2">
                  <div className="flex h-8 w-8 items-center justify-center rounded bg-blue-500">
                    <span className="text-sm font-bold text-white">R</span>
                  </div>
                  <div>
                    <h4 className="text-sm font-semibold">
                      React Documentation
                    </h4>
                    <p className="text-muted-foreground text-xs">react.dev</p>
                  </div>
                </div>

                <p className="text-sm">
                  The library for web and native user interfaces. Learn React
                  from the ground up with interactive examples and step-by-step
                  guides.
                </p>

                <div className="text-muted-foreground flex items-center justify-between text-xs">
                  <div className="flex items-center gap-4">
                    <div className="flex items-center">
                      <Eye className="mr-1 h-3 w-3" />
                      2.1M views
                    </div>
                    <div className="flex items-center">
                      <Star className="mr-1 h-3 w-3" />
                      4.9 rating
                    </div>
                  </div>
                  <Button size="sm" variant="ghost" className="h-6 px-2">
                    <ExternalLink className="h-3 w-3" />
                  </Button>
                </div>
              </div>
            </HoverCardContent>
          </HoverCard>{' '}
          for building modern web applications. You should also read about{' '}
          <HoverCard>
            <HoverCardTrigger asChild>
              <a
                href="#"
                className="text-primary underline underline-offset-4 transition-all hover:underline-offset-2"
              >
                Next.js best practices
              </a>
            </HoverCardTrigger>
            <HoverCardContent className="w-80">
              <div className="space-y-3">
                <div className="flex items-center space-x-2">
                  <div className="flex h-8 w-8 items-center justify-center rounded bg-black">
                    <span className="text-sm font-bold text-white">N</span>
                  </div>
                  <div>
                    <h4 className="text-sm font-semibold">
                      Next.js Best Practices
                    </h4>
                    <p className="text-muted-foreground text-xs">
                      nextjs.org/learn
                    </p>
                  </div>
                </div>

                <p className="text-sm">
                  Complete guide to building production-ready applications with
                  Next.js. Covers performance optimization, SEO, and deployment
                  strategies.
                </p>

                <div className="flex flex-wrap gap-1">
                  <Badge variant="secondary" className="text-xs">
                    React
                  </Badge>
                  <Badge variant="secondary" className="text-xs">
                    SSR
                  </Badge>
                  <Badge variant="secondary" className="text-xs">
                    Performance
                  </Badge>
                  <Badge variant="secondary" className="text-xs">
                    SEO
                  </Badge>
                </div>

                <div className="flex items-center justify-between">
                  <div className="text-muted-foreground text-xs">
                    Updated 2 days ago
                  </div>
                  <div className="flex items-center gap-2">
                    <Button size="sm" variant="ghost" className="h-6 px-2">
                      <Share className="h-3 w-3" />
                    </Button>
                    <Button size="sm" variant="ghost" className="h-6 px-2">
                      <ExternalLink className="h-3 w-3" />
                    </Button>
                  </div>
                </div>
              </div>
            </HoverCardContent>
          </HoverCard>{' '}
          to get the most out of your development workflow.
        </p>

        <p>
          For more advanced topics, I recommend checking out{' '}
          <HoverCard>
            <HoverCardTrigger asChild>
              <a
                href="#"
                className="text-primary underline underline-offset-4 transition-all hover:underline-offset-2"
              >
                this comprehensive guide
              </a>
            </HoverCardTrigger>
            <HoverCardContent className="w-80">
              <div className="space-y-3">
                <div className="flex aspect-video items-center justify-center rounded-md bg-gradient-to-br from-purple-500 to-pink-500">
                  <span className="font-bold text-white">
                    Advanced React Patterns
                  </span>
                </div>

                <div>
                  <h4 className="font-semibold">
                    Advanced React Patterns & Techniques
                  </h4>
                  <p className="text-muted-foreground text-sm">
                    Master advanced React concepts including render props,
                    compound components, and custom hooks.
                  </p>
                </div>

                <div className="flex items-center justify-between text-sm">
                  <div className="text-muted-foreground flex items-center gap-4">
                    <div className="flex items-center">
                      <Eye className="mr-1 h-3 w-3" />
                      45.2k
                    </div>
                    <div className="flex items-center">
                      <Heart className="mr-1 h-3 w-3" />
                      1.2k
                    </div>
                    <div className="flex items-center">
                      <MessageCircle className="mr-1 h-3 w-3" />
                      234
                    </div>
                  </div>
                  <Badge variant="outline" className="text-xs">
                    <TrendingUp className="mr-1 h-2 w-2" />
                    Trending
                  </Badge>
                </div>

                <Button className="w-full" size="sm">
                  Read Full Article
                </Button>
              </div>
            </HoverCardContent>
          </HoverCard>{' '}
          that covers advanced patterns and optimization techniques.
        </p>
      </div>
    </div>
  ),
}

export const TeamDirectory: Story = {
  args: {},
  render: () => (
    <div className="p-8">
      <h3 className="mb-6 text-lg font-semibold">Meet Our Team</h3>

      <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3">
        {[
          {
            name: 'Alex Rivera',
            role: 'Product Manager',
            avatar: 'AR',
            email: 'alex@company.com',
            location: 'New York, NY',
            skills: ['Strategy', 'Analytics', 'Leadership'],
            projects: 12,
            rating: 4.8,
          },
          {
            name: 'Jordan Kim',
            role: 'Senior Designer',
            avatar: 'JK',
            email: 'jordan@company.com',
            location: 'Los Angeles, CA',
            skills: ['UI Design', 'Prototyping', 'Research'],
            projects: 8,
            rating: 4.9,
          },
          {
            name: 'Sam Taylor',
            role: 'Full Stack Developer',
            avatar: 'ST',
            email: 'sam@company.com',
            location: 'Austin, TX',
            skills: ['React', 'Node.js', 'AWS'],
            projects: 15,
            rating: 4.7,
          },
        ].map((member, index) => (
          <HoverCard key={index}>
            <HoverCardTrigger asChild>
              <Card className="cursor-pointer transition-shadow hover:shadow-md">
                <CardContent className="p-6 text-center">
                  <Avatar className="mx-auto mb-4 h-16 w-16">
                    <AvatarFallback className="text-lg">
                      {member.avatar}
                    </AvatarFallback>
                  </Avatar>
                  <h4 className="font-semibold">{member.name}</h4>
                  <p className="text-muted-foreground text-sm">{member.role}</p>
                </CardContent>
              </Card>
            </HoverCardTrigger>
            <HoverCardContent className="w-80">
              <div className="space-y-4">
                <div className="flex items-center space-x-3">
                  <Avatar className="h-12 w-12">
                    <AvatarFallback>{member.avatar}</AvatarFallback>
                  </Avatar>
                  <div>
                    <h4 className="font-semibold">{member.name}</h4>
                    <p className="text-muted-foreground text-sm">
                      {member.role}
                    </p>
                  </div>
                </div>

                <div className="space-y-2 text-sm">
                  <div className="flex items-center">
                    <Mail className="text-muted-foreground mr-2 h-4 w-4" />
                    {member.email}
                  </div>
                  <div className="flex items-center">
                    <MapPin className="text-muted-foreground mr-2 h-4 w-4" />
                    {member.location}
                  </div>
                </div>

                <div>
                  <p className="mb-2 text-sm font-medium">Skills</p>
                  <div className="flex flex-wrap gap-1">
                    {member.skills.map((skill, skillIndex) => (
                      <Badge
                        key={skillIndex}
                        variant="secondary"
                        className="text-xs"
                      >
                        {skill}
                      </Badge>
                    ))}
                  </div>
                </div>

                <Separator />

                <div className="flex items-center justify-between">
                  <div className="text-center">
                    <div className="text-lg font-semibold">
                      {member.projects}
                    </div>
                    <div className="text-muted-foreground text-xs">
                      Projects
                    </div>
                  </div>
                  <div className="text-center">
                    <div className="flex items-center">
                      <Star className="mr-1 h-4 w-4 fill-yellow-400 text-yellow-400" />
                      <span className="font-semibold">{member.rating}</span>
                    </div>
                    <div className="text-muted-foreground text-xs">Rating</div>
                  </div>
                  <Button size="sm" variant="outline">
                    <MessageCircle className="mr-1 h-3 w-3" />
                    Message
                  </Button>
                </div>
              </div>
            </HoverCardContent>
          </HoverCard>
        ))}
      </div>
    </div>
  ),
}

export const CoreLiveThemeShowcase: Story = {
  args: {},
  render: () => (
    <div className="w-full max-w-6xl space-y-8">
      <div className="space-y-2 text-center">
        <h2 className="text-2xl font-bold">CoreLive Hover Card Components</h2>
        <p className="text-muted-foreground">
          Hover cards showcasing CoreLive Design System integration
        </p>
      </div>

      <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-4">
        {/* Brand Colors */}
        <div className="space-y-4">
          <h3 className="text-primary font-semibold">Brand Colors</h3>

          <HoverCard>
            <HoverCardTrigger asChild>
              <Button className="bg-primary hover:bg-primary/90 w-full">
                Primary Hover Card
              </Button>
            </HoverCardTrigger>
            <HoverCardContent className="border-primary/20 w-64">
              <div className="space-y-2">
                <h4 className="text-primary font-semibold">Primary Theme</h4>
                <p className="text-sm">
                  This hover card uses the primary brand color scheme with
                  complementary styling elements.
                </p>
                <div className="flex items-center gap-2">
                  <div className="bg-primary h-4 w-4 rounded"></div>
                  <span className="text-muted-foreground text-xs">
                    Primary Color Token
                  </span>
                </div>
              </div>
            </HoverCardContent>
          </HoverCard>

          <HoverCard>
            <HoverCardTrigger asChild>
              <Button className="bg-secondary hover:bg-secondary/90 text-secondary-foreground w-full">
                Secondary Hover Card
              </Button>
            </HoverCardTrigger>
            <HoverCardContent className="border-secondary/20 w-64">
              <div className="space-y-2">
                <h4 className="text-secondary-foreground font-semibold">
                  Secondary Theme
                </h4>
                <p className="text-sm">
                  Secondary brand color implementation with proper contrast and
                  accessibility considerations.
                </p>
                <div className="flex items-center gap-2">
                  <div className="bg-secondary h-4 w-4 rounded"></div>
                  <span className="text-muted-foreground text-xs">
                    Secondary Color Token
                  </span>
                </div>
              </div>
            </HoverCardContent>
          </HoverCard>

          <HoverCard>
            <HoverCardTrigger asChild>
              <Button className="bg-accent hover:bg-accent/90 text-accent-foreground w-full">
                Accent Hover Card
              </Button>
            </HoverCardTrigger>
            <HoverCardContent className="w-64">
              <div className="space-y-2">
                <h4 className="font-semibold">Accent Theme</h4>
                <p className="text-sm">
                  Accent color used for highlighting important elements and
                  creating visual hierarchy.
                </p>
                <Badge className="bg-accent text-accent-foreground">
                  Accent Badge
                </Badge>
              </div>
            </HoverCardContent>
          </HoverCard>
        </div>

        {/* Semantic Colors */}
        <div className="space-y-4">
          <h3 className="text-success font-semibold">Semantic Colors</h3>

          <HoverCard>
            <HoverCardTrigger asChild>
              <Button className="bg-success hover:bg-success/90 text-success-foreground w-full">
                Success State
              </Button>
            </HoverCardTrigger>
            <HoverCardContent className="border-success/20 w-64">
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <Award className="text-success h-4 w-4" />
                  <h4 className="text-success font-semibold">Success</h4>
                </div>
                <p className="text-sm">
                  Operation completed successfully. All systems are functioning
                  normally.
                </p>
                <Badge
                  variant="outline"
                  className="border-success text-success"
                >
                  Status: Active
                </Badge>
              </div>
            </HoverCardContent>
          </HoverCard>

          <HoverCard>
            <HoverCardTrigger asChild>
              <Button className="bg-warning hover:bg-warning/90 text-warning-foreground w-full">
                Warning State
              </Button>
            </HoverCardTrigger>
            <HoverCardContent className="border-warning/20 w-64">
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <ExternalLink className="text-warning h-4 w-4" />
                  <h4 className="text-warning font-semibold">Warning</h4>
                </div>
                <p className="text-sm">
                  Attention required. Please review the following items before
                  proceeding.
                </p>
                <Badge
                  variant="outline"
                  className="border-warning text-warning"
                >
                  Needs Review
                </Badge>
              </div>
            </HoverCardContent>
          </HoverCard>

          <HoverCard>
            <HoverCardTrigger asChild>
              <Button
                variant="destructive"
                className="bg-danger hover:bg-danger/90 w-full"
              >
                Danger State
              </Button>
            </HoverCardTrigger>
            <HoverCardContent className="border-danger/20 w-64">
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <ExternalLink className="text-danger h-4 w-4" />
                  <h4 className="text-danger font-semibold">Critical Error</h4>
                </div>
                <p className="text-sm">
                  Immediate action required. System has encountered a critical
                  error.
                </p>
                <Badge variant="destructive" className="bg-danger">
                  Action Required
                </Badge>
              </div>
            </HoverCardContent>
          </HoverCard>
        </div>

        {/* UI Colors */}
        <div className="space-y-4">
          <h3 className="font-semibold">UI Colors</h3>

          <HoverCard>
            <HoverCardTrigger asChild>
              <Button variant="outline" className="w-full">
                Neutral Theme
              </Button>
            </HoverCardTrigger>
            <HoverCardContent className="w-64">
              <div className="space-y-2">
                <h4 className="font-semibold">Neutral Design</h4>
                <p className="text-muted-foreground text-sm">
                  Clean, minimal design using neutral color palette for maximum
                  readability and accessibility.
                </p>
                <Separator />
                <div className="flex items-center justify-between text-xs">
                  <span>Foreground</span>
                  <div className="bg-foreground h-4 w-4 rounded"></div>
                </div>
                <div className="flex items-center justify-between text-xs">
                  <span>Muted</span>
                  <div className="bg-muted h-4 w-4 rounded"></div>
                </div>
              </div>
            </HoverCardContent>
          </HoverCard>

          <HoverCard>
            <HoverCardTrigger asChild>
              <Button variant="ghost" className="border-border w-full border">
                Surface Theme
              </Button>
            </HoverCardTrigger>
            <HoverCardContent className="bg-surface border-border w-64">
              <div className="space-y-2">
                <h4 className="font-semibold">Surface Design</h4>
                <p className="text-muted-foreground text-sm">
                  Elevated surface with subtle shadows and proper layering using
                  surface color tokens.
                </p>
                <div className="bg-background rounded p-2 text-xs">
                  Nested surface example
                </div>
              </div>
            </HoverCardContent>
          </HoverCard>

          <HoverCard>
            <HoverCardTrigger asChild>
              <Button variant="secondary" className="w-full">
                Border Emphasis
              </Button>
            </HoverCardTrigger>
            <HoverCardContent className="border-border w-64 border-2">
              <div className="space-y-2">
                <h4 className="font-semibold">Border Styling</h4>
                <p className="text-muted-foreground text-sm">
                  Prominent borders using border color tokens for clear visual
                  separation and hierarchy.
                </p>
                <div className="border-border rounded border p-2 text-xs">
                  Bordered content area
                </div>
              </div>
            </HoverCardContent>
          </HoverCard>
        </div>

        {/* Interactive States */}
        <div className="space-y-4">
          <h3 className="text-info font-semibold">Interactive States</h3>

          <HoverCard>
            <HoverCardTrigger asChild>
              <Button className="bg-info hover:bg-info/90 text-info-foreground w-full">
                Information
              </Button>
            </HoverCardTrigger>
            <HoverCardContent className="border-info/20 w-64">
              <div className="space-y-3">
                <div className="flex items-center gap-2">
                  <div className="bg-info h-2 w-2 animate-pulse rounded-full"></div>
                  <h4 className="text-info font-semibold">Live Status</h4>
                </div>
                <p className="text-sm">
                  Real-time information display with dynamic content updates and
                  interactive elements.
                </p>
                <div className="flex gap-2">
                  <Button size="sm" variant="outline" className="flex-1">
                    <Eye className="mr-1 h-3 w-3" />
                    View
                  </Button>
                  <Button size="sm" className="bg-info hover:bg-info/90 flex-1">
                    <MessageCircle className="mr-1 h-3 w-3" />
                    Chat
                  </Button>
                </div>
              </div>
            </HoverCardContent>
          </HoverCard>

          <HoverCard>
            <HoverCardTrigger asChild>
              <Button className="bg-discovery hover:bg-discovery/90 text-discovery-foreground w-full">
                Discovery
              </Button>
            </HoverCardTrigger>
            <HoverCardContent className="border-discovery/20 w-64">
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <TrendingUp className="text-discovery h-4 w-4" />
                  <h4 className="text-discovery font-semibold">New Feature</h4>
                </div>
                <p className="text-sm">
                  Discover new functionality and explore enhanced capabilities
                  with our latest updates.
                </p>
                <Badge className="bg-discovery text-discovery-foreground">
                  Beta Available
                </Badge>
              </div>
            </HoverCardContent>
          </HoverCard>

          <HoverCard>
            <HoverCardTrigger asChild>
              <div className="border-border hover:bg-muted/50 cursor-pointer rounded-lg border border-dashed p-4 transition-colors">
                <div className="text-center">
                  <Upload className="text-muted-foreground mx-auto mb-2 h-6 w-6" />
                  <p className="text-sm font-medium">Hover for Details</p>
                </div>
              </div>
            </HoverCardTrigger>
            <HoverCardContent className="w-64">
              <div className="space-y-3">
                <h4 className="font-semibold">Component Tokens</h4>
                <div className="space-y-2 text-xs">
                  <div className="flex justify-between">
                    <span>Background:</span>
                    <code className="bg-muted rounded px-1">
                      var(--popover)
                    </code>
                  </div>
                  <div className="flex justify-between">
                    <span>Text Color:</span>
                    <code className="bg-muted rounded px-1">
                      var(--popover-foreground)
                    </code>
                  </div>
                  <div className="flex justify-between">
                    <span>Border:</span>
                    <code className="bg-muted rounded px-1">var(--border)</code>
                  </div>
                  <div className="flex justify-between">
                    <span>Shadow:</span>
                    <code className="bg-muted rounded px-1">md</code>
                  </div>
                </div>
                <Separator />
                <p className="text-muted-foreground text-xs">
                  All hover cards use consistent CoreLive Design System tokens
                  for styling and theming.
                </p>
              </div>
            </HoverCardContent>
          </HoverCard>
        </div>
      </div>

      {/* Usage Examples */}
      <Card>
        <CardContent className="p-6">
          <h3 className="mb-4 font-semibold">CoreLive Hover Card Usage</h3>
          <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
            <div>
              <h4 className="mb-2 font-medium">Design Tokens</h4>
              <div className="space-y-1 text-sm">
                <div className="flex items-center gap-2">
                  <Badge variant="outline">--popover</Badge>
                  <span className="text-muted-foreground">
                    Background color
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <Badge variant="outline">--popover-foreground</Badge>
                  <span className="text-muted-foreground">Text color</span>
                </div>
                <div className="flex items-center gap-2">
                  <Badge variant="outline">--border</Badge>
                  <span className="text-muted-foreground">Border color</span>
                </div>
                <div className="flex items-center gap-2">
                  <Badge variant="outline">shadow-md</Badge>
                  <span className="text-muted-foreground">
                    Elevation shadow
                  </span>
                </div>
              </div>
            </div>
            <div>
              <h4 className="mb-2 font-medium">Animation Properties</h4>
              <div className="space-y-1 text-sm">
                <div className="flex items-center gap-2">
                  <Badge variant="outline">fade-in-0</Badge>
                  <span className="text-muted-foreground">
                    Entrance animation
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <Badge variant="outline">zoom-in-95</Badge>
                  <span className="text-muted-foreground">Scale animation</span>
                </div>
                <div className="flex items-center gap-2">
                  <Badge variant="outline">slide-in-from-*</Badge>
                  <span className="text-muted-foreground">
                    Directional slide
                  </span>
                </div>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  ),
}
