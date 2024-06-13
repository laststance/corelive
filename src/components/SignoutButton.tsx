import { SignOutButton } from '@clerk/nextjs'
import React from 'react'

export function SignoutButton() {
  return (
    <SignOutButton>
      <button className="btn btn-neutral">Sign Out</button>
    </SignOutButton>
  )
}
