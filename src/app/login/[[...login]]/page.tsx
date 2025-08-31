'use client'
import { SignIn as Login } from '@clerk/nextjs'
// import { useEffect, useState } from 'react'

export default function Page() {
  // const [isElectron, setIsElectron] = useState(false)

  // useEffect(() => {
  //   // Check if running in Electron
  //   setIsElectron(typeof window !== 'undefined' && window.electronAPI)
  // }, [])

  return (
    <div className="flex min-h-screen items-center justify-center">
      <Login afterSignInUrl="/home" />
    </div>
  )
}
