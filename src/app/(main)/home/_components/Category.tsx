'use client'

import { useQuery } from '@tanstack/react-query'
import { Plus, Settings } from 'lucide-react'
import {
  useState,
  type ChangeEvent,
  type KeyboardEvent,
  type MouseEvent,
} from 'react'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
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
import {
  SidebarGroup,
  SidebarGroupAction,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuBadge,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarMenuSub,
  useSidebar,
} from '@/components/ui/sidebar'
import { useCategoryMutations } from '@/hooks/useCategoryMutations'
import { useCategorySync } from '@/hooks/useCategorySync'
import { useClerkQueryReady } from '@/hooks/useClerkQueryReady'
import {
  useAutoSelectDefaultCategory,
  useSelectedCategory,
} from '@/hooks/useSelectedCategory'
import { getColorDotClass } from '@/lib/category-colors'
import { createCategoryHierarchy } from '@/lib/categoryHierarchy'
import { orpc } from '@/lib/orpc/client-query'
import {
  CATEGORY_COLORS,
  type CategoryColor,
  type CategoryWithCount,
} from '@/server/schemas/category'

/**
 * Category section for the app Sidebar.
 * Displays user categories with color dots and pending todo counts.
 * Auto-selects the default (General) category when none is selected.
 * Uses shadcn Sidebar primitives (SidebarMenu, SidebarMenuBadge, etc.).
 *
 * @param onOpenManageAction - Opens the category management dialog (Next.js: `*Action` suffix for callable props)
 *
 * @example
 * <Category onOpenManageAction={() => setManageOpen(true)} />
 */
