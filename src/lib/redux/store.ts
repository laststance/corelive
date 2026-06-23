/**
 * Redux Store Configuration
 *
 * Configures the Redux store with reducers and middleware including
 * redux-storage-middleware for localStorage persistence.
 *
 * @module lib/redux/store
 *
 * @example
 * // In a component
 * import { store } from '@/lib/redux/store'
 *
 * // Access state directly (prefer using hooks)
 * const state = store.getState()
 */
import {
  createStorageMiddleware,
  deepMerge,
} from '@laststance/redux-storage-middleware'
import { combineReducers, configureStore } from '@reduxjs/toolkit'

import { createPreferencesSyncMiddleware } from '../preferences-sync-channel'

import {
  migratePersistedState,
  STORAGE_SCHEMA_VERSION,
} from './migratePersistedState'
import electronSettingsReducer from './slices/electronSettingsSlice'
import preferencesReducer from './slices/preferencesSlice'

/**
 * Root reducer combining all slice reducers.
 * Add new slice reducers here as the application grows.
 */
const rootReducer = combineReducers({
  electronSettings: electronSettingsReducer,
  preferences: preferencesReducer,
})

/**
 * Storage key used for localStorage persistence.
 * Changing this will reset all persisted state. Exported so hydration tests
 * seed the same key the production store reads.
 */
export const STORAGE_KEY = 'corelive-redux-state'

/**
 * Builds CoreLive's localStorage persistence middleware. Extracted (and
 * exported) so the hydration regression tests drive the EXACT production
 * reconciler instead of a hand-copied config that could silently drift.
 *
 * Why `merge: deepMerge` and not the library default `shallowMerge`:
 * shallowMerge replaces each persisted slice wholesale (`{ ...current,
 * ...persisted }`), so any preference field ADDED in a newer app version is
 * simply absent for users who persisted before it existed — it reads back
 * `undefined` and the UI shows it "reverted to default" on version-up.
 * deepMerge recursively fills every missing field (at any depth) from the
 * current defaults while preserving all user-set values, so an update never
 * silently resets a preference and newer fields appear at their defaults. It is
 * also preferred over re-parsing through the Zod schema, which would reject the
 * WHOLE slice (resetting everything) on a single wrong-typed field — the wrong
 * trade-off for the user's own persisted data, where "preserve" beats "reject".
 *
 * The middleware also handles automatic persistence of state changes, SSR-safe
 * hydration on mount, and selective slice persistence. Bumping the version runs
 * `migrate` once on the next rehydrate; it MUST stay total or the middleware
 * wipes ALL persisted state.
 *
 * @returns The storage middleware, hydration-wrapped reducer, and hydration api.
 */
export const createPersistenceMiddleware = () =>
  createStorageMiddleware({
    rootReducer,
    key: STORAGE_KEY,
    slices: ['electronSettings', 'preferences'], // Slices to persist to localStorage
    version: STORAGE_SCHEMA_VERSION,
    migrate: migratePersistedState,
    merge: deepMerge,
  })

const { middleware: storageMiddleware, reducer: hydratedReducer } =
  createPersistenceMiddleware()

/**
 * Configured Redux store with middleware and dev tools.
 *
 * @example
 * // In a provider
 * import { Provider } from 'react-redux'
 * import { store } from '@/lib/redux/store'
 *
 * <Provider store={store}>
 *   <App />
 * </Provider>
 */
export const store = configureStore({
  reducer: hydratedReducer,
  middleware: (getDefaultMiddleware) =>
    getDefaultMiddleware({
      // Disable serializable check for storage middleware compatibility
      serializableCheck: false,
    })
      .concat(storageMiddleware)
      // Mirror preference toggles across windows (web / Electron / Floating).
      .concat(createPreferencesSyncMiddleware()),
  devTools: process.env.NODE_ENV !== 'production',
})

// Infer the `RootState` and `AppDispatch` types from the store itself
/**
 * Type representing the complete Redux state tree.
 * Use this for typing useSelector hooks.
 */
export type RootState = ReturnType<typeof store.getState>

/**
 * Type representing the store's dispatch function.
 * Use this for typing useDispatch hooks.
 */
export type AppDispatch = typeof store.dispatch
