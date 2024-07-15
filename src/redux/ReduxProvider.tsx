'use client'

import { usePathname } from 'next/navigation'
import { useEffect, useRef } from 'react'
import type { ReactNode } from 'react'
import { Provider } from 'react-redux'
import { persistStore } from 'redux-persist'

import { getLoginUser } from '@/actions/getLoginUser'
import { setUser } from '@/redux/userSlice'

import type { AppStore } from './store'
import { makeStore } from './store'

interface Props {
  readonly children: ReactNode
}

const ReduxProvider = ({ children }: Props) => {
  const storeRef = useRef<AppStore | null>(null)
  const pathname = usePathname()

  useEffect(() => {
    const fetchUser = async () => {
      if (pathname === '/dashboard') {
        const user = await getLoginUser()
        storeRef.current?.dispatch(setUser(user))
      }
    }
    fetchUser()
  }, [pathname])

  if (!storeRef.current) {
    // Create the store instance the first time this renders
    storeRef.current = makeStore()
    persistStore(storeRef.current)
  }

  return <Provider store={storeRef.current}>{children}</Provider>
}

export default ReduxProvider
