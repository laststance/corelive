import type { Meta, StoryObj } from '@storybook/react'
import {
  Home,
  Search,
  Settings,
  User,
  Users,
  FileText,
  Calendar,
  Mail,
  ShoppingCart,
  Package,
  BarChart3,
  PieChart,
  Activity,
  TrendingUp,
  DollarSign,
  Star,
  Heart,
  Eye,
  Download,
  Upload,
  Tag,
  Plus,
  MoreHorizontal,
  ChevronRight,
  ChevronDown,
  Folder,
  Image,
  Code,
  Monitor,
  Smartphone,
  HelpCircle,
  Globe,
  Archive,
} from 'lucide-react'
import { useState } from 'react'

import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Badge } from '@/components/ui/badge'
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from '@/components/ui/breadcrumb'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Separator } from '@/components/ui/separator'
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarInset,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarMenuSub,
  SidebarMenuSubButton,
  SidebarMenuSubItem,
  SidebarProvider,
  SidebarTrigger,
  SidebarInput,
  SidebarSeparator,
  SidebarMenuBadge,
  SidebarRail,
} from '@/components/ui/sidebar'

const meta: Meta<typeof SidebarProvider> = {
  title: 'Components/Sidebar',
  component: SidebarProvider,
  parameters: {
    layout: 'fullscreen',
    docs: {
      description: {
        component:
          'A comprehensive sidebar component with collapsible navigation, mobile responsiveness, and multiple variants.',
      },
    },
  },
  tags: ['autodocs'],
}

export default meta
type Story = StoryObj<typeof SidebarProvider>

// Main navigation items
const mainNavItems = [
  { title: 'Dashboard', url: '#', icon: Home, badge: null },
  { title: 'Search', url: '#', icon: Search, badge: null },
  { title: 'Messages', url: '#', icon: Mail, badge: '5' },
  { title: 'Calendar', url: '#', icon: Calendar, badge: null },
  { title: 'Settings', url: '#', icon: Settings, badge: null },
]

// Projects with submenus
const projects = [
  {
    title: 'Design System',
    url: '#',
    icon: Folder,
    items: [
      { title: 'Components', url: '#' },
      { title: 'Tokens', url: '#' },
      { title: 'Documentation', url: '#' },
    ],
  },
  {
    title: 'Website Redesign',
    url: '#',
    icon: Globe,
    items: [
      { title: 'Landing Page', url: '#' },
      { title: 'About Page', url: '#' },
      { title: 'Contact Form', url: '#' },
    ],
  },
  {
    title: 'Mobile App',
    url: '#',
    icon: Smartphone,
    items: [
      { title: 'User Interface', url: '#' },
      { title: 'API Integration', url: '#' },
      { title: 'Testing', url: '#' },
    ],
  },
]

