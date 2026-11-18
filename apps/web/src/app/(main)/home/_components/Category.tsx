'use client'

import { useQuery } from '@tanstack/react-query'
import { Plus, Settings } from 'lucide-react'
import Link from 'next/link'
import { usePathname, useSearchParams } from 'next/navigation'
import {
  Suspense,
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

interface CategoryProps {
  onOpenManageAction: () => void
}

/**
 * Category section for the app Sidebar.
 * The shared Dashboard sidebar uses it to open filtered journals and manage categories.
 *
 * @param props - The callback that opens category management from the sidebar.
 *
 * @example
 * <Category onOpenManageAction={() => setManageOpen(true)} />
 */
export function Category(props: CategoryProps) {
  return (
    <Suspense>
      <CategoryContent {...props} />
    </Suspense>
  )
}

function CategoryContent({ onOpenManageAction }: CategoryProps) {
  const { setOpenMobile, isMobile } = useSidebar()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const activeCategory =
    pathname === '/home' ? searchParams.get('category') : null
  const [selectedCategoryId, setSelectedCategoryId] = useSelectedCategory()
  const { createMutation } = useCategoryMutations()
  const isClerkQueryReady = useClerkQueryReady()

  // Add Category popover state
  const [addOpen, setAddOpen] = useState(false)
  const [newName, setNewName] = useState('')
  const [newColor, setNewColor] = useState<CategoryColor>('blue')
  const [colorTouched, setColorTouched] = useState(false)
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
  const effectiveColor = colorTouched
    ? newColor
    : (selectedParent?.color ?? 'blue')

  // Keep the stored writing preference separate from the explicit journal filter.
  useAutoSelectDefaultCategory(
    selectedCategoryId,
    setSelectedCategoryId,
    categories,
  )

  // Cross-tab sync for categories
  useCategorySync()

  const handleSelect = (
    event: MouseEvent<HTMLAnchorElement>,
    categoryId: number,
  ): void => {
    // Leave the current view alone when the link opens in another tab or window.
    if (
      event.defaultPrevented ||
      event.button !== 0 ||
      event.altKey ||
      event.ctrlKey ||
      event.metaKey ||
      event.shiftKey
    )
      return

    setSelectedCategoryId(categoryId)
    if (isMobile) {
      setOpenMobile(false)
    }
  }

  /**
   * Handles creating a new category from the popover form.
   */
  const handleCreateCategory = (): void => {
    const trimmedName = newName.trim()
    // A peer may remove or move the selected parent while this form stays open.
    if (!trimmedName || createMutation.isPending || !isParentAvailable) return

    createMutation.mutate(
      { name: trimmedName, color: effectiveColor, parentId: newParentId },
      {
        onSuccess: () => {
          setNewName('')
          setNewColor('blue')
          setColorTouched(false)
          setNewParentId(null)
          setAddOpen(false)
        },
      },
    )
  }

  const handleAddOpenChange = (open: boolean): void => {
    setAddOpen(open)
  }

  const handleNewNameChange = (event: ChangeEvent<HTMLInputElement>): void => {
    setNewName(event.target.value)
  }

  const handleNewNameKeyDown = (
    event: KeyboardEvent<HTMLInputElement>,
  ): void => {
    if (
      event.key === 'Enter' &&
      !event.nativeEvent.isComposing &&
      event.keyCode !== 229
    )
      handleCreateCategory()
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

            {/* An explicit color survives parent changes; untouched forms inherit their current parent. */}
            <div className="flex flex-wrap gap-1">
              {CATEGORY_COLORS.map((color) => (
                <button
                  key={color}
                  type="button"
                  onClick={() => {
                    setNewColor(color)
                    setColorTouched(true)
                  }}
                  className={`flex size-11 items-center justify-center rounded-md ${
                    effectiveColor === color
                      ? 'ring-2 ring-ring ring-offset-2 ring-offset-background'
                      : 'hover:bg-accent'
                  }`}
                  aria-label={`Select ${color} color`}
                  aria-pressed={effectiveColor === color}
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
          {/* Keep subcategories visible so every journal filter is one click away. */}
          {roots.map((category) => {
            const children = hierarchy.ordered.filter(
              (child) => child.parentId === category.id,
            )
            return (
              <SidebarMenuItem key={category.id}>
                <CategorySidebarRow
                  category={category}
                  activeCategory={activeCategory}
                  searchParams={searchParams}
                  onSelect={handleSelect}
                  path={hierarchy.paths.get(category.id) ?? category.name}
                />
                {children.length > 0 ? (
                  <SidebarMenuSub aria-label={`${category.name} subcategories`}>
                    {children.map((child) => (
                      <SidebarMenuItem key={child.id}>
                        <CategorySidebarRow
                          category={child}
                          activeCategory={activeCategory}
                          searchParams={searchParams}
                          onSelect={handleSelect}
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
 * Links an available category to its journal view at either level of the sidebar.
 * @param path - Full accessible name distinguishes same-named subcategories.
 * @example
 * <CategorySidebarRow category={category} activeCategory="2" searchParams={searchParams} onSelect={handleSelect} path="Work / CoreLive" />
 */
function CategorySidebarRow({
  category,
  activeCategory,
  searchParams,
  onSelect,
  path,
}: {
  category: CategoryWithCount
  activeCategory: string | null
  searchParams: URLSearchParams
  onSelect: (event: MouseEvent<HTMLAnchorElement>, id: number) => void
  path: string
}) {
  const isConfirmed = category.id > 0
  const isActive = isConfirmed && activeCategory === String(category.id)
  const params = new URLSearchParams(searchParams)
  params.delete('date')
  params.delete('filter')
  params.set('category', String(category.id))
  const content = (
    <>
      <span
        aria-hidden
        className={`size-2 shrink-0 rounded-full ${getColorDotClass(category.color)}`}
      />
      <span className="truncate">{category.name}</span>
    </>
  )

  return (
    <>
      <SidebarMenuButton
        asChild={isConfirmed}
        className="min-h-11"
        isActive={isActive}
        aria-label={path}
        title={path}
        disabled={isConfirmed ? undefined : true}
      >
        {isConfirmed ? (
          <Link
            href={`/home?${params.toString()}#journal`}
            aria-current={isActive ? 'location' : undefined}
            onClick={(event) => onSelect(event, category.id)}
          >
            {content}
          </Link>
        ) : (
          content
        )}
      </SidebarMenuButton>
      {category._count.todos > 0 ? (
        <SidebarMenuBadge>{category._count.todos}</SidebarMenuBadge>
      ) : null}
    </>
  )
}
