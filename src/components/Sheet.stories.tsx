import type { Meta, StoryObj } from '@storybook/react'
import {
  Menu,
  Settings,
  User,
  Bell,
  Monitor,
  Moon,
  Sun,
  ShoppingCart,
  Plus,
  Minus,
  Trash2,
  CreditCard,
  Gift,
  Star,
  Heart,
  Share,
  Camera,
  Home,
  Users,
  FileText,
  Download,
  Upload,
  Info,
  HelpCircle,
  LogOut,
  ChevronRight,
  X,
  Check,
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
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
import { ScrollArea } from '@/components/ui/scroll-area'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Separator } from '@/components/ui/separator'
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
  SheetFooter,
  SheetClose,
} from '@/components/ui/sheet'
import { Switch } from '@/components/ui/switch'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Textarea } from '@/components/ui/textarea'

const meta: Meta<typeof Sheet> = {
  title: 'Components/Sheet',
  component: Sheet,
  parameters: {
    layout: 'centered',
    docs: {
      description: {
        component:
          'Side panels that slide in from the edges of the screen, built on top of Dialog primitives.',
      },
    },
  },
  tags: ['autodocs'],
}

export default meta
type Story = StoryObj<typeof Sheet>

export const Default: Story = {
  args: {},
  render: () => (
    <Sheet>
      <SheetTrigger asChild>
        <Button>Open Sheet</Button>
      </SheetTrigger>
      <SheetContent>
        <SheetHeader>
          <SheetTitle>Edit Profile</SheetTitle>
          <SheetDescription>
            Make changes to your profile here. Click save when you're done.
          </SheetDescription>
        </SheetHeader>
        <div className="grid gap-4 py-4">
          <div className="grid grid-cols-4 items-center gap-4">
            <Label htmlFor="name" className="text-right">
              Name
            </Label>
            <Input
              id="name"
              defaultValue="Pedro Duarte"
              className="col-span-3"
            />
          </div>
          <div className="grid grid-cols-4 items-center gap-4">
            <Label htmlFor="username" className="text-right">
              Username
            </Label>
            <Input
              id="username"
              defaultValue="@peduarte"
              className="col-span-3"
            />
          </div>
        </div>
        <SheetFooter>
          <SheetClose asChild>
            <Button type="submit">Save changes</Button>
          </SheetClose>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  ),
}

export const LeftSide: Story = {
  args: {},
  render: () => (
    <Sheet>
      <SheetTrigger asChild>
        <Button variant="outline">
          <Menu className="mr-2 h-4 w-4" />
          Menu
        </Button>
      </SheetTrigger>
      <SheetContent side="left">
        <SheetHeader>
          <SheetTitle>Navigation Menu</SheetTitle>
          <SheetDescription>
            Access all sections of the application
          </SheetDescription>
        </SheetHeader>
        <div className="space-y-4 py-4">
          <div className="space-y-2">
            {[
              { icon: Home, label: 'Dashboard', badge: null },
              { icon: Users, label: 'Team', badge: '3' },
              { icon: FileText, label: 'Projects', badge: '12' },
              { icon: Settings, label: 'Settings', badge: null },
              { icon: Bell, label: 'Notifications', badge: '5' },
              { icon: HelpCircle, label: 'Help & Support', badge: null },
            ].map((item, index) => (
              <Button
                key={index}
                variant="ghost"
                className="w-full justify-start"
              >
                <item.icon className="mr-2 h-4 w-4" />
                {item.label}
                {item.badge && (
                  <Badge className="ml-auto" variant="secondary">
                    {item.badge}
                  </Badge>
                )}
              </Button>
            ))}
          </div>
          <Separator />
          <div className="space-y-2">
            <h4 className="text-sm font-medium">Recent Projects</h4>
            {['Website Redesign', 'Mobile App', 'API Documentation'].map(
              (project, index) => (
                <Button
                  key={index}
                  variant="ghost"
                  className="w-full justify-start text-sm"
                >
                  <FileText className="mr-2 h-3 w-3" />
                  {project}
                </Button>
              ),
            )}
          </div>
        </div>
        <SheetFooter>
          <Button variant="outline" className="w-full">
            <LogOut className="mr-2 h-4 w-4" />
            Sign Out
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  ),
}

