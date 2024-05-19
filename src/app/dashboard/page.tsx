import { auth, clerkClient } from '@clerk/nextjs/server'
import React from 'react'

import { EditorDefault } from './EditorDefault'

const Page = async () => {
  const { userId } = auth().protect()

  const user = await clerkClient.users.getUser(userId)
  if (!user) return null

  return (
    <div className="grid grid-cols-2 gap-4">
      <EditorDefault />
    </div>
  )
}

export default Page
