import type { Meta, StoryObj } from '@storybook/react'
import {
  Volume2,
  Sun,
  Zap,
  Gauge,
  Activity,
  Thermometer,
  Music,
  Palette,
  SlidersHorizontal,
  Target,
  Cpu,
  HardDrive,
  Wifi,
  Users,
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
import { Slider } from '@/components/ui/slider'

const meta: Meta<typeof Slider> = {
  title: 'CoreLive Design System/Components/Slider',
  component: Slider,
  parameters: {
    layout: 'centered',
    docs: {
      description: {
        component:
          'A slider component for selecting numeric values within a range. Accessible and styled with CoreLive Design System tokens.',
      },
    },
  },
  tags: ['autodocs'],
  argTypes: {
    defaultValue: {
      control: 'object',
      description: 'Default value(s) for the slider',
    },
    max: {
      control: 'number',
      description: 'Maximum value',
    },
    min: {
      control: 'number',
      description: 'Minimum value',
    },
    step: {
      control: 'number',
      description: 'Step increment',
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
  render: () => (
    <Slider defaultValue={[50]} max={100} step={1} className="w-[200px]" />
  ),
}

export const WithLabel: Story = {
  args: {},
  render: () => {
    const [value, setValue] = useState([50])

    return (
      <div className="grid w-[250px] gap-2">
        <div className="flex items-center justify-between">
          <Label htmlFor="slider">Volume</Label>
          <span className="text-muted-foreground text-sm">
            {value[0] ?? 0}%
          </span>
        </div>
        <Slider
          id="slider"
          value={value}
          onValueChange={setValue}
          max={100}
          step={1}
        />
      </div>
    )
  },
}

export const Range: Story = {
  args: {},
  render: () => {
    const [range, setRange] = useState([25, 75])

    return (
      <div className="grid w-[300px] gap-2">
        <div className="flex items-center justify-between">
          <Label>Price Range</Label>
          <span className="text-muted-foreground text-sm">
            ${range[0]} - ${range[1]}
          </span>
        </div>
        <Slider value={range} onValueChange={setRange} max={100} step={5} />
      </div>
    )
  },
}

export const Steps: Story = {
  args: {},
  render: () => {
    const [value, setValue] = useState([4])
    const steps = ['XS', 'S', 'M', 'L', 'XL', 'XXL']

    return (
      <div className="grid w-[300px] gap-3">
        <div className="flex items-center justify-between">
          <Label>Size</Label>
          <Badge variant="secondary">{steps[value[0] ?? 0]}</Badge>
        </div>
        <Slider value={value} onValueChange={setValue} max={5} step={1} />
        <div className="text-muted-foreground flex justify-between text-xs">
          {steps.map((step, index) => (
            <span key={index}>{step}</span>
          ))}
        </div>
      </div>
    )
  },
}

export const Disabled: Story = {
  args: {},
  render: () => (
    <div className="w-[250px] space-y-4">
      <div className="grid gap-2">
        <Label className="text-muted-foreground">Disabled (Empty)</Label>
        <Slider defaultValue={[0]} max={100} disabled />
      </div>
      <div className="grid gap-2">
        <Label className="text-muted-foreground">Disabled (With Value)</Label>
        <Slider defaultValue={[65]} max={100} disabled />
      </div>
    </div>
  ),
}

export const MediaControls: Story = {
  args: {},
  render: () => {
    const [volume, setVolume] = useState([80])
    const [brightness, setBrightness] = useState([60])
    const [playbackSpeed, setPlaybackSpeed] = useState([1])

    return (
      <Card className="w-[400px]">
        <CardHeader>
          <CardTitle>Media Controls</CardTitle>
          <CardDescription>Adjust your media settings</CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label className="flex items-center gap-2">
                <Volume2 className="h-4 w-4" />
                Volume
              </Label>
              <span className="text-muted-foreground w-12 text-right text-sm">
                {volume[0] ?? 0}%
              </span>
            </div>
            <Slider
              value={volume}
              onValueChange={setVolume}
              max={100}
              step={1}
            />
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label className="flex items-center gap-2">
                <Sun className="h-4 w-4" />
                Brightness
              </Label>
              <span className="text-muted-foreground w-12 text-right text-sm">
                {brightness[0] ?? 0}%
              </span>
            </div>
            <Slider
              value={brightness}
              onValueChange={setBrightness}
              max={100}
              step={1}
            />
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label className="flex items-center gap-2">
                <Zap className="h-4 w-4" />
                Playback Speed
              </Label>
              <span className="text-muted-foreground w-12 text-right text-sm">
                {playbackSpeed[0]}x
              </span>
            </div>
            <Slider
              value={playbackSpeed}
              onValueChange={setPlaybackSpeed}
              min={0.5}
              max={2}
              step={0.25}
            />
            <div className="text-muted-foreground flex justify-between text-xs">
              <span>0.5x</span>
              <span>1x</span>
              <span>1.5x</span>
              <span>2x</span>
            </div>
          </div>
        </CardContent>
      </Card>
    )
  },
}

export const ColorPicker: Story = {
  args: {},
  render: () => {
    const [hue, setHue] = useState([180])
    const [saturation, setSaturation] = useState([70])
    const [lightness, setLightness] = useState([50])

    const color = `hsl(${hue[0]}, ${saturation[0]}%, ${lightness[0]}%)`

    return (
      <Card className="w-[400px]">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Palette className="h-5 w-5" />
            Color Picker
          </CardTitle>
          <CardDescription>Adjust color using HSL values</CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div
            className="h-24 rounded-lg border"
            style={{ backgroundColor: color }}
          />

          <div className="space-y-4">
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label>Hue</Label>
                <span className="text-muted-foreground w-12 text-right text-sm">
                  {hue[0]}°
                </span>
              </div>
              <Slider
                value={hue}
                onValueChange={setHue}
                max={360}
                step={1}
                className="[&_[role=slider]]:bg-gradient-to-r [&_[role=slider]]:from-red-500 [&_[role=slider]]:via-green-500 [&_[role=slider]]:to-blue-500"
              />
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label>Saturation</Label>
                <span className="text-muted-foreground w-12 text-right text-sm">
                  {saturation[0]}%
                </span>
              </div>
              <Slider
                value={saturation}
                onValueChange={setSaturation}
                max={100}
                step={1}
              />
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label>Lightness</Label>
                <span className="text-muted-foreground w-12 text-right text-sm">
                  {lightness[0]}%
                </span>
              </div>
              <Slider
                value={lightness}
                onValueChange={setLightness}
                max={100}
                step={1}
              />
            </div>
          </div>

          <div className="bg-muted flex items-center justify-between rounded-md p-3">
            <code className="text-sm">{color}</code>
            <Button size="sm" variant="outline">
              Copy
            </Button>
          </div>
        </CardContent>
      </Card>
    )
  },
}

export const SystemMonitor: Story = {
  args: {},
  render: () => {
    const [cpu, setCpu] = useState([45])
    const [memory, setMemory] = useState([72])
    const [disk, setDisk] = useState([58])
    const [network, setNetwork] = useState([23])

    return (
      <Card className="w-[450px]">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Activity className="h-5 w-5" />
            System Monitor
          </CardTitle>
          <CardDescription>Real-time system resource usage</CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <Label className="flex items-center gap-2">
                <Cpu className="h-4 w-4" />
                CPU Usage
              </Label>
              <span
                className={`text-sm font-medium ${(cpu[0] ?? 0) > 80 ? 'text-danger' : (cpu[0] ?? 0) > 60 ? 'text-warning' : 'text-success'}`}
              >
                {cpu[0] ?? 0}%
              </span>
            </div>
            <Slider
              value={cpu}
              onValueChange={setCpu}
              max={100}
              step={1}
              className={`${(cpu[0] ?? 0) > 80 ? '[&_[role=slider]]:bg-danger' : (cpu[0] ?? 0) > 60 ? '[&_[role=slider]]:bg-warning' : '[&_[role=slider]]:bg-success'}`}
            />
          </div>

          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <Label className="flex items-center gap-2">
                <HardDrive className="h-4 w-4" />
                Memory
              </Label>
              <span
                className={`text-sm font-medium ${(memory[0] ?? 0) > 80 ? 'text-danger' : (memory[0] ?? 0) > 60 ? 'text-warning' : 'text-success'}`}
              >
                {memory[0] ?? 0}%
              </span>
            </div>
            <Slider
              value={memory}
              onValueChange={setMemory}
              max={100}
              step={1}
              className={`${(memory[0] ?? 0) > 80 ? '[&_[role=slider]]:bg-danger' : (memory[0] ?? 0) > 60 ? '[&_[role=slider]]:bg-warning' : '[&_[role=slider]]:bg-success'}`}
            />
          </div>

          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <Label className="flex items-center gap-2">
                <HardDrive className="h-4 w-4" />
                Disk Space
              </Label>
              <span
                className={`text-sm font-medium ${(disk[0] ?? 0) > 80 ? 'text-danger' : (disk[0] ?? 0) > 60 ? 'text-warning' : 'text-success'}`}
              >
                {disk[0] ?? 0}%
              </span>
            </div>
            <Slider
              value={disk}
              onValueChange={setDisk}
              max={100}
              step={1}
              className={`${(disk[0] ?? 0) > 80 ? '[&_[role=slider]]:bg-danger' : (disk[0] ?? 0) > 60 ? '[&_[role=slider]]:bg-warning' : '[&_[role=slider]]:bg-success'}`}
            />
          </div>

          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <Label className="flex items-center gap-2">
                <Wifi className="h-4 w-4" />
                Network
              </Label>
              <span className="text-sm font-medium">{network[0]} Mbps</span>
            </div>
            <Slider
              value={network}
              onValueChange={setNetwork}
              max={100}
              step={1}
            />
          </div>

          <Separator />

          <div className="flex items-center justify-between">
            <Button variant="outline" size="sm">
              <Activity className="mr-2 h-4 w-4" />
              View Details
            </Button>
            <Button size="sm">Optimize</Button>
          </div>
        </CardContent>
      </Card>
    )
  },
}

export const PricingCalculator: Story = {
  args: {},
  render: () => {
    const [users, setUsers] = useState([10])
    const [storage, setStorage] = useState([50])
    const [bandwidth, setBandwidth] = useState([100])

    const basePrice = 10
    const userPrice = (users[0] ?? 0) * 5
    const storagePrice = Math.floor((storage[0] ?? 0) / 10) * 2
    const bandwidthPrice = Math.floor((bandwidth[0] ?? 0) / 50) * 3
    const totalPrice = basePrice + userPrice + storagePrice + bandwidthPrice

    return (
      <Card className="w-[500px]">
        <CardHeader>
          <CardTitle>Pricing Calculator</CardTitle>
          <CardDescription>
            Customize your plan based on your needs
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <Label className="flex items-center gap-2">
                <Users className="h-4 w-4" />
                Team Members
              </Label>
              <span className="text-sm font-medium">{users[0] ?? 0} users</span>
            </div>
            <Slider
              value={users}
              onValueChange={setUsers}
              min={1}
              max={100}
              step={1}
            />
            <div className="text-muted-foreground flex justify-between text-xs">
              <span>1 user</span>
              <span>100 users</span>
            </div>
          </div>

          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <Label className="flex items-center gap-2">
                <HardDrive className="h-4 w-4" />
                Storage
              </Label>
              <span className="text-sm font-medium">{storage[0] ?? 0} GB</span>
            </div>
            <Slider
              value={storage}
              onValueChange={setStorage}
              min={10}
              max={500}
              step={10}
            />
            <div className="text-muted-foreground flex justify-between text-xs">
              <span>10 GB</span>
              <span>500 GB</span>
            </div>
          </div>

          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <Label className="flex items-center gap-2">
                <Wifi className="h-4 w-4" />
                Bandwidth
              </Label>
              <span className="text-sm font-medium">
                {bandwidth[0] ?? 0} GB/month
              </span>
            </div>
            <Slider
              value={bandwidth}
              onValueChange={setBandwidth}
              min={50}
              max={1000}
              step={50}
            />
            <div className="text-muted-foreground flex justify-between text-xs">
              <span>50 GB</span>
              <span>1 TB</span>
            </div>
          </div>

          <Separator />

          <div className="space-y-2">
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Base price</span>
              <span>${basePrice}/mo</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Team members</span>
              <span>${userPrice}/mo</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Storage</span>
              <span>${storagePrice}/mo</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Bandwidth</span>
              <span>${bandwidthPrice}/mo</span>
            </div>
            <Separator />
            <div className="flex items-center justify-between">
              <span className="text-lg font-semibold">Total</span>
              <span className="text-primary text-2xl font-bold">
                ${totalPrice}/mo
              </span>
            </div>
          </div>

          <Button className="w-full" size="lg">
            Start Free Trial
          </Button>
        </CardContent>
      </Card>
    )
  },
  parameters: {
    layout: 'padded',
  },
}

export const GameSettings: Story = {
  args: {},
  render: () => {
    const [difficulty, setDifficulty] = useState([2])
    const [soundEffects, setSoundEffects] = useState([80])
    const [music, setMusic] = useState([60])
    const [sensitivity, setSensitivity] = useState([50])

    const difficulties = ['Easy', 'Normal', 'Hard', 'Expert', 'Nightmare']

    return (
      <Card className="w-[400px]">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <SlidersHorizontal className="h-5 w-5" />
            Game Settings
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <Label className="flex items-center gap-2">
                <Target className="h-4 w-4" />
                Difficulty
              </Label>
              <Badge
                variant={
                  (difficulty[0] ?? 0) >= 3
                    ? 'destructive'
                    : (difficulty[0] ?? 0) >= 2
                      ? 'secondary'
                      : 'default'
                }
              >
                {difficulties[difficulty[0] ?? 0] ?? 'Normal'}
              </Badge>
            </div>
            <Slider
              value={difficulty}
              onValueChange={setDifficulty}
              max={4}
              step={1}
            />
            <div className="text-muted-foreground flex justify-between text-xs">
              {difficulties.map((diff, index) => (
                <span
                  key={index}
                  className={
                    difficulty[0] !== undefined && index === difficulty[0]
                      ? 'text-foreground font-medium'
                      : ''
                  }
                >
                  {diff}
                </span>
              ))}
            </div>
          </div>

          <Separator />

          <div className="space-y-4">
            <h4 className="text-sm font-medium">Audio</h4>

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label className="flex items-center gap-2">
                  <Volume2 className="h-4 w-4" />
                  Sound Effects
                </Label>
                <span className="text-muted-foreground w-12 text-right text-sm">
                  {soundEffects[0] ?? 0}%
                </span>
              </div>
              <Slider
                value={soundEffects}
                onValueChange={setSoundEffects}
                max={100}
                step={5}
              />
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label className="flex items-center gap-2">
                  <Music className="h-4 w-4" />
                  Music
                </Label>
                <span className="text-muted-foreground w-12 text-right text-sm">
                  {music[0] ?? 0}%
                </span>
              </div>
              <Slider
                value={music}
                onValueChange={setMusic}
                max={100}
                step={5}
              />
            </div>
          </div>

          <Separator />

          <div className="space-y-4">
            <h4 className="text-sm font-medium">Controls</h4>

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label className="flex items-center gap-2">
                  <Gauge className="h-4 w-4" />
                  Mouse Sensitivity
                </Label>
                <span className="text-muted-foreground w-12 text-right text-sm">
                  {sensitivity[0] ?? 0}%
                </span>
              </div>
              <Slider
                value={sensitivity}
                onValueChange={setSensitivity}
                max={100}
                step={1}
              />
            </div>
          </div>

          <div className="flex gap-2">
            <Button variant="outline" className="flex-1">
              Reset
            </Button>
            <Button className="flex-1">Apply</Button>
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
        <h3 className="text-heading-3 mb-4 font-medium">Slider States</h3>
        <div className="space-y-4">
          <div className="grid gap-2">
            <Label>Default State</Label>
            <Slider
              defaultValue={[50]}
              max={100}
              style={
                {
                  '--slider-track-background':
                    'var(--component-slider-track-background)',
                  '--slider-track-border':
                    'var(--component-slider-track-border)',
                  '--slider-thumb-background':
                    'var(--component-slider-thumb-background)',
                  '--slider-thumb-border':
                    'var(--component-slider-thumb-border)',
                } as React.CSSProperties
              }
            />
          </div>

          <div className="grid gap-2">
            <Label>Active/Filled State</Label>
            <Slider
              defaultValue={[75]}
              max={100}
              className="[&_[role=slider]]:bg-primary"
            />
          </div>

          <div className="grid gap-2">
            <Label className="text-muted-foreground">Disabled State</Label>
            <Slider
              defaultValue={[30]}
              max={100}
              disabled
              style={
                {
                  '--slider-track-background':
                    'var(--component-slider-track-disabled-background)',
                  '--slider-thumb-background':
                    'var(--component-slider-thumb-disabled-background)',
                } as React.CSSProperties
              }
            />
          </div>
        </div>
      </div>

      <div>
        <h3 className="text-heading-3 mb-4 font-medium">
          Semantic Color Sliders
        </h3>
        <div className="grid grid-cols-2 gap-4">
          <Card className="border-success/20 bg-success/5">
            <CardContent className="space-y-2 pt-6">
              <Label className="text-success font-medium">Success Level</Label>
              <Slider
                defaultValue={[80]}
                max={100}
                className="[&_[role=slider]]:bg-success [&_[data-orientation=horizontal]]:bg-success/20"
              />
            </CardContent>
          </Card>

          <Card className="border-warning/20 bg-warning/5">
            <CardContent className="space-y-2 pt-6">
              <Label className="text-warning font-medium">Warning Level</Label>
              <Slider
                defaultValue={[60]}
                max={100}
                className="[&_[role=slider]]:bg-warning [&_[data-orientation=horizontal]]:bg-warning/20"
              />
            </CardContent>
          </Card>

          <Card className="border-danger/20 bg-danger/5">
            <CardContent className="space-y-2 pt-6">
              <Label className="text-danger font-medium">Danger Level</Label>
              <Slider
                defaultValue={[30]}
                max={100}
                className="[&_[role=slider]]:bg-danger [&_[data-orientation=horizontal]]:bg-danger/20"
              />
            </CardContent>
          </Card>

          <Card className="border-info/20 bg-info/5">
            <CardContent className="space-y-2 pt-6">
              <Label className="text-info font-medium">Info Level</Label>
              <Slider
                defaultValue={[45]}
                max={100}
                className="[&_[role=slider]]:bg-info [&_[data-orientation=horizontal]]:bg-info/20"
              />
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
              <div className="grid gap-2">
                <Label>Custom slider using component tokens</Label>
                <div className="relative w-full">
                  <div
                    className="relative h-2 w-full rounded-full"
                    style={{
                      backgroundColor:
                        'var(--component-slider-track-background)',
                      border: `1px solid var(--component-slider-track-border)`,
                    }}
                  >
                    <div
                      className="absolute h-full rounded-full"
                      style={{
                        width: '60%',
                        backgroundColor:
                          'var(--component-slider-range-background)',
                      }}
                    />
                    <div
                      className="absolute top-1/2 h-5 w-5 -translate-y-1/2 rounded-full"
                      style={{
                        left: '60%',
                        backgroundColor:
                          'var(--component-slider-thumb-background)',
                        border: `2px solid var(--component-slider-thumb-border)`,
                        transform: 'translateX(-50%) translateY(-50%)',
                      }}
                    />
                  </div>
                </div>
              </div>

              <div className="bg-muted rounded-md p-3">
                <code className="text-xs">
                  --component-slider-track-background
                  <br />
                  --component-slider-track-border
                  <br />
                  --component-slider-range-background
                  <br />
                  --component-slider-thumb-background
                  <br />
                  --component-slider-thumb-border
                </code>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      <div>
        <h3 className="text-heading-3 mb-4 font-medium">Advanced Examples</h3>
        <div className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Temperature Control</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <Label className="flex items-center gap-2">
                    <Thermometer className="h-4 w-4" />
                    Room Temperature
                  </Label>
                  <span className="text-sm font-medium">72°F</span>
                </div>
                <Slider
                  defaultValue={[72]}
                  min={60}
                  max={85}
                  className="[&_[role=slider]]:bg-gradient-to-r [&_[role=slider]]:from-blue-500 [&_[role=slider]]:to-red-500"
                />
                <div className="text-muted-foreground flex justify-between text-xs">
                  <span className="text-blue-500">60°F</span>
                  <span>70°F</span>
                  <span className="text-red-500">85°F</span>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Multi-Range Example</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-2">
                <Label>Filter by Price Range</Label>
                <Slider
                  defaultValue={[20, 80]}
                  max={100}
                  className="[&_[role=slider]]:bg-primary"
                />
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">$20</span>
                  <span className="font-medium">$20 - $80</span>
                  <span className="text-muted-foreground">$100</span>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  ),
  parameters: {
    layout: 'padded',
    docs: {
      description: {
        story:
          'Comprehensive showcase of slider variations using CoreLive Design System tokens for consistent styling across different states and use cases.',
      },
    },
  },
}