export const TopSide: Story = {
  args: {},
  render: () => (
    <Sheet>
      <SheetTrigger asChild>
        <Button variant="outline">
          <Bell className="mr-2 h-4 w-4" />
          Notifications
        </Button>
      </SheetTrigger>
      <SheetContent side="top" className="h-auto">
        <SheetHeader>
          <SheetTitle>Recent Notifications</SheetTitle>
          <SheetDescription>
            Stay updated with the latest activity
          </SheetDescription>
        </SheetHeader>
        <div className="grid gap-4 py-4">
          <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
            {[
              {
                type: 'success',
                icon: Check,
                title: 'Task Completed',
                desc: 'Website deployment finished successfully',
                time: '2m ago',
              },
              {
                type: 'info',
                icon: User,
                title: 'New Team Member',
                desc: 'Sarah Johnson joined your team',
                time: '1h ago',
              },
              {
                type: 'warning',
                icon: Bell,
                title: 'Deadline Reminder',
                desc: 'Project milestone due tomorrow',
                time: '3h ago',
              },
            ].map((notification, index) => (
              <Card key={index}>
                <CardContent className="p-4">
                  <div className="flex items-start gap-3">
                    <div
                      className={`rounded-full p-2 bg-${notification.type}/10`}
                    >
                      <notification.icon
                        className={`h-4 w-4 text-${notification.type}`}
                      />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium">
                        {notification.title}
                      </p>
                      <p className="text-muted-foreground mt-1 text-xs">
                        {notification.desc}
                      </p>
                      <p className="text-muted-foreground mt-2 text-xs">
                        {notification.time}
                      </p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
        <SheetFooter>
          <Button variant="outline" className="w-full">
            View All Notifications
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  ),
}

export const BottomSide: Story = {
  args: {},
  render: () => (
    <Sheet>
      <SheetTrigger asChild>
        <Button variant="outline">
          <Upload className="mr-2 h-4 w-4" />
          Quick Actions
        </Button>
      </SheetTrigger>
      <SheetContent side="bottom" className="h-auto">
        <SheetHeader>
          <SheetTitle>Quick Actions</SheetTitle>
          <SheetDescription>Perform common tasks quickly</SheetDescription>
        </SheetHeader>
        <div className="grid gap-4 py-4">
          <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
            {[
              { icon: Upload, label: 'Upload File', desc: 'Add new documents' },
              { icon: Download, label: 'Download', desc: 'Export data' },
              { icon: Share, label: 'Share', desc: 'Invite team members' },
              { icon: Plus, label: 'Create New', desc: 'Start a new project' },
            ].map((action, index) => (
              <Button
                key={index}
                variant="outline"
                className="h-auto flex-col p-4"
              >
                <action.icon className="mb-2 h-6 w-6" />
                <div className="text-center">
                  <div className="text-sm font-medium">{action.label}</div>
                  <div className="text-muted-foreground text-xs">
                    {action.desc}
                  </div>
                </div>
              </Button>
            ))}
          </div>
        </div>
      </SheetContent>
    </Sheet>
  ),
}

export const ProfileSheet: Story = {
  args: {},
  render: () => {
    const [profileData, setProfileData] = useState({
      name: 'Alex Johnson',
      email: 'alex.johnson@example.com',
      phone: '+1 (555) 123-4567',
      location: 'San Francisco, CA',
      bio: 'Full-stack developer passionate about creating amazing user experiences.',
      company: 'CoreLive Inc.',
      role: 'Senior Developer',
    })

    return (
      <Sheet>
        <SheetTrigger asChild>
          <Button>
            <User className="mr-2 h-4 w-4" />
            Edit Profile
          </Button>
        </SheetTrigger>
        <SheetContent className="sm:max-w-md">
          <SheetHeader>
            <SheetTitle>Profile Settings</SheetTitle>
            <SheetDescription>
              Update your personal information and preferences
            </SheetDescription>
          </SheetHeader>

          <ScrollArea className="h-[600px] pr-4">
            <div className="space-y-6 py-4">
              {/* Avatar Section */}
              <div className="flex flex-col items-center gap-4">
                <Avatar className="h-20 w-20">
                  <AvatarImage src="https://github.com/shadcn.png" />
                  <AvatarFallback>AJ</AvatarFallback>
                </Avatar>
                <Button variant="outline" size="sm">
                  <Camera className="mr-2 h-4 w-4" />
                  Change Photo
                </Button>
              </div>

              <Separator />

              {/* Basic Information */}
              <div className="space-y-4">
                <h4 className="font-medium">Basic Information</h4>
                <div className="grid gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="name">Full Name</Label>
                    <Input
                      id="name"
                      value={profileData.name}
                      onChange={(e) =>
                        setProfileData({ ...profileData, name: e.target.value })
                      }
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="email">Email</Label>
                    <Input
                      id="email"
                      type="email"
                      value={profileData.email}
                      onChange={(e) =>
                        setProfileData({
                          ...profileData,
                          email: e.target.value,
                        })
                      }
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="phone">Phone</Label>
                    <Input
                      id="phone"
                      value={profileData.phone}
                      onChange={(e) =>
                        setProfileData({
                          ...profileData,
                          phone: e.target.value,
                        })
                      }
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="location">Location</Label>
                    <Input
                      id="location"
                      value={profileData.location}
                      onChange={(e) =>
                        setProfileData({
                          ...profileData,
                          location: e.target.value,
                        })
                      }
                    />
                  </div>
                </div>
              </div>

              <Separator />

              {/* Professional Information */}
              <div className="space-y-4">
                <h4 className="font-medium">Professional Information</h4>
                <div className="grid gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="company">Company</Label>
                    <Input
                      id="company"
                      value={profileData.company}
                      onChange={(e) =>
                        setProfileData({
                          ...profileData,
                          company: e.target.value,
                        })
                      }
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="role">Role</Label>
                    <Input
                      id="role"
                      value={profileData.role}
                      onChange={(e) =>
                        setProfileData({ ...profileData, role: e.target.value })
                      }
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="bio">Bio</Label>
                    <Textarea
                      id="bio"
                      rows={3}
                      value={profileData.bio}
                      onChange={(e) =>
                        setProfileData({ ...profileData, bio: e.target.value })
                      }
                    />
                  </div>
                </div>
              </div>

              <Separator />

              {/* Preferences */}
              <div className="space-y-4">
                <h4 className="font-medium">Preferences</h4>
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <div className="space-y-0.5">
                      <Label>Email Notifications</Label>
                      <p className="text-muted-foreground text-sm">
                        Receive email updates about your activity
                      </p>
                    </div>
                    <Switch defaultChecked />
                  </div>
                  <div className="flex items-center justify-between">
                    <div className="space-y-0.5">
                      <Label>Marketing Emails</Label>
                      <p className="text-muted-foreground text-sm">
                        Receive emails about new features and updates
                      </p>
                    </div>
                    <Switch />
                  </div>
                  <div className="space-y-2">
                    <Label>Language</Label>
                    <Select defaultValue="en">
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="en">English</SelectItem>
                        <SelectItem value="es">Spanish</SelectItem>
                        <SelectItem value="fr">French</SelectItem>
                        <SelectItem value="de">German</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              </div>
            </div>
          </ScrollArea>

          <SheetFooter className="gap-2">
            <SheetClose asChild>
              <Button variant="outline">Cancel</Button>
            </SheetClose>
            <SheetClose asChild>
              <Button>Save Changes</Button>
            </SheetClose>
          </SheetFooter>
        </SheetContent>
      </Sheet>
    )
  },
}

export const CartSheet: Story = {
  args: {},
  render: () => {
    const [cartItems, setCartItems] = useState([
      {
        id: 1,
        name: 'Wireless Headphones',
        price: 99.99,
        quantity: 1,
        image: '🎧',
      },
      {
        id: 2,
        name: 'Smartphone Case',
        price: 24.99,
        quantity: 2,
        image: '📱',
      },
      { id: 3, name: 'USB Cable', price: 12.99, quantity: 1, image: '🔌' },
    ])

    const updateQuantity = (id: number, change: number) => {
      setCartItems((items) =>
        items
          .map((item) =>
            item.id === id
              ? { ...item, quantity: Math.max(0, item.quantity + change) }
              : item,
          )
          .filter((item) => item.quantity > 0),
      )
    }

    const removeItem = (id: number) => {
      setCartItems((items) => items.filter((item) => item.id !== id))
    }

    const total = cartItems.reduce(
      (sum, item) => sum + item.price * item.quantity,
      0,
    )

    return (
      <Sheet>
        <SheetTrigger asChild>
          <Button>
            <ShoppingCart className="mr-2 h-4 w-4" />
            Cart ({cartItems.reduce((sum, item) => sum + item.quantity, 0)})
          </Button>
        </SheetTrigger>
        <SheetContent>
          <SheetHeader>
            <SheetTitle>Shopping Cart</SheetTitle>
            <SheetDescription>
              Review your items before checkout
            </SheetDescription>
          </SheetHeader>

          <ScrollArea className="h-[400px] pr-4">
            <div className="space-y-4 py-4">
              {cartItems.length === 0 ? (
                <div className="py-8 text-center">
                  <ShoppingCart className="text-muted-foreground mx-auto mb-4 h-12 w-12" />
                  <p className="text-muted-foreground">Your cart is empty</p>
                </div>
              ) : (
                cartItems.map((item) => (
                  <div
                    key={item.id}
                    className="flex items-center gap-4 rounded-lg border p-4"
                  >
                    <div className="text-2xl">{item.image}</div>
                    <div className="min-w-0 flex-1">
                      <h4 className="text-sm font-medium">{item.name}</h4>
                      <p className="text-muted-foreground text-sm">
                        ${item.price.toFixed(2)} each
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => updateQuantity(item.id, -1)}
                      >
                        <Minus className="h-3 w-3" />
                      </Button>
                      <span className="w-8 text-center text-sm">
                        {item.quantity}
                      </span>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => updateQuantity(item.id, 1)}
                      >
                        <Plus className="h-3 w-3" />
                      </Button>
                    </div>
                    <div className="text-right">
                      <p className="text-sm font-medium">
                        ${(item.price * item.quantity).toFixed(2)}
                      </p>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => removeItem(item.id)}
                        className="text-destructive hover:text-destructive"
                      >
                        <Trash2 className="h-3 w-3" />
                      </Button>
                    </div>
                  </div>
                ))
              )}
            </div>
          </ScrollArea>

          {cartItems.length > 0 && (
            <>
              <Separator />

              <div className="space-y-4 py-4">
                <div className="flex justify-between text-lg font-semibold">
                  <span>Total</span>
                  <span>${total.toFixed(2)}</span>
                </div>

                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    <Gift className="h-4 w-4" />
                    <Input placeholder="Promo code" className="flex-1" />
                    <Button variant="outline" size="sm">
                      Apply
                    </Button>
                  </div>
                </div>
              </div>

              <SheetFooter className="gap-2">
                <SheetClose asChild>
                  <Button variant="outline" className="flex-1">
                    Continue Shopping
                  </Button>
                </SheetClose>
                <SheetClose asChild>
                  <Button className="flex-1">
                    <CreditCard className="mr-2 h-4 w-4" />
                    Checkout
                  </Button>
                </SheetClose>
              </SheetFooter>
            </>
          )}
        </SheetContent>
      </Sheet>
    )
  },
}

