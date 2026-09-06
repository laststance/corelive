import { ArrowLeft } from 'lucide-react'
import type { DateRange } from 'react-day-picker'

import { Button } from '@/components/ui/button'
import { Calendar } from '@/components/ui/calendar'

const EMPTY_CUSTOM_DATE_RANGE = { from: undefined } satisfies DateRange

/** Edits a complete date interval inside {@link CompletedTodosFilters} without applying partial selections.
 * @param props - Draft range, calendar bounds, and parent navigation/apply handlers.
 * @returns The controlled calendar editor and its Back, Cancel, and Apply actions.
 * @example <CompletedDateRangePicker {...props} />
 */
export function CompletedDateRangePicker({
  visible,
  dateRange,
  fallbackMonth,
  today,
  onDateRangeChange,
  onCancel,
  onApply,
}: {
  visible: boolean
  dateRange: DateRange | null
  fallbackMonth: Date
  today: Date
  onDateRangeChange: (range: DateRange | null) => void
  onCancel: () => void
  onApply: (range: DateRange) => void
}) {
  const isCustomRangeComplete =
    dateRange?.from !== undefined && dateRange.to !== undefined
  return (
    <div hidden={!visible}>
      <div className="flex items-start gap-1 px-1 pb-1">
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="size-8"
          aria-label="Back to period choices"
          onClick={() => onDateRangeChange(null)}
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
        selected={dateRange ?? undefined}
        defaultMonth={dateRange?.from ?? fallbackMonth}
        disabled={{ after: today }}
        excludeDisabled
        resetOnSelect
        onSelect={(nextDateRange) =>
          onDateRangeChange(nextDateRange ?? EMPTY_CUSTOM_DATE_RANGE)
        }
      />
      <div className="flex justify-end gap-2 px-2 pb-1">
        <Button type="button" variant="ghost" size="sm" onClick={onCancel}>
          Cancel
        </Button>
        <Button
          type="button"
          size="sm"
          disabled={!isCustomRangeComplete}
          onClick={() => {
            if (dateRange?.from === undefined || dateRange.to === undefined) {
              return
            }

            onApply(dateRange)
          }}
        >
          Apply range
        </Button>
      </div>
    </div>
  )
}
