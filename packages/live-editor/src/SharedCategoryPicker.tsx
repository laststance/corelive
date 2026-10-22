'use client'

import { Check, ChevronsUpDown, Plus, Settings2 } from 'lucide-react'
import { useMemo, useRef, useState } from 'react'

import {
  createCategoryHierarchy,
  searchCategoryHierarchy,
} from './categoryHierarchy'
import { cn } from './cn'
import { isEditorComposing } from './editorInput'
import { Button } from './ui/button'
import { Command, CommandInput, CommandItem, CommandList } from './ui/command'
import { Popover, PopoverContent, PopoverTrigger } from './ui/popover'

export interface PickerCategory {
  id: number
  name: string
  parentId?: number | null
  createdAt?: Date | string
  removed?: boolean
}

export interface SharedCategoryPickerProps {
  categories: PickerCategory[]
  activeCategoryId: number | null
  isSignedIn: boolean | undefined
  isElectronPanel: boolean
  onCategoryValueChange: (value: string) => void
  isLoading?: boolean
  isError?: boolean
  onRetry?: () => void
  onCreate?: (initialName: string) => void
  onManage?: () => void
  actionsDisabled?: boolean
  triggerRef?: React.RefObject<HTMLButtonElement | null>
}

/**
 * Lets writing surfaces search parent/child paths, create categories and open their shared manager.
 *
 * @param categories - Current category rows; pending IDs remain visible but unselectable.
 * @example
 * <LiveEditorCategoryPicker categories={categories} activeCategoryId={12} isSignedIn isElectronPanel={false} onCategoryValueChange={setCategory} />
 */
export function SharedCategoryPicker({
  categories,
  activeCategoryId,
  isSignedIn,
  isElectronPanel,
  onCategoryValueChange,
  isLoading = false,
  isError = false,
  onRetry,
  onCreate,
  onManage,
  actionsDisabled = false,
  triggerRef: externalTriggerRef,
}: SharedCategoryPickerProps) {
  const internalTriggerRef = useRef<HTMLButtonElement>(null)
  const triggerRef = externalTriggerRef ?? internalTriggerRef
  const [state, setState] = useState<{
    open: boolean
    query: string
  }>({ open: false, query: '' })
  const hierarchy = useMemo(
    () => createCategoryHierarchy(categories),
    [categories],
  )
  const matching = useMemo(
    () => searchCategoryHierarchy(categories, state.query),
    [categories, state.query],
  )
  const active = hierarchy.byId.get(activeCategoryId ?? 0)
  const activePath = active
    ? (hierarchy.paths.get(active.id) ?? active.name)
    : 'No categories'
  const activeParent = active?.parentId
    ? hierarchy.byId.get(active.parentId)
    : undefined
  const openAction = (action: 'create' | 'manage'): void => {
    if (actionsDisabled) return
    setState((current) => ({ ...current, open: false }))
    if (action === 'create') onCreate?.(state.query.trim())
    else onManage?.()
  }
  return (
    <>
      <Popover
        open={state.open}
        onOpenChange={(open) =>
          setState((current) => ({
            ...current,
            open,
            query: open ? '' : current.query,
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
            disabled={!categories.length && !isSignedIn}
            className={cn(
              'justify-between gap-1 text-xs font-normal',
              isElectronPanel ? 'h-7 w-40 max-w-full' : 'min-h-11 w-44',
            )}
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
              className="max-h-none min-h-0 flex-1 overflow-hidden [&_[cmdk-list-sizer]]:flex [&_[cmdk-list-sizer]]:h-full [&_[cmdk-list-sizer]]:flex-col" // eslint-disable-line dslint/token-only -- cmdk internal list layout keeps actions visible
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
                    disabled={isSignedIn ? category.id <= 0 : false}
                    className={cn(
                      'min-h-11 break-words',
                      !state.query.trim() && category.parentId ? 'pl-6' : '',
                    )}
                    onSelect={() => {
                      // The local signed-out ID is valid only in the implicit public-writing flow.
                      if (isSignedIn && category.id <= 0) return
                      onCategoryValueChange(String(category.id))
                      setState((current) => ({ ...current, open: false }))
                    }}
                  >
                    <span className="min-w-0 flex-1 whitespace-normal">
                      {state.query.trim() || category.id === activeCategoryId
                        ? hierarchy.paths.get(category.id)
                        : category.name}
                      {category.removed && ' (removed)'}
                      {category.id < 0 && ' — Creating…'}
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
              {isSignedIn && (
                <div className="shrink-0 border-t p-1">
                  {actionsDisabled && (
                    <p className="px-2 py-1 text-xs text-muted-foreground">
                      Connect to manage categories.
                    </p>
                  )}
                  {onCreate && (
                    <CommandItem
                      value="action:create"
                      className="min-h-11"
                      disabled={actionsDisabled}
                      onSelect={() => openAction('create')}
                    >
                      <Plus className="size-4" />
                      Create category…
                    </CommandItem>
                  )}
                  {onManage && (
                    <CommandItem
                      value="action:manage"
                      className="min-h-11"
                      disabled={actionsDisabled}
                      onSelect={() => openAction('manage')}
                    >
                      <Settings2 className="size-4" />
                      Manage categories…
                    </CommandItem>
                  )}
                </div>
              )}
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>
    </>
  )
}
