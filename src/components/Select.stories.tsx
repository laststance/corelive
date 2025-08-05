import type { Meta, StoryObj } from '@storybook/react'
import { Globe, Flag, Building2, User, Settings } from 'lucide-react'

import { Badge } from '@/components/ui/badge'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'

const meta: Meta<typeof Select> = {
  title: 'CoreLive Design System/Components/Select',
  component: Select,
  parameters: {
    layout: 'centered',
    docs: {
      description: {
        component:
          'A customizable select dropdown component with keyboard navigation and accessibility support. Styled with CoreLive Design System tokens for consistent appearance across themes.',
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
    <Select>
      <SelectTrigger className="w-[180px]">
        <SelectValue placeholder="Select a fruit" />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="apple">Apple</SelectItem>
        <SelectItem value="banana">Banana</SelectItem>
        <SelectItem value="blueberry">Blueberry</SelectItem>
        <SelectItem value="grapes">Grapes</SelectItem>
        <SelectItem value="pineapple">Pineapple</SelectItem>
      </SelectContent>
    </Select>
  ),
}

export const WithLabel: Story = {
  args: {},
  render: () => (
    <div className="grid w-full max-w-sm items-center gap-1.5">
      <Label htmlFor="fruit-select">Choose a fruit</Label>
      <Select>
        <SelectTrigger>
          <SelectValue placeholder="Select a fruit" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="apple">Apple</SelectItem>
          <SelectItem value="banana">Banana</SelectItem>
          <SelectItem value="orange">Orange</SelectItem>
        </SelectContent>
      </Select>
    </div>
  ),
}

export const WithGroups: Story = {
  args: {},
  render: () => (
    <Select>
      <SelectTrigger className="w-[280px]">
        <SelectValue placeholder="Select a timezone" />
      </SelectTrigger>
      <SelectContent>
        <SelectGroup>
          <SelectLabel>North America</SelectLabel>
          <SelectItem value="est">Eastern Standard Time (EST)</SelectItem>
          <SelectItem value="cst">Central Standard Time (CST)</SelectItem>
          <SelectItem value="mst">Mountain Standard Time (MST)</SelectItem>
          <SelectItem value="pst">Pacific Standard Time (PST)</SelectItem>
        </SelectGroup>
        <SelectGroup>
          <SelectLabel>Europe & Africa</SelectLabel>
          <SelectItem value="gmt">Greenwich Mean Time (GMT)</SelectItem>
          <SelectItem value="cet">Central European Time (CET)</SelectItem>
          <SelectItem value="eet">Eastern European Time (EET)</SelectItem>
          <SelectItem value="west">
            Western European Summer Time (WEST)
          </SelectItem>
          <SelectItem value="cat">Central Africa Time (CAT)</SelectItem>
          <SelectItem value="eat">East Africa Time (EAT)</SelectItem>
        </SelectGroup>
        <SelectGroup>
          <SelectLabel>Asia</SelectLabel>
          <SelectItem value="msk">Moscow Time (MSK)</SelectItem>
          <SelectItem value="ist">India Standard Time (IST)</SelectItem>
          <SelectItem value="cst_china">China Standard Time (CST)</SelectItem>
          <SelectItem value="jst">Japan Standard Time (JST)</SelectItem>
        </SelectGroup>
      </SelectContent>
    </Select>
  ),
}

export const WithIcons: Story = {
  args: {},
  render: () => (
    <div className="w-full max-w-sm space-y-4">
      <div className="grid items-center gap-1.5">
        <Label>Language</Label>
        <Select>
          <SelectTrigger>
            <Globe className="mr-2 h-4 w-4" />
            <SelectValue placeholder="Select language" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="en">
              <div className="flex items-center">
                <Flag className="mr-2 h-4 w-4" />
                English
              </div>
            </SelectItem>
            <SelectItem value="es">
              <div className="flex items-center">
                <Flag className="mr-2 h-4 w-4" />
                Spanish
              </div>
            </SelectItem>
            <SelectItem value="fr">
              <div className="flex items-center">
                <Flag className="mr-2 h-4 w-4" />
                French
              </div>
            </SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="grid items-center gap-1.5">
        <Label>Department</Label>
        <Select>
          <SelectTrigger>
            <Building2 className="mr-2 h-4 w-4" />
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
    </div>
  ),
}

export const Disabled: Story = {
  args: {},
  render: () => (
    <Select disabled>
      <SelectTrigger className="w-[180px]">
        <SelectValue placeholder="Disabled select" />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="apple">Apple</SelectItem>
        <SelectItem value="banana">Banana</SelectItem>
      </SelectContent>
    </Select>
  ),
}

export const FormExample: Story = {
  args: {},
  render: () => (
    <Card className="w-[400px]">
      <CardHeader>
        <CardTitle>User Profile</CardTitle>
        <CardDescription>Update your profile information</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid items-center gap-1.5">
          <Label htmlFor="role">Role</Label>
          <Select>
            <SelectTrigger>
              <User className="mr-2 h-4 w-4" />
              <SelectValue placeholder="Select your role" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="admin">
                <div className="flex w-full items-center justify-between">
                  <span>Administrator</span>
                  <Badge variant="secondary">Full Access</Badge>
                </div>
              </SelectItem>
              <SelectItem value="editor">
                <div className="flex w-full items-center justify-between">
                  <span>Editor</span>
                  <Badge variant="outline">Edit Only</Badge>
                </div>
              </SelectItem>
              <SelectItem value="viewer">
                <div className="flex w-full items-center justify-between">
                  <span>Viewer</span>
                  <Badge variant="outline">Read Only</Badge>
                </div>
              </SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="grid items-center gap-1.5">
          <Label htmlFor="status">Status</Label>
          <Select>
            <SelectTrigger>
              <Settings className="mr-2 h-4 w-4" />
              <SelectValue placeholder="Select status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="active">
                <div className="flex items-center gap-2">
                  <div className="bg-success h-2 w-2 rounded-full"></div>
                  Active
                </div>
              </SelectItem>
              <SelectItem value="inactive">
                <div className="flex items-center gap-2">
                  <div className="bg-muted-foreground h-2 w-2 rounded-full"></div>
                  Inactive
                </div>
              </SelectItem>
              <SelectItem value="pending">
                <div className="flex items-center gap-2">
                  <div className="bg-warning h-2 w-2 rounded-full"></div>
                  Pending
                </div>
              </SelectItem>
            </SelectContent>
          </Select>
        </div>
      </CardContent>
    </Card>
  ),
}

export const CoreLiveThemeShowcase: Story = {
  args: {},
  render: () => (
    <div className="w-full max-w-lg space-y-6">
      <div>
        <h3 className="text-heading-3 mb-4 font-medium">Select States</h3>
        <div className="space-y-3">
          <div className="grid items-center gap-1.5">
            <Label>Default State</Label>
            <Select>
              <SelectTrigger
                style={{
                  backgroundColor: 'var(--component-select-background)',
                  borderColor: 'var(--component-select-border)',
                  color: 'var(--component-select-text)',
                }}
              >
                <SelectValue placeholder="Default select" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="option1">Option 1</SelectItem>
                <SelectItem value="option2">Option 2</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="grid items-center gap-1.5">
            <Label>Focus State</Label>
            <Select>
              <SelectTrigger className="focus:border-primary focus-visible:ring-primary">
                <SelectValue placeholder="Focus to see border change" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="option1">Option 1</SelectItem>
                <SelectItem value="option2">Option 2</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="grid items-center gap-1.5">
            <Label>Disabled State</Label>
            <Select disabled>
              <SelectTrigger
                style={{
                  backgroundColor:
                    'var(--component-select-background-disabled)',
                  color: 'var(--component-select-text-disabled)',
                }}
              >
                <SelectValue placeholder="Disabled select" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="option1">Option 1</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
      </div>

      <div>
        <h3 className="text-heading-3 mb-4 font-medium">
          Component Token Usage
        </h3>
        <div className="space-y-3">
          <div className="grid items-center gap-1.5">
            <Label>Custom Styled Select</Label>
            <select
              className="w-full rounded-md border px-3 py-2 transition-colors"
              style={{
                backgroundColor: 'var(--component-select-background)',
                borderColor: 'var(--component-select-border)',
                color: 'var(--component-select-text)',
                boxShadow: 'var(--component-select-shadow)',
              }}
            >
              <option>Using component tokens</option>
              <option>Option 2</option>
              <option>Option 3</option>
            </select>
          </div>
        </div>
      </div>

      <div>
        <h3 className="text-heading-3 mb-4 font-medium">
          Semantic Color Usage
        </h3>
        <div className="space-y-3">
          <Select>
            <SelectTrigger className="border-success focus-visible:ring-success">
              <SelectValue placeholder="Success themed" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="success">
                <div className="flex items-center gap-2">
                  <div className="bg-success h-2 w-2 rounded-full"></div>
                  Success Option
                </div>
              </SelectItem>
            </SelectContent>
          </Select>

          <Select>
            <SelectTrigger className="border-warning focus-visible:ring-warning">
              <SelectValue placeholder="Warning themed" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="warning">
                <div className="flex items-center gap-2">
                  <div className="bg-warning h-2 w-2 rounded-full"></div>
                  Warning Option
                </div>
              </SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>
    </div>
  ),
  parameters: {
    layout: 'padded',
    docs: {
      description: {
        story:
          'Comprehensive showcase of select variations using CoreLive Design System tokens for consistent styling across different states and interactions.',
      },
    },
  },
}
