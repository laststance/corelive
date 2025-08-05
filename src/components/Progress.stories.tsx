import type { Meta, StoryObj } from '@storybook/react'
import {
  Download,
  Upload,
  Loader2,
  CheckCircle,
  Clock,
  Zap,
  FileText,
  Cloud,
  HardDrive,
  Cpu,
  Activity,
  TrendingUp,
  Trophy,
  Target,
  Rocket,
  Heart,
  Star,
  Award,
  Users,
  Calendar,
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
import { Label } from '@/components/ui/label'
import { Progress } from '@/components/ui/progress'
import { Separator } from '@/components/ui/separator'

const meta: Meta<typeof Progress> = {
  title: 'CoreLive Design System/Components/Progress',
  component: Progress,
  parameters: {
    layout: 'centered',
    docs: {
      description: {
        component:
          'A progress bar component for displaying completion states and loading indicators. Styled with CoreLive Design System tokens.',
      },
    },
  },
  tags: ['autodocs'],
  argTypes: {
    value: {
      control: { type: 'range', min: 0, max: 100 },
      description: 'Progress value (0-100)',
    },
  },
}

export default meta
type Story = StoryObj<typeof meta>

export const Default: Story = {
  args: {},
  render: () => <Progress value={60} className="w-[300px]" />,
}

export const Different_Values: Story = {
  args: {},
  render: () => (
    <div className="w-[400px] space-y-4">
      <div className="space-y-2">
        <div className="flex justify-between text-sm">
          <span>Empty</span>
          <span className="text-muted-foreground">0%</span>
        </div>
        <Progress value={0} />
      </div>

      <div className="space-y-2">
        <div className="flex justify-between text-sm">
          <span>Quarter</span>
          <span className="text-muted-foreground">25%</span>
        </div>
        <Progress value={25} />
      </div>

      <div className="space-y-2">
        <div className="flex justify-between text-sm">
          <span>Half</span>
          <span className="text-muted-foreground">50%</span>
        </div>
        <Progress value={50} />
      </div>

      <div className="space-y-2">
        <div className="flex justify-between text-sm">
          <span>Three Quarters</span>
          <span className="text-muted-foreground">75%</span>
        </div>
        <Progress value={75} />
      </div>

      <div className="space-y-2">
        <div className="flex justify-between text-sm">
          <span>Complete</span>
          <span className="text-muted-foreground">100%</span>
        </div>
        <Progress value={100} />
      </div>
    </div>
  ),
}

export const Animated: Story = {
  args: {},
  render: () => {
    const [progress, setProgress] = useState(0)

    useEffect(() => {
      const timer = setTimeout(() => setProgress(66), 500)
      return () => clearTimeout(timer)
    }, [])

    return (
      <div className="w-[400px] space-y-2">
        <div className="flex justify-between text-sm">
          <span>Loading...</span>
          <span className="text-muted-foreground">{progress}%</span>
        </div>
        <Progress
          value={progress}
          className="transition-all duration-1000 ease-out"
        />
      </div>
    )
  },
}

export const FileUpload: Story = {
  args: {},
  render: () => {
    const [uploadProgress, setUploadProgress] = useState(0)
    const [isUploading, setIsUploading] = useState(false)

    const startUpload = () => {
      setIsUploading(true)
      setUploadProgress(0)

      const interval = setInterval(() => {
        setUploadProgress((prev) => {
          if (prev >= 100) {
            clearInterval(interval)
            setIsUploading(false)
            return 100
          }
          return prev + 10
        })
      }, 300)
    }

    return (
      <Card className="w-[400px]">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Upload className="h-5 w-5" />
            File Upload
          </CardTitle>
          <CardDescription>Upload your files to the cloud</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <FileText className="h-4 w-4" />
                <span className="text-sm font-medium">document.pdf</span>
              </div>
              <span className="text-muted-foreground text-sm">2.4 MB</span>
            </div>

            <Progress value={uploadProgress} />

            <div className="flex items-center justify-between">
              <span className="text-muted-foreground text-xs">
                {uploadProgress === 100
                  ? 'Upload complete'
                  : `${uploadProgress}% uploaded`}
              </span>
              {uploadProgress === 100 && (
                <CheckCircle className="text-success h-4 w-4" />
              )}
            </div>
          </div>

          <Button
            onClick={startUpload}
            disabled={isUploading}
            className="w-full"
          >
            {isUploading ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Uploading...
              </>
            ) : uploadProgress === 100 ? (
              'Upload Another File'
            ) : (
              'Start Upload'
            )}
          </Button>
        </CardContent>
      </Card>
    )
  },
}

