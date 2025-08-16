'use client'

import { type ReactNode, useEffect, useState } from 'react'

import { env } from '@/env.mjs'

export function MSWProvider({
  children,
}: Readonly<{
  children: ReactNode
}>): ReactNode {
  const [isMSWReady, setIsMSWReady] = useState<boolean>(() => {
    // If MSW is disabled, we're immediately ready
    return env.NEXT_PUBLIC_ENABLE_MSW_MOCK !== 'true'
  })

  useEffect(() => {
    async function initMSW() {
      if (
        typeof window !== 'undefined' &&
        env.NEXT_PUBLIC_ENABLE_MSW_MOCK === 'true'
      ) {
        const { worker } = await import('../../mocks/browser')
        await worker.start({
          onUnhandledRequest: 'bypass',
        })
        setIsMSWReady(true)
      }
    }

    if (!isMSWReady) {
      initMSW()
    }
  }, [isMSWReady])

  // Show loading state while MSW is initializing
  if (!isMSWReady) {
    return null
  }

  return children
}
