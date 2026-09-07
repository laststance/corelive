'use client'
import { Settings2 } from 'lucide-react'
import { useId, useState } from 'react'

import { CategoryManageDialog } from '@/app/(main)/home/_components/CategoryManageDialog'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectSeparator,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { cn } from '@/lib/utils'
import type { Category, CategoryWithCount } from '@/server/schemas/category'

/**
 * Sentinel `<SelectItem>` value for the "Manage categories…" footer row.
 * Must stay non-numeric: `0` is `LOCAL_CATEGORY_ID` and negatives are the
 * optimistic ids {@link useCategoryMutations} hands a pending create.
 */
const MANAGE_CATEGORIES_VALUE = '__manage_categories__'

interface LiveEditorCategoryPickerProps {
  categories: CategoryWithCount[]
  activeCategoryId: Category['id'] | null
  isSignedIn: boolean | undefined
  isElectronPanel: boolean
  onCategoryValueChange: (value: string) => void
}

/**
 * The LiveEditor's only category control (design review DR3): picks the active
 * category and, through a footer row, opens the shared manager. Rendered by
 * {@link LiveEditorSurface} whenever the panel or a signed-in web visitor has one.
 * @param props - The category list, the active id, host flags, and the controller's selection handler.
 * @returns The picker, its manage row, and the manager while it is open.
 * @example
 * <LiveEditorCategoryPicker categories={categories} activeCategoryId={1} isSignedIn isElectronPanel={false} onCategoryValueChange={setCategory} />
 */
export const LiveEditorCategoryPicker = function LiveEditorCategoryPicker({
  categories,
  activeCategoryId,
  isSignedIn,
  isElectronPanel,
  onCategoryValueChange,
}: LiveEditorCategoryPickerProps) {
  const categoryInputId = useId()
  const [isManageDialogOpen, setIsManageDialogOpen] = useState(false)
  const hasCategories = categories.length > 0

  /**
   * Splits the picker's two jobs: the manage row opens the manager, every other
   * value is a real category and goes to the controller's shared selection.
   * @param value - The chosen `<SelectItem>` value.
   * @returns Nothing.
   * @example
   * handleCategorySelect('__manage_categories__') // opens the manager, selection untouched
   */
  const handleCategorySelect = (value: string) => {
    if (value === MANAGE_CATEGORIES_VALUE) {
      // Return before delegating: Number('__manage_categories__') is NaN and
      // would land in the selection the sidebar and /home also read.
      setIsManageDialogOpen(true)
      return
    }
    onCategoryValueChange(value)
  }

  /**
   * Closes the manager and hands focus back to the picker. Unmounting the dialog
   * skips Radix's own focus restore, so keyboard users would otherwise land on
   * `<body>` with nothing selected.
   * @param nextOpen - Radix's requested open state.
   * @returns Nothing.
   * @example
   * handleManageDialogOpenChange(false) // closes, refocuses the picker
   */
  const handleManageDialogOpenChange = (nextOpen: boolean) => {
    setIsManageDialogOpen(nextOpen)
    if (!nextOpen) {
      document.getElementById(categoryInputId)?.focus()
    }
  }

  return (
    <>
      <Select
        value={activeCategoryId === null ? '' : String(activeCategoryId)}
        onValueChange={handleCategorySelect}
        // The trigger stays openable whenever the manage row is in it, i.e.
        // whenever signed in — keyed on auth, not on pendency. Without this,
        // /write disables the picker for the whole category round trip and the
        // manage row is unreachable exactly when there is nothing else.
        disabled={!hasCategories && !isSignedIn}
      >
        <SelectTrigger
          id={categoryInputId}
          aria-label="Active category"
          className={cn(
            'text-xs',
            // 44px touch target on the web (/write is the phone surface).
            // `min-h-11`, not `h-11`: SelectTrigger's own
            // `data-[size=default]:h-9` outranks a plain height.
            isElectronPanel ? 'h-7 w-32' : 'min-h-11 w-44',
          )}
        >
          <SelectValue placeholder="No categories" />
        </SelectTrigger>
        <SelectContent>
          {categories.map((category) => (
            <SelectItem key={category.id} value={String(category.id)}>
              {category.name}
            </SelectItem>
          ))}
          {/* Every category write needs a Clerk bearer, so the row only exists
              for a signed-in visitor. */}
          {isSignedIn && (
            <>
              <SelectSeparator />
              {/* textValue is load-bearing, not decoration: Radix runs typeahead
                  on the CLOSED trigger and its match handler calls onValueChange
                  without opening the menu, so an alphabetic label here would
                  open the manager on a bare "m" keypress. */}
              <SelectItem
                value={MANAGE_CATEGORIES_VALUE}
                textValue="⋯"
                className="text-muted-foreground"
              >
                <Settings2 className="h-3.5 w-3.5" />
                Manage categories…
              </SelectItem>
            </>
          )}
        </SelectContent>
      </Select>

      {/* Mounted only while open, not <Activity>: the manager pulls in the
          category query and all three mutations, and this picker re-renders on
          every keystroke in the editor. Its own state resets on close anyway,
          so there is nothing to preserve. */}
      {isManageDialogOpen && (
        <CategoryManageDialog
          open
          onOpenChange={handleManageDialogOpenChange}
        />
      )}
    </>
  )
}
