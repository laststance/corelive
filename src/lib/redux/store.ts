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
import { createStorageMiddleware } from '@laststance/redux-storage-middleware'
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
 * Changing this will reset all persisted state.
 */
const STORAGE_KEY = 'corelive-redux-state'

/**
 * Configure redux-storage-middleware for localStorage persistence.
 * Only persists specified slices to avoid bloating localStorage.
 *
 * The middleware handles:
 * - Automatic persistence of state changes to localStorage
 * - SSR-safe hydration on client-side mount
 * - Selective slice persistence
 */
const { middleware: storageMiddleware, reducer: hydratedReducer } =
  createStorageMiddleware({
    rootReducer,
    key: STORAGE_KEY,
    slices: ['electronSettings', 'preferences'], // Slices to persist to localStorage
    // Seal the legacy completionSound → soundMoments fold at the hydration
    // boundary. Bumping the version runs `migrate` once on the next rehydrate;
    // it MUST stay total or the middleware wipes ALL persisted state.
    version: STORAGE_SCHEMA_VERSION,
    migrate: migratePersistedState,
  })

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
