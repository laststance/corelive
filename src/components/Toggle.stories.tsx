import type { Meta, StoryObj } from '@storybook/react'
import {
  AlignCenter,
  AlignJustify,
  AlignLeft,
  AlignRight,
  AlertTriangle,
  Bell,
  BellOff,
  Bluetooth,
  BluetoothOff,
  Bold,
  Bookmark,
  CheckCircle,
  Code,
  Eye,
  EyeOff,
  Heading1,
  Heading2,
  Heading3,
  Heart,
  Image,
  IndentDecrease,
  IndentIncrease,
  Info as InfoIcon,
  Italic,
  Link,
  List,
  ListOrdered,
  Lock,
  Mic,
  MicOff,
  Moon,
  Pause,
  Pin,
  Play,
  Quote,
  Redo,
  Star,
  Strikethrough,
  Sun,
  Underline,
  Undo,
  Unlock,
  Video,
  VideoOff,
  Volume2,
  VolumeX,
  Wifi,
  WifiOff,
  XCircle,
} from 'lucide-react'
import { useState } from 'react'

import { Badge } from '@/components/ui/badge'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { Separator } from '@/components/ui/separator'
import { Toggle } from '@/components/ui/toggle'

const meta: Meta<typeof Toggle> = {
  title: 'CoreLive Design System/Components/Toggle',
  component: Toggle,
  parameters: {
    layout: 'centered',
    docs: {
      description: {
        component:
          'A two-state button that can be either on or off. Styled with CoreLive Design System tokens for consistent appearance.',
      },
    },
  },
  tags: ['autodocs'],
  argTypes: {
    variant: {
      control: 'select',
      options: ['default', 'outline'],
      description: 'The visual style variant',
    },
    size: {
      control: 'select',
      options: ['default', 'sm', 'lg'],
      description: 'The size of the toggle',
    },
    pressed: {
      control: 'boolean',
      description: 'The pressed state of the toggle',
    },
    disabled: {
      control: 'boolean',
      description: 'Disabled state',
    },
  },
}

export default meta
type Story = StoryObj<typeof meta>

export const Default: Story = {
  args: {},
  render: () => <Toggle>Toggle</Toggle>,
}

export const WithIcon: Story = {
  args: {},
  render: () => (
    <div className="flex gap-2">
      <Toggle>
        <Bold className="h-4 w-4" />
      </Toggle>
      <Toggle>
        <Italic className="h-4 w-4" />
      </Toggle>
      <Toggle>
        <Underline className="h-4 w-4" />
      </Toggle>
    </div>
  ),
}

export const Sizes: Story = {
  args: {},
  render: () => (
    <div className="flex items-center gap-4">
      <Toggle size="sm">
        <Bold className="h-3 w-3" />
      </Toggle>
      <Toggle size="default">
        <Bold className="h-4 w-4" />
      </Toggle>
      <Toggle size="lg">
        <Bold className="h-5 w-5" />
      </Toggle>
    </div>
  ),
}

export const Variants: Story = {
  args: {},
  render: () => (
    <div className="flex gap-4">
      <div className="space-y-2">
        <p className="text-sm font-medium">Default</p>
        <Toggle variant="default">
          <Bold className="mr-2 h-4 w-4" />
          Bold
        </Toggle>
      </div>
      <div className="space-y-2">
        <p className="text-sm font-medium">Outline</p>
        <Toggle variant="outline">
          <Bold className="mr-2 h-4 w-4" />
          Bold
        </Toggle>
      </div>
    </div>
  ),
}

export const Disabled: Story = {
  args: {},
  render: () => (
    <div className="flex gap-2">
      <Toggle disabled>
        <Bold className="h-4 w-4" />
      </Toggle>
      <Toggle disabled pressed>
        <Italic className="h-4 w-4" />
      </Toggle>
    </div>
  ),
}

