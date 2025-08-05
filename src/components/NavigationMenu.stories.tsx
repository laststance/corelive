import type { Meta, StoryObj } from '@storybook/react'
import {
  Home,
  ShoppingCart,
  Info,
  Mail,
  Phone,
  Globe,
  Zap,
  Shield,
  Heart,
  Star,
  Briefcase,
  Code,
  Palette,
  Camera,
  Book,
  FileText,
  Video,
  Music,
  Image,
  Download,
  Headphones,
  Smartphone,
  Laptop,
  Monitor,
  Gamepad2,
  Shirt,
  Watch,
  Building,
  Users,
  Calendar,
  TrendingUp,
  Award,
  Target,
  Lightbulb,
  Settings,
  Grid3X3,
  List,
  Archive,
  Clock,
  Bookmark,
  Truck,
  Gift,
  RotateCcw,
  PlayCircle,
} from 'lucide-react'

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
  NavigationMenu,
  NavigationMenuContent,
  NavigationMenuItem,
  NavigationMenuLink,
  NavigationMenuList,
  NavigationMenuTrigger,
  navigationMenuTriggerStyle,
} from '@/components/ui/navigation-menu'
import { Separator } from '@/components/ui/separator'
import { cn } from '@/lib/utils'

const meta: Meta<typeof NavigationMenu> = {
  title: 'Components/NavigationMenu',
  component: NavigationMenu,
  parameters: {
    layout: 'centered',
    docs: {
      description: {
        component:
          'A navigation menu component with dropdown content areas, perfect for website headers.',
      },
    },
  },
  tags: ['autodocs'],
}

export default meta
type Story = StoryObj<typeof NavigationMenu>

export const Default: Story = {
  args: {},
  render: () => (
    <NavigationMenu>
      <NavigationMenuList>
        <NavigationMenuItem>
          <NavigationMenuTrigger>Getting started</NavigationMenuTrigger>
          <NavigationMenuContent>
            <ul className="grid gap-3 p-6 md:w-[400px] lg:w-[500px] lg:grid-cols-[.75fr_1fr]">
              <li className="row-span-3">
                <NavigationMenuLink asChild>
                  <a
                    className="from-muted/50 to-muted flex h-full w-full flex-col justify-end rounded-md bg-gradient-to-b p-6 no-underline outline-none select-none focus:shadow-md"
                    href="/"
                  >
                    <Zap className="h-6 w-6" />
                    <div className="mt-4 mb-2 text-lg font-medium">
                      shadcn/ui
                    </div>
                    <p className="text-muted-foreground text-sm leading-tight">
                      Beautifully designed components built with Radix UI and
                      Tailwind CSS.
                    </p>
                  </a>
                </NavigationMenuLink>
              </li>
              <li>
                <NavigationMenuLink asChild>
                  <a href="/docs">
                    <div className="mb-2 text-sm leading-none font-medium">
                      Introduction
                    </div>
                    <p className="text-muted-foreground line-clamp-2 text-sm leading-snug">
                      Re-usable components built using Radix UI and Tailwind
                      CSS.
                    </p>
                  </a>
                </NavigationMenuLink>
              </li>
              <li>
                <NavigationMenuLink asChild>
                  <a href="/docs/installation">
                    <div className="mb-2 text-sm leading-none font-medium">
                      Installation
                    </div>
                    <p className="text-muted-foreground line-clamp-2 text-sm leading-snug">
                      How to install dependencies and structure your app.
                    </p>
                  </a>
                </NavigationMenuLink>
              </li>
              <li>
                <NavigationMenuLink asChild>
                  <a href="/docs/primitives/typography">
                    <div className="mb-2 text-sm leading-none font-medium">
                      Typography
                    </div>
                    <p className="text-muted-foreground line-clamp-2 text-sm leading-snug">
                      Styles for headings, paragraphs, lists...etc
                    </p>
                  </a>
                </NavigationMenuLink>
              </li>
            </ul>
          </NavigationMenuContent>
        </NavigationMenuItem>
        <NavigationMenuItem>
          <NavigationMenuTrigger>Components</NavigationMenuTrigger>
          <NavigationMenuContent>
            <ul className="grid w-[400px] gap-3 p-4 md:w-[500px] md:grid-cols-2 lg:w-[600px]">
              {[
                {
                  title: 'Alert Dialog',
                  href: '/docs/primitives/alert-dialog',
                  description:
                    'A modal dialog that interrupts the user with important content.',
                },
                {
                  title: 'Hover Card',
                  href: '/docs/primitives/hover-card',
                  description:
                    'For sighted users to preview content available behind a link.',
                },
                {
                  title: 'Progress',
                  href: '/docs/primitives/progress',
                  description:
                    'Displays an indicator showing the completion progress.',
                },
                {
                  title: 'Scroll-area',
                  href: '/docs/primitives/scroll-area',
                  description: 'Visually or semantically separates content.',
                },
                {
                  title: 'Tabs',
                  href: '/docs/primitives/tabs',
                  description: 'A set of layered sections of content.',
                },
                {
                  title: 'Tooltip',
                  href: '/docs/primitives/tooltip',
                  description:
                    'A popup that displays information related to an element.',
                },
              ].map((component) => (
                <li key={component.title}>
                  <NavigationMenuLink asChild>
                    <a href={component.href}>
                      <div className="mb-2 text-sm leading-none font-medium">
                        {component.title}
                      </div>
                      <p className="text-muted-foreground line-clamp-2 text-sm leading-snug">
                        {component.description}
                      </p>
                    </a>
                  </NavigationMenuLink>
                </li>
              ))}
            </ul>
          </NavigationMenuContent>
        </NavigationMenuItem>
        <NavigationMenuItem>
          <NavigationMenuLink
            className={navigationMenuTriggerStyle()}
            href="/docs"
          >
            Documentation
          </NavigationMenuLink>
        </NavigationMenuItem>
      </NavigationMenuList>
    </NavigationMenu>
  ),
}