function AppSidebar() {
  const [expandedItems, setExpandedItems] = useState<string[]>([
    'Design System',
  ])

  const toggleExpanded = (title: string) => {
    setExpandedItems((prev) =>
      prev.includes(title)
        ? prev.filter((item) => item !== title)
        : [...prev, title],
    )
  }

  return (
    <Sidebar>
      <SidebarHeader>
        <div className="flex items-center gap-2 px-2">
          <div className="bg-primary text-primary-foreground flex aspect-square size-8 items-center justify-center rounded-lg">
            <Code className="size-4" />
          </div>
          <div className="flex flex-col gap-0.5 leading-none">
            <span className="font-semibold">CoreLive</span>
            <span className="text-muted-foreground text-xs">Design System</span>
          </div>
        </div>
      </SidebarHeader>

      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel>Navigation</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {mainNavItems.map((item) => (
                <SidebarMenuItem key={item.title}>
                  <SidebarMenuButton asChild>
                    <a href={item.url}>
                      <item.icon />
                      <span>{item.title}</span>
                      {item.badge && (
                        <SidebarMenuBadge>{item.badge}</SidebarMenuBadge>
                      )}
                    </a>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        <SidebarSeparator />

        <SidebarGroup>
          <SidebarGroupLabel>Projects</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {projects.map((item) => {
                const isExpanded = expandedItems.includes(item.title)
                return (
                  <SidebarMenuItem key={item.title}>
                    <SidebarMenuButton
                      onClick={() => toggleExpanded(item.title)}
                      className="cursor-pointer"
                    >
                      <item.icon />
                      <span>{item.title}</span>
                      {isExpanded ? (
                        <ChevronDown className="ml-auto size-4" />
                      ) : (
                        <ChevronRight className="ml-auto size-4" />
                      )}
                    </SidebarMenuButton>
                    {isExpanded && (
                      <SidebarMenuSub>
                        {item.items.map((subItem) => (
                          <SidebarMenuSubItem key={subItem.title}>
                            <SidebarMenuSubButton asChild>
                              <a href={subItem.url}>
                                <span>{subItem.title}</span>
                              </a>
                            </SidebarMenuSubButton>
                          </SidebarMenuSubItem>
                        ))}
                      </SidebarMenuSub>
                    )}
                  </SidebarMenuItem>
                )
              })}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>

      <SidebarFooter>
        <SidebarMenu>
          <SidebarMenuItem>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <SidebarMenuButton className="w-full">
                  <Avatar className="size-6">
                    <AvatarImage src="https://github.com/shadcn.png" />
                    <AvatarFallback>CN</AvatarFallback>
                  </Avatar>
                  <span>Alex Johnson</span>
                  <MoreHorizontal className="ml-auto size-4" />
                </SidebarMenuButton>
              </DropdownMenuTrigger>
              <DropdownMenuContent
                side="top"
                className="w-[--radix-dropdown-menu-trigger-width]"
              >
                <DropdownMenuItem>
                  <User className="mr-2 size-4" />
                  Profile
                </DropdownMenuItem>
                <DropdownMenuItem>
                  <Settings className="mr-2 size-4" />
                  Settings
                </DropdownMenuItem>
                <DropdownMenuItem>
                  <HelpCircle className="mr-2 size-4" />
                  Help
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>

      <SidebarRail />
    </Sidebar>
  )
}

function SampleContent() {
  return (
    <SidebarInset>
      <header className="flex h-16 shrink-0 items-center gap-2 border-b px-4">
        <SidebarTrigger className="-ml-1" />
        <Separator orientation="vertical" className="mr-2 h-4" />
        <Breadcrumb>
          <BreadcrumbList>
            <BreadcrumbItem className="hidden md:block">
              <BreadcrumbLink href="#">Dashboard</BreadcrumbLink>
            </BreadcrumbItem>
            <BreadcrumbSeparator className="hidden md:block" />
            <BreadcrumbItem>
              <BreadcrumbPage>Overview</BreadcrumbPage>
            </BreadcrumbItem>
          </BreadcrumbList>
        </Breadcrumb>
      </header>
      <div className="flex flex-1 flex-col gap-4 p-4">
        <div className="grid auto-rows-min gap-4 md:grid-cols-3">
          <Card>
            <CardHeader className="pb-2">
              <CardDescription>Total Revenue</CardDescription>
              <CardTitle className="text-4xl">$45,231.89</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-muted-foreground text-xs">
                +20.1% from last month
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardDescription>Active Users</CardDescription>
              <CardTitle className="text-4xl">2,350</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-muted-foreground text-xs">
                +180.1% from last month
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardDescription>Sales</CardDescription>
              <CardTitle className="text-4xl">12,234</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-muted-foreground text-xs">
                +19% from last month
              </div>
            </CardContent>
          </Card>
        </div>
        <div className="bg-muted/50 min-h-[100vh] flex-1 rounded-xl md:min-h-min" />
      </div>
    </SidebarInset>
  )
}

export const Default: Story = {
  args: {},
  render: () => (
    <SidebarProvider>
      <div className="flex min-h-screen">
        <AppSidebar />
        <SampleContent />
      </div>
    </SidebarProvider>
  ),
}

export const FloatingVariant: Story = {
  args: {},
  render: () => (
    <SidebarProvider>
      <div className="flex min-h-screen">
        <Sidebar variant="floating" className="top-2 left-2">
          <SidebarHeader>
            <div className="flex items-center gap-2 px-2">
              <div className="bg-secondary text-secondary-foreground flex aspect-square size-8 items-center justify-center rounded-lg">
                <Star className="size-4" />
              </div>
              <div className="flex flex-col gap-0.5 leading-none">
                <span className="font-semibold">Floating UI</span>
                <span className="text-muted-foreground text-xs">
                  Design Tool
                </span>
              </div>
            </div>
          </SidebarHeader>

          <SidebarContent>
            <SidebarGroup>
              <SidebarGroupLabel>Tools</SidebarGroupLabel>
              <SidebarGroupContent>
                <SidebarMenu>
                  {[
                    { title: 'Canvas', icon: Monitor, badge: null },
                    { title: 'Layers', icon: Package, badge: '12' },
                    { title: 'Assets', icon: Image, badge: null },
                    { title: 'Components', icon: Package, badge: '25' },
                    { title: 'Plugins', icon: Plus, badge: null },
                  ].map((item) => (
                    <SidebarMenuItem key={item.title}>
                      <SidebarMenuButton>
                        <item.icon />
                        <span>{item.title}</span>
                        {item.badge && (
                          <SidebarMenuBadge>{item.badge}</SidebarMenuBadge>
                        )}
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                  ))}
                </SidebarMenu>
              </SidebarGroupContent>
            </SidebarGroup>
          </SidebarContent>

          <SidebarRail />
        </Sidebar>
        <SampleContent />
      </div>
    </SidebarProvider>
  ),
}

export const InsetVariant: Story = {
  args: {},
  render: () => (
    <SidebarProvider>
      <div className="flex min-h-screen">
        <Sidebar variant="inset">
          <SidebarHeader>
            <div className="flex items-center gap-2 px-2">
              <div className="bg-success text-success-foreground flex aspect-square size-8 items-center justify-center rounded-lg">
                <Activity className="size-4" />
              </div>
              <div className="flex flex-col gap-0.5 leading-none">
                <span className="font-semibold">Analytics</span>
                <span className="text-muted-foreground text-xs">Dashboard</span>
              </div>
            </div>
          </SidebarHeader>

          <SidebarContent>
            <SidebarGroup>
              <SidebarGroupLabel>Analytics</SidebarGroupLabel>
              <SidebarGroupContent>
                <SidebarMenu>
                  {[
                    { title: 'Overview', icon: BarChart3, badge: null },
                    { title: 'Reports', icon: FileText, badge: '3' },
                    { title: 'Real-time', icon: Activity, badge: null },
                    { title: 'Goals', icon: TrendingUp, badge: null },
                    { title: 'Audience', icon: Users, badge: null },
                  ].map((item) => (
                    <SidebarMenuItem key={item.title}>
                      <SidebarMenuButton>
                        <item.icon />
                        <span>{item.title}</span>
                        {item.badge && (
                          <SidebarMenuBadge>{item.badge}</SidebarMenuBadge>
                        )}
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                  ))}
                </SidebarMenu>
              </SidebarGroupContent>
            </SidebarGroup>
          </SidebarContent>

          <SidebarRail />
        </Sidebar>
        <SampleContent />
      </div>
    </SidebarProvider>
  ),
}

export const CollapsibleIcon: Story = {
  args: {},
  render: () => (
    <SidebarProvider defaultOpen={false}>
      <div className="flex min-h-screen">
        <Sidebar collapsible="icon">
          <SidebarHeader>
            <SidebarMenuButton
              size="lg"
              className="data-[state=open]:bg-sidebar-accent data-[state=open]:text-sidebar-accent-foreground"
            >
              <div className="bg-primary text-primary-foreground flex aspect-square size-8 items-center justify-center rounded-lg">
                <Code className="size-4" />
              </div>
              <div className="grid flex-1 text-left text-sm leading-tight">
                <span className="truncate font-semibold">CoreLive</span>
                <span className="truncate text-xs">Design System</span>
              </div>
            </SidebarMenuButton>
          </SidebarHeader>

          <SidebarContent>
            <SidebarGroup>
              <SidebarGroupLabel>Main</SidebarGroupLabel>
              <SidebarGroupContent>
                <SidebarMenu>
                  {mainNavItems.map((item) => (
                    <SidebarMenuItem key={item.title}>
                      <SidebarMenuButton tooltip={item.title}>
                        <item.icon />
                        <span>{item.title}</span>
                        {item.badge && (
                          <SidebarMenuBadge>{item.badge}</SidebarMenuBadge>
                        )}
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                  ))}
                </SidebarMenu>
              </SidebarGroupContent>
            </SidebarGroup>
          </SidebarContent>

          <SidebarFooter>
            <SidebarMenu>
              <SidebarMenuItem>
                <SidebarMenuButton tooltip="User Account">
                  <Avatar className="size-6">
                    <AvatarImage src="https://github.com/shadcn.png" />
                    <AvatarFallback>AJ</AvatarFallback>
                  </Avatar>
                  <span>Alex Johnson</span>
                </SidebarMenuButton>
              </SidebarMenuItem>
            </SidebarMenu>
          </SidebarFooter>

          <SidebarRail />
        </Sidebar>
        <SampleContent />
      </div>
    </SidebarProvider>
  ),
}

export const EcommerceSidebar: Story = {
  args: {},
  render: () => {
    const categories = [
      {
        title: 'Electronics',
        icon: Monitor,
        items: [
          { title: 'Laptops', url: '#', count: 156 },
          { title: 'Smartphones', url: '#', count: 89 },
          { title: 'Tablets', url: '#', count: 34 },
          { title: 'Headphones', url: '#', count: 67 },
          { title: 'Cameras', url: '#', count: 23 },
        ],
      },
      {
        title: 'Fashion',
        icon: Heart,
        items: [
          { title: "Men's Clothing", url: '#', count: 245 },
          { title: "Women's Clothing", url: '#', count: 389 },
          { title: 'Shoes', url: '#', count: 178 },
          { title: 'Accessories', url: '#', count: 92 },
        ],
      },
      {
        title: 'Home & Garden',
        icon: Home,
        items: [
          { title: 'Furniture', url: '#', count: 134 },
          { title: 'Decor', url: '#', count: 267 },
          { title: 'Kitchen', url: '#', count: 89 },
          { title: 'Garden', url: '#', count: 45 },
        ],
      },
    ]

    const [expandedCategories, setExpandedCategories] = useState<string[]>([
      'Electronics',
    ])

    const toggleCategory = (title: string) => {
      setExpandedCategories((prev) =>
        prev.includes(title)
          ? prev.filter((item) => item !== title)
          : [...prev, title],
      )
    }

    return (
      <SidebarProvider>
        <div className="flex min-h-screen">
          <Sidebar>
            <SidebarHeader>
              <div className="flex items-center gap-2 px-2">
                <div className="flex aspect-square size-8 items-center justify-center rounded-lg bg-orange-600 text-white">
                  <ShoppingCart className="size-4" />
                </div>
                <div className="flex flex-col gap-0.5 leading-none">
                  <span className="font-semibold">ShopCore</span>
                  <span className="text-muted-foreground text-xs">
                    E-commerce
                  </span>
                </div>
              </div>
              <SidebarInput placeholder="Search products..." />
            </SidebarHeader>

            <SidebarContent>
              <SidebarGroup>
                <SidebarGroupLabel>Quick Access</SidebarGroupLabel>
                <SidebarGroupContent>
                  <SidebarMenu>
                    {[
                      { title: 'Featured', icon: Star, badge: 'New' },
                      { title: 'Best Sellers', icon: TrendingUp, badge: null },
                      { title: 'On Sale', icon: Tag, badge: '50%' },
                      { title: 'Recently Viewed', icon: Eye, badge: '5' },
                      { title: 'Wishlist', icon: Heart, badge: '12' },
                    ].map((item) => (
                      <SidebarMenuItem key={item.title}>
                        <SidebarMenuButton>
                          <item.icon />
                          <span>{item.title}</span>
                          {item.badge && (
                            <SidebarMenuBadge>{item.badge}</SidebarMenuBadge>
                          )}
                        </SidebarMenuButton>
                      </SidebarMenuItem>
                    ))}
                  </SidebarMenu>
                </SidebarGroupContent>
              </SidebarGroup>

              <SidebarSeparator />

              <SidebarGroup>
                <SidebarGroupLabel>Categories</SidebarGroupLabel>
                <SidebarGroupContent>
                  <SidebarMenu>
                    {categories.map((category) => {
                      const isExpanded = expandedCategories.includes(
                        category.title,
                      )
                      return (
                        <SidebarMenuItem key={category.title}>
                          <SidebarMenuButton
                            onClick={() => toggleCategory(category.title)}
                            className="cursor-pointer"
                          >
                            <category.icon />
                            <span>{category.title}</span>
                            {isExpanded ? (
                              <ChevronDown className="ml-auto size-4" />
                            ) : (
                              <ChevronRight className="ml-auto size-4" />
                            )}
                          </SidebarMenuButton>
                          {isExpanded && (
                            <SidebarMenuSub>
                              {category.items.map((item) => (
                                <SidebarMenuSubItem key={item.title}>
                                  <SidebarMenuSubButton asChild>
                                    <a
                                      href={item.url}
                                      className="flex items-center justify-between"
                                    >
                                      <span>{item.title}</span>
                                      <span className="text-muted-foreground text-xs">
                                        {item.count}
                                      </span>
                                    </a>
                                  </SidebarMenuSubButton>
                                </SidebarMenuSubItem>
                              ))}
                            </SidebarMenuSub>
                          )}
                        </SidebarMenuItem>
                      )
                    })}
                  </SidebarMenu>
                </SidebarGroupContent>
              </SidebarGroup>

              <SidebarSeparator />

              <SidebarGroup>
                <SidebarGroupLabel>Filters</SidebarGroupLabel>
                <SidebarGroupContent>
                  <SidebarMenu>
                    {[
                      { title: 'Price Range', icon: DollarSign },
                      { title: 'Brand', icon: Tag },
                      { title: 'Rating', icon: Star },
                      { title: 'Availability', icon: Package },
                    ].map((item) => (
                      <SidebarMenuItem key={item.title}>
                        <SidebarMenuButton>
                          <item.icon />
                          <span>{item.title}</span>
                          <ChevronRight className="ml-auto size-4" />
                        </SidebarMenuButton>
                      </SidebarMenuItem>
                    ))}
                  </SidebarMenu>
                </SidebarGroupContent>
              </SidebarGroup>
            </SidebarContent>

            <SidebarFooter>
              <SidebarMenu>
                <SidebarMenuItem>
                  <SidebarMenuButton>
                    <ShoppingCart />
                    <span>Cart</span>
                    <SidebarMenuBadge>3</SidebarMenuBadge>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              </SidebarMenu>
            </SidebarFooter>

            <SidebarRail />
          </Sidebar>
          <SampleContent />
        </div>
      </SidebarProvider>
    )
  },
}

export const DashboardSidebar: Story = {
  args: {},
  render: () => {
    const dashboardSections = [
      {
        title: 'Analytics',
        items: [
          { title: 'Overview', icon: BarChart3, badge: null },
          { title: 'Revenue', icon: DollarSign, badge: '+12%' },
          { title: 'Traffic', icon: TrendingUp, badge: null },
          { title: 'Conversions', icon: PieChart, badge: '2.4%' },
        ],
      },
      {
        title: 'Management',
        items: [
          { title: 'Users', icon: Users, badge: '1,234' },
          { title: 'Orders', icon: Package, badge: '89' },
          { title: 'Products', icon: ShoppingCart, badge: null },
          { title: 'Reviews', icon: Star, badge: '156' },
        ],
      },
      {
        title: 'Tools',
        items: [
          { title: 'Reports', icon: FileText, badge: null },
          { title: 'Export', icon: Download, badge: null },
          { title: 'Import', icon: Upload, badge: null },
          { title: 'Backup', icon: Archive, badge: null },
        ],
      },
    ]

    return (
      <SidebarProvider>
        <div className="flex min-h-screen">
          <Sidebar>
            <SidebarHeader>
              <div className="flex items-center gap-2 px-2">
                <div className="flex aspect-square size-8 items-center justify-center rounded-lg bg-blue-600 text-white">
                  <BarChart3 className="size-4" />
                </div>
                <div className="flex flex-col gap-0.5 leading-none">
                  <span className="font-semibold">Analytics Pro</span>
                  <span className="text-muted-foreground text-xs">
                    Dashboard
                  </span>
                </div>
              </div>
            </SidebarHeader>

            <SidebarContent>
              <SidebarGroup>
                <SidebarGroupLabel>Quick Stats</SidebarGroupLabel>
                <SidebarGroupContent>
                  <div className="grid gap-2 p-2">
                    <Card className="p-3">
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="text-sm font-medium">Revenue</p>
                          <p className="text-lg font-bold">$45.2K</p>
                        </div>
                        <TrendingUp className="h-4 w-4 text-green-600" />
                      </div>
                    </Card>
                    <Card className="p-3">
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="text-sm font-medium">Users</p>
                          <p className="text-lg font-bold">2,350</p>
                        </div>
                        <Users className="h-4 w-4 text-blue-600" />
                      </div>
                    </Card>
                  </div>
                </SidebarGroupContent>
              </SidebarGroup>

              {dashboardSections.map((section) => (
                <SidebarGroup key={section.title}>
                  <SidebarGroupLabel>{section.title}</SidebarGroupLabel>
                  <SidebarGroupContent>
                    <SidebarMenu>
                      {section.items.map((item) => (
                        <SidebarMenuItem key={item.title}>
                          <SidebarMenuButton>
                            <item.icon />
                            <span>{item.title}</span>
                            {item.badge && (
                              <SidebarMenuBadge>{item.badge}</SidebarMenuBadge>
                            )}
                          </SidebarMenuButton>
                        </SidebarMenuItem>
                      ))}
                    </SidebarMenu>
                  </SidebarGroupContent>
                </SidebarGroup>
              ))}
            </SidebarContent>

            <SidebarFooter>
              <SidebarMenu>
                <SidebarMenuItem>
                  <SidebarMenuButton>
                    <Settings />
                    <span>Dashboard Settings</span>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              </SidebarMenu>
            </SidebarFooter>

            <SidebarRail />
          </Sidebar>
          <SampleContent />
        </div>
      </SidebarProvider>
    )
  },
}

export const CoreLiveThemeShowcase: Story = {
  args: {},
  render: () => (
    <div className="w-full max-w-7xl space-y-8">
      <div className="space-y-2 text-center">
        <h2 className="text-2xl font-bold">CoreLive Sidebar Components</h2>
        <p className="text-muted-foreground">
          Comprehensive sidebar system showcasing CoreLive Design System
          integration
        </p>
      </div>

      <div className="space-y-6">
        {/* Sidebar Variants */}
        <Card>
          <CardHeader>
            <CardTitle>Sidebar Variants</CardTitle>
            <CardDescription>
              Different sidebar styles with CoreLive theming
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 gap-6 md:grid-cols-3">
              {/* Default Variant */}
              <div className="space-y-2">
                <h4 className="font-medium">Default Sidebar</h4>
                <div className="bg-sidebar relative h-48 overflow-hidden rounded-lg border p-4">
                  <div className="space-y-3">
                    <div className="flex items-center gap-2">
                      <div className="bg-primary h-6 w-6 rounded-sm"></div>
                      <span className="text-sm font-medium">App Name</span>
                    </div>
                    <div className="space-y-1">
                      {[
                        { label: 'Dashboard', active: true },
                        { label: 'Projects', active: false },
                        { label: 'Team', active: false },
                        { label: 'Settings', active: false },
                      ].map((item, index) => (
                        <div
                          key={index}
                          className={`flex items-center gap-2 rounded px-2 py-1.5 text-sm ${
                            item.active
                              ? 'bg-sidebar-accent text-sidebar-accent-foreground'
                              : 'text-sidebar-foreground hover:bg-sidebar-accent/50'
                          }`}
                        >
                          <div className="h-4 w-4 rounded bg-current opacity-60"></div>
                          <span>{item.label}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </div>

              {/* Floating Variant */}
              <div className="space-y-2">
                <h4 className="font-medium">Floating Sidebar</h4>
                <div className="bg-background relative h-48 overflow-hidden rounded-lg border p-4">
                  <div className="bg-sidebar border-sidebar-border space-y-3 rounded-lg border p-3 shadow-sm">
                    <div className="flex items-center gap-2">
                      <div className="bg-secondary h-6 w-6 rounded-sm"></div>
                      <span className="text-sm font-medium">Float UI</span>
                    </div>
                    <div className="space-y-1">
                      {['Tools', 'Assets', 'Layers'].map((item, index) => (
                        <div
                          key={index}
                          className="text-sidebar-foreground hover:bg-sidebar-accent/50 flex items-center gap-2 rounded px-2 py-1.5 text-sm"
                        >
                          <div className="h-4 w-4 rounded bg-current opacity-60"></div>
                          <span>{item}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </div>

              {/* Inset Variant */}
              <div className="space-y-2">
                <h4 className="font-medium">Inset Sidebar</h4>
                <div className="bg-sidebar relative h-48 overflow-hidden rounded-lg border p-2">
                  <div className="bg-background h-full rounded-lg p-3">
                    <div className="bg-sidebar border-sidebar-border h-full space-y-3 rounded-lg border p-3">
                      <div className="flex items-center gap-2">
                        <div className="bg-success h-6 w-6 rounded-sm"></div>
                        <span className="text-sm font-medium">Inset App</span>
                      </div>
                      <div className="space-y-1">
                        {['Analytics', 'Reports', 'Goals'].map(
                          (item, index) => (
                            <div
                              key={index}
                              className="text-sidebar-foreground hover:bg-sidebar-accent/50 flex items-center gap-2 rounded px-2 py-1.5 text-sm"
                            >
                              <div className="h-4 w-4 rounded bg-current opacity-60"></div>
                              <span>{item}</span>
                            </div>
                          ),
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Collapsible States */}
        <Card>
          <CardHeader>
            <CardTitle>Collapsible States</CardTitle>
            <CardDescription>
              Different collapsible modes with proper CoreLive styling
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 gap-6 md:grid-cols-3">
              {/* Expanded State */}
              <div className="space-y-2">
                <h4 className="font-medium">Expanded State</h4>
                <div className="bg-sidebar relative h-48 overflow-hidden rounded-lg border p-4">
                  <div className="space-y-3">
                    <div className="flex items-center gap-2">
                      <div className="bg-primary h-6 w-6 rounded-sm"></div>
                      <span className="text-sm font-medium">CoreLive</span>
                    </div>
                    <div className="space-y-1">
                      {[
                        { icon: '🏠', label: 'Dashboard', badge: null },
                        { icon: '📁', label: 'Projects', badge: '5' },
                        { icon: '👥', label: 'Team', badge: null },
                        { icon: '⚙️', label: 'Settings', badge: null },
                      ].map((item, index) => (
                        <div
                          key={index}
                          className="text-sidebar-foreground hover:bg-sidebar-accent/50 flex items-center gap-2 rounded px-2 py-1.5 text-sm"
                        >
                          <span className="text-xs">{item.icon}</span>
                          <span className="flex-1">{item.label}</span>
                          {item.badge && (
                            <Badge variant="secondary" className="h-4 text-xs">
                              {item.badge}
                            </Badge>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </div>

              {/* Icon Collapsed State */}
              <div className="space-y-2">
                <h4 className="font-medium">Icon Collapsed</h4>
                <div className="bg-sidebar relative h-48 w-16 overflow-hidden rounded-lg border p-4">
                  <div className="space-y-3">
                    <div className="flex items-center justify-center">
                      <div className="bg-primary h-6 w-6 rounded-sm"></div>
                    </div>
                    <div className="space-y-1">
                      {['🏠', '📁', '👥', '⚙️'].map((icon, index) => (
                        <div
                          key={index}
                          className="text-sidebar-foreground hover:bg-sidebar-accent/50 flex items-center justify-center rounded p-1.5 text-sm"
                        >
                          <span className="text-xs">{icon}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </div>

              {/* Offcanvas (Hidden) */}
              <div className="space-y-2">
                <h4 className="font-medium">Offcanvas Hidden</h4>
                <div className="bg-background relative flex h-48 items-center justify-center overflow-hidden rounded-lg border p-4">
                  <div className="text-muted-foreground text-center">
                    <div className="mb-2 text-2xl">👈</div>
                    <p className="text-sm">Sidebar is hidden offscreen</p>
                    <p className="text-xs">Click trigger to show</p>
                  </div>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Semantic Color Themes */}
        <Card>
          <CardHeader>
            <CardTitle>Semantic Color Integration</CardTitle>
            <CardDescription>
              Sidebar themes using CoreLive Design System semantic colors
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
              {[
                { color: 'primary', label: 'Primary', desc: 'Main navigation' },
                {
                  color: 'secondary',
                  label: 'Secondary',
                  desc: 'Alternative theme',
                },
                {
                  color: 'success',
                  label: 'Success',
                  desc: 'Positive actions',
                },
                {
                  color: 'warning',
                  label: 'Warning',
                  desc: 'Attention needed',
                },
              ].map((theme) => (
                <div key={theme.color} className="space-y-2">
                  <h4 className="text-sm font-medium">{theme.label}</h4>
                  <div
                    className={`h-32 rounded-lg border p-3 bg-${theme.color}/5 border-${theme.color}/20`}
                  >
                    <div className="space-y-2">
                      <div className="flex items-center gap-2">
                        <div
                          className={`h-4 w-4 bg-${theme.color} rounded-sm`}
                        ></div>
                        <span className="text-xs font-medium">
                          {theme.label} App
                        </span>
                      </div>
                      <div className="space-y-1">
                        {['Nav 1', 'Nav 2'].map((item, index) => (
                          <div
                            key={index}
                            className={`flex items-center gap-2 rounded px-2 py-1 text-xs hover:bg-${theme.color}/10`}
                          >
                            <div
                              className={`h-2 w-2 bg-${theme.color}/70 rounded`}
                            ></div>
                            <span>{item}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                  <p className="text-muted-foreground text-xs">{theme.desc}</p>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Design Tokens */}
        <Card>
          <CardHeader>
            <CardTitle>CoreLive Sidebar Design Tokens</CardTitle>
            <CardDescription>
              Design system tokens used in sidebar components
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 gap-6 text-sm md:grid-cols-2 lg:grid-cols-3">
              <div className="space-y-3">
                <h4 className="font-medium">Background Colors</h4>
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <Badge variant="outline">--sidebar</Badge>
                    <span className="text-muted-foreground">
                      Main sidebar background
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge variant="outline">--sidebar-accent</Badge>
                    <span className="text-muted-foreground">
                      Hover/active states
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge variant="outline">--sidebar-border</Badge>
                    <span className="text-muted-foreground">Border color</span>
                  </div>
                </div>
              </div>

              <div className="space-y-3">
                <h4 className="font-medium">Text Colors</h4>
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <Badge variant="outline">--sidebar-foreground</Badge>
                    <span className="text-muted-foreground">Primary text</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge variant="outline">--sidebar-accent-foreground</Badge>
                    <span className="text-muted-foreground">Active text</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge variant="outline">--sidebar-ring</Badge>
                    <span className="text-muted-foreground">Focus ring</span>
                  </div>
                </div>
              </div>

              <div className="space-y-3">
                <h4 className="font-medium">Layout Properties</h4>
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <Badge variant="outline">--sidebar-width</Badge>
                    <span className="text-muted-foreground">16rem (256px)</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge variant="outline">--sidebar-width-icon</Badge>
                    <span className="text-muted-foreground">3rem (48px)</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge variant="outline">transition-[width]</Badge>
                    <span className="text-muted-foreground">
                      Smooth animations
                    </span>
                  </div>
                </div>
              </div>
            </div>

            <Separator className="my-6" />

            <div className="space-y-4">
              <h4 className="font-medium">Component Hierarchy</h4>
              <div className="bg-muted/50 rounded-lg p-4">
                <div className="space-y-1 font-mono text-xs">
                  <div>SidebarProvider</div>
                  <div className="pl-4">├── Sidebar</div>
                  <div className="pl-8">├── SidebarHeader</div>
                  <div className="pl-8">├── SidebarContent</div>
                  <div className="pl-12">├── SidebarGroup</div>
                  <div className="pl-16">├── SidebarGroupLabel</div>
                  <div className="pl-16">├── SidebarGroupContent</div>
                  <div className="pl-20">└── SidebarMenu</div>
                  <div className="pl-24">├── SidebarMenuItem</div>
                  <div className="pl-28">├── SidebarMenuButton</div>
                  <div className="pl-28">├── SidebarMenuBadge</div>
                  <div className="pl-28">└── SidebarMenuAction</div>
                  <div className="pl-8">├── SidebarFooter</div>
                  <div className="pl-8">└── SidebarRail</div>
                  <div className="pl-4">└── SidebarInset</div>
                </div>
              </div>
            </div>

            <div className="bg-muted mt-6 rounded-lg p-4">
              <div className="mb-2 flex items-center gap-2">
                <Settings className="h-4 w-4" />
                <span className="text-sm font-medium">Advanced Features</span>
              </div>
              <div className="text-muted-foreground space-y-2 text-sm">
                <p>
                  • <strong>Keyboard Navigation:</strong> Cmd/Ctrl + B to toggle
                  sidebar
                </p>
                <p>
                  • <strong>Mobile Responsive:</strong> Automatically converts
                  to sheet on mobile
                </p>
                <p>
                  • <strong>State Persistence:</strong> Remembers collapsed
                  state in cookies
                </p>
                <p>
                  • <strong>Accessibility:</strong> Full keyboard navigation and
                  screen reader support
                </p>
                <p>
                  • <strong>Tooltips:</strong> Automatic tooltips in collapsed
                  icon mode
                </p>
                <p>
                  • <strong>Smooth Animations:</strong> CSS transitions for all
                  state changes
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  ),
}
