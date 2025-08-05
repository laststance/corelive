import type { Meta, StoryObj } from '@storybook/react'
import {
  Activity,
  Clock,
  DollarSign,
  Eye,
  Filter,
  Monitor,
  MousePointer,
  RefreshCw,
  ShoppingCart,
  Smartphone,
  Tablet,
  TrendingDown,
  TrendingUp,
  Users,
} from 'lucide-react'
import { useState } from 'react'
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Label,
  Line,
  LineChart,
  Pie,
  PieChart,
  RadialBar,
  RadialBarChart,
  XAxis,
} from 'recharts'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  ChartLegend,
  ChartLegendContent,
} from '@/components/ui/chart'

const meta: Meta<typeof ChartContainer> = {
  title: 'CoreLive Design System/Components/Chart',
  component: ChartContainer,
  parameters: {
    layout: 'centered',
    docs: {
      description: {
        component:
          'A chart component library built on Recharts with CoreLive Design System styling. Supports various chart types including bar, line, area, pie, and radial charts.',
      },
    },
  },
  tags: ['autodocs'],
}

export default meta
type Story = StoryObj<typeof meta>

const chartData = [
  { month: 'January', desktop: 186, mobile: 80 },
  { month: 'February', desktop: 305, mobile: 200 },
  { month: 'March', desktop: 237, mobile: 120 },
  { month: 'April', desktop: 73, mobile: 190 },
  { month: 'May', desktop: 209, mobile: 130 },
  { month: 'June', desktop: 214, mobile: 140 },
]

const chartConfig = {
  desktop: {
    label: 'Desktop',
    color: 'hsl(var(--chart-1))',
  },
  mobile: {
    label: 'Mobile',
    color: 'hsl(var(--chart-2))',
  },
}

export const Default: Story = {
  args: {},
  render: () => (
    <Card>
      <CardHeader>
        <CardTitle>Bar Chart</CardTitle>
        <CardDescription>January - June 2024</CardDescription>
      </CardHeader>
      <CardContent>
        <ChartContainer config={chartConfig}>
          <BarChart accessibilityLayer data={chartData}>
            <CartesianGrid vertical={false} />
            <XAxis
              dataKey="month"
              tickLine={false}
              tickMargin={10}
              axisLine={false}
              tickFormatter={(value) => value.slice(0, 3)}
            />
            <ChartTooltip
              cursor={false}
              content={<ChartTooltipContent indicator="dashed" />}
            />
            <Bar dataKey="desktop" fill="var(--color-desktop)" radius={4} />
            <Bar dataKey="mobile" fill="var(--color-mobile)" radius={4} />
          </BarChart>
        </ChartContainer>
      </CardContent>
    </Card>
  ),
}

export const LineChartExample: Story = {
  args: {},
  render: () => {
    const lineData = [
      { month: 'Jan', revenue: 2400, expenses: 1400 },
      { month: 'Feb', revenue: 1398, expenses: 2210 },
      { month: 'Mar', revenue: 9800, expenses: 2290 },
      { month: 'Apr', revenue: 3908, expenses: 2000 },
      { month: 'May', revenue: 4800, expenses: 2181 },
      { month: 'Jun', revenue: 3800, expenses: 2500 },
      { month: 'Jul', revenue: 4300, expenses: 2100 },
    ]

    const lineConfig = {
      revenue: {
        label: 'Revenue',
        color: 'hsl(var(--chart-1))',
      },
      expenses: {
        label: 'Expenses',
        color: 'hsl(var(--chart-2))',
      },
    }

    return (
      <Card>
        <CardHeader>
          <CardTitle>Revenue vs Expenses</CardTitle>
          <CardDescription>Monthly comparison for 2024</CardDescription>
        </CardHeader>
        <CardContent>
          <ChartContainer config={lineConfig}>
            <LineChart
              accessibilityLayer
              data={lineData}
              margin={{
                left: 12,
                right: 12,
              }}
            >
              <CartesianGrid vertical={false} />
              <XAxis
                dataKey="month"
                tickLine={false}
                axisLine={false}
                tickMargin={8}
              />
              <ChartTooltip cursor={false} content={<ChartTooltipContent />} />
              <Line
                dataKey="revenue"
                type="monotone"
                stroke="var(--color-revenue)"
                strokeWidth={2}
                dot={false}
              />
              <Line
                dataKey="expenses"
                type="monotone"
                stroke="var(--color-expenses)"
                strokeWidth={2}
                dot={false}
              />
            </LineChart>
          </ChartContainer>
        </CardContent>
      </Card>
    )
  },
}

