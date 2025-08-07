import type { Meta, StoryObj } from '@storybook/react'
import {
  AlertTriangle,
  Bell,
  CheckCircle,
  Clock,
  Copy,
  CreditCard,
  Database,
  Download,
  FileText,
  Heart,
  Info,
  Mail,
  MessageSquare,
  Package,
  Save,
  Settings,
  Shield,
  ShoppingCart,
  Star,
  Trash2,
  Upload,
  User,
  WifiOff,
  XCircle,
  Zap,
} from 'lucide-react'
import { useState } from 'react'
import { toast } from 'sonner'

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
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Separator } from '@/components/ui/separator'
import { Toaster } from '@/components/ui/sonner'
import { Switch } from '@/components/ui/switch'

const meta: Meta<typeof Toaster> = {
  title: 'Components/Sonner',
  component: Toaster,
  parameters: {
    layout: 'centered',
    docs: {
      description: {
        component:
          'Beautiful toast notifications built on top of Sonner with CoreLive Design System integration.',
      },
    },
  },
  decorators: [
    (Story: any) => (
      <div>
        <Story />
        <Toaster />
      </div>
    ),
  ],
  tags: ['autodocs'],
}

export default meta
type Story = StoryObj<typeof Toaster>

export const Default: Story = {
  args: {},
  render: () => (
    <Card>
      <CardHeader>
        <CardTitle>Basic Toast Notifications</CardTitle>
        <CardDescription>
          Simple toast messages with different styles
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-2 gap-4">
          <Button onClick={() => toast('Basic notification')} variant="outline">
            Basic Toast
          </Button>

          <Button
            onClick={() =>
              toast('Toast with description', {
                description: 'This toast includes additional description text.',
              })
            }
            variant="outline"
          >
            With Description
          </Button>

          <Button
            onClick={() =>
              toast('Toast with action', {
                action: {
                  label: 'Undo',
                  onClick: () => toast('Undo clicked!'),
                },
              })
            }
            variant="outline"
          >
            With Action
          </Button>

          <Button
            onClick={() =>
              toast('Dismissible toast', {
                description: 'This toast can be dismissed manually.',
                cancel: {
                  label: 'Cancel',
                  onClick: () => {},
                },
              })
            }
            variant="outline"
          >
            With Cancel
          </Button>
        </div>
      </CardContent>
    </Card>
  ),
}

export const ToastTypes: Story = {
  args: {},
  render: () => (
    <Card>
      <CardHeader>
        <CardTitle>Toast Types</CardTitle>
        <CardDescription>
          Different semantic toast types with CoreLive theming
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-2 gap-4">
          <Button
            onClick={() =>
              toast.success('Success! Your changes have been saved.', {
                description:
                  'All data has been successfully updated in the database.',
                icon: <CheckCircle className="h-4 w-4" />,
              })
            }
            className="bg-success hover:bg-success/90 text-success-foreground"
          >
            <CheckCircle className="mr-2 h-4 w-4" />
            Success Toast
          </Button>

          <Button
            onClick={() =>
              toast.error('Error! Something went wrong.', {
                description:
                  'Please try again or contact support if the problem persists.',
                icon: <XCircle className="h-4 w-4" />,
              })
            }
            className="bg-danger hover:bg-danger/90 text-danger-foreground"
          >
            <XCircle className="mr-2 h-4 w-4" />
            Error Toast
          </Button>

          <Button
            onClick={() =>
              toast.warning('Warning! Please review your input.', {
                description:
                  'Some fields require your attention before proceeding.',
                icon: <AlertTriangle className="h-4 w-4" />,
              })
            }
            className="bg-warning hover:bg-warning/90 text-warning-foreground"
          >
            <AlertTriangle className="mr-2 h-4 w-4" />
            Warning Toast
          </Button>

          <Button
            onClick={() =>
              toast.info('Information about the latest update.', {
                description: 'New features and improvements are now available.',
                icon: <Info className="h-4 w-4" />,
              })
            }
            className="bg-info hover:bg-info/90 text-info-foreground"
          >
            <Info className="mr-2 h-4 w-4" />
            Info Toast
          </Button>
        </div>
      </CardContent>
    </Card>
  ),
}