export const SettingsSheet: Story = {
  args: {},
  render: () => (
    <Sheet>
      <SheetTrigger asChild>
        <Button variant="outline">
          <Settings className="mr-2 h-4 w-4" />
          Settings
        </Button>
      </SheetTrigger>
      <SheetContent className="sm:max-w-md">
        <SheetHeader>
          <SheetTitle>Settings</SheetTitle>
          <SheetDescription>
            Configure your application preferences
          </SheetDescription>
        </SheetHeader>

        <Tabs defaultValue="general" className="py-4">
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="general">General</TabsTrigger>
            <TabsTrigger value="appearance">Theme</TabsTrigger>
            <TabsTrigger value="notifications">Alerts</TabsTrigger>
          </TabsList>

          <ScrollArea className="h-[500px] pr-4">
            <TabsContent value="general" className="mt-6 space-y-6">
              <div className="space-y-4">
                <h4 className="font-medium">Language & Region</h4>
                <div className="space-y-3">
                  <div className="space-y-2">
                    <Label>Language</Label>
                    <Select defaultValue="en">
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="en">English</SelectItem>
                        <SelectItem value="es">Spanish</SelectItem>
                        <SelectItem value="fr">French</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label>Time Zone</Label>
                    <Select defaultValue="pst">
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="pst">
                          Pacific Standard Time
                        </SelectItem>
                        <SelectItem value="est">
                          Eastern Standard Time
                        </SelectItem>
                        <SelectItem value="utc">UTC</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              </div>

              <Separator />

              <div className="space-y-4">
                <h4 className="font-medium">Privacy</h4>
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <div className="space-y-0.5">
                      <Label>Analytics</Label>
                      <p className="text-muted-foreground text-sm">
                        Help improve the app by sharing usage data
                      </p>
                    </div>
                    <Switch defaultChecked />
                  </div>
                  <div className="flex items-center justify-between">
                    <div className="space-y-0.5">
                      <Label>Crash Reports</Label>
                      <p className="text-muted-foreground text-sm">
                        Automatically send crash reports
                      </p>
                    </div>
                    <Switch defaultChecked />
                  </div>
                </div>
              </div>
            </TabsContent>

            <TabsContent value="appearance" className="mt-6 space-y-6">
              <div className="space-y-4">
                <h4 className="font-medium">Theme</h4>
                <RadioGroup defaultValue="system" className="space-y-3">
                  <div className="flex items-center space-x-2">
                    <RadioGroupItem value="light" id="light" />
                    <Label htmlFor="light" className="flex items-center gap-2">
                      <Sun className="h-4 w-4" />
                      Light
                    </Label>
                  </div>
                  <div className="flex items-center space-x-2">
                    <RadioGroupItem value="dark" id="dark" />
                    <Label htmlFor="dark" className="flex items-center gap-2">
                      <Moon className="h-4 w-4" />
                      Dark
                    </Label>
                  </div>
                  <div className="flex items-center space-x-2">
                    <RadioGroupItem value="system" id="system" />
                    <Label htmlFor="system" className="flex items-center gap-2">
                      <Monitor className="h-4 w-4" />
                      System
                    </Label>
                  </div>
                </RadioGroup>
              </div>

              <Separator />

              <div className="space-y-4">
                <h4 className="font-medium">Display</h4>
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <div className="space-y-0.5">
                      <Label>Reduce Motion</Label>
                      <p className="text-muted-foreground text-sm">
                        Minimize animations and transitions
                      </p>
                    </div>
                    <Switch />
                  </div>
                  <div className="flex items-center justify-between">
                    <div className="space-y-0.5">
                      <Label>High Contrast</Label>
                      <p className="text-muted-foreground text-sm">
                        Increase contrast for better visibility
                      </p>
                    </div>
                    <Switch />
                  </div>
                </div>
              </div>
            </TabsContent>

            <TabsContent value="notifications" className="mt-6 space-y-6">
              <div className="space-y-4">
                <h4 className="font-medium">Push Notifications</h4>
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <div className="space-y-0.5">
                      <Label>Enable Notifications</Label>
                      <p className="text-muted-foreground text-sm">
                        Receive push notifications
                      </p>
                    </div>
                    <Switch defaultChecked />
                  </div>
                  <div className="flex items-center justify-between">
                    <div className="space-y-0.5">
                      <Label>Comments</Label>
                      <p className="text-muted-foreground text-sm">
                        When someone comments on your posts
                      </p>
                    </div>
                    <Switch defaultChecked />
                  </div>
                  <div className="flex items-center justify-between">
                    <div className="space-y-0.5">
                      <Label>Mentions</Label>
                      <p className="text-muted-foreground text-sm">
                        When someone mentions you
                      </p>
                    </div>
                    <Switch defaultChecked />
                  </div>
                  <div className="flex items-center justify-between">
                    <div className="space-y-0.5">
                      <Label>Marketing</Label>
                      <p className="text-muted-foreground text-sm">
                        Updates about new features
                      </p>
                    </div>
                    <Switch />
                  </div>
                </div>
              </div>

              <Separator />

              <div className="space-y-4">
                <h4 className="font-medium">Email Notifications</h4>
                <div className="space-y-3">
                  <div className="space-y-2">
                    <Label>Digest Frequency</Label>
                    <Select defaultValue="weekly">
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="daily">Daily</SelectItem>
                        <SelectItem value="weekly">Weekly</SelectItem>
                        <SelectItem value="monthly">Monthly</SelectItem>
                        <SelectItem value="never">Never</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              </div>
            </TabsContent>
          </ScrollArea>
        </Tabs>

        <SheetFooter className="gap-2">
          <SheetClose asChild>
            <Button variant="outline">Cancel</Button>
          </SheetClose>
          <SheetClose asChild>
            <Button>Save Settings</Button>
          </SheetClose>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  ),
}

