import type { Action, ThunkAction } from '@reduxjs/toolkit'
import {
  combineSlices,
  configureStore,
  createListenerMiddleware,
} from '@reduxjs/toolkit'
import axios from 'axios'
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
import { toast } from 'sonner'
// @ts-expect-error TODO replace @laststance version package later
import { createKeybindingsHandler } from 'tinykeys'

import { drawerSlice, toggleDrawer } from '@/redux/drawerSlice'
import { editorSlice } from '@/redux/editorSlice'
import { userSlice } from '@/redux/userSlice'

// `combineSlices` automatically combines the reducers using
// their `reducerPath`s, therefore we no longer need to call `combineReducers`.
const rootReducer = combineSlices(editorSlice, drawerSlice, userSlice)
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
const startAppListening = listenerMiddleware.startListening.withTypes<
  RootState,
  AppDispatch
>()

startAppListening({
  actionCreator: toggleDrawer,
  effect: (_action: Action, listenerApi) => {
    const checkbox = document.querySelector('#sidebar') as HTMLInputElement
    checkbox.checked = listenerApi.getState().Drawer.drawer
  },
})

startAppListening({
  type: 'Emit/InitializeListener',
  effect: async (_action: Action, listenerApi) => {
    const handler = createKeybindingsHandler({
      '$mod+S': async (e: KeyboardEvent) => {
        e.preventDefault()
        const store = listenerApi.getState()

        const editorList = store.Editor.editorList
        const completed = store.Editor.currentCategory

        const { data } = await axios.post('/api/save', {
          editorList,
          completed,
        })
        toast.success(data.message)
      },
    })
    window.addEventListener('keydown', handler)
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
