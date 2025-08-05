import type { Meta, StoryObj } from '@storybook/react'
import {
  Search,
  File,
  Calendar,
  Smile,
  Calculator,
  User,
  CreditCard,
  Settings,
  Palette,
  Laptop,
  Moon,
  Sun,
  Home,
  FileText,
  FolderOpen,
  GitBranch,
  GitCommit,
  GitPullRequest,
  Code,
  Database,
  Zap,
  Star,
  Link,
  Share,
  Copy,
  Check,
  X,
  ChevronRight,
  Command as CommandIcon,
  LogOut,
  UserPlus,
  Users,
  Building,
  Package,
  BarChart,
  Globe,
  Clock,
  RefreshCw,
  Download,
  Upload,
  Trash2,
  Archive,
  AlertCircle,
  CheckCircle,
  HelpCircle,
  Eye,
  EyeOff,
  Plus,
  Minus,
  DollarSign,
  Percent,
} from 'lucide-react'
import { useState, useEffect } from 'react'

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
  Command,
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
  CommandShortcut,
} from '@/components/ui/command'

const meta: Meta<typeof Command> = {
  title: 'CoreLive Design System/Components/Command',
  component: Command,
  parameters: {
    layout: 'centered',
    docs: {
      description: {
        component:
          'A command palette component for searching and executing commands. Built with cmdk library and styled with CoreLive Design System tokens.',
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
    <Command className="rounded-lg border shadow-md">
      <CommandInput placeholder="Type a command or search..." />
      <CommandList>
        <CommandEmpty>No results found.</CommandEmpty>
        <CommandGroup heading="Suggestions">
          <CommandItem>
            <Calendar className="mr-2 h-4 w-4" />
            <span>Calendar</span>
          </CommandItem>
          <CommandItem>
            <Smile className="mr-2 h-4 w-4" />
            <span>Search Emoji</span>
          </CommandItem>
          <CommandItem>
            <Calculator className="mr-2 h-4 w-4" />
            <span>Calculator</span>
          </CommandItem>
        </CommandGroup>
        <CommandSeparator />
        <CommandGroup heading="Settings">
          <CommandItem>
            <User className="mr-2 h-4 w-4" />
            <span>Profile</span>
            <CommandShortcut>⌘P</CommandShortcut>
          </CommandItem>
          <CommandItem>
            <CreditCard className="mr-2 h-4 w-4" />
            <span>Billing</span>
            <CommandShortcut>⌘B</CommandShortcut>
          </CommandItem>
          <CommandItem>
            <Settings className="mr-2 h-4 w-4" />
            <span>Settings</span>
            <CommandShortcut>⌘S</CommandShortcut>
          </CommandItem>
        </CommandGroup>
      </CommandList>
    </Command>
  ),
}

export const CommandPalette: Story = {
  args: {},
  render: () => {
    const [open, setOpen] = useState(false)

    useEffect(() => {
      const down = (e: KeyboardEvent) => {
        if (e.key === 'k' && (e.metaKey || e.ctrlKey)) {
          e.preventDefault()
          setOpen((open) => !open)
        }
      }
      document.addEventListener('keydown', down)
      return () => document.removeEventListener('keydown', down)
    }, [])

    return (
      <>
        <div className="space-y-4 text-center">
          <p className="text-muted-foreground text-sm">
            Press{' '}
            <kbd className="bg-muted text-muted-foreground pointer-events-none inline-flex h-5 items-center gap-1 rounded border px-1.5 font-mono text-[10px] font-medium opacity-100 select-none">
              <span className="text-xs">⌘</span>K
            </kbd>
          </p>
          <Button onClick={() => setOpen(true)}>
            <CommandIcon className="mr-2 h-4 w-4" />
            Open Command Palette
          </Button>
        </div>
        <CommandDialog open={open} onOpenChange={setOpen}>
          <CommandInput placeholder="Type a command or search..." />
          <CommandList>
            <CommandEmpty>No results found.</CommandEmpty>
            <CommandGroup heading="Quick Actions">
              <CommandItem
                onSelect={() => {
                  console.log('New File')
                  setOpen(false)
                }}
              >
                <File className="mr-2 h-4 w-4" />
                <span>New File</span>
                <CommandShortcut>⌘N</CommandShortcut>
              </CommandItem>
              <CommandItem
                onSelect={() => {
                  console.log('Open File')
                  setOpen(false)
                }}
              >
                <FolderOpen className="mr-2 h-4 w-4" />
                <span>Open File</span>
                <CommandShortcut>⌘O</CommandShortcut>
              </CommandItem>
              <CommandItem
                onSelect={() => {
                  console.log('Save')
                  setOpen(false)
                }}
              >
                <Download className="mr-2 h-4 w-4" />
                <span>Save</span>
                <CommandShortcut>⌘S</CommandShortcut>
              </CommandItem>
            </CommandGroup>
            <CommandSeparator />
            <CommandGroup heading="Navigation">
              <CommandItem
                onSelect={() => {
                  console.log('Home')
                  setOpen(false)
                }}
              >
                <Home className="mr-2 h-4 w-4" />
                <span>Go to Home</span>
              </CommandItem>
              <CommandItem
                onSelect={() => {
                  console.log('Dashboard')
                  setOpen(false)
                }}
              >
                <BarChart className="mr-2 h-4 w-4" />
                <span>Dashboard</span>
              </CommandItem>
              <CommandItem
                onSelect={() => {
                  console.log('Projects')
                  setOpen(false)
                }}
              >
                <Package className="mr-2 h-4 w-4" />
                <span>Projects</span>
              </CommandItem>
              <CommandItem
                onSelect={() => {
                  console.log('Team')
                  setOpen(false)
                }}
              >
                <Users className="mr-2 h-4 w-4" />
                <span>Team</span>
              </CommandItem>
            </CommandGroup>
            <CommandSeparator />
            <CommandGroup heading="Theme">
              <CommandItem
                onSelect={() => {
                  console.log('Light')
                  setOpen(false)
                }}
              >
                <Sun className="mr-2 h-4 w-4" />
                <span>Light Mode</span>
              </CommandItem>
              <CommandItem
                onSelect={() => {
                  console.log('Dark')
                  setOpen(false)
                }}
              >
                <Moon className="mr-2 h-4 w-4" />
                <span>Dark Mode</span>
              </CommandItem>
              <CommandItem
                onSelect={() => {
                  console.log('System')
                  setOpen(false)
                }}
              >
                <Laptop className="mr-2 h-4 w-4" />
                <span>System</span>
              </CommandItem>
            </CommandGroup>
            <CommandSeparator />
            <CommandGroup heading="Account">
              <CommandItem
                onSelect={() => {
                  console.log('Profile')
                  setOpen(false)
                }}
              >
                <User className="mr-2 h-4 w-4" />
                <span>Profile</span>
              </CommandItem>
              <CommandItem
                onSelect={() => {
                  console.log('Settings')
                  setOpen(false)
                }}
              >
                <Settings className="mr-2 h-4 w-4" />
                <span>Settings</span>
              </CommandItem>
              <CommandItem
                onSelect={() => {
                  console.log('Logout')
                  setOpen(false)
                }}
              >
                <LogOut className="mr-2 h-4 w-4" />
                <span>Log Out</span>
              </CommandItem>
            </CommandGroup>
          </CommandList>
        </CommandDialog>
      </>
    )
  },
}

export const SearchableList: Story = {
  args: {},
  render: () => {
    const frameworks = [
      { value: 'next.js', label: 'Next.js', icon: Code },
      { value: 'sveltekit', label: 'SvelteKit', icon: Code },
      { value: 'nuxt.js', label: 'Nuxt.js', icon: Code },
      { value: 'remix', label: 'Remix', icon: Code },
      { value: 'astro', label: 'Astro', icon: Zap },
      { value: 'gatsby', label: 'Gatsby', icon: Code },
      { value: 'vue', label: 'Vue.js', icon: Code },
      { value: 'angular', label: 'Angular', icon: Code },
    ]

    return (
      <Card className="w-[400px]">
        <CardHeader>
          <CardTitle>Select Framework</CardTitle>
          <CardDescription>Choose your preferred framework</CardDescription>
        </CardHeader>
        <CardContent>
          <Command>
            <CommandInput placeholder="Search frameworks..." />
            <CommandList>
              <CommandEmpty>No framework found.</CommandEmpty>
              <CommandGroup>
                {frameworks.map((framework) => {
                  const Icon = framework.icon
                  return (
                    <CommandItem
                      key={framework.value}
                      value={framework.value}
                      onSelect={(value) => {
                        console.log('Selected:', value)
                      }}
                    >
                      <Icon className="mr-2 h-4 w-4" />
                      <span>{framework.label}</span>
                    </CommandItem>
                  )
                })}
              </CommandGroup>
            </CommandList>
          </Command>
        </CardContent>
      </Card>
    )
  },
}

export const GitCommands: Story = {
  args: {},
  render: () => {
    const [selectedCommand, setSelectedCommand] = useState('')

    return (
      <Card className="w-[500px]">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <GitBranch className="h-5 w-5" />
            Git Commands
          </CardTitle>
          <CardDescription>
            Quick access to common git operations
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Command>
            <CommandInput placeholder="Search git commands..." />
            <CommandList>
              <CommandEmpty>No commands found.</CommandEmpty>
              <CommandGroup heading="Branch">
                <CommandItem
                  onSelect={() => setSelectedCommand('git checkout -b')}
                >
                  <GitBranch className="mr-2 h-4 w-4" />
                  <span>Create New Branch</span>
                  <CommandShortcut>git checkout -b</CommandShortcut>
                </CommandItem>
                <CommandItem
                  onSelect={() => setSelectedCommand('git branch -d')}
                >
                  <Trash2 className="mr-2 h-4 w-4" />
                  <span>Delete Branch</span>
                  <CommandShortcut>git branch -d</CommandShortcut>
                </CommandItem>
                <CommandItem onSelect={() => setSelectedCommand('git merge')}>
                  <GitPullRequest className="mr-2 h-4 w-4" />
                  <span>Merge Branch</span>
                  <CommandShortcut>git merge</CommandShortcut>
                </CommandItem>
              </CommandGroup>
              <CommandSeparator />
              <CommandGroup heading="Commit">
                <CommandItem onSelect={() => setSelectedCommand('git add .')}>
                  <Plus className="mr-2 h-4 w-4" />
                  <span>Stage All Changes</span>
                  <CommandShortcut>git add .</CommandShortcut>
                </CommandItem>
                <CommandItem
                  onSelect={() => setSelectedCommand('git commit -m')}
                >
                  <GitCommit className="mr-2 h-4 w-4" />
                  <span>Commit Changes</span>
                  <CommandShortcut>git commit -m</CommandShortcut>
                </CommandItem>
                <CommandItem onSelect={() => setSelectedCommand('git push')}>
                  <Upload className="mr-2 h-4 w-4" />
                  <span>Push to Remote</span>
                  <CommandShortcut>git push</CommandShortcut>
                </CommandItem>
              </CommandGroup>
              <CommandSeparator />
              <CommandGroup heading="Remote">
                <CommandItem onSelect={() => setSelectedCommand('git pull')}>
                  <Download className="mr-2 h-4 w-4" />
                  <span>Pull Latest Changes</span>
                  <CommandShortcut>git pull</CommandShortcut>
                </CommandItem>
                <CommandItem onSelect={() => setSelectedCommand('git fetch')}>
                  <RefreshCw className="mr-2 h-4 w-4" />
                  <span>Fetch Remote</span>
                  <CommandShortcut>git fetch</CommandShortcut>
                </CommandItem>
              </CommandGroup>
            </CommandList>
          </Command>
          {selectedCommand && (
            <div className="bg-muted mt-4 rounded-md p-3">
              <code className="text-sm">{selectedCommand}</code>
            </div>
          )}
        </CardContent>
      </Card>
    )
  },
}

export const EmojiPicker: Story = {
  args: {},
  render: () => {
    const [selectedEmoji, setSelectedEmoji] = useState('')

    const emojis = [
      { emoji: '😀', name: 'Grinning Face', category: 'smileys' },
      { emoji: '😃', name: 'Grinning Face with Big Eyes', category: 'smileys' },
      {
        emoji: '😄',
        name: 'Grinning Face with Smiling Eyes',
        category: 'smileys',
      },
      {
        emoji: '😁',
        name: 'Beaming Face with Smiling Eyes',
        category: 'smileys',
      },
      { emoji: '😅', name: 'Grinning Face with Sweat', category: 'smileys' },
      { emoji: '😂', name: 'Face with Tears of Joy', category: 'smileys' },
      {
        emoji: '🤣',
        name: 'Rolling on the Floor Laughing',
        category: 'smileys',
      },
      {
        emoji: '😊',
        name: 'Smiling Face with Smiling Eyes',
        category: 'smileys',
      },
      { emoji: '❤️', name: 'Red Heart', category: 'symbols' },
      { emoji: '💛', name: 'Yellow Heart', category: 'symbols' },
      { emoji: '💚', name: 'Green Heart', category: 'symbols' },
      { emoji: '💙', name: 'Blue Heart', category: 'symbols' },
      { emoji: '✨', name: 'Sparkles', category: 'symbols' },
      { emoji: '⭐', name: 'Star', category: 'symbols' },
      { emoji: '🌟', name: 'Glowing Star', category: 'symbols' },
      { emoji: '💫', name: 'Dizzy', category: 'symbols' },
    ]

    return (
      <Card className="w-[350px]">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Smile className="h-5 w-5" />
            Emoji Picker
          </CardTitle>
          {selectedEmoji && (
            <CardDescription>
              Selected: <span className="text-2xl">{selectedEmoji}</span>
            </CardDescription>
          )}
        </CardHeader>
        <CardContent>
          <Command>
            <CommandInput placeholder="Search emoji..." />
            <CommandList>
              <CommandEmpty>No emoji found.</CommandEmpty>
              <CommandGroup heading="Smileys & Emotion">
                {emojis
                  .filter((e) => e.category === 'smileys')
                  .map((emoji) => (
                    <CommandItem
                      key={emoji.emoji}
                      value={emoji.name}
                      onSelect={() => setSelectedEmoji(emoji.emoji)}
                    >
                      <span className="mr-2 text-xl">{emoji.emoji}</span>
                      <span>{emoji.name}</span>
                    </CommandItem>
                  ))}
              </CommandGroup>
              <CommandSeparator />
              <CommandGroup heading="Symbols">
                {emojis
                  .filter((e) => e.category === 'symbols')
                  .map((emoji) => (
                    <CommandItem
                      key={emoji.emoji}
                      value={emoji.name}
                      onSelect={() => setSelectedEmoji(emoji.emoji)}
                    >
                      <span className="mr-2 text-xl">{emoji.emoji}</span>
                      <span>{emoji.name}</span>
                    </CommandItem>
                  ))}
              </CommandGroup>
            </CommandList>
          </Command>
        </CardContent>
      </Card>
    )
  },
}

export const TeamSwitcher: Story = {
  args: {},
  render: () => {
    const [selectedTeam, setSelectedTeam] = useState('personal')

    const teams = [
      {
        label: 'Personal Account',
        teams: [{ value: 'personal', label: 'John Doe', icon: User }],
      },
      {
        label: 'Teams',
        teams: [
          { value: 'acme', label: 'Acme Inc.', icon: Building },
          { value: 'monsters', label: 'Monsters Corp.', icon: Building },
          { value: 'stark', label: 'Stark Industries', icon: Building },
        ],
      },
    ]

    return (
      <Card className="w-[350px]">
        <CardHeader>
          <CardTitle>Switch Team</CardTitle>
          <CardDescription>
            Current:{' '}
            {
              teams
                .flatMap((g) => g.teams)
                .find((t) => t.value === selectedTeam)?.label
            }
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Command>
            <CommandInput placeholder="Search team..." />
            <CommandList>
              <CommandEmpty>No team found.</CommandEmpty>
              {teams.map((group) => (
                <CommandGroup key={group.label} heading={group.label}>
                  {group.teams.map((team) => {
                    const Icon = team.icon
                    return (
                      <CommandItem
                        key={team.value}
                        value={team.value}
                        onSelect={() => setSelectedTeam(team.value)}
                      >
                        <Icon className="mr-2 h-4 w-4" />
                        <span>{team.label}</span>
                        {selectedTeam === team.value && (
                          <Check className="ml-auto h-4 w-4" />
                        )}
                      </CommandItem>
                    )
                  })}
                </CommandGroup>
              ))}
              <CommandSeparator />
              <CommandGroup>
                <CommandItem onSelect={() => console.log('Create team')}>
                  <UserPlus className="mr-2 h-4 w-4" />
                  <span>Create Team</span>
                </CommandItem>
              </CommandGroup>
            </CommandList>
          </Command>
        </CardContent>
      </Card>
    )
  },
}

export const ActionMenu: Story = {
  args: {},
  render: () => {
    const [copied, setCopied] = useState(false)

    const actions = [
      { icon: Copy, label: 'Copy', shortcut: '⌘C' },
      { icon: Link, label: 'Copy Link', shortcut: '⌘L' },
      { icon: Share, label: 'Share', shortcut: '⌘S' },
      { icon: Star, label: 'Add to Favorites', shortcut: '⌘F' },
      { icon: Archive, label: 'Archive', shortcut: '⌘A' },
      { icon: Trash2, label: 'Delete', shortcut: '⌘D', variant: 'danger' },
    ]

    return (
      <Card className="w-[350px]">
        <CardHeader>
          <CardTitle>Document Actions</CardTitle>
          <CardDescription>Available actions for this document</CardDescription>
        </CardHeader>
        <CardContent>
          <Command>
            <CommandList>
              <CommandGroup>
                {actions.map((action) => {
                  const Icon = action.icon
                  return (
                    <CommandItem
                      key={action.label}
                      onSelect={() => {
                        if (action.label === 'Copy') {
                          setCopied(true)
                          setTimeout(() => setCopied(false), 2000)
                        }
                        console.log(action.label)
                      }}
                      className={
                        action.variant === 'danger' ? 'text-danger' : ''
                      }
                    >
                      {action.label === 'Copy' && copied ? (
                        <Check className="mr-2 h-4 w-4" />
                      ) : (
                        <Icon className="mr-2 h-4 w-4" />
                      )}
                      <span>
                        {action.label === 'Copy' && copied
                          ? 'Copied!'
                          : action.label}
                      </span>
                      {action.shortcut && (
                        <CommandShortcut>{action.shortcut}</CommandShortcut>
                      )}
                    </CommandItem>
                  )
                })}
              </CommandGroup>
            </CommandList>
          </Command>
        </CardContent>
      </Card>
    )
  },
}

export const CalculatorExample: Story = {
  args: {},
  render: () => {
    const [expression, setExpression] = useState('')
    const [result, setResult] = useState('')

    const operators = [
      { symbol: '+', label: 'Add', icon: Plus },
      { symbol: '-', label: 'Subtract', icon: Minus },
      { symbol: '*', label: 'Multiply', icon: X },
      { symbol: '/', label: 'Divide', icon: DollarSign },
      { symbol: '%', label: 'Percentage', icon: Percent },
    ]

    const calculate = () => {
      try {
        const calc = new Function('return ' + expression)()
        setResult(calc.toString())
      } catch {
        setResult('Error')
      }
    }

    return (
      <Card className="w-[400px]">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Calculator className="h-5 w-5" />
            Quick Calculator
          </CardTitle>
          {expression && (
            <CardDescription>
              <code>{expression}</code>
              {result && <span> = {result}</span>}
            </CardDescription>
          )}
        </CardHeader>
        <CardContent>
          <Command>
            <CommandInput
              placeholder="Type expression (e.g., 10 + 20)..."
              value={expression}
              onValueChange={setExpression}
            />
            <CommandList>
              <CommandEmpty>Type a mathematical expression</CommandEmpty>
              <CommandGroup heading="Operations">
                {operators.map((op) => {
                  const Icon = op.icon
                  return (
                    <CommandItem
                      key={op.symbol}
                      onSelect={() => {
                        setExpression((prev) => prev + ' ' + op.symbol + ' ')
                      }}
                    >
                      <Icon className="mr-2 h-4 w-4" />
                      <span>{op.label}</span>
                      <CommandShortcut>{op.symbol}</CommandShortcut>
                    </CommandItem>
                  )
                })}
              </CommandGroup>
              <CommandSeparator />
              <CommandGroup>
                <CommandItem onSelect={calculate}>
                  <Check className="mr-2 h-4 w-4" />
                  <span>Calculate</span>
                  <CommandShortcut>Enter</CommandShortcut>
                </CommandItem>
                <CommandItem
                  onSelect={() => {
                    setExpression('')
                    setResult('')
                  }}
                >
                  <X className="mr-2 h-4 w-4" />
                  <span>Clear</span>
                  <CommandShortcut>Esc</CommandShortcut>
                </CommandItem>
              </CommandGroup>
            </CommandList>
          </Command>
        </CardContent>
      </Card>
    )
  },
}

export const RecentFiles: Story = {
  args: {},
  render: () => {
    const recentFiles = [
      {
        name: 'README.md',
        path: '/docs/README.md',
        modified: '2 hours ago',
        type: 'markdown',
      },
      {
        name: 'App.tsx',
        path: '/src/App.tsx',
        modified: '3 hours ago',
        type: 'typescript',
      },
      {
        name: 'styles.css',
        path: '/src/styles.css',
        modified: '5 hours ago',
        type: 'css',
      },
      {
        name: 'package.json',
        path: '/package.json',
        modified: '1 day ago',
        type: 'json',
      },
      {
        name: 'index.html',
        path: '/public/index.html',
        modified: '2 days ago',
        type: 'html',
      },
    ]

    const getFileIcon = (type: string) => {
      switch (type) {
        case 'markdown':
          return FileText
        case 'typescript':
        case 'javascript':
          return Code
        case 'css':
          return Palette
        case 'json':
          return Database
        case 'html':
          return Globe
        default:
          return File
      }
    }

    return (
      <Card className="w-[500px]">
        <CardHeader>
          <CardTitle>Recent Files</CardTitle>
          <CardDescription>
            Quickly access your recently opened files
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Command>
            <CommandInput placeholder="Search files..." />
            <CommandList>
              <CommandEmpty>No recent files found.</CommandEmpty>
              <CommandGroup heading="Recent">
                {recentFiles.map((file) => {
                  const Icon = getFileIcon(file.type)
                  return (
                    <CommandItem
                      key={file.path}
                      value={file.name + ' ' + file.path}
                      onSelect={() => console.log('Open:', file.path)}
                    >
                      <Icon className="mr-2 h-4 w-4" />
                      <div className="flex-1">
                        <div className="flex items-center justify-between">
                          <span>{file.name}</span>
                          <span className="text-muted-foreground text-xs">
                            {file.modified}
                          </span>
                        </div>
                        <span className="text-muted-foreground text-xs">
                          {file.path}
                        </span>
                      </div>
                    </CommandItem>
                  )
                })}
              </CommandGroup>
            </CommandList>
          </Command>
        </CardContent>
      </Card>
    )
  },
}

export const StatusSelector: Story = {
  args: {},
  render: () => {
    const [status, setStatus] = useState('active')

    const statuses = [
      {
        value: 'active',
        label: 'Active',
        icon: CheckCircle,
        color: 'text-success',
      },
      { value: 'paused', label: 'Paused', icon: Clock, color: 'text-warning' },
      {
        value: 'error',
        label: 'Error',
        icon: AlertCircle,
        color: 'text-danger',
      },
      {
        value: 'completed',
        label: 'Completed',
        icon: Check,
        color: 'text-info',
      },
      {
        value: 'cancelled',
        label: 'Cancelled',
        icon: X,
        color: 'text-muted-foreground',
      },
    ]

    return (
      <Card className="w-[350px]">
        <CardHeader>
          <CardTitle>Status</CardTitle>
          <CardDescription>
            Current: {statuses.find((s) => s.value === status)?.label}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Command>
            <CommandInput placeholder="Change status..." />
            <CommandList>
              <CommandEmpty>No status found.</CommandEmpty>
              <CommandGroup>
                {statuses.map((statusOption) => {
                  const Icon = statusOption.icon
                  return (
                    <CommandItem
                      key={statusOption.value}
                      value={statusOption.value}
                      onSelect={() => setStatus(statusOption.value)}
                    >
                      <Icon className={`mr-2 h-4 w-4 ${statusOption.color}`} />
                      <span>{statusOption.label}</span>
                      {status === statusOption.value && (
                        <Check className="ml-auto h-4 w-4" />
                      )}
                    </CommandItem>
                  )
                })}
              </CommandGroup>
            </CommandList>
          </Command>
        </CardContent>
      </Card>
    )
  },
}

export const CoreLiveThemeShowcase: Story = {
  args: {},
  render: () => (
    <div className="w-full max-w-2xl space-y-6">
      <div>
        <h3 className="text-heading-3 mb-4 font-medium">Command Variations</h3>
        <div className="grid grid-cols-2 gap-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-sm">Default Command</CardTitle>
            </CardHeader>
            <CardContent>
              <Command
                className="border"
                style={{
                  borderColor: 'var(--component-command-border)',
                  backgroundColor: 'var(--component-command-background)',
                }}
              >
                <CommandInput
                  placeholder="Type to search..."
                  style={{
                    backgroundColor:
                      'var(--component-command-input-background)',
                    borderColor: 'var(--component-command-input-border)',
                  }}
                />
                <CommandList>
                  <CommandEmpty>No results</CommandEmpty>
                  <CommandGroup heading="Options">
                    <CommandItem>
                      <Search className="mr-2 h-4 w-4" />
                      <span>Search</span>
                    </CommandItem>
                    <CommandItem>
                      <Settings className="mr-2 h-4 w-4" />
                      <span>Settings</span>
                    </CommandItem>
                  </CommandGroup>
                </CommandList>
              </Command>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-sm">With Shortcuts</CardTitle>
            </CardHeader>
            <CardContent>
              <Command className="border">
                <CommandList>
                  <CommandGroup>
                    <CommandItem>
                      <File className="mr-2 h-4 w-4" />
                      <span>New File</span>
                      <CommandShortcut>⌘N</CommandShortcut>
                    </CommandItem>
                    <CommandItem>
                      <Copy className="mr-2 h-4 w-4" />
                      <span>Copy</span>
                      <CommandShortcut>⌘C</CommandShortcut>
                    </CommandItem>
                  </CommandGroup>
                </CommandList>
              </Command>
            </CardContent>
          </Card>
        </div>
      </div>

      <div>
        <h3 className="text-heading-3 mb-4 font-medium">Item States</h3>
        <Card>
          <CardContent className="pt-6">
            <Command className="border">
              <CommandList>
                <CommandGroup heading="States">
                  <CommandItem>
                    <Eye className="mr-2 h-4 w-4" />
                    <span>Default State</span>
                  </CommandItem>
                  <CommandItem
                    className="bg-accent text-accent-foreground"
                    style={{
                      backgroundColor:
                        'var(--component-command-item-selected-background)',
                      color: 'var(--component-command-item-selected-text)',
                    }}
                  >
                    <Eye className="mr-2 h-4 w-4" />
                    <span>Selected State</span>
                  </CommandItem>
                  <CommandItem disabled className="opacity-50">
                    <EyeOff className="mr-2 h-4 w-4" />
                    <span>Disabled State</span>
                  </CommandItem>
                </CommandGroup>
              </CommandList>
            </Command>
          </CardContent>
        </Card>
      </div>

      <div>
        <h3 className="text-heading-3 mb-4 font-medium">Semantic Usage</h3>
        <div className="grid grid-cols-2 gap-4">
          <Card className="border-success/20">
            <CardHeader>
              <CardTitle className="text-success text-sm">
                Success Actions
              </CardTitle>
            </CardHeader>
            <CardContent>
              <Command className="border-success/20">
                <CommandList>
                  <CommandGroup>
                    <CommandItem>
                      <CheckCircle className="text-success mr-2 h-4 w-4" />
                      <span>Complete Task</span>
                    </CommandItem>
                    <CommandItem>
                      <Check className="text-success mr-2 h-4 w-4" />
                      <span>Mark as Done</span>
                    </CommandItem>
                  </CommandGroup>
                </CommandList>
              </Command>
            </CardContent>
          </Card>

          <Card className="border-danger/20">
            <CardHeader>
              <CardTitle className="text-danger text-sm">
                Danger Actions
              </CardTitle>
            </CardHeader>
            <CardContent>
              <Command className="border-danger/20">
                <CommandList>
                  <CommandGroup>
                    <CommandItem className="text-danger">
                      <Trash2 className="mr-2 h-4 w-4" />
                      <span>Delete</span>
                    </CommandItem>
                    <CommandItem className="text-danger">
                      <X className="mr-2 h-4 w-4" />
                      <span>Cancel</span>
                    </CommandItem>
                  </CommandGroup>
                </CommandList>
              </Command>
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
              <div
                className="rounded-lg p-1"
                style={{
                  backgroundColor: 'var(--component-command-background)',
                  border: '1px solid var(--component-command-border)',
                }}
              >
                <input
                  className="w-full rounded-md px-3 py-2 text-sm"
                  placeholder="Custom command input..."
                  style={{
                    backgroundColor:
                      'var(--component-command-input-background)',
                    border: '1px solid var(--component-command-input-border)',
                    color: 'var(--component-command-input-text)',
                  }}
                />
                <div className="mt-2 py-1">
                  <div
                    className="mx-1 cursor-pointer rounded-md px-2 py-1.5"
                    style={{
                      backgroundColor:
                        'var(--component-command-item-background)',
                    }}
                  >
                    <span className="text-sm">Command Item</span>
                  </div>
                  <div
                    className="mx-1 cursor-pointer rounded-md px-2 py-1.5"
                    style={{
                      backgroundColor:
                        'var(--component-command-item-selected-background)',
                      color: 'var(--component-command-item-selected-text)',
                    }}
                  >
                    <span className="text-sm">Selected Item</span>
                  </div>
                </div>
              </div>

              <div className="bg-muted rounded-md p-3">
                <code className="text-xs">
                  --component-command-background
                  <br />
                  --component-command-border
                  <br />
                  --component-command-input-background
                  <br />
                  --component-command-input-border
                  <br />
                  --component-command-input-text
                  <br />
                  --component-command-item-background
                  <br />
                  --component-command-item-selected-background
                  <br />
                  --component-command-item-selected-text
                  <br />
                  --component-command-separator-background
                </code>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      <div>
        <h3 className="text-heading-3 mb-4 font-medium">Advanced Patterns</h3>
        <Card>
          <CardHeader>
            <CardTitle>Multi-Level Command</CardTitle>
          </CardHeader>
          <CardContent>
            <Command className="border">
              <CommandInput placeholder="Search all categories..." />
              <CommandList>
                <CommandGroup heading="Files">
                  <CommandItem>
                    <FileText className="mr-2 h-4 w-4" />
                    <span>Documents</span>
                    <Badge className="ml-auto" variant="secondary">
                      12
                    </Badge>
                  </CommandItem>
                  <CommandItem>
                    <Code className="mr-2 h-4 w-4" />
                    <span>Source Code</span>
                    <Badge className="ml-auto" variant="secondary">
                      48
                    </Badge>
                  </CommandItem>
                </CommandGroup>
                <CommandSeparator />
                <CommandGroup heading="Actions">
                  <CommandItem>
                    <Upload className="mr-2 h-4 w-4" />
                    <span>Upload Files</span>
                    <ChevronRight className="ml-auto h-4 w-4" />
                  </CommandItem>
                  <CommandItem>
                    <Download className="mr-2 h-4 w-4" />
                    <span>Download All</span>
                    <ChevronRight className="ml-auto h-4 w-4" />
                  </CommandItem>
                </CommandGroup>
                <CommandSeparator />
                <CommandGroup heading="Settings">
                  <CommandItem>
                    <Settings className="mr-2 h-4 w-4" />
                    <span>Preferences</span>
                    <CommandShortcut>⌘,</CommandShortcut>
                  </CommandItem>
                  <CommandItem>
                    <HelpCircle className="mr-2 h-4 w-4" />
                    <span>Help</span>
                    <CommandShortcut>⌘?</CommandShortcut>
                  </CommandItem>
                </CommandGroup>
              </CommandList>
            </Command>
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
          'Comprehensive showcase of command variations using CoreLive Design System tokens for consistent command palette interfaces across different contexts.',
      },
    },
  },
}