export const MultiStepProcess: Story = {
  args: {},
  render: () => {
    const [currentStep, setCurrentStep] = useState(1)
    const totalSteps = 4
    const progress = (currentStep / totalSteps) * 100

    const steps = [
      { name: 'Account Details', icon: Users },
      { name: 'Profile Setup', icon: FileText },
      { name: 'Preferences', icon: Zap },
      { name: 'Confirmation', icon: CheckCircle },
    ]

    return (
      <Card className="w-[500px]">
        <CardHeader>
          <CardTitle>Setup Progress</CardTitle>
          <CardDescription>Complete all steps to finish setup</CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="space-y-2">
            <div className="flex justify-between text-sm">
              <span>
                Step {currentStep} of {totalSteps}
              </span>
              <span className="text-muted-foreground">
                {Math.round(progress)}%
              </span>
            </div>
            <Progress value={progress} />
          </div>

          <div className="space-y-3">
            {steps.map((step, index) => {
              const StepIcon = step.icon
              const isCompleted = index + 1 < currentStep
              const isCurrent = index + 1 === currentStep

              return (
                <div
                  key={index}
                  className={`flex items-center gap-3 rounded-lg border p-3 transition-colors ${
                    isCompleted
                      ? 'bg-muted/50 border-success/50'
                      : isCurrent
                        ? 'bg-primary/5 border-primary'
                        : 'border-muted'
                  }`}
                >
                  <div
                    className={`rounded-full p-2 ${
                      isCompleted
                        ? 'bg-success text-white'
                        : isCurrent
                          ? 'bg-primary text-on-primary'
                          : 'bg-muted'
                    }`}
                  >
                    {isCompleted ? (
                      <CheckCircle className="h-4 w-4" />
                    ) : (
                      <StepIcon className="h-4 w-4" />
                    )}
                  </div>
                  <span
                    className={`font-medium ${
                      isCompleted || isCurrent ? '' : 'text-muted-foreground'
                    }`}
                  >
                    {step.name}
                  </span>
                  {isCompleted && (
                    <Badge variant="secondary" className="ml-auto">
                      Complete
                    </Badge>
                  )}
                  {isCurrent && <Badge className="ml-auto">Current</Badge>}
                </div>
              )
            })}
          </div>

          <div className="flex gap-2">
            <Button
              variant="outline"
              onClick={() => setCurrentStep(Math.max(1, currentStep - 1))}
              disabled={currentStep === 1}
            >
              Previous
            </Button>
            <Button
              className="flex-1"
              onClick={() =>
                setCurrentStep(Math.min(totalSteps, currentStep + 1))
              }
              disabled={currentStep === totalSteps}
            >
              {currentStep === totalSteps ? 'Complete' : 'Next Step'}
            </Button>
          </div>
        </CardContent>
      </Card>
    )
  },
}

export const SystemStatus: Story = {
  args: {},
  render: () => (
    <Card className="w-[450px]">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Activity className="h-5 w-5" />
          System Resources
        </CardTitle>
        <CardDescription>Current resource utilization</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <Label className="flex items-center gap-2">
              <Cpu className="h-4 w-4" />
              CPU Usage
            </Label>
            <span className="text-warning text-sm font-medium">65%</span>
          </div>
          <Progress value={65} className="[&>*]:bg-warning" />
        </div>

        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <Label className="flex items-center gap-2">
              <HardDrive className="h-4 w-4" />
              Memory
            </Label>
            <span className="text-success text-sm font-medium">32%</span>
          </div>
          <Progress value={32} className="[&>*]:bg-success" />
        </div>

        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <Label className="flex items-center gap-2">
              <HardDrive className="h-4 w-4" />
              Storage
            </Label>
            <span className="text-danger text-sm font-medium">89%</span>
          </div>
          <Progress value={89} className="[&>*]:bg-danger" />
          <p className="text-danger text-xs">Low disk space warning</p>
        </div>

        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <Label className="flex items-center gap-2">
              <Cloud className="h-4 w-4" />
              Network
            </Label>
            <span className="text-sm font-medium">45%</span>
          </div>
          <Progress value={45} />
        </div>

        <Separator />

        <Button variant="outline" className="w-full">
          <Activity className="mr-2 h-4 w-4" />
          View Detailed Stats
        </Button>
      </CardContent>
    </Card>
  ),
}

