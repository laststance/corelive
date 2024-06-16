'use client'
import { setupListeners } from '@reduxjs/toolkit/query'
import { usePathname } from 'next/navigation'
import type { ReactNode } from 'react'
import { useEffect, useRef } from 'react'
import { Provider } from 'react-redux'
import { persistStore } from 'redux-persist'

import type { AppStore } from './store'
import { makeStore } from './store'

interface Props {
  readonly children: ReactNode
}

export const ReduxProvider = ({ children }: Props) => {
  const storeRef = useRef<AppStore | null>(null)
  // TODO more organized bootstrap
  const pathname = usePathname()

  if (!storeRef.current) {
    // Create the store instance the first time this renders
    storeRef.current = makeStore()
  }

  useEffect(() => {
    if (storeRef.current !== null) {
      persistStore(storeRef.current)
      setupListeners(storeRef.current.dispatch)
      if (pathname === '/dashboard') {
        storeRef.current.dispatch({ type: 'Run/InitListener' })
      }
    }
  }, [])

  return <Provider store={storeRef.current}>{children}</Provider>
}
