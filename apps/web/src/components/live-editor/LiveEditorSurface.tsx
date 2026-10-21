'use client'

import {
  SharedEditorSurface,
  type SharedEditorSurfaceProps,
  type BrowserStorageAvailability,
} from '@corelive/live-editor/surface'
import Link from 'next/link'
import { useState } from 'react'
import { shallowEqual } from 'react-redux'

import { useInitialEffect } from '@/hooks/use-initial-effect'
import { getLocalStorageAvailability } from '@/lib/live-editor/localStorageSlot'
import { useAppSelector } from '@/lib/redux/hooks'
import { selectUserSettings } from '@/lib/redux/slices/settingsSlice'
import type { CategoryWithCount } from '@/server/schemas/category'

import { LiveEditorCategoryPicker } from './LiveEditorCategoryPicker'
import { LiveEditorTodayEmber } from './LiveEditorTodayEmber'

type WebSurfaceProps = Omit<
  SharedEditorSurfaceProps,
  | 'categoryCount'
  | 'categoryPicker'
  | 'settings'
  | 'storageAvailability'
  | 'ember'
  | 'nativeFooter'
  | 'details'
  | 'linkComponent'
> & {
  categories: CategoryWithCount[]
  handleCategoryValueChange: (value: string) => void
}

/** Supplies browser account/storage/presentation adapters to the shared editor surface.
 * Older installed clients keep their legacy window chrome through these same props.
 * @example <LiveEditorSurface {...props} />
 */
export function LiveEditorSurface(props: WebSurfaceProps) {
  const settings = useAppSelector(selectUserSettings, shallowEqual)
  const [storageAvailability, setStorageAvailability] =
    useState<BrowserStorageAvailability>('ok')
  useInitialEffect(() => {
    setStorageAvailability(getLocalStorageAvailability())
  })
  return (
    <SharedEditorSurface
      {...props}
      categoryCount={props.categories.length}
      settings={settings}
      storageAvailability={storageAvailability}
      linkComponent={Link}
      ember={
        settings.showTodayEmber ? (
          <LiveEditorTodayEmber compact={props.isElectronPanel} />
        ) : undefined
      }
      categoryPicker={
        <LiveEditorCategoryPicker
          categories={props.categories}
          activeCategoryId={props.activeCategoryId}
          isSignedIn={props.isSignedIn}
          isElectronPanel={props.isElectronPanel}
          isLoading={props.isCategoryListPending}
          isError={props.isCategoryListError}
          onRetry={props.onRetryCategories}
          onCategoryValueChange={props.handleCategoryValueChange}
        />
      }
    />
  )
}
