import { SignUp } from '@clerk/nextjs'
import React from 'react'
export default function Page() {
  return (
    <div className="grid h-screen place-items-center">
      <SignUp path="/sign-up" forceRedirectUrl="/dashboard" />
    </div>
  )
}
