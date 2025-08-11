'use client'
import { SignIn as Login } from '@clerk/nextjs'
import { useEffect, useRef } from 'react'

import { env } from '@/env.mjs'

export default function Page() {
  const containerRef = useRef<HTMLDivElement | null>(null)

  // When mocking is enabled, hijack the Google button click to call our local cookie setter
  useEffect(() => {
    if (typeof window === 'undefined') return
    if (env.NEXT_PUBLIC_ENABLE_MSW_MOCK !== 'true') return

    const handler = (e: Event) => {
      const target = e.target as HTMLElement | null
      const button = target?.closest('button') as HTMLButtonElement | null
      const text = button?.textContent?.toLowerCase() ?? ''
      if (button && text.includes('google')) {
        e.stopPropagation()
        e.preventDefault()
        // Without real OAuth, skip to the protected area during mocks
        window.location.href = '/home'
      }
    }

    const el = containerRef.current ?? document
    el.addEventListener('click', handler, true)
    return () => {
      el.removeEventListener('click', handler, true)
    }
  }, [])

  return (
    <div className="grid h-screen place-items-center" ref={containerRef}>
      <Login path="/login" forceRedirectUrl="/home" />
    </div>
  )
}
