'use client'

import type { WorkspaceCommand } from '@corelive/desktop-contract/offline-workspace-v2'
import {
  createCategoryHierarchy,
  searchCategoryHierarchy,
} from '@corelive/live-editor/categoryHierarchy'
import { cn } from '@corelive/live-editor/cn'
import { Button } from '@corelive/live-editor/ui/button'
import {
  Command,
  CommandInput,
  CommandItem,
  CommandList,
} from '@corelive/live-editor/ui/command'
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@corelive/live-editor/ui/popover'
import { Check, ChevronsUpDown, Plus, Settings2 } from 'lucide-react'
import { useMemo, useRef, useState } from 'react'

import type { CategoryCommandOutcome } from './categoryCopy'
import {
  CategoryManagementPanel,
  type CategoryPanelMode,
} from './CategoryManagementPanel'
import { isEditorComposing } from './editorInput'

export interface PickerCategory {
  id: string
  name: string
  parentId?: string | null
  color?: string
  isDefault?: boolean
  createdAt?: Date | string
  removed?: boolean
}

export interface SharedCategoryPickerProps {
  categories: PickerCategory[]
  activeCategoryId: string | null
  onCategoryValueChange: (value: string) => void
  isLoading?: boolean
  isError?: boolean
  onRetry?: () => void
  /**
   * Sends one category command to main (create/rename/recolor/reparent/delete, D4). When set,
   * the footer offers Create and Manage, which work offline.
   */
  onCategoryCommand?: (
    command: WorkspaceCommand,
  ) => Promise<CategoryCommandOutcome>
  triggerRef?: React.RefObject<HTMLButtonElement | null>
}

/**
 * Lets writing surfaces search parent/child paths, create categories and open their shared manager.
 *
 * @param categories - Current category rows; pending IDs remain visible but unselectable.
 * @example
 * <SharedCategoryPicker categories={categories} activeCategoryId="0b1f…" onCategoryValueChange={setCategory} />
 */