export const TextEditor: Story = {
  args: {},
  render: () => {
    const [bold, setBold] = useState(false)
    const [italic, setItalic] = useState(false)
    const [underline, setUnderline] = useState(false)
    const [alignment, setAlignment] = useState('left')

    return (
      <Card className="w-[500px]">
        <CardHeader>
          <CardTitle>Text Editor</CardTitle>
          <CardDescription>Rich text formatting options</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            <div className="flex flex-wrap gap-1">
              <div className="flex gap-1 pr-2">
                <Toggle pressed={bold} onPressedChange={setBold} size="sm">
                  <Bold className="h-3 w-3" />
                </Toggle>
                <Toggle pressed={italic} onPressedChange={setItalic} size="sm">
                  <Italic className="h-3 w-3" />
                </Toggle>
                <Toggle
                  pressed={underline}
                  onPressedChange={setUnderline}
                  size="sm"
                >
                  <Underline className="h-3 w-3" />
                </Toggle>
                <Toggle size="sm">
                  <Strikethrough className="h-3 w-3" />
                </Toggle>
              </div>

              <Separator orientation="vertical" className="h-6" />

              <div className="flex gap-1 px-2">
                <Toggle
                  pressed={alignment === 'left'}
                  onPressedChange={() => setAlignment('left')}
                  size="sm"
                >
                  <AlignLeft className="h-3 w-3" />
                </Toggle>
                <Toggle
                  pressed={alignment === 'center'}
                  onPressedChange={() => setAlignment('center')}
                  size="sm"
                >
                  <AlignCenter className="h-3 w-3" />
                </Toggle>
                <Toggle
                  pressed={alignment === 'right'}
                  onPressedChange={() => setAlignment('right')}
                  size="sm"
                >
                  <AlignRight className="h-3 w-3" />
                </Toggle>
                <Toggle
                  pressed={alignment === 'justify'}
                  onPressedChange={() => setAlignment('justify')}
                  size="sm"
                >
                  <AlignJustify className="h-3 w-3" />
                </Toggle>
              </div>

              <Separator orientation="vertical" className="h-6" />

              <div className="flex gap-1 px-2">
                <Toggle size="sm">
                  <List className="h-3 w-3" />
                </Toggle>
                <Toggle size="sm">
                  <ListOrdered className="h-3 w-3" />
                </Toggle>
                <Toggle size="sm">
                  <IndentDecrease className="h-3 w-3" />
                </Toggle>
                <Toggle size="sm">
                  <IndentIncrease className="h-3 w-3" />
                </Toggle>
              </div>

              <Separator orientation="vertical" className="h-6" />

              <div className="flex gap-1 pl-2">
                <Toggle size="sm">
                  <Link className="h-3 w-3" />
                </Toggle>
                <Toggle size="sm">
                  <Image className="h-3 w-3" />
                </Toggle>
                <Toggle size="sm">
                  <Code className="h-3 w-3" />
                </Toggle>
                <Toggle size="sm">
                  <Quote className="h-3 w-3" />
                </Toggle>
              </div>
            </div>

            <div className="min-h-[200px] rounded-md border p-4 text-sm">
              <p
                className={` ${bold ? 'font-bold' : ''} ${italic ? 'italic' : ''} ${underline ? 'underline' : ''} ${alignment === 'center' ? 'text-center' : ''} ${alignment === 'right' ? 'text-right' : ''} ${alignment === 'justify' ? 'text-justify' : ''} `}
              >
                Lorem ipsum dolor sit amet, consectetur adipiscing elit. Sed do
                eiusmod tempor incididunt ut labore et dolore magna aliqua.
              </p>
            </div>
          </div>
        </CardContent>
      </Card>
    )
  },
}

export const MediaControls: Story = {
  args: {},
  render: () => {
    const [playing, setPlaying] = useState(false)
    const [muted, setMuted] = useState(false)
    const [mic, setMic] = useState(true)
    const [video, setVideo] = useState(true)

    return (
      <Card className="w-[400px]">
        <CardHeader>
          <CardTitle>Media Controls</CardTitle>
          <CardDescription>Audio and video toggles</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium">Playback</span>
              <Toggle
                pressed={playing}
                onPressedChange={setPlaying}
                variant="outline"
              >
                {playing ? (
                  <>
                    <Pause className="mr-2 h-4 w-4" />
                    Pause
                  </>
                ) : (
                  <>
                    <Play className="mr-2 h-4 w-4" />
                    Play
                  </>
                )}
              </Toggle>
            </div>

            <div className="flex items-center justify-between">
              <span className="text-sm font-medium">Volume</span>
              <Toggle
                pressed={muted}
                onPressedChange={setMuted}
                variant="outline"
              >
                {muted ? (
                  <>
                    <VolumeX className="mr-2 h-4 w-4" />
                    Unmute
                  </>
                ) : (
                  <>
                    <Volume2 className="mr-2 h-4 w-4" />
                    Mute
                  </>
                )}
              </Toggle>
            </div>

            <Separator />

            <div className="flex items-center justify-between">
              <span className="text-sm font-medium">Microphone</span>
              <div className="flex items-center gap-2">
                {mic && <Badge variant="secondary">Active</Badge>}
                <Toggle pressed={mic} onPressedChange={setMic}>
                  {mic ? (
                    <Mic className="h-4 w-4" />
                  ) : (
                    <MicOff className="h-4 w-4" />
                  )}
                </Toggle>
              </div>
            </div>

            <div className="flex items-center justify-between">
              <span className="text-sm font-medium">Camera</span>
              <div className="flex items-center gap-2">
                {video && <Badge variant="secondary">Active</Badge>}
                <Toggle pressed={video} onPressedChange={setVideo}>
                  {video ? (
                    <Video className="h-4 w-4" />
                  ) : (
                    <VideoOff className="h-4 w-4" />
                  )}
                </Toggle>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    )
  },
}

