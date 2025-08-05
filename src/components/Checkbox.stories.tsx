import type { Meta, StoryObj } from '@storybook/react'
import {
  Settings,
  Bell,
  Mail,
  Shield,
  Globe,
  Users,
  Lock,
  Eye,
  Zap,
  Star,
  Download,
  Check,
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
import { Checkbox } from '@/components/ui/checkbox'
import { Label } from '@/components/ui/label'
import { Separator } from '@/components/ui/separator'

const meta: Meta<typeof Checkbox> = {
  title: 'CoreLive Design System/Components/Checkbox',
  component: Checkbox,
  parameters: {
    layout: 'centered',
    docs: {
      description: {
        component:
          'A checkbox component with support for indeterminate state and custom styling. Built with accessibility in mind and styled with CoreLive Design System tokens.',
      },
    },
  },
  tags: ['autodocs'],
  argTypes: {
    checked: {
      control: 'boolean',
      description: 'Checked state of the checkbox',
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
  render: () => <Checkbox />,
}

export const WithLabel: Story = {
  args: {},
  render: () => (
    <div className="flex items-center space-x-2">
      <Checkbox id="terms" />
      <Label htmlFor="terms">Accept terms and conditions</Label>
    </div>
  ),
}

export const Checked: Story = {
  args: {},
  render: () => (
    <div className="flex items-center space-x-2">
      <Checkbox id="checked" defaultChecked />
      <Label htmlFor="checked">This is checked by default</Label>
    </div>
  ),
}

export const Disabled: Story = {
  args: {},
  render: () => (
    <div className="space-y-2">
      <div className="flex items-center space-x-2">
        <Checkbox id="disabled-unchecked" disabled />
        <Label htmlFor="disabled-unchecked" className="text-muted-foreground">
          Disabled unchecked
        </Label>
      </div>
      <div className="flex items-center space-x-2">
        <Checkbox id="disabled-checked" disabled defaultChecked />
        <Label htmlFor="disabled-checked" className="text-muted-foreground">
          Disabled checked
        </Label>
      </div>
    </div>
  ),
}

export const FormExample: Story = {
  args: {},
  render: () => {
    const [checkedItems, setCheckedItems] = useState({
      marketing: true,
      security: false,
      updates: true,
      comments: false,
    })

    return (
      <Card className="w-[400px]">
        <CardHeader>
          <CardTitle>Email Preferences</CardTitle>
          <CardDescription>
            Choose what types of emails you want to receive.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-3">
            <div className="flex items-start space-x-3">
              <Checkbox
                id="marketing"
                checked={checkedItems.marketing}
                onCheckedChange={(checked) =>
                  setCheckedItems({
                    ...checkedItems,
                    marketing: checked as boolean,
                  })
                }
              />
              <div className="grid gap-1.5 leading-none">
                <Label htmlFor="marketing" className="flex items-center gap-2">
                  <Mail className="h-4 w-4" />
                  Marketing emails
                </Label>
                <p className="text-muted-foreground text-sm">
                  Receive emails about new products, features, and more.
                </p>
              </div>
            </div>

            <div className="flex items-start space-x-3">
              <Checkbox
                id="security"
                checked={checkedItems.security}
                onCheckedChange={(checked) =>
                  setCheckedItems({
                    ...checkedItems,
                    security: checked as boolean,
                  })
                }
              />
              <div className="grid gap-1.5 leading-none">
                <Label htmlFor="security" className="flex items-center gap-2">
                  <Shield className="h-4 w-4" />
                  Security alerts
                </Label>
                <p className="text-muted-foreground text-sm">
                  Get notified about security updates and unusual activity.
                </p>
              </div>
            </div>

            <div className="flex items-start space-x-3">
              <Checkbox
                id="updates"
                checked={checkedItems.updates}
                onCheckedChange={(checked) =>
                  setCheckedItems({
                    ...checkedItems,
                    updates: checked as boolean,
                  })
                }
              />
              <div className="grid gap-1.5 leading-none">
                <Label htmlFor="updates" className="flex items-center gap-2">
                  <Zap className="h-4 w-4" />
                  Product updates
                </Label>
                <p className="text-muted-foreground text-sm">
                  Stay informed about the latest updates and improvements.
                </p>
              </div>
            </div>

            <div className="flex items-start space-x-3">
              <Checkbox
                id="comments"
                checked={checkedItems.comments}
                onCheckedChange={(checked) =>
                  setCheckedItems({
                    ...checkedItems,
                    comments: checked as boolean,
                  })
                }
              />
              <div className="grid gap-1.5 leading-none">
                <Label htmlFor="comments" className="flex items-center gap-2">
                  <Bell className="h-4 w-4" />
                  Comment notifications
                </Label>
                <p className="text-muted-foreground text-sm">
                  Get notified when someone comments on your posts.
                </p>
              </div>
            </div>
          </div>

          <Separator />

          <div className="flex items-center justify-between">
            <Button variant="outline" size="sm">
              Reset to defaults
            </Button>
            <Button size="sm">Save preferences</Button>
          </div>
        </CardContent>
      </Card>
    )
  },
}

export const PermissionsExample: Story = {
  args: {},
  render: () => {
    const [permissions, setPermissions] = useState({
      read: true,
      write: false,
      delete: false,
      admin: false,
    })

    const allChecked = Object.values(permissions).every(Boolean)
    const someChecked = Object.values(permissions).some(Boolean) && !allChecked

    return (
      <Card className="w-[350px]">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Shield className="h-5 w-5" />
            User Permissions
          </CardTitle>
          <CardDescription>
            Configure access levels for this user
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-3">
            <div className="flex items-center space-x-3 border-b pb-3">
              <Checkbox
                id="all"
                checked={
                  someChecked && !allChecked ? 'indeterminate' : allChecked
                }
                onCheckedChange={(checked) => {
                  const newValue = checked as boolean
                  setPermissions({
                    read: newValue,
                    write: newValue,
                    delete: newValue,
                    admin: newValue,
                  })
                }}
              />
              <Label htmlFor="all" className="font-medium">
                Select all permissions
              </Label>
            </div>

            <div className="ml-6 space-y-3">
              <div className="flex items-center space-x-3">
                <Checkbox
                  id="read"
                  checked={permissions.read}
                  onCheckedChange={(checked) =>
                    setPermissions({ ...permissions, read: checked as boolean })
                  }
                />
                <Label htmlFor="read" className="flex items-center gap-2">
                  <Eye className="text-muted-foreground h-4 w-4" />
                  Read access
                </Label>
              </div>

              <div className="flex items-center space-x-3">
                <Checkbox
                  id="write"
                  checked={permissions.write}
                  onCheckedChange={(checked) =>
                    setPermissions({
                      ...permissions,
                      write: checked as boolean,
                    })
                  }
                />
                <Label htmlFor="write" className="flex items-center gap-2">
                  <Download className="text-muted-foreground h-4 w-4" />
                  Write access
                </Label>
              </div>

              <div className="flex items-center space-x-3">
                <Checkbox
                  id="delete"
                  checked={permissions.delete}
                  onCheckedChange={(checked) =>
                    setPermissions({
                      ...permissions,
                      delete: checked as boolean,
                    })
                  }
                />
                <Label htmlFor="delete" className="flex items-center gap-2">
                  <Lock className="text-muted-foreground h-4 w-4" />
                  Delete access
                </Label>
              </div>

              <div className="flex items-center space-x-3">
                <Checkbox
                  id="admin"
                  checked={permissions.admin}
                  onCheckedChange={(checked) =>
                    setPermissions({
                      ...permissions,
                      admin: checked as boolean,
                    })
                  }
                />
                <Label htmlFor="admin" className="flex items-center gap-2">
                  <Settings className="text-muted-foreground h-4 w-4" />
                  Admin access
                  <Badge variant="secondary" className="ml-auto">
                    Pro
                  </Badge>
                </Label>
              </div>
            </div>
          </div>

          <div className="pt-2">
            <Button className="w-full">Apply Permissions</Button>
          </div>
        </CardContent>
      </Card>
    )
  },
}

export const TaskList: Story = {
  args: {},
  render: () => {
    const [tasks, setTasks] = useState([
      { id: 1, text: 'Complete project documentation', done: true },
      { id: 2, text: 'Review pull requests', done: false },
      { id: 3, text: 'Update dependencies', done: false },
      { id: 4, text: 'Write unit tests', done: true },
      { id: 5, text: 'Deploy to staging', done: false },
    ])

    const toggleTask = (id: number) => {
      setTasks(
        tasks.map((task) =>
          task.id === id ? { ...task, done: !task.done } : task,
        ),
      )
    }

    const completedCount = tasks.filter((task) => task.done).length

    return (
      <Card className="w-[400px]">
        <CardHeader>
          <CardTitle>Today's Tasks</CardTitle>
          <CardDescription>
            {completedCount} of {tasks.length} completed
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {tasks.map((task) => (
              <div
                key={task.id}
                className={`flex items-center space-x-3 rounded-lg border p-3 transition-colors ${
                  task.done ? 'bg-muted/50' : 'hover:bg-muted/50'
                }`}
              >
                <Checkbox
                  id={`task-${task.id}`}
                  checked={task.done}
                  onCheckedChange={() => toggleTask(task.id)}
                />
                <Label
                  htmlFor={`task-${task.id}`}
                  className={`flex-1 cursor-pointer ${
                    task.done ? 'text-muted-foreground line-through' : ''
                  }`}
                >
                  {task.text}
                </Label>
                {task.done && <Check className="text-success h-4 w-4" />}
              </div>
            ))}
          </div>
          <Separator className="my-4" />
          <div className="flex items-center justify-between">
            <span className="text-muted-foreground text-sm">
              Progress: {Math.round((completedCount / tasks.length) * 100)}%
            </span>
            <Button size="sm" variant="outline">
              Add Task
            </Button>
          </div>
        </CardContent>
      </Card>
    )
  },
}

export const FeaturesSelection: Story = {
  args: {},
  render: () => (
    <div className="grid w-full max-w-2xl grid-cols-1 gap-4 md:grid-cols-2">
      <Card>
        <CardHeader>
          <CardTitle>Free Plan</CardTitle>
          <CardDescription>Essential features for individuals</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex items-center space-x-3">
            <Checkbox id="free-1" checked disabled />
            <Label htmlFor="free-1" className="flex items-center gap-2">
              <Users className="h-4 w-4" />
              Up to 3 users
            </Label>
          </div>
          <div className="flex items-center space-x-3">
            <Checkbox id="free-2" checked disabled />
            <Label htmlFor="free-2" className="flex items-center gap-2">
              <Globe className="h-4 w-4" />
              Basic analytics
            </Label>
          </div>
          <div className="flex items-center space-x-3">
            <Checkbox id="free-3" checked disabled />
            <Label htmlFor="free-3" className="flex items-center gap-2">
              <Mail className="h-4 w-4" />
              Email support
            </Label>
          </div>
          <div className="flex items-center space-x-3">
            <Checkbox id="free-4" disabled />
            <Label
              htmlFor="free-4"
              className="text-muted-foreground flex items-center gap-2"
            >
              <Star className="h-4 w-4" />
              Advanced features
            </Label>
          </div>
        </CardContent>
      </Card>

      <Card className="border-primary">
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle>Pro Plan</CardTitle>
            <Badge className="bg-primary text-on-primary">Popular</Badge>
          </div>
          <CardDescription>Everything you need to scale</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex items-center space-x-3">
            <Checkbox id="pro-1" checked disabled />
            <Label htmlFor="pro-1" className="flex items-center gap-2">
              <Users className="h-4 w-4" />
              Unlimited users
            </Label>
          </div>
          <div className="flex items-center space-x-3">
            <Checkbox id="pro-2" checked disabled />
            <Label htmlFor="pro-2" className="flex items-center gap-2">
              <Globe className="h-4 w-4" />
              Advanced analytics
            </Label>
          </div>
          <div className="flex items-center space-x-3">
            <Checkbox id="pro-3" checked disabled />
            <Label htmlFor="pro-3" className="flex items-center gap-2">
              <Zap className="h-4 w-4" />
              Priority support
            </Label>
          </div>
          <div className="flex items-center space-x-3">
            <Checkbox id="pro-4" checked disabled />
            <Label htmlFor="pro-4" className="flex items-center gap-2">
              <Star className="h-4 w-4" />
              All advanced features
            </Label>
          </div>
        </CardContent>
      </Card>
    </div>
  ),
  parameters: {
    layout: 'padded',
  },
}

export const CoreLiveThemeShowcase: Story = {
  args: {},
  render: () => (
    <div className="w-full max-w-2xl space-y-6">
      <div>
        <h3 className="text-heading-3 mb-4 font-medium">Checkbox States</h3>
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-3">
            <div className="flex items-center space-x-3">
              <Checkbox
                id="default-state"
                style={{
                  borderColor: 'var(--component-checkbox-border)',
                  backgroundColor: 'var(--component-checkbox-background)',
                }}
              />
              <Label htmlFor="default-state">Default state</Label>
            </div>

            <div className="flex items-center space-x-3">
              <Checkbox
                id="checked-state"
                defaultChecked
                style={{
                  backgroundColor:
                    'var(--component-checkbox-checked-background)',
                  borderColor: 'var(--component-checkbox-checked-border)',
                }}
              />
              <Label htmlFor="checked-state">Checked state</Label>
            </div>

            <div className="flex items-center space-x-3">
              <Checkbox
                id="disabled-state"
                disabled
                style={{
                  backgroundColor:
                    'var(--component-checkbox-disabled-background)',
                  borderColor: 'var(--component-checkbox-disabled-border)',
                }}
              />
              <Label htmlFor="disabled-state" className="text-muted-foreground">
                Disabled state
              </Label>
            </div>
          </div>

          <div className="space-y-3">
            <div className="flex items-center space-x-3">
              <Checkbox
                id="focus-state"
                className="focus-visible:ring-primary"
              />
              <Label htmlFor="focus-state">Focus state (tab to see)</Label>
            </div>

            <div className="flex items-center space-x-3">
              <Checkbox id="hover-state" className="hover:border-primary" />
              <Label htmlFor="hover-state">Hover state</Label>
            </div>

            <div className="flex items-center space-x-3">
              <Checkbox id="indeterminate-state" checked="indeterminate" />
              <Label htmlFor="indeterminate-state">Indeterminate state</Label>
            </div>
          </div>
        </div>
      </div>

      <div>
        <h3 className="text-heading-3 mb-4 font-medium">
          Semantic Color Usage
        </h3>
        <div className="space-y-3">
          <Card className="border-success/20 bg-success/5">
            <CardContent className="pt-6">
              <div className="flex items-center space-x-3">
                <Checkbox
                  id="success"
                  defaultChecked
                  className="data-[state=checked]:bg-success data-[state=checked]:border-success"
                />
                <Label htmlFor="success" className="text-success font-medium">
                  Success state checkbox
                </Label>
              </div>
            </CardContent>
          </Card>

          <Card className="border-warning/20 bg-warning/5">
            <CardContent className="pt-6">
              <div className="flex items-center space-x-3">
                <Checkbox
                  id="warning"
                  defaultChecked
                  className="data-[state=checked]:bg-warning data-[state=checked]:border-warning"
                />
                <Label htmlFor="warning" className="text-warning font-medium">
                  Warning state checkbox
                </Label>
              </div>
            </CardContent>
          </Card>

          <Card className="border-danger/20 bg-danger/5">
            <CardContent className="pt-6">
              <div className="flex items-center space-x-3">
                <Checkbox
                  id="danger"
                  defaultChecked
                  className="data-[state=checked]:bg-danger data-[state=checked]:border-danger"
                />
                <Label htmlFor="danger" className="text-danger font-medium">
                  Danger state checkbox
                </Label>
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
              <div className="flex items-center gap-3">
                <input
                  type="checkbox"
                  id="custom-checkbox"
                  className="h-4 w-4 cursor-pointer rounded border transition-colors"
                  style={{
                    borderColor: 'var(--component-checkbox-border)',
                    backgroundColor: 'var(--component-checkbox-background)',
                    accentColor: 'var(--system-color-primary)',
                  }}
                />
                <Label htmlFor="custom-checkbox">
                  Custom checkbox using component tokens
                </Label>
              </div>

              <div className="bg-muted rounded-md p-3">
                <code className="text-xs">
                  --component-checkbox-border
                  <br />
                  --component-checkbox-background
                  <br />
                  --component-checkbox-checked-background
                  <br />
                  --component-checkbox-checked-border
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
          'Comprehensive showcase of checkbox variations using CoreLive Design System tokens for consistent styling across different states and contexts.',
      },
    },
  },
}
