import { SignOutButton } from '@clerk/nextjs'
import { auth, clerkClient } from '@clerk/nextjs/server'
import React from 'react'

const page = async () => {
  const { userId } = auth().protect()

  const user = await clerkClient.users.getUser(userId)
  if (!user) return null

  return (
    <div>
      dashboard: {user.id}{' '}
      <SignOutButton>
        <button className="btn btn-primary">Sign Out</button>
      </SignOutButton>
    </div>
  )
}

export default page