export const SystemToggles: Story = {
  args: {},
  render: () => {
    const [darkMode, setDarkMode] = useState(false)
    const [wifi, setWifi] = useState(true)
    const [bluetooth, setBluetooth] = useState(false)
    const [doNotDisturb, setDoNotDisturb] = useState(false)

    return (
      <div className="grid w-full max-w-lg grid-cols-2 gap-4">
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                {darkMode ? (
                  <Moon className="h-5 w-5" />
                ) : (
                  <Sun className="h-5 w-5" />
                )}
                <div>
                  <p className="font-medium">Dark Mode</p>
                  <p className="text-muted-foreground text-xs">
                    {darkMode ? 'On' : 'Off'}
                  </p>
                </div>
              </div>
              <Toggle
                pressed={darkMode}
                onPressedChange={setDarkMode}
                size="sm"
              >
                {darkMode ? (
                  <Moon className="h-3 w-3" />
                ) : (
                  <Sun className="h-3 w-3" />
                )}
              </Toggle>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                {wifi ? (
                  <Wifi className="text-primary h-5 w-5" />
                ) : (
                  <WifiOff className="text-muted-foreground h-5 w-5" />
                )}
                <div>
                  <p className="font-medium">Wi-Fi</p>
                  <p className="text-muted-foreground text-xs">
                    {wifi ? 'Connected' : 'Disconnected'}
                  </p>
                </div>
              </div>
              <Toggle pressed={wifi} onPressedChange={setWifi} size="sm">
                {wifi ? (
                  <Wifi className="h-3 w-3" />
                ) : (
                  <WifiOff className="h-3 w-3" />
                )}
              </Toggle>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                {bluetooth ? (
                  <Bluetooth className="text-primary h-5 w-5" />
                ) : (
                  <BluetoothOff className="text-muted-foreground h-5 w-5" />
                )}
                <div>
                  <p className="font-medium">Bluetooth</p>
                  <p className="text-muted-foreground text-xs">
                    {bluetooth ? 'On' : 'Off'}
                  </p>
                </div>
              </div>
              <Toggle
                pressed={bluetooth}
                onPressedChange={setBluetooth}
                size="sm"
              >
                {bluetooth ? (
                  <Bluetooth className="h-3 w-3" />
                ) : (
                  <BluetoothOff className="h-3 w-3" />
                )}
              </Toggle>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <Bell
                  className={`h-5 w-5 ${doNotDisturb ? 'text-muted-foreground' : ''}`}
                />
                <div>
                  <p className="font-medium">Do Not Disturb</p>
                  <p className="text-muted-foreground text-xs">
                    {doNotDisturb ? 'Enabled' : 'Disabled'}
                  </p>
                </div>
              </div>
              <Toggle
                pressed={doNotDisturb}
                onPressedChange={setDoNotDisturb}
                size="sm"
              >
                <BellOff className="h-3 w-3" />
              </Toggle>
            </div>
          </CardContent>
        </Card>
      </div>
    )
  },
  parameters: {
    layout: 'padded',
  },
}

