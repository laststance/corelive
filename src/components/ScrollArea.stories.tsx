import type { Meta, StoryObj } from '@storybook/react'
import {
  File,
  Folder,
  FolderOpen,
  Image,
  FileText,
  Video,
  Music,
  Download,
  Star,
  Search,
  MoreHorizontal,
  Send,
  ChevronRight,
  ChevronDown,
  Info,
  Eye,
  Mail,
  MessageSquare,
  Bell,
  Heart,
  Share,
  Bookmark,
  ThumbsUp,
  Reply,
} from 'lucide-react'
import { useState, useRef, useEffect } from 'react'

import { Avatar, AvatarFallback } from '@/components/ui/avatar'
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
import { ScrollArea, ScrollBar } from '@/components/ui/scroll-area'
import { Separator } from '@/components/ui/separator'

const meta: Meta<typeof ScrollArea> = {
  title: 'Components/ScrollArea',
  component: ScrollArea,
  parameters: {
    layout: 'centered',
    docs: {
      description: {
        component:
          'Custom styled scrollable area built on Radix UI with enhanced visual scrollbars.',
      },
    },
  },
  tags: ['autodocs'],
}

export default meta
type Story = StoryObj<typeof ScrollArea>

export const Default: Story = {
  args: {},
  render: () => (
    <Card className="w-96">
      <CardHeader>
        <CardTitle>Scrollable Content</CardTitle>
        <CardDescription>
          Basic scroll area with vertical scrolling
        </CardDescription>
      </CardHeader>
      <CardContent className="p-0">
        <ScrollArea className="h-72 p-4">
          <div className="space-y-4">
            {Array.from({ length: 50 }, (_, i) => (
              <div key={i} className="flex items-center space-x-4">
                <div className="bg-muted flex h-10 w-10 items-center justify-center rounded-full">
                  <span className="text-sm font-medium">{i + 1}</span>
                </div>
                <div className="flex-1">
                  <p className="text-sm font-medium">Item {i + 1}</p>
                  <p className="text-muted-foreground text-xs">
                    This is a scrollable item with some description text
                  </p>
                </div>
              </div>
            ))}
          </div>
        </ScrollArea>
      </CardContent>
    </Card>
  ),
}

