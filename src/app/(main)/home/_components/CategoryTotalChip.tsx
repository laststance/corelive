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
  expanded = false,
  controls,
  onToggle,
}: {
  category: { name: string; color: string; count: number }
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
      <span className="break-words text-foreground">{category.name}</span>
      <span className="font-mono tabular-nums text-muted-foreground">
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
  const chipClass =
    'inline-flex max-w-full items-center gap-1.5 rounded-full border border-border bg-card px-2.5 py-1 text-xs'
  return (
    <li className="max-w-full">
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
    </li>
  )
}
