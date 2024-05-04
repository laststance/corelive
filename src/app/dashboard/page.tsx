import { auth, clerkClient } from '@clerk/nextjs/server'
import React from 'react'

const page = async () => {
  const { userId } = auth().protect()

  const user = await clerkClient.users.getUser(userId)
  if (!user) return null

  return <div className="">dashboard: {user.id} </div>
}

export default page
