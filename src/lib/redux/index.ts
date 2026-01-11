/**
 * Redux Store Exports
 *
 * Central export point for Redux store, hooks, and slices.
 *
 * @module lib/redux
 *
 * @example
 * // Import store and hooks
 * import { store, useAppSelector, useAppDispatch } from '@/lib/redux'
 *
 * // Import slice actions and selectors
 * import {
 *   setHideAppIcon,
 *   selectHideAppIcon
 * } from '@/lib/redux/slices/electronSettingsSlice'
 */

export { store, type RootState, type AppDispatch } from './store'
export { useAppDispatch, useAppSelector } from './hooks'
