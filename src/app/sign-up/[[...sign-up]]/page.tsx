import { SignUp } from '@clerk/nextjs'
import React from 'react'
export default function Page() {
  return (
    <div className="h-screen grid place-items-center">
      <SignUp path="/sign-up" />
    </div>
  )
}
