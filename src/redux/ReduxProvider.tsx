'use client'

import { useRef } from 'react'
import type { ReactNode } from 'react'
import { Provider } from 'react-redux'
import { persistStore } from 'redux-persist'

import type { AppStore } from './store'
import { makeStore } from './store'

interface Props {
  readonly children: ReactNode
}

const ReduxProvider = ({ children }: Props) => {
  const storeRef = useRef<AppStore | null>(null)

  if (storeRef.current === null) {
    // Create the store instance the first time this renders
    storeRef.current = makeStore()
    persistStore(storeRef.current)
  }

  return <Provider store={storeRef.current}>{children}</Provider>
}

export default ReduxProvider