export const InteractiveToasts: Story = {
  args: {},
  render: () => {
    const [isUploading, setIsUploading] = useState(false)
    const [isSaving, setSaving] = useState(false)

    const handleFileUpload = () => {
      setIsUploading(true)
      const uploadPromise = new Promise((resolve, reject) => {
        setTimeout(() => {
          if (Math.random() > 0.3) {
            resolve({ name: 'document.pdf' })
          } else {
            reject(new Error('Upload failed'))
          }
        }, 3000)
      })

      toast.promise(uploadPromise, {
        loading: 'Uploading file...',
        success: (data: any) => {
          setIsUploading(false)
          return `${data.name} uploaded successfully!`
        },
        error: (error) => {
          setIsUploading(false)
          return `Upload failed: ${error.message}`
        },
      })
    }

    const handleSave = () => {
      setSaving(true)
      const savePromise = new Promise((resolve) => {
        setTimeout(() => {
          resolve({ changes: 5 })
        }, 2000)
      })

      toast.promise(savePromise, {
        loading: 'Saving changes...',
        success: (data: any) => {
          setSaving(false)
          return `Saved ${data.changes} changes successfully!`
        },
        error: 'Failed to save changes.',
      })
    }

    return (
      <Card>
        <CardHeader>
          <CardTitle>Interactive Toast Examples</CardTitle>
          <CardDescription>
            Toast notifications with promises, loading states, and complex
            interactions
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <Button
              onClick={handleFileUpload}
              disabled={isUploading}
              variant="outline"
            >
              <Upload className="mr-2 h-4 w-4" />
              {isUploading ? 'Uploading...' : 'Upload File'}
            </Button>

            <Button onClick={handleSave} disabled={isSaving} variant="outline">
              <Save className="mr-2 h-4 w-4" />
              {isSaving ? 'Saving...' : 'Save Document'}
            </Button>

            <Button
              onClick={() =>
                toast('Item deleted', {
                  description: 'The item has been moved to trash.',
                  action: {
                    label: 'Undo',
                    onClick: () => toast.success('Item restored successfully!'),
                  },
                })
              }
              variant="destructive"
            >
              <Trash2 className="mr-2 h-4 w-4" />
              Delete Item
            </Button>

            <Button
              onClick={() =>
                toast('Link copied to clipboard', {
                  description: 'You can now paste it anywhere.',
                  icon: <Copy className="h-4 w-4" />,
                  duration: 2000,
                })
              }
              variant="outline"
            >
              <Copy className="mr-2 h-4 w-4" />
              Copy Link
            </Button>
          </div>

          <Separator />

          <div className="space-y-2">
            <h4 className="font-medium">Custom Duration Examples</h4>
            <div className="flex gap-2">
              <Button
                size="sm"
                variant="outline"
                onClick={() => toast('Quick message', { duration: 1000 })}
              >
                1 Second
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={() => toast('Standard message', { duration: 4000 })}
              >
                4 Seconds
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={() =>
                  toast('Persistent message', { duration: Infinity })
                }
              >
                Persistent
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>
    )
  },
}

