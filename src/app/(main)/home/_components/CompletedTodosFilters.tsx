'use client'

import { format, startOfDay } from 'date-fns'
import { ArrowLeft, Check, ChevronDown, RotateCcw } from 'lucide-react'
import { useState } from 'react'
import type { DateRange } from 'react-day-picker'

import { Button } from '@/components/ui/button'
import { Calendar } from '@/components/ui/calendar'
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import { getColorDotClass } from '@/lib/category-colors'
import { DECIMAL_RADIX } from '@/lib/constants/completed'
import { cn } from '@/lib/utils'
import type { CompletedPeriod } from '@/lib/utils/resolveCompletedJournalDateRange'
import type { CategoryWithCount } from '@/server/schemas/category'

export type CompletedFilterCategory = Pick<
  CategoryWithCount,
  'id' | 'name' | 'color'
>

interface CompletedTodosFiltersProps {
  categories: readonly CompletedFilterCategory[]
  period: CompletedPeriod
  categoryId: number | null
  customDateRange?: DateRange
  onPeriodChange: (period: CompletedPeriod) => void
  onCategoryChange: (categoryId: number | null) => void
  onCustomDateRangeChange: (dateRange: DateRange) => void
  onClear: () => void
}

const ALL_CATEGORIES_VALUE = 'all'
const POPOVER_COLLISION_PADDING_PX = 8
const MORE_PERIOD_OPTIONS = ['year', 'last-30-days', 'custom'] as const
const EMPTY_CUSTOM_DATE_RANGE = { from: undefined } satisfies DateRange

const PERIOD_LABELS: Record<CompletedPeriod, string> = {
  all: 'All',
  week: 'This week',
  month: 'This month',
  year: 'This year',
  'last-30-days': 'Last 30 days',
  custom: 'Custom range',
}

/**
 * Renders Pattern 1's visible period presets, secondary periods, independent category select, and contextual Clear action.
 * @param props - Controlled filter values, available categories, and change callbacks owned by CompletedTodos.
 * @returns The responsive Warm Preset Bar used above the permanent win journal.
 * @example
 * <CompletedTodosFilters categories={categories} period="all" categoryId={null} onPeriodChange={setPeriod} onCategoryChange={setCategoryId} onCustomDateRangeChange={setRange} onClear={clearFilters} />
 */