export const ECommerceNavigation: Story = {
  args: {},
  render: () => (
    <Card className="w-full max-w-6xl">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <ShoppingCart className="h-5 w-5" />
          E-Commerce Store
        </CardTitle>
        <CardDescription>
          Complete e-commerce navigation with product categories and mega menu
        </CardDescription>
      </CardHeader>
      <CardContent>
        <NavigationMenu>
          <NavigationMenuList>
            <NavigationMenuItem>
              <NavigationMenuLink
                className={navigationMenuTriggerStyle()}
                href="/"
              >
                <Home className="mr-2 h-4 w-4" />
                Home
              </NavigationMenuLink>
            </NavigationMenuItem>

            <NavigationMenuItem>
              <NavigationMenuTrigger>
                <Laptop className="mr-2 h-4 w-4" />
                Electronics
              </NavigationMenuTrigger>
              <NavigationMenuContent>
                <div className="grid gap-3 p-6 md:w-[400px] lg:w-[600px] lg:grid-cols-3">
                  <div className="space-y-3">
                    <h4 className="text-muted-foreground text-sm font-medium tracking-wide uppercase">
                      Computers
                    </h4>
                    <div className="space-y-2">
                      <NavigationMenuLink asChild>
                        <a href="/laptops" className="flex items-center gap-2">
                          <Laptop className="h-4 w-4" />
                          <div>
                            <div className="text-sm font-medium">Laptops</div>
                            <p className="text-muted-foreground text-xs">
                              Gaming & Work laptops
                            </p>
                          </div>
                        </a>
                      </NavigationMenuLink>
                      <NavigationMenuLink asChild>
                        <a href="/desktops" className="flex items-center gap-2">
                          <Monitor className="h-4 w-4" />
                          <div>
                            <div className="text-sm font-medium">Desktops</div>
                            <p className="text-muted-foreground text-xs">
                              Custom & Pre-built PCs
                            </p>
                          </div>
                        </a>
                      </NavigationMenuLink>
                    </div>
                  </div>

                  <div className="space-y-3">
                    <h4 className="text-muted-foreground text-sm font-medium tracking-wide uppercase">
                      Mobile & Audio
                    </h4>
                    <div className="space-y-2">
                      <NavigationMenuLink asChild>
                        <a
                          href="/smartphones"
                          className="flex items-center gap-2"
                        >
                          <Smartphone className="h-4 w-4" />
                          <div>
                            <div className="text-sm font-medium">
                              Smartphones
                            </div>
                            <p className="text-muted-foreground text-xs">
                              Latest iPhone & Android
                            </p>
                          </div>
                        </a>
                      </NavigationMenuLink>
                      <NavigationMenuLink asChild>
                        <a
                          href="/headphones"
                          className="flex items-center gap-2"
                        >
                          <Headphones className="h-4 w-4" />
                          <div>
                            <div className="text-sm font-medium">
                              Headphones
                            </div>
                            <p className="text-muted-foreground text-xs">
                              Wireless & Wired
                            </p>
                          </div>
                        </a>
                      </NavigationMenuLink>
                    </div>
                  </div>

                  <div className="space-y-3">
                    <h4 className="text-muted-foreground text-sm font-medium tracking-wide uppercase">
                      Gaming
                    </h4>
                    <div className="space-y-2">
                      <NavigationMenuLink asChild>
                        <a href="/gaming" className="flex items-center gap-2">
                          <Gamepad2 className="h-4 w-4" />
                          <div>
                            <div className="text-sm font-medium">
                              Gaming Consoles
                            </div>
                            <p className="text-muted-foreground text-xs">
                              PlayStation, Xbox, Switch
                            </p>
                          </div>
                        </a>
                      </NavigationMenuLink>
                      <NavigationMenuLink asChild>
                        <a href="/accessories">
                          <div className="text-sm font-medium">
                            Gaming Accessories
                          </div>
                          <p className="text-muted-foreground text-xs">
                            Controllers, Keyboards, Mice
                          </p>
                        </a>
                      </NavigationMenuLink>
                    </div>
                  </div>
                </div>
              </NavigationMenuContent>
            </NavigationMenuItem>

            <NavigationMenuItem>
              <NavigationMenuTrigger>
                <Shirt className="mr-2 h-4 w-4" />
                Fashion
              </NavigationMenuTrigger>
              <NavigationMenuContent>
                <div className="grid gap-3 p-6 md:w-[400px] lg:w-[500px] lg:grid-cols-2">
                  <div className="space-y-3">
                    <h4 className="text-muted-foreground text-sm font-medium tracking-wide uppercase">
                      Men's Fashion
                    </h4>
                    <div className="space-y-2">
                      <NavigationMenuLink asChild>
                        <a href="/mens-clothing">
                          <div className="text-sm font-medium">Clothing</div>
                          <p className="text-muted-foreground text-xs">
                            Shirts, Pants, Jackets
                          </p>
                        </a>
                      </NavigationMenuLink>
                      <NavigationMenuLink asChild>
                        <a href="/mens-shoes">
                          <div className="text-sm font-medium">Shoes</div>
                          <p className="text-muted-foreground text-xs">
                            Sneakers, Dress, Casual
                          </p>
                        </a>
                      </NavigationMenuLink>
                      <NavigationMenuLink asChild>
                        <a
                          href="/mens-accessories"
                          className="flex items-center gap-2"
                        >
                          <Watch className="h-4 w-4" />
                          <div>
                            <div className="text-sm font-medium">
                              Accessories
                            </div>
                            <p className="text-muted-foreground text-xs">
                              Watches, Belts, Wallets
                            </p>
                          </div>
                        </a>
                      </NavigationMenuLink>
                    </div>
                  </div>

                  <div className="space-y-3">
                    <h4 className="text-muted-foreground text-sm font-medium tracking-wide uppercase">
                      Women's Fashion
                    </h4>
                    <div className="space-y-2">
                      <NavigationMenuLink asChild>
                        <a href="/womens-clothing">
                          <div className="text-sm font-medium">Clothing</div>
                          <p className="text-muted-foreground text-xs">
                            Dresses, Tops, Bottoms
                          </p>
                        </a>
                      </NavigationMenuLink>
                      <NavigationMenuLink asChild>
                        <a href="/womens-shoes">
                          <div className="text-sm font-medium">Shoes</div>
                          <p className="text-muted-foreground text-xs">
                            Heels, Flats, Boots
                          </p>
                        </a>
                      </NavigationMenuLink>
                      <NavigationMenuLink asChild>
                        <a href="/womens-accessories">
                          <div className="text-sm font-medium">Accessories</div>
                          <p className="text-muted-foreground text-xs">
                            Jewelry, Bags, Scarves
                          </p>
                        </a>
                      </NavigationMenuLink>
                    </div>
                  </div>
                </div>
              </NavigationMenuContent>
            </NavigationMenuItem>

            <NavigationMenuItem>
              <NavigationMenuTrigger>
                <Gift className="mr-2 h-4 w-4" />
                Deals
              </NavigationMenuTrigger>
              <NavigationMenuContent>
                <ul className="grid gap-3 p-6 md:w-[400px] lg:w-[500px] lg:grid-cols-[.75fr_1fr]">
                  <li className="row-span-3">
                    <NavigationMenuLink asChild>
                      <a
                        className="flex h-full w-full flex-col justify-end rounded-md bg-gradient-to-b from-red-50 to-red-100 p-6 no-underline outline-none select-none focus:shadow-md dark:from-red-950 dark:to-red-900"
                        href="/deals"
                      >
                        <Gift className="h-6 w-6 text-red-600" />
                        <div className="mt-4 mb-2 text-lg font-medium">
                          Today's Deals
                        </div>
                        <p className="text-muted-foreground text-sm leading-tight">
                          Up to 70% off on selected items. Limited time offers!
                        </p>
                      </a>
                    </NavigationMenuLink>
                  </li>
                  <li>
                    <NavigationMenuLink asChild>
                      <a href="/flash-sales">
                        <div className="mb-2 flex items-center gap-2 text-sm leading-none font-medium">
                          <Zap className="h-3 w-3 text-yellow-500" />
                          Flash Sales
                        </div>
                        <p className="text-muted-foreground line-clamp-2 text-sm leading-snug">
                          24-hour lightning deals on popular products.
                        </p>
                      </a>
                    </NavigationMenuLink>
                  </li>
                  <li>
                    <NavigationMenuLink asChild>
                      <a href="/clearance">
                        <div className="mb-2 text-sm leading-none font-medium">
                          Clearance
                        </div>
                        <p className="text-muted-foreground line-clamp-2 text-sm leading-snug">
                          Final markdowns on seasonal items.
                        </p>
                      </a>
                    </NavigationMenuLink>
                  </li>
                  <li>
                    <NavigationMenuLink asChild>
                      <a href="/bundles">
                        <div className="mb-2 text-sm leading-none font-medium">
                          Bundle Deals
                        </div>
                        <p className="text-muted-foreground line-clamp-2 text-sm leading-snug">
                          Save more when you buy together.
                        </p>
                      </a>
                    </NavigationMenuLink>
                  </li>
                </ul>
              </NavigationMenuContent>
            </NavigationMenuItem>

            <NavigationMenuItem>
              <NavigationMenuLink
                className={navigationMenuTriggerStyle()}
                href="/support"
              >
                <Headphones className="mr-2 h-4 w-4" />
                Support
              </NavigationMenuLink>
            </NavigationMenuItem>
          </NavigationMenuList>
        </NavigationMenu>

        <div className="mt-8 grid grid-cols-1 gap-4 md:grid-cols-3">
          <Card>
            <CardContent className="p-4 text-center">
              <Truck className="text-primary mx-auto mb-2 h-8 w-8" />
              <h3 className="font-medium">Free Shipping</h3>
              <p className="text-muted-foreground text-sm">
                On orders over $50
              </p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4 text-center">
              <RotateCcw className="text-primary mx-auto mb-2 h-8 w-8" />
              <h3 className="font-medium">Easy Returns</h3>
              <p className="text-muted-foreground text-sm">
                30-day return policy
              </p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4 text-center">
              <Shield className="text-primary mx-auto mb-2 h-8 w-8" />
              <h3 className="font-medium">Secure Payment</h3>
              <p className="text-muted-foreground text-sm">
                SSL encrypted checkout
              </p>
            </CardContent>
          </Card>
        </div>
      </CardContent>
    </Card>
  ),
}

