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
import {
  SidebarGroup,
  SidebarGroupAction,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuBadge,
  SidebarMenuButton,
  SidebarMenuItem,
  useSidebar,
} from '@/components/ui/sidebar'
import { useCategoryMutations } from '@/hooks/useCategoryMutations'
import { useSelectedCategory } from '@/hooks/useSelectedCategory'
import { getColorDotClass } from '@/lib/category-colors'
import { subscribeToCategorySync } from '@/lib/category-sync-channel'
import { orpc } from '@/lib/orpc/client-query'
import {
  CATEGORY_COLORS,
  type CategoryColor,
  type CategoryWithCount,
} from '@/server/schemas/category'

/**
 * Category section for the app Sidebar.
 * Displays "All" + user categories with color dots and pending todo counts.
 * Uses shadcn Sidebar primitives (SidebarMenu, SidebarMenuBadge, etc.).
 *
 * @param onOpenManage - Callback to open the category management dialog
 *
 * @example
 * <Category onOpenManage={() => setManageOpen(true)} />
 */
export function Category({ onOpenManage }: { onOpenManage: () => void }) {
  const queryClient = useQueryClient()
  const { setOpenMobile, isMobile } = useSidebar()
  const [selectedCategoryId, setSelectedCategoryId] = useSelectedCategory()
  const { createMutation } = useCategoryMutations()

  // Add Category popover state
  const [addOpen, setAddOpen] = useState(false)
  const [newName, setNewName] = useState('')
  const [newColor, setNewColor] = useState<CategoryColor>('blue')

  // Fetch categories with todo counts
  const { data } = useQuery(orpc.category.list.queryOptions({}))
  const categories: CategoryWithCount[] = data?.categories ?? []

  // Total pending = categorized + uncategorized
  const totalPendingCount =
    categories.reduce((sum, cat) => sum + cat._count.todos, 0) +
    (data?.uncategorizedCount ?? 0)

  // Cross-tab sync for categories
  useEffect(() => {
    return subscribeToCategorySync(() => {
      queryClient.invalidateQueries({
        queryKey: orpc.category.list.key(),
      })
    })
  }, [queryClient])

  /**
   * Handles selecting a category and closing mobile sidebar.
   * @param categoryId - Category ID to select, or null for "All"
   */
  const handleSelect = (categoryId: number | null) => {
    setSelectedCategoryId(categoryId)
    if (isMobile) {
      setOpenMobile(false)
    }
  }

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
    <SidebarGroup>
      <SidebarGroupLabel>Categories</SidebarGroupLabel>
      <Popover open={addOpen} onOpenChange={setAddOpen}>
        <PopoverTrigger asChild>
          <SidebarGroupAction
            className="text-sidebar-foreground/70 hover:text-sidebar-foreground"
            aria-label="Add category"
          >
            <Plus />
          </SidebarGroupAction>
        </PopoverTrigger>
        <PopoverContent className="w-64 p-3" side="bottom" align="start">
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
      <SidebarGroupContent>
        <SidebarMenu>
          {/* "All" item */}
          <SidebarMenuItem>
            <SidebarMenuButton
              isActive={selectedCategoryId === null}
              onClick={() => handleSelect(null)}
            >
              <span className="h-2 w-2 shrink-0 rounded-full bg-foreground" />
              <span>All</span>
            </SidebarMenuButton>
            {totalPendingCount > 0 && (
              <SidebarMenuBadge>{totalPendingCount}</SidebarMenuBadge>
            )}
          </SidebarMenuItem>

          {/* Category items */}
          {categories.map((category) => (
            <SidebarMenuItem key={category.id}>
              <SidebarMenuButton
                isActive={selectedCategoryId === category.id}
                onClick={() => handleSelect(category.id)}
              >
                <span
                  className={`h-2 w-2 shrink-0 rounded-full ${getColorDotClass(category.color)}`}
                />
                <span className="truncate">{category.name}</span>
              </SidebarMenuButton>
              {category._count.todos > 0 && (
                <SidebarMenuBadge>{category._count.todos}</SidebarMenuBadge>
              )}
            </SidebarMenuItem>
          ))}

          {/* Empty state CTA */}
          {categories.length === 0 && (
            <SidebarMenuItem>
              <SidebarMenuButton
                className="text-sidebar-foreground/50"
                onClick={() => setAddOpen(true)}
              >
                <Plus className="h-4 w-4" />
                <span>Add your first category</span>
              </SidebarMenuButton>
            </SidebarMenuItem>
          )}

          {/* Manage */}
          {categories.length > 0 && (
            <SidebarMenuItem>
              <SidebarMenuButton
                className="text-sidebar-foreground/70"
                onClick={onOpenManage}
              >
                <Settings className="h-4 w-4" />
                <span>Manage</span>
              </SidebarMenuButton>
            </SidebarMenuItem>
          )}
        </SidebarMenu>
      </SidebarGroupContent>
    </SidebarGroup>
  )
}
