'use client'

import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Plus, Settings } from 'lucide-react'
import { useEffect, useState } from 'react'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover'
import { ScrollArea } from '@/components/ui/scroll-area'
import { useCategoryMutations } from '@/hooks/useCategoryMutations'
import { useSelectedCategory } from '@/hooks/useSelectedCategory'
import { subscribeToCategorySync } from '@/lib/category-sync-channel'
import { orpc } from '@/lib/orpc/client-query'
import {
  CATEGORY_COLORS,
  type CategoryColor,
  type CategoryWithCount,
} from '@/server/schemas/category'

/** Tailwind background color classes mapped to category color names */
const COLOR_DOT_CLASSES: Record<string, string> = {
  blue: 'bg-blue-500',
  green: 'bg-green-500',
  amber: 'bg-amber-500',
  rose: 'bg-rose-500',
  violet: 'bg-violet-500',
  orange: 'bg-orange-500',
}

/**
 * Returns the Tailwind bg class for a category color.
 * @param color - Category color name
 * @returns Tailwind bg-* class string
 */
const getColorDotClass = (color: string): string =>
  COLOR_DOT_CLASSES[color] ?? 'bg-muted-foreground'

/**
 * Linear-style sidebar for filtering todos by category.
 * Displays "All" + user categories with color dots and pending todo counts.
 * Includes an "Add Category" popover and a "Manage" button that opens the management dialog.
 *
 * @param onOpenManage - Callback to open the category management dialog
 *
 * @example
 * <CategorySidebar onOpenManage={() => setManageOpen(true)} />
 */
export function CategorySidebar({
  onOpenManage,
}: {
  onOpenManage: () => void
}) {
  const queryClient = useQueryClient()
  const [selectedCategoryId, setSelectedCategoryId] = useSelectedCategory()
  const { createMutation } = useCategoryMutations()

  // Add Category popover state
  const [addOpen, setAddOpen] = useState(false)
  const [newName, setNewName] = useState('')
  const [newColor, setNewColor] = useState<CategoryColor>('blue')

  // Fetch categories with todo counts
  const { data } = useQuery(orpc.category.list.queryOptions({}))
  const categories: CategoryWithCount[] = data?.categories ?? []

  // Compute total pending count across all categories + uncategorized
  const totalPendingCount = categories.reduce(
    (sum, cat) => sum + cat._count.todos,
    0,
  )

  // Cross-tab sync for categories
  useEffect(() => {
    return subscribeToCategorySync(() => {
      queryClient.invalidateQueries({
        queryKey: orpc.category.list.key(),
      })
    })
  }, [queryClient])

  /**
   * Handles creating a new category from the popover form.
   */
  const handleCreateCategory = () => {
    const trimmedName = newName.trim()
    if (!trimmedName) return

    createMutation.mutate(
      { name: trimmedName, color: newColor },
      {
        onSuccess: () => {
          setNewName('')
          setNewColor('blue')
          setAddOpen(false)
        },
      },
    )
  }

  return (
    <div className="flex h-full flex-col">
      <ScrollArea className="flex-1">
        <nav className="space-y-1 p-2">
          {/* "All" item */}
          <button
            type="button"
            onClick={() => setSelectedCategoryId(null)}
            className={`flex w-full items-center justify-between rounded-md px-3 py-2 text-sm transition-colors ${
              selectedCategoryId === null
                ? 'bg-accent font-medium text-accent-foreground'
                : 'hover:bg-accent/50 text-muted-foreground'
            }`}
          >
            <span className="flex items-center gap-2">
              <span className="h-2 w-2 rounded-full bg-foreground" />
              All
            </span>
            {/* eslint-disable-next-line dslint/token-only -- tabular-nums is standard Tailwind utility */}
            <span className="text-xs tabular-nums">{totalPendingCount}</span>
          </button>

          {/* Category items */}
          {categories.map((category) => (
            <button
              key={category.id}
              type="button"
              onClick={() => setSelectedCategoryId(category.id)}
              className={`flex w-full items-center justify-between rounded-md px-3 py-2 text-sm transition-colors ${
                selectedCategoryId === category.id
                  ? 'bg-accent font-medium text-accent-foreground'
                  : 'hover:bg-accent/50 text-muted-foreground'
              }`}
            >
              <span className="flex items-center gap-2">
                <span
                  className={`h-2 w-2 rounded-full ${getColorDotClass(category.color)}`}
                />
                <span className="truncate">{category.name}</span>
              </span>
              {/* eslint-disable-next-line dslint/token-only -- tabular-nums is standard Tailwind utility */}
              <span className="text-xs tabular-nums">
                {category._count.todos}
              </span>
            </button>
          ))}
        </nav>
      </ScrollArea>

      {/* Bottom actions */}
      <div className="border-t p-2">
        <div className="flex items-center gap-1">
          <Popover open={addOpen} onOpenChange={setAddOpen}>
            <PopoverTrigger asChild>
              <Button
                variant="ghost"
                size="sm"
                className="flex-1 justify-start gap-2 text-muted-foreground"
              >
                <Plus className="h-4 w-4" />
                Add Category
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-64 p-3" side="top" align="start">
              <div className="space-y-3">
                <Input
                  placeholder="Category name"
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') handleCreateCategory()
                  }}
                  maxLength={30}
                  autoFocus
                />

                {/* Color picker */}
                <div className="flex gap-2">
                  {CATEGORY_COLORS.map((color) => (
                    <button
                      key={color}
                      type="button"
                      onClick={() => setNewColor(color)}
                      className={`h-6 w-6 rounded-full transition-transform ${getColorDotClass(color)} ${
                        newColor === color
                          ? 'scale-110 ring-2 ring-ring ring-offset-2 ring-offset-background'
                          : 'hover:scale-110'
                      }`}
                      aria-label={`Select ${color} color`}
                    />
                  ))}
                </div>

                <Button
                  size="sm"
                  className="w-full"
                  onClick={handleCreateCategory}
                  disabled={!newName.trim() || createMutation.isPending}
                >
                  {createMutation.isPending ? 'Creating...' : 'Create'}
                </Button>
              </div>
            </PopoverContent>
          </Popover>

          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8 text-muted-foreground"
            onClick={onOpenManage}
            aria-label="Manage categories"
          >
            <Settings className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </div>
  )
}
