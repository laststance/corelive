'use client'
import { SignIn as Login } from '@clerk/nextjs'
export default function Page() {
  return (
    <div className="flex min-h-screen items-center justify-center">
      <Login />
    </div>
  )
}