export const CorporateWebsite: Story = {
  args: {},
  render: () => (
    <Card className="w-full max-w-5xl">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Building className="h-5 w-5" />
          Corporate Website
        </CardTitle>
        <CardDescription>
          Professional corporate navigation with services and company
          information
        </CardDescription>
      </CardHeader>
      <CardContent>
        <NavigationMenu>
          <NavigationMenuList>
            <NavigationMenuItem>
              <NavigationMenuLink
                className={navigationMenuTriggerStyle()}
                href="/"
              >
                <Home className="mr-2 h-4 w-4" />
                Home
              </NavigationMenuLink>
            </NavigationMenuItem>

            <NavigationMenuItem>
              <NavigationMenuTrigger>
                <Building className="mr-2 h-4 w-4" />
                About
              </NavigationMenuTrigger>
              <NavigationMenuContent>
                <div className="grid gap-3 p-6 md:w-[400px] lg:w-[500px] lg:grid-cols-2">
                  <div className="space-y-3">
                    <h4 className="text-muted-foreground text-sm font-medium tracking-wide uppercase">
                      Company
                    </h4>
                    <div className="space-y-2">
                      <NavigationMenuLink asChild>
                        <a href="/about" className="flex items-center gap-2">
                          <Info className="h-4 w-4" />
                          <div>
                            <div className="text-sm font-medium">Our Story</div>
                            <p className="text-muted-foreground text-xs">
                              Learn about our mission
                            </p>
                          </div>
                        </a>
                      </NavigationMenuLink>
                      <NavigationMenuLink asChild>
                        <a href="/team" className="flex items-center gap-2">
                          <Users className="h-4 w-4" />
                          <div>
                            <div className="text-sm font-medium">
                              Leadership Team
                            </div>
                            <p className="text-muted-foreground text-xs">
                              Meet our executives
                            </p>
                          </div>
                        </a>
                      </NavigationMenuLink>
                      <NavigationMenuLink asChild>
                        <a href="/careers" className="flex items-center gap-2">
                          <Briefcase className="h-4 w-4" />
                          <div>
                            <div className="text-sm font-medium">Careers</div>
                            <p className="text-muted-foreground text-xs">
                              Join our team
                            </p>
                          </div>
                        </a>
                      </NavigationMenuLink>
                    </div>
                  </div>

                  <div className="space-y-3">
                    <h4 className="text-muted-foreground text-sm font-medium tracking-wide uppercase">
                      Values
                    </h4>
                    <div className="space-y-2">
                      <NavigationMenuLink asChild>
                        <a href="/mission" className="flex items-center gap-2">
                          <Target className="h-4 w-4" />
                          <div>
                            <div className="text-sm font-medium">
                              Mission & Vision
                            </div>
                            <p className="text-muted-foreground text-xs">
                              Our core purpose
                            </p>
                          </div>
                        </a>
                      </NavigationMenuLink>
                      <NavigationMenuLink asChild>
                        <a
                          href="/sustainability"
                          className="flex items-center gap-2"
                        >
                          <Globe className="h-4 w-4" />
                          <div>
                            <div className="text-sm font-medium">
                              Sustainability
                            </div>
                            <p className="text-muted-foreground text-xs">
                              Environmental commitment
                            </p>
                          </div>
                        </a>
                      </NavigationMenuLink>
                      <NavigationMenuLink asChild>
                        <a href="/awards" className="flex items-center gap-2">
                          <Award className="h-4 w-4" />
                          <div>
                            <div className="text-sm font-medium">Awards</div>
                            <p className="text-muted-foreground text-xs">
                              Recognition & achievements
                            </p>
                          </div>
                        </a>
                      </NavigationMenuLink>
                    </div>
                  </div>
                </div>
              </NavigationMenuContent>
            </NavigationMenuItem>

            <NavigationMenuItem>
              <NavigationMenuTrigger>
                <Zap className="mr-2 h-4 w-4" />
                Services
              </NavigationMenuTrigger>
              <NavigationMenuContent>
                <div className="grid gap-3 p-6 md:w-[500px] lg:w-[600px] lg:grid-cols-3">
                  <div className="space-y-3">
                    <h4 className="text-muted-foreground text-sm font-medium tracking-wide uppercase">
                      Technology
                    </h4>
                    <div className="space-y-2">
                      <NavigationMenuLink asChild>
                        <a
                          href="/web-development"
                          className="flex items-center gap-2"
                        >
                          <Code className="h-4 w-4" />
                          <div>
                            <div className="text-sm font-medium">
                              Web Development
                            </div>
                            <p className="text-muted-foreground text-xs">
                              Custom web solutions
                            </p>
                          </div>
                        </a>
                      </NavigationMenuLink>
                      <NavigationMenuLink asChild>
                        <a
                          href="/mobile-apps"
                          className="flex items-center gap-2"
                        >
                          <Smartphone className="h-4 w-4" />
                          <div>
                            <div className="text-sm font-medium">
                              Mobile Apps
                            </div>
                            <p className="text-muted-foreground text-xs">
                              iOS & Android development
                            </p>
                          </div>
                        </a>
                      </NavigationMenuLink>
                    </div>
                  </div>

                  <div className="space-y-3">
                    <h4 className="text-muted-foreground text-sm font-medium tracking-wide uppercase">
                      Design
                    </h4>
                    <div className="space-y-2">
                      <NavigationMenuLink asChild>
                        <a
                          href="/ui-ux-design"
                          className="flex items-center gap-2"
                        >
                          <Palette className="h-4 w-4" />
                          <div>
                            <div className="text-sm font-medium">
                              UI/UX Design
                            </div>
                            <p className="text-muted-foreground text-xs">
                              User-centered design
                            </p>
                          </div>
                        </a>
                      </NavigationMenuLink>
                      <NavigationMenuLink asChild>
                        <a href="/branding" className="flex items-center gap-2">
                          <Star className="h-4 w-4" />
                          <div>
                            <div className="text-sm font-medium">Branding</div>
                            <p className="text-muted-foreground text-xs">
                              Brand identity & strategy
                            </p>
                          </div>
                        </a>
                      </NavigationMenuLink>
                    </div>
                  </div>

                  <div className="space-y-3">
                    <h4 className="text-muted-foreground text-sm font-medium tracking-wide uppercase">
                      Consulting
                    </h4>
                    <div className="space-y-2">
                      <NavigationMenuLink asChild>
                        <a href="/strategy" className="flex items-center gap-2">
                          <Lightbulb className="h-4 w-4" />
                          <div>
                            <div className="text-sm font-medium">Strategy</div>
                            <p className="text-muted-foreground text-xs">
                              Business transformation
                            </p>
                          </div>
                        </a>
                      </NavigationMenuLink>
                      <NavigationMenuLink asChild>
                        <a
                          href="/analytics"
                          className="flex items-center gap-2"
                        >
                          <TrendingUp className="h-4 w-4" />
                          <div>
                            <div className="text-sm font-medium">Analytics</div>
                            <p className="text-muted-foreground text-xs">
                              Data-driven insights
                            </p>
                          </div>
                        </a>
                      </NavigationMenuLink>
                    </div>
                  </div>
                </div>
              </NavigationMenuContent>
            </NavigationMenuItem>

            <NavigationMenuItem>
              <NavigationMenuTrigger>
                <FileText className="mr-2 h-4 w-4" />
                Resources
              </NavigationMenuTrigger>
              <NavigationMenuContent>
                <ul className="grid gap-3 p-6 md:w-[400px] lg:w-[500px] lg:grid-cols-[.75fr_1fr]">
                  <li className="row-span-4">
                    <NavigationMenuLink asChild>
                      <a
                        className="from-muted/50 to-muted flex h-full w-full flex-col justify-end rounded-md bg-gradient-to-b p-6 no-underline outline-none select-none focus:shadow-md"
                        href="/resources"
                      >
                        <Book className="h-6 w-6" />
                        <div className="mt-4 mb-2 text-lg font-medium">
                          Knowledge Hub
                        </div>
                        <p className="text-muted-foreground text-sm leading-tight">
                          Insights, guides, and best practices from our experts.
                        </p>
                      </a>
                    </NavigationMenuLink>
                  </li>
                  <li>
                    <NavigationMenuLink asChild>
                      <a href="/blog">
                        <div className="mb-2 text-sm leading-none font-medium">
                          Blog
                        </div>
                        <p className="text-muted-foreground line-clamp-2 text-sm leading-snug">
                          Latest news and industry insights.
                        </p>
                      </a>
                    </NavigationMenuLink>
                  </li>
                  <li>
                    <NavigationMenuLink asChild>
                      <a href="/case-studies">
                        <div className="mb-2 text-sm leading-none font-medium">
                          Case Studies
                        </div>
                        <p className="text-muted-foreground line-clamp-2 text-sm leading-snug">
                          Real-world success stories and results.
                        </p>
                      </a>
                    </NavigationMenuLink>
                  </li>
                  <li>
                    <NavigationMenuLink asChild>
                      <a href="/whitepapers">
                        <div className="mb-2 text-sm leading-none font-medium">
                          Whitepapers
                        </div>
                        <p className="text-muted-foreground line-clamp-2 text-sm leading-snug">
                          In-depth research and analysis.
                        </p>
                      </a>
                    </NavigationMenuLink>
                  </li>
                  <li>
                    <NavigationMenuLink asChild>
                      <a href="/webinars">
                        <div className="mb-2 text-sm leading-none font-medium">
                          Webinars
                        </div>
                        <p className="text-muted-foreground line-clamp-2 text-sm leading-snug">
                          Live and on-demand educational content.
                        </p>
                      </a>
                    </NavigationMenuLink>
                  </li>
                </ul>
              </NavigationMenuContent>
            </NavigationMenuItem>

            <NavigationMenuItem>
              <NavigationMenuLink
                className={navigationMenuTriggerStyle()}
                href="/contact"
              >
                <Mail className="mr-2 h-4 w-4" />
                Contact
              </NavigationMenuLink>
            </NavigationMenuItem>
          </NavigationMenuList>
        </NavigationMenu>

        <div className="bg-muted mt-8 rounded-lg p-6">
          <div className="flex flex-col items-center justify-between gap-4 md:flex-row">
            <div className="text-center md:text-left">
              <h3 className="font-semibold">Ready to get started?</h3>
              <p className="text-muted-foreground text-sm">
                Let's discuss how we can help transform your business.
              </p>
            </div>
            <div className="flex gap-2">
              <Button variant="outline">
                <Phone className="mr-2 h-4 w-4" />
                Call Us
              </Button>
              <Button>
                <Calendar className="mr-2 h-4 w-4" />
                Schedule Demo
              </Button>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  ),
}

