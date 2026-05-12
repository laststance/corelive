'use client'

import { memo } from 'react'

import { FloatingNavigatorContainer } from '@/components/floating-navigator'
import '@/components/floating-navigator/floating-navigator.css'

const FloatingNavigatorPage = memo(function FloatingNavigatorPage() {
  return (
    <div className="h-screen w-full overflow-hidden">
      <FloatingNavigatorContainer />
    </div>
  )
})

export default FloatingNavigatorPage
