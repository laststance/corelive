import type { Action, ThunkAction } from '@reduxjs/toolkit'
import {
  combineSlices,
  configureStore,
  createListenerMiddleware,
} from '@reduxjs/toolkit'
import {
  persistReducer,
  FLUSH,
  REHYDRATE,
  PAUSE,
  PERSIST,
  PURGE,
  REGISTER,
} from 'redux-persist'
import createWebStorage from 'redux-persist/lib/storage/createWebStorage'

import { completedSlice } from '@/redux/completedSlice'
import { drawerSlice } from '@/redux/drawerSlice'
import { editorSlice } from '@/redux/editorSlice'
import { drawerListener } from '@/redux/listener/performToggleDrawerEffect'

// `combineSlices` automatically combines the reducers using
// their `reducerPath`s, therefore we no longer need to call `combineReducers`.
const rootReducer = combineSlices(editorSlice, drawerSlice, completedSlice)
// Infer the `RootState` type from the root reducer
export type RootState = ReturnType<typeof rootReducer>

const persistConfig = {
  key: 'unfarly',
  storage: createWebStorage('local'),
  whitelist: ['Editor', 'Completed'],
}
const persistedReducer = persistReducer(persistConfig, rootReducer)

// Setup Listener Mddleware
const listenerMiddleware = createListenerMiddleware()
listenerMiddleware.startListening(drawerListener)

// `makeStore` encapsulates the store configuration to allow
// creating unique store instances, which is particularly important for
// server-side rendering (SSR) scenarios. In SSR, separate store instances
// are needed for each request to prevent cross-request state pollution.
export const makeStore = () => {
  return configureStore({
    reducer: persistedReducer,
    middleware: (getDefaultMiddleware) =>
      getDefaultMiddleware({
        serializableCheck: {
          ignoredActions: [FLUSH, REHYDRATE, PAUSE, PERSIST, PURGE, REGISTER],
        },
      }).concat(listenerMiddleware.middleware),
  })
}

// Infer the return type of `makeStore`
export type AppStore = ReturnType<typeof makeStore>
// Infer the `AppDispatch` type from the store itself
export type AppDispatch = AppStore['dispatch']
export type AppThunk<ThunkReturnType = void> = ThunkAction<
  ThunkReturnType,
  RootState,
  unknown,
  Action
>