export const CoreLiveThemeShowcase: Story = {
  args: {},
  render: () => (
    <div className="w-full max-w-6xl space-y-8">
      <div className="space-y-2 text-center">
        <h2 className="text-2xl font-bold">CoreLive Sheet Components</h2>
        <p className="text-muted-foreground">
          Side panels and drawers showcasing CoreLive Design System integration
        </p>
      </div>

      <div className="space-y-6">
        {/* Sheet Directions */}
        <Card>
          <CardHeader>
            <CardTitle>Sheet Directions</CardTitle>
            <CardDescription>
              Sheets can slide in from all four sides with CoreLive styling
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
              {/* Right Side */}
              <Sheet>
                <SheetTrigger asChild>
                  <Button variant="outline" className="h-auto flex-col p-4">
                    <ChevronRight className="text-primary mb-2 h-6 w-6" />
                    <div className="text-center">
                      <div className="text-sm font-medium">Right Side</div>
                      <div className="text-muted-foreground text-xs">
                        Default position
                      </div>
                    </div>
                  </Button>
                </SheetTrigger>
                <SheetContent side="right" className="bg-primary/5">
                  <SheetHeader>
                    <SheetTitle className="text-primary">
                      Right Panel
                    </SheetTitle>
                    <SheetDescription>
                      Content slides in from the right side
                    </SheetDescription>
                  </SheetHeader>
                  <div className="py-4">
                    <div className="space-y-4">
                      <Badge className="bg-primary">Primary Theme</Badge>
                      <p className="text-sm">
                        This sheet demonstrates the primary color theme
                        integration.
                      </p>
                    </div>
                  </div>
                </SheetContent>
              </Sheet>

              {/* Left Side */}
              <Sheet>
                <SheetTrigger asChild>
                  <Button variant="outline" className="h-auto flex-col p-4">
                    <ChevronRight className="text-secondary mb-2 h-6 w-6 rotate-180" />
                    <div className="text-center">
                      <div className="text-sm font-medium">Left Side</div>
                      <div className="text-muted-foreground text-xs">
                        Navigation menu
                      </div>
                    </div>
                  </Button>
                </SheetTrigger>
                <SheetContent side="left" className="bg-secondary/5">
                  <SheetHeader>
                    <SheetTitle className="text-secondary">
                      Left Panel
                    </SheetTitle>
                    <SheetDescription>
                      Content slides in from the left side
                    </SheetDescription>
                  </SheetHeader>
                  <div className="py-4">
                    <div className="space-y-4">
                      <Badge className="bg-secondary text-secondary-foreground">
                        Secondary Theme
                      </Badge>
                      <p className="text-sm">
                        Perfect for navigation menus and sidebars.
                      </p>
                    </div>
                  </div>
                </SheetContent>
              </Sheet>

              {/* Top Side */}
              <Sheet>
                <SheetTrigger asChild>
                  <Button variant="outline" className="h-auto flex-col p-4">
                    <ChevronRight className="text-success mb-2 h-6 w-6 -rotate-90" />
                    <div className="text-center">
                      <div className="text-sm font-medium">Top Side</div>
                      <div className="text-muted-foreground text-xs">
                        Notifications
                      </div>
                    </div>
                  </Button>
                </SheetTrigger>
                <SheetContent side="top" className="bg-success/5 h-auto">
                  <SheetHeader>
                    <SheetTitle className="text-success">Top Panel</SheetTitle>
                    <SheetDescription>
                      Content slides in from the top
                    </SheetDescription>
                  </SheetHeader>
                  <div className="py-4">
                    <div className="space-y-4">
                      <Badge className="bg-success text-success-foreground">
                        Success Theme
                      </Badge>
                      <p className="text-sm">
                        Great for notifications and alerts.
                      </p>
                    </div>
                  </div>
                </SheetContent>
              </Sheet>

              {/* Bottom Side */}
              <Sheet>
                <SheetTrigger asChild>
                  <Button variant="outline" className="h-auto flex-col p-4">
                    <ChevronRight className="text-warning mb-2 h-6 w-6 rotate-90" />
                    <div className="text-center">
                      <div className="text-sm font-medium">Bottom Side</div>
                      <div className="text-muted-foreground text-xs">
                        Quick actions
                      </div>
                    </div>
                  </Button>
                </SheetTrigger>
                <SheetContent side="bottom" className="bg-warning/5 h-auto">
                  <SheetHeader>
                    <SheetTitle className="text-warning">
                      Bottom Panel
                    </SheetTitle>
                    <SheetDescription>
                      Content slides in from the bottom
                    </SheetDescription>
                  </SheetHeader>
                  <div className="py-4">
                    <div className="space-y-4">
                      <Badge className="bg-warning text-warning-foreground">
                        Warning Theme
                      </Badge>
                      <p className="text-sm">
                        Ideal for quick actions and mobile interfaces.
                      </p>
                    </div>
                  </div>
                </SheetContent>
              </Sheet>
            </div>
          </CardContent>
        </Card>

        {/* Semantic Color Themes */}
        <Card>
          <CardHeader>
            <CardTitle>Semantic Color Integration</CardTitle>
            <CardDescription>
              Sheets with different semantic color themes from CoreLive Design
              System
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
              {[
                {
                  color: 'danger',
                  label: 'Danger',
                  desc: 'Error states',
                  icon: X,
                },
                {
                  color: 'info',
                  label: 'Info',
                  desc: 'Information',
                  icon: Info,
                },
                {
                  color: 'discovery',
                  label: 'Discovery',
                  desc: 'New features',
                  icon: Star,
                },
                {
                  color: 'accent',
                  label: 'Accent',
                  desc: 'Highlights',
                  icon: Heart,
                },
              ].map((theme) => (
                <Sheet key={theme.color}>
                  <SheetTrigger asChild>
                    <Button variant="outline" className="h-auto flex-col p-4">
                      <theme.icon
                        className={`mb-2 h-6 w-6 text-${theme.color}`}
                      />
                      <div className="text-center">
                        <div className="text-sm font-medium">{theme.label}</div>
                        <div className="text-muted-foreground text-xs">
                          {theme.desc}
                        </div>
                      </div>
                    </Button>
                  </SheetTrigger>
                  <SheetContent className={`bg-${theme.color}/5`}>
                    <SheetHeader>
                      <SheetTitle className={`text-${theme.color}`}>
                        {theme.label} Sheet
                      </SheetTitle>
                      <SheetDescription>
                        Themed sheet using {theme.color} color from CoreLive
                        Design System
                      </SheetDescription>
                    </SheetHeader>
                    <div className="space-y-4 py-4">
                      <Badge
                        className={`bg-${theme.color} text-${theme.color}-foreground`}
                      >
                        {theme.label.toUpperCase()}
                      </Badge>
                      <p className="text-sm">
                        This sheet demonstrates the {theme.color} semantic color
                        integration with proper contrast and accessibility
                        features.
                      </p>
                      <div className="space-y-2">
                        <div className="text-xs font-medium">
                          Design Tokens Used:
                        </div>
                        <div className="space-y-1 text-xs">
                          <div>
                            <code className="bg-muted rounded px-1">
                              --{theme.color}
                            </code>{' '}
                            - Background color
                          </div>
                          <div>
                            <code className="bg-muted rounded px-1">
                              --{theme.color}-foreground
                            </code>{' '}
                            - Text color
                          </div>
                        </div>
                      </div>
                    </div>
                  </SheetContent>
                </Sheet>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Design Tokens */}
        <Card>
          <CardHeader>
            <CardTitle>CoreLive Sheet Design Tokens</CardTitle>
            <CardDescription>
              Design system tokens used in sheet components
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 gap-6 text-sm md:grid-cols-2 lg:grid-cols-3">
              <div className="space-y-3">
                <h4 className="font-medium">Background & Overlay</h4>
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <Badge variant="outline">--background</Badge>
                    <span className="text-muted-foreground">
                      Sheet background
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge variant="outline">bg-black/50</Badge>
                    <span className="text-muted-foreground">
                      Overlay opacity
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge variant="outline">shadow-lg</Badge>
                    <span className="text-muted-foreground">Drop shadow</span>
                  </div>
                </div>
              </div>

              <div className="space-y-3">
                <h4 className="font-medium">Typography</h4>
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <Badge variant="outline">--foreground</Badge>
                    <span className="text-muted-foreground">Title color</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge variant="outline">--muted-foreground</Badge>
                    <span className="text-muted-foreground">
                      Description color
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge variant="outline">font-semibold</Badge>
                    <span className="text-muted-foreground">Title weight</span>
                  </div>
                </div>
              </div>

              <div className="space-y-3">
                <h4 className="font-medium">Animation</h4>
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <Badge variant="outline">slide-in</Badge>
                    <span className="text-muted-foreground">
                      Entry animation
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge variant="outline">slide-out</Badge>
                    <span className="text-muted-foreground">
                      Exit animation
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge variant="outline">duration-500</Badge>
                    <span className="text-muted-foreground">
                      Animation timing
                    </span>
                  </div>
                </div>
              </div>
            </div>

            <Separator className="my-6" />

            <div className="space-y-4">
              <h4 className="font-medium">Layout Properties</h4>
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <h5 className="text-sm font-medium">Sheet Content</h5>
                  <div className="space-y-1 text-xs">
                    <div>
                      <code className="bg-muted rounded px-1">
                        position: fixed
                      </code>
                    </div>
                    <div>
                      <code className="bg-muted rounded px-1">z-index: 50</code>
                    </div>
                    <div>
                      <code className="bg-muted rounded px-1">
                        display: flex
                      </code>
                    </div>
                    <div>
                      <code className="bg-muted rounded px-1">
                        flex-direction: column
                      </code>
                    </div>
                  </div>
                </div>
                <div className="space-y-2">
                  <h5 className="text-sm font-medium">Responsive Sizing</h5>
                  <div className="space-y-1 text-xs">
                    <div>
                      <code className="bg-muted rounded px-1">
                        width: 75% (mobile)
                      </code>
                    </div>
                    <div>
                      <code className="bg-muted rounded px-1">
                        max-width: 400px (sm+)
                      </code>
                    </div>
                    <div>
                      <code className="bg-muted rounded px-1">
                        height: 100% (sides)
                      </code>
                    </div>
                    <div>
                      <code className="bg-muted rounded px-1">
                        height: auto (top/bottom)
                      </code>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <div className="bg-muted mt-6 rounded-lg p-4">
              <div className="mb-2 flex items-center gap-2">
                <Info className="h-4 w-4" />
                <span className="text-sm font-medium">
                  Accessibility Features
                </span>
              </div>
              <p className="text-muted-foreground text-sm">
                Sheet components include comprehensive keyboard navigation,
                focus trapping, screen reader announcements, and proper ARIA
                attributes. The overlay can be dismissed with Escape key, and
                focus is automatically managed when opened and closed.
              </p>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  ),
}