export const MediaPortalNavigation: Story = {
  args: {},
  render: () => (
    <Card className="w-full max-w-5xl">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <PlayCircle className="h-5 w-5" />
          Media Portal
        </CardTitle>
        <CardDescription>
          Entertainment website with multimedia content categories
        </CardDescription>
      </CardHeader>
      <CardContent>
        <NavigationMenu>
          <NavigationMenuList>
            <NavigationMenuItem>
              <NavigationMenuLink
                className={navigationMenuTriggerStyle()}
                href="/"
              >
                <Home className="mr-2 h-4 w-4" />
                Home
              </NavigationMenuLink>
            </NavigationMenuItem>

            <NavigationMenuItem>
              <NavigationMenuTrigger>
                <Video className="mr-2 h-4 w-4" />
                Movies & TV
              </NavigationMenuTrigger>
              <NavigationMenuContent>
                <div className="grid gap-3 p-6 md:w-[500px] lg:w-[600px] lg:grid-cols-3">
                  <div className="space-y-3">
                    <h4 className="text-muted-foreground text-sm font-medium tracking-wide uppercase">
                      Movies
                    </h4>
                    <div className="space-y-2">
                      <NavigationMenuLink asChild>
                        <a
                          href="/new-releases"
                          className="flex items-center gap-2"
                        >
                          <Star className="h-4 w-4 text-yellow-500" />
                          <div>
                            <div className="text-sm font-medium">
                              New Releases
                            </div>
                            <p className="text-muted-foreground text-xs">
                              Latest blockbusters
                            </p>
                          </div>
                        </a>
                      </NavigationMenuLink>
                      <NavigationMenuLink asChild>
                        <a href="/popular" className="flex items-center gap-2">
                          <TrendingUp className="h-4 w-4" />
                          <div>
                            <div className="text-sm font-medium">Popular</div>
                            <p className="text-muted-foreground text-xs">
                              Trending now
                            </p>
                          </div>
                        </a>
                      </NavigationMenuLink>
                      <NavigationMenuLink asChild>
                        <a href="/genres">
                          <div className="text-sm font-medium">
                            Browse by Genre
                          </div>
                          <p className="text-muted-foreground text-xs">
                            Action, Comedy, Drama...
                          </p>
                        </a>
                      </NavigationMenuLink>
                    </div>
                  </div>

                  <div className="space-y-3">
                    <h4 className="text-muted-foreground text-sm font-medium tracking-wide uppercase">
                      TV Shows
                    </h4>
                    <div className="space-y-2">
                      <NavigationMenuLink asChild>
                        <a href="/tv-series">
                          <div className="text-sm font-medium">TV Series</div>
                          <p className="text-muted-foreground text-xs">
                            Binge-worthy shows
                          </p>
                        </a>
                      </NavigationMenuLink>
                      <NavigationMenuLink asChild>
                        <a href="/documentaries">
                          <div className="text-sm font-medium">
                            Documentaries
                          </div>
                          <p className="text-muted-foreground text-xs">
                            Educational content
                          </p>
                        </a>
                      </NavigationMenuLink>
                      <NavigationMenuLink asChild>
                        <a href="/kids">
                          <div className="text-sm font-medium">
                            Kids & Family
                          </div>
                          <p className="text-muted-foreground text-xs">
                            Safe for all ages
                          </p>
                        </a>
                      </NavigationMenuLink>
                    </div>
                  </div>

                  <div className="space-y-3">
                    <h4 className="text-muted-foreground text-sm font-medium tracking-wide uppercase">
                      Features
                    </h4>
                    <div className="space-y-2">
                      <NavigationMenuLink asChild>
                        <a
                          href="/watchlist"
                          className="flex items-center gap-2"
                        >
                          <Bookmark className="h-4 w-4" />
                          <div>
                            <div className="text-sm font-medium">
                              My Watchlist
                            </div>
                            <p className="text-muted-foreground text-xs">
                              Save for later
                            </p>
                          </div>
                        </a>
                      </NavigationMenuLink>
                      <NavigationMenuLink asChild>
                        <a
                          href="/continue-watching"
                          className="flex items-center gap-2"
                        >
                          <Clock className="h-4 w-4" />
                          <div>
                            <div className="text-sm font-medium">
                              Continue Watching
                            </div>
                            <p className="text-muted-foreground text-xs">
                              Pick up where you left off
                            </p>
                          </div>
                        </a>
                      </NavigationMenuLink>
                    </div>
                  </div>
                </div>
              </NavigationMenuContent>
            </NavigationMenuItem>

            <NavigationMenuItem>
              <NavigationMenuTrigger>
                <Music className="mr-2 h-4 w-4" />
                Music
              </NavigationMenuTrigger>
              <NavigationMenuContent>
                <div className="grid gap-3 p-6 md:w-[400px] lg:w-[500px] lg:grid-cols-2">
                  <div className="space-y-3">
                    <h4 className="text-muted-foreground text-sm font-medium tracking-wide uppercase">
                      Discover
                    </h4>
                    <div className="space-y-2">
                      <NavigationMenuLink asChild>
                        <a
                          href="/new-music"
                          className="flex items-center gap-2"
                        >
                          <Zap className="h-4 w-4" />
                          <div>
                            <div className="text-sm font-medium">
                              New Releases
                            </div>
                            <p className="text-muted-foreground text-xs">
                              Fresh tracks & albums
                            </p>
                          </div>
                        </a>
                      </NavigationMenuLink>
                      <NavigationMenuLink asChild>
                        <a href="/charts" className="flex items-center gap-2">
                          <TrendingUp className="h-4 w-4" />
                          <div>
                            <div className="text-sm font-medium">Charts</div>
                            <p className="text-muted-foreground text-xs">
                              Top 50 global hits
                            </p>
                          </div>
                        </a>
                      </NavigationMenuLink>
                      <NavigationMenuLink asChild>
                        <a href="/genres-music">
                          <div className="text-sm font-medium">Genres</div>
                          <p className="text-muted-foreground text-xs">
                            Rock, Pop, Hip-Hop, Jazz...
                          </p>
                        </a>
                      </NavigationMenuLink>
                    </div>
                  </div>

                  <div className="space-y-3">
                    <h4 className="text-muted-foreground text-sm font-medium tracking-wide uppercase">
                      Personal
                    </h4>
                    <div className="space-y-2">
                      <NavigationMenuLink asChild>
                        <a
                          href="/playlists"
                          className="flex items-center gap-2"
                        >
                          <List className="h-4 w-4" />
                          <div>
                            <div className="text-sm font-medium">
                              My Playlists
                            </div>
                            <p className="text-muted-foreground text-xs">
                              Your curated music
                            </p>
                          </div>
                        </a>
                      </NavigationMenuLink>
                      <NavigationMenuLink asChild>
                        <a
                          href="/liked-songs"
                          className="flex items-center gap-2"
                        >
                          <Heart className="h-4 w-4" />
                          <div>
                            <div className="text-sm font-medium">
                              Liked Songs
                            </div>
                            <p className="text-muted-foreground text-xs">
                              Your favorites
                            </p>
                          </div>
                        </a>
                      </NavigationMenuLink>
                      <NavigationMenuLink asChild>
                        <a href="/recently-played">
                          <div className="text-sm font-medium">
                            Recently Played
                          </div>
                          <p className="text-muted-foreground text-xs">
                            Your listening history
                          </p>
                        </a>
                      </NavigationMenuLink>
                    </div>
                  </div>
                </div>
              </NavigationMenuContent>
            </NavigationMenuItem>

            <NavigationMenuItem>
              <NavigationMenuTrigger>
                <Image className="mr-2 h-4 w-4" />
                Photos
              </NavigationMenuTrigger>
              <NavigationMenuContent>
                <ul className="grid gap-3 p-6 md:w-[400px] lg:w-[500px] lg:grid-cols-[.75fr_1fr]">
                  <li className="row-span-3">
                    <NavigationMenuLink asChild>
                      <a
                        className="flex h-full w-full flex-col justify-end rounded-md bg-gradient-to-b from-blue-50 to-blue-100 p-6 no-underline outline-none select-none focus:shadow-md dark:from-blue-950 dark:to-blue-900"
                        href="/photos"
                      >
                        <Camera className="h-6 w-6 text-blue-600" />
                        <div className="mt-4 mb-2 text-lg font-medium">
                          Photo Gallery
                        </div>
                        <p className="text-muted-foreground text-sm leading-tight">
                          Browse thousands of high-quality photos and images.
                        </p>
                      </a>
                    </NavigationMenuLink>
                  </li>
                  <li>
                    <NavigationMenuLink asChild>
                      <a href="/categories" className="flex items-center gap-2">
                        <Grid3X3 className="h-4 w-4" />
                        <div>
                          <div className="text-sm font-medium">Categories</div>
                          <p className="text-muted-foreground text-xs">
                            Nature, Architecture, People...
                          </p>
                        </div>
                      </a>
                    </NavigationMenuLink>
                  </li>
                  <li>
                    <NavigationMenuLink asChild>
                      <a
                        href="/collections"
                        className="flex items-center gap-2"
                      >
                        <Archive className="h-4 w-4" />
                        <div>
                          <div className="text-sm font-medium">Collections</div>
                          <p className="text-muted-foreground text-xs">
                            Curated photo sets
                          </p>
                        </div>
                      </a>
                    </NavigationMenuLink>
                  </li>
                  <li>
                    <NavigationMenuLink asChild>
                      <a href="/downloads" className="flex items-center gap-2">
                        <Download className="h-4 w-4" />
                        <div>
                          <div className="text-sm font-medium">Downloads</div>
                          <p className="text-muted-foreground text-xs">
                            Free & premium images
                          </p>
                        </div>
                      </a>
                    </NavigationMenuLink>
                  </li>
                </ul>
              </NavigationMenuContent>
            </NavigationMenuItem>

            <NavigationMenuItem>
              <NavigationMenuLink
                className={navigationMenuTriggerStyle()}
                href="/live"
              >
                <div className="flex items-center gap-2">
                  <div className="h-2 w-2 animate-pulse rounded-full bg-red-500"></div>
                  Live
                </div>
              </NavigationMenuLink>
            </NavigationMenuItem>
          </NavigationMenuList>
        </NavigationMenu>

        <div className="mt-8 grid grid-cols-1 gap-4 md:grid-cols-4">
          <Card>
            <CardContent className="p-4 text-center">
              <Video className="text-primary mx-auto mb-2 h-8 w-8" />
              <div className="text-lg font-bold">10K+</div>
              <p className="text-muted-foreground text-sm">Movies & Shows</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4 text-center">
              <Music className="text-primary mx-auto mb-2 h-8 w-8" />
              <div className="text-lg font-bold">50M+</div>
              <p className="text-muted-foreground text-sm">Songs</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4 text-center">
              <Image className="text-primary mx-auto mb-2 h-8 w-8" />
              <div className="text-lg font-bold">1M+</div>
              <p className="text-muted-foreground text-sm">Photos</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4 text-center">
              <Users className="text-primary mx-auto mb-2 h-8 w-8" />
              <div className="text-lg font-bold">5M+</div>
              <p className="text-muted-foreground text-sm">Active Users</p>
            </CardContent>
          </Card>
        </div>
      </CardContent>
    </Card>
  ),
}