export function CompletedTodosFilters({
  categories,
  period,
  categoryId,
  customDateRange,
  onPeriodChange,
  onCategoryChange,
  onCustomDateRangeChange,
  onClear,
}: CompletedTodosFiltersProps) {
  const [isMoreOpen, setIsMoreOpen] = useState(false)
  const [draftCustomDateRange, setDraftCustomDateRange] =
    useState<DateRange | null>(null)
  const isFiltered = period !== 'all' || categoryId !== null
  const isMorePeriodSelected = MORE_PERIOD_OPTIONS.some(
    (periodOption) => periodOption === period,
  )
  const isCustomPickerVisible = draftCustomDateRange !== null
  const isCustomRangeComplete =
    draftCustomDateRange?.from !== undefined &&
    draftCustomDateRange.to !== undefined
  const morePeriodLabel =
    period === 'custom' &&
    customDateRange?.from !== undefined &&
    customDateRange.to !== undefined
      ? `${format(customDateRange.from, 'MMM d')} – ${format(customDateRange.to, 'MMM d')}`
      : isMorePeriodSelected
        ? PERIOD_LABELS[period]
        : 'More'

  return (
    <div className="flex flex-wrap items-center gap-2">
      <ToggleGroup
        type="single"
        value={period}
        variant="outline"
        size="sm"
        orientation="horizontal"
        aria-label="Filter wins by completion period"
        className="max-w-full"
        onValueChange={(nextPeriod) => {
          // Radix emits an empty value when the active item is pressed; keep one preset selected.
          switch (nextPeriod) {
            case 'all':
            case 'week':
            case 'month':
              onPeriodChange(nextPeriod)
          }
        }}
      >
        <ToggleGroupItem
          className="px-3"
          value="all"
          aria-label="Show all completed wins"
        >
          All
        </ToggleGroupItem>
        <ToggleGroupItem
          className="px-3"
          value="week"
          aria-label="Show wins completed this week"
        >
          This week
        </ToggleGroupItem>
        <ToggleGroupItem
          className="px-3"
          value="month"
          aria-label="Show wins completed this month"
        >
          This month
        </ToggleGroupItem>
      </ToggleGroup>

      <Popover
        open={isMoreOpen}
        onOpenChange={(nextIsOpen) => {
          setIsMoreOpen(nextIsOpen)
          // Every open starts at the period menu; choosing Custom enters its focused editor.
          setDraftCustomDateRange(null)
        }}
      >
        <PopoverTrigger asChild>
          <Button
            type="button"
            variant={isMorePeriodSelected ? 'secondary' : 'outline'}
            size="sm"
            className="gap-1.5"
            aria-label={`Choose another completion period, current: ${morePeriodLabel}`}
          >
            <span
              className={cn(period === 'custom' && 'font-mono tabular-nums')}
            >
              {morePeriodLabel}
            </span>
            <ChevronDown className="size-3.5" aria-hidden="true" />
          </Button>
        </PopoverTrigger>
        {/* Clamp to Radix's collision-aware space so the calendar scrolls instead of clipping. */}
        <PopoverContent
          align="start"
          collisionPadding={POPOVER_COLLISION_PADDING_PX}
          className={cn(
            'max-h-[var(--radix-popover-content-available-height)] overflow-y-auto p-2',
            isCustomPickerVisible ? 'w-auto' : 'w-60',
          )}
        >
          <div className={cn(isCustomPickerVisible && 'hidden')}>
            <p className="px-2 pb-1 pt-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">
              More periods
            </p>
            {MORE_PERIOD_OPTIONS.map((periodOption) => (
              <Button
                key={periodOption}
                type="button"
                variant="ghost"
                className="w-full justify-between px-2 font-normal"
                aria-pressed={period === periodOption}
                onClick={() => {
                  if (periodOption === 'custom') {
                    setDraftCustomDateRange(
                      customDateRange ?? EMPTY_CUSTOM_DATE_RANGE,
                    )
                    return
                  }

                  onPeriodChange(periodOption)
                  setDraftCustomDateRange(null)
                  setIsMoreOpen(false)
                }}
              >
                {PERIOD_LABELS[periodOption]}
                {period === periodOption ? (
                  <Check className="size-4 text-primary" aria-hidden="true" />
                ) : null}
              </Button>
            ))}
          </div>

          <div className={cn(!isCustomPickerVisible && 'hidden')}>
            <div className="flex items-start gap-1 px-1 pb-1">
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="size-8"
                aria-label="Back to period choices"
                onClick={() => setDraftCustomDateRange(null)}
              >
                <ArrowLeft className="size-4" aria-hidden="true" />
              </Button>
              <div className="pt-1">
                <p className="text-sm font-medium text-foreground">
                  Choose a date range
                </p>
                <p className="text-xs text-muted-foreground">
                  Pick a start and end date. Both days are included.
                </p>
              </div>
            </div>
            <Calendar
              mode="range"
              selected={draftCustomDateRange ?? undefined}
              defaultMonth={
                draftCustomDateRange?.from ??
                customDateRange?.from ??
                new Date()
              }
              disabled={{ after: startOfDay(new Date()) }}
              excludeDisabled
              resetOnSelect
              onSelect={(nextDateRange) =>
                setDraftCustomDateRange(
                  nextDateRange ?? EMPTY_CUSTOM_DATE_RANGE,
                )
              }
            />
            <div className="flex justify-end gap-2 px-2 pb-1">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => setIsMoreOpen(false)}
              >
                Cancel
              </Button>
              <Button
                type="button"
                size="sm"
                disabled={!isCustomRangeComplete}
                onClick={() => {
                  if (
                    draftCustomDateRange?.from === undefined ||
                    draftCustomDateRange.to === undefined
                  ) {
                    return
                  }

                  onCustomDateRangeChange(draftCustomDateRange)
                  onPeriodChange('custom')
                  setDraftCustomDateRange(null)
                  setIsMoreOpen(false)
                }}
              >
                Apply range
              </Button>
            </div>
          </div>
        </PopoverContent>
      </Popover>

      <Select
        value={categoryId === null ? ALL_CATEGORIES_VALUE : String(categoryId)}
        onValueChange={(nextCategory) => {
          if (nextCategory === ALL_CATEGORIES_VALUE) {
            onCategoryChange(null)
            return
          }

          const nextCategoryId = Number.parseInt(nextCategory, DECIMAL_RADIX)
          // Accept only IDs from the authenticated user's current category list.
          if (categories.some((category) => category.id === nextCategoryId)) {
            onCategoryChange(nextCategoryId)
          }
        }}
      >
        <SelectTrigger
          size="sm"
          className="min-w-40"
          aria-label="Filter wins by category"
        >
          <SelectValue />
        </SelectTrigger>
        <SelectContent align="start">
          <SelectItem value={ALL_CATEGORIES_VALUE}>All categories</SelectItem>
          {categories.map((category) => (
            <SelectItem key={category.id} value={String(category.id)}>
              <span
                aria-hidden="true"
                className={`size-2.5 rounded-full ${getColorDotClass(category.color)}`}
              />
              {category.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      {isFiltered ? (
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="gap-1.5 text-muted-foreground"
          onClick={onClear}
        >
          <RotateCcw className="size-3.5" aria-hidden="true" />
          Clear
        </Button>
      ) : null}
    </div>
  )
}