export const Category = function Category({
  onOpenManageAction,
}: {
  onOpenManageAction: () => void
}) {
  const { setOpenMobile, isMobile } = useSidebar()
  const [selectedCategoryId, setSelectedCategoryId] = useSelectedCategory()
  const { createMutation } = useCategoryMutations()
  const isClerkQueryReady = useClerkQueryReady()

  // Add Category popover state
  const [addOpen, setAddOpen] = useState(false)
  const [newName, setNewName] = useState('')
  const [newColor, setNewColor] = useState<CategoryColor>('blue')
  const [newParentId, setNewParentId] = useState<number | null>(null)

  // Fetch categories with todo counts
  const { data } = useQuery({
    ...orpc.category.list.queryOptions({}),
    enabled: isClerkQueryReady,
  })
  const categories: CategoryWithCount[] = data?.categories ?? []
  const hierarchy = createCategoryHierarchy(categories)
  const roots = hierarchy.ordered.filter(
    (category) => (category.parentId ?? null) === null,
  )

  // Temporary rows remain visible in the sidebar but cannot become creation parents.
  const confirmedRoots = roots.filter((category) => category.id > 0)
  const selectedParent = confirmedRoots.find(
    (category) => category.id === newParentId,
  )
  const isParentAvailable = newParentId === null || selectedParent !== undefined

  // Auto-select the default (General) category when none is selected
  useAutoSelectDefaultCategory(
    selectedCategoryId,
    setSelectedCategoryId,
    categories,
  )

  // Cross-tab sync for categories
  useCategorySync()

  /**
   * Handles selecting a category and closing mobile sidebar.
   * @param categoryId - Category ID to select.
   */
  const handleSelect = (categoryId: number) => {
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
    // A peer may remove or move the selected parent while this form stays open.
    if (!trimmedName || createMutation.isPending || !isParentAvailable) return

    createMutation.mutate(
      { name: trimmedName, color: newColor, parentId: newParentId },
      {
        onSuccess: () => {
          setNewName('')
          setNewColor('blue')
          setNewParentId(null)
          setAddOpen(false)
        },
      },
    )
  }

  const handleAddOpenChange = (open: boolean) => {
    setAddOpen(open)
  }

  const handleNewNameChange = (event: ChangeEvent<HTMLInputElement>) => {
    setNewName(event.target.value)
  }

  const handleNewNameKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (
      event.key === 'Enter' &&
      !event.nativeEvent.isComposing &&
      event.keyCode !== 229
    )
      handleCreateCategory()
  }

  const handleCategoryClick = (event: MouseEvent<HTMLButtonElement>) => {
    const categoryId = Number(event.currentTarget.dataset.categoryId)
    if (Number.isInteger(categoryId)) {
      handleSelect(categoryId)
    }
  }

  return (
    <SidebarGroup>
      <SidebarGroupLabel>Categories</SidebarGroupLabel>
      <Popover open={addOpen} onOpenChange={handleAddOpenChange}>
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
              aria-label="Category name"
              placeholder="Category name"
              value={newName}
              onChange={handleNewNameChange}
              onKeyDown={handleNewNameKeyDown}
              maxLength={30}
              autoFocus
            />

            <div className="space-y-1.5">
              <Label htmlFor="sidebar-category-parent">Parent category</Label>
              <Select
                value={newParentId === null ? 'none' : String(newParentId)}
                onValueChange={(value) => {
                  const parentId = value === 'none' ? null : Number(value)
                  setNewParentId(parentId)
                  const parent = categories.find(
                    (category) => category.id === parentId,
                  )
                  if (parent) setNewColor(parent.color)
                }}
              >
                <SelectTrigger
                  id="sidebar-category-parent"
                  className="min-h-11"
                >
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">None — main category</SelectItem>
                  {confirmedRoots.map((category) => (
                    <SelectItem key={category.id} value={String(category.id)}>
                      {category.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {!isParentAvailable ? (
              <p role="alert" className="text-sm text-destructive">
                Choose an available main category.
              </p>
            ) : null}

            {/* Color picker */}
            <div className="flex flex-wrap gap-1">
              {CATEGORY_COLORS.map((color) => (
                <button
                  key={color}
                  type="button"
                  onClick={() => setNewColor(color)}
                  className={`flex size-11 items-center justify-center rounded-md ${
                    newColor === color
                      ? 'ring-2 ring-ring ring-offset-2 ring-offset-background'
                      : 'hover:bg-accent'
                  }`}
                  aria-label={`Select ${color} color`}
                  aria-pressed={newColor === color}
                >
                  <span
                    aria-hidden
                    className={`size-6 rounded-full ${getColorDotClass(color)}`}
                  />
                </button>
              ))}
            </div>

            <Button
              size="sm"
              className="w-full"
              onClick={handleCreateCategory}
              disabled={
                !newName.trim() ||
                createMutation.isPending ||
                !isParentAvailable
              }
            >
              {createMutation.isPending ? 'Creating…' : 'Create'}
            </Button>
          </div>
        </PopoverContent>
      </Popover>
      <SidebarGroupContent>
        <SidebarMenu>
          {/* The hierarchy stays expanded so every writing destination remains one click away. */}
          {roots.map((category) => {
            const children = hierarchy.ordered.filter(
              (child) => child.parentId === category.id,
            )
            return (
              <SidebarMenuItem key={category.id}>
                <CategorySidebarRow
                  category={category}
                  selectedId={selectedCategoryId}
                  onClick={handleCategoryClick}
                  path={hierarchy.paths.get(category.id) ?? category.name}
                />
                {children.length > 0 ? (
                  <SidebarMenuSub aria-label={`${category.name} subcategories`}>
                    {children.map((child) => (
                      <SidebarMenuItem key={child.id}>
                        <CategorySidebarRow
                          category={child}
                          selectedId={selectedCategoryId}
                          onClick={handleCategoryClick}
                          path={hierarchy.paths.get(child.id) ?? child.name}
                        />
                      </SidebarMenuItem>
                    ))}
                  </SidebarMenuSub>
                ) : null}
              </SidebarMenuItem>
            )
          })}

          {/* Manage */}
          {categories.length > 0 && (
            <SidebarMenuItem>
              <SidebarMenuButton
                className="text-sidebar-foreground/70"
                onClick={onOpenManageAction}
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

/**
 * Renders the same writing-category control at either sidebar level.
 *
 * @param path - Full accessible name distinguishes same-named subcategories.
 * @example
 * <CategorySidebarRow category={category} selectedId={selectedId} onClick={handleClick} path="Work / CoreLive" />
 */
function CategorySidebarRow({
  category,
  selectedId,
  onClick,
  path,
}: {
  category: CategoryWithCount
  selectedId: number | null
  onClick: (event: MouseEvent<HTMLButtonElement>) => void
  path: string
}) {
  return (
    <>
      <SidebarMenuButton
        className="min-h-11"
        isActive={selectedId === category.id}
        data-category-id={category.id}
        onClick={onClick}
        aria-label={path}
        title={path}
        disabled={category.id <= 0}
      >
        <span
          aria-hidden
          className={`size-2 shrink-0 rounded-full ${getColorDotClass(category.color)}`}
        />
        <span className="truncate">{category.name}</span>
      </SidebarMenuButton>
      {category._count.todos > 0 ? (
        <SidebarMenuBadge>{category._count.todos}</SidebarMenuBadge>
      ) : null}
    </>
  )
}