export const AchievementProgress: Story = {
  args: {},
  render: () => (
    <div className="grid w-full max-w-3xl grid-cols-1 gap-4 md:grid-cols-2">
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="flex items-center gap-2 text-lg">
              <Trophy className="h-5 w-5 text-yellow-500" />
              Daily Goals
            </CardTitle>
            <Badge>Today</Badge>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <div className="flex items-center justify-between text-sm">
              <span className="flex items-center gap-2">
                <Target className="h-4 w-4" />
                Steps
              </span>
              <span className="font-medium">8,432 / 10,000</span>
            </div>
            <Progress value={84} />
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between text-sm">
              <span className="flex items-center gap-2">
                <Heart className="h-4 w-4" />
                Active Minutes
              </span>
              <span className="font-medium">45 / 30</span>
            </div>
            <Progress value={100} className="[&>*]:bg-success" />
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between text-sm">
              <span className="flex items-center gap-2">
                <Zap className="h-4 w-4" />
                Calories
              </span>
              <span className="font-medium">1,850 / 2,500</span>
            </div>
            <Progress value={74} />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="flex items-center gap-2 text-lg">
              <Award className="h-5 w-5 text-purple-500" />
              Achievements
            </CardTitle>
            <Badge variant="secondary">Level 12</Badge>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <div className="flex items-center justify-between text-sm">
              <span className="flex items-center gap-2">
                <Star className="h-4 w-4" />
                Beginner
              </span>
              <span className="text-success font-medium">Complete</span>
            </div>
            <Progress value={100} className="[&>*]:bg-success" />
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between text-sm">
              <span className="flex items-center gap-2">
                <Rocket className="h-4 w-4" />
                Intermediate
              </span>
              <span className="font-medium">18 / 25</span>
            </div>
            <Progress value={72} />
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between text-sm">
              <span className="flex items-center gap-2">
                <Trophy className="h-4 w-4" />
                Expert
              </span>
              <span className="font-medium">2 / 50</span>
            </div>
            <Progress value={4} />
          </div>
        </CardContent>
      </Card>
    </div>
  ),
  parameters: {
    layout: 'padded',
  },
}

export const DownloadProgress: Story = {
  args: {},
  render: () => {
    const downloads = [
      {
        name: 'Ubuntu 22.04 LTS.iso',
        size: '3.6 GB',
        progress: 100,
        status: 'complete',
      },
      {
        name: 'node-v18.17.0.pkg',
        size: '87.2 MB',
        progress: 67,
        status: 'downloading',
      },
      {
        name: 'vscode-installer.exe',
        size: '92.1 MB',
        progress: 23,
        status: 'downloading',
      },
      {
        name: 'docker-desktop.dmg',
        size: '612 MB',
        progress: 0,
        status: 'queued',
      },
    ]

    return (
      <Card className="w-[500px]">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Download className="h-5 w-5" />
            Downloads
          </CardTitle>
          <CardDescription>4 files • 2 active</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {downloads.map((download, index) => (
            <div key={index} className="space-y-2">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium">{download.name}</p>
                  <p className="text-muted-foreground text-xs">
                    {download.size}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  {download.status === 'complete' && (
                    <CheckCircle className="text-success h-4 w-4" />
                  )}
                  {download.status === 'downloading' && (
                    <span className="text-sm font-medium">
                      {download.progress}%
                    </span>
                  )}
                  {download.status === 'queued' && (
                    <Badge variant="secondary">Queued</Badge>
                  )}
                </div>
              </div>
              <Progress
                value={download.progress}
                className={
                  download.status === 'complete' ? '[&>*]:bg-success' : ''
                }
              />
            </div>
          ))}

          <Separator />

          <div className="flex items-center justify-between">
            <Button variant="outline" size="sm">
              Pause All
            </Button>
            <Button size="sm">Clear Completed</Button>
          </div>
        </CardContent>
      </Card>
    )
  },
}