export const HorizontalScroll: Story = {
  args: {},
  render: () => (
    <Card className="w-full max-w-2xl">
      <CardHeader>
        <CardTitle>Horizontal Scrolling</CardTitle>
        <CardDescription>
          Scroll area with horizontal overflow content
        </CardDescription>
      </CardHeader>
      <CardContent className="p-0">
        <ScrollArea className="w-full whitespace-nowrap">
          <div className="flex w-max space-x-4 p-4">
            {Array.from({ length: 20 }, (_, i) => (
              <Card key={i} className="w-64 flex-shrink-0">
                <CardContent className="p-4">
                  <div className="flex items-center space-x-3">
                    <div className="bg-primary flex h-12 w-12 items-center justify-center rounded-lg">
                      <Image className="text-primary-foreground h-6 w-6" />
                    </div>
                    <div>
                      <h4 className="font-semibold">Card {i + 1}</h4>
                      <p className="text-muted-foreground text-sm">
                        Description for card {i + 1}
                      </p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
          <ScrollBar orientation="horizontal" />
        </ScrollArea>
      </CardContent>
    </Card>
  ),
}

export const BothDirections: Story = {
  args: {},
  render: () => (
    <Card className="w-full max-w-2xl">
      <CardHeader>
        <CardTitle>Two-Directional Scrolling</CardTitle>
        <CardDescription>
          Scroll area with both horizontal and vertical scrolling
        </CardDescription>
      </CardHeader>
      <CardContent className="p-0">
        <ScrollArea className="h-80 w-full">
          <div className="p-4">
            <table className="w-full min-w-[800px]">
              <thead>
                <tr className="border-b">
                  {Array.from({ length: 8 }, (_, i) => (
                    <th
                      key={i}
                      className="min-w-[120px] p-2 text-left font-semibold"
                    >
                      Column {i + 1}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {Array.from({ length: 30 }, (_, rowIndex) => (
                  <tr key={rowIndex} className="hover:bg-muted/50 border-b">
                    {Array.from({ length: 8 }, (_, colIndex) => (
                      <td key={colIndex} className="p-2">
                        <div className="flex items-center space-x-2">
                          <Badge variant="outline" className="text-xs">
                            R{rowIndex + 1}C{colIndex + 1}
                          </Badge>
                          <span className="text-sm">
                            Data {rowIndex + 1}.{colIndex + 1}
                          </span>
                        </div>
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <ScrollBar orientation="horizontal" />
        </ScrollArea>
      </CardContent>
    </Card>
  ),
}

export const ChatInterface: Story = {
  args: {},
  render: () => {
    const [messages, setMessages] = useState([
      {
        id: 1,
        user: 'Alice',
        message: "Hey everyone! How's it going?",
        time: '10:30 AM',
        type: 'received',
      },
      {
        id: 2,
        user: 'You',
        message: 'Hi Alice! Going well, thanks for asking 😊',
        time: '10:31 AM',
        type: 'sent',
      },
      {
        id: 3,
        user: 'Bob',
        message: 'Great to see everyone here!',
        time: '10:32 AM',
        type: 'received',
      },
      {
        id: 4,
        user: 'You',
        message: 'Absolutely! This chat interface looks really clean',
        time: '10:33 AM',
        type: 'sent',
      },
      {
        id: 5,
        user: 'Alice',
        message: 'I love the scrolling functionality',
        time: '10:34 AM',
        type: 'received',
      },
      {
        id: 6,
        user: 'Charlie',
        message: 'The design system integration is seamless',
        time: '10:35 AM',
        type: 'received',
      },
      {
        id: 7,
        user: 'You',
        message:
          'Thanks! The CoreLive tokens make it easy to maintain consistency',
        time: '10:36 AM',
        type: 'sent',
      },
      {
        id: 8,
        user: 'Bob',
        message: 'Can we see more examples of the scroll area component?',
        time: '10:37 AM',
        type: 'received',
      },
      {
        id: 9,
        user: 'You',
        message:
          'Sure! There are several stories showcasing different use cases',
        time: '10:38 AM',
        type: 'sent',
      },
      {
        id: 10,
        user: 'Alice',
        message: 'This is perfect for our messaging feature',
        time: '10:39 AM',
        type: 'received',
      },
    ])

    const [newMessage, setNewMessage] = useState('')
    const scrollAreaRef = useRef<HTMLDivElement>(null)

    const addMessage = () => {
      if (newMessage.trim()) {
        setMessages((prev) => [
          ...prev,
          {
            id: Date.now(),
            user: 'You',
            message: newMessage,
            time: new Date().toLocaleTimeString([], {
              hour: '2-digit',
              minute: '2-digit',
            }),
            type: 'sent',
          },
        ])
        setNewMessage('')
      }
    }

    useEffect(() => {
      const scrollElement = scrollAreaRef.current?.querySelector(
        '[data-slot="scroll-area-viewport"]',
      )
      if (scrollElement) {
        scrollElement.scrollTop = scrollElement.scrollHeight
      }
    }, [messages])

    return (
      <Card className="w-full max-w-md">
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2">
            <MessageSquare className="h-5 w-5" />
            Team Chat
          </CardTitle>
          <CardDescription>
            Chat interface with auto-scrolling to latest messages
          </CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          <ScrollArea ref={scrollAreaRef} className="h-80 px-4">
            <div className="space-y-4 pb-4">
              {messages.map((msg) => (
                <div
                  key={msg.id}
                  className={`flex ${msg.type === 'sent' ? 'justify-end' : 'justify-start'}`}
                >
                  <div
                    className={`flex max-w-[80%] items-start space-x-2 ${msg.type === 'sent' ? 'flex-row-reverse space-x-reverse' : ''}`}
                  >
                    <Avatar className="h-8 w-8">
                      <AvatarFallback className="text-xs">
                        {msg.user === 'You'
                          ? 'ME'
                          : msg.user.slice(0, 2).toUpperCase()}
                      </AvatarFallback>
                    </Avatar>
                    <div
                      className={`${msg.type === 'sent' ? 'items-end' : 'items-start'} flex flex-col`}
                    >
                      <div
                        className={`rounded-lg px-3 py-2 ${
                          msg.type === 'sent'
                            ? 'bg-primary text-primary-foreground'
                            : 'bg-muted'
                        }`}
                      >
                        <p className="text-sm">{msg.message}</p>
                      </div>
                      <div className="mt-1 flex items-center gap-1">
                        <span className="text-muted-foreground text-xs">
                          {msg.user}
                        </span>
                        <span className="text-muted-foreground text-xs">•</span>
                        <span className="text-muted-foreground text-xs">
                          {msg.time}
                        </span>
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </ScrollArea>

          <div className="border-t p-4">
            <div className="flex items-center space-x-2">
              <Input
                placeholder="Type a message..."
                value={newMessage}
                onChange={(e) => setNewMessage(e.target.value)}
                onKeyPress={(e) => e.key === 'Enter' && addMessage()}
                className="flex-1"
              />
              <Button size="sm" onClick={addMessage}>
                <Send className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>
    )
  },
}

export const FileExplorer: Story = {
  args: {},
  render: () => {
    const [expandedFolders, setExpandedFolders] = useState<Set<string>>(
      new Set(['documents', 'projects']),
    )

    const toggleFolder = (folderId: string) => {
      const newExpanded = new Set(expandedFolders)
      if (newExpanded.has(folderId)) {
        newExpanded.delete(folderId)
      } else {
        newExpanded.add(folderId)
      }
      setExpandedFolders(newExpanded)
    }

    const fileTree = [
      {
        id: 'documents',
        name: 'Documents',
        type: 'folder',
        children: [
          { id: 'readme', name: 'README.md', type: 'file', icon: FileText },
          { id: 'notes', name: 'notes.txt', type: 'file', icon: FileText },
          {
            id: 'images',
            name: 'Images',
            type: 'folder',
            children: [
              { id: 'avatar', name: 'avatar.png', type: 'file', icon: Image },
              { id: 'banner', name: 'banner.jpg', type: 'file', icon: Image },
              { id: 'logo', name: 'logo.svg', type: 'file', icon: Image },
            ],
          },
        ],
      },
      {
        id: 'projects',
        name: 'Projects',
        type: 'folder',
        children: [
          {
            id: 'website',
            name: 'Website',
            type: 'folder',
            children: [
              { id: 'index', name: 'index.html', type: 'file', icon: File },
              { id: 'styles', name: 'styles.css', type: 'file', icon: File },
              { id: 'script', name: 'script.js', type: 'file', icon: File },
            ],
          },
          { id: 'app', name: 'mobile-app.zip', type: 'file', icon: Download },
        ],
      },
      {
        id: 'media',
        name: 'Media',
        type: 'folder',
        children: [
          { id: 'video1', name: 'presentation.mp4', type: 'file', icon: Video },
          { id: 'audio1', name: 'podcast.mp3', type: 'file', icon: Music },
          { id: 'video2', name: 'demo.mov', type: 'file', icon: Video },
        ],
      },
    ]

    const renderFileTree = (items: any[], depth = 0) => {
      return items.map((item) => (
        <div key={item.id}>
          <div
            className={`hover:bg-muted flex cursor-pointer items-center gap-2 rounded p-1`}
            style={{ paddingLeft: `${depth * 16 + 8}px` }}
            onClick={() => item.type === 'folder' && toggleFolder(item.id)}
          >
            {item.type === 'folder' ? (
              <>
                {expandedFolders.has(item.id) ? (
                  <ChevronDown className="h-3 w-3" />
                ) : (
                  <ChevronRight className="h-3 w-3" />
                )}
                {expandedFolders.has(item.id) ? (
                  <FolderOpen className="h-4 w-4 text-blue-600" />
                ) : (
                  <Folder className="h-4 w-4 text-blue-600" />
                )}
              </>
            ) : (
              <>
                <div className="w-3" /> {/* Spacer for alignment */}
                <item.icon className="text-muted-foreground h-4 w-4" />
              </>
            )}
            <span className="text-sm">{item.name}</span>
            {item.type === 'file' && (
              <Badge variant="outline" className="ml-auto text-xs">
                {Math.floor(Math.random() * 100) + 1}KB
              </Badge>
            )}
          </div>
          {item.type === 'folder' &&
            expandedFolders.has(item.id) &&
            item.children && (
              <div>{renderFileTree(item.children, depth + 1)}</div>
            )}
        </div>
      ))
    }

    return (
      <Card className="w-80">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Folder className="h-5 w-5" />
            File Explorer
          </CardTitle>
          <CardDescription>
            Nested scrollable file browser with expandable folders
          </CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          <div className="border-b p-4">
            <div className="flex items-center space-x-2">
              <Search className="text-muted-foreground h-4 w-4" />
              <Input placeholder="Search files..." className="h-8" />
            </div>
          </div>

          <ScrollArea className="h-96">
            <div className="p-2">{renderFileTree(fileTree)}</div>
          </ScrollArea>

          <div className="border-t p-4">
            <div className="text-muted-foreground flex items-center justify-between text-xs">
              <span>23 items</span>
              <span>156 MB total</span>
            </div>
          </div>
        </CardContent>
      </Card>
    )
  },
}

export const DocumentViewer: Story = {
  args: {},
  render: () => (
    <Card className="w-full max-w-4xl">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <FileText className="h-5 w-5" />
          Document Viewer
        </CardTitle>
        <CardDescription>
          Long-form content viewer with custom scrollbars
        </CardDescription>
      </CardHeader>
      <CardContent className="p-0">
        <div className="flex">
          {/* Table of Contents */}
          <div className="w-64 border-r">
            <div className="border-b p-4">
              <h3 className="font-semibold">Table of Contents</h3>
            </div>
            <ScrollArea className="h-96">
              <div className="space-y-2 p-4">
                {[
                  '1. Introduction',
                  '2. Getting Started',
                  '3. Core Concepts',
                  '4. Components',
                  '   4.1 ScrollArea',
                  '   4.2 Button',
                  '   4.3 Card',
                  '   4.4 Badge',
                  '5. Advanced Usage',
                  '6. Best Practices',
                  '7. Accessibility',
                  '8. Theming',
                  '9. API Reference',
                  '10. Examples',
                  '11. Troubleshooting',
                  '12. FAQ',
                  '13. Changelog',
                  '14. Contributing',
                  '15. License',
                ].map((item, index) => (
                  <div
                    key={index}
                    className="hover:text-primary cursor-pointer py-1 text-sm"
                  >
                    {item}
                  </div>
                ))}
              </div>
            </ScrollArea>
          </div>

          {/* Main Content */}
          <div className="flex-1">
            <ScrollArea className="h-96">
              <div className="prose prose-sm max-w-none p-6">
                <h1>CoreLive Design System Documentation</h1>

                <h2>1. Introduction</h2>
                <p>
                  Welcome to the CoreLive Design System documentation. This
                  comprehensive guide will help you understand and implement our
                  design system components effectively.
                </p>
                <p>
                  The ScrollArea component is one of our core interface
                  elements, providing custom-styled scrollbars that maintain
                  consistency across different platforms and browsers.
                </p>

                <h2>2. Getting Started</h2>
                <p>
                  To begin using the ScrollArea component, you'll need to import
                  it from our component library and wrap your scrollable content
                  within it.
                </p>
                <p>
                  The component is built on top of Radix UI primitives, ensuring
                  accessibility and cross-browser compatibility while providing
                  the flexibility to customize the appearance to match your
                  design requirements.
                </p>

                <h2>3. Core Concepts</h2>
                <p>
                  Understanding the fundamental concepts behind the ScrollArea
                  component will help you make the most of its capabilities. The
                  component consists of several key parts working together
                  seamlessly.
                </p>
                <p>
                  The viewport defines the visible area, while the scrollbar
                  provides the interactive element for navigation. The thumb
                  indicator shows the current position and allows direct
                  manipulation of the scroll position.
                </p>

                <h2>4. Components</h2>
                <h3>4.1 ScrollArea</h3>
                <p>
                  The main ScrollArea component wraps your content and provides
                  the scrolling functionality. It automatically detects overflow
                  and displays scrollbars when necessary.
                </p>
                <p>
                  Key features include smooth scrolling, customizable
                  appearance, keyboard navigation support, and touch-friendly
                  interactions on mobile devices.
                </p>

                <h3>4.2 ScrollBar</h3>
                <p>
                  The ScrollBar component can be used independently when you
                  need more control over scrollbar placement and behavior. It
                  supports both vertical and horizontal orientations.
                </p>

                <h2>5. Advanced Usage</h2>
                <p>
                  For advanced use cases, you can combine multiple ScrollArea
                  components, create nested scrollable regions, and implement
                  custom scroll behaviors using the provided APIs.
                </p>
                <p>
                  The component also supports programmatic scrolling, scroll
                  event handling, and integration with other interactive
                  elements like drag-and-drop interfaces.
                </p>

                <h2>6. Best Practices</h2>
                <p>
                  Follow these best practices to ensure optimal user experience:
                  always provide sufficient contrast for scrollbars, consider
                  mobile touch targets, and test with keyboard navigation.
                </p>
                <p>
                  Remember to set appropriate heights for your scroll containers
                  and consider the content length when designing your layouts.
                  Long scrollable areas should include landmarks or progress
                  indicators when appropriate.
                </p>

                <h2>7. Accessibility</h2>
                <p>
                  The ScrollArea component includes built-in accessibility
                  features such as proper ARIA labels, keyboard navigation
                  support, and compatibility with screen readers.
                </p>
                <p>
                  Users can navigate using arrow keys, page up/down, home/end
                  keys, and tab navigation. The component also respects user
                  preferences for reduced motion and high contrast modes.
                </p>

                <h2>8. Theming</h2>
                <p>
                  Customize the appearance using CSS custom properties and
                  design tokens from the CoreLive Design System. All visual
                  aspects can be themed to match your brand guidelines.
                </p>
                <p>
                  The component automatically adapts to light and dark themes,
                  and supports custom color schemes through the design token
                  system.
                </p>
              </div>
            </ScrollArea>
          </div>
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
        <h2 className="text-2xl font-bold">CoreLive ScrollArea Components</h2>
        <p className="text-muted-foreground">
          Scrollable areas showcasing CoreLive Design System integration
        </p>
      </div>

      <div className="space-y-6">
        {/* Basic Scroll Areas */}
        <Card>
          <CardHeader>
            <CardTitle>Basic Scroll Areas</CardTitle>
            <CardDescription>
              Fundamental scrollable containers with CoreLive styling
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
              {/* Vertical Scroll */}
              <div>
                <h4 className="mb-2 font-medium">Vertical Scrolling</h4>
                <ScrollArea className="h-48 w-full rounded-md border p-4">
                  <div className="space-y-3">
                    {[
                      { color: 'primary', label: 'Primary Items' },
                      { color: 'secondary', label: 'Secondary Items' },
                      { color: 'success', label: 'Success Items' },
                      { color: 'warning', label: 'Warning Items' },
                      { color: 'danger', label: 'Danger Items' },
                      { color: 'info', label: 'Info Items' },
                      { color: 'discovery', label: 'Discovery Items' },
                      { color: 'accent', label: 'Accent Items' },
                    ].map((item, index) => (
                      <div key={index} className="flex items-center gap-3">
                        <Badge
                          className={`bg-${item.color} text-${item.color}-foreground`}
                        >
                          {item.color.toUpperCase()}
                        </Badge>
                        <span className="text-sm">
                          {item.label} {index + 1}
                        </span>
                      </div>
                    ))}
                    {Array.from({ length: 15 }, (_, i) => (
                      <div key={i + 8} className="flex items-center gap-3">
                        <Badge variant="outline">#{i + 9}</Badge>
                        <span className="text-sm">
                          Additional scrollable item {i + 9}
                        </span>
                      </div>
                    ))}
                  </div>
                </ScrollArea>
              </div>

              {/* Horizontal Scroll */}
              <div>
                <h4 className="mb-2 font-medium">Horizontal Scrolling</h4>
                <ScrollArea className="w-full rounded-md border whitespace-nowrap">
                  <div className="flex w-max space-x-4 p-4">
                    {[
                      {
                        color: 'bg-primary',
                        text: 'text-primary-foreground',
                        label: 'Primary',
                      },
                      {
                        color: 'bg-secondary',
                        text: 'text-secondary-foreground',
                        label: 'Secondary',
                      },
                      {
                        color: 'bg-success',
                        text: 'text-success-foreground',
                        label: 'Success',
                      },
                      {
                        color: 'bg-warning',
                        text: 'text-warning-foreground',
                        label: 'Warning',
                      },
                      {
                        color: 'bg-danger',
                        text: 'text-danger-foreground',
                        label: 'Danger',
                      },
                      {
                        color: 'bg-info',
                        text: 'text-info-foreground',
                        label: 'Info',
                      },
                      {
                        color: 'bg-discovery',
                        text: 'text-discovery-foreground',
                        label: 'Discovery',
                      },
                      {
                        color: 'bg-accent',
                        text: 'text-accent-foreground',
                        label: 'Accent',
                      },
                    ].map((item, index) => (
                      <div
                        key={index}
                        className={`${item.color} ${item.text} min-w-32 rounded-lg p-4 text-center`}
                      >
                        <div className="text-sm font-medium">{item.label}</div>
                        <div className="text-xs opacity-90">
                          Card {index + 1}
                        </div>
                      </div>
                    ))}
                  </div>
                  <ScrollBar orientation="horizontal" />
                </ScrollArea>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Interactive Content Examples */}
        <Card>
          <CardHeader>
            <CardTitle>Interactive Scrollable Content</CardTitle>
            <CardDescription>
              Scrollable areas with interactive elements and state management
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
              {/* Notification Feed */}
              <div>
                <h4 className="mb-2 font-medium">Notification Feed</h4>
                <ScrollArea className="h-80 w-full rounded-md border">
                  <div className="space-y-4 p-4">
                    {[
                      {
                        type: 'success',
                        icon: Heart,
                        title: 'New like on your post',
                        desc: 'Sarah liked your design showcase',
                        time: '2m ago',
                      },
                      {
                        type: 'info',
                        icon: MessageSquare,
                        title: 'New comment',
                        desc: 'Mike commented on your article',
                        time: '5m ago',
                      },
                      {
                        type: 'warning',
                        icon: Bell,
                        title: 'Reminder',
                        desc: 'Team meeting in 15 minutes',
                        time: '15m ago',
                      },
                      {
                        type: 'primary',
                        icon: Star,
                        title: 'Achievement unlocked',
                        desc: 'You reached 100 followers!',
                        time: '1h ago',
                      },
                      {
                        type: 'discovery',
                        icon: Eye,
                        title: 'Profile view',
                        desc: 'Someone viewed your profile',
                        time: '2h ago',
                      },
                      {
                        type: 'secondary',
                        icon: Share,
                        title: 'Content shared',
                        desc: 'Your post was shared 5 times',
                        time: '3h ago',
                      },
                      {
                        type: 'accent',
                        icon: Bookmark,
                        title: 'Post saved',
                        desc: 'Your article was bookmarked',
                        time: '4h ago',
                      },
                      {
                        type: 'info',
                        icon: Mail,
                        title: 'New message',
                        desc: 'You have 3 unread messages',
                        time: '5h ago',
                      },
                    ].map((notification, index) => (
                      <div
                        key={index}
                        className="hover:bg-muted/50 flex cursor-pointer items-start gap-3 rounded-lg p-3 transition-colors"
                      >
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
                          <p className="text-muted-foreground text-xs">
                            {notification.desc}
                          </p>
                          <p className="text-muted-foreground mt-1 text-xs">
                            {notification.time}
                          </p>
                        </div>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-6 w-6 p-0"
                        >
                          <MoreHorizontal className="h-3 w-3" />
                        </Button>
                      </div>
                    ))}
                  </div>
                </ScrollArea>
              </div>

              {/* Social Media Feed */}
              <div>
                <h4 className="mb-2 font-medium">Social Media Feed</h4>
                <ScrollArea className="h-80 w-full rounded-md border">
                  <div className="space-y-4 p-4">
                    {[
                      {
                        user: 'Alice Johnson',
                        handle: '@alice',
                        content:
                          'Just finished implementing the new ScrollArea component! The CoreLive tokens make styling so much easier. 🎨',
                        likes: 24,
                        replies: 5,
                        time: '2h',
                      },
                      {
                        user: 'Bob Smith',
                        handle: '@bobdev',
                        content:
                          'Working on a new project using the design system. The consistency across components is amazing!',
                        likes: 18,
                        replies: 3,
                        time: '4h',
                      },
                      {
                        user: 'Carol Davis',
                        handle: '@carol_design',
                        content:
                          'Love how the scroll bars adapt to the theme automatically. Great work on the accessibility features! ♿',
                        likes: 32,
                        replies: 8,
                        time: '6h',
                      },
                      {
                        user: 'David Wilson',
                        handle: '@dwilson',
                        content:
                          'The documentation viewer example is exactly what I needed for my project. Thanks for the inspiration!',
                        likes: 15,
                        replies: 2,
                        time: '8h',
                      },
                    ].map((post, index) => (
                      <div
                        key={index}
                        className="hover:bg-muted/30 space-y-3 rounded-lg p-3 transition-colors"
                      >
                        <div className="flex items-center gap-3">
                          <Avatar className="h-10 w-10">
                            <AvatarFallback>
                              {post.user
                                .split(' ')
                                .map((n) => n[0])
                                .join('')}
                            </AvatarFallback>
                          </Avatar>
                          <div>
                            <div className="flex items-center gap-2">
                              <span className="text-sm font-medium">
                                {post.user}
                              </span>
                              <span className="text-muted-foreground text-xs">
                                {post.handle}
                              </span>
                              <span className="text-muted-foreground text-xs">
                                •
                              </span>
                              <span className="text-muted-foreground text-xs">
                                {post.time}
                              </span>
                            </div>
                          </div>
                        </div>
                        <p className="text-sm leading-relaxed">
                          {post.content}
                        </p>
                        <div className="flex items-center gap-6 pt-2">
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-8 gap-2"
                          >
                            <ThumbsUp className="h-3 w-3" />
                            <span className="text-xs">{post.likes}</span>
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-8 gap-2"
                          >
                            <Reply className="h-3 w-3" />
                            <span className="text-xs">{post.replies}</span>
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-8 gap-2"
                          >
                            <Share className="h-3 w-3" />
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                </ScrollArea>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Design Tokens */}
        <Card>
          <CardHeader>
            <CardTitle>CoreLive ScrollArea Design Tokens</CardTitle>
            <CardDescription>
              Design system tokens used in scroll area components
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 gap-6 text-sm md:grid-cols-2 lg:grid-cols-3">
              <div className="space-y-3">
                <h4 className="font-medium">Scrollbar Styling</h4>
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <Badge variant="outline">--border</Badge>
                    <span className="text-muted-foreground">
                      Scrollbar thumb color
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge variant="outline">w-2.5</Badge>
                    <span className="text-muted-foreground">
                      Scrollbar width
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge variant="outline">rounded-full</Badge>
                    <span className="text-muted-foreground">
                      Thumb border radius
                    </span>
                  </div>
                </div>
              </div>

              <div className="space-y-3">
                <h4 className="font-medium">Viewport Styling</h4>
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <Badge variant="outline">--ring</Badge>
                    <span className="text-muted-foreground">
                      Focus ring color
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge variant="outline">rounded-[inherit]</Badge>
                    <span className="text-muted-foreground">
                      Inherits parent radius
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge variant="outline">size-full</Badge>
                    <span className="text-muted-foreground">
                      Full size viewport
                    </span>
                  </div>
                </div>
              </div>

              <div className="space-y-3">
                <h4 className="font-medium">Interactive States</h4>
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <Badge variant="outline">touch-none</Badge>
                    <span className="text-muted-foreground">
                      Prevents touch actions
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge variant="outline">select-none</Badge>
                    <span className="text-muted-foreground">
                      Prevents text selection
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge variant="outline">transition-colors</Badge>
                    <span className="text-muted-foreground">
                      Smooth color transitions
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
                  <h5 className="text-sm font-medium">Scroll Area Root</h5>
                  <div className="space-y-1 text-xs">
                    <div>
                      <code className="bg-muted rounded px-1">
                        position: relative
                      </code>
                    </div>
                    <div>
                      <code className="bg-muted rounded px-1">
                        overflow: hidden
                      </code>
                    </div>
                    <div>
                      <code className="bg-muted rounded px-1">width: 100%</code>
                    </div>
                    <div>
                      <code className="bg-muted rounded px-1">
                        height: specified
                      </code>
                    </div>
                  </div>
                </div>
                <div className="space-y-2">
                  <h5 className="text-sm font-medium">Scrollbar Track</h5>
                  <div className="space-y-1 text-xs">
                    <div>
                      <code className="bg-muted rounded px-1">
                        position: absolute
                      </code>
                    </div>
                    <div>
                      <code className="bg-muted rounded px-1">
                        display: flex
                      </code>
                    </div>
                    <div>
                      <code className="bg-muted rounded px-1">
                        padding: 1px
                      </code>
                    </div>
                    <div>
                      <code className="bg-muted rounded px-1">
                        user-select: none
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
                ScrollArea components include comprehensive keyboard navigation,
                screen reader support, and respect for user motion preferences.
                Focus management ensures seamless navigation within scrollable
                content.
              </p>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  ),
}
