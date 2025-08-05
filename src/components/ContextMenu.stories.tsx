import type { Meta, StoryObj } from '@storybook/react'
import {
  Copy,
  Scissors,
  Clipboard,
  Undo,
  Redo,
  Download,
  Share,
  Edit,
  Trash2,
  File,
  Folder,
  Image,
  Plus,
  RotateCw,
  RotateCcw,
  ZoomIn,
  ZoomOut,
  Maximize,
  RefreshCw,
  Settings,
  Info,
  Star,
  Heart,
  Bookmark,
  Eye,
  EyeOff,
  Lock,
  Play,
  Pause,
  SkipForward,
  SkipBack,
  Volume1,
  Volume2,
  VolumeX,
  MousePointer,
  Hand,
  Move,
  Square,
  Circle,
  Triangle,
  Type,
  AlignLeft,
  AlignCenter,
  AlignRight,
  Bold,
  Italic,
  Underline,
  Link,
  Code,
  List,
  ListOrdered,
  Quote,
  Heading1,
  Heading2,
  Heading3,
  MoreHorizontal,
  Check,
  X,
  Archive,
  PinIcon as Pin,
  PinOff,
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
  ContextMenu,
  ContextMenuTrigger,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuCheckboxItem,
  ContextMenuRadioItem,
  ContextMenuLabel,
  ContextMenuSeparator,
  ContextMenuShortcut,
  ContextMenuSub,
  ContextMenuSubContent,
  ContextMenuSubTrigger,
  ContextMenuRadioGroup,
} from '@/components/ui/context-menu'

