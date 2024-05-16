import { auth, clerkClient } from '@clerk/nextjs/server'
import React from 'react'

import { EditorDefault } from './EditorDefault'

const Page = async () => {
  const { userId } = auth().protect()

  const user = await clerkClient.users.getUser(userId)
  if (!user) return null

  return (
    <>
      <EditorDefault />
    </>
  )
}

export default Page
