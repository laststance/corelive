import { ChevronDown } from 'lucide-react'

import { getColorDotClass } from '@/lib/category-colors'
import { cn } from '@/lib/utils'

/** Displays one category total consistently in weekly and Sunday summaries.
 * @param props - Category label, color, and total from the summary aggregation.
 * @returns A list item with a category dot and completion count.
 * @example <CategoryTotalChip category={category} />
 */
export function CategoryTotalChip({
  category,
  periodTotal,
  expanded = false,
  controls,
  onToggle,
}: {
  category: { name: string; color: string; count: number }
  periodTotal?: number
  expanded?: boolean
  controls?: string
  onToggle?: () => void
}) {
  const content = (
    <>
      <span
        aria-hidden
        className={cn(
          'inline-block size-1.5 shrink-0 rounded-full',
          getColorDotClass(category.color),
        )}
      />
      <span className="wrap-anywhere min-w-0 text-foreground">
        {category.name}
      </span>
      <span
        className={cn(
          'font-mono tabular-nums text-muted-foreground',
          periodTotal && 'ml-auto',
        )}
      >
        {category.count}
      </span>
      {onToggle ? (
        <ChevronDown
          aria-hidden
          className={cn('size-3.5 shrink-0', expanded && 'rotate-180')}
        />
      ) : null}
    </>
  )
  const chipClass = periodTotal
    ? 'flex w-full items-center gap-2 text-left text-sm'
    : 'inline-flex max-w-full items-center gap-1.5 rounded-full border border-border bg-card px-2.5 py-1 text-xs'
  return (
    <li className="min-w-0 max-w-full">
      {onToggle ? (
        <button
          type="button"
          className={cn(
            chipClass,
            'min-h-11 cursor-pointer hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
          )}
          aria-expanded={expanded}
          aria-controls={controls}
          aria-label={`${category.name}: ${category.count} ${category.count === 1 ? 'entry' : 'entries'}, ${expanded ? 'hide' : 'show'} breakdown`}
          onClick={onToggle}
        >
          {content}
        </button>
      ) : (
        <span className={chipClass}>{content}</span>
      )}
      {periodTotal ? (
        <div
          aria-hidden="true"
          className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-muted"
        >
          <div
            className={cn(
              'h-full rounded-full',
              getColorDotClass(category.color),
            )}
            style={{ width: `${(category.count / periodTotal) * 100}%` }}
          />
        </div>
      ) : null}
    </li>
  )
}
