import type { Meta, StoryObj } from '@storybook/react'
import {
  Moon,
  Sun,
  Bell,
  BellOff,
  Wifi,
  WifiOff,
  Bluetooth,
  Volume2,
  VolumeX,
  Eye,
  EyeOff,
  Shield,
  Lock,
  Zap,
  Smartphone,
  Laptop,
  Globe,
  Mail,
  MessageCircle,
  Mic,
  MicOff,
  Video,
  VideoOff,
} from 'lucide-react'
import { useState } from 'react'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { Label } from '@/components/ui/label'
import { Separator } from '@/components/ui/separator'
import { Switch } from '@/components/ui/switch'

const meta: Meta<typeof Switch> = {
  title: 'CoreLive Design System/Components/Switch',
  component: Switch,
  parameters: {
    layout: 'centered',
    docs: {
      description: {
        component:
          'A toggle switch component for binary on/off states. Accessible and styled with CoreLive Design System tokens for consistent appearance.',
      },
    },
  },
  tags: ['autodocs'],
  argTypes: {
    checked: {
      control: 'boolean',
      description: 'Checked state of the switch',
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
  render: () => <Switch />,
}

export const WithLabel: Story = {
  args: {},
  render: () => (
    <div className="flex items-center space-x-2">
      <Switch id="airplane-mode" />
      <Label htmlFor="airplane-mode">Airplane Mode</Label>
    </div>
  ),
}

export const Checked: Story = {
  args: {},
  render: () => (
    <div className="flex items-center space-x-2">
      <Switch id="checked" defaultChecked />
      <Label htmlFor="checked">Enabled by default</Label>
    </div>
  ),
}

export const Disabled: Story = {
  args: {},
  render: () => (
    <div className="space-y-2">
      <div className="flex items-center space-x-2">
        <Switch id="disabled-off" disabled />
        <Label htmlFor="disabled-off" className="text-muted-foreground">
          Disabled (Off)
        </Label>
      </div>
      <div className="flex items-center space-x-2">
        <Switch id="disabled-on" disabled defaultChecked />
        <Label htmlFor="disabled-on" className="text-muted-foreground">
          Disabled (On)
        </Label>
      </div>
    </div>
  ),
}

export const WithIcons: Story = {
  args: {},
  render: () => {
    const [darkMode, setDarkMode] = useState(false)
    const [notifications, setNotifications] = useState(true)
    const [wifi, setWifi] = useState(true)
    const [bluetooth, setBluetooth] = useState(false)

    return (
      <div className="w-[300px] space-y-4">
        <div className="flex items-center justify-between">
          <Label htmlFor="dark-mode" className="flex items-center gap-2">
            {darkMode ? (
              <Moon className="h-4 w-4" />
            ) : (
              <Sun className="h-4 w-4" />
            )}
            Dark Mode
          </Label>
          <Switch
            id="dark-mode"
            checked={darkMode}
            onCheckedChange={setDarkMode}
          />
        </div>

        <div className="flex items-center justify-between">
          <Label htmlFor="notifications" className="flex items-center gap-2">
            {notifications ? (
              <Bell className="h-4 w-4" />
            ) : (
              <BellOff className="h-4 w-4" />
            )}
            Notifications
          </Label>
          <Switch
            id="notifications"
            checked={notifications}
            onCheckedChange={setNotifications}
          />
        </div>

        <div className="flex items-center justify-between">
          <Label htmlFor="wifi" className="flex items-center gap-2">
            {wifi ? (
              <Wifi className="h-4 w-4" />
            ) : (
              <WifiOff className="h-4 w-4" />
            )}
            Wi-Fi
          </Label>
          <Switch id="wifi" checked={wifi} onCheckedChange={setWifi} />
        </div>

        <div className="flex items-center justify-between">
          <Label htmlFor="bluetooth" className="flex items-center gap-2">
            <Bluetooth className="h-4 w-4" />
            Bluetooth
          </Label>
          <Switch
            id="bluetooth"
            checked={bluetooth}
            onCheckedChange={setBluetooth}
          />
        </div>
      </div>
    )
  },
}

export const SettingsPanel: Story = {
  args: {},
  render: () => {
    const [settings, setSettings] = useState({
      darkMode: true,
      notifications: true,
      emailAlerts: false,
      autoSave: true,
      analytics: false,
      publicProfile: true,
    })

    const updateSetting = (key: string, value: boolean) => {
      setSettings({ ...settings, [key]: value })
    }

    return (
      <Card className="w-[400px]">
        <CardHeader>
          <CardTitle>Application Settings</CardTitle>
          <CardDescription>
            Manage your app preferences and privacy settings
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div>
            <h4 className="mb-3 text-sm font-medium">Appearance</h4>
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label htmlFor="dark-mode" className="text-base">
                    Dark Mode
                  </Label>
                  <p className="text-muted-foreground text-sm">
                    Use dark theme across the application
                  </p>
                </div>
                <Switch
                  id="dark-mode"
                  checked={settings.darkMode}
                  onCheckedChange={(checked) =>
                    updateSetting('darkMode', checked)
                  }
                />
              </div>
            </div>
          </div>

          <Separator />

          <div>
            <h4 className="mb-3 text-sm font-medium">Notifications</h4>
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label htmlFor="notifications" className="text-base">
                    Push Notifications
                  </Label>
                  <p className="text-muted-foreground text-sm">
                    Receive push notifications on your device
                  </p>
                </div>
                <Switch
                  id="notifications"
                  checked={settings.notifications}
                  onCheckedChange={(checked) =>
                    updateSetting('notifications', checked)
                  }
                />
              </div>

              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label htmlFor="email-alerts" className="text-base">
                    Email Alerts
                  </Label>
                  <p className="text-muted-foreground text-sm">
                    Get important updates via email
                  </p>
                </div>
                <Switch
                  id="email-alerts"
                  checked={settings.emailAlerts}
                  onCheckedChange={(checked) =>
                    updateSetting('emailAlerts', checked)
                  }
                />
              </div>
            </div>
          </div>

          <Separator />

          <div>
            <h4 className="mb-3 text-sm font-medium">Privacy & Data</h4>
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label htmlFor="analytics" className="text-base">
                    Analytics
                  </Label>
                  <p className="text-muted-foreground text-sm">
                    Help improve the app by sharing usage data
                  </p>
                </div>
                <Switch
                  id="analytics"
                  checked={settings.analytics}
                  onCheckedChange={(checked) =>
                    updateSetting('analytics', checked)
                  }
                />
              </div>

              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label htmlFor="public-profile" className="text-base">
                    Public Profile
                  </Label>
                  <p className="text-muted-foreground text-sm">
                    Make your profile visible to other users
                  </p>
                </div>
                <Switch
                  id="public-profile"
                  checked={settings.publicProfile}
                  onCheckedChange={(checked) =>
                    updateSetting('publicProfile', checked)
                  }
                />
              </div>
            </div>
          </div>

          <div className="pt-2">
            <Button className="w-full">Save Settings</Button>
          </div>
        </CardContent>
      </Card>
    )
  },
}

export const FeatureToggles: Story = {
  args: {},
  render: () => (
    <div className="grid w-full max-w-3xl grid-cols-1 gap-4 md:grid-cols-2">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Shield className="h-5 w-5" />
            Security Features
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between">
            <Label htmlFor="2fa" className="flex items-center gap-2">
              <Lock className="h-4 w-4" />
              Two-Factor Auth
            </Label>
            <Switch id="2fa" defaultChecked />
          </div>

          <div className="flex items-center justify-between">
            <Label htmlFor="biometric" className="flex items-center gap-2">
              <Smartphone className="h-4 w-4" />
              Biometric Login
            </Label>
            <Switch id="biometric" />
          </div>

          <div className="flex items-center justify-between">
            <Label htmlFor="session" className="flex items-center gap-2">
              <Laptop className="h-4 w-4" />
              Session Timeout
            </Label>
            <Switch id="session" defaultChecked />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Globe className="h-5 w-5" />
            Communication
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between">
            <Label htmlFor="email" className="flex items-center gap-2">
              <Mail className="h-4 w-4" />
              Email Updates
            </Label>
            <Switch id="email" defaultChecked />
          </div>

          <div className="flex items-center justify-between">
            <Label htmlFor="chat" className="flex items-center gap-2">
              <MessageCircle className="h-4 w-4" />
              Chat Messages
            </Label>
            <Switch id="chat" defaultChecked />
          </div>

          <div className="flex items-center justify-between">
            <Label htmlFor="marketing" className="flex items-center gap-2">
              <Zap className="h-4 w-4" />
              Marketing
            </Label>
            <Switch id="marketing" />
          </div>
        </CardContent>
      </Card>
    </div>
  ),
  parameters: {
    layout: 'padded',
  },
}

export const MediaControls: Story = {
  args: {},
  render: () => {
    const [audio, setAudio] = useState(true)
    const [video, setVideo] = useState(false)
    const [mic, setMic] = useState(true)

    return (
      <Card className="w-[350px]">
        <CardHeader>
          <CardTitle>Meeting Controls</CardTitle>
          <CardDescription>
            Manage your audio and video settings
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="bg-muted/50 flex items-center justify-between rounded-lg p-3">
            <Label
              htmlFor="mic"
              className="flex cursor-pointer items-center gap-2"
            >
              {mic ? (
                <Mic className="h-4 w-4" />
              ) : (
                <MicOff className="text-muted-foreground h-4 w-4" />
              )}
              Microphone
              {mic && (
                <Badge variant="secondary" className="ml-2">
                  Active
                </Badge>
              )}
            </Label>
            <Switch id="mic" checked={mic} onCheckedChange={setMic} />
          </div>

          <div className="bg-muted/50 flex items-center justify-between rounded-lg p-3">
            <Label
              htmlFor="video"
              className="flex cursor-pointer items-center gap-2"
            >
              {video ? (
                <Video className="h-4 w-4" />
              ) : (
                <VideoOff className="text-muted-foreground h-4 w-4" />
              )}
              Camera
              {video && (
                <Badge variant="secondary" className="ml-2">
                  Active
                </Badge>
              )}
            </Label>
            <Switch id="video" checked={video} onCheckedChange={setVideo} />
          </div>

          <div className="bg-muted/50 flex items-center justify-between rounded-lg p-3">
            <Label
              htmlFor="audio"
              className="flex cursor-pointer items-center gap-2"
            >
              {audio ? (
                <Volume2 className="h-4 w-4" />
              ) : (
                <VolumeX className="text-muted-foreground h-4 w-4" />
              )}
              Speaker
              {audio && (
                <Badge variant="secondary" className="ml-2">
                  Active
                </Badge>
              )}
            </Label>
            <Switch id="audio" checked={audio} onCheckedChange={setAudio} />
          </div>

          <Separator />

          <div className="flex justify-center gap-2">
            <Button variant="outline" size="sm">
              Test Audio
            </Button>
            <Button variant="outline" size="sm">
              Test Video
            </Button>
          </div>
        </CardContent>
      </Card>
    )
  },
}

export const PrivacyToggles: Story = {
  args: {},
  render: () => {
    const [privacy, setPrivacy] = useState({
      profile: true,
      activity: false,
      location: false,
      data: true,
    })

    return (
      <Card className="w-[400px]">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Eye className="h-5 w-5" />
            Privacy Settings
          </CardTitle>
          <CardDescription>
            Control what information is visible to others
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div className="space-y-0.5">
                <Label
                  htmlFor="profile-visibility"
                  className="flex items-center gap-2 text-base"
                >
                  {privacy.profile ? (
                    <Eye className="h-4 w-4" />
                  ) : (
                    <EyeOff className="h-4 w-4" />
                  )}
                  Profile Visibility
                </Label>
                <p className="text-muted-foreground text-sm">
                  Others can view your profile information
                </p>
              </div>
              <Switch
                id="profile-visibility"
                checked={privacy.profile}
                onCheckedChange={(checked) =>
                  setPrivacy({ ...privacy, profile: checked })
                }
              />
            </div>

            <div className="flex items-center justify-between">
              <div className="space-y-0.5">
                <Label htmlFor="activity-status" className="text-base">
                  Activity Status
                </Label>
                <p className="text-muted-foreground text-sm">
                  Show when you're online
                </p>
              </div>
              <Switch
                id="activity-status"
                checked={privacy.activity}
                onCheckedChange={(checked) =>
                  setPrivacy({ ...privacy, activity: checked })
                }
              />
            </div>

            <div className="flex items-center justify-between">
              <div className="space-y-0.5">
                <Label htmlFor="location-sharing" className="text-base">
                  Location Sharing
                </Label>
                <p className="text-muted-foreground text-sm">
                  Share your location with the app
                </p>
              </div>
              <Switch
                id="location-sharing"
                checked={privacy.location}
                onCheckedChange={(checked) =>
                  setPrivacy({ ...privacy, location: checked })
                }
              />
            </div>

            <div className="flex items-center justify-between">
              <div className="space-y-0.5">
                <Label htmlFor="data-collection" className="text-base">
                  Data Collection
                </Label>
                <p className="text-muted-foreground text-sm">
                  Allow anonymous usage statistics
                </p>
              </div>
              <Switch
                id="data-collection"
                checked={privacy.data}
                onCheckedChange={(checked) =>
                  setPrivacy({ ...privacy, data: checked })
                }
              />
            </div>
          </div>

          <Separator />

          <div className="space-y-2 pt-2">
            <Button className="w-full">Update Privacy Settings</Button>
            <Button variant="outline" className="w-full">
              Reset to Defaults
            </Button>
          </div>
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
        <h3 className="text-heading-3 mb-4 font-medium">Switch States</h3>
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-3">
            <div className="flex items-center justify-between rounded-lg border p-3">
              <Label htmlFor="default-off">Default (Off)</Label>
              <Switch
                id="default-off"
                style={{
                  backgroundColor: 'var(--component-switch-background)',
                  borderColor: 'var(--component-switch-border)',
                }}
              />
            </div>

            <div className="flex items-center justify-between rounded-lg border p-3">
              <Label htmlFor="default-on">Default (On)</Label>
              <Switch
                id="default-on"
                defaultChecked
                style={{
                  backgroundColor: 'var(--component-switch-checked-background)',
                  borderColor: 'var(--component-switch-checked-border)',
                }}
              />
            </div>

            <div className="flex items-center justify-between rounded-lg border p-3">
              <Label
                htmlFor="disabled-switch"
                className="text-muted-foreground"
              >
                Disabled
              </Label>
              <Switch
                id="disabled-switch"
                disabled
                style={{
                  backgroundColor:
                    'var(--component-switch-disabled-background)',
                  borderColor: 'var(--component-switch-disabled-border)',
                }}
              />
            </div>
          </div>

          <div className="space-y-3">
            <div className="flex items-center justify-between rounded-lg border p-3">
              <Label htmlFor="focus-switch">Focus state (tab to see)</Label>
              <Switch
                id="focus-switch"
                className="focus-visible:ring-primary"
              />
            </div>

            <div className="flex items-center justify-between rounded-lg border p-3">
              <Label htmlFor="hover-switch">Hover state</Label>
              <Switch id="hover-switch" className="hover:bg-muted" />
            </div>

            <div className="flex items-center justify-between rounded-lg border p-3">
              <Label
                htmlFor="loading-switch"
                className="flex items-center gap-2"
              >
                Loading state
                <div className="border-muted-foreground h-4 w-4 animate-spin rounded-full border-2 border-t-transparent" />
              </Label>
              <Switch id="loading-switch" disabled />
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
                <Label
                  htmlFor="success-switch"
                  className="text-success font-medium"
                >
                  Success State
                </Label>
                <Switch
                  id="success-switch"
                  defaultChecked
                  className="data-[state=checked]:bg-success"
                />
              </div>
            </CardContent>
          </Card>

          <Card className="border-warning/20 bg-warning/5">
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <Label
                  htmlFor="warning-switch"
                  className="text-warning font-medium"
                >
                  Warning State
                </Label>
                <Switch
                  id="warning-switch"
                  defaultChecked
                  className="data-[state=checked]:bg-warning"
                />
              </div>
            </CardContent>
          </Card>

          <Card className="border-danger/20 bg-danger/5">
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <Label
                  htmlFor="danger-switch"
                  className="text-danger font-medium"
                >
                  Danger State
                </Label>
                <Switch
                  id="danger-switch"
                  className="data-[state=checked]:bg-danger"
                />
              </div>
            </CardContent>
          </Card>

          <Card className="border-info/20 bg-info/5">
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <Label htmlFor="info-switch" className="text-info font-medium">
                  Info State
                </Label>
                <Switch
                  id="info-switch"
                  defaultChecked
                  className="data-[state=checked]:bg-info"
                />
              </div>
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
              <div className="flex items-center justify-between">
                <Label htmlFor="custom-switch">
                  Custom switch using component tokens
                </Label>
                <label className="relative inline-flex cursor-pointer items-center">
                  <input
                    type="checkbox"
                    id="custom-switch"
                    className="peer sr-only"
                  />
                  <div
                    className="peer h-6 w-11 rounded-full transition-colors duration-200 ease-in-out after:absolute after:top-[2px] after:left-[2px] after:h-5 after:w-5 after:rounded-full after:bg-white after:transition-all after:content-[''] peer-checked:after:translate-x-full peer-checked:after:border-white"
                    style={{
                      backgroundColor: 'var(--component-switch-background)',
                      borderColor: 'var(--component-switch-border)',
                    }}
                  />
                </label>
              </div>

              <div className="bg-muted rounded-md p-3">
                <code className="text-xs">
                  --component-switch-background
                  <br />
                  --component-switch-border
                  <br />
                  --component-switch-checked-background
                  <br />
                  --component-switch-checked-border
                  <br />
                  --component-switch-thumb-background
                </code>
              </div>
            </div>
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
          'Comprehensive showcase of switch variations using CoreLive Design System tokens for consistent styling across different states and contexts.',
      },
    },
  },
}