export const AreaChartExample: Story = {
  args: {},
  render: () => {
    const areaData = [
      { month: 'Jan', visitors: 2400, pageViews: 4800 },
      { month: 'Feb', visitors: 1398, pageViews: 3210 },
      { month: 'Mar', visitors: 9800, pageViews: 15600 },
      { month: 'Apr', visitors: 3908, pageViews: 7250 },
      { month: 'May', visitors: 4800, pageViews: 8900 },
      { month: 'Jun', visitors: 3800, pageViews: 6800 },
    ]

    const areaConfig = {
      visitors: {
        label: 'Visitors',
        color: 'hsl(var(--chart-1))',
      },
      pageViews: {
        label: 'Page Views',
        color: 'hsl(var(--chart-2))',
      },
    }

    return (
      <Card>
        <CardHeader>
          <CardTitle>Website Analytics</CardTitle>
          <CardDescription>Visitors and page views over time</CardDescription>
        </CardHeader>
        <CardContent>
          <ChartContainer config={areaConfig}>
            <AreaChart
              accessibilityLayer
              data={areaData}
              margin={{
                left: 12,
                right: 12,
              }}
            >
              <CartesianGrid vertical={false} />
              <XAxis
                dataKey="month"
                tickLine={false}
                axisLine={false}
                tickMargin={8}
              />
              <ChartTooltip
                cursor={false}
                content={<ChartTooltipContent indicator="dot" />}
              />
              <Area
                dataKey="pageViews"
                type="natural"
                fill="var(--color-pageViews)"
                fillOpacity={0.4}
                stroke="var(--color-pageViews)"
                stackId="a"
              />
              <Area
                dataKey="visitors"
                type="natural"
                fill="var(--color-visitors)"
                fillOpacity={0.4}
                stroke="var(--color-visitors)"
                stackId="a"
              />
            </AreaChart>
          </ChartContainer>
        </CardContent>
      </Card>
    )
  },
}

export const PieChartExample: Story = {
  args: {},
  render: () => {
    const pieData = [
      { browser: 'chrome', visitors: 275, fill: 'var(--color-chrome)' },
      { browser: 'safari', visitors: 200, fill: 'var(--color-safari)' },
      { browser: 'firefox', visitors: 187, fill: 'var(--color-firefox)' },
      { browser: 'edge', visitors: 173, fill: 'var(--color-edge)' },
      { browser: 'other', visitors: 90, fill: 'var(--color-other)' },
    ]

    const pieConfig = {
      visitors: {
        label: 'Visitors',
      },
      chrome: {
        label: 'Chrome',
        color: 'hsl(var(--chart-1))',
      },
      safari: {
        label: 'Safari',
        color: 'hsl(var(--chart-2))',
      },
      firefox: {
        label: 'Firefox',
        color: 'hsl(var(--chart-3))',
      },
      edge: {
        label: 'Edge',
        color: 'hsl(var(--chart-4))',
      },
      other: {
        label: 'Other',
        color: 'hsl(var(--chart-5))',
      },
    }

    return (
      <Card className="flex flex-col">
        <CardHeader className="items-center pb-0">
          <CardTitle>Browser Usage</CardTitle>
          <CardDescription>January - June 2024</CardDescription>
        </CardHeader>
        <CardContent className="flex-1 pb-0">
          <ChartContainer
            config={pieConfig}
            className="mx-auto aspect-square max-h-[250px]"
          >
            <PieChart>
              <ChartTooltip
                cursor={false}
                content={<ChartTooltipContent hideLabel />}
              />
              <Pie
                data={pieData}
                dataKey="visitors"
                nameKey="browser"
                innerRadius={60}
                strokeWidth={5}
              >
                <Label
                  content={({ viewBox }) => {
                    if (viewBox && 'cx' in viewBox && 'cy' in viewBox) {
                      return (
                        <text
                          x={viewBox.cx}
                          y={viewBox.cy}
                          textAnchor="middle"
                          dominantBaseline="middle"
                        >
                          <tspan
                            x={viewBox.cx}
                            y={viewBox.cy}
                            className="fill-foreground text-3xl font-bold"
                          >
                            {pieData
                              .reduce((acc, curr) => acc + curr.visitors, 0)
                              .toLocaleString()}
                          </tspan>
                          <tspan
                            x={viewBox.cx}
                            y={(viewBox.cy || 0) + 24}
                            className="fill-muted-foreground"
                          >
                            Visitors
                          </tspan>
                        </text>
                      )
                    }
                  }}
                />
              </Pie>
            </PieChart>
          </ChartContainer>
        </CardContent>
      </Card>
    )
  },
}