export const ApplicationScenarios: Story = {
  args: {},
  render: () => {
    const scenarios = [
      {
        category: 'Authentication',
        examples: [
          {
            label: 'Login Success',
            icon: User,
            action: () =>
              toast.success('Welcome back!', {
                description: 'You have been successfully logged in.',
                icon: <User className="h-4 w-4" />,
              }),
          },
          {
            label: 'Password Reset',
            icon: Shield,
            action: () =>
              toast.info('Password reset email sent', {
                description: 'Check your email for reset instructions.',
                icon: <Mail className="h-4 w-4" />,
              }),
          },
          {
            label: 'Session Expired',
            icon: Clock,
            action: () =>
              toast.warning('Session expired', {
                description: 'Please log in again to continue.',
                action: {
                  label: 'Login',
                  onClick: () => toast('Redirecting to login...'),
                },
              }),
          },
        ],
      },
      {
        category: 'E-commerce',
        examples: [
          {
            label: 'Added to Cart',
            icon: ShoppingCart,
            action: () =>
              toast.success('Added to cart!', {
                description: 'iPhone 15 Pro has been added to your cart.',
                action: {
                  label: 'View Cart',
                  onClick: () => toast('Opening cart...'),
                },
              }),
          },
          {
            label: 'Order Placed',
            icon: Package,
            action: () =>
              toast.success('Order placed successfully!', {
                description: 'Your order #12345 will be delivered in 2-3 days.',
                icon: <Package className="h-4 w-4" />,
              }),
          },
          {
            label: 'Payment Error',
            icon: CreditCard,
            action: () =>
              toast.error('Payment failed', {
                description: 'Please check your payment details and try again.',
                action: {
                  label: 'Retry',
                  onClick: () => toast('Retrying payment...'),
                },
              }),
          },
        ],
      },
      {
        category: 'Social Features',
        examples: [
          {
            label: 'New Like',
            icon: Heart,
            action: () =>
              toast('Someone liked your post!', {
                description: 'Your photo has received a new like.',
                icon: <Heart className="h-4 w-4 text-red-500" />,
              }),
          },
          {
            label: 'New Follower',
            icon: User,
            action: () =>
              toast('New follower!', {
                description: 'Sarah Johnson started following you.',
                icon: (
                  <Avatar className="h-6 w-6">
                    <AvatarFallback>SJ</AvatarFallback>
                  </Avatar>
                ),
              }),
          },
          {
            label: 'Message Sent',
            icon: MessageSquare,
            action: () =>
              toast.success('Message sent!', {
                description: 'Your message has been delivered.',
                icon: <MessageSquare className="h-4 w-4" />,
              }),
          },
        ],
      },
      {
        category: 'System Notifications',
        examples: [
          {
            label: 'Backup Complete',
            icon: Database,
            action: () =>
              toast.success('Backup completed', {
                description: 'All your data has been safely backed up.',
                icon: <Database className="h-4 w-4" />,
              }),
          },
          {
            label: 'Update Available',
            icon: Download,
            action: () =>
              toast.info('Update available', {
                description: 'Version 2.1.0 is ready to install.',
                action: {
                  label: 'Update',
                  onClick: () => toast('Starting update...'),
                },
              }),
          },
          {
            label: 'Connection Lost',
            icon: WifiOff,
            action: () =>
              toast.error('Connection lost', {
                description: 'Please check your internet connection.',
                icon: <WifiOff className="h-4 w-4" />,
              }),
          },
        ],
      },
    ]

    return (
      <Card className="w-full max-w-4xl">
        <CardHeader>
          <CardTitle>Real-World Application Scenarios</CardTitle>
          <CardDescription>
            Toast notifications for common application use cases
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
            {scenarios.map((scenario) => (
              <div key={scenario.category} className="space-y-3">
                <h4 className="text-sm font-medium">{scenario.category}</h4>
                <div className="space-y-2">
                  {scenario.examples.map((example) => (
                    <Button
                      key={example.label}
                      variant="outline"
                      size="sm"
                      className="w-full justify-start"
                      onClick={example.action}
                    >
                      <example.icon className="mr-2 h-4 w-4" />
                      {example.label}
                    </Button>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    )
  },
}

export const CustomizationDemo: Story = {
  args: {},
  render: () => {
    const [customSettings, setCustomSettings] = useState({
      position: 'bottom-right',
      theme: 'system',
      duration: 4000,
      closeButton: true,
      richColors: true,
    })

    const showCustomToast = () => {
      toast.success('Custom toast notification!', {
        description: `Position: ${customSettings.position}, Duration: ${customSettings.duration}ms`,
        duration: customSettings.duration,
        // Note: These would typically be configured on the Toaster component
      })
    }

    return (
      <Card className="w-full max-w-2xl">
        <CardHeader>
          <CardTitle>Toast Customization</CardTitle>
          <CardDescription>
            Customize toast appearance and behavior
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="position">Position</Label>
              <Select
                value={customSettings.position}
                onValueChange={(value) =>
                  setCustomSettings((prev) => ({ ...prev, position: value }))
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="top-left">Top Left</SelectItem>
                  <SelectItem value="top-center">Top Center</SelectItem>
                  <SelectItem value="top-right">Top Right</SelectItem>
                  <SelectItem value="bottom-left">Bottom Left</SelectItem>
                  <SelectItem value="bottom-center">Bottom Center</SelectItem>
                  <SelectItem value="bottom-right">Bottom Right</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="duration">Duration (ms)</Label>
              <Input
                id="duration"
                type="number"
                value={customSettings.duration}
                onChange={(e) =>
                  setCustomSettings((prev) => ({
                    ...prev,
                    duration: parseInt(e.target.value, 10) || 4000,
                  }))
                }
                min="1000"
                max="10000"
                step="1000"
              />
            </div>
          </div>

          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div className="space-y-0.5">
                <Label>Close Button</Label>
                <p className="text-muted-foreground text-sm">
                  Show close button on toasts
                </p>
              </div>
              <Switch
                checked={customSettings.closeButton}
                onCheckedChange={(checked) =>
                  setCustomSettings((prev) => ({
                    ...prev,
                    closeButton: checked,
                  }))
                }
              />
            </div>

            <div className="flex items-center justify-between">
              <div className="space-y-0.5">
                <Label>Rich Colors</Label>
                <p className="text-muted-foreground text-sm">
                  Use semantic colors for toast types
                </p>
              </div>
              <Switch
                checked={customSettings.richColors}
                onCheckedChange={(checked) =>
                  setCustomSettings((prev) => ({
                    ...prev,
                    richColors: checked,
                  }))
                }
              />
            </div>
          </div>

          <Button onClick={showCustomToast} className="w-full">
            <Settings className="mr-2 h-4 w-4" />
            Show Custom Toast
          </Button>

          <div className="bg-muted rounded-lg p-4">
            <h4 className="mb-2 font-medium">Current Settings</h4>
            <div className="space-y-1 text-sm">
              <div>
                Position:{' '}
                <Badge variant="secondary">{customSettings.position}</Badge>
              </div>
              <div>
                Duration:{' '}
                <Badge variant="secondary">{customSettings.duration}ms</Badge>
              </div>
              <div>
                Close Button:{' '}
                <Badge variant="secondary">
                  {customSettings.closeButton ? 'Enabled' : 'Disabled'}
                </Badge>
              </div>
              <div>
                Rich Colors:{' '}
                <Badge variant="secondary">
                  {customSettings.richColors ? 'Enabled' : 'Disabled'}
                </Badge>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    )
  },
}

export const CoreLiveThemeShowcase: Story = {
  args: {},
  render: () => (
    <div className="w-full max-w-6xl space-y-8">
      <div className="space-y-2 text-center">
        <h2 className="text-2xl font-bold">CoreLive Sonner Components</h2>
        <p className="text-muted-foreground">
          Toast notifications showcasing CoreLive Design System integration
        </p>
      </div>

      <div className="space-y-6">
        {/* Semantic Color Toasts */}
        <Card>
          <CardHeader>
            <CardTitle>Semantic Color Integration</CardTitle>
            <CardDescription>
              Toast notifications using CoreLive Design System semantic colors
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
              {[
                {
                  color: 'primary',
                  label: 'Primary',
                  icon: Zap,
                  message: 'Primary action completed',
                  desc: 'Your main action has been processed successfully.',
                },
                {
                  color: 'secondary',
                  label: 'Secondary',
                  icon: Star,
                  message: 'Secondary action completed',
                  desc: 'Your secondary action has been processed.',
                },
                {
                  color: 'success',
                  label: 'Success',
                  icon: CheckCircle,
                  message: 'Operation successful',
                  desc: 'Everything went perfectly as expected.',
                },
                {
                  color: 'warning',
                  label: 'Warning',
                  icon: AlertTriangle,
                  message: 'Warning: Check your input',
                  desc: 'Please review before continuing.',
                },
                {
                  color: 'danger',
                  label: 'Danger',
                  icon: XCircle,
                  message: 'Error: Action failed',
                  desc: 'Something went wrong. Please try again.',
                },
                {
                  color: 'info',
                  label: 'Info',
                  icon: Info,
                  message: 'Information available',
                  desc: "Here's some useful information for you.",
                },
                {
                  color: 'discovery',
                  label: 'Discovery',
                  icon: Star,
                  message: 'New feature discovered',
                  desc: 'Check out this exciting new capability.',
                },
                {
                  color: 'accent',
                  label: 'Accent',
                  icon: Heart,
                  message: 'Special notification',
                  desc: 'This message has special importance.',
                },
              ].map((theme) => (
                <Button
                  key={theme.color}
                  variant="outline"
                  className="h-auto flex-col p-4"
                  onClick={() => {
                    if (theme.color === 'success') {
                      toast.success(theme.message, {
                        description: theme.desc,
                        icon: <theme.icon className="h-4 w-4" />,
                      })
                    } else if (theme.color === 'danger') {
                      toast.error(theme.message, {
                        description: theme.desc,
                        icon: <theme.icon className="h-4 w-4" />,
                      })
                    } else if (theme.color === 'warning') {
                      toast.warning(theme.message, {
                        description: theme.desc,
                        icon: <theme.icon className="h-4 w-4" />,
                      })
                    } else if (theme.color === 'info') {
                      toast.info(theme.message, {
                        description: theme.desc,
                        icon: <theme.icon className="h-4 w-4" />,
                      })
                    } else {
                      toast(theme.message, {
                        description: theme.desc,
                        icon: <theme.icon className="h-4 w-4" />,
                      })
                    }
                  }}
                >
                  <theme.icon className={`mb-2 h-6 w-6 text-${theme.color}`} />
                  <div className="text-center">
                    <div className="text-sm font-medium">{theme.label}</div>
                    <div className="text-muted-foreground text-xs">Toast</div>
                  </div>
                </Button>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Toast Positions */}
        <Card>
          <CardHeader>
            <CardTitle>Toast Positions</CardTitle>
            <CardDescription>
              Toasts can appear in different screen positions
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="mx-auto grid max-w-md grid-cols-3 gap-4">
              {[
                { position: 'top-left', label: 'Top Left' },
                { position: 'top-center', label: 'Top Center' },
                { position: 'top-right', label: 'Top Right' },
                { position: 'bottom-left', label: 'Bottom Left' },
                { position: 'bottom-center', label: 'Bottom Center' },
                { position: 'bottom-right', label: 'Bottom Right' },
              ].map((pos) => (
                <Button
                  key={pos.position}
                  variant="outline"
                  size="sm"
                  onClick={() =>
                    toast(`Toast from ${pos.label}`, {
                      description: `This toast appears in the ${pos.label.toLowerCase()}.`,
                    })
                  }
                >
                  {pos.label}
                </Button>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Advanced Features */}
        <Card>
          <CardHeader>
            <CardTitle>Advanced Toast Features</CardTitle>
            <CardDescription>
              Comprehensive toast functionality with CoreLive integration
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
              {/* Promise-based Toasts */}
              <div className="space-y-3">
                <h4 className="font-medium">Promise-based Operations</h4>
                <div className="space-y-2">
                  <Button
                    variant="outline"
                    size="sm"
                    className="w-full"
                    onClick={() => {
                      const promise = new Promise((resolve) => {
                        setTimeout(() => resolve({ user: 'John Doe' }), 2000)
                      })

                      toast.promise(promise, {
                        loading: 'Loading user data...',
                        success: (data: any) => `Welcome back, ${data.user}!`,
                        error: 'Failed to load user data.',
                      })
                    }}
                  >
                    <User className="mr-2 h-4 w-4" />
                    Load User Data
                  </Button>

                  <Button
                    variant="outline"
                    size="sm"
                    className="w-full"
                    onClick={() => {
                      const promise = new Promise((resolve, reject) => {
                        setTimeout(() => {
                          if (Math.random() > 0.5) {
                            resolve({ file: 'document.pdf', size: '2.4 MB' })
                          } else {
                            reject(new Error('Network timeout'))
                          }
                        }, 3000)
                      })

                      toast.promise(promise, {
                        loading: 'Uploading file...',
                        success: (data: any) =>
                          `${data.file} (${data.size}) uploaded!`,
                        error: (error) => `Upload failed: ${error.message}`,
                      })
                    }}
                  >
                    <Upload className="mr-2 h-4 w-4" />
                    Upload File
                  </Button>
                </div>
              </div>

              {/* Interactive Toasts */}
              <div className="space-y-3">
                <h4 className="font-medium">Interactive Actions</h4>
                <div className="space-y-2">
                  <Button
                    variant="outline"
                    size="sm"
                    className="w-full"
                    onClick={() =>
                      toast('Changes saved as draft', {
                        description: 'Your work is automatically saved.',
                        action: {
                          label: 'Publish',
                          onClick: () =>
                            toast.success('Published successfully!'),
                        },
                        cancel: {
                          label: 'Discard',
                          onClick: () => toast('Draft discarded'),
                        },
                      })
                    }
                  >
                    <FileText className="mr-2 h-4 w-4" />
                    Save Draft
                  </Button>

                  <Button
                    variant="outline"
                    size="sm"
                    className="w-full"
                    onClick={() =>
                      toast('5 items selected', {
                        description: 'Choose an action to perform.',
                        action: {
                          label: 'Delete All',
                          onClick: () => toast.success('All items deleted'),
                        },
                      })
                    }
                  >
                    <Package className="mr-2 h-4 w-4" />
                    Bulk Actions
                  </Button>
                </div>
              </div>
            </div>

            <Separator />

            <div className="space-y-3">
              <h4 className="font-medium">Custom Styling Examples</h4>
              <div className="flex flex-wrap gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() =>
                    toast('Rich content toast', {
                      description:
                        'This toast demonstrates rich content capabilities.',
                      duration: 5000,
                      icon: <Star className="h-4 w-4 text-yellow-500" />,
                    })
                  }
                >
                  Rich Content
                </Button>

                <Button
                  size="sm"
                  variant="outline"
                  onClick={() =>
                    toast('Long-lasting notification', {
                      description:
                        'This toast will stay visible for 10 seconds to demonstrate longer durations.',
                      duration: 10000,
                    })
                  }
                >
                  Long Duration
                </Button>

                <Button
                  size="sm"
                  variant="outline"
                  onClick={() =>
                    toast('Instant message', {
                      description: 'Quick message that disappears fast.',
                      duration: 1500,
                    })
                  }
                >
                  Quick Toast
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Design Tokens */}
        <Card>
          <CardHeader>
            <CardTitle>CoreLive Sonner Design Tokens</CardTitle>
            <CardDescription>
              Design system tokens used in toast notifications
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 gap-6 text-sm md:grid-cols-2 lg:grid-cols-3">
              <div className="space-y-3">
                <h4 className="font-medium">Background & Border</h4>
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <Badge variant="outline">--popover</Badge>
                    <span className="text-muted-foreground">
                      Toast background
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge variant="outline">--border</Badge>
                    <span className="text-muted-foreground">Toast border</span>
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
                    <Badge variant="outline">--popover-foreground</Badge>
                    <span className="text-muted-foreground">Primary text</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge variant="outline">--muted-foreground</Badge>
                    <span className="text-muted-foreground">
                      Description text
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge variant="outline">font-medium</Badge>
                    <span className="text-muted-foreground">Title weight</span>
                  </div>
                </div>
              </div>

              <div className="space-y-3">
                <h4 className="font-medium">Semantic Colors</h4>
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <Badge variant="outline">--success</Badge>
                    <span className="text-muted-foreground">
                      Success toasts
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge variant="outline">--danger</Badge>
                    <span className="text-muted-foreground">Error toasts</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge variant="outline">--warning</Badge>
                    <span className="text-muted-foreground">
                      Warning toasts
                    </span>
                  </div>
                </div>
              </div>
            </div>

            <Separator className="my-6" />

            <div className="space-y-4">
              <h4 className="font-medium">Toast Component Structure</h4>
              <div className="bg-muted/50 rounded-lg p-4">
                <div className="space-y-1 font-mono text-xs">
                  <div>Toaster (Root Component)</div>
                  <div className="pl-4">├── Toast Container</div>
                  <div className="pl-8">├── Toast Icon</div>
                  <div className="pl-8">├── Toast Content</div>
                  <div className="pl-12">├── Toast Title</div>
                  <div className="pl-12">└── Toast Description</div>
                  <div className="pl-8">├── Toast Actions</div>
                  <div className="pl-12">├── Action Button</div>
                  <div className="pl-12">└── Cancel Button</div>
                  <div className="pl-8">└── Close Button</div>
                </div>
              </div>
            </div>

            <div className="bg-muted mt-6 rounded-lg p-4">
              <div className="mb-2 flex items-center gap-2">
                <Bell className="h-4 w-4" />
                <span className="text-sm font-medium">Key Features</span>
              </div>
              <div className="text-muted-foreground space-y-2 text-sm">
                <p>
                  • <strong>Theme Integration:</strong> Automatic light/dark
                  mode support
                </p>
                <p>
                  • <strong>Promise Support:</strong> Built-in loading, success,
                  and error states
                </p>
                <p>
                  • <strong>Rich Actions:</strong> Custom action buttons and
                  cancel options
                </p>
                <p>
                  • <strong>Positioning:</strong> Six different screen positions
                  available
                </p>
                <p>
                  • <strong>Accessibility:</strong> Full keyboard navigation and
                  screen reader support
                </p>
                <p>
                  • <strong>Animations:</strong> Smooth slide-in and fade-out
                  transitions
                </p>
                <p>
                  • <strong>Stacking:</strong> Multiple toasts stack
                  automatically
                </p>
                <p>
                  • <strong>Mobile Optimized:</strong> Touch-friendly and
                  responsive design
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  ),
}
