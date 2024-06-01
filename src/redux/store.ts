import type { Action, ThunkAction } from '@reduxjs/toolkit'
import {
  combineSlices,
  configureStore,
  createListenerMiddleware,
} from '@reduxjs/toolkit'
import { persistReducer } from 'redux-persist'
import createWebStorage from 'redux-persist/lib/storage/createWebStorage'

import { drawerSlice, toggleDrawer } from '@/redux/drawerSlice'
import { editorSlice } from '@/redux/editorSlice'
import { toggleDrawerOpen } from '@/redux/toggleDrawerOpen'

// `combineSlices` automatically combines the reducers using
// their `reducerPath`s, therefore we no longer need to call `combineReducers`.
const rootReducer = combineSlices(editorSlice, drawerSlice)
// Infer the `RootState` type from the root reducer
export type RootState = ReturnType<typeof rootReducer>

const persistConfig = {
  key: 'unfarly',
  storage: createWebStorage('local'),
  whitelist: ['Editor'],
}
const persistedReducer = persistReducer(persistConfig, rootReducer)

// Setup Listener Mddleware
const listenerMiddleware = createListenerMiddleware()
listenerMiddleware.startListening({
  actionCreator: toggleDrawer,
  effect: () => {
    toggleDrawerOpen()
  },
})

// `makeStore` encapsulates the store configuration to allow
// creating unique store instances, which is particularly important for
// server-side rendering (SSR) scenarios. In SSR, separate store instances
// are needed for each request to prevent cross-request state pollution.
export const makeStore = () => {
  return configureStore({
    reducer: persistedReducer,
    middleware: (getDefaultMiddleware) =>
      getDefaultMiddleware().concat(listenerMiddleware.middleware),
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
