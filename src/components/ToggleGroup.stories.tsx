import type { Meta, StoryObj } from '@storybook/react'
import {
  Bold,
  Italic,
  Underline,
  Strikethrough,
  AlignLeft,
  AlignCenter,
  AlignRight,
  AlignJustify,
  List,
  ListOrdered,
  IndentDecrease,
  IndentIncrease,
  Heading1,
  Heading2,
  Heading3,
  LayoutGrid,
  LayoutList,
  Square,
  Circle,
  Triangle,
  Pentagon,
  Hexagon,
  Octagon,
  Sun,
  Cloud,
  CloudRain,
  CloudSnow,
  Wind,
  Laptop,
  Tablet,
  Smartphone,
  Monitor,
  Watch,
  Calendar,
  CalendarDays,
  CalendarRange,
  Clock,
  Timer,
  Layers,
  Layers2,
  Layers3,
  Zap,
  Sparkles,
  Flame,
  Droplet,
  Snowflake,
  Star,
  Shield,
  Globe,
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
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'

const meta: Meta<typeof ToggleGroup> = {
  title: 'CoreLive Design System/Components/ToggleGroup',
  component: ToggleGroup,
  parameters: {
    layout: 'centered',
    docs: {
      description: {
        component:
          'A group of toggle buttons where either one or multiple items can be selected. Styled with CoreLive Design System tokens.',
      },
    },
  },
  tags: ['autodocs'],
}

export default meta
type Story = StoryObj<typeof meta>

export const Single: Story = {
  // @ts-ignore - Storybook type issue with no component props
  args: {},
  render: () => (
    <ToggleGroup type="single" defaultValue="center">
      <ToggleGroupItem value="left">
        <AlignLeft className="h-4 w-4" />
      </ToggleGroupItem>
      <ToggleGroupItem value="center">
        <AlignCenter className="h-4 w-4" />
      </ToggleGroupItem>
      <ToggleGroupItem value="right">
        <AlignRight className="h-4 w-4" />
      </ToggleGroupItem>
    </ToggleGroup>
  ),
}

export const Multiple: Story = {
  // @ts-ignore - Storybook type issue with no component props
  args: {},
  render: () => (
    <ToggleGroup type="multiple" defaultValue={['bold', 'italic']}>
      <ToggleGroupItem value="bold">
        <Bold className="h-4 w-4" />
      </ToggleGroupItem>
      <ToggleGroupItem value="italic">
        <Italic className="h-4 w-4" />
      </ToggleGroupItem>
      <ToggleGroupItem value="underline">
        <Underline className="h-4 w-4" />
      </ToggleGroupItem>
    </ToggleGroup>
  ),
}

export const Sizes: Story = {
  // @ts-ignore - Storybook type issue with no component props
  args: {},
  render: () => (
    <div className="flex flex-col items-center gap-4">
      <ToggleGroup type="single" size="sm">
        <ToggleGroupItem value="left">
          <AlignLeft className="h-3 w-3" />
        </ToggleGroupItem>
        <ToggleGroupItem value="center">
          <AlignCenter className="h-3 w-3" />
        </ToggleGroupItem>
        <ToggleGroupItem value="right">
          <AlignRight className="h-3 w-3" />
        </ToggleGroupItem>
      </ToggleGroup>

      <ToggleGroup type="single" size="default">
        <ToggleGroupItem value="left">
          <AlignLeft className="h-4 w-4" />
        </ToggleGroupItem>
        <ToggleGroupItem value="center">
          <AlignCenter className="h-4 w-4" />
        </ToggleGroupItem>
        <ToggleGroupItem value="right">
          <AlignRight className="h-4 w-4" />
        </ToggleGroupItem>
      </ToggleGroup>

      <ToggleGroup type="single" size="lg">
        <ToggleGroupItem value="left">
          <AlignLeft className="h-5 w-5" />
        </ToggleGroupItem>
        <ToggleGroupItem value="center">
          <AlignCenter className="h-5 w-5" />
        </ToggleGroupItem>
        <ToggleGroupItem value="right">
          <AlignRight className="h-5 w-5" />
        </ToggleGroupItem>
      </ToggleGroup>
    </div>
  ),
}

export const Variants: Story = {
  // @ts-ignore - Storybook type issue with no component props
  args: {},
  render: () => (
    <div className="flex flex-col gap-4">
      <div className="space-y-2">
        <p className="text-sm font-medium">Default Variant</p>
        <ToggleGroup type="single" variant="default">
          <ToggleGroupItem value="bold">
            <Bold className="h-4 w-4" />
          </ToggleGroupItem>
          <ToggleGroupItem value="italic">
            <Italic className="h-4 w-4" />
          </ToggleGroupItem>
          <ToggleGroupItem value="underline">
            <Underline className="h-4 w-4" />
          </ToggleGroupItem>
        </ToggleGroup>
      </div>

      <div className="space-y-2">
        <p className="text-sm font-medium">Outline Variant</p>
        <ToggleGroup type="single" variant="outline">
          <ToggleGroupItem value="bold">
            <Bold className="h-4 w-4" />
          </ToggleGroupItem>
          <ToggleGroupItem value="italic">
            <Italic className="h-4 w-4" />
          </ToggleGroupItem>
          <ToggleGroupItem value="underline">
            <Underline className="h-4 w-4" />
          </ToggleGroupItem>
        </ToggleGroup>
      </div>
    </div>
  ),
}

export const Disabled: Story = {
  // @ts-ignore - Storybook type issue with no component props
  args: {},
  render: () => (
    <div className="space-y-4">
      <ToggleGroup type="single" disabled>
        <ToggleGroupItem value="left">
          <AlignLeft className="h-4 w-4" />
        </ToggleGroupItem>
        <ToggleGroupItem value="center">
          <AlignCenter className="h-4 w-4" />
        </ToggleGroupItem>
        <ToggleGroupItem value="right">
          <AlignRight className="h-4 w-4" />
        </ToggleGroupItem>
      </ToggleGroup>

      <ToggleGroup type="single">
        <ToggleGroupItem value="left">
          <AlignLeft className="h-4 w-4" />
        </ToggleGroupItem>
        <ToggleGroupItem value="center" disabled>
          <AlignCenter className="h-4 w-4" />
        </ToggleGroupItem>
        <ToggleGroupItem value="right">
          <AlignRight className="h-4 w-4" />
        </ToggleGroupItem>
      </ToggleGroup>
    </div>
  ),
}

export const TextFormatting: Story = {
  // @ts-ignore - Storybook type issue with no component props
  args: {},
  render: () => {
    const [formatting, setFormatting] = useState<string[]>(['bold'])
    const [alignment, setAlignment] = useState('left')
    const [listType, setListType] = useState<string | undefined>()

    return (
      <Card className="w-[600px]">
        <CardHeader>
          <CardTitle>Document Editor</CardTitle>
          <CardDescription>Rich text formatting toolbar</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            <div className="bg-muted/30 flex items-center gap-2 rounded-lg border p-2">
              <ToggleGroup type="single" size="sm">
                <ToggleGroupItem value="h1">
                  <Heading1 className="h-3 w-3" />
                </ToggleGroupItem>
                <ToggleGroupItem value="h2">
                  <Heading2 className="h-3 w-3" />
                </ToggleGroupItem>
                <ToggleGroupItem value="h3">
                  <Heading3 className="h-3 w-3" />
                </ToggleGroupItem>
              </ToggleGroup>

              <Separator orientation="vertical" className="h-6" />

              <ToggleGroup
                type="multiple"
                value={formatting}
                onValueChange={setFormatting}
                size="sm"
              >
                <ToggleGroupItem value="bold">
                  <Bold className="h-3 w-3" />
                </ToggleGroupItem>
                <ToggleGroupItem value="italic">
                  <Italic className="h-3 w-3" />
                </ToggleGroupItem>
                <ToggleGroupItem value="underline">
                  <Underline className="h-3 w-3" />
                </ToggleGroupItem>
                <ToggleGroupItem value="strike">
                  <Strikethrough className="h-3 w-3" />
                </ToggleGroupItem>
              </ToggleGroup>

              <Separator orientation="vertical" className="h-6" />

              <ToggleGroup
                type="single"
                value={alignment}
                onValueChange={(value) => value && setAlignment(value)}
                size="sm"
              >
                <ToggleGroupItem value="left">
                  <AlignLeft className="h-3 w-3" />
                </ToggleGroupItem>
                <ToggleGroupItem value="center">
                  <AlignCenter className="h-3 w-3" />
                </ToggleGroupItem>
                <ToggleGroupItem value="right">
                  <AlignRight className="h-3 w-3" />
                </ToggleGroupItem>
                <ToggleGroupItem value="justify">
                  <AlignJustify className="h-3 w-3" />
                </ToggleGroupItem>
              </ToggleGroup>

              <Separator orientation="vertical" className="h-6" />

              <ToggleGroup
                type="single"
                value={listType}
                onValueChange={setListType}
                size="sm"
              >
                <ToggleGroupItem value="bullet">
                  <List className="h-3 w-3" />
                </ToggleGroupItem>
                <ToggleGroupItem value="numbered">
                  <ListOrdered className="h-3 w-3" />
                </ToggleGroupItem>
              </ToggleGroup>

              <Separator orientation="vertical" className="h-6" />

              <ToggleGroup type="single" size="sm">
                <ToggleGroupItem value="indent-decrease">
                  <IndentDecrease className="h-3 w-3" />
                </ToggleGroupItem>
                <ToggleGroupItem value="indent-increase">
                  <IndentIncrease className="h-3 w-3" />
                </ToggleGroupItem>
              </ToggleGroup>
            </div>

            <div className="min-h-[200px] rounded-lg border p-4">
              <p
                className={` ${formatting.includes('bold') ? 'font-bold' : ''} ${formatting.includes('italic') ? 'italic' : ''} ${formatting.includes('underline') ? 'underline' : ''} ${formatting.includes('strike') ? 'line-through' : ''} ${alignment === 'center' ? 'text-center' : ''} ${alignment === 'right' ? 'text-right' : ''} ${alignment === 'justify' ? 'text-justify' : ''} `}
              >
                Lorem ipsum dolor sit amet, consectetur adipiscing elit. Sed do
                eiusmod tempor incididunt ut labore et dolore magna aliqua.
              </p>
            </div>
          </div>
        </CardContent>
      </Card>
    )
  },
}

export const ViewSwitcher: Story = {
  // @ts-ignore - Storybook type issue with no component props
  args: {},
  render: () => {
    const [view, setView] = useState('grid')

    return (
      <Card className="w-[400px]">
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>Products</CardTitle>
              <CardDescription>24 items</CardDescription>
            </div>
            <ToggleGroup
              type="single"
              value={view}
              onValueChange={(v) => v && setView(v)}
            >
              <ToggleGroupItem value="grid">
                <LayoutGrid className="h-4 w-4" />
              </ToggleGroupItem>
              <ToggleGroupItem value="list">
                <LayoutList className="h-4 w-4" />
              </ToggleGroupItem>
            </ToggleGroup>
          </div>
        </CardHeader>
        <Separator />
        <CardContent className="pt-6">
          {view === 'grid' ? (
            <div className="grid grid-cols-3 gap-4">
              {Array.from({ length: 6 }).map((_, i) => (
                <div key={i} className="bg-muted aspect-square rounded-lg" />
              ))}
            </div>
          ) : (
            <div className="space-y-3">
              {Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="flex items-center gap-3">
                  <div className="bg-muted h-12 w-12 rounded" />
                  <div className="flex-1 space-y-1">
                    <div className="bg-muted h-4 w-3/4 rounded" />
                    <div className="bg-muted h-3 w-1/2 rounded" />
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    )
  },
}

export const ShapeSelector: Story = {
  // @ts-ignore - Storybook type issue with no component props
  args: {},
  render: () => {
    const [shape, setShape] = useState('circle')

    return (
      <Card className="w-[500px]">
        <CardHeader>
          <CardTitle>Shape Tool</CardTitle>
          <CardDescription>Select a shape to draw</CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <ToggleGroup
            type="single"
            value={shape}
            onValueChange={(v) => v && setShape(v)}
            className="grid grid-cols-4 gap-2"
          >
            <ToggleGroupItem value="square" className="h-16 w-16">
              <Square className="h-6 w-6" />
            </ToggleGroupItem>
            <ToggleGroupItem value="circle" className="h-16 w-16">
              <Circle className="h-6 w-6" />
            </ToggleGroupItem>
            <ToggleGroupItem value="triangle" className="h-16 w-16">
              <Triangle className="h-6 w-6" />
            </ToggleGroupItem>
            <ToggleGroupItem value="pentagon" className="h-16 w-16">
              <Pentagon className="h-6 w-6" />
            </ToggleGroupItem>
            <ToggleGroupItem value="hexagon" className="h-16 w-16">
              <Hexagon className="h-6 w-6" />
            </ToggleGroupItem>
            <ToggleGroupItem value="octagon" className="h-16 w-16">
              <Octagon className="h-6 w-6" />
            </ToggleGroupItem>
          </ToggleGroup>

          <div className="bg-muted/30 rounded-lg border p-4 text-center">
            <p className="text-muted-foreground text-sm">Selected shape:</p>
            <p className="text-lg font-semibold capitalize">{shape}</p>
          </div>
        </CardContent>
      </Card>
    )
  },
}

export const WeatherSelector: Story = {
  // @ts-ignore - Storybook type issue with no component props
  args: {},
  render: () => {
    const [weather, setWeather] = useState('sun')

    const weatherData = {
      sun: { icon: Sun, label: 'Sunny', temp: '75°F', desc: 'Clear skies' },
      cloud: {
        icon: Cloud,
        label: 'Cloudy',
        temp: '68°F',
        desc: 'Partly cloudy',
      },
      rain: {
        icon: CloudRain,
        label: 'Rainy',
        temp: '62°F',
        desc: 'Light showers',
      },
      snow: {
        icon: CloudSnow,
        label: 'Snowy',
        temp: '32°F',
        desc: 'Heavy snow',
      },
      wind: { icon: Wind, label: 'Windy', temp: '70°F', desc: 'Strong winds' },
    }

    const current = weatherData[weather as keyof typeof weatherData]

    return (
      <Card className="w-[400px]">
        <CardHeader>
          <CardTitle>Weather Forecast</CardTitle>
          <CardDescription>Select weather condition</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <ToggleGroup
            type="single"
            value={weather}
            onValueChange={(v) => v && setWeather(v)}
          >
            {Object.entries(weatherData).map(([key, data]) => {
              const Icon = data.icon
              return (
                <ToggleGroupItem key={key} value={key}>
                  <Icon className="h-4 w-4" />
                </ToggleGroupItem>
              )
            })}
          </ToggleGroup>

          <div className="space-y-2 rounded-lg border p-6 text-center">
            <current.icon className="mx-auto h-12 w-12" />
            <h3 className="text-2xl font-bold">{current.temp}</h3>
            <p className="font-medium">{current.label}</p>
            <p className="text-muted-foreground text-sm">{current.desc}</p>
          </div>
        </CardContent>
      </Card>
    )
  },
}

export const DeviceSelector: Story = {
  // @ts-ignore - Storybook type issue with no component props
  args: {},
  render: () => {
    const [devices, setDevices] = useState<string[]>(['laptop'])

    return (
      <Card className="w-[450px]">
        <CardHeader>
          <CardTitle>Device Preview</CardTitle>
          <CardDescription>
            Select devices to preview your design
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <Label className="mb-2 block text-sm font-medium">
              Preview Devices
            </Label>
            <ToggleGroup
              type="multiple"
              value={devices}
              onValueChange={setDevices}
              variant="outline"
            >
              <ToggleGroupItem value="monitor">
                <Monitor className="mr-2 h-4 w-4" />
                Desktop
              </ToggleGroupItem>
              <ToggleGroupItem value="laptop">
                <Laptop className="mr-2 h-4 w-4" />
                Laptop
              </ToggleGroupItem>
              <ToggleGroupItem value="tablet">
                <Tablet className="mr-2 h-4 w-4" />
                Tablet
              </ToggleGroupItem>
              <ToggleGroupItem value="phone">
                <Smartphone className="mr-2 h-4 w-4" />
                Phone
              </ToggleGroupItem>
              <ToggleGroupItem value="watch">
                <Watch className="mr-2 h-4 w-4" />
                Watch
              </ToggleGroupItem>
            </ToggleGroup>
          </div>

          <Separator />

          <div>
            <p className="mb-3 text-sm font-medium">Selected Devices:</p>
            <div className="flex flex-wrap gap-2">
              {devices.length === 0 ? (
                <p className="text-muted-foreground text-sm">
                  No devices selected
                </p>
              ) : (
                devices.map((device) => (
                  <Badge key={device} variant="secondary">
                    {device}
                  </Badge>
                ))
              )}
            </div>
          </div>
        </CardContent>
      </Card>
    )
  },
}

export const CalendarView: Story = {
  // @ts-ignore - Storybook type issue with no component props
  args: {},
  render: () => {
    const [view, setView] = useState('month')

    return (
      <div className="w-full max-w-2xl space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-heading-2 font-bold">Calendar</h2>
            <p className="text-muted-foreground">March 2024</p>
          </div>

          <ToggleGroup
            type="single"
            value={view}
            onValueChange={(v) => v && setView(v)}
          >
            <ToggleGroupItem value="day">
              <Calendar className="mr-2 h-4 w-4" />
              Day
            </ToggleGroupItem>
            <ToggleGroupItem value="week">
              <CalendarDays className="mr-2 h-4 w-4" />
              Week
            </ToggleGroupItem>
            <ToggleGroupItem value="month">
              <CalendarRange className="mr-2 h-4 w-4" />
              Month
            </ToggleGroupItem>
          </ToggleGroup>
        </div>

        <Card>
          <CardContent className="pt-6">
            <div className="text-muted-foreground flex h-[300px] items-center justify-center">
              <div className="text-center">
                <p className="text-lg font-medium capitalize">{view} View</p>
                <p className="text-sm">Calendar content would appear here</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    )
  },
  parameters: {
    layout: 'padded',
  },
}

export const LayerSelector: Story = {
  // @ts-ignore - Storybook type issue with no component props
  args: {},
  render: () => {
    const [layers, setLayers] = useState<string[]>(['layer1', 'layer2'])

    return (
      <Card className="w-[350px]">
        <CardHeader>
          <CardTitle>Layer Panel</CardTitle>
          <CardDescription>Toggle layer visibility</CardDescription>
        </CardHeader>
        <CardContent>
          <ToggleGroup
            type="multiple"
            value={layers}
            onValueChange={setLayers}
            className="flex-col items-stretch"
          >
            <ToggleGroupItem value="layer1" className="justify-start">
              <Layers className="mr-2 h-4 w-4" />
              Background Layer
              <Badge className="ml-auto" variant="outline">
                Base
              </Badge>
            </ToggleGroupItem>
            <ToggleGroupItem value="layer2" className="justify-start">
              <Layers2 className="mr-2 h-4 w-4" />
              Content Layer
            </ToggleGroupItem>
            <ToggleGroupItem value="layer3" className="justify-start">
              <Layers3 className="mr-2 h-4 w-4" />
              Effects Layer
              <Badge className="ml-auto" variant="secondary">
                FX
              </Badge>
            </ToggleGroupItem>
          </ToggleGroup>

          <Separator className="my-4" />

          <div className="space-y-2">
            <p className="text-sm font-medium">
              Visible Layers: {layers.length}
            </p>
            <Button size="sm" variant="outline" className="w-full">
              Reset All Layers
            </Button>
          </div>
        </CardContent>
      </Card>
    )
  },
}

export const EffectSelector: Story = {
  // @ts-ignore - Storybook type issue with no component props
  args: {},
  render: () => {
    const [effects, setEffects] = useState<string[]>(['glow'])

    return (
      <Card className="w-[400px]">
        <CardHeader>
          <CardTitle>Visual Effects</CardTitle>
          <CardDescription>
            Apply multiple effects to your element
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <ToggleGroup
            type="multiple"
            value={effects}
            onValueChange={setEffects}
            className="grid grid-cols-3 gap-2"
          >
            <ToggleGroupItem value="glow" className="h-20 flex-col gap-1">
              <Zap className="h-5 w-5" />
              <span className="text-xs">Glow</span>
            </ToggleGroupItem>
            <ToggleGroupItem value="sparkle" className="h-20 flex-col gap-1">
              <Sparkles className="h-5 w-5" />
              <span className="text-xs">Sparkle</span>
            </ToggleGroupItem>
            <ToggleGroupItem value="fire" className="h-20 flex-col gap-1">
              <Flame className="h-5 w-5" />
              <span className="text-xs">Fire</span>
            </ToggleGroupItem>
            <ToggleGroupItem value="water" className="h-20 flex-col gap-1">
              <Droplet className="h-5 w-5" />
              <span className="text-xs">Water</span>
            </ToggleGroupItem>
            <ToggleGroupItem value="frost" className="h-20 flex-col gap-1">
              <Snowflake className="h-5 w-5" />
              <span className="text-xs">Frost</span>
            </ToggleGroupItem>
            <ToggleGroupItem value="timer" className="h-20 flex-col gap-1">
              <Timer className="h-5 w-5" />
              <span className="text-xs">Timer</span>
            </ToggleGroupItem>
          </ToggleGroup>

          <div className="bg-muted/30 rounded-lg border p-4">
            <p className="mb-2 text-sm font-medium">Active Effects:</p>
            {effects.length === 0 ? (
              <p className="text-muted-foreground text-sm">
                No effects selected
              </p>
            ) : (
              <div className="flex flex-wrap gap-2">
                {effects.map((effect) => (
                  <Badge key={effect} variant="secondary">
                    {effect}
                  </Badge>
                ))}
              </div>
            )}
          </div>
        </CardContent>
      </Card>
    )
  },
}

export const CoreLiveThemeShowcase: Story = {
  // @ts-ignore - Storybook type issue with no component props
  args: {},
  render: () => (
    <div className="w-full max-w-2xl space-y-6">
      <div>
        <h3 className="text-heading-3 mb-4 font-medium">Toggle Group States</h3>
        <div className="space-y-4">
          <div>
            <p className="text-muted-foreground mb-2 text-sm">Default State</p>
            <ToggleGroup type="single">
              <ToggleGroupItem value="left">
                <AlignLeft className="h-4 w-4" />
              </ToggleGroupItem>
              <ToggleGroupItem value="center">
                <AlignCenter className="h-4 w-4" />
              </ToggleGroupItem>
              <ToggleGroupItem value="right">
                <AlignRight className="h-4 w-4" />
              </ToggleGroupItem>
            </ToggleGroup>
          </div>

          <div>
            <p className="text-muted-foreground mb-2 text-sm">
              With Selected Item
            </p>
            <ToggleGroup type="single" defaultValue="center">
              <ToggleGroupItem value="left">
                <AlignLeft className="h-4 w-4" />
              </ToggleGroupItem>
              <ToggleGroupItem value="center">
                <AlignCenter className="h-4 w-4" />
              </ToggleGroupItem>
              <ToggleGroupItem value="right">
                <AlignRight className="h-4 w-4" />
              </ToggleGroupItem>
            </ToggleGroup>
          </div>

          <div>
            <p className="text-muted-foreground mb-2 text-sm">Disabled State</p>
            <ToggleGroup type="single" disabled>
              <ToggleGroupItem value="left">
                <AlignLeft className="h-4 w-4" />
              </ToggleGroupItem>
              <ToggleGroupItem value="center">
                <AlignCenter className="h-4 w-4" />
              </ToggleGroupItem>
              <ToggleGroupItem value="right">
                <AlignRight className="h-4 w-4" />
              </ToggleGroupItem>
            </ToggleGroup>
          </div>
        </div>
      </div>

      <div>
        <h3 className="text-heading-3 mb-4 font-medium">Type Variations</h3>
        <div className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Single Selection</CardTitle>
              <CardDescription>
                Only one item can be selected at a time
              </CardDescription>
            </CardHeader>
            <CardContent>
              <ToggleGroup type="single" defaultValue="bold">
                <ToggleGroupItem value="bold">
                  <Bold className="h-4 w-4" />
                </ToggleGroupItem>
                <ToggleGroupItem value="italic">
                  <Italic className="h-4 w-4" />
                </ToggleGroupItem>
                <ToggleGroupItem value="underline">
                  <Underline className="h-4 w-4" />
                </ToggleGroupItem>
              </ToggleGroup>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Multiple Selection</CardTitle>
              <CardDescription>Multiple items can be selected</CardDescription>
            </CardHeader>
            <CardContent>
              <ToggleGroup type="multiple" defaultValue={['bold', 'italic']}>
                <ToggleGroupItem value="bold">
                  <Bold className="h-4 w-4" />
                </ToggleGroupItem>
                <ToggleGroupItem value="italic">
                  <Italic className="h-4 w-4" />
                </ToggleGroupItem>
                <ToggleGroupItem value="underline">
                  <Underline className="h-4 w-4" />
                </ToggleGroupItem>
              </ToggleGroup>
            </CardContent>
          </Card>
        </div>
      </div>

      <div>
        <h3 className="text-heading-3 mb-4 font-medium">
          Semantic Color Usage
        </h3>
        <div className="grid grid-cols-2 gap-4">
          <Card className="border-primary/20 bg-primary/5">
            <CardContent className="pt-6">
              <ToggleGroup
                type="single"
                defaultValue="center"
                className="data-[state=on]:bg-primary"
              >
                <ToggleGroupItem
                  value="left"
                  className="data-[state=on]:bg-primary data-[state=on]:text-white"
                >
                  <AlignLeft className="h-4 w-4" />
                </ToggleGroupItem>
                <ToggleGroupItem
                  value="center"
                  className="data-[state=on]:bg-primary data-[state=on]:text-white"
                >
                  <AlignCenter className="h-4 w-4" />
                </ToggleGroupItem>
                <ToggleGroupItem
                  value="right"
                  className="data-[state=on]:bg-primary data-[state=on]:text-white"
                >
                  <AlignRight className="h-4 w-4" />
                </ToggleGroupItem>
              </ToggleGroup>
            </CardContent>
          </Card>

          <Card className="border-secondary/20 bg-secondary/5">
            <CardContent className="pt-6">
              <ToggleGroup type="single" defaultValue="center">
                <ToggleGroupItem
                  value="left"
                  className="data-[state=on]:bg-secondary data-[state=on]:text-white"
                >
                  <AlignLeft className="h-4 w-4" />
                </ToggleGroupItem>
                <ToggleGroupItem
                  value="center"
                  className="data-[state=on]:bg-secondary data-[state=on]:text-white"
                >
                  <AlignCenter className="h-4 w-4" />
                </ToggleGroupItem>
                <ToggleGroupItem
                  value="right"
                  className="data-[state=on]:bg-secondary data-[state=on]:text-white"
                >
                  <AlignRight className="h-4 w-4" />
                </ToggleGroupItem>
              </ToggleGroup>
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
              <p className="text-muted-foreground text-sm">
                Toggle Group components use the same design tokens as Toggle
                components:
              </p>

              <div className="bg-muted rounded-md p-3">
                <code className="text-xs">
                  --component-toggle-background
                  <br />
                  --component-toggle-border
                  <br />
                  --component-toggle-text
                  <br />
                  --component-toggle-pressed-background
                  <br />
                  --component-toggle-pressed-border
                  <br />
                  --component-toggle-pressed-text
                </code>
              </div>

              <div className="inline-flex rounded-md border" role="group">
                <button
                  className="px-3 py-2 text-sm font-medium transition-colors first:rounded-l-md last:rounded-r-md"
                  style={{
                    backgroundColor: 'var(--component-toggle-background)',
                    borderRight: '1px solid var(--component-toggle-border)',
                    color: 'var(--component-toggle-text)',
                  }}
                >
                  Option 1
                </button>
                <button
                  className="px-3 py-2 text-sm font-medium transition-colors first:rounded-l-md last:rounded-r-md"
                  style={{
                    backgroundColor:
                      'var(--component-toggle-pressed-background)',
                    borderRight:
                      '1px solid var(--component-toggle-pressed-border)',
                    color: 'var(--component-toggle-pressed-text)',
                  }}
                >
                  Selected
                </button>
                <button
                  className="px-3 py-2 text-sm font-medium transition-colors first:rounded-l-md last:rounded-r-md"
                  style={{
                    backgroundColor: 'var(--component-toggle-background)',
                    color: 'var(--component-toggle-text)',
                  }}
                >
                  Option 3
                </button>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      <div>
        <h3 className="text-heading-3 mb-4 font-medium">Layout Variations</h3>
        <div className="space-y-4">
          <div>
            <p className="mb-2 text-sm font-medium">Horizontal (Default)</p>
            <ToggleGroup type="single">
              <ToggleGroupItem value="1">1</ToggleGroupItem>
              <ToggleGroupItem value="2">2</ToggleGroupItem>
              <ToggleGroupItem value="3">3</ToggleGroupItem>
              <ToggleGroupItem value="4">4</ToggleGroupItem>
            </ToggleGroup>
          </div>

          <div>
            <p className="mb-2 text-sm font-medium">Vertical</p>
            <ToggleGroup type="single" className="flex-col">
              <ToggleGroupItem value="1" className="w-full justify-start">
                <Clock className="mr-2 h-4 w-4" />
                Recent
              </ToggleGroupItem>
              <ToggleGroupItem value="2" className="w-full justify-start">
                <Star className="mr-2 h-4 w-4" />
                Starred
              </ToggleGroupItem>
              <ToggleGroupItem value="3" className="w-full justify-start">
                <Clock className="mr-2 h-4 w-4" />
                Archive
              </ToggleGroupItem>
            </ToggleGroup>
          </div>

          <div>
            <p className="mb-2 text-sm font-medium">Grid Layout</p>
            <ToggleGroup type="multiple" className="grid grid-cols-3 gap-2">
              <ToggleGroupItem value="1" className="h-20 flex-col">
                <Zap className="h-5 w-5" />
                <span className="text-xs">Fast</span>
              </ToggleGroupItem>
              <ToggleGroupItem value="2" className="h-20 flex-col">
                <Shield className="h-5 w-5" />
                <span className="text-xs">Secure</span>
              </ToggleGroupItem>
              <ToggleGroupItem value="3" className="h-20 flex-col">
                <Globe className="h-5 w-5" />
                <span className="text-xs">Global</span>
              </ToggleGroupItem>
            </ToggleGroup>
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
          'Comprehensive showcase of toggle group variations using CoreLive Design System tokens for consistent styling across different states, types, and layouts.',
      },
    },
  },
}
