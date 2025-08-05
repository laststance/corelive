import type { Meta, StoryObj } from '@storybook/react'
import { useState, useEffect } from 'react'

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
import { Skeleton } from '@/components/ui/skeleton'
import { Switch } from '@/components/ui/switch'

const meta: Meta<typeof Skeleton> = {
  title: 'CoreLive Design System/Components/Skeleton',
  component: Skeleton,
  parameters: {
    layout: 'centered',
    docs: {
      description: {
        component:
          'A placeholder component used to show loading states. Provides visual feedback while content is being loaded with CoreLive Design System styling.',
      },
    },
  },
  tags: ['autodocs'],
  argTypes: {
    className: {
      control: 'text',
      description: 'Additional CSS classes',
    },
  },
}

export default meta
type Story = StoryObj<typeof meta>

export const Default: Story = {
  args: {},
  render: () => <Skeleton className="h-[20px] w-[100px]" />,
}

export const Shapes: Story = {
  args: {},
  render: () => (
    <div className="space-y-4">
      <div>
        <p className="text-muted-foreground mb-2 text-sm">Rectangle</p>
        <Skeleton className="h-[20px] w-[250px]" />
      </div>

      <div>
        <p className="text-muted-foreground mb-2 text-sm">Square</p>
        <Skeleton className="h-[60px] w-[60px]" />
      </div>

      <div>
        <p className="text-muted-foreground mb-2 text-sm">Circle</p>
        <Skeleton className="h-[60px] w-[60px] rounded-full" />
      </div>

      <div>
        <p className="text-muted-foreground mb-2 text-sm">Rounded</p>
        <Skeleton className="h-[40px] w-[250px] rounded-lg" />
      </div>
    </div>
  ),
}

export const TextSkeleton: Story = {
  args: {},
  render: () => (
    <div className="w-[400px] space-y-3">
      <Skeleton className="h-8 w-3/4" />
      <Skeleton className="h-4 w-full" />
      <Skeleton className="h-4 w-full" />
      <Skeleton className="h-4 w-2/3" />
    </div>
  ),
}

export const CardSkeleton: Story = {
  args: {},
  render: () => (
    <Card className="w-[350px]">
      <CardHeader>
        <Skeleton className="h-6 w-1/2" />
        <Skeleton className="h-4 w-3/4" />
      </CardHeader>
      <CardContent>
        <div className="space-y-3">
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-2/3" />
          <div className="flex gap-2 pt-2">
            <Skeleton className="h-9 w-20" />
            <Skeleton className="h-9 w-20" />
          </div>
        </div>
      </CardContent>
    </Card>
  ),
}

export const UserProfileSkeleton: Story = {
  args: {},
  render: () => (
    <div className="flex items-center space-x-4">
      <Skeleton className="h-12 w-12 rounded-full" />
      <div className="space-y-2">
        <Skeleton className="h-4 w-[200px]" />
        <Skeleton className="h-4 w-[150px]" />
      </div>
    </div>
  ),
}

export const BlogPostSkeleton: Story = {
  args: {},
  render: () => (
    <Card className="w-full max-w-2xl">
      <CardContent className="p-6">
        <div className="space-y-4">
          <Skeleton className="h-[200px] w-full rounded-lg" />

          <div className="space-y-3">
            <Skeleton className="h-8 w-3/4" />

            <div className="flex items-center gap-4">
              <div className="flex items-center gap-2">
                <Skeleton className="h-8 w-8 rounded-full" />
                <Skeleton className="h-4 w-24" />
              </div>
              <Skeleton className="h-4 w-20" />
              <Skeleton className="h-4 w-24" />
            </div>

            <Separator />

            <div className="space-y-2">
              <Skeleton className="h-4 w-full" />
              <Skeleton className="h-4 w-full" />
              <Skeleton className="h-4 w-full" />
              <Skeleton className="h-4 w-3/4" />
            </div>

            <div className="flex gap-2 pt-2">
              <Skeleton className="h-8 w-20" />
              <Skeleton className="h-8 w-20" />
              <Skeleton className="h-8 w-20" />
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  ),
  parameters: {
    layout: 'padded',
  },
}

