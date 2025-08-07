import type { Meta, StoryObj } from '@storybook/react'
import {
  AlertCircle,
  CheckCircle,
  Info,
  Terminal,
  TriangleAlert,
  X,
  Bell,
  Zap,
  Shield,
  Download,
  Mail,
} from 'lucide-react'

import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'

const meta: Meta<typeof Alert> = {
  title: 'CoreLive Design System/Components/Alert',
  component: Alert,
  parameters: {
    layout: 'centered',
    docs: {
      description: {
        component:
          "An alert displays a short, important message in a way that attracts the user's attention without interrupting the user's task. Uses CoreLive Design System tokens for consistent semantic colors.",
      },
    },
  },
  tags: ['autodocs'],
  argTypes: {
    variant: {
      control: 'select',
      options: ['default', 'destructive'],
      description: 'Visual style variant of the alert',
    },
  },
}

export default meta
type Story = StoryObj<typeof meta>

export const Default: Story = {
  args: {},
  render: () => (
    <Alert>
      <Terminal className="h-4 w-4" />
      <AlertTitle>Heads up!</AlertTitle>
      <AlertDescription>
        You can add components and dependencies to your app using the cli.
      </AlertDescription>
    </Alert>
  ),
}

export const Destructive: Story = {
  args: {
    variant: 'destructive',
  },
  render: (args: Story['args']) => (
    <Alert {...args}>
      <AlertCircle className="h-4 w-4" />
      <AlertTitle>Error</AlertTitle>
      <AlertDescription>
        Your session has expired. Please log in again.
      </AlertDescription>
    </Alert>
  ),
}

export const Success: Story = {
  args: {},
  render: () => (
    <Alert className="border-success/50 text-success dark:border-success [&>svg]:text-success">
      <CheckCircle className="h-4 w-4" />
      <AlertTitle>Success</AlertTitle>
      <AlertDescription>
        Your changes have been saved successfully.
      </AlertDescription>
    </Alert>
  ),
}

export const Warning: Story = {
  args: {},
  render: () => (
    <Alert className="border-warning/50 text-warning dark:border-warning [&>svg]:text-warning">
      <TriangleAlert className="h-4 w-4" />
      <AlertTitle>Warning</AlertTitle>
      <AlertDescription>
        This action cannot be undone. Please proceed with caution.
      </AlertDescription>
    </Alert>
  ),
}

export const InfoAlert: Story = {
  args: {},
  render: () => (
    <Alert className="border-info/50 text-info dark:border-info [&>svg]:text-info">
      <Info className="h-4 w-4" />
      <AlertTitle>Information</AlertTitle>
      <AlertDescription>
        New features are now available. Check out what's new!
      </AlertDescription>
    </Alert>
  ),
}

export const WithoutTitle: Story = {
  args: {},
  render: () => (
    <Alert>
      <Terminal className="h-4 w-4" />
      <AlertDescription>
        You can add components to your app using the cli.
      </AlertDescription>
    </Alert>
  ),
}

export const WithActions: Story = {
  args: {},
  render: () => (
    <Alert>
      <Bell className="h-4 w-4" />
      <AlertTitle>Update Available</AlertTitle>
      <AlertDescription className="flex items-center justify-between">
        <span>A new version of the application is ready to install.</span>
        <div className="ml-4 flex gap-2">
          <Button size="sm" variant="outline">
            Later
          </Button>
          <Button size="sm">
            <Download className="mr-2 h-4 w-4" />
            Update
          </Button>
        </div>
      </AlertDescription>
    </Alert>
  ),
}

export const Dismissible: Story = {
  args: {},
  render: () => (
    <Alert className="relative">
      <Info className="h-4 w-4" />
      <AlertTitle>New Message</AlertTitle>
      <AlertDescription>
        You have received a new message from your team.
      </AlertDescription>
      <Button
        variant="ghost"
        size="icon"
        className="absolute top-2 right-2 h-6 w-6"
      >
        <X className="h-4 w-4" />
      </Button>
    </Alert>
  ),
}