const meta: Meta<typeof ContextMenu> = {
  title: 'CoreLive Design System/Components/Context Menu',
  component: ContextMenu,
  parameters: {
    layout: 'centered',
    docs: {
      description: {
        component:
          'A context menu component triggered by right-clicking. Built with Radix UI and styled with CoreLive Design System tokens.',
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
    <ContextMenu>
      <ContextMenuTrigger className="flex h-[150px] w-[300px] items-center justify-center rounded-md border border-dashed text-sm">
        Right click here
      </ContextMenuTrigger>
      <ContextMenuContent className="w-64">
        <ContextMenuItem inset>
          <Copy className="mr-2 h-4 w-4" />
          Copy
          <ContextMenuShortcut>⌘C</ContextMenuShortcut>
        </ContextMenuItem>
        <ContextMenuItem inset>
          <Scissors className="mr-2 h-4 w-4" />
          Cut
          <ContextMenuShortcut>⌘X</ContextMenuShortcut>
        </ContextMenuItem>
        <ContextMenuItem inset>
          <Clipboard className="mr-2 h-4 w-4" />
          Paste
          <ContextMenuShortcut>⌘V</ContextMenuShortcut>
        </ContextMenuItem>
        <ContextMenuSeparator />
        <ContextMenuItem inset>
          <Undo className="mr-2 h-4 w-4" />
          Undo
          <ContextMenuShortcut>⌘Z</ContextMenuShortcut>
        </ContextMenuItem>
        <ContextMenuItem inset>
          <Redo className="mr-2 h-4 w-4" />
          Redo
          <ContextMenuShortcut>⇧⌘Z</ContextMenuShortcut>
        </ContextMenuItem>
      </ContextMenuContent>
    </ContextMenu>
  ),
}

export const WithCheckboxItems: Story = {
  args: {},
  render: () => {
    const [showStatusBar, setShowStatusBar] = useState(true)
    const [showActivityBar, setShowActivityBar] = useState(false)
    const [showPanel, setShowPanel] = useState(false)

    return (
      <ContextMenu>
        <ContextMenuTrigger className="flex h-[150px] w-[300px] items-center justify-center rounded-md border border-dashed text-sm">
          Right click to toggle views
        </ContextMenuTrigger>
        <ContextMenuContent className="w-64">
          <ContextMenuLabel>View Options</ContextMenuLabel>
          <ContextMenuSeparator />
          <ContextMenuCheckboxItem
            checked={showStatusBar}
            onCheckedChange={setShowStatusBar}
          >
            <Eye className="mr-2 h-4 w-4" />
            Status Bar
          </ContextMenuCheckboxItem>
          <ContextMenuCheckboxItem
            checked={showActivityBar}
            onCheckedChange={setShowActivityBar}
          >
            <Settings className="mr-2 h-4 w-4" />
            Activity Bar
          </ContextMenuCheckboxItem>
          <ContextMenuCheckboxItem
            checked={showPanel}
            onCheckedChange={setShowPanel}
          >
            <Maximize className="mr-2 h-4 w-4" />
            Panel
          </ContextMenuCheckboxItem>
          <ContextMenuSeparator />
          <ContextMenuItem inset>
            <RefreshCw className="mr-2 h-4 w-4" />
            Refresh
            <ContextMenuShortcut>⌘R</ContextMenuShortcut>
          </ContextMenuItem>
        </ContextMenuContent>
      </ContextMenu>
    )
  },
}

export const WithRadioItems: Story = {
  args: {},
  render: () => {
    const [theme, setTheme] = useState('light')

    return (
      <ContextMenu>
        <ContextMenuTrigger className="flex h-[150px] w-[300px] items-center justify-center rounded-md border border-dashed text-sm">
          Right click to change theme
        </ContextMenuTrigger>
        <ContextMenuContent className="w-56">
          <ContextMenuLabel>Appearance</ContextMenuLabel>
          <ContextMenuSeparator />
          <ContextMenuRadioGroup value={theme} onValueChange={setTheme}>
            <ContextMenuRadioItem value="light">Light</ContextMenuRadioItem>
            <ContextMenuRadioItem value="dark">Dark</ContextMenuRadioItem>
            <ContextMenuRadioItem value="system">System</ContextMenuRadioItem>
          </ContextMenuRadioGroup>
          <ContextMenuSeparator />
          <ContextMenuItem inset>
            <Settings className="mr-2 h-4 w-4" />
            More Settings...
          </ContextMenuItem>
        </ContextMenuContent>
      </ContextMenu>
    )
  },
}

export const WithSubmenus: Story = {
  args: {},
  render: () => (
    <ContextMenu>
      <ContextMenuTrigger className="flex h-[150px] w-[300px] items-center justify-center rounded-md border border-dashed text-sm">
        Right click for submenu
      </ContextMenuTrigger>
      <ContextMenuContent className="w-64">
        <ContextMenuItem inset>
          <Plus className="mr-2 h-4 w-4" />
          New Item
          <ContextMenuShortcut>⌘N</ContextMenuShortcut>
        </ContextMenuItem>
        <ContextMenuSub>
          <ContextMenuSubTrigger inset>
            <File className="mr-2 h-4 w-4" />
            New File
          </ContextMenuSubTrigger>
          <ContextMenuSubContent className="w-48">
            <ContextMenuItem>
              <File className="mr-2 h-4 w-4" />
              Text File
            </ContextMenuItem>
            <ContextMenuItem>
              <Code className="mr-2 h-4 w-4" />
              JavaScript File
            </ContextMenuItem>
            <ContextMenuItem>
              <Type className="mr-2 h-4 w-4" />
              TypeScript File
            </ContextMenuItem>
            <ContextMenuItem>
              <Image className="mr-2 h-4 w-4" />
              Image File
            </ContextMenuItem>
          </ContextMenuSubContent>
        </ContextMenuSub>
        <ContextMenuSub>
          <ContextMenuSubTrigger inset>
            <Folder className="mr-2 h-4 w-4" />
            New Folder
          </ContextMenuSubTrigger>
          <ContextMenuSubContent className="w-48">
            <ContextMenuItem>
              <Folder className="mr-2 h-4 w-4" />
              Regular Folder
            </ContextMenuItem>
            <ContextMenuItem>
              <Lock className="mr-2 h-4 w-4" />
              Private Folder
            </ContextMenuItem>
            <ContextMenuItem>
              <Share className="mr-2 h-4 w-4" />
              Shared Folder
            </ContextMenuItem>
          </ContextMenuSubContent>
        </ContextMenuSub>
        <ContextMenuSeparator />
        <ContextMenuItem inset>
          <Download className="mr-2 h-4 w-4" />
          Import
          <ContextMenuShortcut>⌘I</ContextMenuShortcut>
        </ContextMenuItem>
      </ContextMenuContent>
    </ContextMenu>
  ),
}

export const FileExplorer: Story = {
  args: {},
  render: () => {
    const [selectedFile, setSelectedFile] = useState('document.pdf')
    const [pinnedFiles, setPinnedFiles] = useState<string[]>(['important.txt'])
    const [favoritedFiles, setFavoritedFiles] = useState<string[]>([
      'project.md',
    ])

    const files = [
      { name: 'document.pdf', type: 'pdf', size: '2.3 MB' },
      { name: 'image.jpg', type: 'image', size: '890 KB' },
      { name: 'project.md', type: 'markdown', size: '12 KB' },
      { name: 'important.txt', type: 'text', size: '3 KB' },
    ]

    const togglePin = (fileName: string) => {
      setPinnedFiles((prev) =>
        prev.includes(fileName)
          ? prev.filter((f) => f !== fileName)
          : [...prev, fileName],
      )
    }

    const toggleFavorite = (fileName: string) => {
      setFavoritedFiles((prev) =>
        prev.includes(fileName)
          ? prev.filter((f) => f !== fileName)
          : [...prev, fileName],
      )
    }

    return (
      <div className="w-full max-w-md">
        <Card>
          <CardHeader>
            <CardTitle>File Explorer</CardTitle>
            <CardDescription>Right-click files for options</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {files.map((file) => (
                <ContextMenu key={file.name}>
                  <ContextMenuTrigger asChild>
                    <div
                      className={`hover:bg-muted/50 flex cursor-pointer items-center justify-between rounded-lg border p-3 transition-colors ${
                        selectedFile === file.name
                          ? 'border-primary bg-primary/5'
                          : ''
                      }`}
                      onClick={() => setSelectedFile(file.name)}
                    >
                      <div className="flex items-center gap-3">
                        <div className="flex items-center gap-2">
                          {file.type === 'pdf' && (
                            <File className="h-4 w-4 text-red-500" />
                          )}
                          {file.type === 'image' && (
                            <Image className="h-4 w-4 text-blue-500" />
                          )}
                          {file.type === 'markdown' && (
                            <Type className="h-4 w-4 text-green-500" />
                          )}
                          {file.type === 'text' && (
                            <File className="h-4 w-4 text-gray-500" />
                          )}
                          <span className="text-sm font-medium">
                            {file.name}
                          </span>
                        </div>
                        <div className="flex gap-1">
                          {pinnedFiles.includes(file.name) && (
                            <Pin className="text-primary h-3 w-3" />
                          )}
                          {favoritedFiles.includes(file.name) && (
                            <Heart className="h-3 w-3 fill-current text-red-500" />
                          )}
                        </div>
                      </div>
                      <Badge variant="secondary" className="text-xs">
                        {file.size}
                      </Badge>
                    </div>
                  </ContextMenuTrigger>
                  <ContextMenuContent className="w-64">
                    <ContextMenuItem>
                      <Eye className="mr-2 h-4 w-4" />
                      Open
                      <ContextMenuShortcut>⏎</ContextMenuShortcut>
                    </ContextMenuItem>
                    <ContextMenuItem>
                      <Edit className="mr-2 h-4 w-4" />
                      Edit
                      <ContextMenuShortcut>⌘E</ContextMenuShortcut>
                    </ContextMenuItem>
                    <ContextMenuSeparator />
                    <ContextMenuItem onClick={() => togglePin(file.name)}>
                      {pinnedFiles.includes(file.name) ? (
                        <>
                          <PinOff className="mr-2 h-4 w-4" />
                          Unpin
                        </>
                      ) : (
                        <>
                          <Pin className="mr-2 h-4 w-4" />
                          Pin to Top
                        </>
                      )}
                    </ContextMenuItem>
                    <ContextMenuItem onClick={() => toggleFavorite(file.name)}>
                      <Heart
                        className={`mr-2 h-4 w-4 ${favoritedFiles.includes(file.name) ? 'fill-current text-red-500' : ''}`}
                      />
                      {favoritedFiles.includes(file.name)
                        ? 'Remove from Favorites'
                        : 'Add to Favorites'}
                    </ContextMenuItem>
                    <ContextMenuItem>
                      <Bookmark className="mr-2 h-4 w-4" />
                      Add to Collection
                    </ContextMenuItem>
                    <ContextMenuSeparator />
                    <ContextMenuItem>
                      <Copy className="mr-2 h-4 w-4" />
                      Copy
                      <ContextMenuShortcut>⌘C</ContextMenuShortcut>
                    </ContextMenuItem>
                    <ContextMenuItem>
                      <Scissors className="mr-2 h-4 w-4" />
                      Cut
                      <ContextMenuShortcut>⌘X</ContextMenuShortcut>
                    </ContextMenuItem>
                    <ContextMenuSeparator />
                    <ContextMenuItem>
                      <Download className="mr-2 h-4 w-4" />
                      Download
                    </ContextMenuItem>
                    <ContextMenuItem>
                      <Share className="mr-2 h-4 w-4" />
                      Share
                    </ContextMenuItem>
                    <ContextMenuSeparator />
                    <ContextMenuItem>
                      <Archive className="mr-2 h-4 w-4" />
                      Archive
                    </ContextMenuItem>
                    <ContextMenuItem variant="destructive">
                      <Trash2 className="mr-2 h-4 w-4" />
                      Delete
                      <ContextMenuShortcut>⌫</ContextMenuShortcut>
                    </ContextMenuItem>
                  </ContextMenuContent>
                </ContextMenu>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>
    )
  },
}

export const ImageEditor: Story = {
  args: {},
  render: () => {
    const [tool, setTool] = useState('select')
    const [zoom, setZoom] = useState(100)

    return (
      <div className="w-full max-w-lg">
        <Card>
          <CardHeader>
            <CardTitle>Image Editor</CardTitle>
            <CardDescription>Right-click the canvas for tools</CardDescription>
          </CardHeader>
          <CardContent>
            <ContextMenu>
              <ContextMenuTrigger asChild>
                <div className="flex aspect-video cursor-crosshair items-center justify-center rounded-lg border bg-gradient-to-br from-blue-50 to-purple-50 dark:from-blue-950 dark:to-purple-950">
                  <div className="text-center">
                    <Image className="text-muted-foreground mx-auto mb-2 h-12 w-12" />
                    <p className="text-muted-foreground text-sm">
                      Right-click for tools
                    </p>
                    <p className="text-muted-foreground mt-1 text-xs">
                      Zoom: {zoom}%
                    </p>
                  </div>
                </div>
              </ContextMenuTrigger>
              <ContextMenuContent className="w-64">
                <ContextMenuLabel>Tools</ContextMenuLabel>
                <ContextMenuSeparator />
                <ContextMenuRadioGroup value={tool} onValueChange={setTool}>
                  <ContextMenuRadioItem value="select">
                    <MousePointer className="mr-2 h-4 w-4" />
                    Select Tool
                  </ContextMenuRadioItem>
                  <ContextMenuRadioItem value="move">
                    <Move className="mr-2 h-4 w-4" />
                    Move Tool
                  </ContextMenuRadioItem>
                  <ContextMenuRadioItem value="hand">
                    <Hand className="mr-2 h-4 w-4" />
                    Hand Tool
                  </ContextMenuRadioItem>
                </ContextMenuRadioGroup>
                <ContextMenuSeparator />
                <ContextMenuSub>
                  <ContextMenuSubTrigger>
                    <Square className="mr-2 h-4 w-4" />
                    Draw Shapes
                  </ContextMenuSubTrigger>
                  <ContextMenuSubContent className="w-48">
                    <ContextMenuItem>
                      <Square className="mr-2 h-4 w-4" />
                      Rectangle
                    </ContextMenuItem>
                    <ContextMenuItem>
                      <Circle className="mr-2 h-4 w-4" />
                      Circle
                    </ContextMenuItem>
                    <ContextMenuItem>
                      <Triangle className="mr-2 h-4 w-4" />
                      Triangle
                    </ContextMenuItem>
                  </ContextMenuSubContent>
                </ContextMenuSub>
                <ContextMenuSeparator />
                <ContextMenuItem
                  onClick={() => setZoom(Math.min(zoom + 25, 400))}
                >
                  <ZoomIn className="mr-2 h-4 w-4" />
                  Zoom In
                  <ContextMenuShortcut>⌘+</ContextMenuShortcut>
                </ContextMenuItem>
                <ContextMenuItem
                  onClick={() => setZoom(Math.max(zoom - 25, 25))}
                >
                  <ZoomOut className="mr-2 h-4 w-4" />
                  Zoom Out
                  <ContextMenuShortcut>⌘-</ContextMenuShortcut>
                </ContextMenuItem>
                <ContextMenuItem onClick={() => setZoom(100)}>
                  <RefreshCw className="mr-2 h-4 w-4" />
                  Reset Zoom
                  <ContextMenuShortcut>⌘0</ContextMenuShortcut>
                </ContextMenuItem>
                <ContextMenuSeparator />
                <ContextMenuItem>
                  <RotateCw className="mr-2 h-4 w-4" />
                  Rotate Right
                </ContextMenuItem>
                <ContextMenuItem>
                  <RotateCcw className="mr-2 h-4 w-4" />
                  Rotate Left
                </ContextMenuItem>
              </ContextMenuContent>
            </ContextMenu>
          </CardContent>
        </Card>
      </div>
    )
  },
}

export const TextEditor: Story = {
  args: {},
  render: () => {
    const [formatting, setFormatting] = useState({
      bold: false,
      italic: false,
      underline: false,
    })
    const [alignment, setAlignment] = useState('left')

    return (
      <div className="w-full max-w-lg">
        <Card>
          <CardHeader>
            <CardTitle>Text Editor</CardTitle>
            <CardDescription>
              Right-click text for formatting options
            </CardDescription>
          </CardHeader>
          <CardContent>
            <ContextMenu>
              <ContextMenuTrigger asChild>
                <div
                  className="focus:ring-primary/20 min-h-[200px] cursor-text rounded-lg border p-4 focus:ring-2 focus:outline-none"
                  contentEditable
                  suppressContentEditableWarning
                  style={{
                    fontWeight: formatting.bold ? 'bold' : 'normal',
                    fontStyle: formatting.italic ? 'italic' : 'normal',
                    textDecoration: formatting.underline ? 'underline' : 'none',
                    textAlign: alignment as any,
                  }}
                >
                  This is sample text. Right-click to see formatting options.
                  You can select text and apply different styles using the
                  context menu.
                </div>
              </ContextMenuTrigger>
              <ContextMenuContent className="w-64">
                <ContextMenuLabel>Text Formatting</ContextMenuLabel>
                <ContextMenuSeparator />
                <ContextMenuCheckboxItem
                  checked={formatting.bold}
                  onCheckedChange={(checked) =>
                    setFormatting((prev) => ({ ...prev, bold: checked }))
                  }
                >
                  <Bold className="mr-2 h-4 w-4" />
                  Bold
                  <ContextMenuShortcut>⌘B</ContextMenuShortcut>
                </ContextMenuCheckboxItem>
                <ContextMenuCheckboxItem
                  checked={formatting.italic}
                  onCheckedChange={(checked) =>
                    setFormatting((prev) => ({ ...prev, italic: checked }))
                  }
                >
                  <Italic className="mr-2 h-4 w-4" />
                  Italic
                  <ContextMenuShortcut>⌘I</ContextMenuShortcut>
                </ContextMenuCheckboxItem>
                <ContextMenuCheckboxItem
                  checked={formatting.underline}
                  onCheckedChange={(checked) =>
                    setFormatting((prev) => ({ ...prev, underline: checked }))
                  }
                >
                  <Underline className="mr-2 h-4 w-4" />
                  Underline
                  <ContextMenuShortcut>⌘U</ContextMenuShortcut>
                </ContextMenuCheckboxItem>
                <ContextMenuSeparator />
                <ContextMenuLabel>Alignment</ContextMenuLabel>
                <ContextMenuRadioGroup
                  value={alignment}
                  onValueChange={setAlignment}
                >
                  <ContextMenuRadioItem value="left">
                    <AlignLeft className="mr-2 h-4 w-4" />
                    Align Left
                  </ContextMenuRadioItem>
                  <ContextMenuRadioItem value="center">
                    <AlignCenter className="mr-2 h-4 w-4" />
                    Align Center
                  </ContextMenuRadioItem>
                  <ContextMenuRadioItem value="right">
                    <AlignRight className="mr-2 h-4 w-4" />
                    Align Right
                  </ContextMenuRadioItem>
                </ContextMenuRadioGroup>
                <ContextMenuSeparator />
                <ContextMenuSub>
                  <ContextMenuSubTrigger>
                    <Heading1 className="mr-2 h-4 w-4" />
                    Insert Heading
                  </ContextMenuSubTrigger>
                  <ContextMenuSubContent className="w-48">
                    <ContextMenuItem>
                      <Heading1 className="mr-2 h-4 w-4" />
                      Heading 1
                    </ContextMenuItem>
                    <ContextMenuItem>
                      <Heading2 className="mr-2 h-4 w-4" />
                      Heading 2
                    </ContextMenuItem>
                    <ContextMenuItem>
                      <Heading3 className="mr-2 h-4 w-4" />
                      Heading 3
                    </ContextMenuItem>
                  </ContextMenuSubContent>
                </ContextMenuSub>
                <ContextMenuItem>
                  <List className="mr-2 h-4 w-4" />
                  Bullet List
                </ContextMenuItem>
                <ContextMenuItem>
                  <ListOrdered className="mr-2 h-4 w-4" />
                  Numbered List
                </ContextMenuItem>
                <ContextMenuItem>
                  <Quote className="mr-2 h-4 w-4" />
                  Quote
                </ContextMenuItem>
                <ContextMenuSeparator />
                <ContextMenuItem>
                  <Link className="mr-2 h-4 w-4" />
                  Insert Link
                  <ContextMenuShortcut>⌘K</ContextMenuShortcut>
                </ContextMenuItem>
                <ContextMenuItem>
                  <Code className="mr-2 h-4 w-4" />
                  Code Block
                </ContextMenuItem>
              </ContextMenuContent>
            </ContextMenu>
          </CardContent>
        </Card>
      </div>
    )
  },
}

export const MediaPlayer: Story = {
  args: {},
  render: () => {
    const [isPlaying, setIsPlaying] = useState(false)
    const [volume, setVolume] = useState('medium')

    return (
      <div className="w-full max-w-md">
        <Card>
          <CardHeader>
            <CardTitle>Media Player</CardTitle>
            <CardDescription>Right-click for playback controls</CardDescription>
          </CardHeader>
          <CardContent>
            <ContextMenu>
              <ContextMenuTrigger asChild>
                <div className="relative flex aspect-video cursor-pointer items-center justify-center rounded-lg bg-black">
                  <div className="text-center text-white">
                    {isPlaying ? (
                      <Pause className="mb-2 h-16 w-16" />
                    ) : (
                      <Play className="mb-2 h-16 w-16" />
                    )}
                    <p className="text-sm opacity-75">
                      Right-click for controls
                    </p>
                  </div>
                  <div className="absolute right-2 bottom-2">
                    <Badge variant="secondary" className="text-xs">
                      {isPlaying ? 'Playing' : 'Paused'}
                    </Badge>
                  </div>
                </div>
              </ContextMenuTrigger>
              <ContextMenuContent className="w-56">
                <ContextMenuItem onClick={() => setIsPlaying(!isPlaying)}>
                  {isPlaying ? (
                    <>
                      <Pause className="mr-2 h-4 w-4" />
                      Pause
                      <ContextMenuShortcut>Space</ContextMenuShortcut>
                    </>
                  ) : (
                    <>
                      <Play className="mr-2 h-4 w-4" />
                      Play
                      <ContextMenuShortcut>Space</ContextMenuShortcut>
                    </>
                  )}
                </ContextMenuItem>
                <ContextMenuItem>
                  <SkipBack className="mr-2 h-4 w-4" />
                  Previous
                  <ContextMenuShortcut>←</ContextMenuShortcut>
                </ContextMenuItem>
                <ContextMenuItem>
                  <SkipForward className="mr-2 h-4 w-4" />
                  Next
                  <ContextMenuShortcut>→</ContextMenuShortcut>
                </ContextMenuItem>
                <ContextMenuSeparator />
                <ContextMenuLabel>Volume</ContextMenuLabel>
                <ContextMenuRadioGroup value={volume} onValueChange={setVolume}>
                  <ContextMenuRadioItem value="mute">
                    <VolumeX className="mr-2 h-4 w-4" />
                    Mute
                  </ContextMenuRadioItem>
                  <ContextMenuRadioItem value="low">
                    <Volume1 className="mr-2 h-4 w-4" />
                    Low
                  </ContextMenuRadioItem>
                  <ContextMenuRadioItem value="medium">
                    <Volume2 className="mr-2 h-4 w-4" />
                    Medium
                  </ContextMenuRadioItem>
                  <ContextMenuRadioItem value="high">
                    <Volume2 className="mr-2 h-4 w-4" />
                    High
                  </ContextMenuRadioItem>
                </ContextMenuRadioGroup>
                <ContextMenuSeparator />
                <ContextMenuItem>
                  <Download className="mr-2 h-4 w-4" />
                  Download
                </ContextMenuItem>
                <ContextMenuItem>
                  <Share className="mr-2 h-4 w-4" />
                  Share
                </ContextMenuItem>
                <ContextMenuItem>
                  <Info className="mr-2 h-4 w-4" />
                  Media Info
                </ContextMenuItem>
              </ContextMenuContent>
            </ContextMenu>
          </CardContent>
        </Card>
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
          Context Menu Variants
        </h3>
        <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
          <div>
            <p className="text-muted-foreground mb-4 text-sm">Basic Menu</p>
            <ContextMenu>
              <ContextMenuTrigger className="flex h-[100px] w-full items-center justify-center rounded-md border border-dashed text-sm">
                Right click here
              </ContextMenuTrigger>
              <ContextMenuContent className="w-48">
                <ContextMenuItem>
                  <Copy className="mr-2 h-4 w-4" />
                  Copy
                </ContextMenuItem>
                <ContextMenuItem>
                  <Clipboard className="mr-2 h-4 w-4" />
                  Paste
                </ContextMenuItem>
                <ContextMenuSeparator />
                <ContextMenuItem variant="destructive">
                  <Trash2 className="mr-2 h-4 w-4" />
                  Delete
                </ContextMenuItem>
              </ContextMenuContent>
            </ContextMenu>
          </div>

          <div>
            <p className="text-muted-foreground mb-4 text-sm">With Shortcuts</p>
            <ContextMenu>
              <ContextMenuTrigger className="flex h-[100px] w-full items-center justify-center rounded-md border border-dashed text-sm">
                Right click here
              </ContextMenuTrigger>
              <ContextMenuContent className="w-48">
                <ContextMenuItem>
                  <Copy className="mr-2 h-4 w-4" />
                  Copy
                  <ContextMenuShortcut>⌘C</ContextMenuShortcut>
                </ContextMenuItem>
                <ContextMenuItem>
                  <Clipboard className="mr-2 h-4 w-4" />
                  Paste
                  <ContextMenuShortcut>⌘V</ContextMenuShortcut>
                </ContextMenuItem>
              </ContextMenuContent>
            </ContextMenu>
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
            <ContextMenu>
              <ContextMenuTrigger className="flex h-[100px] w-full items-center justify-center rounded-md border border-dashed text-sm">
                Toggle options
              </ContextMenuTrigger>
              <ContextMenuContent className="w-48">
                <ContextMenuCheckboxItem defaultChecked>
                  <Eye className="mr-2 h-4 w-4" />
                  Show Grid
                </ContextMenuCheckboxItem>
                <ContextMenuCheckboxItem>
                  <Lock className="mr-2 h-4 w-4" />
                  Lock Layer
                </ContextMenuCheckboxItem>
                <ContextMenuCheckboxItem defaultChecked>
                  <Star className="mr-2 h-4 w-4" />
                  Show Guides
                </ContextMenuCheckboxItem>
              </ContextMenuContent>
            </ContextMenu>
          </div>

          <div>
            <p className="text-muted-foreground mb-4 text-sm">Radio Items</p>
            <ContextMenu>
              <ContextMenuTrigger className="flex h-[100px] w-full items-center justify-center rounded-md border border-dashed text-sm">
                Select option
              </ContextMenuTrigger>
              <ContextMenuContent className="w-48">
                <ContextMenuRadioGroup defaultValue="medium">
                  <ContextMenuRadioItem value="small">
                    Small
                  </ContextMenuRadioItem>
                  <ContextMenuRadioItem value="medium">
                    Medium
                  </ContextMenuRadioItem>
                  <ContextMenuRadioItem value="large">
                    Large
                  </ContextMenuRadioItem>
                </ContextMenuRadioGroup>
              </ContextMenuContent>
            </ContextMenu>
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
            <ContextMenu>
              <ContextMenuTrigger className="border-success/20 text-success flex h-[80px] w-full items-center justify-center rounded-md border text-sm">
                Right click
              </ContextMenuTrigger>
              <ContextMenuContent className="w-48">
                <ContextMenuItem>
                  <Check className="text-success mr-2 h-4 w-4" />
                  Complete Task
                </ContextMenuItem>
                <ContextMenuItem>
                  <Star className="text-success mr-2 h-4 w-4" />
                  Mark as Favorite
                </ContextMenuItem>
              </ContextMenuContent>
            </ContextMenu>
          </div>

          <div className="border-warning/20 rounded-lg border p-4">
            <p className="text-warning mb-3 text-sm font-medium">
              Warning Actions
            </p>
            <ContextMenu>
              <ContextMenuTrigger className="border-warning/20 text-warning flex h-[80px] w-full items-center justify-center rounded-md border text-sm">
                Right click
              </ContextMenuTrigger>
              <ContextMenuContent className="w-48">
                <ContextMenuItem>
                  <Archive className="text-warning mr-2 h-4 w-4" />
                  Archive Item
                </ContextMenuItem>
                <ContextMenuItem>
                  <EyeOff className="text-warning mr-2 h-4 w-4" />
                  Hide Item
                </ContextMenuItem>
              </ContextMenuContent>
            </ContextMenu>
          </div>

          <div className="border-danger/20 rounded-lg border p-4">
            <p className="text-danger mb-3 text-sm font-medium">
              Destructive Actions
            </p>
            <ContextMenu>
              <ContextMenuTrigger className="border-danger/20 text-danger flex h-[80px] w-full items-center justify-center rounded-md border text-sm">
                Right click
              </ContextMenuTrigger>
              <ContextMenuContent className="w-48">
                <ContextMenuItem variant="destructive">
                  <Trash2 className="mr-2 h-4 w-4" />
                  Delete Permanently
                </ContextMenuItem>
                <ContextMenuItem variant="destructive">
                  <X className="mr-2 h-4 w-4" />
                  Remove Access
                </ContextMenuItem>
              </ContextMenuContent>
            </ContextMenu>
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
                  Custom context menu using component tokens
                </p>
                <ContextMenu>
                  <ContextMenuTrigger
                    className="flex h-[120px] w-full items-center justify-center rounded-md border text-sm"
                    style={{
                      borderColor:
                        'var(--component-context-menu-trigger-border)',
                      backgroundColor:
                        'var(--component-context-menu-trigger-background)',
                    }}
                  >
                    Right click for custom styled menu
                  </ContextMenuTrigger>
                  <ContextMenuContent
                    className="w-56"
                    style={{
                      backgroundColor:
                        'var(--component-context-menu-background)',
                      borderColor: 'var(--component-context-menu-border)',
                      color: 'var(--component-context-menu-text)',
                    }}
                  >
                    <ContextMenuLabel
                      style={{
                        color: 'var(--component-context-menu-label-text)',
                      }}
                    >
                      Custom Styling
                    </ContextMenuLabel>
                    <ContextMenuSeparator
                      style={{
                        backgroundColor:
                          'var(--component-context-menu-separator)',
                      }}
                    />
                    <ContextMenuItem
                      style={
                        {
                          '--context-menu-item-hover-bg':
                            'var(--component-context-menu-item-hover-background)',
                          '--context-menu-item-hover-text':
                            'var(--component-context-menu-item-hover-text)',
                        } as React.CSSProperties
                      }
                    >
                      <Settings className="mr-2 h-4 w-4" />
                      Custom Item
                    </ContextMenuItem>
                    <ContextMenuItem>
                      <Info className="mr-2 h-4 w-4" />
                      Another Item
                      <ContextMenuShortcut
                        style={{
                          color: 'var(--component-context-menu-shortcut-text)',
                        }}
                      >
                        ⌘I
                      </ContextMenuShortcut>
                    </ContextMenuItem>
                  </ContextMenuContent>
                </ContextMenu>
              </div>

              <div className="bg-muted rounded-md p-3">
                <code className="text-xs">
                  --component-context-menu-background
                  <br />
                  --component-context-menu-border
                  <br />
                  --component-context-menu-text
                  <br />
                  --component-context-menu-item-hover-background
                  <br />
                  --component-context-menu-item-hover-text
                  <br />
                  --component-context-menu-separator
                  <br />
                  --component-context-menu-label-text
                  <br />
                  --component-context-menu-shortcut-text
                  <br />
                  --component-context-menu-trigger-background
                  <br />
                  --component-context-menu-trigger-border
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
            <ContextMenu>
              <ContextMenuTrigger className="flex h-[100px] w-full items-center justify-center rounded-md border border-dashed text-sm">
                Nested menu example
              </ContextMenuTrigger>
              <ContextMenuContent className="w-56">
                <ContextMenuItem>
                  <File className="mr-2 h-4 w-4" />
                  New Document
                </ContextMenuItem>
                <ContextMenuSub>
                  <ContextMenuSubTrigger>
                    <Folder className="mr-2 h-4 w-4" />
                    Open Recent
                  </ContextMenuSubTrigger>
                  <ContextMenuSubContent className="w-48">
                    <ContextMenuItem>Document 1.pdf</ContextMenuItem>
                    <ContextMenuItem>Project Files</ContextMenuItem>
                    <ContextMenuItem>Images Folder</ContextMenuItem>
                    <ContextMenuSeparator />
                    <ContextMenuItem>
                      <MoreHorizontal className="mr-2 h-4 w-4" />
                      More...
                    </ContextMenuItem>
                  </ContextMenuSubContent>
                </ContextMenuSub>
                <ContextMenuSeparator />
                <ContextMenuItem>
                  <Settings className="mr-2 h-4 w-4" />
                  Preferences
                </ContextMenuItem>
              </ContextMenuContent>
            </ContextMenu>
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
          'Comprehensive showcase of context menu variations using CoreLive Design System tokens for consistent right-click interactions across different contexts.',
      },
    },
  },
}