export const ProductCardSkeleton: Story = {
  args: {},
  render: () => (
    <div className="grid w-full max-w-4xl grid-cols-1 gap-6 md:grid-cols-3">
      {[1, 2, 3].map((i) => (
        <Card key={i} className="overflow-hidden">
          <div className="aspect-square">
            <Skeleton className="h-full w-full" />
          </div>
          <CardContent className="p-4">
            <div className="space-y-3">
              <Skeleton className="h-5 w-3/4" />
              <div className="flex items-center gap-2">
                <Skeleton className="h-4 w-12" />
                <Skeleton className="h-4 w-16" />
              </div>
              <div className="flex items-center justify-between">
                <Skeleton className="h-6 w-20" />
                <Skeleton className="h-9 w-24" />
              </div>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  ),
  parameters: {
    layout: 'padded',
  },
}

export const TableSkeleton: Story = {
  args: {},
  render: () => (
    <div className="w-full max-w-4xl rounded-lg border">
      <div className="border-b p-4">
        <div className="flex items-center justify-between">
          <Skeleton className="h-6 w-32" />
          <div className="flex gap-2">
            <Skeleton className="h-9 w-24" />
            <Skeleton className="h-9 w-24" />
          </div>
        </div>
      </div>
      <div className="p-0">
        <div className="bg-muted/50 grid grid-cols-4 gap-4 border-b px-6 py-3">
          <Skeleton className="h-4 w-20" />
          <Skeleton className="h-4 w-24" />
          <Skeleton className="h-4 w-16" />
          <Skeleton className="h-4 w-20" />
        </div>
        {[1, 2, 3, 4, 5].map((i) => (
          <div key={i} className="grid grid-cols-4 gap-4 border-b px-6 py-3">
            <Skeleton className="h-4 w-32" />
            <Skeleton className="h-4 w-28" />
            <Skeleton className="h-5 w-16" />
            <Skeleton className="h-4 w-24" />
          </div>
        ))}
      </div>
    </div>
  ),
  parameters: {
    layout: 'padded',
  },
}

export const DashboardSkeleton: Story = {
  args: {},
  render: () => (
    <div className="w-full max-w-6xl space-y-6">
      <div className="grid grid-cols-1 gap-4 md:grid-cols-4">
        {[1, 2, 3, 4].map((i) => (
          <Card key={i}>
            <CardContent className="p-6">
              <div className="space-y-2">
                <Skeleton className="h-4 w-24" />
                <Skeleton className="h-8 w-32" />
                <Skeleton className="h-3 w-20" />
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
        <Card>
          <CardHeader>
            <Skeleton className="h-6 w-32" />
          </CardHeader>
          <CardContent>
            <Skeleton className="h-[200px] w-full" />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <Skeleton className="h-6 w-32" />
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {[1, 2, 3, 4].map((i) => (
                <div key={i} className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <Skeleton className="h-10 w-10 rounded-full" />
                    <div className="space-y-1">
                      <Skeleton className="h-4 w-24" />
                      <Skeleton className="h-3 w-32" />
                    </div>
                  </div>
                  <Skeleton className="h-5 w-16" />
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  ),
  parameters: {
    layout: 'padded',
  },
}

export const MediaPlayerSkeleton: Story = {
  args: {},
  render: () => (
    <Card className="w-[400px]">
      <CardContent className="p-4">
        <div className="space-y-4">
          <div className="flex items-center space-x-4">
            <Skeleton className="h-16 w-16 rounded" />
            <div className="flex-1 space-y-2">
              <Skeleton className="h-5 w-3/4" />
              <Skeleton className="h-4 w-1/2" />
            </div>
          </div>

          <div className="space-y-2">
            <Skeleton className="h-1 w-full" />
            <div className="flex items-center justify-between">
              <Skeleton className="h-3 w-10" />
              <Skeleton className="h-3 w-10" />
            </div>
          </div>

          <div className="flex items-center justify-center space-x-4">
            <Skeleton className="h-8 w-8 rounded-full" />
            <Skeleton className="h-10 w-10 rounded-full" />
            <Skeleton className="h-8 w-8 rounded-full" />
          </div>
        </div>
      </CardContent>
    </Card>
  ),
}

export const LoadingStates: Story = {
  args: {},
  render: () => {
    const [isLoading, setIsLoading] = useState(true)

    useEffect(() => {
      const timer = setInterval(() => {
        setIsLoading((prev) => !prev)
      }, 2000)

      return () => clearInterval(timer)
    }, [])

    return (
      <div className="w-full max-w-2xl space-y-6">
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-heading-3 font-medium">Toggle Loading State</h3>
          <div className="flex items-center space-x-2">
            <Switch
              id="loading"
              checked={isLoading}
              onCheckedChange={setIsLoading}
            />
            <Label htmlFor="loading">Show skeleton</Label>
          </div>
        </div>

        <Card>
          <CardHeader>
            {isLoading ? (
              <>
                <Skeleton className="mb-2 h-6 w-32" />
                <Skeleton className="h-4 w-48" />
              </>
            ) : (
              <>
                <CardTitle>Loaded Content</CardTitle>
                <CardDescription>
                  This content has finished loading
                </CardDescription>
              </>
            )}
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="space-y-3">
                <Skeleton className="h-4 w-full" />
                <Skeleton className="h-4 w-full" />
                <Skeleton className="h-4 w-3/4" />
                <div className="flex gap-2 pt-2">
                  <Skeleton className="h-9 w-24" />
                  <Skeleton className="h-9 w-24" />
                </div>
              </div>
            ) : (
              <div className="space-y-3">
                <p className="text-sm">
                  Lorem ipsum dolor sit amet, consectetur adipiscing elit. Sed
                  do eiusmod tempor incididunt ut labore et dolore magna aliqua.
                </p>
                <p className="text-sm">
                  Ut enim ad minim veniam, quis nostrud exercitation ullamco
                  laboris.
                </p>
                <div className="flex gap-2 pt-2">
                  <Button size="sm">Action</Button>
                  <Button size="sm" variant="outline">
                    Secondary
                  </Button>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    )
  },
  parameters: {
    layout: 'padded',
  },
}

export const CommentsSkeleton: Story = {
  args: {},
  render: () => (
    <div className="w-full max-w-2xl space-y-4">
      <div className="mb-4 flex items-center justify-between">
        <Skeleton className="h-6 w-32" />
        <Skeleton className="h-9 w-24" />
      </div>

      {[1, 2, 3].map((i) => (
        <Card key={i}>
          <CardContent className="p-4">
            <div className="flex gap-3">
              <Skeleton className="h-10 w-10 flex-shrink-0 rounded-full" />
              <div className="flex-1 space-y-2">
                <div className="flex items-center gap-2">
                  <Skeleton className="h-4 w-24" />
                  <Skeleton className="h-3 w-16" />
                </div>
                <div className="space-y-2">
                  <Skeleton className="h-4 w-full" />
                  <Skeleton className="h-4 w-full" />
                  <Skeleton className="h-4 w-2/3" />
                </div>
                <div className="flex gap-4 pt-2">
                  <Skeleton className="h-4 w-12" />
                  <Skeleton className="h-4 w-12" />
                  <Skeleton className="h-4 w-12" />
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  ),
  parameters: {
    layout: 'padded',
  },
}

export const NavigationSkeleton: Story = {
  args: {},
  render: () => (
    <div className="w-full max-w-xs rounded-lg border">
      <div className="border-b p-4">
        <Skeleton className="h-6 w-24" />
      </div>
      <div className="p-2">
        {[1, 2, 3, 4, 5].map((i) => (
          <div key={i} className="flex items-center gap-3 rounded p-2">
            <Skeleton className="h-4 w-4" />
            <Skeleton className="h-4 flex-1" />
            {i === 2 && <Skeleton className="h-5 w-8 rounded-full" />}
          </div>
        ))}
      </div>
      <Separator className="my-2" />
      <div className="p-2">
        {[1, 2].map((i) => (
          <div key={i} className="flex items-center gap-3 rounded p-2">
            <Skeleton className="h-4 w-4" />
            <Skeleton className="h-4 flex-1" />
          </div>
        ))}
      </div>
    </div>
  ),
}

export const CoreLiveThemeShowcase: Story = {
  args: {},
  render: () => (
    <div className="w-full max-w-2xl space-y-6">
      <div>
        <h3 className="text-heading-3 mb-4 font-medium">Skeleton Variations</h3>
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-3">
            <div>
              <p className="text-muted-foreground mb-2 text-sm">
                Default skeleton
              </p>
              <Skeleton
                className="h-12 w-full"
                style={{
                  backgroundColor: 'var(--component-skeleton-background)',
                }}
              />
            </div>

            <div>
              <p className="text-muted-foreground mb-2 text-sm">
                Rounded skeleton
              </p>
              <Skeleton
                className="h-12 w-full rounded-lg"
                style={{
                  backgroundColor: 'var(--component-skeleton-background)',
                }}
              />
            </div>

            <div>
              <p className="text-muted-foreground mb-2 text-sm">
                Circle skeleton
              </p>
              <Skeleton
                className="h-12 w-12 rounded-full"
                style={{
                  backgroundColor: 'var(--component-skeleton-background)',
                }}
              />
            </div>
          </div>

          <div className="space-y-3">
            <div>
              <p className="text-muted-foreground mb-2 text-sm">
                Text skeleton
              </p>
              <div className="space-y-2">
                <Skeleton className="h-4 w-3/4" />
                <Skeleton className="h-4 w-full" />
                <Skeleton className="h-4 w-1/2" />
              </div>
            </div>

            <div>
              <p className="text-muted-foreground mb-2 text-sm">
                Button skeleton
              </p>
              <Skeleton className="h-10 w-28 rounded-md" />
            </div>
          </div>
        </div>
      </div>

      <div>
        <h3 className="text-heading-3 mb-4 font-medium">Semantic Context</h3>
        <div className="grid grid-cols-2 gap-4">
          <Card className="border-primary/20">
            <CardHeader>
              <CardTitle className="text-primary">Primary Loading</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                <Skeleton className="bg-primary/10 h-4 w-full" />
                <Skeleton className="bg-primary/10 h-4 w-3/4" />
                <Skeleton className="bg-primary/10 h-10 w-24" />
              </div>
            </CardContent>
          </Card>

          <Card className="border-secondary/20">
            <CardHeader>
              <CardTitle className="text-secondary">
                Secondary Loading
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                <Skeleton className="bg-secondary/10 h-4 w-full" />
                <Skeleton className="bg-secondary/10 h-4 w-3/4" />
                <Skeleton className="bg-secondary/10 h-10 w-24" />
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
              <div
                className="h-20 w-full animate-pulse rounded-md"
                style={{
                  backgroundColor: 'var(--component-skeleton-background)',
                  animationDuration:
                    'var(--component-skeleton-animation-duration, 1.5s)',
                }}
              />

              <p className="text-muted-foreground text-sm">
                Custom skeleton using component design tokens
              </p>

              <div className="bg-muted rounded-md p-3">
                <code className="text-xs">
                  --component-skeleton-background
                  <br />
                  --component-skeleton-animation-duration
                  <br />
                  --component-skeleton-opacity
                </code>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      <div>
        <h3 className="text-heading-3 mb-4 font-medium">
          Complex Loading Pattern
        </h3>
        <Card className="overflow-hidden">
          <div className="relative aspect-video">
            <Skeleton className="absolute inset-0" />
            <div className="absolute inset-0 flex items-center justify-center">
              <div className="bg-background/80 rounded-full p-3">
                <Skeleton className="h-12 w-12 rounded-full" />
              </div>
            </div>
          </div>
          <CardContent className="p-4">
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <Skeleton className="h-5 w-2/3" />
                <Skeleton className="h-8 w-20 rounded-full" />
              </div>
              <div className="flex items-center gap-2">
                <Skeleton className="h-8 w-8 rounded-full" />
                <Skeleton className="h-4 w-24" />
                <Skeleton className="ml-auto h-4 w-16" />
              </div>
              <Separator />
              <div className="space-y-2">
                <Skeleton className="h-4 w-full" />
                <Skeleton className="h-4 w-full" />
                <Skeleton className="h-4 w-3/4" />
              </div>
              <div className="flex items-center gap-4 pt-2">
                <Skeleton className="h-5 w-16" />
                <Skeleton className="h-5 w-16" />
                <Skeleton className="h-5 w-16" />
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      <div>
        <h3 className="text-heading-3 mb-4 font-medium">Animated Patterns</h3>
        <div className="space-y-4">
          <div className="space-y-2">
            <p className="text-sm font-medium">Wave Animation</p>
            <div className="flex gap-2">
              {[0, 1, 2, 3, 4].map((i) => (
                <Skeleton
                  key={i}
                  className="h-20 w-12"
                  style={{
                    animationDelay: `${i * 0.1}s`,
                  }}
                />
              ))}
            </div>
          </div>

          <div className="space-y-2">
            <p className="text-sm font-medium">Progressive Loading</p>
            <div className="space-y-2">
              {[0, 1, 2, 3].map((i) => (
                <Skeleton
                  key={i}
                  className="h-4 w-full"
                  style={{
                    animationDelay: `${i * 0.15}s`,
                    opacity: 1 - i * 0.2,
                  }}
                />
              ))}
            </div>
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
          'Comprehensive showcase of skeleton loading variations using CoreLive Design System tokens for consistent loading states across different contexts.',
      },
    },
  },
}