export const AllVariants: Story = {
  args: {},
  render: () => (
    <div className="w-full max-w-2xl space-y-4">
      <Alert>
        <Info className="h-4 w-4" />
        <AlertTitle>Information</AlertTitle>
        <AlertDescription>
          This is a default informational alert.
        </AlertDescription>
      </Alert>

      <Alert className="border-success/50 text-success dark:border-success [&>svg]:text-success">
        <CheckCircle className="h-4 w-4" />
        <AlertTitle>Success</AlertTitle>
        <AlertDescription>Operation completed successfully.</AlertDescription>
      </Alert>

      <Alert className="border-warning/50 text-warning dark:border-warning [&>svg]:text-warning">
        <TriangleAlert className="h-4 w-4" />
        <AlertTitle>Warning</AlertTitle>
        <AlertDescription>
          Please review your settings before continuing.
        </AlertDescription>
      </Alert>

      <Alert variant="destructive">
        <AlertCircle className="h-4 w-4" />
        <AlertTitle>Error</AlertTitle>
        <AlertDescription>
          Something went wrong. Please try again.
        </AlertDescription>
      </Alert>
    </div>
  ),
  parameters: {
    layout: 'padded',
    docs: {
      description: {
        story:
          'All alert variants showcased together with their semantic colors.',
      },
    },
  },
}

export const ComplexAlerts: Story = {
  args: {},
  render: () => (
    <div className="w-full max-w-2xl space-y-6">
      <Alert className="border-success/50 text-success dark:border-success [&>svg]:text-success">
        <CheckCircle className="h-4 w-4" />
        <AlertTitle>Deployment Successful</AlertTitle>
        <AlertDescription>
          <div className="space-y-2">
            <p>
              Your application has been deployed successfully to production.
            </p>
            <div className="flex items-center gap-4 text-sm">
              <span>Build ID: #3421</span>
              <span>Deploy time: 2m 34s</span>
            </div>
            <Button size="sm" variant="outline" className="mt-2">
              View Deployment
            </Button>
          </div>
        </AlertDescription>
      </Alert>

      <Alert className="border-warning/50 text-warning dark:border-warning [&>svg]:text-warning">
        <Zap className="h-4 w-4" />
        <AlertTitle className="flex items-center justify-between">
          <span>Performance Warning</span>
          <Button variant="ghost" size="icon" className="h-6 w-6">
            <X className="h-4 w-4" />
          </Button>
        </AlertTitle>
        <AlertDescription>
          <div className="space-y-2">
            <p>
              Your API response times have increased by 40% in the last hour.
            </p>
            <div className="flex gap-2">
              <Button size="sm" variant="outline">
                View Metrics
              </Button>
              <Button size="sm">Investigate</Button>
            </div>
          </div>
        </AlertDescription>
      </Alert>

      <Alert className="border-info/50 text-info dark:border-info [&>svg]:text-info">
        <Mail className="h-4 w-4" />
        <AlertTitle>Email Verification</AlertTitle>
        <AlertDescription>
          <div className="space-y-3">
            <p>We've sent a verification email to your address.</p>
            <div className="bg-background/50 rounded border p-3">
              <code className="text-sm">john.doe@example.com</code>
            </div>
            <div className="flex items-center gap-2">
              <Button size="sm">Resend Email</Button>
              <Button size="sm" variant="outline">
                Change Email
              </Button>
            </div>
          </div>
        </AlertDescription>
      </Alert>

      <Alert variant="destructive">
        <Shield className="h-4 w-4" />
        <AlertTitle>Security Alert</AlertTitle>
        <AlertDescription>
          <div className="space-y-2">
            <p>Unusual login activity detected from a new device.</p>
            <div className="space-y-1 text-sm">
              <div>Location: San Francisco, CA</div>
              <div>Device: Chrome on macOS</div>
              <div>Time: 2 minutes ago</div>
            </div>
            <div className="flex gap-2">
              <Button size="sm" variant="destructive">
                Secure Account
              </Button>
              <Button size="sm" variant="outline">
                Not Me
              </Button>
            </div>
          </div>
        </AlertDescription>
      </Alert>
    </div>
  ),
  parameters: {
    layout: 'padded',
    docs: {
      description: {
        story:
          'Complex alert examples with additional content, actions, and detailed information.',
      },
    },
  },
}

