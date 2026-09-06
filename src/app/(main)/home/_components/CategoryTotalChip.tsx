import { getColorDotClass } from '@/lib/category-colors'
import { cn } from '@/lib/utils'

/** Displays one category total consistently in weekly and Sunday summaries.
 * @param props - Category label, color, and total from the summary aggregation.
 * @returns A list item with a category dot and completion count.
 * @example <CategoryTotalChip category={category} />
 */
export function CategoryTotalChip({
  category,
}: {
  category: { name: string; color: string; count: number }
}) {
  return (
    <li className="inline-flex items-center gap-1.5 rounded-full border border-border bg-card px-2.5 py-1 text-xs">
      <span
        aria-hidden
        className={cn(
          'inline-block size-1.5 rounded-full',
          getColorDotClass(category.color),
        )}
      />

      <span className="text-foreground">{category.name}</span>
      <span className="font-mono tabular-nums text-muted-foreground">
        {category.count}
      </span>
    </li>
  )
}
