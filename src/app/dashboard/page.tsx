import { auth, clerkClient } from '@clerk/nextjs/server'
import React from 'react'

import { EditorView } from './EditorView'

const Page = async () => {
  const { userId } = auth().protect()

  const user = await clerkClient.users.getUser(userId)
  if (!user) return null

  return (
    <div className="grid min-h-screen grid-cols-2 gap-4">
      <section className="-my-2 h-[50vh]">
        <EditorView />
      </section>
      <section className="prose prose-xl prose-slate -my-2 h-[50vh] rounded-md bg-gray-100 p-4">
        <p>hello</p>
      </section>
      <section className="prose prose-xl -my-2 h-[50vh] rounded-md bg-gray-100 p-4">
        <p>hello</p>
      </section>
      <section className="prose prose-xl -my-2 h-[50vh] rounded-md bg-gray-100 p-4">
        <p>hello</p>
      </section>
    </div>
  )
}

export default Page
