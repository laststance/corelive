import type { Meta, StoryObj } from '@storybook/react'
import {
  ChevronDown,
  User,
  Settings,
  CreditCard,
  LogOut,
  Bell,
  Mail,
  Plus,
  Download,
  Share,
  Copy,
  Scissors,
  Clipboard,
  Trash2,
  Archive,
  Star,
  Heart,
  Tag,
  Eye,
  EyeOff,
  Lock,
  Folder,
  File,
  Image,
  Video,
  Code,
  Type,
  Palette,
  Filter,
  SortAsc,
  Grid,
  List,
  Calendar,
  Users,
  Volume2,
  VolumeX,
  Play,
  Pause,
  Repeat,
  Shuffle,
  MoreHorizontal,
  Check,
  X,
  AlertCircle,
  Info,
  ExternalLink,
  Maximize,
  Monitor,
  Sun,
  Moon,
  Zap,
  Wifi,
  WifiOff,
  Battery,
  BatteryLow,
  BluetoothConnected,
  BluetoothOff,
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
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuCheckboxItem,
  DropdownMenuRadioItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuShortcut,
  DropdownMenuGroup,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuRadioGroup,
} from '@/components/ui/dropdown-menu'

const meta: Meta<typeof DropdownMenu> = {
  title: 'CoreLive Design System/Components/Dropdown Menu',
  component: DropdownMenu,
  parameters: {
    layout: 'centered',
    docs: {
      description: {
        component:
          'A dropdown menu component triggered by clicking. Built with Radix UI and styled with CoreLive Design System tokens.',
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
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline">
          Open Menu
          <ChevronDown className="ml-2 h-4 w-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent className="w-56">
        <DropdownMenuLabel>My Account</DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem>
          <User className="mr-2 h-4 w-4" />
          <span>Profile</span>
          <DropdownMenuShortcut>⇧⌘P</DropdownMenuShortcut>
        </DropdownMenuItem>
        <DropdownMenuItem>
          <CreditCard className="mr-2 h-4 w-4" />
          <span>Billing</span>
          <DropdownMenuShortcut>⌘B</DropdownMenuShortcut>
        </DropdownMenuItem>
        <DropdownMenuItem>
          <Settings className="mr-2 h-4 w-4" />
          <span>Settings</span>
          <DropdownMenuShortcut>⌘S</DropdownMenuShortcut>
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem>
          <LogOut className="mr-2 h-4 w-4" />
          <span>Log out</span>
          <DropdownMenuShortcut>⇧⌘Q</DropdownMenuShortcut>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  ),
}

export const WithCheckboxItems: Story = {
  args: {},
  render: () => {
    const [showStatusBar, setShowStatusBar] = useState(true)
    const [showActivityBar, setShowActivityBar] = useState(false)
    const [showPanel, setShowPanel] = useState(false)

    return (
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="outline">
            View Options
            <ChevronDown className="ml-2 h-4 w-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent className="w-56">
          <DropdownMenuLabel>Appearance</DropdownMenuLabel>
          <DropdownMenuSeparator />
          <DropdownMenuCheckboxItem
            checked={showStatusBar}
            onCheckedChange={setShowStatusBar}
          >
            Status Bar
          </DropdownMenuCheckboxItem>
          <DropdownMenuCheckboxItem
            checked={showActivityBar}
            onCheckedChange={setShowActivityBar}
          >
            Activity Bar
          </DropdownMenuCheckboxItem>
          <DropdownMenuCheckboxItem
            checked={showPanel}
            onCheckedChange={setShowPanel}
            disabled
          >
            Panel (Coming Soon)
          </DropdownMenuCheckboxItem>
        </DropdownMenuContent>
      </DropdownMenu>
    )
  },
}

export const WithRadioItems: Story = {
  args: {},
  render: () => {
    const [position, setPosition] = useState('bottom')

    return (
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="outline">
            Position: {position}
            <ChevronDown className="ml-2 h-4 w-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent className="w-56">
          <DropdownMenuLabel>Panel Position</DropdownMenuLabel>
          <DropdownMenuSeparator />
          <DropdownMenuRadioGroup value={position} onValueChange={setPosition}>
            <DropdownMenuRadioItem value="top">Top</DropdownMenuRadioItem>
            <DropdownMenuRadioItem value="bottom">Bottom</DropdownMenuRadioItem>
            <DropdownMenuRadioItem value="right">Right</DropdownMenuRadioItem>
          </DropdownMenuRadioGroup>
        </DropdownMenuContent>
      </DropdownMenu>
    )
  },
}

export const WithSubmenus: Story = {
  args: {},
  render: () => (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline">
          Actions
          <ChevronDown className="ml-2 h-4 w-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent className="w-56">
        <DropdownMenuLabel>Quick Actions</DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem>
          <Plus className="mr-2 h-4 w-4" />
          <span>New Item</span>
        </DropdownMenuItem>
        <DropdownMenuSub>
          <DropdownMenuSubTrigger>
            <File className="mr-2 h-4 w-4" />
            <span>New File</span>
          </DropdownMenuSubTrigger>
          <DropdownMenuSubContent className="w-48">
            <DropdownMenuItem>
              <File className="mr-2 h-4 w-4" />
              <span>Text Document</span>
            </DropdownMenuItem>
            <DropdownMenuItem>
              <Code className="mr-2 h-4 w-4" />
              <span>Code File</span>
            </DropdownMenuItem>
            <DropdownMenuItem>
              <Image className="mr-2 h-4 w-4" />
              <span>Image</span>
            </DropdownMenuItem>
            <DropdownMenuItem>
              <Video className="mr-2 h-4 w-4" />
              <span>Video</span>
            </DropdownMenuItem>
          </DropdownMenuSubContent>
        </DropdownMenuSub>
        <DropdownMenuSub>
          <DropdownMenuSubTrigger>
            <Share className="mr-2 h-4 w-4" />
            <span>Share</span>
          </DropdownMenuSubTrigger>
          <DropdownMenuSubContent className="w-48">
            <DropdownMenuItem>
              <Mail className="mr-2 h-4 w-4" />
              <span>Email</span>
            </DropdownMenuItem>
            <DropdownMenuItem>
              <Copy className="mr-2 h-4 w-4" />
              <span>Copy Link</span>
            </DropdownMenuItem>
            <DropdownMenuItem>
              <ExternalLink className="mr-2 h-4 w-4" />
              <span>Open in New Tab</span>
            </DropdownMenuItem>
          </DropdownMenuSubContent>
        </DropdownMenuSub>
        <DropdownMenuSeparator />
        <DropdownMenuItem>
          <Download className="mr-2 h-4 w-4" />
          <span>Download</span>
          <DropdownMenuShortcut>⌘D</DropdownMenuShortcut>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  ),
}

export const UserProfileMenu: Story = {
  args: {},
  render: () => (
    <div className="flex items-center gap-4">
      <p className="text-muted-foreground text-sm">
        User profile menu example:
      </p>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" className="relative h-8 w-8 rounded-full">
            <Avatar className="h-8 w-8">
              <AvatarImage src="/api/placeholder/32/32" alt="@johndoe" />
              <AvatarFallback>JD</AvatarFallback>
            </Avatar>
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent className="w-56" align="end" forceMount>
          <DropdownMenuLabel className="font-normal">
            <div className="flex flex-col space-y-1">
              <p className="text-sm leading-none font-medium">John Doe</p>
              <p className="text-muted-foreground text-xs leading-none">
                john@example.com
              </p>
            </div>
          </DropdownMenuLabel>
          <DropdownMenuSeparator />
          <DropdownMenuGroup>
            <DropdownMenuItem>
              <User className="mr-2 h-4 w-4" />
              <span>Profile</span>
              <DropdownMenuShortcut>⇧⌘P</DropdownMenuShortcut>
            </DropdownMenuItem>
            <DropdownMenuItem>
              <CreditCard className="mr-2 h-4 w-4" />
              <span>Billing</span>
              <DropdownMenuShortcut>⌘B</DropdownMenuShortcut>
            </DropdownMenuItem>
            <DropdownMenuItem>
              <Settings className="mr-2 h-4 w-4" />
              <span>Settings</span>
              <DropdownMenuShortcut>⌘S</DropdownMenuShortcut>
            </DropdownMenuItem>
          </DropdownMenuGroup>
          <DropdownMenuSeparator />
          <DropdownMenuItem>
            <Bell className="mr-2 h-4 w-4" />
            <span>Notifications</span>
            <Badge className="ml-auto" variant="secondary">
              3
            </Badge>
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem>
            <LogOut className="mr-2 h-4 w-4" />
            <span>Log out</span>
            <DropdownMenuShortcut>⇧⌘Q</DropdownMenuShortcut>
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  ),
}

export const ActionsMenu: Story = {
  args: {},
  render: () => {
    const [selectedItems] = useState(3)

    return (
      <div className="w-full max-w-md">
        <Card>
          <CardHeader>
            <CardTitle>Actions Menu</CardTitle>
            <CardDescription>
              {selectedItems} items selected. Use the menu for bulk actions.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Badge variant="secondary">{selectedItems} selected</Badge>
              </div>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="outline" size="sm">
                    Actions
                    <ChevronDown className="ml-2 h-4 w-4" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent className="w-48" align="end">
                  <DropdownMenuLabel>Bulk Actions</DropdownMenuLabel>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem>
                    <Copy className="mr-2 h-4 w-4" />
                    Copy Items
                    <DropdownMenuShortcut>⌘C</DropdownMenuShortcut>
                  </DropdownMenuItem>
                  <DropdownMenuItem>
                    <Scissors className="mr-2 h-4 w-4" />
                    Cut Items
                    <DropdownMenuShortcut>⌘X</DropdownMenuShortcut>
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem>
                    <Star className="mr-2 h-4 w-4" />
                    Add to Favorites
                  </DropdownMenuItem>
                  <DropdownMenuItem>
                    <Tag className="mr-2 h-4 w-4" />
                    Add Tags
                  </DropdownMenuItem>
                  <DropdownMenuItem>
                    <Folder className="mr-2 h-4 w-4" />
                    Move to Folder
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem>
                    <Download className="mr-2 h-4 w-4" />
                    Download All
                  </DropdownMenuItem>
                  <DropdownMenuItem>
                    <Share className="mr-2 h-4 w-4" />
                    Share
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem>
                    <Archive className="mr-2 h-4 w-4" />
                    Archive
                  </DropdownMenuItem>
                  <DropdownMenuItem variant="destructive">
                    <Trash2 className="mr-2 h-4 w-4" />
                    Delete All
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </CardContent>
        </Card>
      </div>
    )
  },
}

export const FiltersMenu: Story = {
  args: {},
  render: () => {
    const [sortBy, setSortBy] = useState('date')
    const [view, setView] = useState('grid')
    const [showHidden, setShowHidden] = useState(false)
    const [showArchived, setShowArchived] = useState(false)

    return (
      <div className="w-full max-w-md">
        <Card>
          <CardHeader>
            <CardTitle>File Explorer</CardTitle>
            <CardDescription>Use filters to organize your view</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Badge variant="outline">Sorted by {sortBy}</Badge>
                <Badge variant="outline">{view} view</Badge>
              </div>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="outline" size="sm">
                    <Filter className="mr-2 h-4 w-4" />
                    Filters
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent className="w-56" align="end">
                  <DropdownMenuLabel>Sort & Filter</DropdownMenuLabel>
                  <DropdownMenuSeparator />
                  <DropdownMenuLabel>Sort By</DropdownMenuLabel>
                  <DropdownMenuRadioGroup
                    value={sortBy}
                    onValueChange={setSortBy}
                  >
                    <DropdownMenuRadioItem value="name">
                      <Type className="mr-2 h-4 w-4" />
                      Name
                    </DropdownMenuRadioItem>
                    <DropdownMenuRadioItem value="date">
                      <Calendar className="mr-2 h-4 w-4" />
                      Date Modified
                    </DropdownMenuRadioItem>
                    <DropdownMenuRadioItem value="size">
                      <SortAsc className="mr-2 h-4 w-4" />
                      Size
                    </DropdownMenuRadioItem>
                    <DropdownMenuRadioItem value="type">
                      <File className="mr-2 h-4 w-4" />
                      Type
                    </DropdownMenuRadioItem>
                  </DropdownMenuRadioGroup>
                  <DropdownMenuSeparator />
                  <DropdownMenuLabel>View</DropdownMenuLabel>
                  <DropdownMenuRadioGroup value={view} onValueChange={setView}>
                    <DropdownMenuRadioItem value="grid">
                      <Grid className="mr-2 h-4 w-4" />
                      Grid View
                    </DropdownMenuRadioItem>
                    <DropdownMenuRadioItem value="list">
                      <List className="mr-2 h-4 w-4" />
                      List View
                    </DropdownMenuRadioItem>
                  </DropdownMenuRadioGroup>
                  <DropdownMenuSeparator />
                  <DropdownMenuLabel>Show</DropdownMenuLabel>
                  <DropdownMenuCheckboxItem
                    checked={showHidden}
                    onCheckedChange={setShowHidden}
                  >
                    <EyeOff className="mr-2 h-4 w-4" />
                    Hidden Files
                  </DropdownMenuCheckboxItem>
                  <DropdownMenuCheckboxItem
                    checked={showArchived}
                    onCheckedChange={setShowArchived}
                  >
                    <Archive className="mr-2 h-4 w-4" />
                    Archived Items
                  </DropdownMenuCheckboxItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>

            <div className="mt-4 space-y-2">
              <div className="flex items-center justify-between rounded border p-2">
                <div className="flex items-center gap-2">
                  <File className="h-4 w-4 text-blue-500" />
                  <span className="text-sm">document.pdf</span>
                </div>
                <span className="text-muted-foreground text-xs">2.3 MB</span>
              </div>
              <div className="flex items-center justify-between rounded border p-2">
                <div className="flex items-center gap-2">
                  <Image className="h-4 w-4 text-green-500" />
                  <span className="text-sm">image.jpg</span>
                </div>
                <span className="text-muted-foreground text-xs">890 KB</span>
              </div>
              <div className="flex items-center justify-between rounded border p-2">
                <div className="flex items-center gap-2">
                  <Code className="h-4 w-4 text-purple-500" />
                  <span className="text-sm">script.js</span>
                </div>
                <span className="text-muted-foreground text-xs">12 KB</span>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    )
  },
}

export const ThemeSelector: Story = {
  args: {},
  render: () => {
    const [theme, setTheme] = useState('system')
    const [fontSize, setFontSize] = useState('medium')
    const [colorScheme, setColorScheme] = useState('default')

    return (
      <div className="flex items-center gap-4">
        <p className="text-muted-foreground text-sm">Customize appearance:</p>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" size="sm">
              <Palette className="mr-2 h-4 w-4" />
              Theme
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent className="w-56">
            <DropdownMenuLabel>Appearance</DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuLabel>Theme</DropdownMenuLabel>
            <DropdownMenuRadioGroup value={theme} onValueChange={setTheme}>
              <DropdownMenuRadioItem value="light">
                <Sun className="mr-2 h-4 w-4" />
                Light
              </DropdownMenuRadioItem>
              <DropdownMenuRadioItem value="dark">
                <Moon className="mr-2 h-4 w-4" />
                Dark
              </DropdownMenuRadioItem>
              <DropdownMenuRadioItem value="system">
                <Monitor className="mr-2 h-4 w-4" />
                System
              </DropdownMenuRadioItem>
            </DropdownMenuRadioGroup>
            <DropdownMenuSeparator />
            <DropdownMenuLabel>Font Size</DropdownMenuLabel>
            <DropdownMenuRadioGroup
              value={fontSize}
              onValueChange={setFontSize}
            >
              <DropdownMenuRadioItem value="small">Small</DropdownMenuRadioItem>
              <DropdownMenuRadioItem value="medium">
                Medium
              </DropdownMenuRadioItem>
              <DropdownMenuRadioItem value="large">Large</DropdownMenuRadioItem>
            </DropdownMenuRadioGroup>
            <DropdownMenuSeparator />
            <DropdownMenuLabel>Color Scheme</DropdownMenuLabel>
            <DropdownMenuRadioGroup
              value={colorScheme}
              onValueChange={setColorScheme}
            >
              <DropdownMenuRadioItem value="default">
                <Palette className="mr-2 h-4 w-4" />
                Default
              </DropdownMenuRadioItem>
              <DropdownMenuRadioItem value="blue">
                <div className="mr-2 h-4 w-4 rounded-full bg-blue-500" />
                Blue
              </DropdownMenuRadioItem>
              <DropdownMenuRadioItem value="green">
                <div className="mr-2 h-4 w-4 rounded-full bg-green-500" />
                Green
              </DropdownMenuRadioItem>
              <DropdownMenuRadioItem value="purple">
                <div className="mr-2 h-4 w-4 rounded-full bg-purple-500" />
                Purple
              </DropdownMenuRadioItem>
            </DropdownMenuRadioGroup>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    )
  },
}

export const MediaControls: Story = {
  args: {},
  render: () => {
    const [isPlaying, setIsPlaying] = useState(false)
    const [volume, setVolume] = useState('medium')
    const [repeat, setRepeat] = useState(false)
    const [shuffle, setShuffle] = useState(false)

    return (
      <div className="w-full max-w-md">
        <Card>
          <CardHeader>
            <CardTitle>Now Playing</CardTitle>
            <CardDescription>Midnight Dreams - Luna Echo</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setIsPlaying(!isPlaying)}
                >
                  {isPlaying ? (
                    <Pause className="h-4 w-4" />
                  ) : (
                    <Play className="h-4 w-4" />
                  )}
                </Button>
                <span className="text-muted-foreground text-sm">
                  {isPlaying ? 'Playing' : 'Paused'}
                </span>
              </div>

              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" size="sm">
                    <MoreHorizontal className="h-4 w-4" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent className="w-48" align="end">
                  <DropdownMenuLabel>Playback Options</DropdownMenuLabel>
                  <DropdownMenuSeparator />
                  <DropdownMenuCheckboxItem
                    checked={repeat}
                    onCheckedChange={setRepeat}
                  >
                    <Repeat className="mr-2 h-4 w-4" />
                    Repeat
                  </DropdownMenuCheckboxItem>
                  <DropdownMenuCheckboxItem
                    checked={shuffle}
                    onCheckedChange={setShuffle}
                  >
                    <Shuffle className="mr-2 h-4 w-4" />
                    Shuffle
                  </DropdownMenuCheckboxItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuLabel>Volume</DropdownMenuLabel>
                  <DropdownMenuRadioGroup
                    value={volume}
                    onValueChange={setVolume}
                  >
                    <DropdownMenuRadioItem value="mute">
                      <VolumeX className="mr-2 h-4 w-4" />
                      Mute
                    </DropdownMenuRadioItem>
                    <DropdownMenuRadioItem value="low">
                      <Volume2 className="mr-2 h-4 w-4" />
                      Low
                    </DropdownMenuRadioItem>
                    <DropdownMenuRadioItem value="medium">
                      <Volume2 className="mr-2 h-4 w-4" />
                      Medium
                    </DropdownMenuRadioItem>
                    <DropdownMenuRadioItem value="high">
                      <Volume2 className="mr-2 h-4 w-4" />
                      High
                    </DropdownMenuRadioItem>
                  </DropdownMenuRadioGroup>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem>
                    <Heart className="mr-2 h-4 w-4" />
                    Add to Favorites
                  </DropdownMenuItem>
                  <DropdownMenuItem>
                    <Share className="mr-2 h-4 w-4" />
                    Share Track
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem>
                    <Download className="mr-2 h-4 w-4" />
                    Download
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </CardContent>
        </Card>
      </div>
    )
  },
}

export const SystemControls: Story = {
  args: {},
  render: () => {
    const [wifiEnabled, setWifiEnabled] = useState(true)
    const [bluetoothEnabled, setBluetoothEnabled] = useState(true)
    const [notifications, setNotifications] = useState(true)

    return (
      <div className="flex items-center gap-4">
        <p className="text-muted-foreground text-sm">System controls:</p>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" size="sm">
              <Settings className="mr-2 h-4 w-4" />
              System
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent className="w-56">
            <DropdownMenuLabel>System Settings</DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuCheckboxItem
              checked={wifiEnabled}
              onCheckedChange={setWifiEnabled}
            >
              {wifiEnabled ? (
                <Wifi className="mr-2 h-4 w-4" />
              ) : (
                <WifiOff className="mr-2 h-4 w-4" />
              )}
              Wi-Fi
            </DropdownMenuCheckboxItem>
            <DropdownMenuCheckboxItem
              checked={bluetoothEnabled}
              onCheckedChange={setBluetoothEnabled}
            >
              {bluetoothEnabled ? (
                <BluetoothConnected className="mr-2 h-4 w-4" />
              ) : (
                <BluetoothOff className="mr-2 h-4 w-4" />
              )}
              Bluetooth
            </DropdownMenuCheckboxItem>
            <DropdownMenuCheckboxItem
              checked={notifications}
              onCheckedChange={setNotifications}
            >
              <Bell className="mr-2 h-4 w-4" />
              Notifications
            </DropdownMenuCheckboxItem>
            <DropdownMenuSeparator />
            <DropdownMenuSub>
              <DropdownMenuSubTrigger>
                <Battery className="mr-2 h-4 w-4" />
                Power & Battery
              </DropdownMenuSubTrigger>
              <DropdownMenuSubContent className="w-48">
                <DropdownMenuItem>
                  <Zap className="mr-2 h-4 w-4" />
                  Power Saver Mode
                </DropdownMenuItem>
                <DropdownMenuItem>
                  <Battery className="mr-2 h-4 w-4" />
                  Battery Usage
                </DropdownMenuItem>
                <DropdownMenuItem>
                  <BatteryLow className="mr-2 h-4 w-4" />
                  Low Power Alerts
                </DropdownMenuItem>
              </DropdownMenuSubContent>
            </DropdownMenuSub>
            <DropdownMenuSub>
              <DropdownMenuSubTrigger>
                <Monitor className="mr-2 h-4 w-4" />
                Display
              </DropdownMenuSubTrigger>
              <DropdownMenuSubContent className="w-48">
                <DropdownMenuItem>
                  <Sun className="mr-2 h-4 w-4" />
                  Brightness
                </DropdownMenuItem>
                <DropdownMenuItem>
                  <Maximize className="mr-2 h-4 w-4" />
                  Resolution
                </DropdownMenuItem>
                <DropdownMenuItem>
                  <Eye className="mr-2 h-4 w-4" />
                  Color Profile
                </DropdownMenuItem>
              </DropdownMenuSubContent>
            </DropdownMenuSub>
            <DropdownMenuSeparator />
            <DropdownMenuItem>
              <Settings className="mr-2 h-4 w-4" />
              All Settings
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    )
  },
}

export const CoreLiveThemeShowcase: Story = {
  args: {},
  render: () => (
    <div className="w-full max-w-4xl space-y-8">
      <div>
        <h3 className="text-heading-3 mb-4 font-medium">
          Dropdown Menu Variants
        </h3>
        <div className="grid grid-cols-1 gap-6 md:grid-cols-3">
          <div>
            <p className="text-muted-foreground mb-4 text-sm">Default Menu</p>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" className="w-full">
                  Open Menu
                  <ChevronDown className="ml-2 h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent className="w-48">
                <DropdownMenuItem>
                  <User className="mr-2 h-4 w-4" />
                  Profile
                </DropdownMenuItem>
                <DropdownMenuItem>
                  <Settings className="mr-2 h-4 w-4" />
                  Settings
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem>
                  <LogOut className="mr-2 h-4 w-4" />
                  Logout
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>

          <div>
            <p className="text-muted-foreground mb-4 text-sm">With Shortcuts</p>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" className="w-full">
                  Actions
                  <ChevronDown className="ml-2 h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent className="w-48">
                <DropdownMenuItem>
                  <Copy className="mr-2 h-4 w-4" />
                  Copy
                  <DropdownMenuShortcut>⌘C</DropdownMenuShortcut>
                </DropdownMenuItem>
                <DropdownMenuItem>
                  <Scissors className="mr-2 h-4 w-4" />
                  Cut
                  <DropdownMenuShortcut>⌘X</DropdownMenuShortcut>
                </DropdownMenuItem>
                <DropdownMenuItem>
                  <Clipboard className="mr-2 h-4 w-4" />
                  Paste
                  <DropdownMenuShortcut>⌘V</DropdownMenuShortcut>
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>

          <div>
            <p className="text-muted-foreground mb-4 text-sm">With Avatar</p>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="ghost"
                  className="relative h-8 w-8 rounded-full"
                >
                  <Avatar className="h-8 w-8">
                    <AvatarFallback>JD</AvatarFallback>
                  </Avatar>
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent className="w-48" align="end">
                <DropdownMenuLabel>John Doe</DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuItem>
                  <User className="mr-2 h-4 w-4" />
                  Profile
                </DropdownMenuItem>
                <DropdownMenuItem>
                  <LogOut className="mr-2 h-4 w-4" />
                  Logout
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
      </div>

      <div>
        <h3 className="text-heading-3 mb-4 font-medium">
          Interactive Elements
        </h3>
        <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
          <div>
            <p className="text-muted-foreground mb-4 text-sm">Checkbox Items</p>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" className="w-full">
                  View Options
                  <ChevronDown className="ml-2 h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent className="w-48">
                <DropdownMenuCheckboxItem defaultChecked>
                  <Eye className="mr-2 h-4 w-4" />
                  Show Toolbar
                </DropdownMenuCheckboxItem>
                <DropdownMenuCheckboxItem>
                  <Grid className="mr-2 h-4 w-4" />
                  Show Grid
                </DropdownMenuCheckboxItem>
                <DropdownMenuCheckboxItem defaultChecked>
                  <Users className="mr-2 h-4 w-4" />
                  Show Users
                </DropdownMenuCheckboxItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>

          <div>
            <p className="text-muted-foreground mb-4 text-sm">Radio Items</p>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" className="w-full">
                  Sort By
                  <ChevronDown className="ml-2 h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent className="w-48">
                <DropdownMenuRadioGroup defaultValue="date">
                  <DropdownMenuRadioItem value="name">
                    <Type className="mr-2 h-4 w-4" />
                    Name
                  </DropdownMenuRadioItem>
                  <DropdownMenuRadioItem value="date">
                    <Calendar className="mr-2 h-4 w-4" />
                    Date
                  </DropdownMenuRadioItem>
                  <DropdownMenuRadioItem value="size">
                    <SortAsc className="mr-2 h-4 w-4" />
                    Size
                  </DropdownMenuRadioItem>
                </DropdownMenuRadioGroup>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
      </div>

      <div>
        <h3 className="text-heading-3 mb-4 font-medium">Semantic Colors</h3>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
          <div className="border-success/20 rounded-lg border p-4">
            <p className="text-success mb-3 text-sm font-medium">
              Success Actions
            </p>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="outline"
                  className="border-success/20 text-success w-full"
                >
                  Complete
                  <ChevronDown className="ml-2 h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent className="w-48">
                <DropdownMenuItem>
                  <Check className="text-success mr-2 h-4 w-4" />
                  Mark Complete
                </DropdownMenuItem>
                <DropdownMenuItem>
                  <Star className="text-success mr-2 h-4 w-4" />
                  Add to Favorites
                </DropdownMenuItem>
                <DropdownMenuItem>
                  <Archive className="text-success mr-2 h-4 w-4" />
                  Archive
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>

          <div className="border-warning/20 rounded-lg border p-4">
            <p className="text-warning mb-3 text-sm font-medium">
              Warning Actions
            </p>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="outline"
                  className="border-warning/20 text-warning w-full"
                >
                  Caution
                  <ChevronDown className="ml-2 h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent className="w-48">
                <DropdownMenuItem>
                  <AlertCircle className="text-warning mr-2 h-4 w-4" />
                  Review Changes
                </DropdownMenuItem>
                <DropdownMenuItem>
                  <Lock className="text-warning mr-2 h-4 w-4" />
                  Restrict Access
                </DropdownMenuItem>
                <DropdownMenuItem>
                  <EyeOff className="text-warning mr-2 h-4 w-4" />
                  Hide Item
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>

          <div className="border-danger/20 rounded-lg border p-4">
            <p className="text-danger mb-3 text-sm font-medium">
              Destructive Actions
            </p>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="outline"
                  className="border-danger/20 text-danger w-full"
                >
                  Delete
                  <ChevronDown className="ml-2 h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent className="w-48">
                <DropdownMenuItem variant="destructive">
                  <Trash2 className="mr-2 h-4 w-4" />
                  Delete Item
                </DropdownMenuItem>
                <DropdownMenuItem variant="destructive">
                  <X className="mr-2 h-4 w-4" />
                  Remove Access
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem>
                  <Info className="mr-2 h-4 w-4" />
                  Learn More
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
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
              <div>
                <p className="mb-4 text-sm font-medium">
                  Custom dropdown menu using component tokens
                </p>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button
                      variant="outline"
                      style={{
                        borderColor:
                          'var(--component-dropdown-menu-trigger-border)',
                        backgroundColor:
                          'var(--component-dropdown-menu-trigger-background)',
                      }}
                    >
                      Custom Styled Menu
                      <ChevronDown className="ml-2 h-4 w-4" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent
                    className="w-56"
                    style={{
                      backgroundColor:
                        'var(--component-dropdown-menu-background)',
                      borderColor: 'var(--component-dropdown-menu-border)',
                      color: 'var(--component-dropdown-menu-text)',
                    }}
                  >
                    <DropdownMenuLabel
                      style={{
                        color: 'var(--component-dropdown-menu-label-text)',
                      }}
                    >
                      Custom Styling
                    </DropdownMenuLabel>
                    <DropdownMenuSeparator
                      style={{
                        backgroundColor:
                          'var(--component-dropdown-menu-separator)',
                      }}
                    />
                    <DropdownMenuItem
                      style={
                        {
                          '--dropdown-item-hover-bg':
                            'var(--component-dropdown-menu-item-hover-background)',
                          '--dropdown-item-hover-text':
                            'var(--component-dropdown-menu-item-hover-text)',
                        } as React.CSSProperties
                      }
                    >
                      <Settings className="mr-2 h-4 w-4" />
                      Custom Item
                    </DropdownMenuItem>
                    <DropdownMenuItem>
                      <Info className="mr-2 h-4 w-4" />
                      Another Item
                      <DropdownMenuShortcut
                        style={{
                          color: 'var(--component-dropdown-menu-shortcut-text)',
                        }}
                      >
                        ⌘I
                      </DropdownMenuShortcut>
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>

              <div className="bg-muted rounded-md p-3">
                <code className="text-xs">
                  --component-dropdown-menu-background
                  <br />
                  --component-dropdown-menu-border
                  <br />
                  --component-dropdown-menu-text
                  <br />
                  --component-dropdown-menu-item-hover-background
                  <br />
                  --component-dropdown-menu-item-hover-text
                  <br />
                  --component-dropdown-menu-separator
                  <br />
                  --component-dropdown-menu-label-text
                  <br />
                  --component-dropdown-menu-shortcut-text
                  <br />
                  --component-dropdown-menu-trigger-background
                  <br />
                  --component-dropdown-menu-trigger-border
                </code>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      <div>
        <h3 className="text-heading-3 mb-4 font-medium">Advanced Features</h3>
        <div className="space-y-4">
          <div>
            <p className="text-muted-foreground mb-4 text-sm">
              Nested Submenus
            </p>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline">
                  Advanced Menu
                  <ChevronDown className="ml-2 h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent className="w-56">
                <DropdownMenuItem>
                  <Plus className="mr-2 h-4 w-4" />
                  New Document
                </DropdownMenuItem>
                <DropdownMenuSub>
                  <DropdownMenuSubTrigger>
                    <Folder className="mr-2 h-4 w-4" />
                    Open Recent
                  </DropdownMenuSubTrigger>
                  <DropdownMenuSubContent className="w-48">
                    <DropdownMenuItem>Document 1.pdf</DropdownMenuItem>
                    <DropdownMenuItem>Project Files</DropdownMenuItem>
                    <DropdownMenuSub>
                      <DropdownMenuSubTrigger>
                        More Items
                      </DropdownMenuSubTrigger>
                      <DropdownMenuSubContent className="w-48">
                        <DropdownMenuItem>Archive Folder</DropdownMenuItem>
                        <DropdownMenuItem>Backup Files</DropdownMenuItem>
                        <DropdownMenuItem>Templates</DropdownMenuItem>
                      </DropdownMenuSubContent>
                    </DropdownMenuSub>
                  </DropdownMenuSubContent>
                </DropdownMenuSub>
                <DropdownMenuSeparator />
                <DropdownMenuItem>
                  <Settings className="mr-2 h-4 w-4" />
                  Settings
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
      </div>
    </div>
  ),
  parameters: {
    layout: 'padded',
    docs: {
      description: {
        story:
          'Comprehensive showcase of dropdown menu variations using CoreLive Design System tokens for consistent click-triggered menus across different contexts.',
      },
    },
  },
}