export const RadialChart: Story = {
  args: {},
  render: () => {
    const radialData = [
      { name: 'Desktop', value: 1260, fill: 'var(--color-desktop)' },
      { name: 'Mobile', value: 570, fill: 'var(--color-mobile)' },
      { name: 'Tablet', value: 190, fill: 'var(--color-tablet)' },
    ]

    const radialConfig = {
      desktop: {
        label: 'Desktop',
        color: 'hsl(var(--chart-1))',
      },
      mobile: {
        label: 'Mobile',
        color: 'hsl(var(--chart-2))',
      },
      tablet: {
        label: 'Tablet',
        color: 'hsl(var(--chart-3))',
      },
    }

    return (
      <Card className="max-w-xs">
        <CardHeader>
          <CardTitle>Device Usage</CardTitle>
          <CardDescription>Distribution of device types</CardDescription>
        </CardHeader>
        <CardContent>
          <ChartContainer
            config={radialConfig}
            className="mx-auto aspect-square max-h-[250px]"
          >
            <RadialBarChart
              data={radialData}
              innerRadius={30}
              outerRadius={110}
            >
              <ChartTooltip
                cursor={false}
                content={<ChartTooltipContent hideLabel nameKey="name" />}
              />
              <RadialBar
                dataKey="value"
                cornerRadius={10}
                fill="var(--color-desktop)"
              />
            </RadialBarChart>
          </ChartContainer>
        </CardContent>
      </Card>
    )
  },
}

