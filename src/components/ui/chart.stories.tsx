import type { Meta, StoryObj } from '@storybook/react'
import * as React from 'react'
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  ResponsiveContainer,
} from 'recharts'

import {
  ChartContainer,
  ChartLegend,
  ChartTooltip,
  ChartTooltipContent,
} from './chart'

const meta: Meta<typeof ChartContainer> = {
  title: 'UI/Chart',
  component: ChartContainer,
  parameters: { layout: 'centered' },
}
export default meta

type Story = StoryObj<typeof ChartContainer>

const data = [
  { month: 'Jan', desktop: 186 },
  { month: 'Feb', desktop: 305 },
  { month: 'Mar', desktop: 237 },
  { month: 'Apr', desktop: 73 },
  { month: 'May', desktop: 209 },
  { month: 'Jun', desktop: 214 },
]

export const LineExample: Story = {
  render: () => (
    <div className="w-[520px]">
      <ChartContainer
        config={{ desktop: { label: 'Desktop', color: 'hsl(var(--chart-1))' } }}
      >
        <ResponsiveContainer width="100%" height={240}>
          <LineChart data={data} margin={{ left: 12, right: 12 }}>
            <CartesianGrid vertical={false} />
            <XAxis dataKey="month" tickLine={false} axisLine={false} />
            <YAxis tickLine={false} axisLine={false} width={30} />
            <Line
              type="monotone"
              dataKey="desktop"
              stroke="var(--color-desktop)"
              strokeWidth={2}
              dot={false}
            />
            <ChartTooltip content={<ChartTooltipContent />} />
            <ChartLegend />
          </LineChart>
        </ResponsiveContainer>
      </ChartContainer>
    </div>
  ),
}
