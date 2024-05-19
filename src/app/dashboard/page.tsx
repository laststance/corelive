import { auth, clerkClient } from '@clerk/nextjs/server'
import React from 'react'

import { PlateEditor } from './PlateEditor'

const Page = async () => {
  const { userId } = auth().protect()

  const user = await clerkClient.users.getUser(userId)
  if (!user) return null

  return (
    <div className="grid grid-cols-2 gap-4">
      <PlateEditor />
    </div>
  )
}

export default Page
