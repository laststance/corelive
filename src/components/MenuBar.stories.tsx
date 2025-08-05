import type { Meta, StoryObj } from '@storybook/react'
import {
  File,
  Eye,
  Settings,
  HelpCircle,
  Info,
  Save,
  FolderOpen,
  Copy,
  Scissors,
  Clipboard,
  Undo,
  Redo,
  Search,
  ZoomIn,
  ZoomOut,
  RotateCcw,
  Download,
  Upload,
  Share,
  Users,
  Calendar,
  Mail,
  Phone,
  MessageSquare,
  Video,
  Printer,
  BookOpen,
  Code,
  Terminal,
  Database,
  Cloud,
  Shield,
  Zap,
  Heart,
  Star,
  Home,
  User,
  Briefcase,
  Trophy,
  Target,
  TrendingUp,
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
import {
  Menubar,
  MenubarContent,
  MenubarItem,
  MenubarMenu,
  MenubarSeparator,
  MenubarShortcut,
  MenubarTrigger,
  MenubarCheckboxItem,
  MenubarRadioGroup,
  MenubarRadioItem,
  MenubarLabel,
  MenubarSub,
  MenubarSubTrigger,
  MenubarSubContent,
} from '@/components/ui/menubar'
import { Separator } from '@/components/ui/separator'

const meta: Meta<typeof Menubar> = {
  title: 'Components/MenuBar',
  component: Menubar,
  parameters: {
    layout: 'centered',
    docs: {
      description: {
        component:
          'A horizontal menu bar with dropdown menus, perfect for application navigation.',
      },
    },
  },
  tags: ['autodocs'],
}

export default meta
type Story = StoryObj<typeof Menubar>

export const Default: Story = {
  args: {},
  render: () => (
    <Menubar className="w-fit">
      <MenubarMenu>
        <MenubarTrigger>File</MenubarTrigger>
        <MenubarContent>
          <MenubarItem>
            <File className="mr-2 h-4 w-4" />
            New File
            <MenubarShortcut>⌘N</MenubarShortcut>
          </MenubarItem>
          <MenubarItem>
            <FolderOpen className="mr-2 h-4 w-4" />
            Open
            <MenubarShortcut>⌘O</MenubarShortcut>
          </MenubarItem>
          <MenubarSeparator />
          <MenubarItem>
            <Save className="mr-2 h-4 w-4" />
            Save
            <MenubarShortcut>⌘S</MenubarShortcut>
          </MenubarItem>
          <MenubarItem>
            Save As...
            <MenubarShortcut>⌘⇧S</MenubarShortcut>
          </MenubarItem>
        </MenubarContent>
      </MenubarMenu>

      <MenubarMenu>
        <MenubarTrigger>Edit</MenubarTrigger>
        <MenubarContent>
          <MenubarItem>
            <Undo className="mr-2 h-4 w-4" />
            Undo
            <MenubarShortcut>⌘Z</MenubarShortcut>
          </MenubarItem>
          <MenubarItem>
            <Redo className="mr-2 h-4 w-4" />
            Redo
            <MenubarShortcut>⌘⇧Z</MenubarShortcut>
          </MenubarItem>
          <MenubarSeparator />
          <MenubarItem>
            <Scissors className="mr-2 h-4 w-4" />
            Cut
            <MenubarShortcut>⌘X</MenubarShortcut>
          </MenubarItem>
          <MenubarItem>
            <Copy className="mr-2 h-4 w-4" />
            Copy
            <MenubarShortcut>⌘C</MenubarShortcut>
          </MenubarItem>
          <MenubarItem>
            <Clipboard className="mr-2 h-4 w-4" />
            Paste
            <MenubarShortcut>⌘V</MenubarShortcut>
          </MenubarItem>
        </MenubarContent>
      </MenubarMenu>

      <MenubarMenu>
        <MenubarTrigger>View</MenubarTrigger>
        <MenubarContent>
          <MenubarCheckboxItem checked>
            Show Sidebar
            <MenubarShortcut>⌘⇧E</MenubarShortcut>
          </MenubarCheckboxItem>
          <MenubarCheckboxItem>Show Minimap</MenubarCheckboxItem>
          <MenubarSeparator />
          <MenubarItem>
            <ZoomIn className="mr-2 h-4 w-4" />
            Zoom In
            <MenubarShortcut>⌘+</MenubarShortcut>
          </MenubarItem>
          <MenubarItem>
            <ZoomOut className="mr-2 h-4 w-4" />
            Zoom Out
            <MenubarShortcut>⌘-</MenubarShortcut>
          </MenubarItem>
        </MenubarContent>
      </MenubarMenu>
    </Menubar>
  ),
}

export const ApplicationMenu: Story = {
  args: {},
  render: () => {
    const [selectedTheme, setSelectedTheme] = useState('system')
    const [showStatusBar, setShowStatusBar] = useState(true)
    const [showMinimap, setShowMinimap] = useState(false)
    const [wordWrap, setWordWrap] = useState(true)

    return (
      <Card className="w-full max-w-4xl">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Code className="h-5 w-5" />
            Code Editor
          </CardTitle>
          <CardDescription>
            Professional code editor with full menu system
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <Menubar>
            <MenubarMenu>
              <MenubarTrigger>File</MenubarTrigger>
              <MenubarContent>
                <MenubarItem>
                  <File className="mr-2 h-4 w-4" />
                  New File
                  <MenubarShortcut>⌘N</MenubarShortcut>
                </MenubarItem>
                <MenubarItem>
                  <FolderOpen className="mr-2 h-4 w-4" />
                  Open File...
                  <MenubarShortcut>⌘O</MenubarShortcut>
                </MenubarItem>
                <MenubarItem>
                  Open Folder...
                  <MenubarShortcut>⌘K ⌘O</MenubarShortcut>
                </MenubarItem>
                <MenubarSeparator />
                <MenubarSub>
                  <MenubarSubTrigger>Open Recent</MenubarSubTrigger>
                  <MenubarSubContent>
                    <MenubarItem>~/project/app.tsx</MenubarItem>
                    <MenubarItem>~/project/utils.ts</MenubarItem>
                    <MenubarItem>~/project/styles.css</MenubarItem>
                    <MenubarSeparator />
                    <MenubarItem>Clear Recently Opened</MenubarItem>
                  </MenubarSubContent>
                </MenubarSub>
                <MenubarSeparator />
                <MenubarItem>
                  <Save className="mr-2 h-4 w-4" />
                  Save
                  <MenubarShortcut>⌘S</MenubarShortcut>
                </MenubarItem>
                <MenubarItem>
                  Save As...
                  <MenubarShortcut>⌘⇧S</MenubarShortcut>
                </MenubarItem>
                <MenubarItem>
                  Save All
                  <MenubarShortcut>⌘K S</MenubarShortcut>
                </MenubarItem>
                <MenubarSeparator />
                <MenubarItem>
                  <Share className="mr-2 h-4 w-4" />
                  Share
                </MenubarItem>
                <MenubarItem>
                  <Download className="mr-2 h-4 w-4" />
                  Export...
                </MenubarItem>
                <MenubarSeparator />
                <MenubarItem>
                  Close Tab
                  <MenubarShortcut>⌘W</MenubarShortcut>
                </MenubarItem>
                <MenubarItem>
                  Close All Tabs
                  <MenubarShortcut>⌘K ⌘W</MenubarShortcut>
                </MenubarItem>
              </MenubarContent>
            </MenubarMenu>

            <MenubarMenu>
              <MenubarTrigger>Edit</MenubarTrigger>
              <MenubarContent>
                <MenubarItem>
                  <Undo className="mr-2 h-4 w-4" />
                  Undo
                  <MenubarShortcut>⌘Z</MenubarShortcut>
                </MenubarItem>
                <MenubarItem>
                  <Redo className="mr-2 h-4 w-4" />
                  Redo
                  <MenubarShortcut>⌘⇧Z</MenubarShortcut>
                </MenubarItem>
                <MenubarSeparator />
                <MenubarItem>
                  <Scissors className="mr-2 h-4 w-4" />
                  Cut Line
                  <MenubarShortcut>⌘X</MenubarShortcut>
                </MenubarItem>
                <MenubarItem>
                  <Copy className="mr-2 h-4 w-4" />
                  Copy Line
                  <MenubarShortcut>⌘C</MenubarShortcut>
                </MenubarItem>
                <MenubarItem>
                  <Clipboard className="mr-2 h-4 w-4" />
                  Paste
                  <MenubarShortcut>⌘V</MenubarShortcut>
                </MenubarItem>
                <MenubarSeparator />
                <MenubarItem>
                  <Search className="mr-2 h-4 w-4" />
                  Find
                  <MenubarShortcut>⌘F</MenubarShortcut>
                </MenubarItem>
                <MenubarItem>
                  Replace
                  <MenubarShortcut>⌘H</MenubarShortcut>
                </MenubarItem>
                <MenubarSeparator />
                <MenubarSub>
                  <MenubarSubTrigger>Transform</MenubarSubTrigger>
                  <MenubarSubContent>
                    <MenubarItem>To Uppercase</MenubarItem>
                    <MenubarItem>To Lowercase</MenubarItem>
                    <MenubarItem>To Title Case</MenubarItem>
                    <MenubarSeparator />
                    <MenubarItem>Sort Lines</MenubarItem>
                    <MenubarItem>Remove Duplicates</MenubarItem>
                  </MenubarSubContent>
                </MenubarSub>
              </MenubarContent>
            </MenubarMenu>

            <MenubarMenu>
              <MenubarTrigger>View</MenubarTrigger>
              <MenubarContent>
                <MenubarCheckboxItem
                  checked={showStatusBar}
                  onCheckedChange={setShowStatusBar}
                >
                  Status Bar
                  <MenubarShortcut>⌘⇧Y</MenubarShortcut>
                </MenubarCheckboxItem>
                <MenubarCheckboxItem
                  checked={showMinimap}
                  onCheckedChange={setShowMinimap}
                >
                  Minimap
                </MenubarCheckboxItem>
                <MenubarCheckboxItem
                  checked={wordWrap}
                  onCheckedChange={setWordWrap}
                >
                  Word Wrap
                  <MenubarShortcut>⌥Z</MenubarShortcut>
                </MenubarCheckboxItem>
                <MenubarSeparator />
                <MenubarSub>
                  <MenubarSubTrigger>Panels</MenubarSubTrigger>
                  <MenubarSubContent>
                    <MenubarCheckboxItem checked>
                      Explorer
                      <MenubarShortcut>⌘⇧E</MenubarShortcut>
                    </MenubarCheckboxItem>
                    <MenubarCheckboxItem>
                      Search
                      <MenubarShortcut>⌘⇧F</MenubarShortcut>
                    </MenubarCheckboxItem>
                    <MenubarCheckboxItem>
                      Source Control
                      <MenubarShortcut>⌃⇧G</MenubarShortcut>
                    </MenubarCheckboxItem>
                    <MenubarCheckboxItem>
                      Extensions
                      <MenubarShortcut>⌘⇧X</MenubarShortcut>
                    </MenubarCheckboxItem>
                  </MenubarSubContent>
                </MenubarSub>
                <MenubarSeparator />
                <MenubarItem>
                  <ZoomIn className="mr-2 h-4 w-4" />
                  Zoom In
                  <MenubarShortcut>⌘+</MenubarShortcut>
                </MenubarItem>
                <MenubarItem>
                  <ZoomOut className="mr-2 h-4 w-4" />
                  Zoom Out
                  <MenubarShortcut>⌘-</MenubarShortcut>
                </MenubarItem>
                <MenubarItem>
                  <RotateCcw className="mr-2 h-4 w-4" />
                  Reset Zoom
                  <MenubarShortcut>⌘0</MenubarShortcut>
                </MenubarItem>
              </MenubarContent>
            </MenubarMenu>

            <MenubarMenu>
              <MenubarTrigger>Settings</MenubarTrigger>
              <MenubarContent>
                <MenubarSub>
                  <MenubarSubTrigger>
                    <Eye className="mr-2 h-4 w-4" />
                    Color Theme
                  </MenubarSubTrigger>
                  <MenubarSubContent>
                    <MenubarRadioGroup
                      value={selectedTheme}
                      onValueChange={setSelectedTheme}
                    >
                      <MenubarRadioItem value="light">
                        Light Theme
                      </MenubarRadioItem>
                      <MenubarRadioItem value="dark">
                        Dark Theme
                      </MenubarRadioItem>
                      <MenubarRadioItem value="system">
                        System Default
                      </MenubarRadioItem>
                      <MenubarRadioItem value="high-contrast">
                        High Contrast
                      </MenubarRadioItem>
                    </MenubarRadioGroup>
                  </MenubarSubContent>
                </MenubarSub>
                <MenubarItem>
                  <Settings className="mr-2 h-4 w-4" />
                  Preferences
                  <MenubarShortcut>⌘,</MenubarShortcut>
                </MenubarItem>
                <MenubarItem>
                  <Terminal className="mr-2 h-4 w-4" />
                  Configure Tasks
                </MenubarItem>
                <MenubarSeparator />
                <MenubarItem>
                  <Code className="mr-2 h-4 w-4" />
                  Extensions
                  <MenubarShortcut>⌘⇧X</MenubarShortcut>
                </MenubarItem>
                <MenubarItem>
                  <Zap className="mr-2 h-4 w-4" />
                  Keyboard Shortcuts
                  <MenubarShortcut>⌘K ⌘S</MenubarShortcut>
                </MenubarItem>
              </MenubarContent>
            </MenubarMenu>

            <MenubarMenu>
              <MenubarTrigger>Help</MenubarTrigger>
              <MenubarContent>
                <MenubarItem>
                  <BookOpen className="mr-2 h-4 w-4" />
                  Documentation
                </MenubarItem>
                <MenubarItem>
                  <Video className="mr-2 h-4 w-4" />
                  Video Tutorials
                </MenubarItem>
                <MenubarSeparator />
                <MenubarItem>
                  <MessageSquare className="mr-2 h-4 w-4" />
                  Community Forum
                </MenubarItem>
                <MenubarItem>Report Issue</MenubarItem>
                <MenubarSeparator />
                <MenubarItem>
                  <Info className="mr-2 h-4 w-4" />
                  About
                </MenubarItem>
              </MenubarContent>
            </MenubarMenu>
          </Menubar>

          <div className="bg-muted mt-6 rounded-lg p-4">
            <div className="flex items-center justify-between text-sm">
              <div className="flex items-center gap-4">
                <span>
                  Current Theme:{' '}
                  <Badge variant="outline">{selectedTheme}</Badge>
                </span>
                <span>
                  Status Bar:{' '}
                  <Badge variant={showStatusBar ? 'default' : 'secondary'}>
                    {showStatusBar ? 'On' : 'Off'}
                  </Badge>
                </span>
                <span>
                  Minimap:{' '}
                  <Badge variant={showMinimap ? 'default' : 'secondary'}>
                    {showMinimap ? 'On' : 'Off'}
                  </Badge>
                </span>
              </div>
              <span className="text-muted-foreground">Ready</span>
            </div>
          </div>
        </CardContent>
      </Card>
    )
  },
}

export const MediaPlayerMenu: Story = {
  args: {},
  render: () => {
    const [selectedQuality, setSelectedQuality] = useState('1080p')
    const [showSubtitles, setShowSubtitles] = useState(true)
    const [showControls, setShowControls] = useState(true)

    return (
      <Card className="w-full max-w-3xl">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Video className="h-5 w-5" />
            Media Player
          </CardTitle>
          <CardDescription>
            Video player with comprehensive menu controls
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <Menubar>
            <MenubarMenu>
              <MenubarTrigger>Playback</MenubarTrigger>
              <MenubarContent>
                <MenubarItem>
                  Play/Pause
                  <MenubarShortcut>Space</MenubarShortcut>
                </MenubarItem>
                <MenubarItem>
                  Stop
                  <MenubarShortcut>S</MenubarShortcut>
                </MenubarItem>
                <MenubarSeparator />
                <MenubarItem>
                  Jump Forward 10s
                  <MenubarShortcut>→</MenubarShortcut>
                </MenubarItem>
                <MenubarItem>
                  Jump Backward 10s
                  <MenubarShortcut>←</MenubarShortcut>
                </MenubarItem>
                <MenubarSeparator />
                <MenubarSub>
                  <MenubarSubTrigger>Playback Speed</MenubarSubTrigger>
                  <MenubarSubContent>
                    <MenubarRadioGroup defaultValue="1.0">
                      <MenubarRadioItem value="0.5">0.5x</MenubarRadioItem>
                      <MenubarRadioItem value="0.75">0.75x</MenubarRadioItem>
                      <MenubarRadioItem value="1.0">
                        1.0x (Normal)
                      </MenubarRadioItem>
                      <MenubarRadioItem value="1.25">1.25x</MenubarRadioItem>
                      <MenubarRadioItem value="1.5">1.5x</MenubarRadioItem>
                      <MenubarRadioItem value="2.0">2.0x</MenubarRadioItem>
                    </MenubarRadioGroup>
                  </MenubarSubContent>
                </MenubarSub>
              </MenubarContent>
            </MenubarMenu>

            <MenubarMenu>
              <MenubarTrigger>Video</MenubarTrigger>
              <MenubarContent>
                <MenubarSub>
                  <MenubarSubTrigger>Quality</MenubarSubTrigger>
                  <MenubarSubContent>
                    <MenubarRadioGroup
                      value={selectedQuality}
                      onValueChange={setSelectedQuality}
                    >
                      <MenubarRadioItem value="4K">4K (2160p)</MenubarRadioItem>
                      <MenubarRadioItem value="1440p">
                        QHD (1440p)
                      </MenubarRadioItem>
                      <MenubarRadioItem value="1080p">
                        HD (1080p)
                      </MenubarRadioItem>
                      <MenubarRadioItem value="720p">
                        HD (720p)
                      </MenubarRadioItem>
                      <MenubarRadioItem value="480p">
                        SD (480p)
                      </MenubarRadioItem>
                      <MenubarRadioItem value="auto">Auto</MenubarRadioItem>
                    </MenubarRadioGroup>
                  </MenubarSubContent>
                </MenubarSub>
                <MenubarSeparator />
                <MenubarItem>
                  Fullscreen
                  <MenubarShortcut>F</MenubarShortcut>
                </MenubarItem>
                <MenubarItem>
                  Picture-in-Picture
                  <MenubarShortcut>P</MenubarShortcut>
                </MenubarItem>
                <MenubarSeparator />
                <MenubarSub>
                  <MenubarSubTrigger>Aspect Ratio</MenubarSubTrigger>
                  <MenubarSubContent>
                    <MenubarRadioGroup defaultValue="16:9">
                      <MenubarRadioItem value="16:9">16:9</MenubarRadioItem>
                      <MenubarRadioItem value="4:3">4:3</MenubarRadioItem>
                      <MenubarRadioItem value="21:9">21:9</MenubarRadioItem>
                      <MenubarRadioItem value="auto">Auto</MenubarRadioItem>
                    </MenubarRadioGroup>
                  </MenubarSubContent>
                </MenubarSub>
              </MenubarContent>
            </MenubarMenu>

            <MenubarMenu>
              <MenubarTrigger>Audio</MenubarTrigger>
              <MenubarContent>
                <MenubarItem>
                  Mute/Unmute
                  <MenubarShortcut>M</MenubarShortcut>
                </MenubarItem>
                <MenubarItem>
                  Volume Up
                  <MenubarShortcut>↑</MenubarShortcut>
                </MenubarItem>
                <MenubarItem>
                  Volume Down
                  <MenubarShortcut>↓</MenubarShortcut>
                </MenubarItem>
                <MenubarSeparator />
                <MenubarSub>
                  <MenubarSubTrigger>Audio Track</MenubarSubTrigger>
                  <MenubarSubContent>
                    <MenubarRadioGroup defaultValue="english">
                      <MenubarRadioItem value="english">
                        English
                      </MenubarRadioItem>
                      <MenubarRadioItem value="spanish">
                        Spanish
                      </MenubarRadioItem>
                      <MenubarRadioItem value="french">French</MenubarRadioItem>
                      <MenubarRadioItem value="german">German</MenubarRadioItem>
                    </MenubarRadioGroup>
                  </MenubarSubContent>
                </MenubarSub>
                <MenubarSub>
                  <MenubarSubTrigger>Audio Quality</MenubarSubTrigger>
                  <MenubarSubContent>
                    <MenubarRadioGroup defaultValue="high">
                      <MenubarRadioItem value="high">High</MenubarRadioItem>
                      <MenubarRadioItem value="medium">Medium</MenubarRadioItem>
                      <MenubarRadioItem value="low">Low</MenubarRadioItem>
                    </MenubarRadioGroup>
                  </MenubarSubContent>
                </MenubarSub>
              </MenubarContent>
            </MenubarMenu>

            <MenubarMenu>
              <MenubarTrigger>Subtitles</MenubarTrigger>
              <MenubarContent>
                <MenubarCheckboxItem
                  checked={showSubtitles}
                  onCheckedChange={setShowSubtitles}
                >
                  Enable Subtitles
                  <MenubarShortcut>C</MenubarShortcut>
                </MenubarCheckboxItem>
                <MenubarSeparator />
                <MenubarSub>
                  <MenubarSubTrigger>Language</MenubarSubTrigger>
                  <MenubarSubContent>
                    <MenubarRadioGroup defaultValue="english">
                      <MenubarRadioItem value="english">
                        English
                      </MenubarRadioItem>
                      <MenubarRadioItem value="spanish">
                        Spanish
                      </MenubarRadioItem>
                      <MenubarRadioItem value="french">French</MenubarRadioItem>
                      <MenubarRadioItem value="auto">
                        Auto-generated
                      </MenubarRadioItem>
                    </MenubarRadioGroup>
                  </MenubarSubContent>
                </MenubarSub>
                <MenubarSub>
                  <MenubarSubTrigger>Font Size</MenubarSubTrigger>
                  <MenubarSubContent>
                    <MenubarRadioGroup defaultValue="medium">
                      <MenubarRadioItem value="small">Small</MenubarRadioItem>
                      <MenubarRadioItem value="medium">Medium</MenubarRadioItem>
                      <MenubarRadioItem value="large">Large</MenubarRadioItem>
                      <MenubarRadioItem value="extra-large">
                        Extra Large
                      </MenubarRadioItem>
                    </MenubarRadioGroup>
                  </MenubarSubContent>
                </MenubarSub>
              </MenubarContent>
            </MenubarMenu>

            <MenubarMenu>
              <MenubarTrigger>View</MenubarTrigger>
              <MenubarContent>
                <MenubarCheckboxItem
                  checked={showControls}
                  onCheckedChange={setShowControls}
                >
                  Show Controls
                </MenubarCheckboxItem>
                <MenubarCheckboxItem checked>Show Timeline</MenubarCheckboxItem>
                <MenubarCheckboxItem>
                  Show Statistics
                  <MenubarShortcut>Shift+S</MenubarShortcut>
                </MenubarCheckboxItem>
                <MenubarSeparator />
                <MenubarItem>
                  Theater Mode
                  <MenubarShortcut>T</MenubarShortcut>
                </MenubarItem>
                <MenubarItem>
                  Lights Out
                  <MenubarShortcut>L</MenubarShortcut>
                </MenubarItem>
              </MenubarContent>
            </MenubarMenu>
          </Menubar>

          <div className="mt-6 space-y-2">
            <div className="flex items-center justify-between text-sm">
              <span>
                Quality: <Badge>{selectedQuality}</Badge>
              </span>
              <span>
                Subtitles:{' '}
                <Badge variant={showSubtitles ? 'default' : 'secondary'}>
                  {showSubtitles ? 'On' : 'Off'}
                </Badge>
              </span>
              <span>
                Controls:{' '}
                <Badge variant={showControls ? 'default' : 'secondary'}>
                  {showControls ? 'Visible' : 'Hidden'}
                </Badge>
              </span>
            </div>
            <div className="flex h-48 items-center justify-center rounded-lg bg-black text-white">
              <div className="text-center">
                <Video className="mx-auto mb-2 h-12 w-12" />
                <p>Video Player Area</p>
                <p className="text-sm opacity-75">
                  Playing at {selectedQuality}
                </p>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    )
  },
}

export const BusinessApplicationMenu: Story = {
  args: {},
  render: () => (
    <Card className="w-full max-w-4xl">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Briefcase className="h-5 w-5" />
          Business Dashboard
        </CardTitle>
        <CardDescription>
          Comprehensive business application with multiple menu sections
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Menubar>
          <MenubarMenu>
            <MenubarTrigger>
              <Home className="mr-2 h-4 w-4" />
              Dashboard
            </MenubarTrigger>
            <MenubarContent>
              <MenubarItem>
                <TrendingUp className="mr-2 h-4 w-4" />
                Analytics Overview
              </MenubarItem>
              <MenubarItem>
                <Target className="mr-2 h-4 w-4" />
                KPI Dashboard
              </MenubarItem>
              <MenubarItem>
                <Trophy className="mr-2 h-4 w-4" />
                Performance Metrics
              </MenubarItem>
              <MenubarSeparator />
              <MenubarSub>
                <MenubarSubTrigger>Quick Actions</MenubarSubTrigger>
                <MenubarSubContent>
                  <MenubarItem>Create Report</MenubarItem>
                  <MenubarItem>Schedule Meeting</MenubarItem>
                  <MenubarItem>Add Task</MenubarItem>
                  <MenubarItem>Send Message</MenubarItem>
                </MenubarSubContent>
              </MenubarSub>
            </MenubarContent>
          </MenubarMenu>

          <MenubarMenu>
            <MenubarTrigger>
              <Users className="mr-2 h-4 w-4" />
              Team
            </MenubarTrigger>
            <MenubarContent>
              <MenubarItem>
                <User className="mr-2 h-4 w-4" />
                Team Members
              </MenubarItem>
              <MenubarItem>
                <Users className="mr-2 h-4 w-4" />
                Departments
              </MenubarItem>
              <MenubarSeparator />
              <MenubarItem>
                <Mail className="mr-2 h-4 w-4" />
                Send Team Message
              </MenubarItem>
              <MenubarItem>
                <Calendar className="mr-2 h-4 w-4" />
                Team Calendar
              </MenubarItem>
              <MenubarSeparator />
              <MenubarSub>
                <MenubarSubTrigger>Communication</MenubarSubTrigger>
                <MenubarSubContent>
                  <MenubarItem>
                    <MessageSquare className="mr-2 h-4 w-4" />
                    Team Chat
                  </MenubarItem>
                  <MenubarItem>
                    <Video className="mr-2 h-4 w-4" />
                    Video Conference
                  </MenubarItem>
                  <MenubarItem>
                    <Phone className="mr-2 h-4 w-4" />
                    Voice Call
                  </MenubarItem>
                </MenubarSubContent>
              </MenubarSub>
            </MenubarContent>
          </MenubarMenu>

          <MenubarMenu>
            <MenubarTrigger>
              <Database className="mr-2 h-4 w-4" />
              Projects
            </MenubarTrigger>
            <MenubarContent>
              <MenubarItem>
                <File className="mr-2 h-4 w-4" />
                New Project
              </MenubarItem>
              <MenubarItem>
                <FolderOpen className="mr-2 h-4 w-4" />
                Open Project
              </MenubarItem>
              <MenubarSeparator />
              <MenubarSub>
                <MenubarSubTrigger>Recent Projects</MenubarSubTrigger>
                <MenubarSubContent>
                  <MenubarItem>Website Redesign</MenubarItem>
                  <MenubarItem>Mobile App Development</MenubarItem>
                  <MenubarItem>Marketing Campaign</MenubarItem>
                  <MenubarItem>Data Migration</MenubarItem>
                </MenubarSubContent>
              </MenubarSub>
              <MenubarSeparator />
              <MenubarItem>
                <Star className="mr-2 h-4 w-4" />
                Favorites
              </MenubarItem>
              <MenubarItem>
                <Trophy className="mr-2 h-4 w-4" />
                Completed Projects
              </MenubarItem>
            </MenubarContent>
          </MenubarMenu>

          <MenubarMenu>
            <MenubarTrigger>
              <Settings className="mr-2 h-4 w-4" />
              Tools
            </MenubarTrigger>
            <MenubarContent>
              <MenubarItem>
                <Upload className="mr-2 h-4 w-4" />
                Import Data
              </MenubarItem>
              <MenubarItem>
                <Download className="mr-2 h-4 w-4" />
                Export Data
              </MenubarItem>
              <MenubarSeparator />
              <MenubarItem>
                <Printer className="mr-2 h-4 w-4" />
                Print Reports
              </MenubarItem>
              <MenubarItem>
                <Share className="mr-2 h-4 w-4" />
                Share Dashboard
              </MenubarItem>
              <MenubarSeparator />
              <MenubarSub>
                <MenubarSubTrigger>
                  <Cloud className="mr-2 h-4 w-4" />
                  Cloud Services
                </MenubarSubTrigger>
                <MenubarSubContent>
                  <MenubarItem>Sync Data</MenubarItem>
                  <MenubarItem>Backup Settings</MenubarItem>
                  <MenubarItem>Cloud Storage</MenubarItem>
                  <MenubarSeparator />
                  <MenubarItem>
                    <Shield className="mr-2 h-4 w-4" />
                    Security Settings
                  </MenubarItem>
                </MenubarSubContent>
              </MenubarSub>
            </MenubarContent>
          </MenubarMenu>

          <MenubarMenu>
            <MenubarTrigger>
              <HelpCircle className="mr-2 h-4 w-4" />
              Support
            </MenubarTrigger>
            <MenubarContent>
              <MenubarItem>
                <BookOpen className="mr-2 h-4 w-4" />
                Documentation
              </MenubarItem>
              <MenubarItem>
                <Video className="mr-2 h-4 w-4" />
                Video Tutorials
              </MenubarItem>
              <MenubarSeparator />
              <MenubarItem>
                <MessageSquare className="mr-2 h-4 w-4" />
                Contact Support
              </MenubarItem>
              <MenubarItem>
                <Users className="mr-2 h-4 w-4" />
                Community Forum
              </MenubarItem>
              <MenubarSeparator />
              <MenubarItem>
                <Heart className="mr-2 h-4 w-4" />
                Send Feedback
              </MenubarItem>
              <MenubarItem>
                <Star className="mr-2 h-4 w-4" />
                Rate Our App
              </MenubarItem>
              <MenubarSeparator />
              <MenubarItem>
                <Info className="mr-2 h-4 w-4" />
                About
              </MenubarItem>
            </MenubarContent>
          </MenubarMenu>
        </Menubar>

        <div className="mt-6 grid grid-cols-1 gap-4 md:grid-cols-3">
          <Card>
            <CardContent className="p-4">
              <div className="mb-2 flex items-center gap-2">
                <TrendingUp className="text-success h-4 w-4" />
                <span className="font-medium">Revenue</span>
              </div>
              <div className="text-2xl font-bold">$127,392</div>
              <div className="text-success text-sm">+12.5% from last month</div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-4">
              <div className="mb-2 flex items-center gap-2">
                <Users className="text-info h-4 w-4" />
                <span className="font-medium">Active Users</span>
              </div>
              <div className="text-2xl font-bold">8,492</div>
              <div className="text-info text-sm">+3.2% from last week</div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-4">
              <div className="mb-2 flex items-center gap-2">
                <Target className="text-warning h-4 w-4" />
                <span className="font-medium">Conversion</span>
              </div>
              <div className="text-2xl font-bold">24.8%</div>
              <div className="text-warning text-sm">-1.1% from last week</div>
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
        <h2 className="text-2xl font-bold">CoreLive MenuBar Components</h2>
        <p className="text-muted-foreground">
          Menu bar components showcasing CoreLive Design System integration
        </p>
      </div>

      <div className="space-y-6">
        {/* Brand Colors */}
        <Card className="border-primary/20">
          <CardHeader>
            <CardTitle className="text-primary">Primary Brand Menu</CardTitle>
            <CardDescription>
              Menu bar using primary brand colors
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Menubar className="border-primary/20">
              <MenubarMenu>
                <MenubarTrigger className="data-[state=open]:bg-primary/10 data-[state=open]:text-primary">
                  Brand
                </MenubarTrigger>
                <MenubarContent className="border-primary/20">
                  <MenubarItem className="focus:bg-primary/10 focus:text-primary">
                    <Star className="mr-2 h-4 w-4" />
                    Primary Action
                  </MenubarItem>
                  <MenubarItem className="focus:bg-primary/10 focus:text-primary">
                    Brand Guidelines
                  </MenubarItem>
                  <MenubarSeparator className="bg-primary/20" />
                  <MenubarSub>
                    <MenubarSubTrigger className="focus:bg-primary/10 focus:text-primary">
                      Brand Assets
                    </MenubarSubTrigger>
                    <MenubarSubContent className="border-primary/20">
                      <MenubarItem>Logo Files</MenubarItem>
                      <MenubarItem>Color Palette</MenubarItem>
                      <MenubarItem>Typography</MenubarItem>
                    </MenubarSubContent>
                  </MenubarSub>
                </MenubarContent>
              </MenubarMenu>

              <MenubarMenu>
                <MenubarTrigger className="data-[state=open]:bg-secondary/10 data-[state=open]:text-secondary-foreground">
                  Secondary
                </MenubarTrigger>
                <MenubarContent>
                  <MenubarItem>Secondary Options</MenubarItem>
                  <MenubarItem>Support Tools</MenubarItem>
                </MenubarContent>
              </MenubarMenu>

              <MenubarMenu>
                <MenubarTrigger>Accent</MenubarTrigger>
                <MenubarContent>
                  <MenubarItem className="focus:bg-accent">
                    <Zap className="mr-2 h-4 w-4" />
                    Accent Feature
                  </MenubarItem>
                  <MenubarItem>Special Actions</MenubarItem>
                </MenubarContent>
              </MenubarMenu>
            </Menubar>
          </CardContent>
        </Card>

        {/* Semantic Colors */}
        <Card className="border-success/20">
          <CardHeader>
            <CardTitle className="text-success">Semantic States Menu</CardTitle>
            <CardDescription>
              Menu bar showcasing semantic color usage
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Menubar>
              <MenubarMenu>
                <MenubarTrigger>Actions</MenubarTrigger>
                <MenubarContent>
                  <MenubarItem className="focus:bg-success/10 focus:text-success">
                    <Trophy className="mr-2 h-4 w-4" />
                    Success Action
                  </MenubarItem>
                  <MenubarItem className="focus:bg-warning/10 focus:text-warning">
                    <Zap className="mr-2 h-4 w-4" />
                    Warning Action
                  </MenubarItem>
                  <MenubarItem
                    variant="destructive"
                    className="focus:bg-danger/10 focus:text-danger"
                  >
                    <Shield className="mr-2 h-4 w-4" />
                    Danger Action
                  </MenubarItem>
                  <MenubarSeparator />
                  <MenubarItem className="focus:bg-info/10 focus:text-info">
                    <Info className="mr-2 h-4 w-4" />
                    Information
                  </MenubarItem>
                  <MenubarItem className="focus:bg-discovery/10 focus:text-discovery">
                    <Star className="mr-2 h-4 w-4" />
                    Discovery
                  </MenubarItem>
                </MenubarContent>
              </MenubarMenu>

              <MenubarMenu>
                <MenubarTrigger>Status</MenubarTrigger>
                <MenubarContent>
                  <MenubarCheckboxItem checked className="focus:bg-success/10">
                    <Badge className="bg-success text-success-foreground mr-2">
                      Active
                    </Badge>
                    System Online
                  </MenubarCheckboxItem>
                  <MenubarCheckboxItem className="focus:bg-warning/10">
                    <Badge className="bg-warning text-warning-foreground mr-2">
                      Warning
                    </Badge>
                    Maintenance Mode
                  </MenubarCheckboxItem>
                  <MenubarCheckboxItem className="focus:bg-danger/10">
                    <Badge className="bg-danger text-danger-foreground mr-2">
                      Error
                    </Badge>
                    Service Offline
                  </MenubarCheckboxItem>
                </MenubarContent>
              </MenubarMenu>
            </Menubar>
          </CardContent>
        </Card>

        {/* Interactive States */}
        <Card>
          <CardHeader>
            <CardTitle>Interactive States & Tokens</CardTitle>
            <CardDescription>
              Demonstrating hover, focus, and active states
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <Menubar>
              <MenubarMenu>
                <MenubarTrigger>Interactive</MenubarTrigger>
                <MenubarContent>
                  <MenubarLabel>Hover & Focus States</MenubarLabel>
                  <MenubarSeparator />
                  <MenubarItem>
                    Normal Item
                    <MenubarShortcut>⌘N</MenubarShortcut>
                  </MenubarItem>
                  <MenubarItem disabled>
                    Disabled Item
                    <MenubarShortcut>⌘D</MenubarShortcut>
                  </MenubarItem>
                  <MenubarSeparator />
                  <MenubarCheckboxItem checked>
                    Checked Item
                  </MenubarCheckboxItem>
                  <MenubarCheckboxItem>Unchecked Item</MenubarCheckboxItem>
                  <MenubarSeparator />
                  <MenubarRadioGroup defaultValue="option1">
                    <MenubarRadioItem value="option1">
                      Radio Option 1
                    </MenubarRadioItem>
                    <MenubarRadioItem value="option2">
                      Radio Option 2
                    </MenubarRadioItem>
                  </MenubarRadioGroup>
                </MenubarContent>
              </MenubarMenu>

              <MenubarMenu>
                <MenubarTrigger>Nested</MenubarTrigger>
                <MenubarContent>
                  <MenubarSub>
                    <MenubarSubTrigger>Level 1</MenubarSubTrigger>
                    <MenubarSubContent>
                      <MenubarItem>Level 1 Item</MenubarItem>
                      <MenubarSub>
                        <MenubarSubTrigger>Level 2</MenubarSubTrigger>
                        <MenubarSubContent>
                          <MenubarItem>Level 2 Item</MenubarItem>
                          <MenubarItem>Deep Nested Item</MenubarItem>
                        </MenubarSubContent>
                      </MenubarSub>
                    </MenubarSubContent>
                  </MenubarSub>
                </MenubarContent>
              </MenubarMenu>
            </Menubar>

            <Separator />

            <div className="space-y-3">
              <h4 className="font-medium">CoreLive MenuBar Design Tokens</h4>
              <div className="grid grid-cols-1 gap-4 text-sm md:grid-cols-2">
                <div className="space-y-2">
                  <h5 className="font-medium">Background Colors</h5>
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <Badge variant="outline">--background</Badge>
                      <span className="text-muted-foreground">
                        Menu bar background
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge variant="outline">--popover</Badge>
                      <span className="text-muted-foreground">
                        Menu content background
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge variant="outline">--accent</Badge>
                      <span className="text-muted-foreground">
                        Hover/focus background
                      </span>
                    </div>
                  </div>
                </div>
                <div className="space-y-2">
                  <h5 className="font-medium">Text Colors</h5>
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <Badge variant="outline">--foreground</Badge>
                      <span className="text-muted-foreground">
                        Primary text color
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge variant="outline">--muted-foreground</Badge>
                      <span className="text-muted-foreground">
                        Secondary text color
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge variant="outline">--accent-foreground</Badge>
                      <span className="text-muted-foreground">
                        Focus text color
                      </span>
                    </div>
                  </div>
                </div>
                <div className="space-y-2">
                  <h5 className="font-medium">Border & Effects</h5>
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <Badge variant="outline">--border</Badge>
                      <span className="text-muted-foreground">
                        Border color
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge variant="outline">shadow-xs</Badge>
                      <span className="text-muted-foreground">
                        Menu bar shadow
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge variant="outline">shadow-md</Badge>
                      <span className="text-muted-foreground">
                        Menu content shadow
                      </span>
                    </div>
                  </div>
                </div>
                <div className="space-y-2">
                  <h5 className="font-medium">Animation Properties</h5>
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <Badge variant="outline">animate-in</Badge>
                      <span className="text-muted-foreground">
                        Menu entrance
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge variant="outline">fade-in-0</Badge>
                      <span className="text-muted-foreground">
                        Fade animation
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge variant="outline">zoom-in-95</Badge>
                      <span className="text-muted-foreground">
                        Scale animation
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  ),
}
