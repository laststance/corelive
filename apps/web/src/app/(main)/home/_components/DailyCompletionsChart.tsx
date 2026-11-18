'use client'

import { useId, type FormEvent } from 'react'
import { Bar, BarChart, CartesianGrid, XAxis, YAxis } from 'recharts'

import { Button } from '@/components/ui/button'
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from '@/components/ui/chart'

import { formatActivityDate, type ActivityDay } from './recentActivity'

const CHART_CONFIG = {
  count: { label: 'Completed' },
} satisfies ChartConfig

/**
 * Plots one bar per local day. The paired native select exposes the same
 * dates and counts and opens the same detail dialog from the keyboard.
 * @example
 * <DailyCompletionsChart days={activity.days} onOpenDay={openDay} />
 */
export function DailyCompletionsChart({
  days,
  onOpenDay,
}: {
  days: ActivityDay[]
  onOpenDay: (date: string) => void
}) {
  const selectId = useId()

  const handleDaySubmit = (event: FormEvent<HTMLFormElement>): void => {
    event.preventDefault()
    const day = new FormData(event.currentTarget).get('day')
    if (typeof day === 'string') onOpenDay(day)
  }

  return (
    <figure className="min-w-0 space-y-3">
      <figcaption className="text-sm font-medium">Daily completions</figcaption>
      <ChartContainer
        config={CHART_CONFIG}
        className="h-40 w-full rounded-sm focus-within:outline-2 focus-within:outline-ring"
        data-testid="daily-completions-chart"
      >
        <BarChart
          accessibilityLayer
          aria-label="Daily completion counts"
          data={days}
          margin={{ top: 4, right: 8, bottom: 0, left: 0 }}
        >
          <CartesianGrid vertical={false} />
          <XAxis
            dataKey="date"
            tickFormatter={(date: string) => formatActivityDate(date, 'short')}
            minTickGap={22}
            interval="preserveStartEnd"
            axisLine={false}
            tickLine={false}
            tickMargin={8}
          />
          <YAxis
            allowDecimals={false}
            width="auto"
            tickCount={4}
            axisLine={false}
            tickLine={false}
          />
          <ChartTooltip
            isAnimationActive={false}
            content={
              <ChartTooltipContent
                labelFormatter={(date) =>
                  typeof date === 'string'
                    ? formatActivityDate(date, 'full')
                    : null
                }
                formatter={(value) =>
                  value === 0 ? 'Rest day' : `${value} completed`
                }
                hideIndicator
              />
            }
          />
          <Bar
            dataKey="count"
            className="cursor-pointer"
            fill="var(--muted-foreground)"
            radius={[3, 3, 0, 0]}
            maxBarSize={32}
            onClick={({ originalDataIndex }) => {
              const day = days[originalDataIndex]
              if (day) onOpenDay(day.date)
            }}
            isAnimationActive={false}
          />
        </BarChart>
      </ChartContainer>
      <form
        onSubmit={handleDaySubmit}
        className="flex flex-wrap items-center gap-2"
      >
        <label htmlFor={selectId} className="sr-only">
          Day to view
        </label>
        <select
          id={selectId}
          name="day"
          className="min-h-9 max-w-full cursor-pointer rounded-md border bg-card px-2 text-sm focus-visible:outline-2 focus-visible:outline-ring"
        >
          {days.toReversed().map(({ date, count }) => (
            <option key={date} value={date}>
              {formatActivityDate(date, 'full')} ·{' '}
              {count === 0 ? 'Rest day' : `${count} completed`}
            </option>
          ))}
        </select>
        <Button size="sm" variant="outline" type="submit" className="min-h-9">
          View day
        </Button>
      </form>
    </figure>
  )
}
