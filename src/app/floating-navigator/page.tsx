'use client'

import { FloatingNavigatorContainer } from '@/components/floating-navigator'
import '@/components/floating-navigator/floating-navigator.css'

export default function FloatingNavigatorPage() {
  return (
    <div className="h-screen w-full overflow-hidden">
      <FloatingNavigatorContainer />
    </div>
  )
}