export const CourseProgress: Story = {
  args: {},
  render: () => (
    <Card className="w-[500px]">
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle>Web Development Bootcamp</CardTitle>
            <CardDescription>Track your learning progress</CardDescription>
          </div>
          <Badge className="bg-primary text-on-primary">
            <TrendingUp className="mr-1 h-3 w-3" />
            Active
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="space-y-2">
          <div className="flex justify-between text-sm">
            <span className="font-medium">Overall Progress</span>
            <span className="text-muted-foreground">162 / 240 lessons</span>
          </div>
          <Progress value={67.5} className="h-3" />
          <div className="text-muted-foreground flex items-center gap-4 text-xs">
            <span className="flex items-center gap-1">
              <Clock className="h-3 w-3" />
              45h completed
            </span>
            <span className="flex items-center gap-1">
              <Calendar className="h-3 w-3" />
              22h remaining
            </span>
          </div>
        </div>

        <div className="space-y-3">
          <h4 className="text-sm font-medium">Module Progress</h4>

          <div className="space-y-3">
            <div className="space-y-1">
              <div className="flex items-center justify-between text-sm">
                <span>HTML & CSS Basics</span>
                <CheckCircle className="text-success h-4 w-4" />
              </div>
              <Progress value={100} className="[&>*]:bg-success h-2" />
            </div>

            <div className="space-y-1">
              <div className="flex items-center justify-between text-sm">
                <span>JavaScript Fundamentals</span>
                <span className="text-muted-foreground text-xs">85%</span>
              </div>
              <Progress value={85} className="h-2" />
            </div>

            <div className="space-y-1">
              <div className="flex items-center justify-between text-sm">
                <span>React & State Management</span>
                <span className="text-muted-foreground text-xs">42%</span>
              </div>
              <Progress value={42} className="h-2" />
            </div>

            <div className="space-y-1">
              <div className="flex items-center justify-between text-sm">
                <span>Backend Development</span>
                <span className="text-muted-foreground text-xs">0%</span>
              </div>
              <Progress value={0} className="h-2" />
            </div>
          </div>
        </div>

        <Button className="w-full">Continue Learning</Button>
      </CardContent>
    </Card>
  ),
}

