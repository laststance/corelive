import type { Meta, StoryObj } from '@storybook/react'
import { AlertTriangle, User, Settings, Trash2, Share } from 'lucide-react'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
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
import { Textarea } from '@/components/ui/textarea'

const meta: Meta<typeof Dialog> = {
  title: 'CoreLive Design System/Components/Dialog',
  component: Dialog,
  parameters: {
    layout: 'centered',
    docs: {
      description: {
        component:
          'A modal dialog component with customizable content, built with accessibility in mind. Uses CoreLive Design System tokens for consistent elevation and styling.',
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
    <Dialog>
      <DialogTrigger asChild>
        <Button variant="outline">Open Dialog</Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>Edit profile</DialogTitle>
          <DialogDescription>
            Make changes to your profile here. Click save when you're done.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-4 py-4">
          <div className="grid grid-cols-4 items-center gap-4">
            <Label htmlFor="name" className="text-right">
              Name
            </Label>
            <Input
              id="name"
              defaultValue="Pedro Duarte"
              className="col-span-3"
            />
          </div>
          <div className="grid grid-cols-4 items-center gap-4">
            <Label htmlFor="username" className="text-right">
              Username
            </Label>
            <Input
              id="username"
              defaultValue="@peduarte"
              className="col-span-3"
            />
          </div>
        </div>
        <DialogFooter>
          <Button type="submit">Save changes</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  ),
}

export const ConfirmationDialog: Story = {
  args: {},
  render: () => (
    <Dialog>
      <DialogTrigger asChild>
        <Button variant="destructive">
          <Trash2 className="mr-2 h-4 w-4" />
          Delete Account
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <AlertTriangle className="text-destructive h-5 w-5" />
            Confirm Deletion
          </DialogTitle>
          <DialogDescription>
            This action cannot be undone. This will permanently delete your
            account and remove your data from our servers.
          </DialogDescription>
        </DialogHeader>
        <div className="py-4">
          <div className="bg-destructive/10 border-destructive/20 rounded-lg border p-4">
            <p className="text-destructive text-sm font-medium">
              Are you absolutely sure?
            </p>
            <p className="text-muted-foreground mt-1 text-sm">
              Type "DELETE" below to confirm deletion.
            </p>
          </div>
          <Input placeholder="Type DELETE to confirm" className="mt-3" />
        </div>
        <DialogFooter className="gap-2">
          <Button variant="outline">Cancel</Button>
          <Button variant="destructive">Delete Account</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  ),
}

export const CreateUserDialog: Story = {
  args: {},
  render: () => (
    <Dialog>
      <DialogTrigger asChild>
        <Button>
          <User className="mr-2 h-4 w-4" />
          Create User
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle>Create New User</DialogTitle>
          <DialogDescription>
            Add a new user to your organization. Fill in their details below.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-4 py-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="grid gap-2">
              <Label htmlFor="firstName">First Name</Label>
              <Input id="firstName" placeholder="John" />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="lastName">Last Name</Label>
              <Input id="lastName" placeholder="Doe" />
            </div>
          </div>
          <div className="grid gap-2">
            <Label htmlFor="email">Email</Label>
            <Input id="email" type="email" placeholder="john.doe@example.com" />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="role">Role</Label>
            <Select>
              <SelectTrigger>
                <SelectValue placeholder="Select a role" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="admin">Administrator</SelectItem>
                <SelectItem value="editor">Editor</SelectItem>
                <SelectItem value="viewer">Viewer</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="grid gap-2">
            <Label htmlFor="department">Department</Label>
            <Select>
              <SelectTrigger>
                <SelectValue placeholder="Select department" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="engineering">Engineering</SelectItem>
                <SelectItem value="design">Design</SelectItem>
                <SelectItem value="marketing">Marketing</SelectItem>
                <SelectItem value="sales">Sales</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="grid gap-2">
            <Label htmlFor="bio">Bio (Optional)</Label>
            <Textarea
              id="bio"
              placeholder="Tell us about this user..."
              className="min-h-[80px]"
            />
          </div>
        </div>
        <DialogFooter className="gap-2">
          <Button variant="outline">Cancel</Button>
          <Button type="submit">Create User</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  ),
}

export const SettingsDialog: Story = {
  args: {},
  render: () => (
    <Dialog>
      <DialogTrigger asChild>
        <Button variant="outline" size="icon">
          <Settings className="h-4 w-4" />
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[80vh] overflow-y-auto sm:max-w-[600px]">
        <DialogHeader>
          <DialogTitle>Settings</DialogTitle>
          <DialogDescription>
            Manage your application settings and preferences.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-6 py-4">
          <div>
            <h4 className="mb-3 text-sm font-medium">Account</h4>
            <div className="space-y-3">
              <div className="grid grid-cols-3 items-center gap-4">
                <Label htmlFor="displayName">Display Name</Label>
                <Input
                  id="displayName"
                  defaultValue="John Doe"
                  className="col-span-2"
                />
              </div>
              <div className="grid grid-cols-3 items-center gap-4">
                <Label htmlFor="email">Email</Label>
                <Input
                  id="email"
                  defaultValue="john@example.com"
                  className="col-span-2"
                  disabled
                />
              </div>
            </div>
          </div>

          <Separator />

          <div>
            <h4 className="mb-3 text-sm font-medium">Preferences</h4>
            <div className="space-y-3">
              <div className="grid grid-cols-3 items-center gap-4">
                <Label htmlFor="theme">Theme</Label>
                <Select>
                  <SelectTrigger className="col-span-2">
                    <SelectValue placeholder="Select theme" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="light">Light</SelectItem>
                    <SelectItem value="dark">Dark</SelectItem>
                    <SelectItem value="system">System</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="grid grid-cols-3 items-center gap-4">
                <Label htmlFor="language">Language</Label>
                <Select>
                  <SelectTrigger className="col-span-2">
                    <SelectValue placeholder="Select language" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="en">English</SelectItem>
                    <SelectItem value="es">Spanish</SelectItem>
                    <SelectItem value="fr">French</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>

          <Separator />

          <div>
            <h4 className="mb-3 text-sm font-medium">Notifications</h4>
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <div>
                  <Label>Email Notifications</Label>
                  <p className="text-muted-foreground text-sm">
                    Receive email updates about your account
                  </p>
                </div>
                <Badge variant="secondary">Enabled</Badge>
              </div>
              <div className="flex items-center justify-between">
                <div>
                  <Label>Push Notifications</Label>
                  <p className="text-muted-foreground text-sm">
                    Receive push notifications on your device
                  </p>
                </div>
                <Badge variant="outline">Disabled</Badge>
              </div>
            </div>
          </div>
        </div>
        <DialogFooter className="gap-2">
          <Button variant="outline">Reset</Button>
          <Button>Save Changes</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  ),
}

export const ShareDialog: Story = {
  args: {},
  render: () => (
    <Dialog>
      <DialogTrigger asChild>
        <Button variant="outline">
          <Share className="mr-2 h-4 w-4" />
          Share
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Share link</DialogTitle>
          <DialogDescription>
            Anyone who has this link will be able to view this.
          </DialogDescription>
        </DialogHeader>
        <div className="flex items-center space-x-2">
          <div className="grid flex-1 gap-2">
            <Label htmlFor="link" className="sr-only">
              Link
            </Label>
            <Input
              id="link"
              defaultValue="https://ui.shadcn.com/docs/installation"
              readOnly
            />
          </div>
          <Button type="submit" size="sm" className="px-3">
            <span className="sr-only">Copy</span>
            Copy
          </Button>
        </div>
        <DialogFooter className="sm:justify-start">
          <Button type="button" variant="secondary">
            Close
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  ),
}

export const CoreLiveThemeShowcase: Story = {
  args: {},
  render: () => (
    <div className="flex flex-wrap gap-4">
      <Dialog>
        <DialogTrigger asChild>
          <Button className="bg-primary hover:bg-primary-hover text-on-primary">
            Primary Dialog
          </Button>
        </DialogTrigger>
        <DialogContent
          className="sm:max-w-[425px]"
          style={{
            backgroundColor: 'var(--component-modal-background)',
            borderColor: 'var(--component-modal-border)',
            boxShadow: 'var(--component-modal-shadow)',
          }}
        >
          <DialogHeader>
            <DialogTitle className="text-primary">CoreLive Modal</DialogTitle>
            <DialogDescription>
              This dialog uses CoreLive Design System component tokens for
              styling.
            </DialogDescription>
          </DialogHeader>
          <div className="py-4">
            <div className="space-y-4">
              <div
                className="rounded-lg border p-4"
                style={{
                  backgroundColor: 'var(--system-color-primary-container)',
                  borderColor: 'var(--system-color-primary-outline)',
                  color: 'var(--system-color-primary-on-container)',
                }}
              >
                <p className="text-sm font-medium">Primary Container</p>
                <p className="text-sm opacity-80">Using system color tokens</p>
              </div>

              <div
                className="rounded-lg border p-4"
                style={{
                  backgroundColor: 'var(--system-color-success-container)',
                  borderColor: 'var(--system-color-success-outline)',
                  color: 'var(--system-color-success-on-container)',
                }}
              >
                <p className="text-sm font-medium">Success Container</p>
                <p className="text-sm opacity-80">Semantic color variation</p>
              </div>
            </div>
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline">Cancel</Button>
            <Button className="bg-primary hover:bg-primary-hover text-on-primary">
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog>
        <DialogTrigger asChild>
          <Button className="bg-accent hover:bg-accent-hover text-on-accent">
            Accent Dialog
          </Button>
        </DialogTrigger>
        <DialogContent className="sm:max-w-[425px]">
          <DialogHeader>
            <DialogTitle className="text-accent">Accent Themed</DialogTitle>
            <DialogDescription>
              Dialog with accent color theming and elevation.
            </DialogDescription>
          </DialogHeader>
          <div
            className="rounded-lg px-4 py-4"
            style={{
              backgroundColor: 'var(--system-color-accent-container)',
              color: 'var(--system-color-accent-on-container)',
            }}
          >
            <p className="text-sm">
              This content area uses accent container colors for a cohesive
              design.
            </p>
          </div>
          <DialogFooter>
            <Button className="bg-accent hover:bg-accent-hover text-on-accent">
              Continue
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog>
        <DialogTrigger asChild>
          <Button variant="destructive">
            <AlertTriangle className="mr-2 h-4 w-4" />
            Warning Dialog
          </Button>
        </DialogTrigger>
        <DialogContent className="sm:max-w-[425px]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <AlertTriangle className="text-danger h-5 w-5" />
              <span className="text-danger">Danger Zone</span>
            </DialogTitle>
            <DialogDescription>
              This is a destructive action that cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <div
            className="rounded-lg border px-4 py-4"
            style={{
              backgroundColor: 'var(--system-color-danger-container)',
              borderColor: 'var(--system-color-danger-outline)',
              color: 'var(--system-color-danger-on-container)',
            }}
          >
            <p className="text-sm font-medium">Warning!</p>
            <p className="text-sm opacity-90">
              This action will permanently delete all data.
            </p>
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline">Cancel</Button>
            <Button className="bg-danger hover:bg-danger-hover text-white">
              Confirm Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  ),
  parameters: {
    docs: {
      description: {
        story:
          'Showcase of dialogs using different CoreLive Design System color themes and component tokens for consistent styling.',
      },
    },
  },
}