export const InteractionStates: Story = {
  args: {},
  render: () => {
    const [favorite, setFavorite] = useState(false)
    const [starred, setStarred] = useState(false)
    const [bookmarked, setBookmarked] = useState(false)
    const [pinned, setPinned] = useState(false)

    return (
      <Card className="w-[400px]">
        <CardHeader>
          <CardTitle>Item Actions</CardTitle>
          <CardDescription>Toggle various item states</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <p className="text-sm font-medium">Favorite</p>
              <Toggle
                pressed={favorite}
                onPressedChange={setFavorite}
                variant="outline"
                className="w-full"
              >
                <Heart
                  className={`mr-2 h-4 w-4 ${favorite ? 'text-danger fill-current' : ''}`}
                />
                {favorite ? 'Favorited' : 'Favorite'}
              </Toggle>
            </div>

            <div className="space-y-2">
              <p className="text-sm font-medium">Star</p>
              <Toggle
                pressed={starred}
                onPressedChange={setStarred}
                variant="outline"
                className="w-full"
              >
                <Star
                  className={`mr-2 h-4 w-4 ${starred ? 'text-warning fill-current' : ''}`}
                />
                {starred ? 'Starred' : 'Star'}
              </Toggle>
            </div>

            <div className="space-y-2">
              <p className="text-sm font-medium">Bookmark</p>
              <Toggle
                pressed={bookmarked}
                onPressedChange={setBookmarked}
                variant="outline"
                className="w-full"
              >
                <Bookmark
                  className={`mr-2 h-4 w-4 ${bookmarked ? 'fill-current' : ''}`}
                />
                {bookmarked ? 'Saved' : 'Save'}
              </Toggle>
            </div>

            <div className="space-y-2">
              <p className="text-sm font-medium">Pin</p>
              <Toggle
                pressed={pinned}
                onPressedChange={setPinned}
                variant="outline"
                className="w-full"
              >
                <Pin
                  className={`mr-2 h-4 w-4 ${pinned ? 'fill-current' : ''}`}
                />
                {pinned ? 'Pinned' : 'Pin'}
              </Toggle>
            </div>
          </div>
        </CardContent>
      </Card>
    )
  },
}

export const PrivacyToggles: Story = {
  args: {},
  render: () => {
    const [isPrivate, setIsPrivate] = useState(false)
    const [isVisible, setIsVisible] = useState(true)

    return (
      <div className="w-[350px] space-y-4">
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div className="space-y-1">
                <p className="text-sm font-medium">Profile Privacy</p>
                <p className="text-muted-foreground text-xs">
                  {isPrivate
                    ? 'Only you can see your profile'
                    : 'Anyone can view your profile'}
                </p>
              </div>
              <Toggle pressed={isPrivate} onPressedChange={setIsPrivate}>
                {isPrivate ? (
                  <Lock className="h-4 w-4" />
                ) : (
                  <Unlock className="h-4 w-4" />
                )}
              </Toggle>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div className="space-y-1">
                <p className="text-sm font-medium">Activity Status</p>
                <p className="text-muted-foreground text-xs">
                  {isVisible
                    ? "Others can see when you're online"
                    : 'Your online status is hidden'}
                </p>
              </div>
              <Toggle pressed={isVisible} onPressedChange={setIsVisible}>
                {isVisible ? (
                  <Eye className="h-4 w-4" />
                ) : (
                  <EyeOff className="h-4 w-4" />
                )}
              </Toggle>
            </div>
          </CardContent>
        </Card>
      </div>
    )
  },
}