export const CoreLiveThemeShowcase: Story = {
  args: {},
  render: () => (
    <div className="w-full max-w-6xl space-y-8">
      <div className="space-y-2 text-center">
        <h2 className="text-2xl font-bold">
          CoreLive Navigation Menu Components
        </h2>
        <p className="text-muted-foreground">
          Navigation menu components showcasing CoreLive Design System
          integration
        </p>
      </div>

      <div className="space-y-6">
        {/* Brand Colors Navigation */}
        <Card className="border-primary/20">
          <CardHeader>
            <CardTitle className="text-primary">
              Primary Brand Navigation
            </CardTitle>
            <CardDescription>
              Navigation using primary brand colors and tokens
            </CardDescription>
          </CardHeader>
          <CardContent>
            <NavigationMenu>
              <NavigationMenuList>
                <NavigationMenuItem>
                  <NavigationMenuLink
                    className={cn(
                      navigationMenuTriggerStyle(),
                      'bg-primary text-primary-foreground hover:bg-primary/90',
                    )}
                    href="/"
                  >
                    <Home className="mr-2 h-4 w-4" />
                    Primary
                  </NavigationMenuLink>
                </NavigationMenuItem>
                <NavigationMenuItem>
                  <NavigationMenuTrigger className="data-[state=open]:bg-secondary/10 data-[state=open]:text-secondary-foreground">
                    <Zap className="mr-2 h-4 w-4" />
                    Brand Menu
                  </NavigationMenuTrigger>
                  <NavigationMenuContent>
                    <div className="grid gap-3 p-6 md:w-[400px] lg:w-[500px] lg:grid-cols-2">
                      <NavigationMenuLink asChild>
                        <a
                          href="#"
                          className="focus:bg-primary/10 focus:text-primary"
                        >
                          <div className="flex items-center gap-2">
                            <Star className="text-primary h-4 w-4" />
                            <div>
                              <div className="text-sm font-medium">
                                Primary Feature
                              </div>
                              <p className="text-muted-foreground text-xs">
                                Main brand functionality
                              </p>
                            </div>
                          </div>
                        </a>
                      </NavigationMenuLink>
                      <NavigationMenuLink asChild>
                        <a href="#" className="focus:bg-secondary/10">
                          <div className="flex items-center gap-2">
                            <Briefcase className="text-secondary-foreground h-4 w-4" />
                            <div>
                              <div className="text-sm font-medium">
                                Secondary Option
                              </div>
                              <p className="text-muted-foreground text-xs">
                                Supporting features
                              </p>
                            </div>
                          </div>
                        </a>
                      </NavigationMenuLink>
                    </div>
                  </NavigationMenuContent>
                </NavigationMenuItem>
                <NavigationMenuItem>
                  <NavigationMenuLink
                    className={cn(
                      navigationMenuTriggerStyle(),
                      'hover:bg-accent',
                    )}
                    href="#"
                  >
                    Accent
                  </NavigationMenuLink>
                </NavigationMenuItem>
              </NavigationMenuList>
            </NavigationMenu>
          </CardContent>
        </Card>

        {/* Semantic Colors Navigation */}
        <Card className="border-success/20">
          <CardHeader>
            <CardTitle className="text-success">
              Semantic States Navigation
            </CardTitle>
            <CardDescription>
              Navigation showcasing semantic color usage
            </CardDescription>
          </CardHeader>
          <CardContent>
            <NavigationMenu>
              <NavigationMenuList>
                <NavigationMenuItem>
                  <NavigationMenuTrigger>
                    <Shield className="mr-2 h-4 w-4" />
                    System Status
                  </NavigationMenuTrigger>
                  <NavigationMenuContent>
                    <div className="grid gap-3 p-6 md:w-[400px] lg:w-[500px] lg:grid-cols-2">
                      <NavigationMenuLink asChild>
                        <a
                          href="#"
                          className="focus:bg-success/10 focus:text-success"
                        >
                          <div className="flex items-center gap-2">
                            <div className="bg-success h-2 w-2 rounded-full"></div>
                            <div>
                              <div className="text-success text-sm font-medium">
                                All Systems Operational
                              </div>
                              <p className="text-muted-foreground text-xs">
                                Everything running smoothly
                              </p>
                            </div>
                          </div>
                        </a>
                      </NavigationMenuLink>
                      <NavigationMenuLink asChild>
                        <a
                          href="#"
                          className="focus:bg-warning/10 focus:text-warning"
                        >
                          <div className="flex items-center gap-2">
                            <div className="bg-warning h-2 w-2 animate-pulse rounded-full"></div>
                            <div>
                              <div className="text-warning text-sm font-medium">
                                Maintenance Mode
                              </div>
                              <p className="text-muted-foreground text-xs">
                                Scheduled updates in progress
                              </p>
                            </div>
                          </div>
                        </a>
                      </NavigationMenuLink>
                      <NavigationMenuLink asChild>
                        <a
                          href="#"
                          className="focus:bg-info/10 focus:text-info"
                        >
                          <div className="flex items-center gap-2">
                            <Info className="text-info h-4 w-4" />
                            <div>
                              <div className="text-info text-sm font-medium">
                                Information Center
                              </div>
                              <p className="text-muted-foreground text-xs">
                                Latest updates and news
                              </p>
                            </div>
                          </div>
                        </a>
                      </NavigationMenuLink>
                      <NavigationMenuLink asChild>
                        <a
                          href="#"
                          className="focus:bg-discovery/10 focus:text-discovery"
                        >
                          <div className="flex items-center gap-2">
                            <Star className="text-discovery h-4 w-4" />
                            <div>
                              <div className="text-discovery text-sm font-medium">
                                New Features
                              </div>
                              <p className="text-muted-foreground text-xs">
                                Discover what's new
                              </p>
                            </div>
                          </div>
                        </a>
                      </NavigationMenuLink>
                    </div>
                  </NavigationMenuContent>
                </NavigationMenuItem>

                <NavigationMenuItem>
                  <NavigationMenuLink
                    className={cn(
                      navigationMenuTriggerStyle(),
                      'text-success hover:bg-success/10 hover:text-success',
                    )}
                    href="#"
                  >
                    <Award className="mr-2 h-4 w-4" />
                    Success Stories
                  </NavigationMenuLink>
                </NavigationMenuItem>
              </NavigationMenuList>
            </NavigationMenu>
          </CardContent>
        </Card>

        {/* Interactive States & Tokens */}
        <Card>
          <CardHeader>
            <CardTitle>Interactive States & Design Tokens</CardTitle>
            <CardDescription>
              Demonstrating hover, focus, and animation states
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <NavigationMenu>
              <NavigationMenuList>
                <NavigationMenuItem>
                  <NavigationMenuTrigger>
                    <Settings className="mr-2 h-4 w-4" />
                    Interactive Demo
                  </NavigationMenuTrigger>
                  <NavigationMenuContent>
                    <ul className="grid gap-3 p-6 md:w-[400px] lg:w-[500px] lg:grid-cols-[.75fr_1fr]">
                      <li className="row-span-3">
                        <NavigationMenuLink asChild>
                          <a
                            className="from-muted/50 to-muted flex h-full w-full flex-col justify-end rounded-md bg-gradient-to-b p-6 no-underline outline-none select-none focus:shadow-md"
                            href="#"
                          >
                            <Lightbulb className="h-6 w-6" />
                            <div className="mt-4 mb-2 text-lg font-medium">
                              CoreLive Design
                            </div>
                            <p className="text-muted-foreground text-sm leading-tight">
                              Built with CoreLive Design System tokens for
                              consistent theming.
                            </p>
                          </a>
                        </NavigationMenuLink>
                      </li>
                      <li>
                        <NavigationMenuLink asChild>
                          <a href="#">
                            <div className="mb-2 text-sm leading-none font-medium">
                              Hover Effects
                            </div>
                            <p className="text-muted-foreground line-clamp-2 text-sm leading-snug">
                              Smooth transitions on hover states.
                            </p>
                          </a>
                        </NavigationMenuLink>
                      </li>
                      <li>
                        <NavigationMenuLink asChild>
                          <a href="#">
                            <div className="mb-2 text-sm leading-none font-medium">
                              Focus Management
                            </div>
                            <p className="text-muted-foreground line-clamp-2 text-sm leading-snug">
                              Accessible keyboard navigation.
                            </p>
                          </a>
                        </NavigationMenuLink>
                      </li>
                      <li>
                        <NavigationMenuLink asChild>
                          <a href="#">
                            <div className="mb-2 text-sm leading-none font-medium">
                              Animation System
                            </div>
                            <p className="text-muted-foreground line-clamp-2 text-sm leading-snug">
                              Smooth entrance and exit animations.
                            </p>
                          </a>
                        </NavigationMenuLink>
                      </li>
                    </ul>
                  </NavigationMenuContent>
                </NavigationMenuItem>

                <NavigationMenuItem>
                  <NavigationMenuLink
                    className={navigationMenuTriggerStyle()}
                    href="#"
                  >
                    <Badge variant="outline" className="mr-2">
                      Token
                    </Badge>
                    Design Tokens
                  </NavigationMenuLink>
                </NavigationMenuItem>
              </NavigationMenuList>
            </NavigationMenu>

            <Separator />

            <div className="space-y-4">
              <h4 className="font-medium">
                CoreLive Navigation Menu Design Tokens
              </h4>
              <div className="grid grid-cols-1 gap-4 text-sm md:grid-cols-2 lg:grid-cols-3">
                <div className="space-y-2">
                  <h5 className="font-medium">Layout & Structure</h5>
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <Badge variant="outline">h-9</Badge>
                      <span className="text-muted-foreground">
                        Trigger height
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge variant="outline">px-4 py-2</Badge>
                      <span className="text-muted-foreground">
                        Trigger padding
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge variant="outline">gap-1</Badge>
                      <span className="text-muted-foreground">
                        List item spacing
                      </span>
                    </div>
                  </div>
                </div>

                <div className="space-y-2">
                  <h5 className="font-medium">Colors</h5>
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <Badge variant="outline">--background</Badge>
                      <span className="text-muted-foreground">
                        Trigger background
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge variant="outline">--popover</Badge>
                      <span className="text-muted-foreground">
                        Content background
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge variant="outline">--accent</Badge>
                      <span className="text-muted-foreground">
                        Hover background
                      </span>
                    </div>
                  </div>
                </div>

                <div className="space-y-2">
                  <h5 className="font-medium">Animations</h5>
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <Badge variant="outline">zoom-in-90</Badge>
                      <span className="text-muted-foreground">
                        Viewport entrance
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge variant="outline">slide-in-from-*</Badge>
                      <span className="text-muted-foreground">
                        Content motion
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge variant="outline">rotate-180</Badge>
                      <span className="text-muted-foreground">
                        Chevron rotation
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <div className="bg-muted rounded-lg p-4">
              <div className="mb-2 flex items-center gap-2">
                <Lightbulb className="h-4 w-4" />
                <span className="text-sm font-medium">Token Usage</span>
              </div>
              <p className="text-muted-foreground text-sm">
                All navigation components use CoreLive Design System tokens for
                consistent theming across light and dark modes. The navigation
                menu automatically adapts to theme changes and maintains proper
                contrast ratios.
              </p>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  ),
}
