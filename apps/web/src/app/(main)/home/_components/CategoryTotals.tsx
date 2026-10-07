import { useId, useState } from 'react'

import { getColorDotClass } from '@/lib/category-colors'
import type { RootCategoryTotal } from '@/lib/rollupCategoryTotals'
import { cn } from '@/lib/utils'

import { CategoryTotalChip } from './CategoryTotalChip'

/**
 * Presents root totals with one collapsed child breakdown per retrospective region.
 *
 * Called by weekly, Sunday, annual and day summaries after period aggregation.
 * @param categories - Root totals with matching-period direct and child counts.
 * @param label - Accessible description of the summary's period.
 * @example
 * <CategoryTotals categories={stats.topCategories} label="Top categories this week" />
 */
export function CategoryTotals({
  categories,
  label,
}: {
  categories: readonly RootCategoryTotal[]
  label: string
}) {
  const [openCategoryId, setOpenCategoryId] = useState<number | null>(null)
  const regionId = useId()
  const opened = categories.find(
    (category) => category.id === openCategoryId && category.children?.length,
  )
  return (
    <div className="space-y-2">
      <ul aria-label={label} className="flex flex-wrap items-start gap-1.5">
        {categories.map((category) => (
          <CategoryTotalChip
            key={category.id}
            category={category}
            expanded={opened?.id === category.id}
            controls={`${regionId}-${category.id}`}
            onToggle={
              category.children?.length
                ? () =>
                    setOpenCategoryId(
                      opened?.id === category.id ? null : category.id,
                    )
                : undefined
            }
          />
        ))}
      </ul>
      {categories.map((category) =>
        category.children?.length ? (
          <div
            key={category.id}
            id={`${regionId}-${category.id}`}
            hidden={opened?.id !== category.id}
            role="region"
            aria-label={`${category.name} breakdown`}
            className="border-l border-border pl-3 text-xs"
          >
            <ul className="space-y-2">
              {(category.directCount ?? 0) > 0 ? (
                <li className="flex items-center justify-between gap-3">
                  <span className="text-muted-foreground">
                    Directly in {category.name}
                  </span>
                  <span className="font-mono tabular-nums">
                    {category.directCount}
                  </span>
                </li>
              ) : null}
              {category.children.map((child) => (
                <li
                  key={child.id}
                  className="flex items-center justify-between gap-3"
                >
                  <span className="inline-flex min-w-0 items-center gap-1.5">
                    <span
                      aria-hidden
                      className={cn(
                        'size-1.5 shrink-0 rounded-full',
                        getColorDotClass(child.color),
                      )}
                    />
                    <span className="break-words">{child.name}</span>
                  </span>
                  <span className="font-mono tabular-nums">{child.count}</span>
                </li>
              ))}
            </ul>
          </div>
        ) : null,
      )}
    </div>
  )
}