export const CoreLiveThemeShowcase: Story = {
  args: {},
  render: () => (
    <div className="w-full max-w-2xl space-y-6">
      <div>
        <h3 className="text-heading-3 mb-4 font-medium">Progress States</h3>
        <div className="space-y-4">
          <div className="grid gap-2">
            <Label>Default Progress</Label>
            <Progress
              value={60}
              style={{
                backgroundColor: 'var(--component-progress-background)',
                borderColor: 'var(--component-progress-border)',
              }}
              className="[&>*]:bg-[var(--component-progress-indicator)]"
            />
          </div>

          <div className="grid gap-2">
            <Label>Completed Progress</Label>
            <Progress value={100} className="[&>*]:bg-success" />
          </div>

          <div className="grid gap-2">
            <Label>Indeterminate Progress</Label>
            <div className="bg-secondary relative h-2 w-full overflow-hidden rounded-full">
              <div className="bg-primary h-full w-full animate-pulse" />
            </div>
          </div>
        </div>
      </div>

      <div>
        <h3 className="text-heading-3 mb-4 font-medium">
          Semantic Color Progress
        </h3>
        <div className="grid grid-cols-2 gap-4">
          <Card className="border-success/20 bg-success/5">
            <CardContent className="space-y-2 pt-6">
              <Label className="text-success font-medium">
                Success Progress
              </Label>
              <Progress value={100} className="[&>*]:bg-success" />
            </CardContent>
          </Card>

          <Card className="border-warning/20 bg-warning/5">
            <CardContent className="space-y-2 pt-6">
              <Label className="text-warning font-medium">
                Warning Progress
              </Label>
              <Progress value={65} className="[&>*]:bg-warning" />
            </CardContent>
          </Card>

          <Card className="border-danger/20 bg-danger/5">
            <CardContent className="space-y-2 pt-6">
              <Label className="text-danger font-medium">
                Critical Progress
              </Label>
              <Progress value={90} className="[&>*]:bg-danger" />
            </CardContent>
          </Card>

          <Card className="border-info/20 bg-info/5">
            <CardContent className="space-y-2 pt-6">
              <Label className="text-info font-medium">Info Progress</Label>
              <Progress value={45} className="[&>*]:bg-info" />
            </CardContent>
          </Card>
        </div>
      </div>

      <div>
        <h3 className="text-heading-3 mb-4 font-medium">Different Sizes</h3>
        <div className="space-y-4">
          <div className="grid gap-2">
            <Label className="text-sm">Small (h-1)</Label>
            <Progress value={70} className="h-1" />
          </div>

          <div className="grid gap-2">
            <Label className="text-sm">Default (h-2)</Label>
            <Progress value={70} className="h-2" />
          </div>

          <div className="grid gap-2">
            <Label className="text-sm">Medium (h-3)</Label>
            <Progress value={70} className="h-3" />
          </div>

          <div className="grid gap-2">
            <Label className="text-sm">Large (h-4)</Label>
            <Progress value={70} className="h-4" />
          </div>
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
                <Label>Custom progress using component tokens</Label>
                <div
                  className="relative h-3 w-full overflow-hidden rounded-full"
                  style={{
                    backgroundColor: 'var(--component-progress-background)',
                    border: `1px solid var(--component-progress-border)`,
                  }}
                >
                  <div
                    className="h-full transition-all duration-300 ease-out"
                    style={{
                      width: '75%',
                      backgroundColor: 'var(--component-progress-indicator)',
                    }}
                  />
                </div>
              </div>

              <div className="bg-muted rounded-md p-3">
                <code className="text-xs">
                  --component-progress-background
                  <br />
                  --component-progress-border
                  <br />
                  --component-progress-indicator
                </code>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      <div>
        <h3 className="text-heading-3 mb-4 font-medium">Advanced Examples</h3>
        <Card>
          <CardContent className="space-y-4 pt-6">
            <div className="space-y-2">
              <div className="flex justify-between text-sm">
                <span>Gradient Progress</span>
                <span>80%</span>
              </div>
              <Progress
                value={80}
                className="[&>*]:from-primary [&>*]:to-accent [&>*]:bg-gradient-to-r"
              />
            </div>

            <div className="space-y-2">
              <div className="flex justify-between text-sm">
                <span>Striped Progress</span>
                <span>60%</span>
              </div>
              <Progress
                value={60}
                className="[&>*]:bg-primary [&>*]:animate-[shimmer_1s_linear_infinite] [&>*]:bg-gradient-to-r [&>*]:from-transparent [&>*]:via-white/10 [&>*]:to-transparent [&>*]:bg-[length:1rem_1rem]"
              />
            </div>

            <div className="space-y-2">
              <div className="flex justify-between text-sm">
                <span>Multi-segment Progress</span>
                <span>Total: 75%</span>
              </div>
              <div className="bg-secondary relative h-2 w-full overflow-hidden rounded-full">
                <div className="bg-success absolute h-full w-[30%]" />
                <div className="bg-warning absolute left-[30%] h-full w-[25%]" />
                <div className="bg-danger absolute left-[55%] h-full w-[20%]" />
              </div>
              <div className="flex gap-4 text-xs">
                <span className="flex items-center gap-1">
                  <div className="bg-success h-3 w-3 rounded" />
                  Complete (30%)
                </span>
                <span className="flex items-center gap-1">
                  <div className="bg-warning h-3 w-3 rounded" />
                  In Progress (25%)
                </span>
                <span className="flex items-center gap-1">
                  <div className="bg-danger h-3 w-3 rounded" />
                  Failed (20%)
                </span>
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
          'Comprehensive showcase of progress bar variations using CoreLive Design System tokens for consistent styling across different states, sizes, and use cases.',
      },
    },
  },
}
