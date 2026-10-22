'use client'

import {
  SharedCategoryPicker,
  type SharedCategoryPickerProps,
} from '@corelive/live-editor/category-picker'
import { useRef, useState } from 'react'

import {
  CategoryCreateDialog,
  CategoryManageDialog,
} from '@/app/(main)/home/_components/CategoryManageDialog'
import { useUpdateEffect } from '@/hooks/use-update-effect'
import type { CategoryWithCount } from '@/server/schemas/category'

type Props = Omit<
  SharedCategoryPickerProps,
  'categories' | 'onCreate' | 'onManage' | 'actionsDisabled' | 'triggerRef'
> & { categories: CategoryWithCount[] }

/** Connects the shared picker to existing online category dialogs, preserving focus and selection.
 * @example <LiveEditorCategoryPicker {...props} />
 */
export function LiveEditorCategoryPicker(props: Props) {
  const triggerRef = useRef<HTMLButtonElement>(null)
  const [dialog, setDialog] = useState<{
    kind: 'create' | 'manage'
    name?: string
  } | null>(null)
  useUpdateEffect(() => {
    if (dialog === null) triggerRef.current?.focus()
  }, [dialog])
  return (
    <>
      <SharedCategoryPicker
        {...props}
        triggerRef={triggerRef}
        onCreate={(name) => setDialog({ kind: 'create', name })}
        onManage={() => setDialog({ kind: 'manage' })}
      />
      {dialog?.kind === 'manage' && (
        <CategoryManageDialog
          open
          onOpenChange={(open) => {
            if (!open) setDialog(null)
          }}
        />
      )}
      {dialog?.kind === 'create' && (
        <CategoryCreateDialog
          open
          categories={props.categories}
          initialName={dialog.name ?? ''}
          onOpenChange={(open) => {
            if (!open) setDialog(null)
          }}
          onCreated={(category) => {
            if (category.id > 0)
              props.onCategoryValueChange(String(category.id))
            setDialog(null)
          }}
        />
      )}
    </>
  )
}
