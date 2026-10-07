/**
 * Redux Hooks
 *
 * Pre-typed hooks for accessing Redux state and dispatch.
 * Use these hooks instead of plain `useSelector` and `useDispatch`
 * for proper TypeScript type inference.
 *
 * @module lib/redux/hooks
 *
 * @example
 * import { useAppSelector, useAppDispatch } from '@/lib/redux/hooks'
 * import { selectHideAppIcon, setHideAppIcon } from '@/lib/redux/slices/electronSettingsSlice'
 *
 * function SettingsComponent() {
 *   const hideAppIcon = useAppSelector(selectHideAppIcon)
 *   const dispatch = useAppDispatch()
 *
 *   const handleToggle = (checked: boolean) => {
 *     dispatch(setHideAppIcon(checked))
 *   }
 *
 *   return <Switch checked={hideAppIcon} onCheckedChange={handleToggle} />
 * }
 */
import { useDispatch, useSelector } from 'react-redux'

import type { RootState, AppDispatch } from './store'

/**
 * Pre-typed useDispatch hook.
 * Provides proper typing for async thunks and other dispatch actions.
 *
 * @returns Typed dispatch function
 *
 * @example
 * const dispatch = useAppDispatch()
 * dispatch(setHideAppIcon(true))
 */
export const useAppDispatch = useDispatch.withTypes<AppDispatch>()

/**
 * Pre-typed useSelector hook.
 * Provides proper typing for state selection.
 *
 * @param selector - Selector function that receives RootState
 * @returns Selected state value
 *
 * @example
 * const hideAppIcon = useAppSelector(selectHideAppIcon)
 * const settings = useAppSelector((state) => state.electronSettings)
 */
export const useAppSelector = useSelector.withTypes<RootState>()