export const CoreLiveThemeShowcase: Story = {
  args: {},
  render: () => (
    <div className="w-full max-w-2xl space-y-6">
      <div>
        <h3 className="text-heading-3 mb-4 font-medium">Toggle States</h3>
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-3">
            <div className="flex items-center gap-3">
              <Toggle
                style={{
                  backgroundColor: 'var(--component-toggle-background)',
                  borderColor: 'var(--component-toggle-border)',
                }}
              >
                <Bold className="h-4 w-4" />
              </Toggle>
              <span className="text-sm">Default state</span>
            </div>

            <div className="flex items-center gap-3">
              <Toggle
                pressed
                style={{
                  backgroundColor: 'var(--component-toggle-pressed-background)',
                  borderColor: 'var(--component-toggle-pressed-border)',
                }}
              >
                <Bold className="h-4 w-4" />
              </Toggle>
              <span className="text-sm">Pressed state</span>
            </div>

            <div className="flex items-center gap-3">
              <Toggle disabled>
                <Bold className="h-4 w-4" />
              </Toggle>
              <span className="text-muted-foreground text-sm">
                Disabled state
              </span>
            </div>
          </div>

          <div className="space-y-3">
            <div className="flex items-center gap-3">
              <Toggle className="hover:bg-muted">
                <Bold className="h-4 w-4" />
              </Toggle>
              <span className="text-sm">Hover state</span>
            </div>

            <div className="flex items-center gap-3">
              <Toggle className="focus-visible:ring-primary focus-visible:ring-2">
                <Bold className="h-4 w-4" />
              </Toggle>
              <span className="text-sm">Focus state (tab to see)</span>
            </div>

            <div className="flex items-center gap-3">
              <Toggle pressed disabled>
                <Bold className="h-4 w-4" />
              </Toggle>
              <span className="text-muted-foreground text-sm">
                Disabled pressed
              </span>
            </div>
          </div>
        </div>
      </div>

      <div>
        <h3 className="text-heading-3 mb-4 font-medium">
          Semantic Color Usage
        </h3>
        <div className="grid grid-cols-2 gap-4">
          <Card className="border-success/20 bg-success/5">
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <span className="text-success font-medium">Success Toggle</span>
                <Toggle className="data-[state=on]:bg-success data-[state=on]:text-white">
                  <CheckCircle className="h-4 w-4" />
                </Toggle>
              </div>
            </CardContent>
          </Card>

          <Card className="border-warning/20 bg-warning/5">
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <span className="text-warning font-medium">Warning Toggle</span>
                <Toggle className="data-[state=on]:bg-warning data-[state=on]:text-white">
                  <AlertTriangle className="h-4 w-4" />
                </Toggle>
              </div>
            </CardContent>
          </Card>

          <Card className="border-danger/20 bg-danger/5">
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <span className="text-danger font-medium">Danger Toggle</span>
                <Toggle className="data-[state=on]:bg-danger data-[state=on]:text-white">
                  <XCircle className="h-4 w-4" />
                </Toggle>
              </div>
            </CardContent>
          </Card>

          <Card className="border-info/20 bg-info/5">
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <span className="text-info font-medium">Info Toggle</span>
                <Toggle className="data-[state=on]:bg-info data-[state=on]:text-white">
                  <InfoIcon className="h-4 w-4" />
                </Toggle>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>

      <div>
        <h3 className="text-heading-3 mb-4 font-medium">Size Variations</h3>
        <div className="flex items-end gap-4">
          <div className="space-y-2 text-center">
            <Toggle size="sm">
              <Bold className="h-3 w-3" />
            </Toggle>
            <p className="text-xs">Small</p>
          </div>

          <div className="space-y-2 text-center">
            <Toggle size="default">
              <Bold className="h-4 w-4" />
            </Toggle>
            <p className="text-xs">Default</p>
          </div>

          <div className="space-y-2 text-center">
            <Toggle size="lg">
              <Bold className="h-5 w-5" />
            </Toggle>
            <p className="text-xs">Large</p>
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
              <div className="flex items-center gap-3">
                <button
                  className="inline-flex items-center justify-center rounded-md px-3 py-2 text-sm font-medium transition-colors"
                  style={{
                    backgroundColor: 'var(--component-toggle-background)',
                    border: '1px solid var(--component-toggle-border)',
                    color: 'var(--component-toggle-text)',
                  }}
                >
                  Custom Toggle
                </button>
                <span className="text-sm">Using component tokens</span>
              </div>

              <div className="bg-muted rounded-md p-3">
                <code className="text-xs">
                  --component-toggle-background
                  <br />
                  --component-toggle-border
                  <br />
                  --component-toggle-text
                  <br />
                  --component-toggle-pressed-background
                  <br />
                  --component-toggle-pressed-border
                  <br />
                  --component-toggle-pressed-text
                </code>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      <div>
        <h3 className="text-heading-3 mb-4 font-medium">Advanced Examples</h3>
        <Card>
          <CardContent className="space-y-4 pt-6">
            <div className="flex gap-2">
              <Toggle variant="outline">
                <Heading1 className="h-4 w-4" />
              </Toggle>
              <Toggle variant="outline">
                <Heading2 className="h-4 w-4" />
              </Toggle>
              <Toggle variant="outline">
                <Heading3 className="h-4 w-4" />
              </Toggle>
              <Separator orientation="vertical" className="h-8" />
              <Toggle variant="outline">
                <Bold className="h-4 w-4" />
              </Toggle>
              <Toggle variant="outline">
                <Italic className="h-4 w-4" />
              </Toggle>
              <Toggle variant="outline">
                <Underline className="h-4 w-4" />
              </Toggle>
              <Separator orientation="vertical" className="h-8" />
              <Toggle variant="outline">
                <Undo className="h-4 w-4" />
              </Toggle>
              <Toggle variant="outline">
                <Redo className="h-4 w-4" />
              </Toggle>
            </div>
            <p className="text-muted-foreground text-sm">
              Toggle buttons work great in toolbars and editor interfaces
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
          'Comprehensive showcase of toggle button variations using CoreLive Design System tokens for consistent styling across different states and use cases.',
      },
    },
  },
}
