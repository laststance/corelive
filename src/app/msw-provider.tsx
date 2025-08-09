'use client'

import { Suspense, use } from 'react'
import { env } from '@/env.mjs'

const mockingEnabledPromise =
  typeof window !== 'undefined' && env.NEXT_PUBLIC_ENABLE_MSW_MOCK === 'true'
    ? import('@/mocks/browser').then(async ({ worker }) => {
        await worker.start({
          onUnhandledRequest(request, print) {
            // Ignore Next.js internal requests
            if (request.url.includes('_next')) {
              return
            }
            // Ignore Clerk CDN requests
            if (request.url.includes('clerk.')) {
              return
            }
            print.warning()
          },
        })
        console.log('[MSW] Mock Service Worker enabled via NEXT_PUBLIC_ENABLE_MSW_MOCK')
      })
    : Promise.resolve()

export function MSWProvider({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  // If MSW is enabled, we need to wait for the worker to start,
  // so we wrap the children in a Suspense boundary until it's ready.
  return (
    <Suspense fallback={null}>
      <MSWProviderWrapper>{children}</MSWProviderWrapper>
    </Suspense>
  )
}

function MSWProviderWrapper({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  use(mockingEnabledPromise)
  return children
}