export function SharedCategoryPicker({
  categories,
  activeCategoryId,
  onCategoryValueChange,
  isLoading = false,
  isError = false,
  onRetry,
  onCategoryCommand,
  triggerRef: externalTriggerRef,
}: SharedCategoryPickerProps) {
  const internalTriggerRef = useRef<HTMLButtonElement>(null)
  const triggerRef = externalTriggerRef ?? internalTriggerRef
  const [state, setState] = useState<{
    open: boolean
    query: string
    /** `manage` lists categories to edit; the others are the inline forms. */
    panel: CategoryPanelMode | 'manage' | null
  }>({ open: false, query: '', panel: null })
  const hierarchy = useMemo(
    () => createCategoryHierarchy(categories),
    [categories],
  )
  const matching = useMemo(
    () => searchCategoryHierarchy(categories, state.query),
    [categories, state.query],
  )
  const active =
    activeCategoryId === null ? undefined : hierarchy.byId.get(activeCategoryId)
  const activePath = active
    ? (hierarchy.paths.get(active.id) ?? active.name)
    : 'No categories'
  const activeParent = active?.parentId
    ? hierarchy.byId.get(active.parentId)
    : undefined
  const openAction = (action: 'create' | 'manage'): void => {
    // The forms stay inside the popover so a refusal can keep the typed value (DA8).
    setState((current) => ({
      ...current,
      panel:
        action === 'create'
          ? { kind: 'create', initialName: current.query.trim() }
          : 'manage',
    }))
  }
  // A finished create already selected the new category in main; closing returns to the list.
  const closePanel = (): void =>
    setState((current) => ({ ...current, panel: null }))
  return (
    <>
      <Popover
        open={state.open}
        onOpenChange={(open) =>
          setState((current) => ({
            ...current,
            open,
            query: open ? '' : current.query,
            panel: open ? current.panel : null,
          }))
        }
      >
        <PopoverTrigger asChild>
          <Button
            ref={triggerRef}
            variant="outline"
            role="combobox"
            aria-expanded={state.open}
            aria-label={`Writing category: ${activePath}`}
            title={activePath}
            className="h-7 w-40 max-w-full justify-between gap-1 text-xs font-normal"
          >
            <span className="flex min-w-0 flex-1 items-center gap-1">
              {activeParent && (
                <span className="max-w-16 truncate text-muted-foreground">
                  {activeParent.name} /
                </span>
              )}
              <span className="min-w-0 flex-1 truncate">
                {active?.removed
                  ? `${active.name} (removed)`
                  : (active?.name ??
                    (isLoading ? 'Loading categories…' : 'No categories'))}
              </span>
            </span>
            <ChevronsUpDown className="size-3 shrink-0 opacity-50" />
          </Button>
        </PopoverTrigger>
        <PopoverContent
          align="start"
          collisionPadding={8}
          onEscapeKeyDown={(event) => {
            if (event.isComposing || event.keyCode === 229)
              event.preventDefault()
          }}
          className="w-80 max-w-[calc(100vw-1rem)] p-0"
          onKeyDownCapture={(event) => {
            if (
              isEditorComposing(event) &&
              (event.key === 'Enter' ||
                event.key === 'Escape' ||
                event.keyCode === 229)
            ) {
              event.preventDefault()
              event.stopPropagation()
            }
          }}
        >
          {state.panel === 'manage' ? (
            <div className="max-h-96 overflow-y-auto p-1">
              {categories
                .filter((category) => !category.removed)
                .map((category) => (
                  <Button
                    key={category.id}
                    variant="ghost"
                    className="h-auto min-h-11 w-full justify-start whitespace-normal text-left"
                    onClick={() =>
                      setState((current) => ({
                        ...current,
                        panel: { kind: 'edit', categoryId: category.id },
                      }))
                    }
                  >
                    {hierarchy.paths.get(category.id) ?? category.name}
                  </Button>
                ))}
              <Button variant="ghost" size="sm" onClick={closePanel}>
                Back
              </Button>
            </div>
          ) : state.panel && onCategoryCommand ? (
            <CategoryManagementPanel
              key={
                state.panel.kind === 'edit' ? state.panel.categoryId : 'create'
              }
              mode={state.panel}
              categories={categories.map((category) => ({
                id: category.id,
                name: category.name,
                color: category.color ?? 'blue',
                isDefault: category.isDefault ?? false,
                parentId: category.parentId ?? null,
                removed: category.removed,
              }))}
              onCommand={onCategoryCommand}
              onDone={closePanel}
            />
          ) : (
            <Command
              label="Search categories"
              shouldFilter={false}
              className="h-96 max-h-[var(--radix-popover-content-available-height)] min-h-0"
            >
              <CommandInput
                placeholder="Search categories…"
                aria-label="Search categories"
                value={state.query}
                onValueChange={(query) =>
                  setState((current) => ({ ...current, query }))
                }
              />
              <CommandList
                className="max-h-none min-h-0 flex-1 overflow-hidden [&_[cmdk-list-sizer]]:flex [&_[cmdk-list-sizer]]:h-full [&_[cmdk-list-sizer]]:flex-col" // Keep category actions visible while the category list scrolls.
              >
                <div className="min-h-0 flex-1 overflow-y-auto">
                  {isLoading && (
                    <p
                      role="status"
                      className="p-3 text-sm text-muted-foreground"
                    >
                      Loading categories…
                    </p>
                  )}
                  {isError && (
                    <div role="alert" className="p-3 text-sm">
                      Could not load categories.
                      {onRetry && (
                        <Button variant="ghost" onClick={onRetry}>
                          Retry
                        </Button>
                      )}
                    </div>
                  )}
                  {!isLoading && !isError && matching.length === 0 && (
                    <p className="p-3 text-sm text-muted-foreground">
                      {state.query.trim()
                        ? 'No matching categories.'
                        : 'No categories yet.'}
                    </p>
                  )}
                  {matching.map((category) => (
                    <CommandItem
                      key={category.id}
                      value={`category:${category.id}`}
                      aria-label={hierarchy.paths.get(category.id)}
                      aria-description={
                        category.id === activeCategoryId
                          ? 'Current writing category'
                          : undefined
                      }
                      className={cn(
                        'min-h-11 break-words',
                        !state.query.trim() && category.parentId ? 'pl-6' : '',
                      )}
                      onSelect={() => {
                        onCategoryValueChange(category.id)
                        setState((current) => ({ ...current, open: false }))
                      }}
                    >
                      <span className="min-w-0 flex-1 whitespace-normal">
                        {state.query.trim() || category.id === activeCategoryId
                          ? hierarchy.paths.get(category.id)
                          : category.name}
                        {category.removed && ' (removed)'}
                      </span>
                      {category.id === activeCategoryId && (
                        <>
                          <Check className="size-4 shrink-0" />
                          <span className="sr-only">
                            Current writing category
                          </span>
                        </>
                      )}
                    </CommandItem>
                  ))}
                </div>
                <div className="shrink-0 border-t p-1">
                  {onCategoryCommand && (
                    <CommandItem
                      value="action:create"
                      className="min-h-11"
                      onSelect={() => openAction('create')}
                    >
                      <Plus className="size-4" />
                      Create category…
                    </CommandItem>
                  )}
                  {onCategoryCommand && (
                    <CommandItem
                      value="action:manage"
                      className="min-h-11"
                      onSelect={() => openAction('manage')}
                    >
                      <Settings2 className="size-4" />
                      Manage categories…
                    </CommandItem>
                  )}
                </div>
              </CommandList>
            </Command>
          )}
        </PopoverContent>
      </Popover>
    </>
  )
}
