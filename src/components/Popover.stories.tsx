import type { Meta, StoryObj } from '@storybook/react'
import { format } from 'date-fns'
import {
  Info,
  HelpCircle,
  Settings,
  MoreHorizontal,
  MoreVertical,
  ChevronDown,
  Calendar as CalendarIcon,
  User,
  Mail,
  Phone,
  MapPin,
  Link,
  Twitter,
  Linkedin,
  Globe,
  Bell,
  Volume2,
  Type,
  Bold,
  Italic,
  Underline,
  List,
  ListOrdered,
  AlignLeft,
  AlignCenter,
  AlignRight,
  Heart,
  MessageSquare,
  Share,
  Flag,
  Download,
  Copy,
  Check,
  Plus,
  Edit,
  Trash2,
  Eye,
  Package,
  Send,
  Image,
  Video,
  Music,
  Mic,
  Camera,
  Paperclip,
  AlertCircle,
} from 'lucide-react'
import { useState } from 'react'

import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Calendar } from '@/components/ui/calendar'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Separator } from '@/components/ui/separator'
import { Slider } from '@/components/ui/slider'
import { Switch } from '@/components/ui/switch'
import { Textarea } from '@/components/ui/textarea'

const meta: Meta<typeof Popover> = {
  title: 'CoreLive Design System/Components/Popover',
  component: Popover,
  parameters: {
    layout: 'centered',
    docs: {
      description: {
        component:
          'A popover component for displaying floating content. Built with Radix UI and styled with CoreLive Design System tokens.',
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
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="outline">Open popover</Button>
      </PopoverTrigger>
      <PopoverContent className="w-80">
        <div className="grid gap-4">
          <div className="space-y-2">
            <h4 className="leading-none font-medium">Dimensions</h4>
            <p className="text-muted-foreground text-sm">
              Set the dimensions for the layer.
            </p>
          </div>
          <div className="grid gap-2">
            <div className="grid grid-cols-3 items-center gap-4">
              <Label htmlFor="width">Width</Label>
              <Input
                id="width"
                defaultValue="100%"
                className="col-span-2 h-8"
              />
            </div>
            <div className="grid grid-cols-3 items-center gap-4">
              <Label htmlFor="maxWidth">Max. width</Label>
              <Input
                id="maxWidth"
                defaultValue="300px"
                className="col-span-2 h-8"
              />
            </div>
            <div className="grid grid-cols-3 items-center gap-4">
              <Label htmlFor="height">Height</Label>
              <Input
                id="height"
                defaultValue="25px"
                className="col-span-2 h-8"
              />
            </div>
            <div className="grid grid-cols-3 items-center gap-4">
              <Label htmlFor="maxHeight">Max. height</Label>
              <Input
                id="maxHeight"
                defaultValue="none"
                className="col-span-2 h-8"
              />
            </div>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  ),
}

export const UserProfile: Story = {
  args: {},
  render: () => (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="icon">
          <Avatar>
            <AvatarImage src="/placeholder.svg" />
            <AvatarFallback>JD</AvatarFallback>
          </Avatar>
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-80">
        <div className="flex gap-4">
          <Avatar className="h-12 w-12">
            <AvatarImage src="/placeholder.svg" />
            <AvatarFallback>JD</AvatarFallback>
          </Avatar>
          <div className="space-y-1">
            <h4 className="text-sm font-semibold">John Doe</h4>
            <p className="text-muted-foreground text-sm">
              john.doe@example.com
            </p>
            <div className="flex items-center pt-2">
              <Badge variant="secondary">Pro Member</Badge>
            </div>
          </div>
        </div>
        <Separator className="my-4" />
        <div className="space-y-3">
          <div className="flex items-center gap-2 text-sm">
            <MapPin className="text-muted-foreground h-4 w-4" />
            <span>San Francisco, CA</span>
          </div>
          <div className="flex items-center gap-2 text-sm">
            <Link className="text-muted-foreground h-4 w-4" />
            <a href="#" className="text-primary hover:underline">
              johndoe.com
            </a>
          </div>
          <div className="flex items-center gap-2 text-sm">
            <Twitter className="text-muted-foreground h-4 w-4" />
            <span>@johndoe</span>
          </div>
        </div>
        <Separator className="my-4" />
        <div className="flex gap-2">
          <Button className="flex-1" size="sm">
            <Mail className="mr-2 h-4 w-4" />
            Message
          </Button>
          <Button variant="outline" className="flex-1" size="sm">
            <User className="mr-2 h-4 w-4" />
            Follow
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  ),
}

export const DatePicker: Story = {
  args: {},
  render: () => {
    const [date, setDate] = useState<Date>()

    return (
      <Popover>
        <PopoverTrigger asChild>
          <Button
            variant="outline"
            className="w-[280px] justify-start text-left font-normal"
          >
            <CalendarIcon className="mr-2 h-4 w-4" />
            {date ? format(date, 'PPP') : <span>Pick a date</span>}
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-auto p-0">
          <Calendar
            mode="single"
            selected={date}
            onSelect={setDate}
            initialFocus
          />
        </PopoverContent>
      </Popover>
    )
  },
}

export const NotificationSettings: Story = {
  args: {},
  render: () => {
    const [notifications, setNotifications] = useState({
      email: true,
      push: false,
      sms: false,
      updates: true,
    })

    return (
      <Popover>
        <PopoverTrigger asChild>
          <Button variant="outline" size="icon">
            <Bell className="h-4 w-4" />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-80">
          <div className="grid gap-4">
            <div className="space-y-2">
              <h4 className="leading-none font-medium">Notifications</h4>
              <p className="text-muted-foreground text-sm">
                Configure how you receive notifications.
              </p>
            </div>
            <div className="grid gap-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Mail className="h-4 w-4" />
                  <Label htmlFor="email">Email</Label>
                </div>
                <Switch
                  id="email"
                  checked={notifications.email}
                  onCheckedChange={(checked) =>
                    setNotifications({ ...notifications, email: checked })
                  }
                />
              </div>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Bell className="h-4 w-4" />
                  <Label htmlFor="push">Push Notifications</Label>
                </div>
                <Switch
                  id="push"
                  checked={notifications.push}
                  onCheckedChange={(checked) =>
                    setNotifications({ ...notifications, push: checked })
                  }
                />
              </div>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Phone className="h-4 w-4" />
                  <Label htmlFor="sms">SMS</Label>
                </div>
                <Switch
                  id="sms"
                  checked={notifications.sms}
                  onCheckedChange={(checked) =>
                    setNotifications({ ...notifications, sms: checked })
                  }
                />
              </div>
              <Separator />
              <div className="flex items-center justify-between">
                <Label htmlFor="updates">Product Updates</Label>
                <Switch
                  id="updates"
                  checked={notifications.updates}
                  onCheckedChange={(checked) =>
                    setNotifications({ ...notifications, updates: checked })
                  }
                />
              </div>
            </div>
          </div>
        </PopoverContent>
      </Popover>
    )
  },
}

export const ShareMenu: Story = {
  args: {},
  render: () => {
    const [copied, setCopied] = useState(false)

    const handleCopyLink = () => {
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    }

    return (
      <Popover>
        <PopoverTrigger asChild>
          <Button variant="outline" size="sm">
            <Share className="mr-2 h-4 w-4" />
            Share
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-64 p-2">
          <div className="grid gap-1">
            <Button
              variant="ghost"
              className="w-full justify-start"
              onClick={handleCopyLink}
            >
              {copied ? (
                <>
                  <Check className="mr-2 h-4 w-4" />
                  Copied!
                </>
              ) : (
                <>
                  <Link className="mr-2 h-4 w-4" />
                  Copy Link
                </>
              )}
            </Button>
            <Button variant="ghost" className="w-full justify-start">
              <Mail className="mr-2 h-4 w-4" />
              Email
            </Button>
            <Button variant="ghost" className="w-full justify-start">
              <Twitter className="mr-2 h-4 w-4" />
              Twitter
            </Button>
            <Button variant="ghost" className="w-full justify-start">
              <Linkedin className="mr-2 h-4 w-4" />
              LinkedIn
            </Button>
            <Button variant="ghost" className="w-full justify-start">
              <MessageSquare className="mr-2 h-4 w-4" />
              Message
            </Button>
          </div>
        </PopoverContent>
      </Popover>
    )
  },
}

export const TextFormatting: Story = {
  args: {},
  render: () => {
    const [formatting, setFormatting] = useState({
      bold: false,
      italic: false,
      underline: false,
    })

    return (
      <Popover>
        <PopoverTrigger asChild>
          <Button variant="outline" size="sm">
            <Type className="mr-2 h-4 w-4" />
            Format
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-80">
          <div className="grid gap-4">
            <div className="space-y-2">
              <h4 className="leading-none font-medium">Text Formatting</h4>
              <p className="text-muted-foreground text-sm">
                Apply formatting to selected text.
              </p>
            </div>
            <div className="flex gap-2">
              <Button
                variant={formatting.bold ? 'default' : 'outline'}
                size="icon"
                onClick={() =>
                  setFormatting({ ...formatting, bold: !formatting.bold })
                }
              >
                <Bold className="h-4 w-4" />
              </Button>
              <Button
                variant={formatting.italic ? 'default' : 'outline'}
                size="icon"
                onClick={() =>
                  setFormatting({ ...formatting, italic: !formatting.italic })
                }
              >
                <Italic className="h-4 w-4" />
              </Button>
              <Button
                variant={formatting.underline ? 'default' : 'outline'}
                size="icon"
                onClick={() =>
                  setFormatting({
                    ...formatting,
                    underline: !formatting.underline,
                  })
                }
              >
                <Underline className="h-4 w-4" />
              </Button>
              <Separator orientation="vertical" className="h-10" />
              <Button variant="outline" size="icon">
                <List className="h-4 w-4" />
              </Button>
              <Button variant="outline" size="icon">
                <ListOrdered className="h-4 w-4" />
              </Button>
            </div>
            <Separator />
            <div className="space-y-2">
              <Label>Alignment</Label>
              <div className="flex gap-2">
                <Button variant="outline" size="icon">
                  <AlignLeft className="h-4 w-4" />
                </Button>
                <Button variant="default" size="icon">
                  <AlignCenter className="h-4 w-4" />
                </Button>
                <Button variant="outline" size="icon">
                  <AlignRight className="h-4 w-4" />
                </Button>
              </div>
            </div>
          </div>
        </PopoverContent>
      </Popover>
    )
  },
}

export const VolumeControl: Story = {
  args: {},
  render: () => {
    const [volume, setVolume] = useState([50])
    const [muted, setMuted] = useState(false)

    return (
      <Popover>
        <PopoverTrigger asChild>
          <Button variant="ghost" size="icon">
            <Volume2 className="h-4 w-4" />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-60">
          <div className="grid gap-4">
            <div className="space-y-2">
              <h4 className="leading-none font-medium">Volume</h4>
              <p className="text-muted-foreground text-sm">
                Adjust the volume level.
              </p>
            </div>
            <div className="grid gap-3">
              <div className="flex items-center gap-3">
                <Volume2 className="h-4 w-4" />
                <Slider
                  value={muted ? [0] : volume}
                  onValueChange={setVolume}
                  max={100}
                  step={1}
                  className="flex-1"
                />
                <span className="w-8 text-right text-sm">
                  {muted ? 0 : volume}%
                </span>
              </div>
              <div className="flex items-center justify-between">
                <Label htmlFor="mute">Mute</Label>
                <Switch id="mute" checked={muted} onCheckedChange={setMuted} />
              </div>
            </div>
          </div>
        </PopoverContent>
      </Popover>
    )
  },
}

export const StatusMenu: Story = {
  args: {},
  render: () => {
    const [status, setStatus] = useState('online')

    const statuses = [
      { value: 'online', label: 'Online', color: 'bg-success' },
      { value: 'away', label: 'Away', color: 'bg-warning' },
      { value: 'busy', label: 'Do not disturb', color: 'bg-danger' },
      { value: 'offline', label: 'Appear offline', color: 'bg-muted' },
    ]

    return (
      <Popover>
        <PopoverTrigger asChild>
          <Button variant="outline" className="w-[200px] justify-between">
            <span className="flex items-center gap-2">
              <div
                className={`h-2 w-2 rounded-full ${statuses.find((s) => s.value === status)?.color}`}
              />
              {statuses.find((s) => s.value === status)?.label}
            </span>
            <ChevronDown className="h-4 w-4 opacity-50" />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-[200px] p-2">
          <div className="grid gap-1">
            {statuses.map((statusOption) => (
              <Button
                key={statusOption.value}
                variant={status === statusOption.value ? 'secondary' : 'ghost'}
                className="w-full justify-start"
                onClick={() => setStatus(statusOption.value)}
              >
                <div
                  className={`mr-2 h-2 w-2 rounded-full ${statusOption.color}`}
                />
                {statusOption.label}
              </Button>
            ))}
          </div>
        </PopoverContent>
      </Popover>
    )
  },
}

export const ContactCard: Story = {
  args: {},
  render: () => (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="link">@johndoe</Button>
      </PopoverTrigger>
      <PopoverContent className="w-80">
        <Card className="border-0 shadow-none">
          <CardHeader className="pb-3">
            <div className="flex items-start gap-4">
              <Avatar className="h-12 w-12">
                <AvatarImage src="/placeholder.svg" />
                <AvatarFallback>JD</AvatarFallback>
              </Avatar>
              <div>
                <CardTitle className="text-base">John Doe</CardTitle>
                <CardDescription>Software Engineer</CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="space-y-2 text-sm">
              <div className="flex items-center gap-2">
                <Mail className="text-muted-foreground h-4 w-4" />
                <span>john.doe@example.com</span>
              </div>
              <div className="flex items-center gap-2">
                <Phone className="text-muted-foreground h-4 w-4" />
                <span>+1 (555) 123-4567</span>
              </div>
              <div className="flex items-center gap-2">
                <Globe className="text-muted-foreground h-4 w-4" />
                <a href="#" className="text-primary hover:underline">
                  johndoe.com
                </a>
              </div>
            </div>
            <Separator />
            <div className="flex gap-2">
              <Button size="sm" className="flex-1">
                Connect
              </Button>
              <Button size="sm" variant="outline">
                <MessageSquare className="h-4 w-4" />
              </Button>
              <Button size="sm" variant="outline">
                <Phone className="h-4 w-4" />
              </Button>
            </div>
          </CardContent>
        </Card>
      </PopoverContent>
    </Popover>
  ),
}

export const ColorPicker: Story = {
  args: {},
  render: () => {
    const [color, setColor] = useState('#3b82f6')

    const presetColors = [
      '#ef4444', // red
      '#f97316', // orange
      '#f59e0b', // amber
      '#eab308', // yellow
      '#84cc16', // lime
      '#22c55e', // green
      '#10b981', // emerald
      '#14b8a6', // teal
      '#06b6d4', // cyan
      '#0ea5e9', // sky
      '#3b82f6', // blue
      '#6366f1', // indigo
      '#8b5cf6', // violet
      '#a855f7', // purple
      '#d946ef', // fuchsia
      '#ec4899', // pink
    ]

    return (
      <Popover>
        <PopoverTrigger asChild>
          <Button variant="outline" className="w-[200px] justify-start">
            <div
              className="mr-2 h-4 w-4 rounded border"
              style={{ backgroundColor: color }}
            />
            {color}
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-64">
          <div className="grid gap-4">
            <div className="space-y-2">
              <h4 className="leading-none font-medium">Color</h4>
              <p className="text-muted-foreground text-sm">
                Choose a color for your theme.
              </p>
            </div>
            <div className="grid gap-2">
              <Input
                type="text"
                value={color}
                onChange={(e) => setColor(e.target.value)}
                className="h-8"
              />
              <div className="grid grid-cols-8 gap-1">
                {presetColors.map((presetColor) => (
                  <button
                    key={presetColor}
                    className="h-6 w-6 cursor-pointer rounded border transition-transform hover:scale-110"
                    style={{ backgroundColor: presetColor }}
                    onClick={() => setColor(presetColor)}
                  />
                ))}
              </div>
            </div>
          </div>
        </PopoverContent>
      </Popover>
    )
  },
}

export const MoreOptions: Story = {
  args: {},
  render: () => (
    <div className="flex gap-4">
      <Popover>
        <PopoverTrigger asChild>
          <Button variant="ghost" size="icon">
            <MoreHorizontal className="h-4 w-4" />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-56" align="end">
          <div className="grid gap-1">
            <Button variant="ghost" className="w-full justify-start" size="sm">
              <Edit className="mr-2 h-4 w-4" />
              Edit
            </Button>
            <Button variant="ghost" className="w-full justify-start" size="sm">
              <Copy className="mr-2 h-4 w-4" />
              Duplicate
            </Button>
            <Button variant="ghost" className="w-full justify-start" size="sm">
              <Download className="mr-2 h-4 w-4" />
              Download
            </Button>
            <Separator className="my-1" />
            <Button
              variant="ghost"
              className="text-danger w-full justify-start"
              size="sm"
            >
              <Trash2 className="mr-2 h-4 w-4" />
              Delete
            </Button>
          </div>
        </PopoverContent>
      </Popover>

      <Popover>
        <PopoverTrigger asChild>
          <Button variant="ghost" size="icon">
            <MoreVertical className="h-4 w-4" />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-56" align="end">
          <div className="grid gap-1">
            <Button variant="ghost" className="w-full justify-start" size="sm">
              <Eye className="mr-2 h-4 w-4" />
              View Details
            </Button>
            <Button variant="ghost" className="w-full justify-start" size="sm">
              <Share className="mr-2 h-4 w-4" />
              Share
            </Button>
            <Button variant="ghost" className="w-full justify-start" size="sm">
              <Flag className="mr-2 h-4 w-4" />
              Report
            </Button>
          </div>
        </PopoverContent>
      </Popover>
    </div>
  ),
}

export const FeedbackForm: Story = {
  args: {},
  render: () => {
    const [rating, setRating] = useState(0)

    return (
      <Popover>
        <PopoverTrigger asChild>
          <Button variant="outline">
            <MessageSquare className="mr-2 h-4 w-4" />
            Give Feedback
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-80">
          <div className="grid gap-4">
            <div className="space-y-2">
              <h4 className="leading-none font-medium">Feedback</h4>
              <p className="text-muted-foreground text-sm">
                Help us improve by sharing your thoughts.
              </p>
            </div>
            <div className="grid gap-3">
              <div className="space-y-2">
                <Label>How was your experience?</Label>
                <div className="flex gap-1">
                  {[1, 2, 3, 4, 5].map((star) => (
                    <Button
                      key={star}
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8"
                      onClick={() => setRating(star)}
                    >
                      <Heart
                        className={`h-4 w-4 ${star <= rating ? 'fill-primary text-primary' : ''}`}
                      />
                    </Button>
                  ))}
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="feedback">Comments</Label>
                <Textarea
                  id="feedback"
                  placeholder="Tell us what you think..."
                  className="resize-none"
                  rows={3}
                />
              </div>
              <Button className="w-full" size="sm">
                <Send className="mr-2 h-4 w-4" />
                Send Feedback
              </Button>
            </div>
          </div>
        </PopoverContent>
      </Popover>
    )
  },
}

export const MediaUpload: Story = {
  args: {},
  render: () => (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="outline" size="icon">
          <Plus className="h-4 w-4" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-64 p-2">
        <div className="grid gap-1">
          <Button variant="ghost" className="w-full justify-start" size="sm">
            <Image className="mr-2 h-4 w-4" />
            Upload Image
          </Button>
          <Button variant="ghost" className="w-full justify-start" size="sm">
            <Video className="mr-2 h-4 w-4" />
            Upload Video
          </Button>
          <Button variant="ghost" className="w-full justify-start" size="sm">
            <Music className="mr-2 h-4 w-4" />
            Upload Audio
          </Button>
          <Button variant="ghost" className="w-full justify-start" size="sm">
            <Paperclip className="mr-2 h-4 w-4" />
            Attach File
          </Button>
          <Separator className="my-1" />
          <Button variant="ghost" className="w-full justify-start" size="sm">
            <Camera className="mr-2 h-4 w-4" />
            Take Photo
          </Button>
          <Button variant="ghost" className="w-full justify-start" size="sm">
            <Mic className="mr-2 h-4 w-4" />
            Record Audio
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  ),
}

export const CoreLiveThemeShowcase: Story = {
  args: {},
  render: () => (
    <div className="w-full max-w-2xl space-y-6">
      <div>
        <h3 className="text-heading-3 mb-4 font-medium">Popover Variations</h3>
        <div className="grid grid-cols-2 gap-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-sm">Default Popover</CardTitle>
            </CardHeader>
            <CardContent>
              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="outline">Click me</Button>
                </PopoverTrigger>
                <PopoverContent
                  style={{
                    backgroundColor: 'var(--component-popover-background)',
                    borderColor: 'var(--component-popover-border)',
                  }}
                >
                  <div className="space-y-2">
                    <h4 className="font-medium">Popover Title</h4>
                    <p className="text-muted-foreground text-sm">
                      This is a popover with custom styling.
                    </p>
                  </div>
                </PopoverContent>
              </Popover>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-sm">With Arrow</CardTitle>
            </CardHeader>
            <CardContent>
              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="outline">
                    <Info className="mr-2 h-4 w-4" />
                    Info
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-60">
                  <div className="flex gap-2">
                    <Info className="text-info mt-0.5 h-4 w-4" />
                    <div className="space-y-1">
                      <p className="text-sm font-medium">Information</p>
                      <p className="text-muted-foreground text-xs">
                        This popover provides additional context.
                      </p>
                    </div>
                  </div>
                </PopoverContent>
              </Popover>
            </CardContent>
          </Card>
        </div>
      </div>

      <div>
        <h3 className="text-heading-3 mb-4 font-medium">Alignment Options</h3>
        <div className="flex flex-wrap justify-center gap-4">
          <Popover>
            <PopoverTrigger asChild>
              <Button variant="outline" size="sm">
                Align Start
              </Button>
            </PopoverTrigger>
            <PopoverContent align="start" className="w-40">
              <p className="text-sm">Start aligned</p>
            </PopoverContent>
          </Popover>

          <Popover>
            <PopoverTrigger asChild>
              <Button variant="outline" size="sm">
                Align Center
              </Button>
            </PopoverTrigger>
            <PopoverContent align="center" className="w-40">
              <p className="text-sm">Center aligned</p>
            </PopoverContent>
          </Popover>

          <Popover>
            <PopoverTrigger asChild>
              <Button variant="outline" size="sm">
                Align End
              </Button>
            </PopoverTrigger>
            <PopoverContent align="end" className="w-40">
              <p className="text-sm">End aligned</p>
            </PopoverContent>
          </Popover>
        </div>
      </div>

      <div>
        <h3 className="text-heading-3 mb-4 font-medium">Side Options</h3>
        <div className="flex flex-wrap justify-center gap-4">
          <Popover>
            <PopoverTrigger asChild>
              <Button variant="outline" size="sm">
                Top
              </Button>
            </PopoverTrigger>
            <PopoverContent side="top" className="w-32">
              <p className="text-sm">Above trigger</p>
            </PopoverContent>
          </Popover>

          <Popover>
            <PopoverTrigger asChild>
              <Button variant="outline" size="sm">
                Right
              </Button>
            </PopoverTrigger>
            <PopoverContent side="right" className="w-32">
              <p className="text-sm">Right side</p>
            </PopoverContent>
          </Popover>

          <Popover>
            <PopoverTrigger asChild>
              <Button variant="outline" size="sm">
                Bottom
              </Button>
            </PopoverTrigger>
            <PopoverContent side="bottom" className="w-32">
              <p className="text-sm">Below trigger</p>
            </PopoverContent>
          </Popover>

          <Popover>
            <PopoverTrigger asChild>
              <Button variant="outline" size="sm">
                Left
              </Button>
            </PopoverTrigger>
            <PopoverContent side="left" className="w-32">
              <p className="text-sm">Left side</p>
            </PopoverContent>
          </Popover>
        </div>
      </div>

      <div>
        <h3 className="text-heading-3 mb-4 font-medium">Semantic Usage</h3>
        <div className="grid grid-cols-2 gap-4">
          <Card className="border-info/20">
            <CardHeader>
              <CardTitle className="text-info text-sm">Info Popover</CardTitle>
            </CardHeader>
            <CardContent>
              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="outline" className="border-info text-info">
                    <HelpCircle className="mr-2 h-4 w-4" />
                    Help
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="border-info/20 bg-info/5">
                  <div className="space-y-2">
                    <h4 className="text-info font-medium">Need Help?</h4>
                    <p className="text-sm">
                      Click here for more information about this feature.
                    </p>
                  </div>
                </PopoverContent>
              </Popover>
            </CardContent>
          </Card>

          <Card className="border-warning/20">
            <CardHeader>
              <CardTitle className="text-warning text-sm">
                Warning Popover
              </CardTitle>
            </CardHeader>
            <CardContent>
              <Popover>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    className="border-warning text-warning"
                  >
                    <AlertCircle className="mr-2 h-4 w-4" />
                    Warning
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="border-warning/20 bg-warning/5">
                  <div className="space-y-2">
                    <h4 className="text-warning font-medium">Caution</h4>
                    <p className="text-sm">
                      This action may have unintended consequences.
                    </p>
                  </div>
                </PopoverContent>
              </Popover>
            </CardContent>
          </Card>
        </div>
      </div>

      <div>
        <h3 className="text-heading-3 mb-4 font-medium">
          Component Token Usage
        </h3>
        <Card>
          <CardContent className="pt-6">
            <div className="space-y-4">
              <Popover>
                <PopoverTrigger asChild>
                  <button
                    className="rounded-md px-4 py-2 transition-colors"
                    style={{
                      backgroundColor:
                        'var(--component-popover-trigger-background)',
                      borderWidth: '1px',
                      borderStyle: 'solid',
                      borderColor: 'var(--component-popover-trigger-border)',
                      color: 'var(--component-popover-trigger-text)',
                    }}
                  >
                    Custom Styled Trigger
                  </button>
                </PopoverTrigger>
                <PopoverContent
                  className="w-80"
                  style={{
                    backgroundColor: 'var(--component-popover-background)',
                    borderColor: 'var(--component-popover-border)',
                    boxShadow: 'var(--component-popover-shadow)',
                  }}
                >
                  <div className="space-y-2">
                    <h4 className="font-medium">Custom Popover</h4>
                    <p className="text-muted-foreground text-sm">
                      This popover uses component design tokens for consistent
                      theming.
                    </p>
                  </div>
                </PopoverContent>
              </Popover>

              <div className="bg-muted rounded-md p-3">
                <code className="text-xs">
                  --component-popover-background
                  <br />
                  --component-popover-border
                  <br />
                  --component-popover-shadow
                  <br />
                  --component-popover-trigger-background
                  <br />
                  --component-popover-trigger-border
                  <br />
                  --component-popover-trigger-text
                  <br />
                  --component-popover-arrow-fill
                </code>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      <div>
        <h3 className="text-heading-3 mb-4 font-medium">
          Interactive Examples
        </h3>
        <div className="grid grid-cols-2 gap-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-sm">With Form</CardTitle>
            </CardHeader>
            <CardContent>
              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="outline">
                    <Settings className="mr-2 h-4 w-4" />
                    Settings
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-80">
                  <form className="grid gap-4">
                    <div className="space-y-2">
                      <h4 className="leading-none font-medium">Preferences</h4>
                      <p className="text-muted-foreground text-sm">
                        Update your settings.
                      </p>
                    </div>
                    <div className="grid gap-2">
                      <Label htmlFor="theme">Theme</Label>
                      <Select defaultValue="light">
                        <SelectTrigger id="theme">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="light">Light</SelectItem>
                          <SelectItem value="dark">Dark</SelectItem>
                          <SelectItem value="system">System</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <Button size="sm">Save</Button>
                  </form>
                </PopoverContent>
              </Popover>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-sm">Rich Content</CardTitle>
            </CardHeader>
            <CardContent>
              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="outline">
                    <Package className="mr-2 h-4 w-4" />
                    Product
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-80 p-0">
                  <div className="bg-muted aspect-video" />
                  <div className="space-y-2 p-4">
                    <h4 className="font-semibold">Premium Package</h4>
                    <p className="text-muted-foreground text-sm">
                      Everything you need to get started.
                    </p>
                    <div className="flex items-center justify-between">
                      <span className="text-2xl font-bold">$99</span>
                      <Button size="sm">Buy Now</Button>
                    </div>
                  </div>
                </PopoverContent>
              </Popover>
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
          'Comprehensive showcase of popover variations using CoreLive Design System tokens for consistent floating content across different contexts.',
      },
    },
  },
}