export const CoreLiveThemeShowcase: Story = {
  args: {},
  render: () => (
    <div className="w-full max-w-2xl space-y-6">
      <div>
        <h3 className="text-heading-3 mb-4 font-medium">Alert States</h3>
        <div className="space-y-3">
          <Alert
            style={{
              backgroundColor: 'var(--component-alert-background)',
              borderColor: 'var(--component-alert-border)',
              color: 'var(--component-alert-text)',
            }}
          >
            <Info className="h-4 w-4" />
            <AlertTitle>Default Alert</AlertTitle>
            <AlertDescription>
              Using component alert tokens for styling.
            </AlertDescription>
          </Alert>

          <Alert
            style={{
              backgroundColor: 'var(--system-color-success-container)',
              borderColor: 'var(--system-color-success-outline)',
              color: 'var(--system-color-success-on-container)',
            }}
          >
            <CheckCircle className="h-4 w-4" />
            <AlertTitle>Success Alert</AlertTitle>
            <AlertDescription>
              Using success semantic color tokens.
            </AlertDescription>
          </Alert>

          <Alert
            style={{
              backgroundColor: 'var(--system-color-warning-container)',
              borderColor: 'var(--system-color-warning-outline)',
              color: 'var(--system-color-warning-on-container)',
            }}
          >
            <TriangleAlert className="h-4 w-4" />
            <AlertTitle>Warning Alert</AlertTitle>
            <AlertDescription>
              Using warning semantic color tokens.
            </AlertDescription>
          </Alert>

          <Alert
            style={{
              backgroundColor: 'var(--system-color-danger-container)',
              borderColor: 'var(--system-color-danger-outline)',
              color: 'var(--system-color-danger-on-container)',
            }}
          >
            <AlertCircle className="h-4 w-4" />
            <AlertTitle>Danger Alert</AlertTitle>
            <AlertDescription>
              Using danger semantic color tokens.
            </AlertDescription>
          </Alert>
        </div>
      </div>

      <div>
        <h3 className="text-heading-3 mb-4 font-medium">
          Custom Alert Styling
        </h3>
        <div className="space-y-3">
          <div
            className="rounded-lg border-l-4 p-4 transition-colors"
            style={{
              backgroundColor: 'var(--system-color-primary-container)',
              borderLeftColor: 'var(--system-color-primary)',
              color: 'var(--system-color-primary-on-container)',
            }}
          >
            <div className="flex items-start gap-3">
              <Info className="mt-0.5 h-5 w-5" />
              <div>
                <h4 className="mb-1 font-semibold">Custom Alert Style</h4>
                <p className="text-sm">
                  Custom alert implementation using CoreLive primary color
                  tokens.
                </p>
              </div>
            </div>
          </div>

          <div
            className="rounded-lg border p-4 transition-colors"
            style={{
              backgroundColor: 'var(--system-color-accent-container)',
              borderColor: 'var(--system-color-accent-outline)',
              color: 'var(--system-color-accent-on-container)',
            }}
          >
            <div className="flex items-start gap-3">
              <Zap className="mt-0.5 h-5 w-5" />
              <div>
                <h4 className="mb-1 font-semibold">Accent Alert</h4>
                <p className="text-sm">
                  Using accent color tokens for special announcements.
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div>
        <h3 className="text-heading-3 mb-4 font-medium">Token Reference</h3>
        <Alert>
          <Terminal className="h-4 w-4" />
          <AlertTitle>Available Alert Tokens</AlertTitle>
          <AlertDescription>
            <div className="space-y-2 font-mono text-sm">
              <div>Background: var(--component-alert-background)</div>
              <div>Border: var(--component-alert-border)</div>
              <div>Text: var(--component-alert-text)</div>
              <div>Success: var(--system-color-success-container)</div>
              <div>Warning: var(--system-color-warning-container)</div>
              <div>Danger: var(--system-color-danger-container)</div>
            </div>
          </AlertDescription>
        </Alert>
      </div>
    </div>
  ),
  parameters: {
    layout: 'padded',
    docs: {
      description: {
        story:
          'Comprehensive showcase of alert variations using CoreLive Design System tokens for consistent semantic color usage and styling.',
      },
    },
  },
}