export const DashboardMetrics: Story = {
  args: {},
  render: () => {
    const salesData = [
      { date: '2024-01', sales: 12400, profit: 3200, customers: 891 },
      { date: '2024-02', sales: 11200, profit: 2800, customers: 756 },
      { date: '2024-03', sales: 15800, profit: 4100, customers: 1205 },
      { date: '2024-04', sales: 13600, profit: 3400, customers: 967 },
      { date: '2024-05', sales: 16900, profit: 4500, customers: 1342 },
      { date: '2024-06', sales: 18200, profit: 4800, customers: 1489 },
    ]

    const salesConfig = {
      sales: {
        label: 'Sales',
        color: 'hsl(var(--chart-1))',
      },
      profit: {
        label: 'Profit',
        color: 'hsl(var(--chart-2))',
      },
    }

    const trafficData = [
      { source: 'Organic', visitors: 3420, percentage: 42 },
      { source: 'Direct', visitors: 2180, percentage: 27 },
      { source: 'Social', visitors: 1240, percentage: 15 },
      { source: 'Referral', visitors: 890, percentage: 11 },
      { source: 'Email', visitors: 410, percentage: 5 },
    ]

    const conversionData = [
      { step: 'Visitors', count: 10000, rate: 100 },
      { step: 'Leads', count: 2500, rate: 25 },
      { step: 'Qualified', count: 750, rate: 7.5 },
      { step: 'Customers', count: 150, rate: 1.5 },
    ]

    const metrics = [
      {
        title: 'Total Revenue',
        value: '$45,231.89',
        change: '+20.1%',
        trend: 'up',
        icon: DollarSign,
        description: 'vs last month',
      },
      {
        title: 'Active Users',
        value: '2,350',
        change: '+180.1%',
        trend: 'up',
        icon: Users,
        description: 'vs last month',
      },
      {
        title: 'Sales',
        value: '+12,234',
        change: '+19%',
        trend: 'up',
        icon: ShoppingCart,
        description: 'vs last month',
      },
      {
        title: 'Bounce Rate',
        value: '73%',
        change: '-2.4%',
        trend: 'down',
        icon: Activity,
        description: 'vs last month',
      },
    ]

    return (
      <div className="w-full max-w-6xl space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-heading-2 font-bold">Analytics Dashboard</h2>
            <p className="text-muted-foreground">
              Track your business performance
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm">
              <Filter className="mr-2 h-4 w-4" />
              Filter
            </Button>
            <Button variant="outline" size="sm">
              <RefreshCw className="mr-2 h-4 w-4" />
              Refresh
            </Button>
          </div>
        </div>

        {/* Key Metrics */}
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-4">
          {metrics.map((metric, index) => {
            const Icon = metric.icon
            return (
              <Card key={index}>
                <CardContent className="p-4">
                  <div className="flex items-center justify-between space-y-0 pb-2">
                    <p className="text-sm font-medium">{metric.title}</p>
                    <Icon className="text-muted-foreground h-4 w-4" />
                  </div>
                  <div className="space-y-1">
                    <p className="text-2xl font-bold">{metric.value}</p>
                    <div className="flex items-center text-xs">
                      {metric.trend === 'up' ? (
                        <TrendingUp className="text-success mr-1 h-3 w-3" />
                      ) : (
                        <TrendingDown className="text-success mr-1 h-3 w-3" />
                      )}
                      <span className="text-success font-medium">
                        {metric.change}
                      </span>
                      <span className="text-muted-foreground ml-1">
                        {metric.description}
                      </span>
                    </div>
                  </div>
                </CardContent>
              </Card>
            )
          })}
        </div>

        {/* Charts Grid */}
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          {/* Sales Chart */}
          <Card>
            <CardHeader>
              <CardTitle>Sales & Profit</CardTitle>
              <CardDescription>Monthly performance overview</CardDescription>
            </CardHeader>
            <CardContent>
              <ChartContainer config={salesConfig}>
                <BarChart accessibilityLayer data={salesData}>
                  <CartesianGrid vertical={false} />
                  <XAxis
                    dataKey="date"
                    tickLine={false}
                    tickMargin={10}
                    axisLine={false}
                    tickFormatter={(value) => value.slice(5)}
                  />
                  <ChartTooltip
                    cursor={false}
                    content={<ChartTooltipContent indicator="dashed" />}
                  />
                  <Bar dataKey="sales" fill="var(--color-sales)" radius={4} />
                  <Bar dataKey="profit" fill="var(--color-profit)" radius={4} />
                </BarChart>
              </ChartContainer>
            </CardContent>
          </Card>

          {/* Traffic Sources */}
          <Card>
            <CardHeader>
              <CardTitle>Traffic Sources</CardTitle>
              <CardDescription>Where your visitors come from</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {trafficData.map((source, index) => (
                  <div
                    key={index}
                    className="flex items-center justify-between"
                  >
                    <div className="flex items-center gap-3">
                      <div
                        className="h-3 w-3 rounded-full"
                        style={{
                          backgroundColor: `hsl(var(--chart-${index + 1}))`,
                        }}
                      />
                      <span className="text-sm font-medium">
                        {source.source}
                      </span>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className="text-muted-foreground text-sm">
                        {source.visitors.toLocaleString()}
                      </span>
                      <Badge variant="secondary">{source.percentage}%</Badge>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Conversion Funnel */}
        <Card>
          <CardHeader>
            <CardTitle>Conversion Funnel</CardTitle>
            <CardDescription>
              Customer journey from visitor to purchase
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 gap-4 md:grid-cols-4">
              {conversionData.map((step, index) => (
                <div key={index} className="text-center">
                  <div
                    className="mx-auto mb-2 rounded-lg p-4"
                    style={{
                      backgroundColor: `hsl(var(--chart-${index + 1}) / 0.1)`,
                      width: `${Math.max(60, step.rate * 2)}%`,
                    }}
                  >
                    <div
                      className="h-2 rounded-full"
                      style={{
                        backgroundColor: `hsl(var(--chart-${index + 1}))`,
                      }}
                    />
                  </div>
                  <h4 className="font-semibold">{step.step}</h4>
                  <p className="text-2xl font-bold">
                    {step.count.toLocaleString()}
                  </p>
                  <p className="text-muted-foreground text-sm">{step.rate}%</p>
                </div>
              ))}
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

export const RealtimeAnalytics: Story = {
  args: {},
  render: () => {
    const [isLive, setIsLive] = useState(true)

    // Simulated real-time data
    const realtimeData = [
      { time: '14:00', users: 45, pageViews: 125, sales: 8 },
      { time: '14:05', users: 52, pageViews: 143, sales: 12 },
      { time: '14:10', users: 48, pageViews: 136, sales: 9 },
      { time: '14:15', users: 61, pageViews: 167, sales: 15 },
      { time: '14:20', users: 58, pageViews: 154, sales: 11 },
      { time: '14:25', users: 67, pageViews: 189, sales: 18 },
    ]

    const realtimeConfig = {
      users: {
        label: 'Active Users',
        color: 'hsl(var(--chart-1))',
      },
      pageViews: {
        label: 'Page Views',
        color: 'hsl(var(--chart-2))',
      },
      sales: {
        label: 'Sales',
        color: 'hsl(var(--chart-3))',
      },
    }

    const currentMetrics = [
      { label: 'Active Users', value: '1,234', icon: Users, color: 'chart-1' },
      { label: 'Page Views', value: '5,678', icon: Eye, color: 'chart-2' },
      { label: 'Avg. Session', value: '3:42', icon: Clock, color: 'chart-3' },
      {
        label: 'Bounce Rate',
        value: '68%',
        icon: MousePointer,
        color: 'chart-4',
      },
    ]

    return (
      <div className="w-full max-w-4xl space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-heading-2 font-bold">Real-time Analytics</h2>
              <div className="flex items-center gap-2">
                <div
                  className={`h-2 w-2 rounded-full ${isLive ? 'bg-success animate-pulse' : 'bg-muted'}`}
                />
                <Badge variant={isLive ? 'default' : 'secondary'}>
                  {isLive ? 'Live' : 'Paused'}
                </Badge>
              </div>
            </div>
            <p className="text-muted-foreground">
              Monitor your site activity in real-time
            </p>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setIsLive(!isLive)}
          >
            {isLive ? 'Pause' : 'Resume'}
          </Button>
        </div>

        {/* Current Metrics */}
        <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
          {currentMetrics.map((metric, index) => {
            const Icon = metric.icon
            return (
              <Card key={index}>
                <CardContent className="p-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-muted-foreground text-xs">
                        {metric.label}
                      </p>
                      <p className="text-2xl font-bold">{metric.value}</p>
                    </div>
                    <div
                      className="rounded-lg p-2"
                      style={{
                        backgroundColor: `hsl(var(--${metric.color}) / 0.1)`,
                      }}
                    >
                      <Icon
                        className="h-4 w-4"
                        style={{ color: `hsl(var(--${metric.color}))` }}
                      />
                    </div>
                  </div>
                </CardContent>
              </Card>
            )
          })}
        </div>

        {/* Real-time Chart */}
        <Card>
          <CardHeader>
            <CardTitle>Activity Timeline</CardTitle>
            <CardDescription>Last 30 minutes of activity</CardDescription>
          </CardHeader>
          <CardContent>
            <ChartContainer config={realtimeConfig}>
              <LineChart
                accessibilityLayer
                data={realtimeData}
                margin={{
                  left: 12,
                  right: 12,
                }}
              >
                <CartesianGrid vertical={false} />
                <XAxis
                  dataKey="time"
                  tickLine={false}
                  axisLine={false}
                  tickMargin={8}
                />
                <ChartTooltip
                  cursor={false}
                  content={<ChartTooltipContent />}
                />
                <Line
                  dataKey="users"
                  type="monotone"
                  stroke="var(--color-users)"
                  strokeWidth={2}
                  dot={{ fill: 'var(--color-users)' }}
                />
                <Line
                  dataKey="pageViews"
                  type="monotone"
                  stroke="var(--color-pageViews)"
                  strokeWidth={2}
                  dot={{ fill: 'var(--color-pageViews)' }}
                />
                <Line
                  dataKey="sales"
                  type="monotone"
                  stroke="var(--color-sales)"
                  strokeWidth={2}
                  dot={{ fill: 'var(--color-sales)' }}
                />
              </LineChart>
            </ChartContainer>
          </CardContent>
        </Card>

        {/* Device Breakdown */}
        <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle>Device Breakdown</CardTitle>
              <CardDescription>Current active users by device</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {[
                  {
                    device: 'Desktop',
                    count: 567,
                    icon: Monitor,
                    percentage: 46,
                  },
                  {
                    device: 'Mobile',
                    count: 456,
                    icon: Smartphone,
                    percentage: 37,
                  },
                  {
                    device: 'Tablet',
                    count: 211,
                    icon: Tablet,
                    percentage: 17,
                  },
                ].map((item, index) => {
                  const Icon = item.icon
                  return (
                    <div
                      key={index}
                      className="flex items-center justify-between"
                    >
                      <div className="flex items-center gap-3">
                        <Icon className="text-muted-foreground h-4 w-4" />
                        <span className="font-medium">{item.device}</span>
                      </div>
                      <div className="flex items-center gap-3">
                        <span className="text-muted-foreground text-sm">
                          {item.count}
                        </span>
                        <div className="bg-muted h-2 w-20 rounded-full">
                          <div
                            className="bg-primary h-2 rounded-full"
                            style={{ width: `${item.percentage}%` }}
                          />
                        </div>
                        <span className="text-muted-foreground w-8 text-xs">
                          {item.percentage}%
                        </span>
                      </div>
                    </div>
                  )
                })}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Top Pages</CardTitle>
              <CardDescription>Most visited pages right now</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {[
                  { page: '/dashboard', views: 234, percentage: 28 },
                  { page: '/products', views: 189, percentage: 23 },
                  { page: '/analytics', views: 156, percentage: 19 },
                  { page: '/settings', views: 98, percentage: 12 },
                  { page: '/profile', views: 87, percentage: 10 },
                ].map((item, index) => (
                  <div
                    key={index}
                    className="flex items-center justify-between"
                  >
                    <div className="flex-1">
                      <p className="text-sm font-medium">{item.page}</p>
                      <div className="bg-muted mt-1 h-1 w-full rounded-full">
                        <div
                          className="bg-primary h-1 rounded-full"
                          style={{ width: `${item.percentage}%` }}
                        />
                      </div>
                    </div>
                    <div className="ml-4 text-right">
                      <p className="text-sm font-medium">{item.views}</p>
                      <p className="text-muted-foreground text-xs">
                        {item.percentage}%
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    )
  },
  parameters: {
    layout: 'padded',
  },
}

export const CoreLiveThemeShowcase: Story = {
  args: {},
  render: () => (
    <div className="w-full max-w-4xl space-y-8">
      <div>
        <h3 className="text-heading-3 mb-4 font-medium">Chart Types</h3>
        <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle className="text-sm">Bar Chart</CardTitle>
            </CardHeader>
            <CardContent>
              <ChartContainer config={chartConfig} className="h-[200px]">
                <BarChart accessibilityLayer data={chartData.slice(0, 4)}>
                  <CartesianGrid vertical={false} />
                  <XAxis
                    dataKey="month"
                    tickLine={false}
                    tickMargin={10}
                    axisLine={false}
                    tickFormatter={(value) => value.slice(0, 3)}
                  />
                  <ChartTooltip
                    cursor={false}
                    content={<ChartTooltipContent indicator="dashed" />}
                  />
                  <Bar
                    dataKey="desktop"
                    fill="var(--color-desktop)"
                    radius={4}
                  />
                </BarChart>
              </ChartContainer>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-sm">Line Chart</CardTitle>
            </CardHeader>
            <CardContent>
              <ChartContainer config={chartConfig} className="h-[200px]">
                <LineChart
                  accessibilityLayer
                  data={chartData.slice(0, 4)}
                  margin={{ left: 12, right: 12 }}
                >
                  <CartesianGrid vertical={false} />
                  <XAxis
                    dataKey="month"
                    tickLine={false}
                    axisLine={false}
                    tickMargin={8}
                    tickFormatter={(value) => value.slice(0, 3)}
                  />
                  <ChartTooltip
                    cursor={false}
                    content={<ChartTooltipContent />}
                  />
                  <Line
                    dataKey="desktop"
                    type="monotone"
                    stroke="var(--color-desktop)"
                    strokeWidth={2}
                    dot={false}
                  />
                </LineChart>
              </ChartContainer>
            </CardContent>
          </Card>
        </div>
      </div>

      <div>
        <h3 className="text-heading-3 mb-4 font-medium">Color Schemes</h3>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
          <Card className="border-primary/20">
            <CardHeader>
              <CardTitle className="text-primary text-sm">
                Primary Theme
              </CardTitle>
            </CardHeader>
            <CardContent>
              <ChartContainer
                config={{
                  data: { label: 'Data', color: 'hsl(var(--primary))' },
                }}
                className="h-[120px]"
              >
                <BarChart
                  data={[
                    { name: 'A', value: 40 },
                    { name: 'B', value: 70 },
                    { name: 'C', value: 55 },
                  ]}
                >
                  <Bar dataKey="value" fill="var(--color-data)" radius={2} />
                </BarChart>
              </ChartContainer>
            </CardContent>
          </Card>

          <Card className="border-secondary/20">
            <CardHeader>
              <CardTitle className="text-secondary text-sm">
                Secondary Theme
              </CardTitle>
            </CardHeader>
            <CardContent>
              <ChartContainer
                config={{
                  data: { label: 'Data', color: 'hsl(var(--secondary))' },
                }}
                className="h-[120px]"
              >
                <BarChart
                  data={[
                    { name: 'A', value: 60 },
                    { name: 'B', value: 45 },
                    { name: 'C', value: 80 },
                  ]}
                >
                  <Bar dataKey="value" fill="var(--color-data)" radius={2} />
                </BarChart>
              </ChartContainer>
            </CardContent>
          </Card>

          <Card className="border-accent/20">
            <CardHeader>
              <CardTitle className="text-accent text-sm">
                Accent Theme
              </CardTitle>
            </CardHeader>
            <CardContent>
              <ChartContainer
                config={{
                  data: { label: 'Data', color: 'hsl(var(--accent))' },
                }}
                className="h-[120px]"
              >
                <BarChart
                  data={[
                    { name: 'A', value: 35 },
                    { name: 'B', value: 90 },
                    { name: 'C', value: 65 },
                  ]}
                >
                  <Bar dataKey="value" fill="var(--color-data)" radius={2} />
                </BarChart>
              </ChartContainer>
            </CardContent>
          </Card>
        </div>
      </div>

      <div>
        <h3 className="text-heading-3 mb-4 font-medium">Semantic Colors</h3>
        <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
          <Card className="border-success/20">
            <CardHeader>
              <CardTitle className="text-success text-sm">
                Success Metrics
              </CardTitle>
            </CardHeader>
            <CardContent>
              <ChartContainer
                config={{
                  growth: { label: 'Growth', color: 'hsl(var(--success))' },
                }}
                className="h-[150px]"
              >
                <AreaChart
                  data={[
                    { month: 'Jan', growth: 20 },
                    { month: 'Feb', growth: 35 },
                    { month: 'Mar', growth: 45 },
                    { month: 'Apr', growth: 60 },
                    { month: 'May', growth: 70 },
                  ]}
                >
                  <Area
                    dataKey="growth"
                    type="monotone"
                    fill="var(--color-growth)"
                    fillOpacity={0.3}
                    stroke="var(--color-growth)"
                  />
                </AreaChart>
              </ChartContainer>
            </CardContent>
          </Card>

          <Card className="border-danger/20">
            <CardHeader>
              <CardTitle className="text-danger text-sm">
                Error Tracking
              </CardTitle>
            </CardHeader>
            <CardContent>
              <ChartContainer
                config={{
                  errors: { label: 'Errors', color: 'hsl(var(--danger))' },
                }}
                className="h-[150px]"
              >
                <LineChart
                  data={[
                    { day: 'Mon', errors: 12 },
                    { day: 'Tue', errors: 8 },
                    { day: 'Wed', errors: 15 },
                    { day: 'Thu', errors: 5 },
                    { day: 'Fri', errors: 3 },
                  ]}
                >
                  <Line
                    dataKey="errors"
                    type="monotone"
                    stroke="var(--color-errors)"
                    strokeWidth={2}
                    dot={{ fill: 'var(--color-errors)' }}
                  />
                </LineChart>
              </ChartContainer>
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
              <div>
                <p className="mb-4 text-sm font-medium">
                  Custom chart styling with component tokens
                </p>
                <div
                  className="rounded-lg border p-4"
                  style={{
                    backgroundColor: 'var(--component-chart-background)',
                    borderColor: 'var(--component-chart-border)',
                  }}
                >
                  <ChartContainer
                    config={chartConfig}
                    className="h-[200px]"
                    style={
                      {
                        '--chart-grid': 'var(--component-chart-grid)',
                        '--chart-text': 'var(--component-chart-text)',
                      } as React.CSSProperties
                    }
                  >
                    <BarChart accessibilityLayer data={chartData.slice(0, 4)}>
                      <CartesianGrid vertical={false} />
                      <XAxis
                        dataKey="month"
                        tickLine={false}
                        tickMargin={10}
                        axisLine={false}
                        tickFormatter={(value) => value.slice(0, 3)}
                      />
                      <ChartTooltip
                        cursor={false}
                        content={<ChartTooltipContent indicator="dashed" />}
                      />
                      <Bar
                        dataKey="desktop"
                        fill="var(--color-desktop)"
                        radius={4}
                      />
                      <Bar
                        dataKey="mobile"
                        fill="var(--color-mobile)"
                        radius={4}
                      />
                    </BarChart>
                  </ChartContainer>
                </div>
              </div>

              <div className="bg-muted rounded-md p-3">
                <code className="text-xs">
                  --component-chart-background
                  <br />
                  --component-chart-border
                  <br />
                  --component-chart-grid
                  <br />
                  --component-chart-text
                  <br />
                  --component-chart-axis
                  <br />
                  --component-chart-tooltip-background
                  <br />
                  --component-chart-tooltip-border
                  <br />
                  --component-chart-tooltip-text
                  <br />
                  --component-chart-legend-text
                </code>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      <div>
        <h3 className="text-heading-3 mb-4 font-medium">
          Interactive Features
        </h3>
        <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle className="text-sm">With Tooltip</CardTitle>
            </CardHeader>
            <CardContent>
              <ChartContainer config={chartConfig} className="h-[200px]">
                <BarChart accessibilityLayer data={chartData.slice(0, 4)}>
                  <CartesianGrid vertical={false} />
                  <XAxis
                    dataKey="month"
                    tickLine={false}
                    tickMargin={10}
                    axisLine={false}
                    tickFormatter={(value) => value.slice(0, 3)}
                  />
                  <ChartTooltip
                    cursor={{ fill: 'rgba(0,0,0,0.1)' }}
                    content={<ChartTooltipContent indicator="dot" />}
                  />
                  <Bar
                    dataKey="desktop"
                    fill="var(--color-desktop)"
                    radius={4}
                  />
                </BarChart>
              </ChartContainer>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-sm">With Legend</CardTitle>
            </CardHeader>
            <CardContent>
              <ChartContainer config={chartConfig} className="h-[200px]">
                <BarChart accessibilityLayer data={chartData.slice(0, 4)}>
                  <CartesianGrid vertical={false} />
                  <XAxis
                    dataKey="month"
                    tickLine={false}
                    tickMargin={10}
                    axisLine={false}
                    tickFormatter={(value) => value.slice(0, 3)}
                  />
                  <ChartTooltip
                    cursor={false}
                    content={<ChartTooltipContent />}
                  />
                  <ChartLegend content={<ChartLegendContent payload={[]} />} />
                  <Bar
                    dataKey="desktop"
                    fill="var(--color-desktop)"
                    radius={4}
                  />
                  <Bar dataKey="mobile" fill="var(--color-mobile)" radius={4} />
                </BarChart>
              </ChartContainer>
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
          'Comprehensive showcase of chart variations using CoreLive Design System tokens for consistent data visualization across different contexts.',
      },
    },
  },
}
